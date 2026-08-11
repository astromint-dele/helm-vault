// Request-scoped timing, threaded through as an optional parameter so callers that don't
// care (agent-loop.js, tests) are completely unaffected — every function that accepts a
// timer defaults to noopTimer() and behaves exactly as before if one isn't passed.
//
// Captures each stage's start offset AND duration, not just a sequential waterfall, so
// stages that genuinely ran in parallel are visible as overlapping in the report instead of
// being flattened into a total that looks sequential when it wasn't. This is what makes a
// timing report a real diagnostic instead of a guess dressed up as a number.
export function createTimer() {
  const start = process.hrtime.bigint();
  const events = [];

  function toMs(bigintNs) {
    return Number(bigintNs) / 1e6;
  }

  async function time(label, fn) {
    const t0 = process.hrtime.bigint();
    try {
      return await fn();
    } finally {
      const t1 = process.hrtime.bigint();
      events.push({ label, startMs: Math.round(toMs(t0 - start)), durationMs: Math.round(toMs(t1 - t0)) });
    }
  }

  function report() {
    return { totalMs: Math.round(toMs(process.hrtime.bigint() - start)), events };
  }

  return { time, report };
}

export function noopTimer() {
  return {
    time: (_label, fn) => fn(),
    report: () => ({ totalMs: 0, events: [] }),
  };
}
