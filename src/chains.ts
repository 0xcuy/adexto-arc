/**
 * Registry Arc untuk ADEXTO: alamat, hash bytecode, dan pasar yang hidup di chain 5042.
 *
 * SETIAP NILAI DI SINI DIBACA DARI CHAIN, BUKAN DISALIN DARI CATATAN
 *
 * `scripts/probe.ts` membaca ulang semuanya ke Arc dan gagal kalau satu saja berbeda. Itu bukan
 * kehati-hatian berlebihan: factory Arc lahir di alamat nonce-0 deployer, alamat yang SAMA dengan
 * factory di Robinhood Chain. Akibatnya token dan kurva peluncuran ke-n di kedua chain juga beralamat
 * sama. Alamat tanpa chainId tidak berarti apa-apa di proyek ini, dan registry situs pernah salah
 * karena itu (lihat docs/DEPLOYMENT.md).
 *
 * Komentar boleh bahasa Indonesia; semua yang dicetak ke konsol berbahasa Inggris karena repo ini publik.
 */

export interface ChainTarget {
  key: string;
  chainId: number;
  name: string;
  /** Aset gas. Di Arc ini USDC, 18 desimal di tingkat native. */
  nativeSymbol: string;
  nativeDecimals: number;
  /** RPC resmi: dipakai untuk `eth_call` dan siaran. */
  rpcUrl: string;
  /**
   * RPC untuk `eth_getLogs`. RPC resmi menolak rentang di atas 10.000 blok; Pinax menerima 100.000
   * (diukur 2026-10-06). Probe ini tidak membaca log, tetapi aplikasinya memakai endpoint ini.
   */
  logRpcUrl: string;
  explorer: string;
  /** ADEXTO v1 (AdextoFactory 1.0.0): setiap peluncuran di Arc lewat sini. */
  launchFactory: string;
  launchFactoryVersion: string;
  launchFactoryBlock: number;
  stakeHub: string;
  stakeHubBlock: number;
  agentRegistry: string;
  protocolTreasury: string;
  /** Mempool Arc membuang transaksi dengan maxFeePerGas di bawah ini, tanpa receipt. */
  minMaxFeeGwei: number;
}

export const ARC: ChainTarget = {
  key: "arc",
  chainId: 5042,
  name: "Arc Mainnet",
  nativeSymbol: "USDC",
  nativeDecimals: 18,
  rpcUrl: "https://rpc.mainnet.arc.io",
  logRpcUrl: "https://arc.rpc.pinax.network",
  explorer: "https://explorer.arc.io",
  launchFactory: "0x8e63e117E71A80Cfc10fDF375F079e2e29cd7D7D",
  launchFactoryVersion: "1.0.0",
  launchFactoryBlock: 24446119,
  stakeHub: "0xb264D861264B0e4f8fb98A61B7694BA8a3B6BBe3",
  stakeHubBlock: 24446365,
  agentRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
  protocolTreasury: "0x24268Fffc119ec5550F68e80D94476fD64daE967",
  minMaxFeeGwei: 20,
};

/** keccak256 runtime ADEXTO v1, identik di keenam chain. Satu-satunya immutable-nya treasury yang sama. */
export const V1_RUNTIME_KECCAK = "0x1ca02ca53a3b2a2082f9e5dab6924e1339110e3037608f750981699678881fd4";
/** keccak256 runtime AdextoStakeHub di Arc; sama dengan hub Robinhood Chain (satu factory di konstruktor). */
export const HUB_RUNTIME_KECCAK = "0x88247303e4851282bbf22dd4f23e753b08a6862ea40f32d9c0464e92730b081a";

/**
 * Antarmuka ERC-20 dari saldo USDC native yang SAMA, 6 desimal. Bukan aset kedua: `balanceOf` di sini
 * dan `eth_getBalance` membaca satu saldo, dengan 10^12 selisih skala (dan pemotongan di bawah 1e-6).
 */
export const USDC_ERC20 = "0x3600000000000000000000000000000000000000";

/** Ticker yang dicadangkan khusus Arc di konstruktor factory, di atas 16 ticker dasar. */
export const ARC_RESERVED = ["ARC", "EURC", "USYC", "CIRBTC"] as const;

export const DEPLOYER = "0x8a3c7524Aaed081825aC88eC7f4cCECFc583ee7D";

export interface Market {
  symbol: string;
  name: string;
  token: string;
  curve: string;
  creator: string;
  agentId: number;
  launchTx: string;
  launchBlock: number;
}

/** Pasar terdaftar di Arc. $ARCTEST (uji, tersembunyi dari situs) sengaja tidak ada di sini. */
export const MARKETS: Market[] = [
  {
    symbol: "SAI",
    name: "SAi Arc",
    token: "0x670062eDe99Fc9Ac946895dB146b88D54b01c76e",
    curve: "0x13Ffcc4933B6db23b85532C767b85913430b0624",
    creator: "0x42478Ed9A429eC320d243469Fa5d6595BCc8daa5",
    agentId: 1421,
    launchTx: "0x90a09e61e0a7eec216edee1c4833bcf567dca2e2e1199e04839226cd68ae6a47",
    launchBlock: 24465502,
  },
];

/** Agen ERC-8004 yang dipegang dompet ADEXTO di Arc. */
export const AGENTS = [
  { agentId: 1422, name: "ADEXTO Protocol Agent", owner: DEPLOYER },
  { agentId: 1421, name: "SAi Arc Agent", owner: "0x42478Ed9A429eC320d243469Fa5d6595BCc8daa5" },
] as const;

/** Kaki pembayaran x402: USDC di Base, EIP-3009. Pembeli tidak memegang apa pun di Arc. */
export const PAYMENT = {
  chainId: 8453,
  name: "Base Mainnet",
  explorer: "https://basescan.org",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
} as const;

/**
 * Byte creation code yang memakai PUSH0 dan MCOPY lalu mengembalikan 32 byte berakhiran 0x2a. Byte yang
 * sama dipakai `deploy-factory.mjs` sebelum broadcast; kalau chain tidak mendukung salah satunya, eth_call
 * gagal dan factory (dikompilasi untuk cancun) tidak akan pernah di-deploy ke sana.
 */
export const OPCODE_PROBE = "0x602a5f5260205f60205e60206020f3";

export const FACTORY_ABI = [
  "function VERSION() view returns (string)",
  "function PROTOCOL_FEE_BPS() view returns (uint256)",
  "function AGENT_REGISTRY() view returns (address)",
  "function protocolTreasury() view returns (address)",
  "function totalProjectsCount() view returns (uint256)",
  "function isSymbolAvailable(string) view returns (bool)",
  "function deployTrinity(string name,string symbol,uint256 initialSupply,address agentIdentity,uint256 virtualNative,uint256 swapFeeBps,uint256 creatorShareBps,uint256 treasuryShareBps,bytes32 metadataRoot,bool bindAgent,uint256 agentId) returns (address,address)",
] as const;

export const CURVE_ABI = [
  "function VERSION() view returns (string)",
  "function creator() view returns (address)",
  "function protocolTreasury() view returns (address)",
  "function targetToken() view returns (address)",
  "function virtualNative() view returns (uint256)",
  "function totalFeeBps() view returns (uint256)",
  "function swapCount() view returns (uint256)",
  "function realNative() view returns (uint256)",
] as const;

export const TOKEN_ABI = [
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function agentBound() view returns (bool)",
  "function agentId() view returns (uint256)",
] as const;

export const HUB_ABI = [
  "function VERSION() view returns (string)",
  "function factories() view returns (address[])",
  "function isEligible(address token) view returns (bool)",
] as const;

export const REGISTRY_ABI = ["function ownerOf(uint256) view returns (address)"] as const;

export const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"] as const;
