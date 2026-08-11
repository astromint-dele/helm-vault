// Pure SVG, not canvas. This is deliberate: a canvas element needs a rendering context
// that can fail to acquire (JS disabled, extensions blocking canvas, low-memory devices),
// while SVG is declarative markup that renders as long as the browser renders HTML at
// all. The refusal moment is the entire product thesis, so it cannot depend on a drawing
// surface that has a failure mode — this sidesteps that failure mode rather than adding a
// fallback on top of a riskier primary. Nothing here is animated except the optional
// "drift" variant (used once, in the header, purely ambient), so prefers-reduced-motion
// has nothing to override for the locked/refusal wheel itself.
export default function HelmWheel({ size = 48, locked = false, drift = false, color, spokes = 8 }) {
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size / 2;
  const strokeColor = color || (locked ? "var(--refused-bright)" : "var(--verdigris)");

  const spokeLines = [];
  for (let i = 0; i < spokes; i++) {
    const a = (Math.PI * 2 * i) / spokes;
    const innerR = r * 0.32;
    const x1 = cx + Math.cos(a) * innerR;
    const y1 = cy + Math.sin(a) * innerR;
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    spokeLines.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeColor}
        strokeWidth={Math.max(1.2, size * 0.022)}
        strokeLinecap="round"
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={locked ? "Locked helm wheel. Trade refused." : "Helm"}
      className={drift ? "wheel-slow-turn" : undefined}
    >
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={strokeColor} strokeWidth={Math.max(1.5, size * 0.035)} />
      {spokeLines}
      <circle cx={cx} cy={cy} r={r * 0.32} fill={strokeColor} />
      {locked && (
        <line
          x1={cx - r * 1.18}
          y1={cy}
          x2={cx + r * 1.18}
          y2={cy}
          stroke={strokeColor}
          strokeWidth={Math.max(2, size * 0.05)}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
