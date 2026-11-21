# WizardConnect in Two Cents

## What WizardConnect is

WizardConnect is a Bitcoin Cash wallet-connection protocol by Riften Labs
(docs: docs.riftenlabs.com/wizardconnect, LGPL-3.0). It connects a dapp to an
HD wallet over an encrypted relay:

- Transport is Nostr: every message is a NIP-17 gift-wrapped event, so the
  relay sees only ciphertext addressed to the recipient's Nostr pubkey.
- The wallet shows (or scans) a connection URI containing the dapp's relay
  credentials. In this app the dapp generates the URI and shows it as a QR
  code for the wallet to scan.
- Handshake: the dapp sends `dapp_ready` (listing its supported protocols),
  the wallet answers `wallet_ready` with session data for the agreed
  protocol — for `hdwalletv1`, BIP32 xpubs for named derivation paths
  (`receive`, `change`, `defi`). The dapp derives addresses locally from
  those xpubs; no seed or private key ever leaves the wallet.
- Signing: the dapp sends `sign_transaction_request`. The transaction body
  is the same object CashScript builds for BCH WalletConnect
  (`TransactionBuilder.generateWcTransactionObject()`), plus an
  `inputPaths` list — one `[inputIndex, pathName, addressIndex]` entry per
  wallet-owned input — telling the HD wallet which key signs which input.
  CashScript contract inputs carry placeholder signatures that the wallet
  fills in.
- Wallets with support today: Paytaca (v0.24.0+, mobile and extension) and
  Cashonize (v0.9.0+). The protocol has no generic message-signing method;
  this app does not need one.

## What is implemented here

`src/lib/wizard.ts` wraps the official packages
(`@wizardconnect/core` 0.2.11, `@wizardconnect/dapp` 0.2.8):

1. `wizardService.connect()` creates a `DappConnectionManager` for
   "Two Cents", opens the relay with `initiateDappRelay`, attaches it for
   session persistence (localStorage key `wizardconnect-session`), and
   exposes `relay.uri`. The wallet modal renders that URI as a QR code.
2. On `walletready`, the service derives the receive-path address at index
   0 with `manager.getPubkey(0, 0n)` and converts it to both plain and
   token-aware CashAddresses (libauth `hash160` + `encodeCashAddress`) for
   the active network. Balances, share positions and UTXO selection then
   work exactly as they do for the demo wallet.
3. Signing: transaction builders in `src/lib/tx.ts` use
   `placeholderP2PKHUnlocker` for user inputs when the WizardConnect signer
   is active. The assembler records the index of every user input, and the
   service calls `manager.signTransaction({ transaction, inputPaths })`
   with the CashScript WalletConnect object and
   `inputPaths = [[inputIndex, "receive", 0], …]`. The request is built
   with `broadcast: false`; the app broadcasts the returned signed hex
   through its CashScript Electrum provider, so the txid/reporting path is
   identical for both signers.
4. Disconnect sends the courtesy `disconnect` message, clears the stored
   session and tears down the relay. If a session drops, the manager's own
   reconnection logic re-sends `dapp_ready` and any pending sign requests.

## Honest limits

- A session can only complete when a WizardConnect-capable wallet actually
  scans the QR code. No such wallet exists in the build/test environment
  used to develop this app, so the handshake and a wallet-signed bet could
  not be exercised end to end here. The full client-side flow — relay,
  URI/QR, handshake handling, address derivation, sign-request
  construction — is implemented against the published protocol and the
  official packages, and the built-in demo wallet remains the working
  signer so the app is fully transactable without one.
- One documentation wrinkle: Riften's dapp guide abbreviates the sign
  request's `transaction` field as raw hex in an example, while
  CashScript's guide and types define it as the object returned by
  `generateWcTransactionObject()`. This app follows CashScript's typed
  object, which is the construction the signing wallets consume.
- WizardConnect delivers xpubs, so the dapp can watch every address on the
  shared paths. That is inherent to the protocol's design (the wallet
  chooses which named paths to share); the app only uses `receive` index 0.
