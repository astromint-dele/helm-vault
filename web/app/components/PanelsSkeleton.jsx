// Suspense fallback while VaultDataServer resolves. Shaped like the real layout so the page
// doesn't visibly jump once data arrives, worded nothing like "Reading vault state" or any
// prior loading copy so it can never be confused with a frozen page on inspection.
export default function PanelsSkeleton() {
  return (
    <div className="skeleton-pulse">
      <div className="watch-panel">
        <div className="skeleton-circle" />
        <div className="watch-panel-body">
          <div className="skeleton-bar" style={{ width: "160px" }} />
          <div className="skeleton-bar" style={{ width: "70%" }} />
          <div className="skeleton-bar" style={{ width: "45%" }} />
        </div>
      </div>
      <p className="loading-line">Contacting the vault...</p>
      <div className="panel">
        <div className="skeleton-bar" style={{ width: "70%", height: "26px", marginBottom: "14px" }} />
        <div className="skeleton-bar" style={{ width: "100%", marginBottom: "8px" }} />
        <div className="skeleton-bar" style={{ width: "90%", marginBottom: "24px" }} />
        <div className="skeleton-bar" style={{ width: "140px", height: "40px" }} />
      </div>
      <div className="main-grid">
        <div className="col">
          <div className="panel">
            <div className="skeleton-bar" style={{ width: "140px", marginBottom: "18px" }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-bar" style={{ width: "100%", height: "36px", marginBottom: "14px" }} />
            ))}
          </div>
        </div>
        <div className="col">
          <div className="panel">
            <div className="skeleton-bar" style={{ width: "180px", marginBottom: "18px" }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-bar" style={{ width: "100%", height: "36px", marginBottom: "14px" }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
