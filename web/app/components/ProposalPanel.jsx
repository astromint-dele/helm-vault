"use client";

import { useState } from "react";
import RefusedPanel from "./RefusedPanel.jsx";

function formatTradeStatement(trade) {
  const fromIsCash = trade.fromSymbol === "USDG";
  const toIsCash = trade.toSymbol === "USDG";
  const fromPart = fromIsCash ? `$${trade.amountHuman.toFixed(2)} cash` : `${trade.amountHuman.toFixed(6)} ${trade.fromSymbol}`;
  const toPart = toIsCash ? "cash" : trade.toSymbol;
  return `Sell ${fromPart} into ${toPart}.`;
}

export default function ProposalPanel({ proposal, vaultAddress, wallet, onExecuted }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);

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

      {!result && (
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
