# Widget Factory deck content for Two Cents

Template: https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing
Structure seen in the template: 6 slides. Public copy rules: no hyphens, no asterisks.

## Slide 1, Title and Team

Two Cents
Put your money where your mouth is.
A prediction market that lives entirely inside Bitcoin Cash smart contracts.
Built by Godson, solo. Telegram @smigle22
Live demo: https://godson-droid.github.io/twocents/
Code: https://github.com/Godson-droid/twocents

## Slide 2, The Story

Every prediction market asks you to trust an operator. The operator holds the pool, calls the result, and decides whether you get paid.
Two Cents removes the operator. The pool is a CashScript covenant on Bitcoin Cash mainnet. Bets pay out outcome shares as CashTokens, one share per sat staked. Settlement and payouts are enforced by the contract, not by a company.
On 21 November 2026 a Two Cents market ran its full life on mainnet in one morning: created, bet on both sides, closed, resolved, and the winning shares claimed the whole pool.

## Slide 3, Benefits

No custodian can lose, freeze or take the pool.
Every bet, settlement and payout is a public mainnet transaction anyone can audit.
Shares are CashTokens, so positions are transferable wallet to wallet.
If a market is never settled, the void path refunds every share one to one.
Fees are Bitcoin Cash fees: a full bet costs a fraction of a cent.

## Slide 4, BCH Usage and Mainnet Capabilities

CashScript covenants: MarketPool holds the pool and a mutable state NFT; ShareVault guards each side of the share supply.
CashTokens: two fungible outcome share categories per market, minted once into the vaults at creation.
Real mainnet transactions: market creation is an eight transaction chain; bets, close, resolve and claim all run on mainnet today.
WizardConnect is integrated for external wallets, alongside a built in demo wallet powered by mainnet js.
Four markets deployed. Eight bets placed. One full lifecycle settled and paid out: 40,000 sats claimed in a single transaction.

## Slide 5, Transparency and Vision

Everything in this entry was built during BCH BLAZE 2026. Nothing pre existed.
The contract suite runs 18 tests against the real BCH virtual machine, including the attacks that must fail.
Vision: a market for anything, settled by code, open to anyone with a phone and a few cents. Next steps are community resolvers, a market creation wizard inside the app, and PUSD denominated pools.

## Slide 6, Links

Live demo: https://godson-droid.github.io/twocents/
Repo and full mainnet proof: https://github.com/Godson-droid/twocents
CashTokens donations for EMBER2026: bitcoincash:zqjelks8pq4jx8z6jtxv2awn9crkrphhzq5dkdd9yu
