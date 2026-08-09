import HelmWheel from "./HelmWheel.jsx";

function truncate(address) {
  return `${address.slice(0, 6)}_${address.slice(-4)}`;
}

// The signature moment, full width, taking over the content area entirely rather than
// sitting inside the normal panel grid, matching the mockup. headline and reason are both
// real: headline is built deterministically in lib/rebalanceProposal.js from the actual
// symbol that failed the check, reason is the same reason string the price fairness table
// would otherwise show for that asset.
export default function RefusedPanel({ headline, reason, blockedNav, vaultAddress, onAcknowledge, acknowledging }) {
  return (
    <div className="refusal-screen">
      <div className="refusal-wheel">
        <HelmWheel size={110} locked />
      </div>
      <p className="refusal-label mono">Trade refused by Helm</p>
      <h2 className="refusal-headline">{headline}</h2>
      <p className="refusal-reason">{reason}</p>
      {blockedNav && typeof blockedNav.deviationPct === "number" && (
        <div className="refusal-figures">
          <div className="refusal-figure">
            <p className="label">Onchain</p>
            <p className="value mono">{blockedNav.onchainPrice.toFixed(2)}</p>
          </div>
          <div className="refusal-figure">
            <p className="label">Market</p>
            <p className="value mono">{blockedNav.realPrice.toFixed(2)}</p>
          </div>
          <div className="refusal-figure">
            <p className="label">Spread</p>
            <p className="value hot mono">
              {blockedNav.deviationPct > 0 ? "+" : "−"}
              {Math.abs(blockedNav.deviationPct).toFixed(2)}%
            </p>
          </div>
        </div>
      )}
      <p className="refusal-retry mono">{truncate(vaultAddress)}. Helm will check again when you refresh.</p>
      <button className="btn-acknowledge" onClick={onAcknowledge} disabled={acknowledging}>
        {acknowledging ? "Checking again" : "Acknowledge and return to watch"}
      </button>
    </div>
  );
}
