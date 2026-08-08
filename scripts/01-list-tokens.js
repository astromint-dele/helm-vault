// Phase 0, Script 1: query OKX DEX Aggregator all-tokens for X Layer (chainIndex 196),
// filter for xStock-like tickers (end in "x") plus xBTC, print a table, save raw + filtered JSON.
import "dotenv/config";
import fs from "node:fs";
import { okxGet } from "../lib/okxClient.js";

const CHAIN_INDEX = "196"; // X Layer

function isTarget(symbol) {
  const s = (symbol || "").toLowerCase();
  return s.endsWith("x") || s === "xbtc";
}

// The API's exact field names aren't fully documented publicly, so we check a few
// likely variants defensively instead of assuming one.
function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

const res = await okxGet(`/api/v6/dex/aggregator/all-tokens`, { chainIndex: CHAIN_INDEX });

const tokens = res.data;
if (!Array.isArray(tokens) || tokens.length === 0) {
  console.error("\nNo tokens returned — see the error above, or inspect the full response below:");
  console.error(JSON.stringify(res, null, 2));
  process.exit(1);
}

console.log(`\nTotal tokens on chainIndex ${CHAIN_INDEX}: ${tokens.length}`);
console.log("\nSample token object (so we can confirm field names):");
console.log(JSON.stringify(tokens[0], null, 2));

const targets = tokens
  .map((t) => ({
    symbol: pick(t, ["tokenSymbol", "symbol"]),
    name: pick(t, ["tokenName", "name"]),
    address: pick(t, ["tokenContractAddress", "tokenAddress", "address"]),
    decimals: pick(t, ["decimals"]),
  }))
  .filter((t) => isTarget(t.symbol));

console.log(`\nxStock-like tokens + xBTC found: ${targets.length}\n`);
console.table(targets);

fs.mkdirSync("output", { recursive: true });
fs.writeFileSync("output/all-tokens-chain196.json", JSON.stringify(res, null, 2));
fs.writeFileSync("output/target-tokens.json", JSON.stringify(targets, null, 2));

console.log("\nSaved full response to output/all-tokens-chain196.json");
console.log("Saved filtered target tokens to output/target-tokens.json");
