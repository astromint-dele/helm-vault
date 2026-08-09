// Visual shell only, matching the mockup's page structure. The natural-language instruct
// capability behind this is not built, that is a separate, still-pending decision. This
// must not look like a working input a visitor could reasonably try, so the disabled state
// is loud (a distinct amber badge, heavily dimmed input and button, explicit "not built
// yet" copy), not just a technically-disabled attribute with subtle styling.
export default function InstructBox() {
  return (
    <div className="panel">
      <div className="panel-header-row">
        <p className="panel-title">Instruct Helm, vault owner</p>
        <span className="badge-soon">Coming soon</span>
      </div>
      <input
        className="instruct-input"
        type="text"
        placeholder="Not built yet, this box does not accept input"
        disabled
        aria-disabled="true"
      />
      <div className="instruct-actions">
        <button className="btn-approve" disabled aria-disabled="true">
          Ask Helm to draft
        </button>
        <p className="instruct-helper">This feature is not built yet. Nothing here can be submitted.</p>
      </div>
    </div>
  );
}
