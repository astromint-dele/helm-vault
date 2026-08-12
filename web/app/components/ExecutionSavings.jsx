// Visual shell only, matching InstructBox.jsx's honesty pattern. There is no mechanism
// today that computes this, so it shows no number at all, not even "$0.00" - a zero reads
// as "tracked since zero," which would claim a real running total that doesn't exist yet.
// The underlying number is real and buildable, not invented: every nav_blocked refusal
// already knows the real spread and the trade size that would have executed at that
// moment, so "value protected by refusing" is a genuine future metric, just not wired up.
export default function ExecutionSavings() {
  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Execution savings</p>
        <span className="badge-soon">Coming soon</span>
      </div>
      <p className="disclosure-line">
        Every time Helm refuses a trade over a bad spread, the value that refusal protected
        is a real, computable number, the spread times the size of the trade that would
        have executed. Not tracked yet, this will total that across every real refusal, not
        an estimate.
      </p>
    </div>
  );
}
