# Helm

AI portfolio desk for tokenized assets on X Layer. Built for OKX X Layer "BuildX AI Season".
Handle: [@helmfi](https://x.com/helmfi).

## Phase 0 — Verify

Before any product code, confirm the OKX DEX Aggregator API actually gives us what the
product needs on X Layer (chainIndex 196): the xStock token list, and swap quotes with
acceptable price impact.

### Setup

1. `cp .env.example .env` (or copy it manually on Windows)
2. Fill in `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_API_PASSPHRASE`, `OKX_PROJECT_ID` in `.env`
3. `npm install` (already done if you're reading this after scaffolding)

### Run

```
npm run list-tokens   # Script 1: lists all xStock-like tokens + xBTC on X Layer
npm run quotes        # Script 2: gets live quotes, needs list-tokens run first
```

Output is printed to the console and saved as JSON under `output/` (gitignored).

### Gate

The $500 USDG -> NVDAx quote must show price impact of 3% or less. If it doesn't, we
stop and rethink before writing any contract code.

**Result:** passed, with -0.09% impact at $500. Backed Finance's public registry
(`api.backed.fi/api/v2/public/assets`) also revealed 641 xStocks deployed on X Layer —
far more than OKX's own curated 21-token picker list suggests. NVDAx, TSLAx, AAPLx, SPYx,
and MSFTx were all spot-checked with real quotes and confirmed liquid (sub-0.3% impact
at $500). Full details in `contracts/` below.

## Phase 1/2 — Policy Vault contract + swap execution

`contracts/` holds the Solidity contract (`PolicyVault.sol`) and the agent-side swap
scripts. Deployed and proven end-to-end on X Layer mainnet with real funds: deposit,
constrained swap via OKX's DEX Aggregator, and withdraw all verified independently
on-chain, not just via script output.

### Integration gotcha: OKX uses two different contract addresses per swap

This cost real debugging time against real money, so it's recorded here rather than
just fixed and forgotten. OKX's DEX Aggregator v6 API returns **two separate addresses**
for every swap, and using the wrong one for the wrong purpose fails silently (the
transaction reverts with an opaque custom error, not a clear message):

- **`tx.to`** (from the `/swap` endpoint) — the contract that actually **executes** the
  swap. This is what you call.
- **`dexContractAddress`** (from the separate `/approve-transaction` endpoint) — the
  contract that actually **holds the ERC20 allowance**. This is what you approve.

They are not the same address. Approving `tx.to` (the natural-seeming choice, since
it's the one you're about to call) looks correct, compiles fine, and fails every time —
confirmed by testing both a direct EOA call and a smart-contract call, both of which
failed identically until the fix. `PolicyVault.executeTrade` takes `approveTarget` and
`swapTarget` as two explicit, separate parameters specifically because of this, and
`lib/swapBuilder.js` calls both OKX endpoints to resolve them correctly. There's a test
(`PolicyVault.test.js`, "approves approveTarget, not swapTarget...") that fails if this
regresses.

### Correction: X Layer liquidity is Uniswap V4, not V3

OKX's own DEX Aggregator API labels these routes `"dexName": "Uniswap V3"` in the
`dexProtocol` field of every quote/swap response. That label is wrong, or at least stale,
for X Layer. Verified directly from real transaction receipt logs, not inferred from the
API: computed both the Uniswap V3 (`Swap(address,address,int256,int256,uint160,uint128,int24)`)
and V4 (`Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)`) event
signature hashes and grepped the actual logs of both real mainnet swap transactions
(`0x937149fd...e02b` and `0x576c8f38...3305`). Zero logs matched the V3 signature across
either transaction. Both matched the V4 signature, emitted from the same contract address
in both cases despite trading different token pairs:

```
0x360e68faccca8ca495c1b759fd9eee466db9fb32
```

The same address recurring across unrelated pairs (and appearing twice in the second
transaction's multi-hop route) is the fingerprint of a PoolManager **singleton** — V3
would instead show a different, pair-specific pool contract each time. This matches Dune's
decoded table name for X Layer, `uniswap_v4_xlayer.poolmanager_evt_swap`. Any future
integration work (or write-up) that assumes V3-style per-pool contracts on X Layer is
working from a wrong premise sourced from OKX's own mislabeled API field.

### Design note: RPC reliability as a product concern, not a scripting annoyance

Over the course of building and testing this, the same X Layer RPC endpoint
(`xlayerrpc.okx.com`) returned stale or wrong data three separate times on plain reads:
a folder rename that silently failed then succeeded on retry, a token balance read that
showed 0 immediately after a confirmed transfer then showed the correct amount moments
later, and a gas estimate for a deployment that was ~1000x the real cost on one call and
correct on an identical retry. None of these were network congestion or actual state
changes — they were bad reads from what is presumably a load-balanced RPC behind that
hostname, where different backend nodes gave different answers to the same query.

This matters beyond debugging: **the Phase 3 agent loop reads balances, prices, and
allowances and then acts on them autonomously.** An agent that reads a stale balance and
proposes or executes a trade based on it is a real failure mode, not a hypothetical one —
this session hit the underlying cause three times in the course of one afternoon. Phase 3
must retry and cross-check (e.g. against a second RPC endpoint, or two consecutive reads
converging) any read that drives a decision, before the agent acts on it. This is a
design requirement, not an optimization to consider later.

### Record: mainnet contract and transactions

**Vault (current, mainnet): `0x03ceDFA7dd7E7274882fffE52d6f1a164F563d0b`** (deployment #5 —
see "Policy correction" below for why #4 was superseded).

- Deployment: `0x1e0bb6ce84474b0c5ba2b86fdb6b31914b6b6115d08d6f09694d30f6a6204273`
- Configured 4-asset policy, `totalTargetBps` confirmed `10000` fresh from chain (not script output)
- Deposit ($5.08 USDG, consolidated from the prior vault + a converted wNVDAx position): `0xe363788cee4b26bb30094590e7968219edc9b615679ab039e7f47df53fb43e1d`
- First agent-executed trade under the corrected policy (USDG → real NVDAx): `0xe2d4c1bb01dacd53640b6d48e9e72e81100806f928b703cee643511ede01e6d7`
- Second agent-executed trade (USDG → SPYx), run using the code's default vault address with no env override, confirming the whole pipeline picks up the new vault correctly: `0xfe44baf20d398f72ddbec1d646c60139f015c57c7bbe2aabf48c2e8780b76af0`

**Prior deployments (superseded, not the live contract):**
- `0x6bD23c1a2d2f4165aBC981eF773A75fd96124522` (#4) — Phase 2 constrained swap ($5 USDG → wNVDAx): `0x937149fd6cee69a81aa70c87689a1d425d12a655c1659de7ecf83e373746e02b`; withdraw: `0x9d2b1aa0150328a2a6228bd682663ffad7bc48249ecf5ced6957e5746d2f106e`; Phase 3 agent-executed rebalance: `0x576c8f387b113a42c001963cf1ab4bea109feb78702825d7b972f1bfe7a43305`; Phase 4 NAV-Sentinel-aware rebalance (warn, allowed through): `0x01863e2f82add59d3153290b8c8cb3ccd4f2d8d3216d8061569eadfef65461ff`
- 3 earlier deployments during Phase 2 debugging (revert-bubbling fix, then `approveTarget` fix)

### Policy correction (post-Phase 4)

Two things were flagged as unfixed across earlier wrap-ups and are corrected now, before
Phase 5's frontend displays them:

**1. Target allocations previously summed to 35%, not 100%** (20% USDG + 15% wNVDAx, with
65% silently unaccounted for — a 2-asset placeholder config from early testing, never
corrected before Phase 4). Fixed two ways:
- The vault now allowlists 4 assets with targets summing to exactly 100%: **USDG 40% (cash),
  NVDAx 25% (equity), SPYx 20% (index), xBTC 15% (crypto)** — not the originally-planned 6
  (AAPLx/MSFTx omitted); at this vault's demo-scale balance, 6 targets would put multiple
  positions under $1, which demos badly and doesn't prove anything more than 4 does.
- `PolicyVault.sol` now tracks `totalTargetBps` as a running sum across every allowlisted
  token (updated by both `setPolicy` and `setTokenAllowed`), and **`executeTrade` hard-reverts
  unless `totalTargetBps == 10_000`** — the agent cannot execute any trade at all against a
  partially-configured policy. This is a real on-chain guarantee, not a display convention;
  see `PolicyVault.test.js`, "target allocation completeness" (5 tests) for proof, including
  that disallowing a token correctly clears its contribution rather than leaving the total
  permanently stuck below 100%.

Also switched from `wNVDAx` to raw `NVDAx` (and raw `SPYx` over its wrapper) as the asset the
vault actually holds. The wrap/unwrap hop happens entirely inside OKX's single returned
swap calldata — `executeTrade` makes exactly one external call either way, so there's no
added complexity or cost on the contract's side, and Phase 0's own data showed the raw-token
route delivering a *slightly better* output than the wrapper-only route at the same size.
Raw NVDAx/SPYx are also the actual, recognizable asset names, matching both Backed's
branding and this project's own portfolio-design language, rather than an OKX-routing
implementation detail.

**2. Per-asset caps (`maxHoldingAmount`) are still raw token-unit ceilings, not a live
percentage of portfolio value — deliberately, not by oversight.** Phase 4 built a live price
feed (NAV Sentinel), but it exists off-chain, for price-*fairness* checking only. Wiring it
into the contract's cap enforcement would mean the contract trusting an agent-pushed price,
reopening a trust/security question deliberately not taken on for this build (more scope and
risk than a hackathon judge sees, for a capability the frontend doesn't exist to display
yet). Accurate description of what's actually enforced onchain today: **token allowlist,
per-trade size caps, per-asset raw-token-unit holding caps, and target-allocation
completeness (sum-to-100%) are all enforced onchain. Allocation drift and trade sizing are
computed off-chain by the agent**, using live balances and live prices it reads itself — the
contract doesn't (and structurally can't, without an oracle) know what any asset is worth.
See Roadmap below for live percentage-of-value enforcement as a named next step, not an
implied current one.

## Phase 3 — Agent loop

`lib/reliableRpc.js`, `lib/driftCalculator.js`, `lib/rebalanceProposal.js`,
`lib/llmClient.js`, `lib/executeTrade.js`, and `scripts/agent-loop.js`. On each cycle: read
the vault's real on-chain holdings and policy (via `reliableRpc`, cross-checked across two
independent RPC endpoints), compute drift against target allocation, get a plain-English
proposal, and require a typed "yes" at the terminal before executing anything.

Trade direction and sizing are deterministic (`rebalanceProposal.js`'s
`decideRebalanceAction`, unit-tested in isolation) — the LLM (`gemini-3.1-flash-lite`,
provider-agnostic via `LLM_PROVIDER`) only ever phrases an already-decided proposal, never
decides one. If the LLM is unavailable (rate limited, network error, wrong/deprecated
model), the agent still produces a complete proposal from a templated fallback — tested
with real failures, not just written and assumed to work: first a missing API key, then a
live 404 from a model (`gemini-2.5-flash-lite`) that turned out to be deprecated for new
API keys despite still appearing in the model list.

**Rate-limit soak test:** ran 10 real cycles at 20-second intervals with caching
deliberately disabled, forcing a fresh Gemini call every cycle — tighter than production's
default 2-minute cadence will ever be. Zero 429s, zero crashes, all 10 explanations
accurate to the real numbers.

**Two real bugs found and fixed by testing against a real, organically-computed trade
amount instead of only hand-picked round numbers** ($5, $20, $100 never exercised either
path):
1. `reliableRead` returns a string (needed to compare values across RPC endpoints), but
   was once compared directly against `0n` (BigInt) to check the vault's "0 means
   unlimited" `maxTradeSize` convention. `"0" === 0n` is always `false` in JS, so the check
   silently failed and capped a real trade at zero instead of leaving it uncapped.
2. `toBaseUnits` only ever handled whole-number inputs. A real fractional trade size first
   broke `BigInt()` (needs an integer), then broke `ethers.parseUnits` after switching to
   it (JS's float-to-string conversion produced one more decimal digit than the token
   actually supports). Fixed by rounding to the token's real decimal precision first.

### Setup

`GEMINI_API_KEY` in `.env` (get one at aistudio.google.com/apikey). Everything else reuses
the OKX credentials and `contracts/.env`'s `AGENT_PRIVATE_KEY` already set up in Phase 0-2.

### Run

```
npm run agent-loop                      # real loop, real approval prompt, real execution
npm run test-agent-loop-approval        # single cycle, auto-answers the prompt (for testing)
```

Configurable via env vars: `VAULT_ADDRESS`, `AGENT_LOOP_INTERVAL_MS`, `DRIFT_THRESHOLD_PCT`,
`AGENT_LOOP_MAX_CYCLES`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_CACHE_TTL_MS`, `LLM_MIN_INTERVAL_MS`.

## Phase 4 — NAV Sentinel

`lib/navSentinel.js`, wired into `rebalanceProposal.js` ahead of every trade decision. This
is the product's differentiator — OKX already owns the swap button and simple yield; this
is what happens *between* swaps: checking whether a tokenized stock's onchain price still
reflects what the real, underlying equity is actually worth before letting the agent trade
it.

For each xStock the vault holds, NAV Sentinel:
1. Resolves the real-world ticker (e.g. `NVDA` for wNVDAx) by matching the token's X Layer
   address against Backed Finance's own public registry — not a hardcoded lookup table, so
   it keeps working as more xStocks get added to the vault without a code change.
2. Fetches the real equity price from Yahoo Finance's unofficial chart API (no API key —
   the "free API" the brief calls for) and independently determines whether US markets are
   currently open, computed from wall-clock time in `America/New_York` rather than trusting
   any single field in the response (which isn't consistently present). Known, documented
   gap: doesn't account for market holidays, only weekday/weekend — the specific scenario
   named in the brief.
3. Compares that against the onchain price (a live OKX reference quote) and classifies the
   deviation: **ok** (within 2%, market open), **warn** (2-5% deviation, OR market closed
   even with low deviation — a stale last price isn't a clean bill of health), **block**
   (≥5% deviation, hard threshold, both configurable via `NAV_WARN_THRESHOLD_PCT` /
   `NAV_BLOCK_THRESHOLD_PCT`).

A `block` status overrides whatever the drift math alone would have proposed — the
proposal's `action` becomes `nav_blocked` and the agent loop never shows an approval
prompt for it, regardless of how large the drift is. `warn` doesn't block, but is
surfaced prominently in both the console output and the LLM's explanation.

**Tested against real conditions, not synthetic ones — both branches confirmed with real
on-chain and real market data in the same session:**
- **Warn (real, unforced):** ran during an actual weekend. Real result: onchain wNVDAx
  price $227.19 vs NVDA's real last close $223.96 (1.44% deviation, under the 2% warn
  threshold on its own) — correctly flagged `warn` anyway, specifically because markets
  were closed, with an accurate reason. The rebalance proposal still went through to the
  approval prompt, as `warn` should allow.
- **Block (threshold forced low to exercise the path, deviation itself is real):** with
  `NAV_BLOCK_THRESHOLD_PCT=0.5`, the real 1.85% deviation correctly triggered `block`, the
  action correctly became `nav_blocked`, and — the actual guarantee that matters — **the
  approval prompt never appeared and no trade executed**, confirmed by the process exiting
  cleanly with no `Execute this trade?` line in the output.

### Setup

No new credentials — Yahoo Finance's chart endpoint and Backed's asset registry are both
public, unauthenticated APIs.

### Run

NAV Sentinel runs automatically as part of `npm run agent-loop` — no separate command.
Tune sensitivity via `NAV_WARN_THRESHOLD_PCT` / `NAV_BLOCK_THRESHOLD_PCT` env vars.

## Phase 5 — Frontend

`web/` is a separate Next.js app (own `package.json`) inside the same repo. It reads and
writes through the existing `lib/` modules directly — API routes `import` from
`../../../../lib/*.js`, nothing is reimplemented. Drift math, trade sizing, and NAV
Sentinel logic all live in exactly one place regardless of whether the caller is the CLI
agent loop or the web app.

Design direction (palette, type, layout concept, signature element) was reviewed and
approved before any code was written — see the design pitch artifact from that
conversation for the full rationale. Four panels: holdings against target, price check,
current proposal, and — replacing the proposal panel entirely when triggered — the
refusal state.

### The signature element is SVG, not canvas, by design

`HelmWheel.jsx` draws the wheel mark as SVG, not canvas. This wasn't "add a fallback" —
it's a different primitive chosen specifically because SVG is declarative markup that
renders as long as the browser renders HTML at all, while canvas needs a rendering
context that can fail to acquire (JS disabled, extensions blocking canvas, low-memory
devices). The refusal moment is the entire product thesis, so it can't depend on a
drawing surface with a failure mode — this avoids that failure mode structurally instead
of layering a fallback on a riskier primary. Nothing about the locked wheel is animated,
so reduced-motion has nothing to override there; the one ambient animation in the
interface (a slow, quiet drift on the header wheel, `.wheel-slow-turn` in `globals.css`)
respects `prefers-reduced-motion` and stops entirely when set.

### Reaching the refusal state on demand, for demo recording

`GET /api/state` accepts `?demoBlockThreshold=N` and `?demoWarnThreshold=N`, which flow
straight into `navSentinel.js`'s existing `checkNavDeviation(address, usdg, options)` —
not a separate code path, not a mocked response. A tightened threshold and a naturally
occurring one produce identically-shaped results, because the function has no notion of
"induced" vs "natural"; nothing downstream (including every component that renders the
result) can tell the difference.

**Verified working value: `?demoBlockThreshold=0`.** A smaller-but-nonzero value
(`0.05`) was tried first and found unreliable — real market deviation fluctuates between
roughly 0.01% and 0.6% in practice, so a fixed small threshold can land on either side of
real noise from one moment to the next (confirmed directly: the same value that triggered
a block on one run didn't on the next, purely from real price movement). Threshold `0`
means any nonzero deviation exceeds it, which real market data always has, so it fires
reliably regardless of the moment. To record the refusal state:

```
https://helmfi-agent.vercel.app/?demoBlockThreshold=0
```

One real constraint discovered while verifying this, not just theorized: the block only
shows if the asset NAV Sentinel flags is also the asset the current proposal is actually
trading. `xBTC` (no real-world ticker in Backed's registry — it's OKX's own wrapped BTC,
not a Backed xStock) can never reach "block" status regardless of threshold, since its NAV
check has no real price to compare against at all. If the vault's current drift makes
xBTC the natural pick (largest drift magnitude), the demo threshold override won't
visibly do anything until either the natural pick shifts to NVDAx/SPYx/AAPLx/MSFTx (a real
ticker) or a real deposit/trade nudges holdings so it does. Check the current proposal's
`trade.toSymbol` before recording.

### Approving a trade requires proof of ownership, not just a click

`POST /api/approve` never trusts a trade description from the browser. It verifies a
fresh signed message (`personal_sign` via the connected wallet, 2-minute expiry, replay
protected) recovers to the vault's owner address, then re-derives the trade itself from a
fresh server-side call to `generateRebalanceProposal` — the client's request body is only
ever used to prove *who* is asking, never *what* to trade. This also means a proposal that
changed or became blocked between page load and clicking Approve can't accidentally
execute a stale trade, since the server always re-checks it.

### Vercel deployment

Repo name and Vercel project name: **`helmfi-agent`**, exactly — the deployed production
URL is controlled by the Vercel project name, not the repo name, and matches with no
suffix or hash. `web/package.json`'s `name` field is already set to `helmfi-agent` to
match, so if you connect this repo (or just `web/` as the project root, since it has its
own lockfile) and import via Vercel, the suggested project name at setup should already
be correct — confirm it before finishing setup rather than accepting a default blindly.
Preview deployments (branches/PRs) will always carry a hash suffix regardless — that's a
Vercel platform behavior for previews specifically, not a project setting.

1. Set **Root Directory** to `web` in Vercel's project settings (the app lives in a
   subdirectory of the repo, not the repo root).
2. Set every environment variable listed in `web/.env.example` in Vercel's dashboard
   (Project Settings -> Environment Variables) — those two `.env` files this app reads
   locally are both gitignored and never reach Vercel's filesystem, so production relies
   entirely on dashboard-configured variables instead.
3. Deploy. Production builds don't double-invoke React effects the way dev mode does
   (confirmed during testing — StrictMode's double-fetch in `next dev` isn't a production
   behavior), so the occasional transient OKX rate-limit retry seen during heavy local
   testing this session is a dev-mode-adjacent artifact, not something the deployed site
   will show under normal traffic.

## Roadmap (named next steps, not implemented — described here so nothing above reads as
more finished than it is)

- **Live percentage-of-value caps enforced onchain.** Today's `maxHoldingAmount` is a raw
  token-unit ceiling (see "Policy correction" above for why). Making it a true live-% cap
  needs the contract to trust a price source — either a real oracle (Chainlink-style, if
  one exists for X Layer xStocks) or an agent-pushed price with its own signature/staleness
  checks. Either is real scope, not a config change.
- **6-asset portfolio** (adding AAPLx, MSFTx back in) once vault size justifies it —
  demo-scale money currently makes finer splits look broken, not more sophisticated.
- **Market holiday calendar** for NAV Sentinel's market-open detection (currently
  weekday/weekend only, a documented gap, not a silent one).
- **Wallet support beyond EIP-1193 injected wallets** (MetaMask-style browser extensions).
  No WalletConnect, no mobile deep-linking — deliberately out of scope for the hackathon
  timeline, not an oversight.
- **NAV Sentinel demo-block asset targeting.** `?demoBlockThreshold` reliably forces
  "block" status on whichever real-ticker asset (NVDAx/SPYx/AAPLx/MSFTx) the vault
  currently checks, but doesn't currently let an operator pick which one — that's
  determined by which asset the natural drift-based proposal happens to select. Fine for
  now; would matter more with a larger, more actively used portfolio.
- Phase 6 (final mainnet demo run + architecture diagram) — not yet started as of this
  writing.
