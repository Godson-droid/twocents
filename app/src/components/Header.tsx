import { shortValue } from '../lib/format';
import { useWallet } from '../lib/wallet';

export function Header({ onHome, onWallet }: { onHome: () => void; onWallet: () => void }) {
  const { network, activeAddress, signer } = useWallet();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <button className="brand" onClick={onHome} aria-label="Two Cents home">
          <span className="brand-mark">2¢</span>
          <span>
            <span className="brand-name">Two Cents</span>
            <br />
            <span className="brand-tag">Put your money where your mouth is</span>
          </span>
        </button>
        <div className="topbar-spacer" />
        <span className="net-pill">
          <span className={`net-dot ${network === 'mainnet' ? 'mainnet' : ''}`} />
          {network === 'mainnet' ? 'BCH Mainnet' : 'BCH Chipnet'}
        </span>
        <button className="btn btn-ghost" onClick={onWallet}>
          {activeAddress ? (
            <>
              <span className="mono">{shortValue(activeAddress, 8, 6)}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {signer === 'wizard' ? 'WizardConnect' : 'Demo wallet'}
              </span>
            </>
          ) : (
            'Connect wallet'
          )}
        </button>
      </div>
    </header>
  );
}
