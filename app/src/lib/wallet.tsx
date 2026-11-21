import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TestNetWallet, Wallet } from 'mainnet-js';
import { fetchUserUtxos, sumBch } from './chain';
import type { NetworkName } from './markets';
import { useWizard, wizardService } from './wizard';

const WIF_KEY = 'twocents-demo-wif';

export type SignerKind = 'demo' | 'wizard';

interface WalletContextValue {
  network: NetworkName;
  setNetwork: (network: NetworkName) => void;

  /** Demo wallet (mainnet-js), persisted by WIF in localStorage. */
  walletReady: boolean;
  walletError: string | null;
  demoAddress: string | null;
  demoTokenAddress: string | null;
  demoPrivateKey: Uint8Array | null;
  demoWif: string | null;
  balanceSats: bigint | null;
  balanceLoading: boolean;
  refreshBalance: () => Promise<void>;
  createDemoWallet: () => Promise<void>;
  importDemoWallet: (wif: string) => Promise<void>;

  /** Which signer new transactions use. */
  signer: SignerKind;
  setSigner: (signer: SignerKind) => void;
  activeAddress: string | null;
  activeTokenAddress: string | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

async function buildWallet(network: NetworkName, wif: string): Promise<Wallet> {
  return network === 'mainnet'
    ? Wallet.fromWIF(wif)
    : TestNetWallet.fromWIF(wif);
}

async function randomWallet(network: NetworkName): Promise<Wallet> {
  return network === 'mainnet' ? Wallet.newRandom() : TestNetWallet.newRandom();
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkName>('mainnet');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [balanceSats, setBalanceSats] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [signer, setSigner] = useState<SignerKind>('demo');
  const initStarted = useRef(false);
  const wizard = useWizard();

  const demoAddress = wallet?.getDepositAddress() ?? null;
  const demoTokenAddress = wallet?.getTokenDepositAddress() ?? null;

  const loadFromWif = useCallback(async (wif: string, net: NetworkName) => {
    const instance = await buildWallet(net, wif);
    setWallet(instance);
    setWalletError(null);
    return instance;
  }, []);

  // First load: restore the stored demo wallet, or create one so a judge
  // can transact immediately. The WIF never leaves this browser.
  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    (async () => {
      try {
        const stored = localStorage.getItem(WIF_KEY);
        if (stored) {
          try {
            await loadFromWif(stored, 'mainnet');
            return;
          } catch {
            // A WIF stored by an earlier testnet build cannot load as a
            // mainnet wallet. Discard it and start fresh on mainnet.
            localStorage.removeItem(WIF_KEY);
          }
        }
        const instance = await randomWallet('mainnet');
        localStorage.setItem(WIF_KEY, instance.privateKeyWif);
        setWallet(instance);
      } catch (err) {
        setWalletError(
          err instanceof Error ? err.message : 'Could not initialise the browser wallet',
        );
      }
    })();
  }, [loadFromWif]);

  const setNetwork = useCallback(
    (next: NetworkName) => {
      setNetworkState(next);
      wizardService.setNetwork(next);
      setBalanceSats(null);
      const wif = localStorage.getItem(WIF_KEY);
      if (wif) {
        buildWallet(next, wif)
          .then(setWallet)
          .catch((err) =>
            setWalletError(err instanceof Error ? err.message : 'Wallet error'),
          );
      }
    },
    [],
  );

  const refreshBalance = useCallback(async () => {
    if (!demoTokenAddress) return;
    setBalanceLoading(true);
    try {
      const utxos = await fetchUserUtxos(network, demoTokenAddress);
      setBalanceSats(sumBch(utxos));
    } catch {
      setBalanceSats(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [network, demoTokenAddress]);

  useEffect(() => {
    if (demoTokenAddress) void refreshBalance();
  }, [demoTokenAddress, refreshBalance]);

  const createDemoWallet = useCallback(async () => {
    const instance = await randomWallet(network);
    localStorage.setItem(WIF_KEY, instance.privateKeyWif);
    setWallet(instance);
    setWalletError(null);
    setSigner('demo');
  }, [network]);

  const importDemoWallet = useCallback(
    async (wif: string) => {
      const instance = await buildWallet(network, wif.trim());
      localStorage.setItem(WIF_KEY, instance.privateKeyWif);
      setWallet(instance);
      setWalletError(null);
      setSigner('demo');
    },
    [network],
  );

  // Prefer the WizardConnect wallet while it is connected.
  useEffect(() => {
    if (wizard.status === 'connected') setSigner('wizard');
    else if (signer === 'wizard') setSigner('demo');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.status]);

  const value = useMemo<WalletContextValue>(() => {
    const wizardActive = signer === 'wizard' && wizard.status === 'connected';
    return {
      network,
      setNetwork,
      walletReady: wallet !== null,
      walletError,
      demoAddress,
      demoTokenAddress,
      demoPrivateKey: wallet?.privateKey ?? null,
      demoWif: wallet?.privateKeyWif ?? null,
      balanceSats,
      balanceLoading,
      refreshBalance,
      createDemoWallet,
      importDemoWallet,
      signer,
      setSigner,
      activeAddress: wizardActive ? wizard.address : demoAddress,
      activeTokenAddress: wizardActive ? wizard.tokenAddress : demoTokenAddress,
    };
  }, [
    network,
    setNetwork,
    wallet,
    walletError,
    demoAddress,
    demoTokenAddress,
    balanceSats,
    balanceLoading,
    refreshBalance,
    createDemoWallet,
    importDemoWallet,
    signer,
    wizard,
  ]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
