Two Cents mainnet deployment and proof state
Created 2026-11-21. All transactions broadcast through Blockchair push and
accepted (HTTP 200, hashes matched). Funding: Godson's MEXC withdrawal of
432,034 sats, tx b7b2448622de6882debb935fd8ae2161398b582dd532ae8bfd9f652c79af13eb
vout 2, to the project wallet bitcoincash:qqjelks8pq4jx8z6jtxv2awn9crkrphhzqn89nrrm0.

Market A: Will Bitcoin Cash trade above $200 on 1 December 2026?
  Pool: bitcoincash:rwmvk6v5h79eg4czyxt9kx6gtpyrq8uwknwng6fygnch88eg76ezjyhac7fcd
  State creation tx: 4feaf5a5d1f846571c68a332e48bb9566c713261b3e7cba31069ab2e732824d8
  Bet Yes 20,000 sats: 74f45b436228dd10855178eacd1759d3d5120564fda6f9a2453911006ff5d8d5
  Pool now: 30,000 sats, totals Yes 20,000 / No 0, pool UTXO 74f45b43 vout 0
  Betting deadline 1796083140 (30 Nov 2026 23:59 UTC), void 1796688000

Market B: Will Ethereum trade above $3,500 on 1 December 2026?
  State creation tx: b23752fdc964b7ff23f1d6cdddfb921bb65ab4e399e516f1b3c78953bb9a3484
  Bet No 20,000 sats: 8f58efcf7b7ee4641a9f0a6dd00facf8f2ff9e2589cc7a4213602e33960ccbf8
  Pool now: 30,000 sats, totals Yes 0 / No 20,000, pool UTXO 8f58efcf vout 0
  Betting deadline 1796083140, void 1796688000

Market C: Will Two Cents finish in the top 3 of the BCH BLAZE Mainnet Track?
  State creation tx: 98e7cd2d8da76b466f744fbb40370b9523005254da78c427f2dec69984872536
  Bet Yes 15,000 sats: c15f7d7be10ea8a49900840d168cbb1ccb8da6cda507fa9c58ba2ea653b9b12f
  Pool now: 25,000 sats, totals Yes 15,000 / No 0, pool UTXO c15f7d7b vout 0
  Betting deadline 1795737540 (26 Nov 2026 23:59 UTC), void 1797120000

Market D (fast lifecycle demo): Will the BCH tip pass block 978268 before
this market closes? Tip was 978267 at creation.
  State creation tx: 805138f34cf7a3884f84adebebdb81f099bf00b7d0a78cfe3981723d94ec2d32
  Bet Yes 15,000 sats: 39054fba4805aaa6b9060d13fe76002184b0126856c950a8bad96e50aacbe9fc
  Bet No 15,000 sats: 1a3bd1b68733dc60d9b0c6fe0bbfae46e88ab656db46d8e9aa4649a287608c22
  Pool now: 40,000 sats, totals Yes 15,000 / No 15,000, pool UTXO 1a3bd1b6 vout 0
  Betting deadline 1795244907 (21 Nov 2026 07:08:27 UTC)
  Creator holds 15,000 Yes shares (39054fba vout 2) and 15,000 No shares
  (1a3bd1b6 vout 2). Next: close after the deadline, resolve by block
  978268's timestamp, claim the winning side in full (final claim).

Deployment files: deployment-market-a.json / b / c / d in this folder,
each with the full market entry and every transaction hex.
Creator change after all bets: about 267,834 sats remain in change UTXOs
(352,834 before bets, minus 85,000 bet value and fees).

Market D lifecycle COMPLETE on mainnet (retry 2026-11-21 ~09:00 WAT).
  First close attempt at 08:12 WAT failed only as non-final: locktime equals
  the betting deadline 1795244907 (07:08:27 UTC) while chain median-time-past
  was 1795243321 (06:42:01 UTC). Nothing was broadcast and the pool was
  unchanged.
  Winner evidence: block 978268, hash
  0000000000000000011eb84bae85a2e55e9e58e7958361d5c1ddce59118080a3,
  timeNormalized 2026-11-21T06:57:26.000Z (epoch 1795244246), at or before
  the deadline 1795244907, so the tip passed block 978268 before the market
  closed. Winner: Yes (0). Verified live via api.bitcore.io 2026-11-21 09:00 WAT.
  Close tx: 471f27e64801e45601374afab8e3c1d772ae8f9a31844a1f76d11e00a2c50b85
    (identical deterministic txid to the first attempt)
  Resolve tx (winner Yes, state 1): 112f745d993d4e31de772a3f4a62e9a4ac3e7b6ecf9e9de077dfedad404134b6
  Claim tx (15,000 winning Yes shares, full pool claim):
    77df3fa693829038930ace33780f45af093ac6c36f3f50b8a1fe2491b18c503c
  All three validated on mock and BROADCAST OK. Full lifecycle complete:
  state creation, Yes bet, No bet, close, resolve, claim.

Balancing bets (21 Nov 2026, after the first proof bets):
  Market A Bet No 12,000 sats: 574e350ebf9d84ce7d62c66e4146111559527380e291459a1d4f0c90a5e3b857
    Pool now 42,000 sats, Yes 20,000 / No 12,000, pool UTXO 574e350e vout 0
  Market B Bet Yes 14,000 sats: 17403740d60b2755ea3934e5a2664f0ea1099c22f5d8a6cf089a962fa74808b3
    Pool now 44,000 sats, Yes 14,000 / No 20,000, pool UTXO 17403740 vout 0
  Market C Bet No 9,000 sats: b2f0fa5cef268d68cb95619d1d120ed64b24afb0a561eef8acd141747c195d23
    Pool now 34,000 sats, Yes 15,000 / No 9,000, pool UTXO b2f0fa5c vout 0
The app config (app/src/config/markets.json) now carries markets A, B and C
on mainnet with these live pools. Market D is settled and stays in this
file and the demo video as the lifecycle proof.
