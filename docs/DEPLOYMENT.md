# How ADEXTO went live on Arc

Arc became ADEXTO's sixth mainnet on 5 October 2026 (UTC). This is the order it happened in, with every
transaction, and the one bug that Arc found. Times are UTC, and every fee is what the receipt says.

- [1. Measure first, spend nothing](#1-measure-first-spend-nothing)
- [2. Fund with CCTP](#2-fund-with-cctp)
- [3. The factory and the stake hub](#3-the-factory-and-the-stake-hub)
- [4. Switch the site and the gateway on](#4-switch-the-site-and-the-gateway-on)
- [5. The bug Arc found](#5-the-bug-arc-found)
- [6. SAi Arc, launched and bought by agents](#6-sai-arc-launched-and-bought-by-agents)
- [What it cost](#what-it-cost)

---

## 1. Measure first, spend nothing

The code for Arc shipped **hidden**: Arc appears in no chain list, sentence or count on adexto.xyz until
`NEXT_PUBLIC_CURVE_FACTORY_ARC` is set, and every "N mainnets" on the site is computed from the chains that
can launch rather than written by hand. With the variable empty, production rendered exactly as before.

Before the first transaction, everything that could be checked without spending was:

- every contract ADEXTO depends on, by `eth_getCode` ([the list](ARC.md#the-infrastructure-was-already-there));
- the widest `eth_getLogs` range of every public RPC ([the table](ARC.md#reading-logs));
- the launch gas, measured with no factory on the chain: an `eth_estimateGas` with a state override that puts
  the v1 runtime at the factory's future address. The same override on Robinhood Chain returned exactly the
  real-state estimate, and after the broadcast the real factory on Arc returned the same number,
  **3,300,177 gas**;
- a dry run of the deploy script, which compiles nothing new: it checks that the artifact matches the
  committed sources, runs the opcode probe on Arc, simulates the creation and compares the returned runtime
  with the artifact, then stops at the balance check.

## 2. Fund with CCTP

All the USDC came from Base, in one CCTP V2 fast transfer with Circle's Forwarding Service, so Circle sent
the mint on Arc and the receiving wallet needed no gas there.

| Step | Transaction | |
|---|---|---|
| Burn 1.15 USDC on Base, domain 26, forwarding hook | [`0x0a0302be…3b620`](https://basescan.org/tx/0x0a0302bebeff0ee1bddefc855960e719aa183425780849df44013e2b27e3b620) | max fee 0.017377 USDC |
| Mint on Arc, sent by the Forwarding Service | [`0x9d708a04…e5cc1`](https://explorer.arc.io/tx/0x9d708a04a8ebae48d63b4033ff25f31f1756a0640db2817905469514727e5cc1) | about 25 seconds later; 1.132623 USDC arrived |
| Relayer → deployer, 0.45 USDC | [`0x631421ec…4266d`](https://explorer.arc.io/tx/0x631421ecfb534d0d01e3fc5e144bcdd39a314be9ef74460f23801e889e64266d) | |
| Relayer → Agent A, 0.30 USDC | [`0x139197a3…3ffe`](https://explorer.arc.io/tx/0x139197a3927383f65d5147cff1499a6cbfa0e7e454f2cdfacf854982f7db3ffe) | |

The mint went to the gateway's relayer rather than the deployer, on purpose: the deployer had sent nothing
on Arc, so its first transaction would be the factory and the factory would land at its nonce-0 address.

## 3. The factory and the stake hub

| Contract | Address | Transaction | Checks |
|---|---|---|---|
| AdextoFactory `1.0.0` | [`0x8e63…7D7D`](https://explorer.arc.io/address/0x8e63e117E71A80Cfc10fDF375F079e2e29cd7D7D) | [`0x68b26883…7ab87`](https://explorer.arc.io/tx/0x68b2688364b650b44d66f8ca365063ca9f208dfbdd9d3883e70eb46ed7a7ab87), block 24446119, 20:24 UTC | runtime 21,806 B, keccak `0x1ca02ca5…`, identical to the other five chains; `VERSION` 1.0.0; treasury in its immutable slot; 20 tickers reserved and confirmed unclaimable; [Sourcify exact match](https://repo.sourcify.dev/5042/0x8e63e117E71A80Cfc10fDF375F079e2e29cd7D7D), creation and runtime |
| AdextoStakeHub `1.0.0` | [`0xb264…BBe3`](https://explorer.arc.io/address/0xb264D861264B0e4f8fb98A61B7694BA8a3B6BBe3) | [`0xc58c068d…c48c`](https://explorer.arc.io/tx/0xc58c068db2b94c53583872f6b31d09c315078cab365d2a1cb6ac879e3960c48c), block 24446365 | runtime equal to the Robinhood Chain hub's; accepts only the v1 factory; [Sourcify exact match](https://repo.sourcify.dev/5042/0xb264D861264B0e4f8fb98A61B7694BA8a3B6BBe3) |

Both were compiled from protocol commit `3b23f56`, whose factory sources are identical to the `71b5adf`
the other five factories were built from. The reserved tickers on Arc are the 16 shared by every chain plus
`ARC`, `EURC`, `USYC` and `CIRBTC`, Circle's other assets on Arc.

## 4. Switch the site and the gateway on

- **The site.** `NEXT_PUBLIC_CURVE_FACTORY_ARC` set on the server, then a rebuild. Arc appeared in the chain
  picker, the Studio and the launch-cost table, every chain sentence became "six mainnets", the MCP and A2A
  `chainId` descriptions gained `5042 Arc`, and the USDC blocklist note appeared in the Terms, the Disclaimer
  and the Security page. The deploy's own consistency audit checked the README row, the ABI index and
  `VERSION` on Arc against the variable, with 0 findings.
- **The gateway.** The x402 Worker gained `ARC_RPC`, pointing at a keyed relay on the site
  (`/api/rpc/arc`) whose upstream is the official RPC. Without it, a paid buy of an Arc market is refused
  before anything is charged.

## 5. The bug Arc found

The first market launched on Arc was a hidden test, `$ARCTEST`. Agent A launched it over MCP, and
`register_launch` answered "listed". It was not.

The Arc factory sits at the deployer's nonce-0 address, and so does the Robinhood Chain factory. A
factory's n-th launch creates its token and curve at addresses derived from the factory's address and
nonce, so **the first launch on Arc was born at exactly the addresses of the first launch on Robinhood
Chain**: `$ARCTEST`'s token is `0x4C63…C82d`, which on chain 4663 is `$SAI`, SAi Robin.

The site's registry identified a market by its token address alone. `register_launch` looked the new token
up, found SAi Robin, and returned "already registered" with SAi Robin's record.

The fix keys every lookup by chain id and address together: the registry's deduplication, the address
lookup when a chain is given, the duplicate check on registration, and the agent-launch marker. A test
registers one address on two chains and checks that each resolves to its own market, and that the same
address twice on one chain is still refused. After the deploy, the shared address on chain 5042 no longer
resolves to SAi Robin, and SAi Robin itself is unchanged.

`$ARCTEST` stays out of every list, as a test launch should. Its ticker is reserved on the Arc factory
forever, since a factory has no function to release one. The film was made with a market of its own.

## 6. SAi Arc, launched and bought by agents

[Watch it](https://youtu.be/2-srm1KYXEA). Two wallets of ours, each acting as an agent with its own key:

| Step | Transaction | |
|---|---|---|
| Agent A registers ERC-8004 identity #1421 | [`0x75452495…0391`](https://explorer.arc.io/tx/0x754524951937c1c18e7fd37ef13f78c55e7607ee320d1a1a4d080271d54f0391) | block 24465460, 23:07:57 |
| Agent A launches SAi Arc over MCP, bound to #1421 | [`0x90a09e61…6a47`](https://explorer.arc.io/tx/0x90a09e61e0a7eec216edee1c4833bcf567dca2e2e1199e04839226cd68ae6a47) | block 24465502, 23:08:18, 3,216,062 gas |
| Agent B buys over A2A: the delivery on Arc | [`0xf1569a02…8efe`](https://explorer.arc.io/tx/0xf1569a0240333edd81cbd693e54af3ac53180e46d027765ced65eb8c97a78efe) | block 24465562, 23:08:48, 24,006.92 SAI to Agent B |
| … and the settlement on Base | [`0x7da5096c…f3e7`](https://basescan.org/tx/0x7da5096ca9c4467069625967f1de287630d41ea0b9ee35a5c5a3f1d21c22f3e7) | block 52226193, 23:08:53, 0.10 USDC |
| Agent #1421's card moves to an https registration file | [`0x8dfd3225…88cc`](https://explorer.arc.io/tx/0x8dfd3225d2ba4a1e21326a10bed76022ac7400ec17936ed241ce8354b97088cc) | 8004scan shows it as SAi Arc Agent |
| ADEXTO Protocol Agent #1422, held by the deployer | [`0x801c46fb…3b9a`](https://explorer.arc.io/tx/0x801c46fbaa151b9906d7297345914835abb0ff637eb74993e4f9f96a57a43b9a) | pinned `ipfs://` registration file |

Agent A signed the attestation and the launch itself; the MCP server returned the transaction unsigned and
never asked for a key. Agent B held 0.20 USDC on Base and nothing on Arc, signed an EIP-3009 authorization,
and sent no transaction: its transaction count stayed 0 on both chains. The tokens landed five seconds
before the USDC settled.

## What it cost

Every Arc fee below is `gasUsed × effectiveGasPrice` from the receipt, at about 20 gwei, paid in USDC.

| | Gas | USDC |
|---|---:|---:|
| AdextoFactory | 5,282,585 | 0.1057 |
| AdextoStakeHub | 1,068,091 | 0.0214 |
| ERC-8004 registration (#1421) | 782,456 | 0.0156 |
| SAi Arc launch | 3,216,062 | 0.0643 |
| SAi Arc delivery (paid by the gateway's relayer) | 270,154 | 0.0054 |
| setAgentURI (#1421) | 148,940 | 0.0030 |
| ADEXTO Protocol Agent (#1422) | 177,852 | 0.0036 |
| CCTP: Circle's fee on 1.15 USDC (1.132623 arrived) | | 0.0174 |

The test launch `$ARCTEST` and its identity #1420 cost another 0.0810 USDC.
