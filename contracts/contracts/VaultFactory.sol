// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PolicyVault} from "./PolicyVault.sol";

/// @title VaultFactory
/// @notice Deploys a fresh PolicyVault per caller, configured atomically with one of three
/// fixed preset policies (conservative, balanced, growth), ownership transferred to the
/// caller within the same transaction. PolicyVault.sol itself is completely unmodified by
/// this contract. Every call this factory makes on a vault it just created
/// (setTokenAllowed, setPolicy, transferOwnership) is an existing, already-tested function
/// on that contract, called exactly as it already is by the single hand-configured vault.
/// This factory adds sequencing and a registry, not new trust surface on the contract that
/// already holds real funds.
///
/// The registry (isVault) exists specifically so anything reading a vault's owner() off
/// chain (the web app's approval and state routes) can first confirm the address it's
/// about to trust was actually deployed here, not an arbitrary contract an attacker points
/// the API at.
contract VaultFactory {
    /// @notice Fixed agent wallet every vault created here is configured with. Every vault
    /// this factory creates shares the same agent, matching the single-agent design this
    /// project already uses elsewhere, not a per-user agent.
    address public immutable agent;

    address public immutable usdg;
    address public immutable nvdax;
    address public immutable spyx;
    address public immutable xbtc;

    // Caps are identical across every preset, deliberately, only targetBps differs by
    // preset. Sized by scaling the live vault's raw-token-unit holding caps by 20x, and by
    // a max trade size derived from the rebalance correction schedule (see
    // lib/rebalanceProposal.js's CORRECTION_FACTOR), not guessed. Both raw-token-unit caps
    // are the documented limitation this project deliberately chose over trusting an
    // oracle, unchanged by this factory. All four are owner-adjustable after creation via
    // PolicyVault's existing setPolicy, same as the hand-configured vault.
    uint256 public constant USDG_MAX_TRADE = 2_000_000_000; // 2000 USDG at 6 decimals
    uint256 public constant NVDAX_MAX_HOLDING = 20 ether; // 20 NVDAx at 18 decimals
    uint256 public constant SPYX_MAX_HOLDING = 20 ether; // 20 SPYx at 18 decimals
    uint256 public constant XBTC_MAX_HOLDING = 20_000_000; // 0.2 xBTC at 8 decimals

    enum Preset {
        Conservative,
        Balanced,
        Growth
    }

    event VaultCreated(address indexed owner, address indexed vault, Preset preset);

    mapping(address => bool) public isVault;
    address[] public allVaults;
    mapping(address => address[]) public vaultsByOwner;

    constructor(address agent_, address usdg_, address nvdax_, address spyx_, address xbtc_) {
        require(agent_ != address(0), "VaultFactory: zero agent");
        require(
            usdg_ != address(0) && nvdax_ != address(0) && spyx_ != address(0) && xbtc_ != address(0),
            "VaultFactory: zero token"
        );
        agent = agent_;
        usdg = usdg_;
        nvdax = nvdax_;
        spyx = spyx_;
        xbtc = xbtc_;
    }

    /// @notice Target bps for the given preset, in the fixed token order [USDG, NVDAx,
    /// SPYx, xBTC]. Each row sums to exactly 10000, proven in tests and re-proven at
    /// runtime by PolicyVault's own totalTargetBps invariant, not trusted on faith twice.
    function _targetBpsFor(Preset preset) internal pure returns (uint256[4] memory) {
        if (preset == Preset.Conservative) return [uint256(6000), 1500, 1500, 1000];
        if (preset == Preset.Balanced) return [uint256(4000), 2500, 2000, 1500];
        return [uint256(1500), 3500, 2500, 2500]; // Growth
    }

    /// @notice Deploys a new PolicyVault, allowlists and configures the fixed 4-token
    /// policy for the chosen preset, then transfers ownership to the caller, all in one
    /// transaction. The factory briefly owns the vault mid-transaction purely to make the
    /// setTokenAllowed/setPolicy calls (both onlyOwner on PolicyVault), then hands
    /// ownership to the real caller before the transaction ends. There is no block where
    /// the vault exists with incomplete policy AND is owned by anyone but the factory
    /// itself, so there's no window for a third party to interact with a half-configured
    /// vault, and no window where the factory's own temporary ownership is externally
    /// observable as a separate transaction.
    function createVault(Preset preset) external returns (address vaultAddress) {
        PolicyVault vault = new PolicyVault(address(this), agent);
        vaultAddress = address(vault);

        address[4] memory tokens = [usdg, nvdax, spyx, xbtc];
        uint256[4] memory targets = _targetBpsFor(preset);
        uint256[4] memory maxHolding = [uint256(0), NVDAX_MAX_HOLDING, SPYX_MAX_HOLDING, XBTC_MAX_HOLDING];
        uint256[4] memory maxTrade = [USDG_MAX_TRADE, uint256(0), uint256(0), uint256(0)];

        for (uint256 i = 0; i < 4; i++) {
            vault.setTokenAllowed(tokens[i], true);
        }
        for (uint256 i = 0; i < 4; i++) {
            vault.setPolicy(tokens[i], targets[i], maxHolding[i], maxTrade[i]);
        }

        vault.transferOwnership(msg.sender);

        isVault[vaultAddress] = true;
        allVaults.push(vaultAddress);
        vaultsByOwner[msg.sender].push(vaultAddress);

        emit VaultCreated(msg.sender, vaultAddress, preset);
    }

    function allVaultsCount() external view returns (uint256) {
        return allVaults.length;
    }

    function vaultsByOwnerCount(address ownerAddress) external view returns (uint256) {
        return vaultsByOwner[ownerAddress].length;
    }
}
