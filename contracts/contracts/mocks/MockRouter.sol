// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Test-only stand-in for a DEX router (e.g. what OKX's DEX Aggregator would
/// return calldata for). Pulls `amountIn` of `fromToken` from the caller (who must have
/// approved this contract) and pays out a preset `amountOut` of `toToken`. Must be
/// pre-funded with `toToken` before a test calls `execute`. Not deployed to mainnet.
contract MockRouter {
    function execute(
        address fromToken,
        uint256 amountIn,
        address toToken,
        uint256 amountOut
    ) external {
        IERC20(fromToken).transferFrom(msg.sender, address(this), amountIn);
        IERC20(toToken).transfer(msg.sender, amountOut);
    }
}
