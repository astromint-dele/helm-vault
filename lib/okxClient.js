// Signs and sends requests to OKX's DEX Aggregator API (web3.okx.com, v6).
// Auth scheme: HMAC-SHA256 over "timestamp + method + requestPath + queryString",
// base64-encoded, sent as the OK-ACCESS-SIGN header alongside key/passphrase/project id.
import crypto from "node:crypto";
import { parseUnits } from "ethers";

const BASE_URL = "https://web3.okx.com";

function sign(timestamp, method, requestPath, queryString, secretKey) {
  const prehash = timestamp + method + requestPath + queryString;
  return crypto.createHmac("sha256", secretKey).update(prehash).digest("base64");
}

export async function okxGet(path, params = {}) {
  const { OKX_API_KEY, OKX_SECRET_KEY, OKX_API_PASSPHRASE, OKX_PROJECT_ID } = process.env;
  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_API_PASSPHRASE || !OKX_PROJECT_ID) {
    throw new Error(
      "Missing OKX credentials. Copy .env.example to .env and fill in OKX_API_KEY, OKX_SECRET_KEY, OKX_API_PASSPHRASE, OKX_PROJECT_ID."
    );
  }

  const query = new URLSearchParams(params).toString();
  const queryString = query ? `?${query}` : "";
  const timestamp = new Date().toISOString();
  const okSign = sign(timestamp, "GET", path, queryString, OKX_SECRET_KEY);

  const url = `${BASE_URL}${path}${queryString}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": OKX_API_KEY,
      "OK-ACCESS-SIGN": okSign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": OKX_API_PASSPHRASE,
      "OK-ACCESS-PROJECT": OKX_PROJECT_ID,
    },
  });

  const json = await res.json();
  if (!res.ok || json.code !== "0") {
    console.error(`\nOKX API returned an error (HTTP ${res.status}):`);
    console.error(JSON.stringify(json, null, 2));
  }
  return json;
}

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
