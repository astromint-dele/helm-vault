"use client";

import { useState, useCallback, useEffect } from "react";
import { BrowserProvider, Contract } from "ethers";
import { VAULT_FACTORY_ADDRESS, VAULT_FACTORY_ABI } from "../lib/vaultFactory.js";

const X_LAYER_CHAIN_ID_HEX = "0xc4"; // 196
const X_LAYER_PARAMS = {
  chainId: X_LAYER_CHAIN_ID_HEX,
  chainName: "X Layer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: ["https://xlayerrpc.okx.com"],
  blockExplorerUrls: ["https://www.oklink.com/x-layer"],
};

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [chainOk, setChainOk] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Viewing a vault after creating it is a full page navigation (see CreateVaultPanel.jsx,
  // switched away from client-side routing after that failed to reliably apply on this
  // Next.js version), which drops this hook's React state. eth_accounts, unlike
  // eth_requestAccounts, never prompts, it only returns an account if this site is already
  // authorized, so this silently restores a connection that genuinely still exists rather
  // than making every vault-to-vault navigation demand a fresh manual reconnect.
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    let cancelled = false;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then(async (accounts) => {
        if (cancelled || !accounts?.length) return;
        const provider = new BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        if (cancelled) return;
        setAddress(accounts[0]);
        setChainOk(network.chainId === 196n);
      })
      .catch(() => {}); // silent restore only, a failure here just means "stay disconnected," not an error to surface
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No wallet found. Install an X Layer compatible wallet.");
      return;
    }
    setConnecting(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts?.length) throw new Error("No account returned by the wallet.");
      setAddress(accounts[0]);

      const network = await provider.getNetwork();
      if (network.chainId !== 196n) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: X_LAYER_CHAIN_ID_HEX }],
          });
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [X_LAYER_PARAMS],
            });
          } else {
            throw switchErr;
          }
        }
      }
      setChainOk(true);
    } catch (err) {
      setError(err.message || "Could not connect wallet.");
      setAddress(null);
      setChainOk(false);
    } finally {
      setConnecting(false);
    }
  }, []);

  // There is no real cross-site "disconnect" in the wallet-extension model, MetaMask itself
  // still remembers this site is authorized until revoked from within the extension. This
  // clears Helm's own connection state, so the UI honestly shows disconnected and requires
  // an explicit reconnect rather than silently carrying the previous session forward.
  const disconnect = useCallback(() => {
    setAddress(null);
    setChainOk(false);
    setError(null);
  }, []);

  const signApproval = useCallback(
    async (vaultAddress) => {
      if (!address || typeof window === "undefined" || !window.ethereum) {
        throw new Error("Wallet not connected.");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const timestamp = Date.now();
      const message = `Approve Helm trade for vault ${vaultAddress} at ${timestamp}`;
      try {
        const signature = await signer.signMessage(message);
        return { signerAddress: address, signature, timestamp };
      } catch (err) {
        // ethers' own error messages here embed a verbose info={...} object (and, for a
        // rejected signMessage, no useful payload at all) — never surface that raw, always
        // translate to a plain sentence.
        const isUserRejection = err.code === "ACTION_REJECTED" || err.code === 4001 || err.info?.error?.code === 4001;
        if (isUserRejection) {
          throw new Error("You declined the signature. Nothing was executed.");
        }
        throw new Error(err.shortMessage || "Could not get a signature from your wallet.");
      }
    },
    [address]
  );

  // The first real on-chain write this app sends from a connected wallet, everything
  // before this has been read-only or an off-chain signature. Real gas, real transaction,
  // so this gets the same rejection/error translation as signApproval, plus the extra
  // states a write actually needs (a receipt to wait for, a new address to hand back).
  const [creatingVault, setCreatingVault] = useState(false);
  const createVault = useCallback(
    async (presetId) => {
      if (!address || typeof window === "undefined" || !window.ethereum) {
        throw new Error("Wallet not connected.");
      }
      setCreatingVault(true);
      try {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const factory = new Contract(VAULT_FACTORY_ADDRESS, VAULT_FACTORY_ABI, signer);
        const tx = await factory.createVault(presetId);
        const receipt = await tx.wait();
        const event = receipt.logs
          .map((log) => {
            try {
              return factory.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed) => parsed?.name === "VaultCreated");
        if (!event) {
          throw new Error("Vault was created, but the confirmation event was missing. Check your wallet's activity for the transaction.");
        }
        return { vaultAddress: event.args.vault, txHash: tx.hash };
      } catch (err) {
        const isUserRejection = err.code === "ACTION_REJECTED" || err.code === 4001 || err.info?.error?.code === 4001;
        if (isUserRejection) {
          throw new Error("You declined the transaction. No vault was created.");
        }
        const isInsufficientFunds = err.code === "INSUFFICIENT_FUNDS" || err.info?.error?.code === -32000;
        if (isInsufficientFunds) {
          throw new Error("Not enough OKB in your wallet to cover gas for this transaction.");
        }
        throw new Error(err.shortMessage || err.reason || "Could not create the vault. Nothing was deducted.");
      } finally {
        setCreatingVault(false);
      }
    },
    [address]
  );

  // Direct owner call, no agent involved, on a function PolicyVault.sol has had since
  // Phase 1 (withdraw(token, amount, to), onlyOwner) and never exposed in the frontend
  // until now. amountRaw is a bigint, the vault's real balanceRaw for that token, not
  // re-derived from the human-readable display value, so "withdraw all" moves the exact
  // amount actually held, not a rounded approximation of it.
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useCallback(
    async (vaultAddress, tokenAddress, amountRaw) => {
      if (!address || typeof window === "undefined" || !window.ethereum) {
        throw new Error("Wallet not connected.");
      }
      setWithdrawing(true);
      try {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const vault = new Contract(
          vaultAddress,
          ["function withdraw(address token, uint256 amount, address to) external"],
          signer
        );
        const tx = await vault.withdraw(tokenAddress, amountRaw, address);
        const receipt = await tx.wait();
        return { txHash: tx.hash, blockNumber: receipt.blockNumber };
      } catch (err) {
        const isUserRejection = err.code === "ACTION_REJECTED" || err.code === 4001 || err.info?.error?.code === 4001;
        if (isUserRejection) {
          throw new Error("You declined the transaction. Nothing was withdrawn.");
        }
        const isInsufficientFunds = err.code === "INSUFFICIENT_FUNDS" || err.info?.error?.code === -32000;
        if (isInsufficientFunds) {
          throw new Error("Not enough OKB in your wallet to cover gas for this transaction.");
        }
        throw new Error(err.shortMessage || err.reason || "Could not withdraw. Nothing was moved.");
      } finally {
        setWithdrawing(false);
      }
    },
    [address]
  );

  return {
    address,
    chainOk,
    connecting,
    error,
    connect,
    disconnect,
    signApproval,
    createVault,
    creatingVault,
    withdraw,
    withdrawing,
  };
}
