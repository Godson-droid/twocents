import {
  SignatureTemplate,
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  type SpendableUtxo,
  type Unlocker,
} from 'cashscript';
import {
  fetchUserUtxos,
  fetchVaultState,
  getContract,
  getProvider,
  getVaultContract,
  shareUtxos,
  sideCategory,
  vaultAddress,
} from './chain';
import { FEE_RESERVE, SHARE_DUST } from './format';
import {
  claimPayout,
  encodeCommitment,
  type MarketConfig,
  type PoolState,
} from './markets';
import { wizardService } from './wizard';

/**
 * Transaction construction for the MarketPool / ShareVault covenant pair.
 *
 * Layout (per the contract design):
 *  - The MarketPool address holds one pool UTXO carrying the mutable state
 *    NFT (stateCategory) and the pooled BCH.
 *  - Each outcome has a ShareVault contract holding that side's pre-minted
 *    share supply as fungible CashTokens. A bet releases shares from the
 *    vault; it does not mint.
 *
 * Bet transaction (fixed input/output order):
 *    in  0: pool UTXO        (pool.unlock.bet(outcome))
 *    in  1: vault UTXO       (vault.unlock.release())
 *    in  2: user funding UTXO (exactly one)
 *    out 0: pool continuation (stake added, totals updated)
 *    out 1: vault continuation (remaining supply)
 *    out 2: user's shares, carrying SHARE_DUST (5000) sats
 *    out 3: BCH change
 *
 * Claim / voidClaim burn the user's shares (builders are created with
 * allowImplicitFungibleTokenBurn). The 5000-sat dust on each share UTXO
 * pays the claim fee, which matters because a final claim — one that takes
 * the last remaining winning shares — has exactly ONE output: the whole
 * pool value to the claimant, with no pool continuation.
 */

export interface SignerContext {
  kind: 'demo' | 'wizard';
  /** Plain cashaddr: change outputs and WalletConnect placeholders. */
  address: string;
  /** Token-aware cashaddr: UTXO queries and token outputs. */
  tokenAddress: string;
  /** Demo wallet private key (demo signer only). */
  privateKey?: Uint8Array;
}

type UnlockFn = (...args: unknown[]) => Unlocker;

function unlockFn(contract: ReturnType<typeof getContract>, name: string): UnlockFn {
  const unlock = contract.unlock as unknown as Record<string, UnlockFn>;
  const fn = unlock[name];
  if (!fn) throw new Error(`Contract function ${name} is missing from the artifact`);
  return fn;
}

class Assembler {
  readonly builder: TransactionBuilder;
  private readonly market: MarketConfig;
  private readonly signer: SignerContext;
  private userInputIndices: number[] = [];
  private inputCount = 0;

  constructor(market: MarketConfig, signer: SignerContext, allowBurn = false) {
    this.market = market;
    this.signer = signer;
    this.builder = new TransactionBuilder({
      provider: getProvider(market.network),
      allowImplicitFungibleTokenBurn: allowBurn,
    });
  }

  addContractInput(utxo: SpendableUtxo, unlocker: Unlocker) {
    this.builder.addInput(utxo, unlocker);
    this.inputCount += 1;
  }

  addUserInput(utxo: SpendableUtxo) {
    const unlocker =
      this.signer.kind === 'demo'
        ? new SignatureTemplate(this.signer.privateKey as Uint8Array).unlockP2PKH()
        : placeholderP2PKHUnlocker(this.signer.address);
    this.builder.addInput(utxo, unlocker);
    this.userInputIndices.push(this.inputCount);
    this.inputCount += 1;
  }

  async finish(userPrompt: string): Promise<string> {
    if (this.signer.kind === 'demo') {
      const { txid } = await this.builder.send();
      return txid;
    }
    const inputPaths: Array<[number, string, number]> = this.userInputIndices.map(
      (index) => [index, 'receive', 0],
    );
    const signedHex = await wizardService.signTransaction(
      this.builder,
      inputPaths,
      userPrompt,
    );
    return getProvider(this.market.network).sendRawTransaction(signedHex);
  }
}

/** Plain-BCH UTXOs (no tokens attached), largest first. */
function bchOnly(utxos: SpendableUtxo[]): SpendableUtxo[] {
  return utxos
    .filter((u) => !u.token)
    .sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1));
}

/** Select plain-BCH UTXOs (largest first) covering a target amount. */
function selectFunding(utxos: SpendableUtxo[], target: bigint): SpendableUtxo[] {
  const selected: SpendableUtxo[] = [];
  let total = 0n;
  for (const utxo of bchOnly(utxos)) {
    selected.push(utxo);
    total += utxo.satoshis;
    if (total >= target) break;
  }
  if (total < target) {
    throw new Error(
      `Insufficient BCH in the active wallet. This transaction needs about ${target} sats including dust and network fees.`,
    );
  }
  return selected;
}

function poolOutput(
  market: MarketConfig,
  poolUtxo: SpendableUtxo,
  satoshis: bigint,
  totalYes: bigint,
  totalNo: bigint,
  state: 0 | 1 | 2,
  winner: 0 | 1 | null,
) {
  return {
    to: market.address,
    amount: satoshis,
    token: {
      amount: poolUtxo.token?.amount ?? 0n,
      category: market.stateCategory,
      nft: {
        capability: 'mutable' as const,
        commitment: encodeCommitment(totalYes, totalNo, state, winner),
      },
    },
  };
}

export async function placeBet(
  market: MarketConfig,
  pool: PoolState,
  signer: SignerContext,
  outcome: 0 | 1,
  amount: bigint,
): Promise<string> {
  if (!pool.poolUtxo) throw new Error('The market pool is not live yet');
  if (amount <= 0n) throw new Error('Enter an amount to bet');

  const vault = await fetchVaultState(market, outcome);
  if (!vault.utxo) {
    throw new Error('This side’s share vault is not live yet');
  }
  if (amount > vault.supply) {
    throw new Error(
      `Only ${vault.supply} shares remain in this side’s vault. Lower your bet.`,
    );
  }

  // The bet spends exactly one funding UTXO (input 2), so it must cover the
  // stake, the share UTXO's dust, and the fee for a ~3.5 KB transaction.
  const userUtxos = await fetchUserUtxos(market.network, signer.tokenAddress);
  const needed = amount + SHARE_DUST + FEE_RESERVE;
  const funding = bchOnly(userUtxos)[0];
  if (!funding || funding.satoshis < needed) {
    throw new Error(
      `This bet needs one wallet UTXO of at least ${needed} sats (stake + share dust + fees). Fund the wallet or consolidate its balance into a single UTXO.`,
    );
  }

  const poolContract = getContract(market);
  const vaultContract = getVaultContract(market, outcome);
  const bet = unlockFn(poolContract, 'bet');
  const release = unlockFn(vaultContract, 'release');

  const asm = new Assembler(market, signer);
  asm.addContractInput(pool.poolUtxo, bet(BigInt(outcome))); // input 0
  asm.addContractInput(vault.utxo, release()); // input 1
  asm.addUserInput(funding); // input 2

  const newYes = pool.totalYes + (outcome === 0 ? amount : 0n);
  const newNo = pool.totalNo + (outcome === 1 ? amount : 0n);
  const category = sideCategory(market, outcome);
  const remaining = vault.supply - amount;

  asm.builder.addOutputs([
    // output 0: pool continuation
    poolOutput(
      market,
      pool.poolUtxo,
      pool.poolUtxo.satoshis + amount,
      newYes,
      newNo,
      0,
      null,
    ),
    // output 1: vault continuation (plain BCH once the supply is exhausted)
    remaining > 0n
      ? {
          to: vaultAddress(market, outcome),
          amount: vault.utxo.satoshis,
          token: { amount: remaining, category },
        }
      : { to: vaultAddress(market, outcome), amount: vault.utxo.satoshis },
    // output 2: the bettor's shares, carrying their future claim fee as dust
    {
      to: signer.tokenAddress,
      amount: SHARE_DUST,
      token: { amount, category },
    },
  ]);
  // output 3: change
  asm.builder.addBchChangeOutputIfNeeded({ to: signer.address, feeRate: 1 });

  return asm.finish(
    `Bet ${amount} sats on ${outcome === 0 ? 'Yes' : 'No'} — ${market.question}`,
  );
}

export async function claimWinnings(
  market: MarketConfig,
  pool: PoolState,
  signer: SignerContext,
): Promise<string> {
  if (!pool.poolUtxo) throw new Error('The market pool is not live yet');
  if (pool.winner === null) throw new Error('This market is not resolved yet');

  const winner = pool.winner;
  const winningCategory = sideCategory(market, winner);
  const winningTotal = winner === 0 ? pool.totalYes : pool.totalNo;

  const userUtxos = await fetchUserUtxos(market.network, signer.tokenAddress);
  const shares = shareUtxos(userUtxos, winningCategory);
  const shareTotal = shares.reduce((acc, u) => acc + (u.token?.amount ?? 0n), 0n);
  if (shareTotal <= 0n) throw new Error('You hold no winning shares for this market');

  const payout = claimPayout(pool, shareTotal);
  const contract = getContract(market);
  const claim = unlockFn(contract, 'claim');
  const asm = new Assembler(market, signer, true);

  asm.addContractInput(pool.poolUtxo, claim());
  shares.forEach((u) => asm.addUserInput(u));

  if (shareTotal >= winningTotal) {
    // Final claim: exactly one output — the entire pool value. The share
    // UTXOs' dust covers the fee.
    asm.builder.addOutput({ to: signer.address, amount: pool.poolSats });
  } else {
    const newYes = winner === 0 ? pool.totalYes - shareTotal : pool.totalYes;
    const newNo = winner === 1 ? pool.totalNo - shareTotal : pool.totalNo;
    asm.builder.addOutputs([
      poolOutput(market, pool.poolUtxo, pool.poolSats - payout, newYes, newNo, 1, winner),
      { to: signer.address, amount: payout },
    ]);
  }

  return asm.finish(`Claim ${payout} sats of winnings — ${market.question}`);
}

export async function claimRefund(
  market: MarketConfig,
  pool: PoolState,
  signer: SignerContext,
): Promise<string> {
  if (!pool.poolUtxo) throw new Error('The market pool is not live yet');

  const userUtxos = await fetchUserUtxos(market.network, signer.tokenAddress);
  const yesShares = shareUtxos(userUtxos, market.params.yesCategory);
  const noShares = shareUtxos(userUtxos, market.params.noCategory);
  const yesTotal = yesShares.reduce((acc, u) => acc + (u.token?.amount ?? 0n), 0n);
  const noTotal = noShares.reduce((acc, u) => acc + (u.token?.amount ?? 0n), 0n);
  const refund = yesTotal + noTotal;
  if (refund <= 0n) throw new Error('You hold no shares to refund for this market');

  const contract = getContract(market);
  const voidClaim = unlockFn(contract, 'voidClaim');
  const asm = new Assembler(market, signer, true);

  asm.addContractInput(pool.poolUtxo, voidClaim());
  [...yesShares, ...noShares].forEach((u) => asm.addUserInput(u));

  const emptiesPool =
    pool.totalYes - yesTotal === 0n && pool.totalNo - noTotal === 0n;

  if (emptiesPool) {
    // Refunding the last shares takes the whole pool value in one output.
    asm.builder.addOutput({ to: signer.address, amount: pool.poolSats });
  } else {
    asm.builder.addOutputs([
      poolOutput(
        market,
        pool.poolUtxo,
        pool.poolSats - refund,
        pool.totalYes - yesTotal,
        pool.totalNo - noTotal,
        pool.state,
        null,
      ),
      { to: signer.address, amount: refund },
    ]);
  }

  return asm.finish(`Refund ${refund} sats — ${market.question}`);
}

/**
 * Freeze betting on chain after the deadline (pool state 0 → 2).
 * Anyone can call close(); the caller funds the fee and gets change back.
 */
export async function closeBetting(
  market: MarketConfig,
  pool: PoolState,
  signer: SignerContext,
): Promise<string> {
  if (!pool.poolUtxo) throw new Error('The market pool is not live yet');
  if (pool.state !== 0) throw new Error('Betting is already closed on chain');

  const userUtxos = await fetchUserUtxos(market.network, signer.tokenAddress);
  const funding = selectFunding(userUtxos, FEE_RESERVE);

  const contract = getContract(market);
  const close = unlockFn(contract, 'close');
  const asm = new Assembler(market, signer);
  asm.addContractInput(pool.poolUtxo, close());
  funding.forEach((u) => asm.addUserInput(u));

  asm.builder.addOutput(
    poolOutput(
      market,
      pool.poolUtxo,
      pool.poolUtxo.satoshis,
      pool.totalYes,
      pool.totalNo,
      2,
      null,
    ),
  );
  asm.builder.addBchChangeOutputIfNeeded({ to: signer.address, feeRate: 1 });

  return asm.finish(`Close betting — ${market.question}`);
}
