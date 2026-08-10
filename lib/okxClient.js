// Signs and sends requests to OKX's DEX Aggregator API (web3.okx.com, v6).
// Auth scheme: HMAC-SHA256 over "timestamp + method + requestPath + queryString",
// base64-encoded, sent as the OK-ACCESS-SIGN header alongside key/passphrase/project id.
import crypto from "node:crypto";
import { parseUnits } from "ethers";

const BASE_URL = "https://web3.okx.com";
const OKX_RATE_LIMIT_CODE = "50011";
const MAX_ATTEMPTS = 3;

// The trial key is capped at 5 requests/second. A single /api/state request fans out
// several quote calls in parallel (drift pricing, previously NAV Sentinel too before it
// started reusing drift's price), which was bursting past that ceiling and coming back as
// code 50011 ("Too Many Requests") — a self-inflicted failure, not a real price problem.
const MAX_CALLS_PER_WINDOW = 4; // stay under the 5/s limit with margin
const WINDOW_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sign(timestamp, method, requestPath, queryString, secretKey) {
  const prehash = timestamp + method + requestPath + queryString;
  return crypto.createHmac("sha256", secretKey).update(prehash).digest("base64");
}

/// Builds an independent OKX client: its own credentials and, critically, its own pacing
/// gate. Two clients built from two different OKX projects are meant to have separate rate
/// budgets on OKX's side, but that only actually holds if our own in-process gate is
/// separate too — a single shared gate would throttle both together regardless of which
/// project each call belongs to, defeating the isolation. This is what lets the public
/// price-check endpoint (its own OKX project, see web/app/api/price-check/route.js) run
/// real traffic without any way to compete with the vault's own OKX call budget, even
/// within the same warm serverless instance.
///
/// credentials, if omitted or partially omitted, falls back field-by-field to
/// OKX_API_KEY/OKX_SECRET_KEY/OKX_API_PASSPHRASE/OKX_PROJECT_ID — this is what makes the
/// existing default export below behave exactly as it did before this was a factory.
export function createOkxClient(credentials = {}, { label = "okx" } = {}) {
  let recentCallTimes = []; // this client's own window, not shared with any other client

  async function paceCall() {
    const now = Date.now();
    recentCallTimes = recentCallTimes.filter((t) => now - t < WINDOW_MS);
    if (recentCallTimes.length >= MAX_CALLS_PER_WINDOW) {
      const waitMs = WINDOW_MS - (now - recentCallTimes[0]) + 20;
      await sleep(waitMs);
      return paceCall();
    }
    recentCallTimes.push(Date.now());
  }

  async function okxGet(path, params = {}) {
    const apiKey = credentials.apiKey ?? process.env.OKX_API_KEY;
    const secretKey = credentials.secretKey ?? process.env.OKX_SECRET_KEY;
    const passphrase = credentials.passphrase ?? process.env.OKX_API_PASSPHRASE;
    const projectId = credentials.projectId ?? process.env.OKX_PROJECT_ID;
    if (!apiKey || !secretKey || !passphrase || !projectId) {
      throw new Error(
        `Missing OKX credentials for the "${label}" client. Copy .env.example to .env and fill in the matching key, secret, passphrase, and project id.`
      );
    }

    const query = new URLSearchParams(params).toString();
    const queryString = query ? `?${query}` : "";
    const url = `${BASE_URL}${path}${queryString}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await paceCall();

      // Timestamp and signature are re-derived every attempt, not reused across retries —
      // OKX validates the timestamp's recency, so a signature computed before a backoff
      // sleep could be rejected as stale by the time it's actually sent.
      const timestamp = new Date().toISOString();
      const okSign = sign(timestamp, "GET", path, queryString, secretKey);

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "OK-ACCESS-KEY": apiKey,
          "OK-ACCESS-SIGN": okSign,
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": passphrase,
          "OK-ACCESS-PROJECT": projectId,
        },
      });

      const json = await res.json();
      const isRateLimited = res.status === 429 || json.code === OKX_RATE_LIMIT_CODE;
      if (isRateLimited && attempt < MAX_ATTEMPTS) {
        const backoffMs = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
        console.warn(
          `OKX rate limited (code ${json.code}) on ${path} [${label}], retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`
        );
        await sleep(backoffMs);
        continue;
      }

      if (!res.ok || json.code !== "0") {
        console.error(`\nOKX API returned an error (HTTP ${res.status}) [${label}]:`);
        console.error(JSON.stringify(json, null, 2));
      }
      return json;
    }
  }

  return { okxGet };
}

// The vault's own client: unchanged behavior from before this was a factory, reads
// OKX_API_KEY etc directly from process.env. Every existing caller (driftCalculator,
// navSentinel, swapBuilder) imports this and is unaffected by the refactor.
const defaultClient = createOkxClient({}, { label: "vault" });
export const okxGet = defaultClient.okxGet;

// Converts a human amount (e.g. 100 USDG, or a fractional amount like 0.00223 wNVDAx from
// a computed trade size) into the token's smallest unit. Uses ethers' parseUnits rather
// than naive BigInt(humanAmount) * 10n**decimals — that naive form throws on any
// non-integer input, which only ever showed up once a real fractional trade size (from
// rebalanceProposal's math, not a hand-picked test amount) reached this function.
export function toBaseUnits(humanAmount, decimals) {
  // JS float-to-string conversion can produce more apparent decimal digits than the
  // float actually meaningfully represents (confirmed: 0.0022306153204671416 stringified
  // to 19 digits against an 18-decimal token, which parseUnits correctly rejects). Round
  // to the token's actual precision first so this can't happen regardless of input.
  const rounded = Number(humanAmount).toFixed(decimals);
  return parseUnits(rounded, decimals).toString();
}
