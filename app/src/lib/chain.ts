import {
  Contract,
  ElectrumNetworkProvider,
  Network,
  type Artifact,
  type NetworkProvider,
  type SpendableUtxo,
  type Utxo,
} from 'cashscript';
import { sha256 } from '@bitauth/libauth';
import poolArtifactJson from '../contracts/MarketPool.json';
import vaultArtifactJson from '../contracts/ShareVault.json';
import { hexToBytes, reverseHex } from './format';
import {
  EMPTY_POOL,
  parseCommitment,
  type MarketConfig,
  type NetworkName,
  type PoolState,
} from './markets';

const poolArtifact = poolArtifactJson as unknown as Artifact;
const vaultArtifact = vaultArtifactJson as unknown as Artifact;

const providers = new Map<NetworkName, NetworkProvider>();

export function getProvider(network: NetworkName): NetworkProvider {
  let provider = providers.get(network);
  if (!provider) {
    provider = new ElectrumNetworkProvider(
      network === 'mainnet' ? Network.MAINNET : Network.CHIPNET,
    );
    providers.set(network, provider);
  }
  return provider;
}

/**
 * Instantiate the MarketPool contract for a market from its config params.
 * Used for unlockers when building transactions; reads use the configured
 * address directly.
 *
 * NOTE: token categories are stored in config (and seen in UTXO token
 * fields) in display order, but contract constructors expect them
 * byte-reversed — hence reverseHex() on the category arguments.
 */
export function getContract(market: MarketConfig): Contract {
  const provider = getProvider(market.network);
  return new Contract(
    poolArtifact,
    [
      market.params.resolverPkh,
      BigInt(market.params.bettingDeadline),
      BigInt(market.params.voidDeadline),
      reverseHex(market.params.yesCategory),
      reverseHex(market.params.noCategory),
    ],
    { provider, contractType: 'p2sh32' },
  );
}

/** The share category (display order) held by one side's vault. */
export function sideCategory(market: MarketConfig, side: 0 | 1): string {
  return side === 0 ? market.params.yesCategory : market.params.noCategory;
}

export function vaultAddress(market: MarketConfig, side: 0 | 1): string {
  return side === 0 ? market.vaults.yes : market.vaults.no;
}

/**
 * Instantiate the ShareVault contract for one side of a market.
 * poolScriptHash is the sha256 of the pool contract's locking bytecode
 * (not byte-reversed); shareCategory is byte-reversed like all category
 * constructor arguments.
 */
export function getVaultContract(market: MarketConfig, side: 0 | 1): Contract {
  const provider = getProvider(market.network);
  const pool = getContract(market);
  const poolScriptHash = sha256.hash(hexToBytes(pool.lockingBytecode));
  const poolScriptHashHex = Array.from(poolScriptHash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return new Contract(
    vaultArtifact,
    [poolScriptHashHex, reverseHex(sideCategory(market, side)), BigInt(side)],
    { provider, contractType: 'p2sh32' },
  );
}

export interface VaultState {
  /** The UTXO holding the vault's remaining share supply, when live. */
  utxo?: SpendableUtxo;
  /** Remaining fungible shares in the vault (display-order category). */
  supply: bigint;
}

/** Read one side's ShareVault: find its share-bearing UTXO and supply. */
export async function fetchVaultState(
  market: MarketConfig,
  side: 0 | 1,
): Promise<VaultState> {
  const provider = getProvider(market.network);
  const category = sideCategory(market, side);
  const utxos = await provider.getUtxos(vaultAddress(market, side));
  const shareUtxo = utxos
    .filter((u) => u.token?.category === category && (u.token?.amount ?? 0n) > 0n)
    .sort((a, b) => ((a.token?.amount ?? 0n) > (b.token?.amount ?? 0n) ? -1 : 1))[0];
  return { utxo: shareUtxo, supply: shareUtxo?.token?.amount ?? 0n };
}

/** All UTXOs currently held at the contract address. */
export async function fetchContractUtxos(market: MarketConfig): Promise<SpendableUtxo[]> {
  const provider = getProvider(market.network);
  return provider.getUtxos(market.address);
}

/**
 * Read the live pool state: find the UTXO carrying the mutable state NFT
 * (category = market.stateCategory) and decode its 18-byte commitment.
 */
/**
 * When the live connection cannot be made from this browser (some networks
 * block the Electrum websocket), fall back to the pool state the project
 * last verified directly on chain, clearly flagged as not live. The figures
 * are real; only betting and claims need the live connection.
 */
function snapshotPool(market: MarketConfig, error?: string): PoolState | null {
  const snap = market.snapshot;
  if (!snap) return null;
  return {
    found: true,
    live: false,
    poolSats: BigInt(snap.poolSats),
    totalYes: BigInt(snap.totalYes),
    totalNo: BigInt(snap.totalNo),
    state: snap.state,
    winner: snap.winner,
    error,
  };
}

export async function fetchPoolState(market: MarketConfig): Promise<PoolState> {
  try {
    const utxos = await fetchContractUtxos(market);
    const poolUtxo = utxos
      .filter(
        (u) =>
          u.token?.category === market.stateCategory &&
          u.token?.nft?.capability === 'mutable',
      )
      .sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1))[0];

    if (!poolUtxo || !poolUtxo.token?.nft) {
      return snapshotPool(market) ?? { ...EMPTY_POOL, error: 'Pool not live yet' };
    }
    const parsed = parseCommitment(poolUtxo.token.nft.commitment);
    return {
      found: true,
      live: true,
      poolUtxo,
      poolSats: poolUtxo.satoshis,
      totalYes: parsed.totalYes,
      totalNo: parsed.totalNo,
      state: parsed.state,
      winner: parsed.winner,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reach the network';
    return snapshotPool(market, message) ?? { ...EMPTY_POOL, error: message };
  }
}

/** UTXOs owned by a user address (token-aware address works too). */
export async function fetchUserUtxos(
  network: NetworkName,
  address: string,
): Promise<SpendableUtxo[]> {
  const provider = getProvider(network);
  return provider.getUtxos(address);
}

/** Sum of plain-BCH (token-free) satoshis in a UTXO set. */
export function sumBch(utxos: Utxo[]): bigint {
  return utxos
    .filter((u) => !u.token)
    .reduce((acc, u) => acc + u.satoshis, 0n);
}

/** Sum of fungible tokens of one category in a UTXO set. */
export function sumShares(utxos: Utxo[], category: string): bigint {
  return utxos
    .filter((u) => u.token?.category === category)
    .reduce((acc, u) => acc + (u.token?.amount ?? 0n), 0n);
}

/** All UTXOs carrying fungible tokens of one category. */
export function shareUtxos(utxos: SpendableUtxo[], category: string): SpendableUtxo[] {
  return utxos.filter(
    (u) => u.token?.category === category && (u.token?.amount ?? 0n) > 0n,
  );
}

export function explorerTxUrl(network: NetworkName, txid: string): string {
  return network === 'mainnet'
    ? `https://blockchair.com/bitcoin-cash/transaction/${txid}`
    : `https://chipnet.chaingraph.cash/tx/${txid}`;
}

export function explorerAddressUrl(network: NetworkName, address: string): string {
  return network === 'mainnet'
    ? `https://blockchair.com/bitcoin-cash/address/${address}`
    : `https://chipnet.chaingraph.cash/address/${address}`;
}
