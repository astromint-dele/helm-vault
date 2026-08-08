// Phase 0, Script 2: get live OKX DEX Aggregator quotes on X Layer for
// USDG -> NVDAx ($100, $500) and USDG -> xBTC ($100).
// Requires output/all-tokens-chain196.json from script 1 (run `npm run list-tokens` first).
//
// NVDAx is NOT in OKX's curated all-tokens list (that list is only 21 tokens, a picker-UI
// subset). Its real address came from Backed Finance's public asset registry
// (api.backed.fi/api/v2/public/assets), cross-checked on-chain via eth_call to decimals()
// on X Layer's RPC. Backed lists two addresses per asset: a raw one and a `wrapperAddressV2`.
// The wrapper is the AMM-liquid, swappable version (matches the USDG -> wNVDAx -> NVDAx route
// found during manual research), so we test both to confirm which one the aggregator can route.
import "dotenv/config";
import fs from "node:fs";
import { okxGet, toBaseUnits } from "../lib/okxClient.js";

const CHAIN_INDEX = "196"; // X Layer

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function findToken(tokens, symbol) {
  const match = tokens.find(
    (t) => (pick(t, ["tokenSymbol", "symbol"]) || "").toLowerCase() === symbol.toLowerCase()
  );
  if (!match) {
    throw new Error(`Could not find token "${symbol}" in output/all-tokens-chain196.json`);
  }
  return {
    symbol: pick(match, ["tokenSymbol", "symbol"]),
    address: pick(match, ["tokenContractAddress", "tokenAddress", "address"]),
    decimals: Number(pick(match, ["decimals"])),
  };
}

let raw;
try {
  raw = fs.readFileSync("output/all-tokens-chain196.json", "utf8");
} catch {
  console.error('\nMissing output/all-tokens-chain196.json. Run "npm run list-tokens" first.');
  process.exit(1);
}
const tokens = JSON.parse(raw).data;

const USDG = findToken(tokens, "USDG");
const xBTC = findToken(tokens, "xBTC");
const NVDAx_raw = { symbol: "NVDAx (raw)", address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", decimals: 18 };
const wNVDAx = { symbol: "wNVDAx (wrapper)", address: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5", decimals: 18 };

console.log("\nResolved tokens:");
console.table({ USDG, xBTC, NVDAx_raw, wNVDAx });

async function getQuote(label, fromToken, toToken, humanAmount) {
  const amount = toBaseUnits(humanAmount, fromToken.decimals);
  const res = await okxGet(`/api/v6/dex/aggregator/quote`, {
    chainIndex: CHAIN_INDEX,
    fromTokenAddress: fromToken.address,
    toTokenAddress: toToken.address,
    amount,
    slippagePercent: "0.5",
  });

  const quote = Array.isArray(res.data) ? res.data[0] : res.data;
  const result = {
    label,
    fromAmount: `${humanAmount} ${fromToken.symbol}`,
    toAmount: quote ? pick(quote, ["toTokenAmount", "toAmount"]) : undefined,
    priceImpact: quote
      ? pick(quote, ["priceImpactPercentage", "estimatePriceImpactPercentage"])
      : undefined,
  };

  console.log(`\n--- ${label} ---`);
  console.log(result);
  if (quote) {
    const route = pick(quote, ["dexRouterList", "quoteCompareList"]);
    if (route) console.log("Route:", JSON.stringify(route, null, 2));
  } else {
    console.log("Full raw response (no quote data found — inspect field names):");
    console.log(JSON.stringify(res, null, 2));
  }

  return { label, request: { fromToken, toToken, humanAmount, amount }, response: res };
}

const results = [];
results.push(await getQuote("USDG -> NVDAx raw ($100)", USDG, NVDAx_raw, 100));
results.push(await getQuote("USDG -> wNVDAx wrapper ($100)", USDG, wNVDAx, 100));
results.push(await getQuote("USDG -> wNVDAx wrapper ($500)", USDG, wNVDAx, 500));
results.push(await getQuote("USDG -> xBTC ($100)", USDG, xBTC, 100));

fs.mkdirSync("output", { recursive: true });
fs.writeFileSync("output/quotes.json", JSON.stringify(results, null, 2));
console.log("\nSaved full quote results to output/quotes.json");
