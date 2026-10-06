# What is different on Arc, and what ADEXTO does about it

Arc runs the Osaka EVM, and ADEXTO v1 deploys there unchanged: the factory on Arc is byte-identical to the
other five chains. But a few runtime rules differ from Ethereum, and each one either changes a number in
the app or changes what the site is allowed to promise. This page lists them, with what was measured and
what was changed.

Sources: Arc's own [EVM differences](https://docs.arc.io/arc/references/evm-differences) and
[contract addresses](https://docs.arc.io/arc/references/contract-addresses), read on 2026-10-06, and the
measurements below, taken against mainnet the same day.

- [USDC is the gas token](#usdc-is-the-gas-token)
- [The fee floor](#the-fee-floor)
- [Value transfers can revert](#value-transfers-can-revert)
- [Native transfers emit Transfer logs](#native-transfers-emit-transfer-logs)
- [Finality and timestamps](#finality-and-timestamps)
- [Reading logs](#reading-logs)
- [The infrastructure was already there](#the-infrastructure-was-already-there)

---

## USDC is the gas token

The native asset is USDC with **18 decimals**, so `msg.value`, the curve's reserves and every fee leg are in
18-decimal units, exactly as they are in wei on an ETH chain. The curve contract needed no change.

The same balance is also exposed as an ERC-20 at `0x3600…0000` with **6 decimals**. It is one balance with
two interfaces, not two assets, and the probe proves it on the live curve:

```
curve USDC             native 0.097000000 · ERC-20 view 0.097  ok
```

What that changed in the app:

| | On an ETH chain | On Arc |
|---|---|---|
| Input assets for a trade | ETH, plus stablecoins | **USDC only.** Listing the ERC-20 too would offer a "swap" from USDC to itself |
| Opening market cap | `virtualNative` × ETH price, so it drifts with ETH | `virtualNative` = **4,000 USDC = $4,000**, exactly |
| Price feed for the native asset | required | none: USDC is priced at 1 |
| Gas reserve kept back on "Max" | gas price × 600k × 3 | the same formula, falling back to 0.05 USDC |

## The fee floor

Arc's mempool **silently drops** a transaction whose `maxFeePerGas` is under 20 gwei: no error, no receipt,
never mined. A deploy script that waits for a receipt would wait ten minutes for one that cannot come.

| Measured 2026-10-06 | |
|---|---|
| `eth_gasPrice` | 20.000001 gwei |
| Base fee, last 6 blocks | 20 gwei |
| What ethers fills by default | `maxFeePerGas` 40 gwei (2 × base + tip) |

`scripts/deploy-factory.mjs` in the protocol repo refuses to broadcast below the floor
(`minMaxFeeGwei: 20` on the `arc` network), and the probe here checks the live fee data against it.

## Value transfers can revert

Three rules make a native transfer revert even when the sender has the balance:

| Rule | Effect on ADEXTO |
|---|---|
| A value transfer to `address(0)` reverts | None in practice. The curve pays only the seller's chosen recipient, the immutable creator and the immutable protocol treasury, and the contracts refuse a zero creator or treasury when they are deployed |
| Burning native value reverts (self-destruct to self, or to a destroyed account) | None. The contracts have no `SELFDESTRUCT` |
| **The USDC blocklist is enforced on native transfers** | A blocklisted wallet cannot pay into an Arc curve or be paid by one. If a curve were blocklisted nobody could trade on it, and if its creator or the treasury were, their fee claims would fail |

The third one is the only one that changes a promise. Everywhere else, adexto.xyz says nobody, including
us, can freeze a market. That stays true of the ADEXTO contracts, which have no blacklist, but on Arc the
asset itself can be blocked by Circle. Since Arc went live, the Terms, the Disclaimer and the Security page
say so, and the note is shown only while Arc can launch.

`PREVRANDAO` always returns 0 on Arc. The contracts do not read it.

## Native transfers emit Transfer logs

Arc implements EIP-7708: every native value movement emits a standard ERC-20 `Transfer` log from the
system address `0xffff…fffE`, with the same topic as a token's `Transfer`.

Any code that scans a receipt for `Transfer` without checking who emitted it can therefore misread a gas
or value movement as a token event. Every log reader in ADEXTO filters by emitter address: the market index,
the launch proof, `register_launch`, and now the agent registration script, which reads the minted agent id
from the Identity Registry's own `Transfer` and nothing else.

## Finality and timestamps

| | Measured | What it changed |
|---|---|---|
| Block time | about 0.507 s | `eth_getLogs` windows are sized in blocks, so a window covers fewer hours than on Ethereum |
| Finality | deterministic, on inclusion | the market index waits 2 blocks, as a margin for RPC lag rather than for reorgs |
| `block.timestamp` | non-decreasing, one-second granularity, so sub-second blocks can share a second | none: the 180-second launch window compares timestamps with `<`, which a repeated second cannot break |

## Reading logs

Trade history, holders and the chart are rebuilt from `eth_getLogs`, so the widest accepted range decides
how much history one call can reach. Measured from the production server on 2026-10-06:

| Endpoint | Widest `eth_getLogs` range | Notes |
|---|---|---|
| `rpc.mainnet.arc.io` (official) | **10,000 blocks** | 10,001 fails with `-32012 requested range too large`. Used for `eth_call` and broadcasts, at 0.13 s a call |
| `arc.rpc.pinax.network` | **100,000 blocks** | with multi-address, multi-topic filters; 500,000 is refused. Used for every log read |
| `arc.drpc.org` | 10,000 blocks | free plan |
| publicnode, blastapi | none | they do not serve Arc |

100,000 blocks is about 14 hours of Arc per call, so full history comes from an index instead. Since 2026-10-06
Arc is in the same Envio HyperIndex as Monad and Robinhood Chain, read over HyperSync (`5042.hypersync.xyz`)
from the factory's deploy block, with Pinax as the RPC fallback. The site and the MCP `trade_history` tool read
it first and answer `source: envio-hyperindex`, `complete: true` for SAi Arc. Query it anonymously at
`https://adexto.xyz/api/indexer/graphql`.

Every Envio id carries its chain, `<chainId>_<address>`, and that is required on Arc rather than tidy. The Arc
and Robinhood Chain factories share one address (same deployer, nonce 0), so their n-th launches share token
and curve addresses too: the unlisted test ticker `$ARCTEST` on Arc sits exactly where `$SAI` sits on
Robinhood Chain. With address-only ids one row would overwrite the other without an error. Filter by the
`chainId` and `address` fields:

```graphql
{ Curve(where: { chainId: { _eq: 5042 } }) { address swapCount volumeNative } }
```

## The infrastructure was already there

Before anything was spent, each contract ADEXTO depends on was checked with `eth_getCode` on Arc mainnet:

| Contract | Address | On Arc |
|---|---|---|
| ERC-8004 Identity Registry | `0x8004A169…a432` | a 130-byte proxy identical to Arbitrum One's, pointing at the same 14,474-byte implementation; `name()` is `AgentIdentity` |
| Multicall3 | `0xcA11bde0…CA11` | identical to Arbitrum One's |
| CREATE2 deployer (Arachnid) | `0x4e59b448…956C` | present |
| USDC (ERC-20 interface) | `0x36000000…0000` | present |
| CCTP TokenMessengerV2 | `0x28b5a0e9…cf5d` | present, domain 26 |
| PUSH0 and MCOPY | the factory is compiled for Cancun | the same opcode probe the deploy script runs returns `…2a` |

The ERC-8004 registry being byte-identical mattered most: the factory checks `ownerOf(agentId)` against it
at launch, so an agent can bind its identity on Arc with no code change at all.
