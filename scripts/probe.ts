/**
 * Probe ADEXTO di Arc. HANYA membaca dan mensimulasi; tidak ada transaksi.
 *
 * Yang diperiksa, semuanya terhadap chain dan bukan terhadap catatan:
 *   - chain dan EVM-nya: chainId, PUSH0/MCOPY, lantai fee 20 gwei;
 *   - factory v1: runtime byte-identik dengan lima chain lain, VERSION, treasury, ticker cadangan Arc;
 *   - stake hub: runtime, factory yang diterimanya, dan bahwa SAi Arc bisa di-stake;
 *   - agen ERC-8004 kami dan SAi Arc: pemilik, ikatan agen di token, creator memegang nol;
 *   - USDC sebagai satu saldo dengan dua antarmuka (18 desimal native, 6 desimal ERC-20);
 *   - simulasi `deployTrinity`, supaya "bisa meluncurkan" adalah hasil eksekusi, bukan klaim.
 *
 * Pakai: npm run probe          (atau: node scripts/probe.ts)
 */
import { ethers } from "ethers";
import {
  AGENTS,
  ARC,
  ARC_RESERVED,
  CURVE_ABI,
  ERC20_ABI,
  FACTORY_ABI,
  HUB_ABI,
  HUB_RUNTIME_KECCAK,
  MARKETS,
  OPCODE_PROBE,
  REGISTRY_ABI,
  TOKEN_ABI,
  USDC_ERC20,
  V1_RUNTIME_KECCAK,
} from "../src/chains.ts";

const provider = new ethers.JsonRpcProvider(ARC.rpcUrl, ARC.chainId, { staticNetwork: true, batchMaxCount: 1 });
const problems: string[] = [];
const ok = (label: string, value: unknown) => console.log(`  ${label.padEnd(22)} ${value}`);
const check = (label: string, pass: boolean, value: unknown) => {
  console.log(`  ${label.padEnd(22)} ${value}  ${pass ? "ok" : "MISMATCH"}`);
  if (!pass) problems.push(`${label}: ${value}`);
};
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const usdc = (wei: bigint, digits = 6) => Number(ethers.formatEther(wei)).toFixed(digits);

console.log(`\n=== ${ARC.name} (chainId ${ARC.chainId}) ===`);

// ── the chain ────────────────────────────────────────────────────────────────────────────────
/**
 * `eth_chainId` lewat `send`, bukan `getNetwork()`: dengan `staticNetwork` yang kedua menjawab dari
 * konfigurasi tanpa menyentuh jaringan, jadi pemeriksaannya tidak bisa gagal.
 */
const chainId = Number(await provider.send("eth_chainId", []));
check("eth_chainId", chainId === ARC.chainId, chainId);
ok("block", await provider.getBlockNumber());
const fee = await provider.getFeeData();
const floor = ethers.parseUnits(String(ARC.minMaxFeeGwei), "gwei");
ok("gas price", `${ethers.formatUnits(fee.gasPrice ?? 0n, "gwei")} gwei, paid in ${ARC.nativeSymbol}`);
check(
  "maxFeePerGas",
  (fee.maxFeePerGas ?? 0n) >= floor,
  `${ethers.formatUnits(fee.maxFeePerGas ?? 0n, "gwei")} gwei (mempool floor ${ARC.minMaxFeeGwei})`
);
const probe = await provider.call({ data: OPCODE_PROBE }).catch((e) => `FAILED ${String(e?.shortMessage ?? e).slice(0, 60)}`);
check("PUSH0 + MCOPY", typeof probe === "string" && probe.endsWith("2a"), typeof probe === "string" ? `${probe.slice(0, 6)}…${probe.slice(-4)}` : probe);

// ── ADEXTO v1 ────────────────────────────────────────────────────────────────────────────────
console.log(`\n  launch factory (ADEXTO v1) ${ARC.launchFactory}`);
const factory = new ethers.Contract(ARC.launchFactory, FACTORY_ABI, provider);
const code = await provider.getCode(ARC.launchFactory);
ok("bytecode", `${(code.length - 2) / 2} bytes`);
check("keccak", ethers.keccak256(code) === V1_RUNTIME_KECCAK, ethers.keccak256(code));
const version = await factory.VERSION!();
check("VERSION", version === ARC.launchFactoryVersion, version);
ok("PROTOCOL_FEE_BPS", await factory.PROTOCOL_FEE_BPS!());
const treasury = await factory.protocolTreasury!();
check("protocolTreasury", eq(treasury, ARC.protocolTreasury), treasury);
const registry = await factory.AGENT_REGISTRY!();
check("AGENT_REGISTRY", eq(registry, ARC.agentRegistry), registry);
ok("totalProjectsCount", await factory.totalProjectsCount!());
for (const t of ARC_RESERVED) {
  const free = await factory.isSymbolAvailable!(t);
  check(`reserved ${t}`, free === false, free ? "claimable" : "reserved");
}

// ── stake hub ────────────────────────────────────────────────────────────────────────────────
console.log(`\n  stake hub ${ARC.stakeHub}`);
const hub = new ethers.Contract(ARC.stakeHub, HUB_ABI, provider);
const hubCode = await provider.getCode(ARC.stakeHub);
check("keccak", ethers.keccak256(hubCode) === HUB_RUNTIME_KECCAK, ethers.keccak256(hubCode));
ok("VERSION", await hub.VERSION!());
const hubFactories: string[] = await hub.factories!();
check("factories", hubFactories.length === 1 && eq(hubFactories[0]!, ARC.launchFactory), hubFactories.join(", "));

// ── agents ───────────────────────────────────────────────────────────────────────────────────
console.log(`\n  ERC-8004 Identity Registry ${ARC.agentRegistry}`);
const ids = new ethers.Contract(ARC.agentRegistry, REGISTRY_ABI, provider);
for (const a of AGENTS) {
  const owner = await ids.ownerOf!(a.agentId);
  check(`#${a.agentId}`, eq(owner, a.owner), `${a.name}, owner ${owner}`);
}

// ── markets ──────────────────────────────────────────────────────────────────────────────────
const erc20 = new ethers.Contract(USDC_ERC20, ERC20_ABI, provider);
for (const m of MARKETS) {
  console.log(`\n  market ${m.name} ($${m.symbol})`);
  const token = new ethers.Contract(m.token, TOKEN_ABI, provider);
  const curve = new ethers.Contract(m.curve, CURVE_ABI, provider);
  const [sym, bound, agentId, creatorBal, curveCreator, curveTreasury, curveToken, feeBps, swaps, virtualNative, eligible] =
    await Promise.all([
      token.symbol!(),
      token.agentBound!(),
      token.agentId!(),
      token.balanceOf!(m.creator),
      curve.creator!(),
      curve.protocolTreasury!(),
      curve.targetToken!(),
      curve.totalFeeBps!(),
      curve.swapCount!(),
      curve.virtualNative!(),
      hub.isEligible!(m.token),
    ]);
  check("token", sym === m.symbol && eq(curveToken, m.token), `${m.token} (${sym})`);
  check("agent", bound === true && Number(agentId) === m.agentId, `agentBound ${bound} · agentId ${agentId}`);
  check("creator", eq(curveCreator, m.creator), curveCreator);
  check("creator holds", creatorBal === 0n, `${ethers.formatEther(creatorBal)} ${m.symbol}`);
  check("protocolTreasury", eq(curveTreasury, ARC.protocolTreasury), curveTreasury);
  ok("totalFeeBps", `${feeBps} (${Number(feeBps) / 100}% per trade)`);
  ok("opening reserve", `${ethers.formatEther(virtualNative)} USDC, virtual, never deposited`);
  ok("swapCount", swaps);
  check("stakeable in hub", eligible === true, eligible);
  /**
   * Satu saldo, dua antarmuka. `eth_getBalance` (18 desimal) dan USDC.balanceOf (6 desimal) membaca
   * uang yang sama; ERC-20 memotong apa pun di bawah 0,000001. Kurva hanya pernah memakai yang native.
   */
  const [native, view] = await Promise.all([provider.getBalance(m.curve), erc20.balanceOf!(m.curve)]);
  const truncated = native / 10n ** 12n;
  check("curve USDC", truncated === view, `native ${usdc(native, 9)} · ERC-20 view ${ethers.formatUnits(view, 6)}`);
}

// ── a launch, executed on a node and thrown away ─────────────────────────────────────────────
const caller = ethers.Wallet.createRandom().address;
console.log(`\n  simulating deployTrinity on ADEXTO v1 as ${caller}`);
const args = [
  "Arc Probe",
  `APRB${Math.floor(1000 + Math.random() * 9000)}`,
  1_000_000_000n, // whole tokens, not wei
  caller, // agentIdentity must not be address(0)
  ethers.parseEther("4000"), // virtualNative: 4,000 USDC, the opening market cap in dollars
  100n, // swapFeeBps
  70n, // creatorShareBps
  10n, // treasuryShareBps; depth = 100 - 70 - 10 - 10 protocol = 10
  ethers.ZeroHash,
  false,
  0n,
] as const;
let simulated = false;
try {
  const out = await factory.deployTrinity!.staticCall(...args, { from: caller });
  ok("staticCall", `PASSED -> token ${out[0]}, curve ${out[1]}`);
  simulated = true;
} catch (e) {
  ok("staticCall", `REVERT ${String((e as { shortMessage?: string })?.shortMessage ?? e).slice(0, 120)}`);
  problems.push("deployTrinity staticCall reverted");
}
try {
  const gas = await factory.deployTrinity!.estimateGas(...args, { from: caller });
  ok("estimateGas", `${gas} gas @ ${ethers.formatUnits(fee.gasPrice ?? 0n, "gwei")} gwei = ~${usdc(gas * (fee.gasPrice ?? 0n), 4)} USDC`);
} catch (e) {
  ok("estimateGas", `FAILED ${String((e as { shortMessage?: string })?.shortMessage ?? e).slice(0, 120)}`);
}

console.log(
  `\n  verdict: launch path ${simulated ? "READY" : "NOT READY"}, config ${problems.length === 0 ? "matches the chain" : "DRIFTS"}\n`
);
for (const p of problems) console.log(`    - ${p}`);
process.exit(simulated && problems.length === 0 ? 0 : 1);
