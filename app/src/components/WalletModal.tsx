import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatBch, formatSats, shortValue } from '../lib/format';
import { useWallet } from '../lib/wallet';
import { useWizard, wizardService } from '../lib/wizard';
import { useToasts } from './Toasts';

function useQrImage(text: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!text) {
      setSrc(null);
      return;
    }
    QRCode.toDataURL(text, { width: 360, margin: 1 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [text]);
  return src;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function DemoWalletTab() {
  const {
    network,
    walletReady,
    walletError,
    demoAddress,
    demoTokenAddress,
    demoWif,
    balanceSats,
    balanceLoading,
    refreshBalance,
    createDemoWallet,
    importDemoWallet,
  } = useWallet();
  const { push } = useToasts();
  const qr = useQrImage(demoTokenAddress ?? demoAddress);
  const [showWif, setShowWif] = useState(false);
  const [importValue, setImportValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  if (!walletReady) {
    return (
      <div>
        <div className="skeleton" style={{ height: 18, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 18, width: '70%' }} />
        {walletError && <p className="err-text">{walletError}</p>}
        <p className="muted" style={{ marginTop: 10 }}>
          Creating your browser wallet…
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        A full wallet that lives in this browser, generated with mainnet-js. Created in
        your browser, and your keys never leave this device. Fund it and you can bet,
        claim and refund on {network} straight away — no extension, no sign-up.
      </p>

      {qr && (
        <div className="qr-wrap">
          <img src={qr} alt="Wallet deposit QR code" />
        </div>
      )}

      <label className="faint" style={{ fontSize: 12, fontWeight: 600 }}>
        DEPOSIT ADDRESS (TOKEN-AWARE)
      </label>
      <div className="addr-box" style={{ margin: '6px 0 8px' }}>
        {demoTokenAddress}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {demoTokenAddress && <CopyButton value={demoTokenAddress} label="Copy address" />}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void refreshBalance()}
          disabled={balanceLoading}
        >
          {balanceLoading ? 'Checking…' : 'Refresh balance'}
        </button>
      </div>

      <div className="stat-row" style={{ marginTop: 14 }}>
        <span className="k">Balance</span>
        <span className="v">
          {balanceSats === null
            ? 'Unavailable'
            : `${formatBch(balanceSats)} BCH (${formatSats(balanceSats)})`}
        </span>
      </div>
      <div className="stat-row">
        <span className="k">Network</span>
        <span className="v">{network === 'mainnet' ? 'Bitcoin Cash mainnet' : 'Chipnet (test BCH)'}</span>
      </div>

      {network === 'chipnet' ? (
        <div className="notice info" style={{ marginTop: 14 }}>
          Need test coins? Send chipnet BCH to the address above from a chipnet faucet
          such as tbch.googol.cash, or from any chipnet wallet.
        </div>
      ) : (
        <div className="notice" style={{ marginTop: 14 }}>
          This wallet is on mainnet. Only send real BCH you are happy to bet with.
        </div>
      )}

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowWif((s) => !s)}>
          {showWif ? 'Hide backup key (WIF)' : 'Show backup key (WIF)'}
        </button>
        {showWif && demoWif && (
          <>
            <div className="addr-box">{demoWif}</div>
            <div className="notice">
              Anyone with this key controls the wallet. It is stored only in this
              browser's local storage — back it up somewhere private.
            </div>
          </>
        )}

        <textarea
          className="wif-input"
          rows={2}
          placeholder="Import a wallet instead: paste a WIF private key"
          value={importValue}
          onChange={(e) => setImportValue(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!importValue.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await importDemoWallet(importValue);
                setImportValue('');
                push({ kind: 'ok', title: 'Wallet imported' });
              } catch {
                push({ kind: 'err', title: 'That WIF did not work', body: 'Check the key and try again.' });
              } finally {
                setBusy(false);
              }
            }}
          >
            Import wallet
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={async () => {
              if (!confirmNew) {
                setConfirmNew(true);
                return;
              }
              setBusy(true);
              try {
                await createDemoWallet();
                setConfirmNew(false);
                push({ kind: 'ok', title: 'New browser wallet created', body: 'The old key was replaced in this browser.' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmNew ? 'Confirm: replace wallet' : 'Create new wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WizardTab() {
  const wizard = useWizard();
  const { network, setSigner } = useWallet();
  const qr = useQrImage(wizard.status === 'waiting' ? wizard.uri : null);

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        WizardConnect is Bitcoin Cash's HD-wallet protocol: an encrypted Nostr relay
        links this page to a wallet app such as Paytaca or Cashonize. The wallet shares
        public keys only — your seed never leaves your phone — and signs each bet after
        you approve it.
      </p>

      {wizard.status === 'idle' && (
        <button
          className="btn btn-primary btn-block btn-lg"
          onClick={() => wizardService.connect()}
        >
          Connect a wallet
        </button>
      )}

      {wizard.status === 'waiting' && (
        <div>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Scan with your wallet app</p>
          <p className="muted" style={{ marginTop: 0 }}>
            Open Paytaca or Cashonize and scan this code to pair. This page updates on
            its own when the wallet answers.
          </p>
          {qr ? (
            <div className="qr-wrap">
              <img src={qr} alt="WizardConnect pairing QR code" />
            </div>
          ) : (
            <div className="skeleton" style={{ height: 180 }} />
          )}
          <div className="addr-box" style={{ marginBottom: 10 }}>
            {wizard.uri ? shortValue(wizard.uri, 42, 18) : 'Opening relay…'}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => void wizardService.disconnect()}>
            Cancel
          </button>
        </div>
      )}

      {wizard.status === 'connected' && (
        <div>
          <div className="notice info">
            Connected{wizard.walletName ? ` to ${wizard.walletName}` : ''}. New bets and
            claims will ask this wallet to sign.
          </div>
          <div className="stat-row" style={{ marginTop: 12 }}>
            <span className="k">Signing address ({network})</span>
            <span className="v">{wizard.address ? shortValue(wizard.address, 14, 10) : '…'}</span>
          </div>
          {wizard.tokenAddress && (
            <div className="addr-box" style={{ margin: '8px 0' }}>{wizard.tokenAddress}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setSigner('wizard')}>
              Use this wallet
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void wizardService.disconnect()}>
              Disconnect
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Fund the address above on {network} to bet with it. Share balances and
            positions are read for whichever wallet is active.
          </p>
        </div>
      )}

      {wizard.status === 'error' && (
        <div>
          <p className="err-text">{wizard.error ?? 'WizardConnect hit a problem.'}</p>
          <button className="btn btn-primary btn-block" onClick={() => wizardService.connect()}>
            Try again
          </button>
        </div>
      )}

      <p className="faint" style={{ fontSize: 12.5, marginTop: 16 }}>
        No wallet handy? The browser wallet tab works on its own — it is a real wallet,
        generated locally in your browser.
      </p>
    </div>
  );
}

export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'demo' | 'wizard'>('demo');
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>Wallet</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="wallet-tabs">
          <button className={`wallet-tab ${tab === 'demo' ? 'active' : ''}`} onClick={() => setTab('demo')}>
            Browser wallet
          </button>
          <button className={`wallet-tab ${tab === 'wizard' ? 'active' : ''}`} onClick={() => setTab('wizard')}>
            WizardConnect
          </button>
        </div>
        {tab === 'demo' ? <DemoWalletTab /> : <WizardTab />}
      </div>
    </div>
  );
}
