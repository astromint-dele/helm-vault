// Suspense fallback while VaultDataServer resolves. Deliberately shaped like the real
// layout (so the page doesn't visibly jump once data arrives) and deliberately worded
// nothing like "Reading vault state" or any prior loading copy — this text has no relation
// to the pre-SSR bug where a stale static build could freeze on a loading string; this is a
// transient fallback on a confirmed-dynamic route, but keeping the wording distinct removes
// any chance of confusing the two on inspection.
export default function PanelsSkeleton() {
  return (
    <>
      <div className="agent-panel skeleton-pulse">
        <div className="skeleton-circle" />
        <div className="agent-panel-body">
          <div className="skeleton-bar" style={{ width: "120px" }} />
          <div className="skeleton-bar" style={{ width: "85%" }} />
          <div className="skeleton-bar" style={{ width: "55%" }} />
        </div>
      </div>
      <p className="loading-line">Contacting the vault...</p>
      <div className="main-grid skeleton-pulse">
        <div className="col">
          <div className="panel">
            <div className="skeleton-bar" style={{ width: "140px", marginBottom: "18px" }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton-bar" style={{ width: "100%", height: "20px", marginBottom: "14px" }} />
            ))}
          </div>
        </div>
        <div className="col">
          <div className="panel">
            <div className="skeleton-bar" style={{ width: "70%", height: "26px", marginBottom: "14px" }} />
            <div className="skeleton-bar" style={{ width: "100%", marginBottom: "8px" }} />
            <div className="skeleton-bar" style={{ width: "90%", marginBottom: "24px" }} />
            <div className="skeleton-bar" style={{ width: "140px", height: "40px" }} />
          </div>
        </div>
      </div>
    </>
  );
}
