# Two Cents — Bitcoin Cash prediction market

**Put your money where your mouth is.**

Two Cents is a parimutuel prediction market on Bitcoin Cash. Each market is
a `MarketPool` CashScript covenant holding a BCH pool, paired with two
`ShareVault` contracts that hold each outcome's share supply. Betting
releases CashTokens outcome shares from the vault, 1 share per sat staked.
When the resolver settles the market, winning shares redeem pro-rata from
the pool; if the market is never resolved by its void deadline, every share
refunds 1:1.

Built for BCH BLAZE 2026 with Vite + React + TypeScript, CashScript and
mainnet-js.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
```

Open the app, and a demo wallet is created automatically in your browser
(the key never leaves local storage). Fund it with chipnet BCH (for the
sample markets) and you can bet, close, claim and refund immediately. A
real HD wallet can also be paired over WizardConnect — see
[WIZARDCONNECT.md](WIZARDCONNECT.md).

## Markets configuration

Markets live in `src/config/markets.json`. Each entry:

```jsonc
{
  "id": "unique-id",
  "question": "Will …?",
  "detail": "Resolution criteria shown on the market page.",
  "category": "Crypto",
  "network": "chipnet",               // or "mainnet"
  "address": "bchtest:…",             // MarketPool contract address
  "stateCategory": "…64 hex…",        // mutable state NFT category (display order)
  "vaults": { "yes": "bchtest:…", "no": "bchtest:…" },
  "params": {
    "resolverPkh": "…40 hex…",
    "bettingDeadline": 1798675200,    // unix seconds
    "voidDeadline": 1801353600,       // unix seconds
    "yesCategory": "…64 hex…",        // display order
    "noCategory": "…64 hex…"
  }
}
```

The shipped entries are sample chipnet markets with placeholder addresses
and categories; replace them with the deployed contracts' values for a
live deployment.

**Byte-order rule:** categories in this file (and in every UTXO token
field) are in display order, but CashScript contract constructors expect
them byte-reversed. `src/lib/chain.ts` reverses `yesCategory`,
`noCategory` and the vaults' `shareCategory` when instantiating contracts,
and never reverses `poolScriptHash` (computed in-app as the sha256 of the
pool contract's locking bytecode).

## How the pieces fit

- `src/lib/chain.ts` — Electrum providers per network, pool state reads
  (finds the state-NFT UTXO and decodes its 18-byte commitment: totals,
  state 0 open / 1 resolved / 2 closed, winner), ShareVault supply reads,
  contract factories.
- `src/lib/tx.ts` — transaction builders. A bet spends, in fixed order:
  the pool UTXO (`bet`), the chosen side's vault UTXO (`release`), and
  exactly one user funding UTXO; it outputs the pool continuation, the
  vault continuation, the bettor's shares (carrying 5000 sats of dust that
  later pays the claim fee) and change. Claims and refunds burn shares
  (`allowImplicitFungibleTokenBurn`); claiming the last remaining winning
  shares takes the entire pool in a single output with no pool
  continuation, and likewise for a refund that empties the pool. Anyone
  can call `close()` after the betting deadline to freeze a market
  on chain. Contract transactions are ~3.5 KB, so funding selection keeps
  generous fee headroom.
- `src/lib/wallet.tsx` — the demo wallet (mainnet-js): generated locally,
  WIF persisted in localStorage, per-network instances for chipnet and
  mainnet, balances read through the CashScript provider.
- `src/lib/wizard.ts` — WizardConnect pairing and signing (see
  WIZARDCONNECT.md).
- `src/contracts/` — the compiled `MarketPool` and `ShareVault` artifacts
  the app builds transactions against.

## Notes

- Odds are the parimutuel implied prices: a side's staked total divided by
  the whole pool (50/50 before the first bet).
- The resolver's `resolve()` call is intentionally not in the UI — it
  requires the resolver's key, which belongs to the market operator.
