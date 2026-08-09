function truncate(address) {
  return `${address.slice(0, 6)}_${address.slice(-4)}`;
}

// Replaces the old NavSentinelPanel entirely, per the mockup, one price fairness view, not
// two. Every reason line here is the real string lib/navSentinel.js already computes (a
// market-closed notice, a stablecoin note, a no-underlying-equity note), never a fabricated
// "feed" staleness claim. There is no feed in this system, prices come from a live onchain
// quote and a live market read, compared once, at the moment this proposal was generated.
export default function PriceFairnessTable({ navStatus, holdings, limitPct }) {
  const rows = holdings
    .map((h) => ({ ...h, nav: navStatus[h.address] }))
    .filter((r) => r.nav);

  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Price fairness, onchain against market</p>
        <p className="panel-title">Limit {limitPct}%</p>
      </div>
      <table className="fairness-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Onchain</th>
            <th className="num">Market</th>
            <th className="num">Spread</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isNa = r.nav.status === "na";
            const isHot = !isNa && typeof r.nav.deviationPct === "number" && Math.abs(r.nav.deviationPct) >= limitPct;
            return (
              <tr key={r.address}>
                <td>
                  <p className="asset-name">{r.symbol}</p>
                  <p className="asset-role mono">{truncate(r.address)}</p>
                  <p className="fairness-reason">{r.nav.reason}</p>
                </td>
                {isNa ? (
                  <>
                    <td className="num num-cell">n/a</td>
                    <td className="num num-cell">n/a</td>
                    <td className="num fairness-na">not applicable</td>
                  </>
                ) : (
                  <>
                    <td className="num num-cell">{r.nav.onchainPrice?.toFixed(2)}</td>
                    <td className="num num-cell">{r.nav.realPrice?.toFixed(2)}</td>
                    <td className={`num fairness-spread ${isHot ? "hot" : ""}`}>
                      {r.nav.deviationPct > 0 ? "+" : "−"}
                      {Math.abs(r.nav.deviationPct).toFixed(2)}%
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
