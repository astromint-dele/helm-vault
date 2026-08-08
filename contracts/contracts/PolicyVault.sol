// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PolicyVault
/// @notice Holds portfolio funds and enforces owner-set trading limits on a single
/// authorized agent. The agent can propose and execute swaps, but every trade is
/// checked against the allowlist, per-trade size cap, and per-asset holding cap
/// before it's allowed to happen — any breach reverts the whole transaction.
///
/// Design note on "max % per asset": true percentage-of-portfolio caps require a live
/// USD price for every asset, which needs a price oracle. NAV Sentinel (a later
/// component of this project) does maintain a live price feed, but only off-chain, for
/// price-fairness checking — wiring it into this contract would mean the contract trusting
/// an agent-pushed price, which reopens a trust/security question deliberately not taken
/// on here. So per-asset caps (`maxHoldingAmount`) are enforced as a maximum raw token
/// amount instead (e.g. "the vault can never hold more than N NVDAx"), set by the owner —
/// a hard, deterministic, oracle-free ceiling, not a live percentage-of-value figure.
/// Live percentage-of-value enforcement is a real next step, not implemented here.
///
/// `targetAllocationBps` IS enforced, but only as a completeness gate, not a live
/// percentage cap: `executeTrade` requires the sum of every allowlisted token's target to
/// equal exactly 100% before any trade can execute. This guarantees the agent can never
/// trade against a partially-configured policy (e.g. two assets summing to 35%, the rest
/// implicitly and silently unaccounted for) — the actual allocation MATH (drift, sizing)
/// still happens off-chain in the agent, using live balances and live prices, since that's
/// inherently something only the agent (not the contract) has the data to compute.
contract PolicyVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The only address allowed to call executeTrade.
    address public agent;

    mapping(address => bool) public isAllowedToken;
    address[] public allowedTokenList;

    /// @notice bps (out of 10_000) the agent should aim to hold per asset. The actual
    /// drift/sizing math is off-chain (needs live prices); the contract only enforces that
    /// these sum to exactly 10_000 (100%) before allowing any trade — see totalTargetBps.
    mapping(address => uint256) public targetAllocationBps;

    /// @notice Running sum of targetAllocationBps across every allowlisted token. Updated
    /// incrementally by setPolicy and setTokenAllowed. executeTrade requires this to equal
    /// exactly 10_000 — the policy must be fully configured before the agent can trade.
    uint256 public totalTargetBps;

    /// @notice Hard cap: the vault's balance of this token may never exceed this amount
    /// after a trade. 0 means "no cap set" (unlimited).
    mapping(address => uint256) public maxHoldingAmount;

    /// @notice Hard cap: a single trade spending this token as `fromToken` may never
    /// exceed this amount. 0 means "no cap set" (unlimited).
    mapping(address => uint256) public maxTradeSize;

    event TokenAllowed(address indexed token, bool allowed);
    event PolicyUpdated(address indexed token, uint256 targetBps, uint256 maxHolding, uint256 maxTrade);
    event AgentUpdated(address indexed oldAgent, address indexed newAgent);
    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event TradeExecuted(
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut
    );

    modifier onlyAgent() {
        require(msg.sender == agent, "PolicyVault: caller is not the agent");
        _;
    }

    constructor(address initialOwner, address initialAgent) Ownable(initialOwner) {
        require(initialAgent != address(0), "PolicyVault: zero agent");
        agent = initialAgent;
    }

    // ------------------------------------------------------------------
    // Owner-only policy management
    // ------------------------------------------------------------------

    function setAgent(address newAgent) external onlyOwner {
        require(newAgent != address(0), "PolicyVault: zero agent");
        emit AgentUpdated(agent, newAgent);
        agent = newAgent;
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        require(token != address(0), "PolicyVault: zero token");
        if (allowed && !isAllowedToken[token]) {
            allowedTokenList.push(token);
        }
        if (!allowed && isAllowedToken[token]) {
            // Disallowing a token clears its target contribution too, so totalTargetBps
            // can't get permanently stuck below 100% by a token that's no longer tradeable.
            totalTargetBps -= targetAllocationBps[token];
            targetAllocationBps[token] = 0;
        }
        isAllowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function setPolicy(
        address token,
        uint256 targetBps,
        uint256 maxHolding,
        uint256 maxTrade
    ) external onlyOwner {
        require(isAllowedToken[token], "PolicyVault: token not allowlisted");
        require(targetBps <= 10_000, "PolicyVault: targetBps exceeds 100%");
        totalTargetBps = totalTargetBps - targetAllocationBps[token] + targetBps;
        require(totalTargetBps <= 10_000, "PolicyVault: total target allocation exceeds 100%");
        targetAllocationBps[token] = targetBps;
        maxHoldingAmount[token] = maxHolding;
        maxTradeSize[token] = maxTrade;
        emit PolicyUpdated(token, targetBps, maxHolding, maxTrade);
    }

    function allowedTokenCount() external view returns (uint256) {
        return allowedTokenList.length;
    }

    // ------------------------------------------------------------------
    // Funding
    // ------------------------------------------------------------------

    function deposit(address token, uint256 amount) external nonReentrant {
        require(isAllowedToken[token], "PolicyVault: token not allowlisted");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, msg.sender, amount);
    }

    /// @notice Owner can withdraw any ERC20 held by the vault, including tokens that
    /// were never allowlisted (e.g. arrived via a direct transfer instead of deposit()).
    /// This is intentional: the allowlist governs what the AGENT can trade, not what the
    /// OWNER can recover — there must be no token that can enter the vault but never leave.
    function withdraw(address token, uint256 amount, address to) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    // ------------------------------------------------------------------
    // Agent-executed, contract-enforced trade
    // ------------------------------------------------------------------

    /// @notice Executes a swap by approving `approveTarget` to pull `amountIn` of `fromToken`,
    /// then calling `swapTarget` with `swapCalldata` (e.g. an OKX DEX Aggregator router call).
    /// `approveTarget` and `swapTarget` are deliberately separate parameters: many DEX
    /// aggregators (OKX included) use a distinct allowance-holding contract from the one that
    /// actually executes the swap, so approving the wrong one silently fails the trade even
    /// though the call itself looks correct. Reverts if either token isn't allowlisted, the
    /// trade exceeds the per-trade size cap, the swap call itself fails, or the resulting
    /// balance of `toToken` would exceed its holding cap.
    function executeTrade(
        address fromToken,
        address toToken,
        uint256 amountIn,
        address approveTarget,
        address swapTarget,
        bytes calldata swapCalldata
    ) external onlyAgent nonReentrant returns (uint256 amountOut) {
        require(totalTargetBps == 10_000, "PolicyVault: policy incomplete, targets must sum to 100%");
        require(isAllowedToken[fromToken], "PolicyVault: fromToken not allowlisted");
        require(isAllowedToken[toToken], "PolicyVault: toToken not allowlisted");
        require(fromToken != toToken, "PolicyVault: fromToken equals toToken");
        require(
            maxTradeSize[fromToken] == 0 || amountIn <= maxTradeSize[fromToken],
            "PolicyVault: exceeds max trade size"
        );
        require(approveTarget != address(0), "PolicyVault: zero approve target");
        require(swapTarget != address(0), "PolicyVault: zero swap target");

        uint256 toBalanceBefore = IERC20(toToken).balanceOf(address(this));

        IERC20(fromToken).forceApprove(approveTarget, amountIn);
        (bool success, bytes memory returndata) = swapTarget.call(swapCalldata);
        if (!success) {
            // Bubble up the router's actual revert reason instead of a generic message —
            // callers (agent, UI, debugging) need to see *why* a swap failed, not just that
            // it did. Falls back to a generic revert only if the callee gave no data at all
            // (e.g. it ran out of gas).
            if (returndata.length > 0) {
                assembly {
                    revert(add(returndata, 32), mload(returndata))
                }
            }
            revert("PolicyVault: swap call failed");
        }
        IERC20(fromToken).forceApprove(approveTarget, 0);

        uint256 toBalanceAfter = IERC20(toToken).balanceOf(address(this));
        require(toBalanceAfter > toBalanceBefore, "PolicyVault: swap produced no output");
        amountOut = toBalanceAfter - toBalanceBefore;

        require(
            maxHoldingAmount[toToken] == 0 || toBalanceAfter <= maxHoldingAmount[toToken],
            "PolicyVault: would exceed max allocation"
        );

        emit TradeExecuted(fromToken, toToken, amountIn, amountOut);
    }
}
