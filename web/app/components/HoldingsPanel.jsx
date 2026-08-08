const ROLE_BY_SYMBOL = {
  USDG: "Cash",
  NVDAx: "Equity",
  AAPLx: "Equity",
  MSFTx: "Equity",
  SPYx: "Index",
  xBTC: "Crypto",
};

function formatPct(value) {
  return `${value.toFixed(1)}%`;
}

function formatBalance(value) {
  return value.toFixed(6);
}

function DriftValue({ driftPct }) {
  if (Math.abs(driftPct) < 0.05) {
    return <span className="drift-value match">On target</span>;
  }
  const sign = driftPct > 0 ? "+" : "−";
  const cls = driftPct > 0 ? "over" : "under";
  return (
    <span className={`drift-value ${cls}`}>
      {sign}
      {Math.abs(driftPct).toFixed(1)}
    </span>
  );
}

export default function HoldingsPanel({ holdings }) {
  return (
    <div className="panel">
      <p className="panel-title">Holdings against target</p>
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Balance</th>
            <th className="num">Actual</th>
            <th className="num">Target</th>
            <th className="num">Drift</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.address}>
              <td>
                <div className="asset-name">{h.symbol}</div>
                <div className="asset-role">{ROLE_BY_SYMBOL[h.symbol] || "Asset"}</div>
              </td>
              <td className="num num-cell">{formatBalance(h.balance)}</td>
              <td className="num num-cell">{formatPct(h.actualPct)}</td>
              <td className="num num-cell">{formatPct(h.targetPct)}</td>
              <td className="num">
                <DriftValue driftPct={h.driftPct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
