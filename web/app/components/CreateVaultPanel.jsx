"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { JsonRpcProvider } from "ethers";
import { useWalletContext } from "../WalletProvider.jsx";
import { PRESETS, getVaultsForOwner } from "../lib/vaultFactory.js";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// A plain read-only RPC connection, not the wallet's own injected provider - this lookup
// runs the moment a wallet connects, and reading it the same way every other chain read in
// this app happens (a known-good RPC, not whatever the extension provides) keeps it
// consistent rather than introducing a second, less predictable read path.
const READ_PROVIDER = new JsonRpcProvider("https://xlayerrpc.okx.com", 196);

// The one place in this app that sends a real on-chain transaction from a connected
// wallet rather than an off-chain signature or a server-side call. Deliberately in the
// instant shell (see page.js), not behind the Suspense boundary, since creating a vault
// has no dependency on which vault (if any) is currently being viewed.
export default function CreateVaultPanel() {
  const wallet = useWalletContext();
  const router = useRouter();
  const [selected, setSelected] = useState(1); // Balanced, a reasonable default
  const [result, setResult] = useState(null); // { vaultAddress, txHash }
  const [error, setError] = useState(null);
  const [ownedVaults, setOwnedVaults] = useState(null); // null = not checked yet, [] = checked, none found

  // Reconstructed straight from the factory's own registry every time a wallet connects,
  // not from anything stored in the browser - this is what answers "I closed the tab, can
  // I find my vault again" without needing to remember a URL.
  useEffect(() => {
    if (!wallet.address) return; // stale data from a prior connection is harmless, the render below is gated on wallet.address too
    let cancelled = false;
    getVaultsForOwner(wallet.address, READ_PROVIDER)
      .then((vaults) => {
        if (!cancelled) setOwnedVaults(vaults);
      })
      .catch(() => {
        if (!cancelled) setOwnedVaults([]); // fail quiet here, this is a convenience lookup, not an enforcement path
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  async function handleCreate() {
    setError(null);
    setResult(null);
    if (!wallet.address) {
      await wallet.connect();
      return; // let them press Create again once connected, rather than chaining a second wallet prompt automatically
    }
    try {
      const outcome = await wallet.createVault(selected);
      setResult(outcome);
      setOwnedVaults((prev) => (prev ? [...prev, outcome.vaultAddress] : [outcome.vaultAddress]));
    } catch (err) {
      setError(err.message || "Could not create the vault.");
    }
  }

  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Create your own vault</p>
      </div>

      <p className="disclosure-line" style={{ marginBottom: 16 }}>
        Deploys a new vault you own, with the same token allowlist as the vault above and
        one of three fixed starting policies. Caps and targets are yours to change after
        creation, the same way this vault&apos;s owner can, this just picks a sensible
        starting point instead of a blank form.
      </p>

      {wallet.address && ownedVaults && ownedVaults.length > 0 && (
        <div className="disclosure-box" style={{ marginBottom: 16 }}>
          <p className="disclosure-line">
            This wallet already owns {ownedVaults.length === 1 ? "a vault" : `${ownedVaults.length} vaults`}, found
            directly from the factory&apos;s own record, not anything stored in this browser, so it works from any
            device.
          </p>
          <ul className="owned-vault-list">
            {ownedVaults.map((addr) => (
              <li key={addr}>
                <button type="button" className="link-button mono" onClick={() => router.push(`?vault=${addr}`)}>
                  {truncate(addr)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`preset-card${selected === preset.id ? " preset-card-selected" : ""}`}
            onClick={() => setSelected(preset.id)}
            disabled={wallet.creatingVault}
          >
            <p className="preset-name">{preset.name}</p>
            <ul className="preset-allocations">
              {Object.entries(preset.allocations).map(([symbol, pct]) => (
                <li key={symbol}>
                  <span className="mono">{pct}%</span> {symbol}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <button className="btn-approve" onClick={handleCreate} disabled={wallet.creatingVault || wallet.connecting}>
        {wallet.creatingVault
          ? "Creating vault"
          : wallet.address
            ? `Create ${PRESETS[selected].name} vault`
            : "Connect wallet to create a vault"}
      </button>

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="disclosure-box" style={{ marginTop: 16 }}>
          <p className="disclosure-line">
            Vault created at <span className="mono">{truncate(result.vaultAddress)}</span>.
          </p>
          <button
            type="button"
            className="btn-approve"
            style={{ marginTop: 8 }}
            onClick={() => router.push(`?vault=${result.vaultAddress}`)}
          >
            View your vault
          </button>
        </div>
      )}
    </div>
  );
}
