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
// Navigates with demoBlockThreshold=0 added to whatever's already in the URL, preserving
// ?vault= (and anything else) rather than replacing the whole query string, so triggering
// the demo from a non-default vault doesn't silently bounce the visitor back to the demo
// vault. The previous version of this link (a bare href="?demoBlockThreshold=0") lost that
// context, this doesn't.
function triggerDemo() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("demoBlockThreshold", "0");
  window.location.href = url.toString();
}

export default function PriceFairnessTable({ navStatus, holdings, limitPct }) {
  const rows = holdings
    .map((h) => ({ ...h, nav: navStatus[h.address] }))
    .filter((r) => r.nav);

  return (
    <div className="panel">
      <div className="fairness-vault-header">
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

      {/* Deliberately its own visually distinct block, not a link sitting in the header row
          next to live numbers with no context — that's exactly what got removed before,
          because it read as fake, an unconditional link with no signal behind it. This says
          plainly what it is and isn't: the same real check above, same real prices, only the
          threshold is temporarily tightened so a normal small spread counts as a failure. */}
      <div className="fairness-demo-block">
        <span className="badge-demo">Demonstration</span>
        <p className="fairness-demo-lead">See Helm refuse a trade</p>
        <p className="fairness-demo-body">
          Runs the identical check shown above, this vault&apos;s real onchain price against
          today&apos;s real market price, the same code path, not a separate mock. The only
          thing different is the block threshold, tightened from {limitPct}% down to 0% so an
          ordinary, tiny spread is enough to trigger it. This is a demonstration, not a live
          alert, nothing here reflects the vault&apos;s actual current risk.
        </p>
        <button type="button" className="refresh-btn mono fairness-demo-btn" onClick={triggerDemo}>
          Run it now
        </button>
      </div>
    </div>
  );
}
