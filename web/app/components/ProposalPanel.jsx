"use client";

import { useState } from "react";
import RefusedPanel from "./RefusedPanel.jsx";
import { describeTrade } from "../lib/formatTrade.js";

const EXPLANATION_SOURCE_LABEL = {
  llm: "Explained by Gemini, generated for this check.",
  cache: "Explained by Gemini, reused from a matching check moments ago.",
  fallback: "Template explanation. Gemini was unavailable for this check.",
};

function formatTradeStatement(trade) {
  const phrase = describeTrade(trade);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1) + ".";
}

export default function ProposalPanel({ proposal, vaultAddress, ownerAddress, wallet, onExecuted }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const isNonOwnerWallet =
    wallet.address && ownerAddress && wallet.address.toLowerCase() !== ownerAddress.toLowerCase();

  if (proposal.action === "nav_blocked") {
    const blockedNav = Object.values(proposal.navStatus).find((n) => n.status === "block");
    return <RefusedPanel trade={proposal.trade} reason={proposal.navBlockReason} blockedNav={blockedNav} />;
  }

  if (proposal.action === "none") {
    return (
      <div className="panel">
        <p className="panel-title">Current proposal</p>
        <div className="empty-state">
          <strong>Portfolio is on target.</strong>
          No holding has drifted past {proposal.driftThresholdPct} percent. Nothing to approve right now.
        </div>
      </div>
    );
  }

  if (proposal.action === "insufficient_funds") {
    return (
      <div className="panel">
        <p className="panel-title">Current proposal</p>
        <div className="empty-state">
          <strong>The vault needs a deposit.</strong>
          Holdings have drifted from target, but no asset has a spendable balance to sell. Send funds to the
          vault to let the agent rebalance.
        </div>
      </div>
    );
  }

  if (dismissed) {
    return (
      <div className="panel">
        <p className="panel-title">Current proposal</p>
        <div className="empty-state">
          <strong>Proposal dismissed.</strong>
          It will be reconsidered on the next check.
        </div>
      </div>
    );
  }

  async function handleApprove() {
    setSubmitting(true);
    setError(null);
    try {
      if (!wallet.address) {
        throw new Error("Connect a wallet before approving.");
      }
      if (isNonOwnerWallet) {
        throw new Error("Only the vault owner's wallet can approve trades.");
      }
      const approval = await wallet.signApproval(vaultAddress);
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultAddress, ...approval }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Approval failed.");
      }
      setResult(data);
      onExecuted?.();
    } catch (err) {
      setError(err.message || "Approval failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      <p className="panel-title">Current proposal</p>
      <p className="proposal-statement">{formatTradeStatement(proposal.trade)}</p>
      <p className="proposal-reasoning">
        <strong>{proposal.trade.fromSymbol}</strong> is {Math.abs(proposal.trade.fromDriftPct).toFixed(1)} points{" "}
        {proposal.trade.fromDriftPct > 0 ? "over" : "under"} target. <strong>{proposal.trade.toSymbol}</strong> is{" "}
        {Math.abs(proposal.trade.toDriftPct).toFixed(1)} points {proposal.trade.toDriftPct > 0 ? "over" : "under"} target.{" "}
        {proposal.explanation}
      </p>
      <p className="ai-attribution mono">
        {EXPLANATION_SOURCE_LABEL[proposal.explanationSource] || EXPLANATION_SOURCE_LABEL.fallback}
      </p>

      {!result && isNonOwnerWallet && (
        <p className="empty-state">
          This is a live demo of the builder&apos;s vault. Only the owner&apos;s wallet can approve trades, so
          you can view this proposal but not act on it.
        </p>
      )}

      {!result && !isNonOwnerWallet && (
        <div className="proposal-actions">
          <button className="btn-approve" onClick={handleApprove} disabled={submitting}>
            {submitting ? "Approving trade" : "Approve trade"}
          </button>
          <button className="btn-dismiss" onClick={() => setDismissed(true)} disabled={submitting}>
            Dismiss
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="confirm-banner">
          Trade approved.{" "}
          <span className="mono">
            {result.trade.amountHuman.toFixed(6)} {result.trade.fromSymbol} for {result.trade.toSymbol}
          </span>
        </div>
      )}
    </div>
  );
}
