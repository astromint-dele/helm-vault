import PublicPriceCheck from "./PublicPriceCheck.jsx";

function truncate(address) {
  return `${address.slice(0, 6)}_${address.slice(-4)}`;
}

// Spread color reads directly off nav.status (already computed correctly per-row, with
// that row's own effective threshold — market-open vs closed can differ per asset) rather
// than re-deriving a "hot" flag from a single table-wide limit compared against every row.
// Neutral by default, color only when the check itself says warn or block, so a color
// actually means something instead of every row looking the same.
function spreadClassName(status) {
  if (status === "block") return "fairness-spread hot";
  if (status === "warn") return "fairness-spread warn";
  return "fairness-spread";
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
      <PublicPriceCheck />

      <div className="fairness-vault-header">
        <div className="panel-header-row">
          <p className="panel-title">Price fairness, onchain against market</p>
          <div className="fairness-header-right">
            <p className="panel-title">Limit {limitPct}%</p>
            <a href="?demoBlockThreshold=0" className="fairness-demo-link">
              see it refuse a trade
            </a>
          </div>
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
              return (
                <tr key={r.address}>
                  <td>
                    <p className="asset-name">{r.symbol}</p>
                    <p className="asset-role mono">{truncate(r.address)}</p>
                    <details className="fairness-details">
                      <summary>why</summary>
                      <p className="fairness-reason">{r.nav.reason}</p>
                    </details>
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
                      <td className={`num ${spreadClassName(r.nav.status)}`}>
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
    </div>
  );
}
