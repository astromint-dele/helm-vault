"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "./hooks/useWallet.js";
import HelmWheel from "./components/HelmWheel.jsx";
import HoldingsPanel from "./components/HoldingsPanel.jsx";
import NavSentinelPanel from "./components/NavSentinelPanel.jsx";
import ProposalPanel from "./components/ProposalPanel.jsx";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function Home() {
  const wallet = useWallet();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/api/state${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load vault state.");
      setState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "Could not load vault state.");
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <HelmWheel size={22} drift />
          <span className="brand-name">Helm</span>
        </div>
        <div className="topbar-right">
          <div className="chain-chip">
            <span className="chain-dot" />
            X Layer
          </div>
          {wallet.address ? (
            <button className="wallet-btn mono">{truncate(wallet.address)}</button>
          ) : (
            <button className="wallet-btn disconnected" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? "Connecting" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>

      {wallet.error && <div className="error-banner" style={{ marginTop: 16 }}>{wallet.error}</div>}

      {!state && !loadError && <p className="loading-line">Reading vault state</p>}
      {loadError && <div className="error-banner" style={{ marginTop: 24 }}>{loadError}</div>}

      {state && (
        <div className="main-grid">
          <div className="col">
            <HoldingsPanel holdings={state.proposal.drift.holdings} />
            <NavSentinelPanel navStatus={state.proposal.navStatus} holdings={state.proposal.drift.holdings} />
          </div>
          <div className="col">
            <ProposalPanel proposal={state.proposal} vaultAddress={state.vaultAddress} wallet={wallet} onExecuted={load} />
          </div>
        </div>
      )}

      <p className="footnote">
        Reads and writes go directly through the existing drift, NAV Sentinel, and execution modules. Nothing here
        duplicates that logic.
      </p>
    </div>
  );
}
