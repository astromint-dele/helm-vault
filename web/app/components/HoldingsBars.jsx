const ROLE_BY_SYMBOL = {
  USDG: "Cash",
  NVDAx: "Equity",
  AAPLx: "Equity",
  MSFTx: "Equity",
  SPYx: "Index",
  xBTC: "Crypto",
};

// driftThresholdPct is the real value decideRebalanceAction uses to decide whether to
// propose a trade at all (lib/rebalanceProposal.js), not a separately invented display
// number, so "inside/outside band" here means exactly what it means to the agent.
export default function HoldingsBars({ holdings, driftThresholdPct }) {
  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Holdings against target</p>
        <p className="panel-title">Tolerance band {driftThresholdPct.toFixed(2)} pt</p>
      </div>
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
                target {h.targetPct.toFixed(1)}% actual {h.actualPct.toFixed(1)}%
              </p>
              <div className="holding-track">
                <div className="holding-fill" style={{ width: `${Math.min(100, Math.max(0, h.actualPct))}%` }} />
                <div className="holding-target-marker" style={{ left: `${Math.min(100, Math.max(0, h.targetPct))}%` }} />
              </div>
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
