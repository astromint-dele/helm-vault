// Phase 0 follow-up: re-verify liquidity for TSLAx, AAPLx, SPYx, and MSFTx at both $100 and
// $500, the same sizes and methodology already used for NVDAx in script 02 (real quotes,
// same USDG -> token direction, raw xStock address, priceImpactPercent read straight off
// OKX's response). Quotes are free and non-committal, so this can be re-run any time to
// refresh the numbers the README cites.
import "dotenv/config";
import fs from "node:fs";
import { ethers } from "ethers";
import { okxGet, toBaseUnits } from "../lib/okxClient.js";
import backedAssets from "../lib/data/backed-xlayer-assets.json" with { type: "json" };

const CHAIN_INDEX = "196";
const USDG = { symbol: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", decimals: 6 };
const TICKERS = ["TSLAx", "AAPLx", "SPYx", "MSFTx"];
const SIZES = [100, 500];

async function resolveToken(symbol) {
  const match = backedAssets.find((a) => a.symbol === symbol);
  if (!match) throw new Error(`"${symbol}" not found in lib/data/backed-xlayer-assets.json`);
  const provider = new ethers.JsonRpcProvider("https://xlayerrpc.okx.com", 196);
  const erc20 = new ethers.Contract(match.xlayerAddress, ["function decimals() view returns (uint8)"], provider);
  const decimals = Number(await erc20.decimals());
  return { symbol, address: match.xlayerAddress, decimals };
}

async function getQuote(fromToken, toToken, humanAmount) {
  const amount = toBaseUnits(humanAmount, fromToken.decimals);
  const res = await okxGet("/api/v6/dex/aggregator/quote", {
    chainIndex: CHAIN_INDEX,
    fromTokenAddress: fromToken.address,
    toTokenAddress: toToken.address,
    amount,
    slippagePercent: "0.5",
  });
  const quote = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!quote) {
    return { symbol: toToken.symbol, humanAmount, error: res.msg || `code ${res.code}` };
  }
  return {
    symbol: toToken.symbol,
    humanAmount,
    toTokenAmount: quote.toTokenAmount,
    priceImpactPercent: Number(quote.priceImpactPercent),
    tokenUnitPrice: Number(quote.toToken.tokenUnitPrice),
  };
}

const results = [];
for (const symbol of TICKERS) {
  const token = await resolveToken(symbol);
  console.log(`\n${symbol} (${token.address}, ${token.decimals} decimals)`);
  for (const size of SIZES) {
    const result = await getQuote(USDG, token, size);
    results.push(result);
    if (result.error) {
      console.log(`  $${size}: FAILED (${result.error})`);
    } else {
      console.log(`  $${size}: priceImpactPercent ${result.priceImpactPercent}%, unit price $${result.tokenUnitPrice.toFixed(2)}`);
    }
  }
}

fs.mkdirSync("output", { recursive: true });
fs.writeFileSync("output/liquidity-verification.json", JSON.stringify(results, null, 2));
console.log("\nSaved to output/liquidity-verification.json");
