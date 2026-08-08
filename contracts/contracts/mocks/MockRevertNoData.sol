// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only router stand-in that reverts with zero return data (as opposed to a
/// require()/custom error, which both return data). Proves PolicyVault's fallback generic
/// revert message path, which only triggers when the callee gives back nothing to bubble up.
contract MockRevertNoData {
    function execute(address, uint256, address, uint256) external pure {
        assembly {
            revert(0, 0)
        }
    }
}
