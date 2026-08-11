"use client";

import { useState } from "react";

// Shown instead of the normal panel grid whenever the vault has no spendable balance to
// act on (proposal.action === "insufficient_funds"), which is exactly true, honestly, the
// moment a fresh vault is created and stays true until a real deposit lands. This isn't a
// separate "onboarding" screen that gets dismissed, it's the same real proposal state
// every other panel renders from, it just disappears on its own the moment a refresh sees
// a nonzero balance, because at that point the agent has a real trade to propose instead.
export default function EmptyVaultPanel({ vaultAddress, ownerAddress, holdings, wallet, onRefresh, refreshing }) {
  const [copied, setCopied] = useState(false);

  const isOwner = wallet.address && ownerAddress && wallet.address.toLowerCase() === ownerAddress.toLowerCase();

  function handleCopy() {
    navigator.clipboard?.writeText(vaultAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const xstockSymbols = (holdings || []).map((h) => h.symbol).filter((s) => s !== "USDG");

  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Your vault, waiting for its first deposit</p>
      </div>

      <div className="empty-state">
        {isOwner ? (
          <>
            <strong>This is your vault. You own it.</strong> Helm cannot move a single token out of it without
            your signature, no matter what it proposes.
          </>
        ) : (
          <>
            <strong>This vault has no funds yet.</strong>{" "}
            {ownerAddress
              ? `Owned by ${ownerAddress.slice(0, 6)}...${ownerAddress.slice(-4)}, only that wallet can approve trades for it.`
              : "Only its owner's wallet can approve trades for it."}
          </>
        )}
      </div>

      <div className="vault-address-box">
        <p className="panel-title">Vault address</p>
        <div className="vault-address-row">
          <span className="mono vault-address-full">{vaultAddress}</span>
          <button type="button" className="btn-dismiss" onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <p className="disclosure-line" style={{ marginTop: 16 }}>
        <strong>Deposit USDG</strong> to this address, directly from your own wallet. Helm reads the deposit,
        then proposes trades to buy {xstockSymbols.length > 0 ? xstockSymbols.join(", ") : "the vault's other holdings"} according
        to this vault&apos;s target allocation below. There is no minimum deposit, though a very small one may
        not produce a trade worth the gas to execute.
      </p>

      <p className="disclosure-line">
        You can also send {xstockSymbols.length > 0 ? xstockSymbols.join(", ") : "another allowlisted token"} directly,
        this vault accepts any of its allowlisted tokens, but that is not the intended path. The agent would
        then need to sell that position back down to reach target rather than simply buying up from cash, an
        extra trade for no real benefit.
      </p>

      <p className="disclosure-line">
        Sending a token that is not on this vault&apos;s allowlist is safe but inert. The owner can always
        withdraw it, the agent can never trade it.
      </p>

      <p className="disclosure-line">
        Once a deposit lands, Helm reads the vault&apos;s real balance on chain, compares it to this vault&apos;s
        target allocation, and proposes a trade if anything has drifted enough to be worth correcting. Nothing
        executes until you sign an approval, and every price is checked against the real market first.
      </p>

      {holdings && holdings.length > 0 && (
        <>
          <p className="panel-title" style={{ marginTop: 18, marginBottom: 8 }}>
            Target allocation
          </p>
          <ul className="preset-allocations">
            {holdings.map((h) => (
              <li key={h.address}>
                <span className="mono">{h.targetPct.toFixed(0)}%</span> {h.symbol}
              </li>
            ))}
          </ul>
        </>
      )}

      <button className="refresh-btn mono" style={{ marginTop: 18 }} onClick={onRefresh} disabled={refreshing}>
        {refreshing ? "Checking" : "Check for deposit"}
      </button>
    </div>
  );
}
