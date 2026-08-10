import HelmWheel from "./HelmWheel.jsx";

function truncate(address) {
  return `${address.slice(0, 6)}_${address.slice(-4)}`;
}

// The demo trigger requested a refusal, but there is genuinely nothing to refuse right now
// (see lib/rebalanceProposal.js's navDemoUnavailableReason for the real, specific cause).
// Deliberately not RefusedPanel: nothing was actually refused, so the wheel stays unlocked
// and the copy says plainly that there's nothing to demonstrate, rather than reusing the
// refusal framing for something that didn't happen. This is what replaces silently falling
// through to the normal page, which read as the trigger button doing nothing.
export default function DemoUnavailablePanel({ reason, vaultAddress, onAcknowledge, acknowledging }) {
  function handleAcknowledge() {
    if (typeof window !== "undefined") {
      window.location.href = window.location.pathname;
      return;
    }
    onAcknowledge?.();
  }

  return (
    <div className="refusal-screen">
      <div className="refusal-wheel">
        <HelmWheel size={90} drift />
      </div>
      <p className="refusal-label mono">Demonstrating price fairness</p>
      <h2 className="refusal-headline">There is no trade to refuse right now.</h2>
      <p className="refusal-reason">{reason}</p>
      <p className="refusal-retry mono">
        {truncate(vaultAddress)}. The price fairness check only runs against a proposed trade, when holdings
        drift again this demonstration will show a real refusal.
      </p>
      <button className="btn-acknowledge" onClick={handleAcknowledge} disabled={acknowledging}>
        Return to watch
      </button>
    </div>
  );
}
