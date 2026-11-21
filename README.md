# Two Cents

Put your money where your mouth is.

Two Cents is a prediction market that lives entirely inside Bitcoin Cash smart contracts. There is no custodian, no house account and no server holding the money. Every market is a CashScript covenant on BCH mainnet. A bet locks your sats in the market pool and pays you outcome shares as CashTokens, one share for every sat staked. When the market settles, winning shares redeem pro rata from the pool. If a market can never be settled, every share refunds one to one after the void deadline.

## Live demo

The app runs at https://godson-droid.github.io/twocents/

Three markets are live on mainnet right now, each with real money already in the pool:

1. Will Bitcoin Cash trade above $200 on 1 December 2026?
2. Will Ethereum trade above $3,500 on 1 December 2026?
3. Will Two Cents finish in the top 3 of the BCH BLAZE Mainnet Track?

The app carries a built in demo wallet, so anyone can open it, fund the wallet address it shows, and place a real bet on mainnet in under a minute. It also speaks WizardConnect for external BCH wallets. See app/WIZARDCONNECT.md for what that integration does today and where its limits are.

## Proof on mainnet

A fourth market was created, bet on, closed, resolved and paid out in full on mainnet on 21 November 2026, inside a single morning. It asked whether the BCH chain tip would pass block 978268 before a fifteen minute deadline. Bets of 15,000 sats landed on both sides. The block arrived before the deadline, the market resolved Yes, and the winning shares claimed the whole 40,000 sat pool in one transaction.

The full evidence, every market address and every transaction id, is in MAINNET_PROOF.md. The deployment record for each market, including the exact contract parameters, sits in the deployment files at the root of this repo.

## How it works

Two contracts run every market. Their sources are in contracts/.

MarketPool holds the pooled BCH and a mutable state NFT. The NFT commitment is eighteen bytes: the total staked on Yes, the total staked on No, a state byte and a winner byte. The pool has five functions. bet releases shares from a vault and grows the pool. close freezes betting once the deadline has passed. resolve lets the named resolver settle the market. claim burns winning shares and pays pro rata, and a claim of the last winning shares takes the entire remaining pool in a single output. voidClaim refunds any share one to one once the void deadline has passed with no settlement.

ShareVault holds one side of a market. The full share supply is minted once, at market creation, into two vaults, one for Yes and one for No. A vault releases shares only to the pool it was created for, and only while that pool reports itself open with matching totals.

Market creation is a chain of eight transactions built by contracts/create-market.mjs: a fan out, three hops so every token genesis spends an outpoint at index zero, the two share token geneses, a minting NFT genesis, and the transaction that turns the minting NFT into the single mutable state NFT and seats it in the pool with its seed. contracts/market-ops.mjs places bets and runs close, resolve and claim. Every transaction these scripts broadcast was first validated against the real BCH virtual machine locally.

## Run it

The app:

    cd app
    npm install
    npm run dev

The contract test suite covers the whole lifecycle, including pro rata payouts, the refund path, and the attacks that must fail:

    cd contracts
    npm install
    node test-market.mjs

All 18 tests pass against a mock network that validates every transaction with the real BCH virtual machine.

## Dependencies

CashScript 0.14 and the cashscript SDK compile and drive the contracts. The app is React and TypeScript built with Vite. Chain reads and transaction broadcast in the browser run over Electrum through cashscript providers. The demo wallet uses mainnet js. WizardConnect support uses the published Riften Labs packages. Token tooling and address handling use libauth.

## Honest limitations

Two things are worth stating plainly.

CashScript time checks can only prove that a deadline has passed. They cannot prove that a moment is still in the future. Betting is therefore frozen by the close transaction rather than by the clock alone, and a bet that lands between the deadline and the close transaction would still be accepted by the covenant. Two Cents markets are created with deadlines set ahead of the event they track and are closed promptly at the deadline.

Settlement in this version is by a named resolver key held by the market creator. The resolver can only pick the winner after the deadline. It cannot touch the pool, change the totals, or pay itself. A market the resolver abandons is not lost money: the void path refunds every share one to one.

## Donations

CashTokens donations for EMBER2026 can be sent to the project token address:
bitcoincash:zqjelks8pq4jx8z6jtxv2awn9crkrphhzq5dkdd9yu

Built by Godson, Telegram @smigle22
