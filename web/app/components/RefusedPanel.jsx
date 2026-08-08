import HelmWheel from "./HelmWheel.jsx";

function formatTradeStatement(trade) {
  const fromIsCash = trade.fromSymbol === "USDG";
  const toIsCash = trade.toSymbol === "USDG";
  const fromPart = fromIsCash ? `$${trade.amountHuman.toFixed(2)} cash` : `${trade.amountHuman.toFixed(6)} ${trade.fromSymbol}`;
  const toPart = toIsCash ? "cash" : trade.toSymbol;
  return `sold ${fromPart} into ${toPart}`;
}

// The signature moment. This is the entire product thesis in one view, so it takes over
// the panel completely rather than adding a warning badge to the normal proposal layout.
export default function RefusedPanel({ trade, reason, blockedNav }) {
  return (
    <div className="panel panel-refused">
      <div className="refused-head">
        <HelmWheel size={52} locked />
        <h2 className="refused-title">Trade refused</h2>
      </div>
      {trade && <p className="refused-would">Would have {formatTradeStatement(trade)}</p>}
      <p className="refused-reason">{reason}</p>
      {blockedNav && typeof blockedNav.deviationPct === "number" && (
        <div className="refused-meta">
          <div className="refused-meta-item">
            <p className="label">Onchain price</p>
            <p className="value mono">${blockedNav.onchainPrice.toFixed(2)}</p>
          </div>
          <div className="refused-meta-item">
            <p className="label">Real price</p>
            <p className="value mono">${blockedNav.realPrice.toFixed(2)}</p>
          </div>
          <div className="refused-meta-item">
            <p className="label">Deviation</p>
            <p className="value hot mono">
              {blockedNav.deviationPct > 0 ? "+" : "−"}
              {Math.abs(blockedNav.deviationPct).toFixed(1)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
