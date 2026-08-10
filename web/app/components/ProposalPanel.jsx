"use client";

import { useState } from "react";

const EXPLANATION_SOURCE_LABEL = {
  llm: "Explained by Gemini, generated for this check.",
  cache: "Explained by Gemini, reused from a matching check moments ago.",
  fallback: "Template explanation. Gemini was unavailable for this check.",
};

const STATUS_LABEL = {
  rebalance: "Awaiting your decision",
  none: "No action needed",
  insufficient_funds: "Insufficient funds",
  no_underweight_asset: "No trade target yet",
};

// Deterministic, built directly from proposal.trade, not parsed out of the LLM's free text
// (which would be fragile and could highlight the wrong thing). This is what lets a reader
// see the actual action at a glance, with the flowing explanation underneath as detail.
function ActionLine({ trade }) {
  const fromIsCash = trade.fromSymbol === "USDG";
  const toIsCash = trade.toSymbol === "USDG";
  if (fromIsCash) {
    return (
      <p className="action-line">
        <span className="action-verb">Buy</span> <span className="action-symbol">{trade.toSymbol}</span> with{" "}
        <span className="action-amount">${trade.amountHuman.toFixed(2)}</span> cash
      </p>
    );
  }
  if (toIsCash) {
    return (
      <p className="action-line">
        <span className="action-verb">Sell</span> <span className="action-amount">{trade.amountHuman.toFixed(6)}</span>{" "}
        <span className="action-symbol">{trade.fromSymbol}</span> for cash
      </p>
    );
  }
  return (
    <p className="action-line">
      <span className="action-verb">Sell</span> <span className="action-amount">{trade.amountHuman.toFixed(6)}</span>{" "}
      <span className="action-symbol">{trade.fromSymbol}</span> for <span className="action-symbol">{trade.toSymbol}</span>
    </p>
  );
}

// nav_blocked is handled one level up (see HomeClient.jsx), it takes over the whole content
// area rather than living inside this panel, matching the mockup's full refusal screen.
export default function ProposalPanel({ proposal, vaultAddress, ownerAddress, wallet, onExecuted }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [declined, setDeclined] = useState(false);

  const isNonOwnerWallet =
    wallet.address && ownerAddress && wallet.address.toLowerCase() !== ownerAddress.toLowerCase();

  if (proposal.action === "none") {
    return (
      <div className="panel">
        <div className="panel-header-row">
          <p className="panel-title">Current proposal, written by Helm</p>
          <p className="panel-title">{STATUS_LABEL.none}</p>
        </div>
        <div className="empty-state">
          <strong>Portfolio is on target.</strong>
          No holding has drifted past {proposal.driftThresholdPct} points. Nothing to approve right now.
        </div>
      </div>
    );
  }

  if (proposal.action === "insufficient_funds") {
    return (
      <div className="panel">
        <div className="panel-header-row">
          <p className="panel-title">Current proposal, written by Helm</p>
          <p className="panel-title">{STATUS_LABEL.insufficient_funds}</p>
        </div>
        <div className="empty-state">
          <strong>The vault needs a deposit.</strong>
          Holdings have drifted from target, but nothing overweight has a spendable balance to sell. Send
          funds to the vault to let the agent rebalance.
        </div>
      </div>
    );
  }

  // Distinct from insufficient_funds: an asset is overweight enough to sell, but nothing
  // else is underweight enough yet to be worth trading into. Not a funds problem, so it
  // gets its own honest label and copy instead of reusing "needs a deposit".
  if (proposal.action === "no_underweight_asset") {
    const o = proposal.overweightHint;
    return (
      <div className="panel">
        <div className="panel-header-row">
          <p className="panel-title">Current proposal, written by Helm</p>
          <p className="panel-title">{STATUS_LABEL.no_underweight_asset}</p>
        </div>
        <div className="empty-state">
          <strong>Nothing underweight enough to trade into.</strong>
          {o
            ? `${o.symbol} has drifted ${Math.abs(o.driftPct).toFixed(1)} points above its ${o.targetPct.toFixed(1)}% target, but every other holding is already close enough to its own target.`
            : "One holding has drifted above target, but every other holding is already close enough to its own target."}
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="panel">
        <div className="panel-header-row">
          <p className="panel-title">Current proposal, written by Helm</p>
          <p className="panel-title">Declined</p>
        </div>
        <div className="empty-state">
          <strong>Proposal declined.</strong>
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
      <div className="panel-header-row">
        <p className="panel-title">Current proposal, written by Helm</p>
        <p className="panel-title">{result ? "Executed" : STATUS_LABEL.rebalance}</p>
      </div>

      {!result && (
        <>
          <ActionLine trade={proposal.trade} />
          <p className="proposal-statement">{proposal.explanation}</p>
          <p className="ai-attribution mono">
            {EXPLANATION_SOURCE_LABEL[proposal.explanationSource] || EXPLANATION_SOURCE_LABEL.fallback}
          </p>
        </>
      )}

      {!result && isNonOwnerWallet && (
        <p className="empty-state">
          This is a live demo of the builder&apos;s vault. Only the owner&apos;s wallet can approve trades, so
          you can view this proposal but not act on it.
        </p>
      )}

      {!result && !isNonOwnerWallet && (
        <div className="proposal-actions">
          <button className="btn-approve" onClick={handleApprove} disabled={submitting}>
            {submitting ? "Approving" : "Approve"}
          </button>
          <button className="btn-dismiss" onClick={() => setDeclined(true)} disabled={submitting}>
            Decline
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="confirm-banner">
          <p className="confirm-text">{result.confirmation}</p>
        </div>
      )}
    </div>
  );
}
