import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPoolState, fetchUserUtxos, fetchVaultState, sumShares } from './chain';
import {
  EMPTY_POOL,
  type MarketConfig,
  type PoolState,
} from './markets';

/** Current unix time in seconds, ticking. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function usePoolState(market: MarketConfig, refreshMs = 20000) {
  const [pool, setPool] = useState<PoolState>(EMPTY_POOL);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const marketId = useRef(market.id);

  const refresh = useCallback(async () => {
    const next = await fetchPoolState(market);
    if (marketId.current === market.id) {
      setPool(next);
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [market]);

  useEffect(() => {
    marketId.current = market.id;
    setLoading(true);
    setLoadedOnce(false);
    void refresh();
    if (refreshMs > 0) {
      const id = setInterval(() => void refresh(), refreshMs);
      return () => clearInterval(id);
    }
  }, [market, refresh, refreshMs]);

  return { pool, loading, loadedOnce, refresh };
}

export interface VaultSupplies {
  yes: bigint | null;
  no: bigint | null;
}

/** Remaining share supply in each side's ShareVault, refreshed on an interval. */
export function useVaultSupplies(market: MarketConfig, refreshMs = 20000) {
  const [supplies, setSupplies] = useState<VaultSupplies>({ yes: null, no: null });

  const refresh = useCallback(async () => {
    try {
      const [yes, no] = await Promise.all([
        fetchVaultState(market, 0),
        fetchVaultState(market, 1),
      ]);
      setSupplies({ yes: yes.supply, no: no.supply });
    } catch {
      setSupplies({ yes: null, no: null });
    }
  }, [market]);

  useEffect(() => {
    void refresh();
    if (refreshMs > 0) {
      const id = setInterval(() => void refresh(), refreshMs);
      return () => clearInterval(id);
    }
  }, [refresh, refreshMs]);

  return { supplies, refreshSupplies: refresh };
}

export interface Position {
  yesShares: bigint;
  noShares: bigint;
  loading: boolean;
}

export function usePosition(market: MarketConfig, tokenAddress: string | null) {
  const [position, setPosition] = useState<Position>({
    yesShares: 0n,
    noShares: 0n,
    loading: false,
  });

  const refresh = useCallback(async () => {
    if (!tokenAddress) {
      setPosition({ yesShares: 0n, noShares: 0n, loading: false });
      return;
    }
    setPosition((p) => ({ ...p, loading: true }));
    try {
      const utxos = await fetchUserUtxos(market.network, tokenAddress);
      setPosition({
        yesShares: sumShares(utxos, market.params.yesCategory),
        noShares: sumShares(utxos, market.params.noCategory),
        loading: false,
      });
    } catch {
      setPosition({ yesShares: 0n, noShares: 0n, loading: false });
    }
  }, [market, tokenAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { position, refreshPosition: refresh };
}
