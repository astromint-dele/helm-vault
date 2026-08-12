"use client";

import { useState, useCallback } from "react";
import { useWalletContext } from "./WalletProvider.jsx";
import StandingWatchPanel from "./components/StandingWatchPanel.jsx";
import HoldingsBars from "./components/HoldingsBars.jsx";
import PriceFairnessTable from "./components/PriceFairnessTable.jsx";
import ProposalPanel from "./components/ProposalPanel.jsx";
import InstructBox from "./components/InstructBox.jsx";
import RefusedPanel from "./components/RefusedPanel.jsx";
import DemoUnavailablePanel from "./components/DemoUnavailablePanel.jsx";
import EmptyVaultPanel from "./components/EmptyVaultPanel.jsx";

const FETCH_TIMEOUT_MS = 20_000; // the slowest real cold request observed was ~18s (a fresh
// LLM call plus OKX retries with no warm cache at all); this sits above that with margin
// while still resolving well before a visitor concludes the page is broken.

// initialState is server-rendered (via VaultDataServer, streamed in behind a Suspense
// boundary, see page.js) so the very first data this component ever holds is either real,
// or an honest error, never a loading placeholder with nothing behind it.
export default function HomeClient({ initialState, initialError }) {
  const wallet = useWalletContext();
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
        setLoadError(
          `Timed out waiting for vault state after ${FETCH_TIMEOUT_MS / 1000}s. The vault is still live on-chain, this page just couldn't confirm it in time.`
        );
      } else {
        setLoadError(err.message || "Could not load vault state.");
      }
    } finally {
      clearTimeout(timeoutId);
      setRefreshing(false);
    }
  }, []);

  if (!state && !loadError) {
    return <p className="loading-line">Reading vault state</p>;
  }

  if (loadError) {
    return (
      <div className="error-banner" style={{ marginTop: 24, flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
        <span>{loadError}</span>
        <button className="refresh-btn mono" onClick={load} disabled={refreshing}>
          {refreshing ? "Retrying" : "Retry"}
        </button>
      </div>
    );
  }

  const { proposal } = state;

  // The refusal screen takes over the whole content area, matching the mockup, rather than
  // sitting inside the normal panel grid.
  if (proposal.action === "nav_blocked") {
    const blockedNav = Object.values(proposal.navStatus).find((n) => n.status === "block");
    return (
      <RefusedPanel
        headline={proposal.navBlockHeadline}
        reason={proposal.navBlockReason}
        blockedNav={blockedNav}
        vaultAddress={state.vaultAddress}
        isDemo={state.isDemo}
        onAcknowledge={load}
        acknowledging={refreshing}
      />
    );
  }

  // A demo was requested (?demoBlockThreshold=) but there's genuinely nothing to refuse
  // right now (converged holdings, or no checkable holding at all) — must never silently
  // fall through to the normal page, that read as the trigger button doing nothing, and
  // (with the tightened demo threshold still technically active) the normal page's own
  // price fairness numbers would show real spreads as exceeding a limit that only exists
  // because of this same demo request.
  if (proposal.navDemoUnavailable) {
    return (
      <DemoUnavailablePanel
        reason={proposal.navDemoUnavailableReason}
        vaultAddress={state.vaultAddress}
        onAcknowledge={load}
        acknowledging={refreshing}
      />
    );
  }

  return (
    <>
      <StandingWatchPanel
        agentAddress={state.agentAddress}
        currentBlock={state.currentBlock}
        onRefresh={load}
        refreshing={refreshing}
      />

      {/* A vault with nothing spendable to act on, most commonly a freshly created vault
          that's never been funded, only replaces this one slot, not the whole page.
          StandingWatchPanel, holdings, price fairness (including the public "check any
          xStock" tool, which has no dependency on this vault's own balance at all), and
          the instruct box all stay visible and honest below, whether this vault is funded
          or not. Keyed on generatedAt so a fresh successful load fully remounts whichever
          of these renders, clearing any stale approved/declined/error state from the
          previous proposal. */}
      {proposal.action === "insufficient_funds" ? (
        <EmptyVaultPanel
          key={state.generatedAt}
          vaultAddress={state.vaultAddress}
          ownerAddress={state.ownerAddress}
          holdings={proposal.drift.holdings}
          wallet={wallet}
          onRefresh={load}
          refreshing={refreshing}
        />
      ) : (
        <ProposalPanel
          key={state.generatedAt}
          proposal={proposal}
          vaultAddress={state.vaultAddress}
          ownerAddress={state.ownerAddress}
          wallet={wallet}
          onExecuted={load}
        />
      )}

      <div className="main-grid">
        <div className="col">
          <HoldingsBars
            holdings={proposal.drift.holdings}
            driftThresholdPct={proposal.driftThresholdPct}
            totalValueUSDG={proposal.drift.totalValueUSDG}
            vaultAddress={state.vaultAddress}
            ownerAddress={state.ownerAddress}
            wallet={wallet}
            onWithdrawn={load}
          />
        </div>
        <div className="col">
          <PriceFairnessTable
            navStatus={proposal.navStatus}
            holdings={proposal.drift.holdings}
            limitPct={state.navBlockThresholdPct}
          />
        </div>
      </div>

      <InstructBox />
    </>
  );
}
