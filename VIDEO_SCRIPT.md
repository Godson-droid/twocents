# Two Cents demo video narration

Target length: under 3 minutes. Voice: UK, narration only, no captions.
Public copy rules: no hyphens, no asterisks, no em dashes.

## Narration

Every prediction market you have ever used asks you to trust someone. An operator holds your money, an operator decides who won, and an operator pays you if they feel like it.

Two Cents removes the operator.

This is a prediction market that lives entirely inside Bitcoin Cash smart contracts. Each market is a CashScript covenant on mainnet. When you place a bet, your sats go into the market pool, and the contract pays you outcome shares as CashTokens, one share for every sat you staked. When the market settles, winning shares redeem their share of the pool, enforced by the contract itself. Nobody can run off with the pool, because nobody holds it. The chain does.

And this is not a mock up. On the morning of 21 November, a live market on Two Cents asked whether the Bitcoin Cash chain tip would pass block 978268 inside fifteen minutes. Real bets of fifteen thousand sats landed on both sides. The block arrived in time. The market closed, resolved Yes, and the winning shares claimed the entire forty thousand sat pool in a single transaction. Every step of that is on mainnet, and every transaction id is published in the project repo.

Three more markets are open right now. Will Bitcoin Cash trade above two hundred dollars on the first of December. Will Ethereum pass three thousand five hundred. And the honest one: will Two Cents itself finish in the top three of this hackathon.

You can try it in your browser. The app carries a built in demo wallet, so you can fund an address and place a real bet on mainnet in under a minute. If you already have a Bitcoin Cash wallet, Two Cents also speaks WizardConnect.

Under the hood there are two contracts. One holds the pool and the market state, carried in a mutable NFT. The other is a vault that guards each side of the share supply and releases shares only to its own pool. The full lifecycle is covered by eighteen tests that run every transaction against the real Bitcoin Cash virtual machine.

Prediction markets are only useful when the payout does not depend on trust. On Bitcoin Cash, it no longer has to.

Two Cents. Put your money where your mouth is.

## Shot list

1. Title card: Two Cents wordmark, tagline.
2. The app home: three live market cards with real odds.
3. Market detail: the bet slip, a demo wallet being funded.
4. Explorer view: the settled market claim transaction (77df3fa6...).
5. The three live markets again, pool sizes visible.
6. Contract diagram or the repo page, closing card with demo and repo links.
