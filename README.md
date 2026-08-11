# Helm

Helm will refuse to execute a trade it cannot verify is fairly priced, even when nothing
else is stopping it from going ahead. That refusal, not the portfolio it manages, is the
actual subject of this project.

Helm is an AI agent given real money to operate, a funded vault of tokenized US equities
on X Layer, under a constraint model rather than free rein. It proposes rebalancing
trades and phrases them in plain English, but it cannot decide to trade something outside
an onchain allowlist, cannot exceed onchain size and holding limits, and cannot execute
anything until a human signs and the trade's price has been checked against the real
market. Rebalancing is the task that exercises this loop day to day. The price fairness
refusal is what proves the constraint actually holds under real conditions, not just in
the code that describes it.

## Live

- Vault interface, [helmfi-agent.vercel.app](https://helmfi-agent.vercel.app)
- Vault contract on X Layer's explorer, [0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b](https://www.oklink.com/x-layer/address/0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b)
- X, [@helm_vault](https://x.com/helm_vault)
- Repo, [github.com/astromint-dele/helm-vault](https://github.com/astromint-dele/helm-vault)

## How it works

1. Read the vault's real onchain holdings and policy. Balance and allowance reads that
   drive a decision are cross-checked across two independent X Layer RPC endpoints before
   the agent trusts them, not read once and assumed correct.
2. Compute drift against the target allocation and the trade that would correct it. This
   is deterministic code (`decideRebalanceAction` in `lib/rebalanceProposal.js`), unit
   tested in isolation. It runs whether or not the LLM is available.
3. Check the proposed trade's price against the real market. NAV Sentinel compares the
   onchain quote to the real underlying equity price. A trade the agent cannot confirm is
   fairly priced is blocked here, before a human ever sees an approve button for it.
4. An LLM (`gemini-3.1-flash-lite`, provider agnostic) writes a plain English explanation
   of the trade already decided in steps 2 and 3. It has no path to change what is being
   proposed. If the LLM is unavailable, a deterministic templated fallback still produces
   a complete, accurate proposal, tested against real failures rather than assumed to
   work.
5. The vault owner reviews and signs. The signature is verified server side against a
   fresh signed message, and the trade itself is re-derived from a fresh onchain read at
   that moment, not trusted from whatever the browser last displayed.
6. Execution happens only through the contract's own checks, which do not depend on or
   trust the agent's judgment about what is allowed.

`[ARCHITECTURE DIAGRAM PLACEHOLDER]`

## What is enforced onchain versus computed off chain

Enforced onchain, inside `PolicyVault.sol`, checked by the contract itself before
`executeTrade` can run.

- **Token allowlist.** Only tokens explicitly added to the vault's policy can be traded.
- **Per trade size caps.**
- **Per asset holding caps, in raw token units.** Not a percentage of portfolio value.
  See Limitations for why.
- **Allocation completeness.** `totalTargetBps` must sum to exactly 10000 across every
  allowlisted token. `executeTrade` hard reverts otherwise, meaning the agent cannot
  execute a single trade against a partially configured policy. Proven by
  `PolicyVault.test.js`'s target allocation completeness tests, not just described.

Computed off chain, by the agent, not enforced by the contract.

- How far the portfolio has drifted from target and which trade would correct it.
- Trade sizing.
- Whether the proposed price is fair. NAV Sentinel's result gates whether the agent will
  propose the trade at all, but the contract itself has no price awareness and cannot
  independently confirm fairness.

The contract does not know what any asset is worth and cannot, without an oracle. What it
enforces is which assets can move, how much of them, and that the policy governing them is
a complete one before anything moves at all.

## Verified results

**Vault (current, mainnet), deployment #5.**
[`0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b`](https://www.oklink.com/x-layer/address/0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b)

| Transaction | What it proves | Gas |
|---|---|---|
| [Deployment](https://www.oklink.com/x-layer/tx/0x1e0bb6ce84474b0c5ba2b86fdb6b31914b6b6115d08d6f09694d30f6a6204273) | The live policy, 4 assets with targets summing to exactly 10000 bps, is on chain. Confirmed by reading `totalTargetBps` fresh from chain, not from script output. | 1,284,348 gas at 0.07 gwei, 0.0000899 OKB |
| [Deposit](https://www.oklink.com/x-layer/tx/0xe363788cee4b26bb30094590e7968219edc9b615679ab039e7f47df53fb43e1d) | $5.08 USDG deposited, consolidated from the prior vault plus a converted wNVDAx position. | 71,637 gas at 0.02 gwei, 0.00000143 OKB |
| [First agent trade, USDG to NVDAx](https://www.oklink.com/x-layer/tx/0xe2d4c1bb01dacd53640b6d48e9e72e81100806f928b703cee643511ede01e6d7) | The full loop end to end under the corrected policy. Real onchain read, real deterministic decision, real signed approval, real execution. | 399,110 gas at 0.02 gwei, 0.00000798 OKB |
| [Second agent trade, USDG to SPYx](https://www.oklink.com/x-layer/tx/0xfe44baf20d398f72ddbec1d646c60139f015c57c7bbe2aabf48c2e8780b76af0) | Run against the code's default vault address with no environment override, proving the deployed pipeline picks up the live vault correctly rather than only working against a hand configured one. | 418,118 gas at 0.02 gwei, 0.00000836 OKB |

Every gas figure above was read directly from that transaction's own receipt on X Layer's
RPC, not estimated. At X Layer's typical gas price, every transaction in this project cost
a fraction of a cent.

**Liquidity.** The project's own gate was a $500 USDG to NVDAx quote showing 3% price
impact or better before any contract code got written. All five tickers this vault can
hold or trade were verified against OKX's DEX Aggregator at both $100 and $500, real
quotes, not estimates (`output/quotes.json`, `output/liquidity-verification.json`).

| Ticker | $100 impact | $500 impact |
|---|---|---|
| NVDAx | -0.09% | -0.09% |
| TSLAx | -0.10% | -0.10% |
| AAPLx | -0.16% | -0.23% |
| SPYx | -0.02% | -0.06% |
| MSFTx | +0.05% | -0.01% |

Every figure well inside the 3% gate, at both sizes, for every ticker.

**Observed price tracking**, from NAV Sentinel run against real market conditions, not
synthetic ones.

- Warn, real and unforced. Run during an actual weekend. Onchain wNVDAx price $227.19
  against NVDA's real last close $223.96, a 1.44% deviation, under the 2% warn threshold
  on the deviation alone. Correctly flagged warn anyway, because a closed market makes the
  reference price a stale last close rather than a live one.
- Block, threshold forced low to exercise the path, the deviation itself real. With the
  block threshold set to 0.5%, a real 1.85% deviation correctly triggered block. The
  approval prompt never appeared and no trade executed, confirmed by the process exiting
  cleanly with no execute prompt in the output.

## The Uniswap V4 finding

OKX's own DEX Aggregator API reports every X Layer route through this liquidity as
`"dexName": "Uniswap V3"` in the `dexProtocol` field of its quote and swap responses. That
label does not match what actually executes on chain.

Verified directly from real transaction receipt logs, not inferred from the API or from
documentation. Uniswap V3's `Swap` event and Uniswap V4's `Swap` event have different
argument shapes, `Swap(address,address,int256,int256,uint160,uint128,int24)` for V3 versus
`Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)` for V4. Computing the
keccak event signature hash for both and grepping the actual logs of two real mainnet swap
transactions
([`0x937149fd...e02b`](https://www.oklink.com/x-layer/tx/0x937149fd6cee69a81aa70c87689a1d425d12a655c1659de7ecf83e373746e02b),
[`0x576c8f38...3305`](https://www.oklink.com/x-layer/tx/0x576c8f387b113a42c001963cf1ab4bea109feb78702825d7b972f1bfe7a43305))
returned zero matches for the V3 signature across either transaction. Every matching log
in both matched the V4 signature.

Both transactions' V4 logs were emitted from the same contract address despite trading
different token pairs.

```
0x360e68faccca8ca495c1b759fd9eee466db9fb32
```

That same address recurring across unrelated pairs, and appearing twice within one
transaction's multi hop route, is the fingerprint of a PoolManager singleton. Uniswap V3
would instead show a different, pair specific pool contract each time. This matches Dune's
own decoded table name for X Layer, `uniswap_v4_xlayer.poolmanager_evt_swap`.

This is the least replicable finding in this project. It required pulling raw transaction
logs and independently computing event topic hashes rather than reading any dashboard or
documentation, and it contradicts what OKX's own API field reports.

This is one of three integration findings recorded in full in
[FINDINGS.md](./FINDINGS.md), alongside a contract approval gotcha that broke this
project's first real mainnet trade attempt, and an X Layer RPC reliability issue that
shaped how every decision-driving read in this project works.

## Limitations

Stated plainly because a judge who reads honest limits trusts the rest of this more, not
less.

- **One vault, one owner, hardcoded.** Every visitor to the live site sees the same vault
  and the same owner's holdings.
- **No user created vaults.** Deploying a new vault today means editing a config constant
  and redeploying, not a flow a visitor can trigger themselves.
- **No natural language policy.** The instruct box in the interface is a real UI element
  with no backend behind it yet. It does not parse an instruction or change the vault's
  policy.
- **No percentage of portfolio value caps enforced onchain.** Per asset caps are raw
  token unit ceilings. A live NAV Sentinel price feed exists, but only off chain, for
  fairness checking. Making a percentage cap enforceable onchain means the contract has to
  trust a price source, either a real oracle or an agent pushed price with its own
  signature and staleness checks. Both are real scope and a real trust decision, not a
  config change, and neither was taken on for this build.
- **No market holiday calendar.** NAV Sentinel's market open detection is weekday and
  clock time only. It will treat a market holiday as open.
- **Wallet support is limited to injected EIP-1193 wallets** such as MetaMask. No
  WalletConnect, no mobile deep linking.

## Roadmap

Scoped by what each actually requires, not a wishlist.

- **Vault factory for per user vaults.** A factory contract that deploys a fresh
  `PolicyVault` per user, with its own policy and owner, plus the frontend and API routes
  resolving the vault address from the connected wallet instead of one hardcoded constant.
  This is the largest remaining piece, a new contract plus a changed data flow through
  every route that currently assumes a single vault.
- **Watch mode for any wallet.** Point Helm's price fairness and drift view at any address
  a visitor connects, read only, no execution, since enforcement only exists where a
  `PolicyVault` contract exists to enforce it. Mostly a parameterized read path and
  frontend work, no new contract required, smaller than the vault factory.
- **Natural language policy.** Parsing a plain English instruction into a valid policy
  change, which assets, what targets, and confirming it sums to 100%, and deciding what
  the agent should refuse to parse rather than accept. This is a trust and validation
  problem before it is a parsing problem, since a misread instruction acting on real money
  is worse than the current fixed policy.
- **Marketplace listing.** Packaging and listing requirements external to this codebase.
  Deliberately not pursued yet, so the rate limit and reliability budget the vault itself
  depends on is not shared with a second, less controlled surface before the core loop was
  solid.

## Revenue model

Helm has a real, wired mechanism for earning a share of the volume it routes, through
OKX's Builder Code fee parameters on the swap endpoint
(`fromTokenReferrerWalletAddress` / `toTokenReferrerWalletAddress` and `feePercent`, see
`lib/swapBuilder.js`). Configured via `OKX_BUILDER_FEE_PERCENT` and
`OKX_BUILDER_REFERRER_ADDRESS`, capped by OKX at 3% on non-Solana chains, deducted from the
output side of the trade so the vault's own spend is unaffected. Not enabled on the live
demo vault today, since demo scale trades are not a meaningful test of fee capture, but the
mechanism is real and wired into every swap this project executes, not a plan for later.

## Setup and run

### Environment

1. `cp .env.example .env` at the repo root and fill in `OKX_API_KEY`, `OKX_SECRET_KEY`,
   `OKX_API_PASSPHRASE`, `OKX_PROJECT_ID`.
2. `cp contracts/.env.example contracts/.env`. `DEPLOYER_PRIVATE_KEY` and
   `AGENT_PRIVATE_KEY` are generated by `npm run generate-wallet` and
   `npm run generate-agent-wallet` inside `contracts/`, not typed in by hand.
3. Add `GEMINI_API_KEY` to `.env` (get one at aistudio.google.com/apikey) if you want real
   LLM phrasing rather than the deterministic fallback text.
4. `npm install` at the repo root, then `npm install` inside `web/` for the frontend.

### Phase 0 scripts, verify OKX gives the product what it needs

```
npm run list-tokens   # lists xStock-like tokens plus xBTC on X Layer
npm run quotes        # live quotes, needs list-tokens run first
```

### Agent loop

```
npm run agent-loop                      # real loop, real approval prompt, real execution
npm run test-agent-loop-approval        # single cycle, auto-answers the prompt, for testing
```

Configurable via `VAULT_ADDRESS`, `AGENT_LOOP_INTERVAL_MS`, `DRIFT_THRESHOLD_PCT`,
`AGENT_LOOP_MAX_CYCLES`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_CACHE_TTL_MS`,
`LLM_MIN_INTERVAL_MS`, `NAV_WARN_THRESHOLD_PCT`, `NAV_BLOCK_THRESHOLD_PCT`.

### Frontend

`web/` is a separate Next.js app inside this repo, reading `lib/*.js` directly rather than
reimplementing any of it, so drift math, trade sizing, and NAV Sentinel logic live in
exactly one place regardless of whether the caller is the CLI agent loop or the web app.

```
cd web && npm run dev
```

### Deploy to Vercel

GitHub repo and Vercel project name are allowed to differ and do here, repo is
`helm-vault`, Vercel project is `helmfi-agent`, since the deployed URL follows the Vercel
project name, not the repo name.

1. Set **Root Directory** to `web` in the Vercel project's settings.
2. Set every environment variable listed in `web/.env.example` under Project Settings then
   Environment Variables. The two `.env` files this app reads locally are both gitignored
   and never reach Vercel's filesystem, so production relies entirely on
   dashboard-configured variables.
3. Deploy, then set the production alias explicitly, since a CLI deploy does not
   auto-repoint a custom domain.

```
npx vercel --prod --yes
npx vercel alias set <the-new-deployment-url> helmfi-agent.vercel.app
```
