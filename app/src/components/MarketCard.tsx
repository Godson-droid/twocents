import { countdown, formatBch } from '../lib/format';
import {
  marketPhase,
  type MarketConfig,
} from '../lib/markets';
import { useNow, usePoolState } from '../lib/usePool';
import { PhaseBadge } from './Badge';
import { ProbabilityBar } from './ProbabilityBar';

export function MarketCard({
  market,
  onOpen,
}: {
  market: MarketConfig;
  onOpen: (market: MarketConfig) => void;
}) {
  const { pool, loading, loadedOnce } = usePoolState(market, 30000);
  const now = useNow(5000);
  const phase = marketPhase(market, pool, now);
  const totalShares = pool.totalYes + pool.totalNo;

  return (
    <article
      className="card clickable"
      onClick={() => onOpen(market)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(market);
      }}
    >
      <div className="card-top">
        <span className="cat-chip">{market.category}</span>
        <span style={{ flex: 1 }} />
        {loadedOnce ? (
          <PhaseBadge phase={phase} pool={pool} />
        ) : (
          <span className="skeleton" style={{ width: 74 }} />
        )}
      </div>

      <h3 className="card-q">{market.question}</h3>

      {loading && !loadedOnce ? (
        <div>
          <div className="skeleton" style={{ height: 30, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 10 }} />
        </div>
      ) : (
        <ProbabilityBar pool={pool} />
      )}

      <div className="card-meta">
        <span>
          Pool
          <br />
          <span className="v">
            {loadedOnce ? `${formatBch(pool.poolSats)} BCH` : '…'}
          </span>
        </span>
        <span>
          Staked
          <br />
          <span className="v">
            {loadedOnce ? `${formatBch(totalShares)} BCH` : '…'}
          </span>
        </span>
        <span style={{ textAlign: 'right' }}>
          {phase === 'open' ? 'Closes' : phase === 'voidable' ? 'Void since' : 'Status'}
          <br />
          <span className="v">
            {phase === 'open'
              ? countdown(market.params.bettingDeadline, now)
              : phase === 'voidable'
                ? 'Refunds open'
                : phase === 'resolved'
                  ? 'Settled'
                  : 'Closed'}
          </span>
        </span>
      </div>
      {!pool.found && loadedOnce && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          Pool contract is not live on {market.network} yet — odds shown at 50/50.
        </div>
      )}
      {pool.found && !pool.live && loadedOnce && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          Live connection unavailable in this browser. Showing the on chain state
          last verified {market.snapshot?.asOf ?? ''}.
        </div>
      )}
    </article>
  );
}
