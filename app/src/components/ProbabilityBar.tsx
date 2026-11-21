import { formatPct } from '../lib/format';
import type { PoolState } from '../lib/markets';
import { impliedYesProbability } from '../lib/markets';

export function ProbabilityBar({
  pool,
  large = false,
  loading = false,
}: {
  pool: PoolState;
  large?: boolean;
  loading?: boolean;
}) {
  const p = impliedYesProbability(pool);
  const yesPct = Math.round(p * 100);
  return (
    <div className={large ? 'pbar-lg' : ''}>
      <div className="pbar-labels">
        <span className="pbar-yes-label">
          {loading ? '—' : formatPct(p)}
          <small>YES</small>
        </span>
        <span className="pbar-no-label">
          <small>NO</small>
          {loading ? '—' : formatPct(1 - p)}
        </span>
      </div>
      <div className="pbar" role="img" aria-label={`Yes ${yesPct} percent`}>
        <div className="pbar-yes" style={{ width: `${loading ? 50 : yesPct}%` }} />
      </div>
    </div>
  );
}
