// Phase 4: compares the onchain xStock price against the real underlying equity price and
// classifies the deviation as ok/warn/block (or na, for assets with no underlying equity at
// all). This is the product's differentiator — OKX
// already owns "swap" and "earn"; this is the part that protects against trading a
// tokenized stock at a price that's drifted from what the real asset is actually worth,
// which matters most exactly when it's least visible: weekends and holidays, when US
// equity markets are closed and there's no real price discovery happening at all.
import { okxGet, toBaseUnits } from "./okxClient.js";

const BACKED_ASSETS_API = "https://api.backed.fi/api/v2/public/assets";
export const DEFAULT_WARN_THRESHOLD_PCT = Number(process.env.NAV_WARN_THRESHOLD_PCT || 2);
export const DEFAULT_BLOCK_THRESHOLD_PCT = Number(process.env.NAV_BLOCK_THRESHOLD_PCT || 5);

let backedAssetsCache = null; // fetched once per process, these don't change during a run

async function fetchAllBackedAssets() {
  if (backedAssetsCache) return backedAssetsCache;
  const all = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${BACKED_ASSETS_API}?page=${page}`);
    const data = await res.json();
    all.push(...(data.nodes || []));
    if (!data.page?.hasNextPage) break;
    page += 1;
    if (page > 20) break; // safety cap, matches Phase 0's script
  }
  backedAssetsCache = all;
  return all;
}

/// Resolves an xStock's real-world ticker (e.g. "NVDA" for wNVDAx) by matching its X Layer
/// address against Backed's own registry — not a hardcoded lookup table, so this keeps
/// working as more xStocks get added to the vault's allowlist without a code change.
export async function resolveUnderlyingSymbol(xstockAddress) {
  const assets = await fetchAllBackedAssets();
  const addrLower = xstockAddress.toLowerCase();
  const match = assets.find((a) =>
    (a.deployments || []).some(
      (d) =>
        d.network === "XLayer" &&
        (d.address?.toLowerCase() === addrLower || d.wrapperAddressV2?.toLowerCase() === addrLower)
    )
  );
  return match?.underlyingSymbol ?? null;
}

/// Real equity price via Yahoo Finance's unofficial chart endpoint (no API key — this is
/// the "free API" the brief calls for). Also determines whether US markets are open right
/// now, computed independently from wall-clock time in America/New_York rather than
/// trusting any single field in the response, since marketState isn't consistently present.
export async function getRealEquityPrice(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) {
    throw new Error(`Yahoo Finance request failed for ${symbol}: HTTP ${res.status}`);
  }
  const json = await res.json();
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) {
    throw new Error(`Yahoo Finance response missing price for ${symbol}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  const nowET = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const et = new Date(nowET);
  const day = et.getDay(); // 0 = Sunday, 6 = Saturday
  const minutesSinceMidnight = et.getHours() * 60 + et.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const isRegularHours = minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight <= 16 * 60;
  // Note: doesn't account for US market holidays (Thanksgiving, etc.) — a known, documented
  // gap, not a silent one. Good enough for weekday/weekend, the case called out in the brief.
  const isMarketOpen = isWeekday && isRegularHours;

  return {
    symbol,
    price: meta.regularMarketPrice,
    asOf: new Date(meta.regularMarketTime * 1000).toISOString(),
    isMarketOpen,
  };
}

async function getOnchainPriceUSDG(tokenAddress, usdgAddress) {
  const res = await okxGet("/api/v6/dex/aggregator/quote", {
    chainIndex: "196",
    fromTokenAddress: usdgAddress,
    toTokenAddress: tokenAddress,
    amount: toBaseUnits(10, 6), // small reference quote, same pattern as driftCalculator
    slippagePercent: "0.5",
  });
  // Same guard as driftCalculator.js's getPriceInUSDG, for the same reason: a failed OKX
  // call returns {msg, code} with no `data` at all, and accessing q.toToken on that crashes
  // with a confusing property-access error instead of a clear one.
  if (res.code !== "0" || !res.data) {
    throw new Error(`OKX quote failed for ${tokenAddress}: ${res.msg || "unknown error"} (code ${res.code})`);
  }
  const q = Array.isArray(res.data) ? res.data[0] : res.data;
  return Number(q.toToken.tokenUnitPrice);
}

/// Returns { status: "ok" | "warn" | "block" | "na", deviationPct, onchainPrice, realPrice,
/// isMarketOpen, underlyingSymbol, reason }. status is "block" when the deviation exceeds
/// blockThresholdPct, OR when price fairness couldn't be verified at all (see
/// checkPortfolioNav's catch); "warn" when deviation exceeds warnThresholdPct, OR whenever
/// the market is closed (even with low deviation — a fresh price simply doesn't exist to
/// compare against, which is itself a reason for caution, not a clean bill of health); "na"
/// when the asset has no underlying equity to check at all (e.g. xBTC), which is a
/// structural fact and not a caveat on a check that did run.
///
/// Threshold overrides (warnThresholdPct/blockThresholdPct) exist for demo purposes — the
/// interface exposes a way to reproduce the block state on demand for a recording, by
/// tightening the threshold rather than by faking the result. It's the same code path
/// either way: whether a real deviation crosses the default 5% or a demo run crosses a
/// tightened 0.1%, this function has no notion of "induced" vs "natural," so nothing
/// downstream (this function's return shape, or the UI that renders it) can tell the
/// difference or needs to.
export async function checkNavDeviation(xstockAddress, usdgAddress, options = {}) {
  const { warnThresholdPct = DEFAULT_WARN_THRESHOLD_PCT, blockThresholdPct = DEFAULT_BLOCK_THRESHOLD_PCT, symbolHint, onchainPriceUSDG } = options;

  const underlyingSymbol = await resolveUnderlyingSymbol(xstockAddress);
  if (!underlyingSymbol) {
    // Genuinely not a Backed xStock (e.g. xBTC is OKX's own wrapped BTC, not a tokenized
    // equity) — there is no underlying to compare against, which is a structural fact, not
    // a failure to verify. Must not read as "warn": that would imply a caveat on a price
    // check that doesn't apply here at all.
    return {
      status: "na",
      reason: `${symbolHint || xstockAddress} has no underlying equity in Backed's registry, so price-fairness verification does not apply.`,
    };
  }

  // driftCalculator already fetched (and convergence-checked) this exact onchain price for
  // its own drift math — reuse it instead of firing a second, identical OKX quote call.
  // Falls back to fetching directly only when no pre-computed price is supplied, so this
  // function still works standalone (e.g. if ever called outside checkPortfolioNav).
  const [real, onchainPrice] = await Promise.all([
    getRealEquityPrice(underlyingSymbol),
    onchainPriceUSDG != null ? Promise.resolve(onchainPriceUSDG) : getOnchainPriceUSDG(xstockAddress, usdgAddress),
  ]);

  const deviationPct = ((onchainPrice - real.price) / real.price) * 100;
  const absDeviation = Math.abs(deviationPct);

  let status = "ok";
  let reason = `Onchain price is within ${warnThresholdPct}% of ${underlyingSymbol}'s real price.`;
  if (absDeviation >= blockThresholdPct) {
    status = "block";
    reason = `Onchain price deviates ${deviationPct.toFixed(2)}% from ${underlyingSymbol}'s real price ($${real.price.toFixed(2)}), exceeding the ${blockThresholdPct}% block threshold.`;
  } else if (absDeviation >= warnThresholdPct) {
    status = "warn";
    reason = `Onchain price deviates ${deviationPct.toFixed(2)}% from ${underlyingSymbol}'s real price ($${real.price.toFixed(2)}), exceeding the ${warnThresholdPct}% warn threshold.`;
  } else if (!real.isMarketOpen) {
    status = "warn";
    reason = `${underlyingSymbol}'s market is currently closed (last price as of ${real.asOf}). Onchain trading continues, but there's no live price discovery to confirm fairness right now.`;
  }

  return {
    status,
    reason,
    deviationPct,
    onchainPrice,
    realPrice: real.price,
    realPriceAsOf: real.asOf,
    isMarketOpen: real.isMarketOpen,
    underlyingSymbol,
  };
}

const USDG_ADDRESS = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8";

/// Checks every non-cash holding in a portfolio (as returned by driftCalculator's
/// computeDrift) and returns a Map from token address -> nav check result. A failed
/// individual check (Yahoo down, OKX quote failed, etc.) degrades to "block" rather than
/// crashing the whole cycle or waving the trade through — an agent that can't confirm price
/// fairness must refuse, not proceed with a caveat.
export async function checkPortfolioNav(holdings, options = {}) {
  const results = new Map();
  await Promise.all(
    holdings
      .filter((h) => h.address.toLowerCase() !== USDG_ADDRESS.toLowerCase())
      .map(async (h) => {
        try {
          results.set(
            h.address,
            await checkNavDeviation(h.address, USDG_ADDRESS, { ...options, symbolHint: h.symbol, onchainPriceUSDG: h.priceUSDG })
          );
        } catch (err) {
          // An unverifiable price is refused, not waved through with a caveat: if fairness
          // can't be confirmed, that's the same as a bad spread for trade-blocking purposes.
          results.set(h.address, {
            status: "block",
            reason: `Price fairness could not be verified (${err.message}). Refusing to trade until it can be confirmed.`,
          });
        }
      })
  );

  // USDG is the vault's own cash position and is the base currency every reference quote is
  // priced against, so it has no independent price to compare against itself. That's a
  // structural fact, not a caveat, the same reasoning as xBTC's "na" above, so it gets the
  // same status rather than a technically-true but meaningless 0% spread.
  const usdgHolding = holdings.find((h) => h.address.toLowerCase() === USDG_ADDRESS.toLowerCase());
  if (usdgHolding) {
    results.set(usdgHolding.address, {
      status: "na",
      reason: "USDG is the vault's cash position and is quoted against itself, so price-fairness verification does not apply.",
    });
  }

  return results;
}
