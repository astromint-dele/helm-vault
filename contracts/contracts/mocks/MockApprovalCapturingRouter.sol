// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @notice Test-only router stand-in used as swapTarget in a scenario where approveTarget
/// is a DIFFERENT address. Asserts, at call time, that the separate approveTarget holds
/// exactly the expected allowance and that this contract (the swapTarget) holds none —
/// directly proving PolicyVault approves the right address, not just that a trade succeeds.
/// Delivers output by minting directly rather than pulling input, since proving the
/// allowance-targeting guarantee doesn't require actually moving the input token. Not
/// deployed to mainnet.
contract MockApprovalCapturingRouter {
    function execute(
        address fromToken,
        address approveTarget,
        uint256 expectedAmountIn,
        address toToken,
        uint256 amountOut
    ) external {
        require(
            IERC20(fromToken).allowance(msg.sender, approveTarget) == expectedAmountIn,
            "approveTarget does not hold the expected allowance"
        );
        require(
            IERC20(fromToken).allowance(msg.sender, address(this)) == 0,
            "swapTarget should never receive an allowance"
        );
        IMintable(toToken).mint(msg.sender, amountOut);
    }
}
