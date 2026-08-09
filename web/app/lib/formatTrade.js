// Shared by ProposalPanel and RefusedPanel — was previously duplicated in both with the
// same bug: when fromSymbol is cash, spending it to acquire an asset is a *buy* of that
// asset, not a "sell" of the cash. Only true sells (asset -> cash, or asset -> asset) use
// "sell" language. Returns a lowercase phrase with no trailing punctuation; callers embed
// it into their own sentence (a standalone capitalized headline vs. "Would have {phrase}").
export function describeTrade(trade) {
  const fromIsCash = trade.fromSymbol === "USDG";
  const toIsCash = trade.toSymbol === "USDG";
  if (fromIsCash) {
    return `buy ${trade.toSymbol} with $${trade.amountHuman.toFixed(2)} cash`;
  }
  if (toIsCash) {
    return `sell ${trade.amountHuman.toFixed(6)} ${trade.fromSymbol} for cash`;
  }
  return `sell ${trade.amountHuman.toFixed(6)} ${trade.fromSymbol} for ${trade.toSymbol}`;
}
