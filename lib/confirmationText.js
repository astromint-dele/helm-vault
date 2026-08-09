// Reports what just happened, in Helm's first-person voice, after a real successful trade.
// Deterministic, not LLM-generated: this is a statement of fact (what executed, what the
// resulting position is, the transaction hash), not an explanation of a decision, so it
// doesn't need Gemini's flexible phrasing and must never be at risk of falling back to
// vaguer text at the one moment precision matters most.
import { ethers } from "ethers";

export function buildTradeConfirmation({ fromSymbol, toSymbol, amountInHuman, toDecimals, amountOutRaw, priorToBalance, txHash }) {
  const amountOutHuman = Number(ethers.formatUnits(amountOutRaw, toDecimals));
  const resultingBalance = priorToBalance + amountOutHuman;
  const fromIsCash = fromSymbol === "USDG";

  const action = fromIsCash
    ? `I bought ${toSymbol} using $${amountInHuman.toFixed(2)} cash.`
    : `I sold ${amountInHuman.toFixed(6)} ${fromSymbol} for ${toSymbol}.`;

  return (
    `${action} Your ${toSymbol} position is now about ${resultingBalance.toFixed(6)} ${toSymbol}. ` +
    `Transaction ${txHash}.`
  );
}
