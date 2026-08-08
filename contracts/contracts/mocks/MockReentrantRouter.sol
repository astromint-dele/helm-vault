// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPolicyVaultDeposit {
    function deposit(address token, uint256 amount) external;
}

/// @notice Test-only malicious router stand-in. Instead of performing a swap, it tries
/// to call back into the vault's deposit() during executeTrade, to prove the vault's
/// reentrancy guard blocks it. Not deployed to mainnet.
contract MockReentrantRouter {
    address public immutable vault;
    address public immutable reentryToken;

    constructor(address _vault, address _reentryToken) {
        vault = _vault;
        reentryToken = _reentryToken;
    }

    function execute(address, uint256, address, uint256) external {
        IPolicyVaultDeposit(vault).deposit(reentryToken, 1);
    }
}
