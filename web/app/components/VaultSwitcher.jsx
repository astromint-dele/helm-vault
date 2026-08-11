"use client";

import { useState, useEffect } from "react";
import { JsonRpcProvider } from "ethers";
import { useWalletContext } from "../WalletProvider.jsx";
import { getVaultsForOwner, goToVault } from "../lib/vaultFactory.js";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// A plain read-only RPC connection, not the wallet's own injected provider, matching the
// same reasoning as CreateVaultPanel.jsx: consistent with every other chain read in this
// app rather than a second, less predictable path.
const READ_PROVIDER = new JsonRpcProvider("https://xlayerrpc.okx.com", 196);

// The one place that answers "which vault am I looking at, and what else does this wallet
// own." Lives in page.js's instant shell, not gated behind the Suspense boundary or tied
// to whether the current vault is funded, since ownership is a property of the connected
// wallet, not of whatever happens to be on screen. The list itself is read straight from
// the factory's own onchain registry every time a wallet connects, not from anything
// stored in this browser, so it works from any device, the same mechanism CreateVaultPanel
// uses to create a vault in the first place.
export default function VaultSwitcher({ currentVaultAddress }) {
  const wallet = useWalletContext();
  const [ownedVaults, setOwnedVaults] = useState(null); // null = not checked yet, [] = checked, none found

  useEffect(() => {
    if (!wallet.address) return;
    let cancelled = false;
    getVaultsForOwner(wallet.address, READ_PROVIDER)
      .then((vaults) => {
        if (!cancelled) setOwnedVaults(vaults);
      })
      .catch(() => {
        if (!cancelled) setOwnedVaults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  const lookingUp = Boolean(wallet.address) && ownedVaults === null;

  return (
    <div className="vault-switcher">
      <p className="vault-switcher-current">
        Viewing vault <span className="mono">{truncate(currentVaultAddress)}</span>
      </p>

      {lookingUp && <p className="vault-switcher-note">Checking the factory for vaults this wallet owns...</p>}

      {!lookingUp && ownedVaults && ownedVaults.length > 0 && (
        <div className="vault-switcher-list">
          <span className="vault-switcher-note">
            {ownedVaults.length === 1 ? "This wallet owns 1 vault" : `This wallet owns ${ownedVaults.length} vaults`}:
          </span>
          {ownedVaults.map((addr) => {
            const isCurrent = addr.toLowerCase() === currentVaultAddress.toLowerCase();
            return isCurrent ? (
              <span key={addr} className="vault-switcher-chip vault-switcher-chip-current mono" title="Currently viewing">
                {truncate(addr)}
              </span>
            ) : (
              <button
                key={addr}
                type="button"
                className="vault-switcher-chip mono"
                onClick={() => goToVault(addr)}
              >
                {truncate(addr)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
