// Static, no data dependency, part of the instant shell (see page.js). A cold visitor
// hits this before any live vault data has loaded, condensed from the README's six-step
// loop into three beats, detail lives in the README and FINDINGS.md for anyone who wants
// it, this is the primer, not the full account.
const STEPS = [
  {
    title: "Reads and decides",
    body: "Helm reads the vault's real onchain holdings and policy, then computes drift and trade sizing deterministically. The LLM only phrases an already-decided proposal in plain English, it never chooses the trade.",
  },
  {
    title: "Confirms a fair price",
    body: "Before proposing anything, NAV Sentinel compares the onchain price against the real market price. A trade Helm cannot confirm is fairly priced gets refused, not proposed with a caveat.",
  },
  {
    title: "Waits for your signature",
    body: "Nothing executes until the vault's owner signs an approval. The signature is verified fresh against the vault's real onchain owner, every time, never a cached or assumed identity.",
  },
];

export default function HowItWorks() {
  return (
    <div className="how-it-works">
      <p className="panel-title" style={{ marginBottom: 14 }}>
        How it works
      </p>
      <div className="how-it-works-grid">
        {STEPS.map((step, i) => (
          <div key={step.title} className="how-it-works-card">
            <span className="how-it-works-step mono">{String(i + 1).padStart(2, "0")}</span>
            <p className="how-it-works-title">{step.title}</p>
            <p className="how-it-works-body">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
