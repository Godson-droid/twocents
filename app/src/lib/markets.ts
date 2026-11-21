import type { SpendableUtxo } from 'cashscript';
import marketsJson from '../config/markets.json';

export type NetworkName = 'chipnet' | 'mainnet';

export interface MarketParams {
  resolverPkh: string; // bytes20 hex
  bettingDeadline: number; // unix seconds
  voidDeadline: number; // unix seconds
  yesCategory: string; // bytes32 hex (CashToken category, display order)
  noCategory: string; // bytes32 hex
}

export interface MarketConfig {
  id: string;
  question: string;
  detail: string;
  category: string;
  network: NetworkName;
  address: string; // MarketPool contract cashaddr
  stateCategory: string; // category of the mutable state NFT
  /** ShareVault contract address per outcome (0 = Yes key, 1 = No key). */
  vaults: { yes: string; no: string };
  params: MarketParams;
}

export const MARKETS: MarketConfig[] = (marketsJson.markets as MarketConfig[]).slice();

export function getMarket(id: string): MarketConfig | undefined {
  return MARKETS.find((m) => m.id === id);
}

export type MarketPhase = 'open' | 'closed' | 'resolved' | 'voidable';

export interface PoolState {
  found: boolean;
  /** The live pool UTXO at the contract address, when found. */
  poolUtxo?: SpendableUtxo;
  poolSats: bigint;
  totalYes: bigint;
  totalNo: bigint;
  /** 0 = open, 1 = resolved, 2 = closed (from the state NFT commitment). */
  state: 0 | 1 | 2;
  /** 0 = Yes, 1 = No, null while unresolved. */
  winner: 0 | 1 | null;
  error?: string;
}

export const EMPTY_POOL: PoolState = {
  found: false,
  poolSats: 0n,
  totalYes: 0n,
  totalNo: 0n,
  state: 0,
  winner: null,
};

export function marketPhase(market: MarketConfig, pool: PoolState, nowSec: number): MarketPhase {
  if (pool.state === 1) return 'resolved';
  if (nowSec >= market.params.voidDeadline) return 'voidable';
  if (pool.state === 2 || nowSec >= market.params.bettingDeadline) return 'closed';
  return 'open';
}

/** Implied probability of Yes from the parimutuel totals. 0.5 when the pool is empty. */
export function impliedYesProbability(pool: PoolState): number {
  const total = pool.totalYes + pool.totalNo;
  if (total === 0n) return 0.5;
  return Number(pool.totalYes) / Number(total);
}

/**
 * Estimated payout (in sats) if you stake `amount` on `outcome` now and that
 * outcome wins: your shares redeem pro-rata from the enlarged pool.
 */
export function estimatePayout(pool: PoolState, outcome: 0 | 1, amount: bigint): bigint {
  if (amount <= 0n) return 0n;
  const side = outcome === 0 ? pool.totalYes : pool.totalNo;
  const newSide = side + amount;
  const newPool = pool.totalYes + pool.totalNo + amount;
  if (newSide === 0n) return 0n;
  return (amount * newPool) / newSide;
}

/** Exact claim payout for a resolved market: shares * pool / winning total. */
export function claimPayout(pool: PoolState, shares: bigint): bigint {
  if (pool.winner === null || shares <= 0n) return 0n;
  const winningTotal = pool.winner === 0 ? pool.totalYes : pool.totalNo;
  if (winningTotal <= 0n) return 0n;
  return (shares * pool.poolSats) / winningTotal;
}

/**
 * Parse the 18-byte state NFT commitment:
 * bytes 0-7 totalYes (int64 LE), 8-15 totalNo (int64 LE), 16 state, 17 winner.
 */
export function parseCommitment(commitmentHex: string): {
  totalYes: bigint;
  totalNo: bigint;
  state: 0 | 1 | 2;
  winner: 0 | 1 | null;
} {
  const bytes = new Uint8Array(commitmentHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(commitmentHex.slice(i * 2, i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const totalYes = bytes.length >= 8 ? view.getBigInt64(0, true) : 0n;
  const totalNo = bytes.length >= 16 ? view.getBigInt64(8, true) : 0n;
  const rawState = bytes.length > 16 ? bytes[16] : 0;
  const state = (rawState === 1 ? 1 : rawState === 2 ? 2 : 0) as 0 | 1 | 2;
  const winner = state === 1 ? ((bytes[17] === 1 ? 1 : 0) as 0 | 1) : null;
  return { totalYes, totalNo, state, winner };
}

/** Encode totals/state back into the 18-byte commitment layout. */
export function encodeCommitment(
  totalYes: bigint,
  totalNo: bigint,
  state: 0 | 1 | 2,
  winner: 0 | 1 | null,
): string {
  const bytes = new Uint8Array(18);
  const view = new DataView(bytes.buffer);
  view.setBigInt64(0, totalYes, true);
  view.setBigInt64(8, totalNo, true);
  bytes[16] = state;
  bytes[17] = winner ?? 0;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
