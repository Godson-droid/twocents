import { useState } from 'react';
import { Header } from './components/Header';
import { MarketCard } from './components/MarketCard';
import { MarketDetail } from './components/MarketDetail';
import { ToastProvider } from './components/Toasts';
import { WalletModal } from './components/WalletModal';
import { MARKETS, type MarketConfig } from './lib/markets';
import { WalletProvider, useWallet } from './lib/wallet';

type View = { name: 'home' } | { name: 'market'; market: MarketConfig };

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Fund a wallet',
      body: 'The built-in demo wallet is generated in your browser with mainnet-js. Add chipnet or mainnet BCH and you are ready — or pair a real wallet over WizardConnect.',
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

            <div className="section-head">
              <h2>Markets</h2>
              <span className="sub">Odds update from the chain, about every 30 seconds</span>
            </div>
            <div className="grid">
              {MARKETS.map((market) => (
                <MarketCard key={market.id} market={market} onOpen={openMarket} />
              ))}
            </div>

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
