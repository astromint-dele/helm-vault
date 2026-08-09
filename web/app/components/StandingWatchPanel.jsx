import HelmWheel from "./HelmWheel.jsx";
import LiveClock from "./LiveClock.jsx";

function truncate(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// The dedicated "instrument" presence for the normal state. agentAddress and currentBlock
// are both read live from chain (see lib/driftCalculator.js's getVaultMeta), not hardcoded,
// so this stays correct if the agent is ever rotated. No fabricated "next check" cadence,
// the honest line below is literally what the system does: check on load, check on refresh.
export default function StandingWatchPanel({ agentAddress, currentBlock, onRefresh, refreshing }) {
  return (
    <div className="watch-panel">
      <HelmWheel size={44} drift />
      <div className="watch-panel-body">
        <p className="watch-panel-header">
          <span className="watch-dot" />
          Helm is standing watch
        </p>
        <p className="watch-panel-line">Helm checks the vault when this page loads and again on every refresh.</p>
        <div className="watch-panel-status">
          <span className="mono">
            Helm Agent &middot; {truncate(agentAddress)} &middot; block {currentBlock.toLocaleString()} &middot;{" "}
            <LiveClock />
          </span>
          <button className="refresh-btn mono" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
    </div>
  );
}
