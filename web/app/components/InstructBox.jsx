// Visual shell only, matching the mockup's page structure. The natural-language instruct
// capability behind this is not built, that is a separate, still-pending decision, so this
// stays honestly disabled rather than pretending to accept input it cannot act on.
export default function InstructBox() {
  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Instruct Helm, vault owner</p>
        <p className="panel-title">Coming soon</p>
      </div>
      <input
        className="instruct-input"
        type="text"
        placeholder="Natural language instructions are not wired up yet"
        disabled
      />
      <div className="instruct-actions">
        <button className="btn-approve" disabled>
          Ask Helm to draft
        </button>
        <p className="instruct-helper">Helm would write the plan first. Nothing would move until you approve.</p>
      </div>
    </div>
  );
}
