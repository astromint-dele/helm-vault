import HelmWheel from "./HelmWheel.jsx";
import LiveElapsed from "./LiveElapsed.jsx";

// The dedicated "instrument" moment for the normal state — previously the wheel only ever
// appeared at full size in the (rare) refusal panel, so the brand had almost no presence in
// the common case. This panel also carries the AI-attribution claim (visible in the first
// seconds, before any specific proposal has loaded) and the live-status signals that make
// the page read as continuously watching, without any actual polling behind it.
export default function AgentPanel({ holdingsCount, generatedAt, stale, onRefresh, refreshing }) {
  return (
    <div className="agent-panel">
      <HelmWheel size={56} drift />
      <div className="agent-panel-body">
        <p className="agent-panel-name">Helm Agent</p>
        <p className="agent-panel-pipeline">
          Reads this vault&apos;s holdings and live prices, computes drift against policy deterministically, then
          asks Gemini to explain the result in plain English.
        </p>
        <div className="agent-panel-status">
          <span className="mono">
            Watching {holdingsCount} asset{holdingsCount === 1 ? "" : "s"} on this vault. Checked{" "}
            <LiveElapsed since={generatedAt} />.
            {stale ? " Could not reach OKX for a fresh read, showing the last confirmed prices." : " Checks on load and when you refresh."}
          </span>
          <button className="refresh-btn mono" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
