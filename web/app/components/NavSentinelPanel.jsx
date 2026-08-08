function symbolFor(holdings, address) {
  return holdings.find((h) => h.address.toLowerCase() === address.toLowerCase())?.symbol || address;
}

export default function NavSentinelPanel({ navStatus, holdings }) {
  const entries = Object.entries(navStatus);
  if (!entries.length) {
    return (
      <div className="panel">
        <p className="panel-title">Price check</p>
        <p className="empty-state">Cash holdings do not need a price check. Nothing to show.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="panel-title">Price check</p>
      {entries.map(([address, nav]) => (
        <div className="nav-row" key={address}>
          <div className={`nav-dot ${nav.status}`} />
          <div>
            <p className="nav-asset">{symbolFor(holdings, address)}</p>
            <p className="nav-reason">{nav.reason}</p>
            {typeof nav.deviationPct === "number" && (
              <p className="nav-deviation mono">
                Onchain ${nav.onchainPrice?.toFixed(2)} Real ${nav.realPrice?.toFixed(2)} {nav.deviationPct > 0 ? "+" : "−"}
                {Math.abs(nav.deviationPct).toFixed(2)}%
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
