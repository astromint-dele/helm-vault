"use client";

import { useState, useCallback } from "react";
import { useWallet } from "./hooks/useWallet.js";
import AgentPanel from "./components/AgentPanel.jsx";
import HoldingsPanel from "./components/HoldingsPanel.jsx";
import NavSentinelPanel from "./components/NavSentinelPanel.jsx";
import ProposalPanel from "./components/ProposalPanel.jsx";

const FETCH_TIMEOUT_MS = 20_000; // the slowest real cold request observed was ~18s (a fresh
// LLM call plus OKX retries with no warm cache at all); this sits above that with margin
// while still resolving well before a visitor concludes the page is broken.

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// initialState is server-rendered (via VaultDataServer, streamed in behind a Suspense
// boundary — see page.js) so the very first data this component ever holds is either real,
// or an honest error — never a loading placeholder with nothing behind it. The wallet
// connect button lives here (not in the always-instant topbar in page.js) so there's only
// ever one useWallet() call in the tree; splitting it across the instant shell and this
// component would mean two independent, unsynchronized connection states, and connecting in
// the topbar wouldn't unlock Approve below.
export default function HomeClient({ initialState, initialError }) {
  const wallet = useWallet();
  const [state, setState] = useState(initialState);
  const [loadError, setLoadError] = useState(initialError || null);
  const [refreshing, setRefreshing] = useState(false);

  // No auto-poll: a passive viewer costs zero OKX calls, and every open tab was previously
  // multiplying quote requests by re-fetching every 30s whether or not anyone was looking.
  // The server-rendered initial load plus this manual refresh are the only triggers now.
  const load = useCallback(async () => {
    setRefreshing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const query = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/api/state${query}`, { cache: "no-store", signal: controller.signal });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not load vault state.");
      setState(data);
      setLoadError(null);
    } catch (err) {
      if (err.name === "AbortError") {
        setLoadError(`Timed out waiting for vault state after ${FETCH_TIMEOUT_MS / 1000}s. The vault is still live on-chain; this page just couldn't confirm it in time.`);
      } else {
        setLoadError(err.message || "Could not load vault state.");
      }
    } finally {
      clearTimeout(timeoutId);
      setRefreshing(false);
    }
  }, []);

  return (
    <>
      <div className="wallet-row">
        {wallet.address ? (
          <button className="wallet-btn mono">{truncate(wallet.address)}</button>
        ) : (
          <button className="wallet-btn disconnected" onClick={wallet.connect} disabled={wallet.connecting}>
            {wallet.connecting ? "Connecting" : "Connect owner wallet to approve"}
          </button>
        )}
      </div>

      {wallet.error && <div className="error-banner" style={{ marginTop: 16 }}>{wallet.error}</div>}

      {!state && !loadError && <p className="loading-line">Reading vault state</p>}

      {loadError && (
        <div className="error-banner" style={{ marginTop: 24, flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
          <span>{loadError}</span>
          <button className="refresh-btn mono" onClick={load} disabled={refreshing}>
            {refreshing ? "Retrying" : "Retry"}
          </button>
        </div>
      )}

      {state && (
        <AgentPanel
          holdingsCount={state.proposal.drift.holdings.length}
          generatedAt={state.generatedAt}
          stale={state.stale}
          onRefresh={load}
          refreshing={refreshing}
        />
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
    </>
  );
}
