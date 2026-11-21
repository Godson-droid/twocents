import { useState } from 'react';
import { Header } from './components/Header';
import { MarketCard } from './components/MarketCard';
import { MarketDetail } from './components/MarketDetail';
import { ToastProvider } from './components/Toasts';
import { WalletModal } from './components/WalletModal';
import { MARKETS, type MarketConfig } from './lib/markets';
import { WalletProvider, useWallet } from './lib/wallet';

type View = { name: 'home' } | { name: 'market'; market: MarketConfig };

const PROOF_TX = 'https://blockchair.com/bitcoin-cash/transaction/';

function SettledProof() {
  const steps = [
    { label: 'Market created on mainnet', txid: '805138f34cf7a3884f84adebebdb81f099bf00b7d0a78cfe3981723d94ec2d32' },
    { label: 'Bet 15,000 sats on Yes', txid: '39054fba4805aaa6b9060d13fe76002184b0126856c950a8bad96e50aacbe9fc' },
    { label: 'Bet 15,000 sats on No', txid: '1a3bd1b68733dc60d9b0c6fe0bbfae46e88ab656db46d8e9aa4649a287608c22' },
    { label: 'Settled: Yes wins', txid: '112f745d993d4e31de772a3f4a62e9a4ac3e7b6ecf9e9de077dfedad404134b6' },
    { label: 'Whole 40,000 sat pool claimed', txid: '77df3fa693829038930ace33780f45af093ac6c36f3f50b8a1fe2491b18c503c' },
  ];
  return (
    <div className="proof-card">
      <div className="proof-head">
        <span className="badge badge-resolved">Settled on mainnet</span>
        <span className="proof-q">
          Will the BCH tip pass block 978268 before this market closes?
        </span>
      </div>
      <p className="muted" style={{ margin: 0, maxWidth: 760 }}>
        This market ran its whole life on mainnet on 21 November 2026, inside one
        morning. The block arrived before the deadline, the market settled Yes, and
        the winning shares took the entire pool. Every step is a public transaction:
      </p>
      <div className="proof-steps">
        {steps.map((s, i) => (
          <a
            key={s.txid}
            className="proof-step"
            href={`${PROOF_TX}${s.txid}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="proof-n">{i + 1}</span>
            <span className="proof-label">{s.label}</span>
            <span className="proof-tx">{s.txid.slice(0, 10)}…</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Fund a wallet',
      body: 'The built-in demo wallet is generated in your browser with mainnet-js. Send it a little mainnet BCH and you are ready, or pair a real wallet over WizardConnect.',
    },
    {
      n: '02',
      title: 'Buy Yes or No shares',
      body: 'Every sat you stake releases one outcome share from the market’s on-chain vault, held in your wallet as a CashToken. The price is simply each side’s share of the pool, updated on every bet.',
    },
    {
      n: '03',
      title: 'Winners split the pool',
      body: 'A CashScript covenant holds every sat. When the result settles, winning shares redeem pro-rata from the whole pool. Never settled? Shares refund 1:1.',
    },
  ];
  return (
    <div className="grid" style={{ marginTop: 6 }}>
      {steps.map((s) => (
        <div className="card" key={s.n}>
          <div className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {s.n}
          </div>
          <h3 className="card-q" style={{ minHeight: 0 }}>
            {s.title}
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            {s.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function Shell() {
  const [view, setView] = useState<View>({ name: 'home' });
  const [walletOpen, setWalletOpen] = useState(false);
  const { setNetwork } = useWallet();

  const openMarket = (market: MarketConfig) => {
    setNetwork(market.network);
    setView({ name: 'market', market });
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <Header onHome={() => setView({ name: 'home' })} onWallet={() => setWalletOpen(true)} />
      <main className="shell">
        {view.name === 'home' ? (
          <>
            <section className="hero">
              <h1>
                Put your money where <span className="hl">your mouth is.</span>
              </h1>
              <p>
                Two Cents is a prediction market that settles itself. Every pool is held
                by a CashScript covenant on Bitcoin Cash, every position is a CashToken
                in your own wallet, and winners split the pool — no bookmaker, no
                custodian, no trust required.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-primary btn-lg" href="#markets">
                  Browse live markets
                </a>
                <button className="btn btn-ghost btn-lg" onClick={() => setWalletOpen(true)}>
                  Open the demo wallet
                </button>
              </div>
              <div className="hero-stats">
                <div className="hero-stat">
                  <div className="v">{MARKETS.length}</div>
                  <div className="k">Live markets</div>
                </div>
                <div className="hero-stat">
                  <div className="v">1 sat = 1 share</div>
                  <div className="k">Minting rate</div>
                </div>
                <div className="hero-stat">
                  <div className="v">100%</div>
                  <div className="k">On-chain settlement</div>
                </div>
              </div>
            </section>

            <div className="section-head" id="markets">
              <h2>Markets</h2>
              <span className="sub">Odds update from the chain, about every 30 seconds</span>
            </div>
            <div className="grid">
              {MARKETS.map((market) => (
                <MarketCard key={market.id} market={market} onOpen={openMarket} />
              ))}
            </div>

            <div className="section-head">
              <h2>Already settled, in full, on mainnet</h2>
            </div>
            <SettledProof />

            <div className="section-head">
              <h2>How it works</h2>
            </div>
            <HowItWorks />
          </>
        ) : (
          <MarketDetail market={view.market} onBack={() => setView({ name: 'home' })} />
        )}

        <footer className="footer">
          <span>
            Two Cents — built for BCH BLAZE 2026. Pools are CashScript covenants on
            Bitcoin Cash; shares are CashTokens.
          </span>
          <span>Demo wallet keys never leave your browser.</span>
        </footer>
      </main>
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </WalletProvider>
  );
}
