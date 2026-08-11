"use client";

import { useState } from "react";

const EXAMPLES = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];

const VERDICT_LABEL = { ok: "Fair", warn: "Caution", block: "Unfair", na: "Not applicable" };

// The only thing on the site a visitor can use on something that isn't the vault, so this
// gets real visual weight rather than being another quiet panel row. Calls the isolated
// /api/price-check endpoint (its own OKX credentials, its own rate budget, see
// lib/okxClient.js's createOkxClient) — never the vault's own state.
export default function PublicPriceCheck({ xstockCount }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function runCheck(symbol) {
    const trimmed = symbol.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setNotConfigured(false);
    try {
      const res = await fetch(`/api/price-check?symbol=${encodeURIComponent(trimmed)}`);
      if (res.status === 503) {
        setNotConfigured(true);
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Could not check that symbol.");
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "Could not check that symbol.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runCheck(input);
  }

  function handleChip(symbol) {
    setInput(symbol);
    runCheck(symbol);
  }

  return (
    <div className="public-check">
      <p className="public-check-title">Check any xStock, not just our four</p>
      <p className="public-check-line">
        Real time, no wallet, no deposit. Works for any of the {xstockCount ?? "hundreds of"} xStocks on X
        Layer.
      </p>

      <form className="public-check-form" onSubmit={handleSubmit}>
        <input
          className="public-check-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a symbol, for example TSLAx"
        />
        <button className="btn-approve public-check-btn" type="submit" disabled={loading}>
          {loading ? "Checking" : "Check"}
        </button>
      </form>

      <div className="public-check-chips">
        {EXAMPLES.map((symbol) => (
          <button key={symbol} type="button" className="public-check-chip" onClick={() => handleChip(symbol)} disabled={loading}>
            {symbol}
          </button>
        ))}
      </div>

      {notConfigured && (
        <p className="public-check-note">
          This endpoint is built and live, it just needs its own OKX credentials that have not been
          provisioned yet.
        </p>
      )}

      {error && <div className="error-banner">{error}</div>}

      {result && (
        <div className="public-check-result">
          <div className="public-check-result-head">
            <p className="asset-name">{result.underlyingSymbol ? `${result.input} (${result.underlyingSymbol})` : result.input}</p>
            <p className={`public-check-verdict ${result.status}`}>{VERDICT_LABEL[result.status] || result.status}</p>
          </div>
          {result.status === "na" ? (
            <p className="fairness-reason">{result.reason}</p>
          ) : (
            <>
              <div className="refusal-figures public-check-figures">
                <div className="refusal-figure">
                  <p className="label">Onchain</p>
                  <p className="value mono">{result.onchainPrice?.toFixed(2)}</p>
                </div>
                <div className="refusal-figure">
                  <p className="label">Market</p>
                  <p className="value mono">{result.realPrice?.toFixed(2)}</p>
                </div>
                <div className="refusal-figure">
                  <p className="label">Spread</p>
                  <p className={`value mono ${result.status !== "ok" ? "hot" : ""}`}>
                    {result.deviationPct > 0 ? "+" : "−"}
                    {Math.abs(result.deviationPct).toFixed(2)}%
                  </p>
                </div>
              </div>
              <p className="fairness-reason">{result.reason}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
