// Provider-agnostic LLM client for turning deterministic drift/proposal data into plain
// English. The LLM writes prose only — it never decides trade sizing or allocation targets,
// those come from driftCalculator.js and stay deterministic. If the LLM is unavailable
// (rate limited, network error, missing key), callers get { text: null, source: "fallback" }
// and are expected to fall back to a templated explanation rather than fail the proposal.
//
// Two safety mechanisms live here specifically because the agent loop calls this
// periodically and unattended: a minimum-interval rate limiter (so a fast loop can't burn
// through a free-tier quota) and a short-TTL cache keyed by the input content (so repeated
// loop iterations with unchanged drift don't re-call the API at all).
import crypto from "node:crypto";
import { noopTimer } from "./timing.js";

const PROVIDER = process.env.LLM_PROVIDER || "gemini";
const MODEL = process.env.LLM_MODEL || "gemini-3.1-flash-lite";
const MIN_INTERVAL_MS = Number(process.env.LLM_MIN_INTERVAL_MS || 4000); // self-imposed floor, well under 15 RPM
const CACHE_TTL_MS = Number(process.env.LLM_CACHE_TTL_MS || 5 * 60 * 1000);

const cache = new Map(); // key -> { text, expiresAt }
const inFlight = new Map(); // key -> Promise<{text, source, error}>, for requests racing the same input
let lastCallAt = 0;

function cacheKey(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.text;
  if (entry) cache.delete(key);
  return null;
}

async function callGemini({ systemPrompt, userPrompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in .env");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
    }),
  });

  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error (HTTP ${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response missing text: " + JSON.stringify(json).slice(0, 300));
  }
  return text.trim();
}

const PROVIDERS = { gemini: callGemini };

/// input: any JSON-serializable object identifying this exact request, used for caching.
/// Returns { text: string|null, source: "llm" | "cache" | "fallback", error?: string }.
export async function generateProposalText({ systemPrompt, userPrompt, input, timer = noopTimer() }) {
  const key = cacheKey({ provider: PROVIDER, model: MODEL, systemPrompt, userPrompt, input });

  const cached = getCached(key);
  if (cached !== null) {
    return { text: cached, source: "cache" };
  }

  // The bug this fixes, confirmed live: two visitors loading the page ~12ms apart both
  // compute the same proposal and both call this with the same input. Without this, the
  // first call passes the rate gate and starts a real Gemini request; the second arrives
  // before the first has finished (and therefore before its result is cached), sees
  // "last call was 12ms ago," and falls back to templated text — even though the identical
  // real explanation was already on its way. Sharing the in-flight promise means the second
  // caller waits for and gets the same real result instead of needlessly falling back.
  const existingCall = inFlight.get(key);
  if (existingCall) {
    return existingCall;
  }

  const callPromise = (async () => {
    const sinceLastCall = Date.now() - lastCallAt;
    if (sinceLastCall < MIN_INTERVAL_MS) {
      return {
        text: null,
        source: "fallback",
        error: `Self-imposed rate limit: last call was ${sinceLastCall}ms ago, minimum interval is ${MIN_INTERVAL_MS}ms`,
      };
    }

    const call = PROVIDERS[PROVIDER];
    if (!call) {
      return { text: null, source: "fallback", error: `Unknown LLM_PROVIDER "${PROVIDER}"` };
    }

    lastCallAt = Date.now();
    try {
      const text = await timer.time("llm:call", () => call({ systemPrompt, userPrompt }));
      cache.set(key, { text, expiresAt: Date.now() + CACHE_TTL_MS });
      return { text, source: "llm" };
    } catch (err) {
      return { text: null, source: "fallback", error: err.message };
    }
  })();

  inFlight.set(key, callPromise);
  try {
    return await callPromise;
  } finally {
    inFlight.delete(key);
  }
}
