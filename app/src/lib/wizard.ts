import { useSyncExternalStore } from 'react';
import { initiateDappRelay } from '@wizardconnect/core';
import { DappConnectionManager } from '@wizardconnect/dapp';
import { CashAddressType, encodeCashAddress, hash160 } from '@bitauth/libauth';
import type { TransactionBuilder } from 'cashscript';
import type { NetworkName } from './markets';

/**
 * WizardConnect integration (Riften Labs protocol, docs.riftenlabs.com).
 *
 * Flow: the dapp opens an encrypted Nostr relay channel and shows a
 * connection URI (QR). A WizardConnect wallet (Paytaca mobile, Cashonize)
 * scans it, the two sides exchange keys (NIP-17 gift wrap), and the wallet
 * delivers BIP32 xpubs for named paths (receive / change / defi) in its
 * `wallet_ready` message. The dapp then derives addresses locally and asks
 * the wallet to sign transactions with `sign_transaction_request`, naming
 * the HD path of every wallet input via `inputPaths`.
 */

export type WizardStatus =
  | 'idle'
  | 'waiting' // relay open, waiting for a wallet to scan / connect
  | 'connected'
  | 'error';

export interface WizardSnapshot {
  status: WizardStatus;
  uri: string | null;
  walletName: string | null;
  /** Receive-path (index 0) addresses derived from the wallet xpub. */
  address: string | null; // plain p2pkh cashaddr (network-dependent, set on derive)
  tokenAddress: string | null;
  error: string | null;
}

const IDLE: WizardSnapshot = {
  status: 'idle',
  uri: null,
  walletName: null,
  address: null,
  tokenAddress: null,
  error: null,
};

type RelayHandle = ReturnType<typeof initiateDappRelay>;

class WizardService {
  private manager: DappConnectionManager | null = null;
  private relay: RelayHandle | null = null;
  private snapshot: WizardSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private network: NetworkName = 'chipnet';

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WizardSnapshot => this.snapshot;

  private setSnapshot(next: Partial<WizardSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((l) => l());
  }

  setNetwork(network: NetworkName) {
    if (network === this.network) return;
    this.network = network;
    // Re-derive addresses for the new network prefix if we hold a pubkey.
    if (this.manager && this.snapshot.status === 'connected') {
      this.deriveAddresses();
    }
  }

  connect() {
    if (this.manager) return;
    try {
      const manager = new DappConnectionManager('Two Cents');
      this.manager = manager;

      manager.on('walletready', (msg: { wallet_name?: string }) => {
        this.setSnapshot({
          status: 'connected',
          walletName: msg.wallet_name ?? manager.walletName ?? 'WizardConnect wallet',
          error: null,
        });
        this.deriveAddresses();
      });

      manager.on('disconnect', (_reason: unknown, message?: string) => {
        this.setSnapshot({
          status: 'idle',
          uri: null,
          address: null,
          tokenAddress: null,
          walletName: null,
          error: message ?? null,
        });
        this.teardownRelay();
      });

      const relay = initiateDappRelay((payload: { client: unknown; status: unknown }) => {
        manager.updateConnection(
          payload.client as never,
          payload.status as never,
        );
      });
      this.relay = relay;
      manager.attachRelay(relay);
      this.setSnapshot({ status: 'waiting', uri: relay.uri, error: null });
    } catch (err) {
      this.setSnapshot({
        status: 'error',
        error: err instanceof Error ? err.message : 'WizardConnect failed to start',
      });
    }
  }

  private deriveAddresses() {
    if (!this.manager) return;
    try {
      // Child index 0 = "receive" path, address index 0.
      const pubkey = this.manager.getPubkey(0, 0n);
      if (!pubkey) return;
      const payload = hash160(pubkey);
      const prefix = this.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
      const address = encodeCashAddress({
        payload,
        prefix,
        type: CashAddressType.p2pkh,
      });
      const tokenAddress = encodeCashAddress({
        payload,
        prefix,
        type: CashAddressType.p2pkhWithTokens,
      });
      this.setSnapshot({
        address: String(address),
        tokenAddress: String(tokenAddress),
      });
    } catch {
      // Pubkey state not populated yet; walletready handler will retry.
    }
  }

  private teardownRelay() {
    try {
      this.relay?.cleanup();
    } catch {
      /* already gone */
    }
    this.relay = null;
    this.manager = null;
  }

  async disconnect() {
    try {
      this.manager?.clearStoredSession();
      await this.manager?.sendDisconnect('User disconnected from Two Cents');
    } catch {
      /* courtesy message only */
    }
    this.teardownRelay();
    this.setSnapshot(IDLE);
  }

  /**
   * Ask the connected wallet to sign a CashScript-built transaction.
   * `inputPaths` names the HD key for every wallet-owned input:
   * [inputIndex, pathName, addressIndex]. Returns the signed tx hex;
   * the caller broadcasts it so the txid path is identical to local signing.
   */
  async signTransaction(
    builder: TransactionBuilder,
    inputPaths: Array<[number, string, number]>,
    userPrompt: string,
  ): Promise<string> {
    if (!this.manager || this.snapshot.status !== 'connected') {
      throw new Error('WizardConnect wallet is not connected');
    }
    const wcObject = builder.generateWcTransactionObject({
      broadcast: false,
      userPrompt,
    });
    const response = (await this.manager.signTransaction({
      transaction: wcObject as never,
      inputPaths: inputPaths as never,
    })) as unknown as { signedTransaction?: string };
    if (!response?.signedTransaction) {
      throw new Error('The wallet did not return a signed transaction');
    }
    return response.signedTransaction;
  }
}

export const wizardService = new WizardService();

export function useWizard(): WizardSnapshot {
  return useSyncExternalStore(
    wizardService.subscribe,
    wizardService.getSnapshot,
    () => IDLE,
  );
}
