"use client";

import { useState } from "react";
import { useWalletContext } from "../WalletProvider.jsx";
import { PRESETS } from "../lib/vaultFactory.js";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// The one place in this app that sends a real on-chain transaction from a connected
// wallet rather than an off-chain signature or a server-side call. Deliberately in the
// instant shell (see page.js), not behind the Suspense boundary, since creating a vault
// has no dependency on which vault (if any) is currently being viewed.
export default function CreateVaultPanel() {
  const wallet = useWalletContext();
  const [selected, setSelected] = useState(1); // Balanced, a reasonable default
  const [result, setResult] = useState(null); // { vaultAddress, txHash }
  const [error, setError] = useState(null);

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
          <p className="disclosure-line">
            <a href={`?vault=${result.vaultAddress}`}>View your vault</a>
          </p>
        </div>
      )}
    </div>
  );
}
