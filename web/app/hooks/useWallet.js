"use client";

import { useState, useCallback } from "react";
import { BrowserProvider } from "ethers";

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

  return { address, chainOk, connecting, error, connect, disconnect, signApproval };
}
