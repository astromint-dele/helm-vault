"use client";

import { useState, useEffect } from "react";

const ROLE_BY_SYMBOL = {
  USDG: "Cash",
  NVDAx: "Equity",
  AAPLx: "Equity",
  MSFTx: "Equity",
  SPYx: "Index",
  xBTC: "Crypto",
};

function formatUSDG(value) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// A direct owner call on PolicyVault.withdraw, no agent involved, real gas, real and
// immediate, so this arms on the first click and only actually sends the transaction on a
// second, explicit confirm, rather than moving real funds off one click.
function WithdrawControl({ holding, isOwner, vaultAddress, wallet, onWithdrawn }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState(null);

  const hasBalance = BigInt(holding.balanceRaw) > 0n;
  if (!isOwner || !hasBalance) return null;

  async function handleClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    try {
      await wallet.withdraw(vaultAddress, holding.address, BigInt(holding.balanceRaw));
      setArmed(false);
      onWithdrawn?.();
    } catch (err) {
      setError(err.message || "Withdrawal failed.");
      setArmed(false);
    }
  }

  return (
    <div className="holding-withdraw">
      <button type="button" className="holding-withdraw-btn" onClick={handleClick} disabled={wallet.withdrawing}>
        {wallet.withdrawing
          ? "Withdrawing"
          : armed
            ? `Confirm, send ${formatUSDG(holding.valueUSDG)} to your wallet`
            : "Withdraw all"}
      </button>
      {armed && (
        <button type="button" className="holding-withdraw-cancel" onClick={() => setArmed(false)} disabled={wallet.withdrawing}>
          Cancel
        </button>
      )}
      {error && <p className="holding-withdraw-error">{error}</p>}
    </div>
  );
}

// driftThresholdPct is the real value decideRebalanceAction uses to decide whether to
// propose a trade at all (lib/rebalanceProposal.js), not a separately invented display
// number, so "inside/outside band" here means exactly what it means to the agent.
// totalValueUSDG and each holding's valueUSDG are the same numbers the drift math itself
// runs on (lib/driftCalculator.js's computeDrift), not a separate display-only estimate.
export default function HoldingsBars({
  holdings,
  driftThresholdPct,
  totalValueUSDG,
  vaultAddress,
  ownerAddress,
  wallet,
  onWithdrawn,
}) {
  // This component streams in behind a Suspense boundary, while the wallet's silent
  // eth_accounts restore lives in the instant shell and can finish first, well before this
  // ever mounts. Without this guard, this component's very first client render can already
  // see a populated wallet.address, differing from the server's (necessarily walletless)
  // markup, and React logs a hydration mismatch even though the eventual UI is correct.
  // mounted stays false through the render that gets reconciled against the server output,
  // then flips true in an effect, which only ever runs after hydration has committed.
  const [mounted, setMounted] = useState(false);
  // This is the standard mount-flag fix for exactly the hydration mismatch above, not a
  // pattern to simplify away, the whole point is a state update that happens strictly after
  // hydration commits, never during the render React reconciles against the server.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isOwner =
    mounted && Boolean(wallet?.address && ownerAddress && wallet.address.toLowerCase() === ownerAddress.toLowerCase());

  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Holdings against target</p>
        <p className="panel-title">Tolerance band {driftThresholdPct.toFixed(2)} pt</p>
      </div>
      <p className="holdings-total mono">{formatUSDG(totalValueUSDG)} total</p>
      {holdings.map((h) => {
        const outside = Math.abs(h.driftPct) > driftThresholdPct;
        return (
          <div className="holding-row" key={h.address}>
            <div className="holding-label">
              <p className="asset-name">{h.symbol}</p>
              <p className="asset-role">{ROLE_BY_SYMBOL[h.symbol] || "Asset"}</p>
            </div>
            <div className="holding-bar-col">
              <p className="holding-bar-caption mono">
                target {h.targetPct.toFixed(1)}% actual {h.actualPct.toFixed(1)}% · {formatUSDG(h.valueUSDG)}
              </p>
              <div className="holding-track">
                <div className="holding-fill" style={{ width: `${Math.min(100, Math.max(0, h.actualPct))}%` }} />
                <div className="holding-target-marker" style={{ left: `${Math.min(100, Math.max(0, h.targetPct))}%` }} />
              </div>
              {wallet && (
                <WithdrawControl
                  holding={h}
                  isOwner={isOwner}
                  vaultAddress={vaultAddress}
                  wallet={wallet}
                  onWithdrawn={onWithdrawn}
                />
              )}
            </div>
            <div className="holding-drift-col">
              <p className={`holding-drift-value mono ${outside ? "outside" : "inside"}`}>
                {h.driftPct > 0 ? "+" : "−"}
                {Math.abs(h.driftPct).toFixed(1)} pt
              </p>
              <p className="holding-drift-label">{outside ? "outside band" : "inside band"}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
