import { useState } from 'react';
import { explorerAddressUrl, explorerTxUrl } from '../lib/chain';
import {
  countdown,
  formatBch,
  formatDateTime,
  shortValue,
} from '../lib/format';
import {
  marketPhase,
  type MarketConfig,
  type PoolState,
} from '../lib/markets';
import { closeBetting } from '../lib/tx';
import { useNow, usePoolState, usePosition, useVaultSupplies } from '../lib/usePool';
import { useWallet } from '../lib/wallet';
import { PhaseBadge } from './Badge';
import { BetSlip, PositionPanel, useSignerContext } from './BetSlip';
import { ProbabilityBar } from './ProbabilityBar';
import { useToasts } from './Toasts';

function fmtShares(shares: bigint): string {
  return shares.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Shown when the betting deadline has passed but the pool is still in
 * state 0: anyone can freeze betting on chain with close().
 */
function CloseBettingPanel({
  market,
  pool,
  onDone,
}: {
  market: MarketConfig;
  pool: PoolState;
  onDone: () => void;
}) {
  const { push } = useToasts();
  const signerCtx = useSignerContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = async () => {
    if (!signerCtx) return;
    setBusy(true);
    setError(null);
    try {
      const txid = await closeBetting(market, pool, signerCtx);
      push({
        kind: 'ok',
        title: 'Betting closed on chain',
        body: 'The pool is frozen while the result is settled.',
        link: { href: explorerTxUrl(market.network, txid), label: 'View transaction' },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Closing failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <h3>Close betting</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        The betting deadline has passed. Anyone can freeze this market on chain —
        closing writes the Closed state into the pool so the result can be settled.
        You only pay the network fee.
      </p>
      {error && <p className="err-text">{error}</p>}
      <button
        className="btn btn-primary btn-block"
        disabled={busy || !signerCtx}
        onClick={() => void close()}
      >
        {busy ? (
          <>
            <span className="spinner" /> Closing…
          </>
        ) : (
          'Close betting on chain'
        )}
      </button>
    </div>
  );
}

export function MarketDetail({
  market,
  onBack,
}: {
  market: MarketConfig;
  onBack: () => void;
}) {
  const { pool, loading, refresh } = usePoolState(market, 15000);
  const now = useNow(1000);
  const phase = marketPhase(market, pool, now);
  const { activeTokenAddress, refreshBalance } = useWallet();
  const { position, refreshPosition } = usePosition(market, activeTokenAddress);
  const { supplies, refreshSupplies } = useVaultSupplies(market, 15000);

  const onDone = () => {
    void refresh();
    void refreshPosition();
    void refreshBalance();
    void refreshSupplies();
  };

  return (
    <div>
      <button className="back-link" onClick={onBack}>
        ← All markets
      </button>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <span className="cat-chip">{market.category}</span>
        <PhaseBadge phase={phase} pool={pool} />
        <span className="cat-chip">{market.network}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onDone}>
          Refresh
        </button>
      </div>

      <h1 className="detail-q">{market.question}</h1>
      <p className="detail-detail" style={{ maxWidth: 720 }}>
        {market.detail}
      </p>

      <div className="detail-grid">
        <div className="panel">
          <h3>Market odds</h3>
          {loading && !pool.found && pool.error ? (
            <div>
              <div className="skeleton" style={{ height: 52, marginBottom: 12 }} />
              <div className="skeleton" style={{ height: 14 }} />
            </div>
          ) : (
            <ProbabilityBar pool={pool} large />
          )}

          <div style={{ marginTop: 18 }}>
            <div className="stat-row">
              <span className="k">Total pool</span>
              <span className="v">{formatBch(pool.poolSats)} BCH</span>
            </div>
            <div className="stat-row">
              <span className="k">Staked on Yes</span>
              <span className="v">{formatBch(pool.totalYes)} BCH</span>
            </div>
            <div className="stat-row">
              <span className="k">Staked on No</span>
              <span className="v">{formatBch(pool.totalNo)} BCH</span>
            </div>
            <div className="stat-row">
              <span className="k">Yes shares in vault</span>
              <span className="v">
                {supplies.yes !== null ? fmtShares(supplies.yes) : '—'}
              </span>
            </div>
            <div className="stat-row">
              <span className="k">No shares in vault</span>
              <span className="v">
                {supplies.no !== null ? fmtShares(supplies.no) : '—'}
              </span>
            </div>
            <div className="stat-row">
              <span className="k">Betting closes</span>
              <span className="v">
                {formatDateTime(market.params.bettingDeadline)}
                {phase === 'open' && ` (${countdown(market.params.bettingDeadline, now)})`}
              </span>
            </div>
            <div className="stat-row">
              <span className="k">Void deadline</span>
              <span className="v">{formatDateTime(market.params.voidDeadline)}</span>
            </div>
            <div className="stat-row">
              <span className="k">Contract</span>
              <span className="v">
                <a
                  href={explorerAddressUrl(market.network, market.address)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortValue(market.address, 16, 8)}
                </a>
              </span>
            </div>
            <div className="stat-row">
              <span className="k">State token</span>
              <span className="v">{shortValue(market.stateCategory, 12, 6)}</span>
            </div>
          </div>

          {!pool.found && (
            <div className="notice" style={{ marginTop: 16 }}>
              {pool.error === 'Pool not live yet'
                ? 'This market’s covenant has not been funded on chain yet. Odds sit at 50/50 until the pool goes live.'
                : `Live pool data is unavailable right now (${pool.error ?? 'network error'}). Odds are shown at 50/50.`}
            </div>
          )}
          {pool.found && !pool.live && (
            <div className="notice" style={{ marginTop: 16 }}>
              This browser could not open the live connection to the Bitcoin Cash
              network, so this page shows the pool state last verified on chain
              {market.snapshot ? ` (${market.snapshot.asOf})` : ''}. The figures are
              real; betting and claims need the live connection.
            </div>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            Odds come straight from the covenant's on-chain state: every sat staked on a
            side releases one share from that side's vault, and the implied price is
            that side's share of the pool.
            After the result is settled, winning shares redeem pro-rata from the whole
            pool. If the market is never settled by the void deadline, all shares refund
            1:1.
          </p>
        </div>

        <div>
          {phase === 'closed' && pool.state === 0 && (
            <CloseBettingPanel market={market} pool={pool} onDone={onDone} />
          )}
          <BetSlip
            market={market}
            pool={pool}
            phase={phase}
            supplies={supplies}
            onDone={onDone}
          />
          <PositionPanel
            market={market}
            pool={pool}
            phase={phase}
            position={position}
            onDone={onDone}
          />
        </div>
      </div>
    </div>
  );
}
