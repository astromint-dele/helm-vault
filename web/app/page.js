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

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Home() {
  const wallet = useWallet();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // No auto-poll: a passive viewer costs zero OKX calls, and every open tab was previously
  // multiplying quote requests by re-fetching every 30s whether or not anyone was looking.
  // The one-time load on mount plus this manual refresh are the only triggers now.
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/api/state${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load vault state.");
      setState(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || "Could not load vault state.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
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
              {wallet.connecting ? "Connecting" : "Connect owner wallet to approve"}
            </button>
          )}
        </div>
      </div>

      <p className="disclosure-line">
        This page shows one vault on X Layer mainnet, owned and operated by Helm&apos;s builder, not your personal
        wallet. Connecting only checks whether you&apos;re that vault&apos;s owner, to enable approving trades.
      </p>
      <p className="disclosure-line">
        Funds live inside this vault contract because Helm&apos;s rules, like allocation limits and price checks,
        can only be enforced on funds the contract actually holds.
      </p>

      {wallet.error && <div className="error-banner" style={{ marginTop: 16 }}>{wallet.error}</div>}

      {!state && !loadError && <p className="loading-line">Reading vault state</p>}
      {loadError && <div className="error-banner" style={{ marginTop: 24 }}>{loadError}</div>}

      {state && (
        <div className="refresh-row">
          <span className="mono">
            Prices confirmed {formatTime(state.generatedAt)}
            {state.stale ? " (stale: could not reach OKX for a fresh read, showing the last confirmed prices)" : ""}
          </span>
          <button className="refresh-btn mono" onClick={load} disabled={refreshing}>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      )}

      {state && (
        <div className="main-grid">
          <div className="col">
            <HoldingsPanel holdings={state.proposal.drift.holdings} />
            <NavSentinelPanel navStatus={state.proposal.navStatus} holdings={state.proposal.drift.holdings} />
          </div>
          <div className="col">
            <ProposalPanel
              proposal={state.proposal}
              vaultAddress={state.vaultAddress}
              ownerAddress={state.ownerAddress}
              wallet={wallet}
              onExecuted={load}
            />
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
