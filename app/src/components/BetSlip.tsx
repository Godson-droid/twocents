import { useMemo, useState } from 'react';
import { explorerTxUrl } from '../lib/chain';
import {
  formatBch,
  formatSats,
  parseBchToSats,
} from '../lib/format';
import {
  claimPayout,
  estimatePayout,
  impliedYesProbability,
  type MarketConfig,
  type MarketPhase,
  type PoolState,
} from '../lib/markets';
import type { Position, VaultSupplies } from '../lib/usePool';
import { claimRefund, claimWinnings, placeBet, type SignerContext } from '../lib/tx';
import { useWallet } from '../lib/wallet';
import { useToasts } from './Toasts';

export function useSignerContext(): SignerContext | null {
  const { signer, activeAddress, activeTokenAddress, demoPrivateKey } = useWallet();
  if (!activeAddress || !activeTokenAddress) return null;
  if (signer === 'demo' && !demoPrivateKey) return null;
  return {
    kind: signer,
    address: activeAddress,
    tokenAddress: activeTokenAddress,
    privateKey: signer === 'demo' ? (demoPrivateKey ?? undefined) : undefined,
  };
}

function fmtShares(shares: bigint): string {
  return shares.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function BetSlip({
  market,
  pool,
  phase,
  supplies,
  onDone,
}: {
  market: MarketConfig;
  pool: PoolState;
  phase: MarketPhase;
  supplies: VaultSupplies;
  onDone: () => void;
}) {
  const { push } = useToasts();
  const { balanceSats, signer } = useWallet();
  const signerCtx = useSignerContext();
  const [outcome, setOutcome] = useState<0 | 1>(0);
  const [amountText, setAmountText] = useState('0.01');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = useMemo(() => parseBchToSats(amountText), [amountText]);
  const yesPrice = impliedYesProbability(pool);
  const price = outcome === 0 ? yesPrice : 1 - yesPrice;
  const payout = amount ? estimatePayout(pool, outcome, amount) : 0n;
  const profit = amount ? payout - amount : 0n;
  const supply = outcome === 0 ? supplies.yes : supplies.no;
  const overSupply = amount !== null && supply !== null && amount > supply;

  if (phase !== 'open') {
    return (
      <div className="panel">
        <h3>Betting</h3>
        <div className="notice info">
          {phase === 'closed' &&
            'Betting has closed for this market. The pool is locked while the result is settled.'}
          {phase === 'resolved' &&
            'This market has settled. Winning shares can be claimed from your position below.'}
          {phase === 'voidable' &&
            'This market was never settled, so every share refunds 1:1. Use the refund button in your position below.'}
        </div>
      </div>
    );
  }

  const place = async () => {
    if (!signerCtx || !amount) return;
    setBusy(true);
    setError(null);
    try {
      const txid = await placeBet(market, pool, signerCtx, outcome, amount);
      push({
        kind: 'ok',
        title: `Bet placed on ${outcome === 0 ? 'Yes' : 'No'}`,
        body: `${formatSats(amount)} staked. Your shares are in your wallet.`,
        link: { href: explorerTxUrl(market.network, txid), label: 'View transaction' },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The bet failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Place a bet</h3>

      <div className="outcome-toggle">
        <button
          className={`outcome-btn yes ${outcome === 0 ? 'active' : ''}`}
          onClick={() => setOutcome(0)}
        >
          <span className="side">Yes</span>
          <span className="price">{Math.round(yesPrice * 100)}¢ implied</span>
        </button>
        <button
          className={`outcome-btn no ${outcome === 1 ? 'active' : ''}`}
          onClick={() => setOutcome(1)}
        >
          <span className="side">No</span>
          <span className="price">{Math.round((1 - yesPrice) * 100)}¢ implied</span>
        </button>
      </div>

      <div className="amount-wrap">
        <label htmlFor="bet-amount">Amount</label>
        <div className="amount-row">
          <input
            id="bet-amount"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder="0.00"
          />
          <span className="unit">BCH</span>
        </div>
        <div className="amount-sub">
          {amount ? `= ${formatSats(amount)}` : 'Enter an amount'}
          {balanceSats !== null && ` · Balance ${formatBch(balanceSats)} BCH`}
        </div>
      </div>

      <div className="quick-row">
        {['0.001', '0.01', '0.05', '0.1'].map((v) => (
          <button key={v} className="quick-chip" onClick={() => setAmountText(v)}>
            {v} BCH
          </button>
        ))}
      </div>

      <div className="slip-rows">
        <div className="stat-row">
          <span className="k">Shares you receive</span>
          <span className={`v ${outcome === 0 ? 'yes' : 'no'}`}>
            {amount ? fmtShares(amount) : '—'}
          </span>
        </div>
        <div className="stat-row">
          <span className="k">Available in the {outcome === 0 ? 'Yes' : 'No'} vault</span>
          <span className="v">{supply !== null ? fmtShares(supply) : '—'}</span>
        </div>
        <div className="stat-row">
          <span className="k">Price per share</span>
          <span className="v">{Math.round(price * 100)}¢</span>
        </div>
        <div className="stat-row">
          <span className="k">Payout if you are right</span>
          <span className="v">{amount ? `${formatBch(payout)} BCH` : '—'}</span>
        </div>
        <div className="stat-row">
          <span className="k">Potential profit</span>
          <span className="v">{amount ? `+${formatBch(profit)} BCH` : '—'}</span>
        </div>
      </div>

      {!pool.found && (
        <div className="notice" style={{ marginBottom: 12 }}>
          The pool contract is not live on {market.network} yet, so betting is paused.
          The market opens as soon as its covenant is funded.
        </div>
      )}
      {pool.found && !pool.live && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Betting needs the live connection to the Bitcoin Cash network, which this
          browser could not open. The odds shown are the last verified on chain state.
        </div>
      )}
      {overSupply && (
        <div className="notice" style={{ marginBottom: 12 }}>
          Only {supply !== null ? fmtShares(supply) : '0'} shares remain in this side’s
          vault. Lower your bet to continue.
        </div>
      )}
      {error && (
        <p className="err-text" style={{ marginTop: 0 }}>
          {error}
        </p>
      )}

      <button
        className={`btn btn-lg btn-block ${outcome === 0 ? 'btn-primary' : 'btn-no'}`}
        disabled={busy || !amount || !signerCtx || !pool.live || overSupply}
        onClick={() => void place()}
      >
        {busy ? (
          <>
            <span className="spinner" />{' '}
            {signer === 'wizard' ? 'Waiting for wallet signature…' : 'Broadcasting…'}
          </>
        ) : (
          `Bet ${outcome === 0 ? 'Yes' : 'No'}`
        )}
      </button>
      <p className="faint" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Shares release 1:1 from the market’s vault for the sats you stake and live in
        your wallet as CashTokens. Winners split the whole pool.
      </p>
    </div>
  );
}

export function PositionPanel({
  market,
  pool,
  phase,
  position,
  onDone,
}: {
  market: MarketConfig;
  pool: PoolState;
  phase: MarketPhase;
  position: Position;
  onDone: () => void;
}) {
  const { push } = useToasts();
  const signerCtx = useSignerContext();
  const [busy, setBusy] = useState<'claim' | 'refund' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const winningShares =
    pool.winner === 0 ? position.yesShares : pool.winner === 1 ? position.noShares : 0n;
  const estClaim = claimPayout(pool, winningShares);
  const totalShares = position.yesShares + position.noShares;
  const hasPosition = totalShares > 0n;

  const run = async (kind: 'claim' | 'refund') => {
    if (!signerCtx) return;
    setBusy(kind);
    setError(null);
    try {
      const txid =
        kind === 'claim'
          ? await claimWinnings(market, pool, signerCtx)
          : await claimRefund(market, pool, signerCtx);
      push({
        kind: 'ok',
        title: kind === 'claim' ? 'Winnings claimed' : 'Refund claimed',
        body: 'The sats are on their way to your wallet.',
        link: { href: explorerTxUrl(market.network, txid), label: 'View transaction' },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The transaction failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel section-gap">
      <h3>Your position</h3>
      <div className="pos-grid">
        <div className="pos-tile yes">
          <div className="k">Yes shares</div>
          <div className="v">{fmtShares(position.yesShares)}</div>
        </div>
        <div className="pos-tile no">
          <div className="k">No shares</div>
          <div className="v">{fmtShares(position.noShares)}</div>
        </div>
      </div>

      {!hasPosition && (
        <p className="muted" style={{ marginBottom: 0 }}>
          No shares yet. When you bet, your outcome shares land in the active wallet as
          CashTokens.
        </p>
      )}

      {phase === 'resolved' && winningShares > 0n && (
        <div style={{ marginTop: 14 }}>
          <div className="stat-row">
            <span className="k">Claimable winnings</span>
            <span className="v">{formatBch(estClaim)} BCH</span>
          </div>
          {error && <p className="err-text">{error}</p>}
          <button
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: 10 }}
            disabled={busy !== null || !signerCtx}
            onClick={() => void run('claim')}
          >
            {busy === 'claim' ? (
              <>
                <span className="spinner" /> Claiming…
              </>
            ) : (
              'Claim winnings'
            )}
          </button>
        </div>
      )}

      {phase === 'resolved' && hasPosition && winningShares === 0n && (
        <p className="muted" style={{ marginBottom: 0 }}>
          This market settled against your shares, so there is nothing to claim.
        </p>
      )}

      {phase === 'voidable' && hasPosition && (
        <div style={{ marginTop: 14 }}>
          <div className="stat-row">
            <span className="k">Refundable (1:1)</span>
            <span className="v">{formatBch(totalShares)} BCH</span>
          </div>
          {error && <p className="err-text">{error}</p>}
          <button
            className="btn btn-primary btn-block btn-lg"
            style={{ marginTop: 10 }}
            disabled={busy !== null || !signerCtx}
            onClick={() => void run('refund')}
          >
            {busy === 'refund' ? (
              <>
                <span className="spinner" /> Refunding…
              </>
            ) : (
              'Refund my shares'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
