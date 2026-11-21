// Two Cents mainnet market operations: bet, close, resolve, claim.
//
// Builds each transaction offline, validates it against the real BCH VM
// through a mock provider seeded with the exact UTXOs, and only then
// broadcasts through Blockchair's push endpoint (--broadcast required).
//
// The creator key comes from the CREATOR_WIF environment variable and is
// never printed. The resolver is the same key for the demo markets.
//
// Examples:
//   node market-ops.mjs bet --deployment ../deployment-market-a.json \
//     --side yes --amount 20000 \
//     --pool-txid <txid> --pool-sats 10000 --total-yes 0 --total-no 0 \
//     --vault-txid <genesis txid> --vault-remaining 100000000 \
//     --funding-txid <txid> --funding-vout 1 --funding-sats 44003 --broadcast
//   node market-ops.mjs close --deployment ../deployment-market-d.json \
//     --pool-txid <txid> --pool-sats 40000 --total-yes 15000 --total-no 15000 \
//     --funding-txid <txid> --funding-vout 1 --funding-sats 40404 --broadcast
//   node market-ops.mjs resolve --deployment ../deployment-market-d.json \
//     --winner 0 --pool-txid <txid> --pool-sats 40000 \
//     --total-yes 15000 --total-no 15000 \
//     --funding-txid <txid> --funding-vout 1 --funding-sats 40404 --broadcast
//   node market-ops.mjs claim --deployment ../deployment-market-d.json \
//     --pool-txid <txid> --pool-sats 40000 --total-yes 15000 --total-no 15000 \
//     --winner 0 --shares-txid <bet txid> --shares-amount 15000 --broadcast

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import {
  Contract,
  MockNetworkProvider,
  TransactionBuilder,
  SignatureTemplate,
  Network,
} from 'cashscript';
import {
  decodePrivateKeyWif,
  secp256k1,
  hash160,
  binToHex,
  encodeCashAddress,
} from '@bitauth/libauth';

const args = process.argv.slice(2);
const op = args[0];
const opt = (name, required = true) => {
  const i = args.indexOf('--' + name);
  if (i === -1) {
    if (required) throw new Error('missing --' + name);
    return undefined;
  }
  return args[i + 1];
};
const broadcast = args.includes('--broadcast');

const wif = process.env.CREATOR_WIF;
if (!wif) throw new Error('CREATOR_WIF env var is required');
const { privateKey } = decodePrivateKeyWif(wif);
const pub = secp256k1.derivePublicKeyCompressed(privateKey);
const pubHex = binToHex(pub);
const pkh = hash160(pub);
const creatorTokenAddress = encodeCashAddress({ payload: pkh, type: 'p2pkhWithTokens' }).address;
const sig = () => new SignatureTemplate(privateKey).unlockP2PKH();

const dep = JSON.parse(readFileSync(opt('deployment'), 'utf8'));
const m = dep.market;
const revHex = (h) => Buffer.from(h, 'hex').reverse().toString('hex');

const provider = new MockNetworkProvider();
provider.network = Network.MAINNET;

const poolArtifact = JSON.parse(readFileSync(new URL('./artifacts/MarketPool.json', import.meta.url), 'utf8'));
const vaultArtifact = JSON.parse(readFileSync(new URL('./artifacts/ShareVault.json', import.meta.url), 'utf8'));
const pool = new Contract(
  poolArtifact,
  [m.params.resolverPkh, BigInt(m.params.bettingDeadline), BigInt(m.params.voidDeadline), revHex(m.params.yesCategory), revHex(m.params.noCategory)],
  { provider, addressType: 'p2sh32' },
);
if (pool.tokenAddress !== m.address) throw new Error('pool address mismatch: ' + pool.tokenAddress + ' vs ' + m.address);
const vaultFor = (side) => new Contract(
  vaultArtifact,
  [m.poolScriptHash, revHex(side === 0 ? m.params.yesCategory : m.params.noCategory), BigInt(side)],
  { provider, addressType: 'p2sh32' },
);

function commitment(totalYes, totalNo, state, winner) {
  const b = Buffer.alloc(18);
  b.writeBigInt64LE(BigInt(totalYes), 0);
  b.writeBigInt64LE(BigInt(totalNo), 8);
  b[16] = state;
  b[17] = winner;
  return b.toString('hex');
}
function poolOutput(sats, commit) {
  return {
    to: pool.tokenAddress,
    amount: BigInt(sats),
    token: { category: m.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: commit } },
  };
}
async function fetchUtxo(address, txid) {
  const utxos = await provider.getUtxos(address);
  const u = utxos.find((x) => x.txid === txid);
  if (!u) throw new Error('utxo not found on mock for ' + txid);
  return u;
}
function stagePool(txid, sats, totalYes, totalNo, state, winner) {
  provider.addUtxo(pool.tokenAddress, {
    txid, vout: 0, satoshis: BigInt(sats),
    token: { category: m.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: commitment(totalYes, totalNo, state, winner) } },
  });
}
function stageFunding(txid, vout, sats) {
  provider.addUtxo(creatorTokenAddress, { txid, vout: Number(vout), satoshis: BigInt(sats) });
}
async function finish(builder, label) {
  const hex = builder.build();
  const { txid } = await builder.send();
  console.log(label, 'validated on mock, txid', txid);
  if (broadcast) {
    const res = execFileSync('curl', [
      '-s', '-X', 'POST', 'https://api.blockchair.com/bitcoin-cash/push/transaction',
      '-d', 'data=' + hex,
    ]).toString();
    const parsed = JSON.parse(res);
    if (!parsed.data || parsed.data.transaction_hash !== txid) {
      throw new Error('broadcast mismatch: ' + res.slice(0, 200));
    }
    console.log(label, 'BROADCAST OK', txid);
  } else {
    console.log(label, 'dry run only (no --broadcast)');
  }
  return txid;
}

const poolTxid = opt('pool-txid');
const poolSats = Number(opt('pool-sats'));
const totalYes = Number(opt('total-yes'));
const totalNo = Number(opt('total-no'));

if (op === 'bet') {
  const side = opt('side') === 'yes' ? 0 : 1;
  const amount = Number(opt('amount'));
  const category = side === 0 ? m.params.yesCategory : m.params.noCategory;
  const vault = vaultFor(side);
  if (vault.tokenAddress !== (side === 0 ? m.vaultYesAddress : m.vaultNoAddress)) throw new Error('vault address mismatch');
  stagePool(poolTxid, poolSats, totalYes, totalNo, 0, 0);
  provider.addUtxo(vault.tokenAddress, {
    txid: opt('vault-txid'), vout: 0, satoshis: 1000n,
    token: { category, amount: BigInt(opt('vault-remaining')) },
  });
  stageFunding(opt('funding-txid'), opt('funding-vout'), opt('funding-sats'));
  const poolU = await fetchUtxo(pool.tokenAddress, poolTxid);
  const vaultU = await fetchUtxo(vault.tokenAddress, opt('vault-txid'));
  const funds = await fetchUtxo(creatorTokenAddress, opt('funding-txid'));
  const fundingSats = Number(opt('funding-sats'));
  const change = fundingSats - amount - 5000 - 5000;
  if (change < 1000) throw new Error('funding too small, change would be ' + change);
  const newYes = totalYes + (side === 0 ? amount : 0);
  const newNo = totalNo + (side === 1 ? amount : 0);
  const builder = new TransactionBuilder({ provider })
    .addInput(poolU, pool.unlock.bet(BigInt(side)))
    .addInput(vaultU, vault.unlock.release())
    .addInput(funds, sig())
    .addOutput(poolOutput(poolSats + amount, commitment(newYes, newNo, 0, 0)))
    .addOutput({ to: vault.tokenAddress, amount: 1000n, token: { category, amount: BigInt(opt('vault-remaining')) - BigInt(amount) } })
    .addOutput({ to: creatorTokenAddress, amount: 5000n, token: { category, amount: BigInt(amount) } })
    .addOutput({ to: creatorTokenAddress, amount: BigInt(change) });
  const txid = await finish(builder, 'bet ' + (side === 0 ? 'yes' : 'no') + ' ' + amount);
  console.log(JSON.stringify({ pool: { txid, sats: poolSats + amount, totalYes: newYes, totalNo: newNo }, shares: { txid, vout: 2, amount } }));
} else if (op === 'close') {
  stagePool(poolTxid, poolSats, totalYes, totalNo, 0, 0);
  stageFunding(opt('funding-txid'), opt('funding-vout'), opt('funding-sats'));
  const poolU = await fetchUtxo(pool.tokenAddress, poolTxid);
  const funds = await fetchUtxo(creatorTokenAddress, opt('funding-txid'));
  const change = Number(opt('funding-sats')) - 4000;
  const builder = new TransactionBuilder({ provider })
    .addInput(poolU, pool.unlock.close())
    .addInput(funds, sig())
    .addOutput(poolOutput(poolSats, commitment(totalYes, totalNo, 2, 0)))
    .addOutput({ to: creatorTokenAddress, amount: BigInt(change) })
    .setLocktime(m.params.bettingDeadline);
  const txid = await finish(builder, 'close');
  console.log(JSON.stringify({ pool: { txid, sats: poolSats, totalYes, totalNo, state: 2 } }));
} else if (op === 'resolve') {
  const winner = Number(opt('winner'));
  const state = Number(opt('state', false) || 0);
  stagePool(poolTxid, poolSats, totalYes, totalNo, state, 0);
  stageFunding(opt('funding-txid'), opt('funding-vout'), opt('funding-sats'));
  const poolU = await fetchUtxo(pool.tokenAddress, poolTxid);
  const funds = await fetchUtxo(creatorTokenAddress, opt('funding-txid'));
  const change = Number(opt('funding-sats')) - 4000;
  const builder = new TransactionBuilder({ provider })
    .addInput(poolU, pool.unlock.resolve(pubHex, new SignatureTemplate(privateKey), BigInt(winner)))
    .addInput(funds, sig())
    .addOutput(poolOutput(poolSats, commitment(totalYes, totalNo, 1, winner)))
    .addOutput({ to: creatorTokenAddress, amount: BigInt(change) })
    .setLocktime(m.params.bettingDeadline);
  const txid = await finish(builder, 'resolve winner=' + winner);
  console.log(JSON.stringify({ pool: { txid, sats: poolSats, totalYes, totalNo, state: 1, winner } }));
} else if (op === 'claim') {
  const winner = Number(opt('winner'));
  const sharesAmount = Number(opt('shares-amount'));
  const winTotal = winner === 0 ? totalYes : totalNo;
  const category = winner === 0 ? m.params.yesCategory : m.params.noCategory;
  stagePool(poolTxid, poolSats, totalYes, totalNo, 1, winner);
  provider.addUtxo(creatorTokenAddress, {
    txid: opt('shares-txid'), vout: 2, satoshis: 5000n,
    token: { category, amount: BigInt(sharesAmount) },
  });
  const poolU = await fetchUtxo(pool.tokenAddress, poolTxid);
  const shares = await fetchUtxo(creatorTokenAddress, opt('shares-txid'));
  const builder = new TransactionBuilder({ provider, allowImplicitFungibleTokenBurn: true })
    .addInput(poolU, pool.unlock.claim())
    .addInput(shares, sig());
  if (sharesAmount === winTotal) {
    builder.addOutput({ to: creatorTokenAddress, amount: BigInt(poolSats) });
  } else {
    const payout = Math.floor((poolSats * sharesAmount) / winTotal);
    const newYes = winner === 0 ? totalYes - sharesAmount : totalYes;
    const newNo = winner === 1 ? totalNo - sharesAmount : totalNo;
    builder
      .addOutput(poolOutput(poolSats - payout, commitment(newYes, newNo, 1, winner)))
      .addOutput({ to: creatorTokenAddress, amount: BigInt(payout) });
    console.log('partial claim payout', payout);
  }
  const txid = await finish(builder, 'claim ' + sharesAmount);
  console.log(JSON.stringify({ claimTxid: txid }));
} else {
  throw new Error('unknown op: ' + op);
}
