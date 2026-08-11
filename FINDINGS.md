# Integration findings

Three things this project verified directly, against real transactions and real RPC
responses, rather than trusting a single successful call or what the documentation says.
Written for anyone else integrating OKX's DEX Aggregator or building against X Layer,
since none of these are stated plainly in either project's own docs.

## 1. OKX's DEX Aggregator reports Uniswap V3, the actual liquidity is Uniswap V4

OKX's own DEX Aggregator API labels every X Layer route through this liquidity as
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
different token pairs, `0x360e68faccca8ca495c1b759fd9eee466db9fb32`. That address
recurring across unrelated pairs, and appearing twice within one transaction's multi hop
route, is the fingerprint of a PoolManager singleton. Uniswap V3 would instead show a
different, pair specific pool contract each time. This matches Dune's own decoded table
name for X Layer, `uniswap_v4_xlayer.poolmanager_evt_swap`.

For builders, anything you write that assumes V3-style per-pool contracts on X Layer, or
that trusts the `dexProtocol.dexName` field for routing logic, is working from a wrong
premise sourced from OKX's own API.

## 2. The swap executor and the approval target are different contracts

OKX's DEX Aggregator v6 API returns two separate addresses relevant to a single swap, and
using the wrong one for the wrong purpose fails silently, the transaction reverts with an
opaque custom error, not a message that points at the real cause.

- `tx.to`, from the `/swap` endpoint, is the contract that actually executes the swap.
  This is what you call.
- `dexContractAddress`, from the separate `/approve-transaction` endpoint, is the contract
  that actually holds the ERC20 allowance. This is what you approve.

They are not the same address. Approving `tx.to`, the natural seeming choice since it is
the one you are about to call, looks correct, compiles fine, and fails every time. This is
not a hypothetical, it broke this project's first real mainnet trade attempt. Confirmed
independently two ways, a direct EOA call and a smart contract call, both of which failed
identically until the fix.

`PolicyVault.executeTrade` (`contracts/contracts/PolicyVault.sol`) takes `approveTarget`
and `swapTarget` as two explicit, separate parameters specifically because of this, and
`lib/swapBuilder.js` calls both OKX endpoints to resolve them correctly rather than
assuming one address serves both purposes. Regression covered by a dedicated test,
`contracts/test/PolicyVault.test.js`, "approves approveTarget, not swapTarget, when
they're different addresses, the exact bug that broke the first real mainnet trade
attempt."

For builders, if you are integrating this aggregator from a contract rather than an EOA,
call both `/swap` and `/approve-transaction` and approve `dexContractAddress`, not `tx.to`.
Assuming a single address for both will compile, pass review, and fail on chain.

## 3. X Layer RPC returns transient bad reads that resolve on an identical retry

Over the course of building and testing this project, the same X Layer RPC endpoint
(`xlayerrpc.okx.com`) returned stale or wrong data on plain reads twice in one session, not
under load, not adversarially, during ordinary development traffic.

- A token balance read that showed 0 immediately after a confirmed transfer, then showed
  the correct amount moments later on an identical retry.
- A gas estimate for a deployment that was roughly 1000x the real cost on one call, and
  correct on an identical retry immediately after.

Neither was network congestion or a real state change between calls. Both are consistent
with a load-balanced RPC behind that hostname, where different backend nodes gave
different answers to the same query at the same moment.

This matters beyond debugging inconvenience because this project's agent loop reads
balances, prices, and allowances, then acts on them autonomously. An agent that reads a
stale balance and proposes or executes a trade based on it is a real failure mode, not a
hypothetical one, and this session hit the underlying cause twice in the course of one
afternoon. Every decision-driving read in this project (`lib/reliableRpc.js`) is cross
checked against a second, independent RPC endpoint (`rpc.xlayer.tech`) before the agent
acts on it, and hard fails rather than guessing if the two do not agree.

For builders, do not treat a single successful read from this endpoint as ground truth if
an autonomous process is going to act on it. Cross check or retry-to-convergence any read
that drives a decision, this is a design requirement against this RPC, not an optional
hardening step.
