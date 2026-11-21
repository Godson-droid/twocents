import type { MarketPhase, PoolState } from '../lib/markets';

export function phaseLabel(phase: MarketPhase, pool: PoolState): string {
  switch (phase) {
    case 'open':
      return 'Open';
    case 'closed':
      return 'Betting closed';
    case 'resolved':
      return pool.winner === 0 ? 'Resolved · Yes' : 'Resolved · No';
    case 'voidable':
      return 'Voidable';
  }
}

export function PhaseBadge({ phase, pool }: { phase: MarketPhase; pool: PoolState }) {
  const cls =
    phase === 'open'
      ? 'badge-open'
      : phase === 'resolved'
        ? 'badge-resolved'
        : phase === 'voidable'
          ? 'badge-void'
          : 'badge-closed';
  return <span className={`badge ${cls}`}>{phaseLabel(phase, pool)}</span>;
}
