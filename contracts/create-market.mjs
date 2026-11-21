// Two Cents: create a prediction market on BCH mainnet (or build the
// transactions offline for chipnet).
//
// A market needs three token categories (Yes shares, No shares, state
// NFT), and a category is the byte reversed txid of the genesis
// transaction's first input, so the script first fans the funding UTXO
// out into three source UTXOs on three different txids, then builds the
// three genesis transactions on top. Everything is built and validated
// locally against the CashScript mock VM before anything is broadcast.
//
// Usage:
//   CREATOR_WIF=<wif> node create-market.mjs \
//     --question "Will it rain in Lagos on Saturday?" \
//     --detail "Resolves Yes if rainfall is recorded..." \
//     --betting-deadline 1795600000 --void-deadline 1796204800 \
//     --funding-txid <txid> --funding-vout 0 --funding-sats 550000 \
//     [--resolver-wif <wif>] [--seed-sats 10000] [--supply 100000000] \
//     [--broadcast] [--out deployment.json]
//
// Without --broadcast it only builds, validates and prints. With it, the
// transactions are pushed in order through Blockchair's HTTPS API.
// The resolver defaults to the creator key.
import { readFileSync, writeFileSync } from 'fs';
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
  secp256k1,
  hash160,
  binToHex,
  hexToBin,
  decodePrivateKeyWif,
  encodeCashAddress,
} from '@bitauth/libauth';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--broadcast') args.broadcast = true;
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i];
}
const required = ['question', 'betting-deadline', 'void-deadline', 'funding-txid', 'funding-vout', 'funding-sats'];
for (const r of required) {
  if (!args[r]) { console.error('missing --' + r); process.exit(1); }
}
const WIF = process.env.CREATOR_WIF;
if (!WIF) { console.error('CREATOR_WIF env var is required'); process.exit(1); }

const SEED_SATS = BigInt(args['seed-sats'] || 10000);
const SUPPLY = BigInt(args.supply || 100000000);
const BETTING_DEADLINE = BigInt(args['betting-deadline']);
const VOID_DEADLINE = BigInt(args['void-deadline']);

function keypairFromWif(wif) {
  const decoded = decodePrivateKeyWif(wif);
  const priv = typeof decoded === 'string' ? null : decoded.privateKey;
  if (!priv) { console.error('could not decode WIF'); process.exit(1); }
  const pub = secp256k1.derivePublicKeyCompressed(priv);
  const pkh = hash160(pub);
  const { address } = encodeCashAddress({ payload: pkh, type: 'p2pkhWithTokens' });
  const lockHex = binToHex(new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]));
  return { priv, pub, pkh: binToHex(pkh), address, lockHex };
}
const creator = keypairFromWif(WIF);
const resolver = process.env.RESOLVER_WIF ? keypairFromWif(process.env.RESOLVER_WIF) : creator;

const poolArtifact = JSON.parse(readFileSync('./artifacts/MarketPool.json', 'utf8'));
const vaultArtifact = JSON.parse(readFileSync('./artifacts/ShareVault.json', 'utf8'));
const revHex = (h) => Buffer.from(h, 'hex').reverse().toString('hex');
const txidOf = (hex) => createHash('sha256').update(createHash('sha256').update(Buffer.from(hex, 'hex')).digest()).digest().reverse().toString('hex');

const provider = new MockNetworkProvider();
provider.network = Network.MAINNET; // build mainnet transactions offline
const fundingUtxo = {
  txid: args['funding-txid'],
  vout: Number(args['funding-vout']),
  satoshis: BigInt(args['funding-sats']),
  lockingBytecode: creator.lockHex,
};
provider.addUtxo(creator.address, fundingUtxo);

const txs = [];
async function buildAndStage(builder, label) {
  const hex = builder.build();
  const txid = txidOf(hex);
  await builder.send(); // validates against the mock VM and advances the UTXO set
  txs.push({ label, txid, hex });
  console.log(`${label}: ${txid} (${hex.length / 2} bytes)`);
  return txid;
}
const sig = (kp) => new SignatureTemplate(kp.priv).unlockP2PKH();
const plainOut = (sats) => ({ to: creator.address, amount: BigInt(sats) });

// Fan out: S1 makes three self outputs; S2 and S3 hop two of them so the
// three genesis source UTXOs sit on three distinct txids.
const total = fundingUtxo.satoshis;
const aAmt = total / 3n;
const bAmt = total / 3n;
const cAmt = total - aAmt - bAmt - 600n; // S1 fee
const s1 = new TransactionBuilder({ provider })
  .addInput(fundingUtxo, sig(creator))
  .addOutputs([plainOut(aAmt), plainOut(bAmt), plainOut(cAmt)]);
const s1Txid = await buildAndStage(s1, 'fanout S1');

async function hop(txid, vout, sats, label) {
  const utxo = { txid, vout, satoshis: BigInt(sats), lockingBytecode: creator.lockHex };
  const b = new TransactionBuilder({ provider })
    .addInput(utxo, sig(creator))
    .addOutput(plainOut(BigInt(sats) - 500n));
  return buildAndStage(b, label);
}
const s2Txid = await hop(s1Txid, 0, aAmt, 'hop S2');
const s3Txid = await hop(s1Txid, 1, bAmt, 'hop S3');
// The state source also hops: token genesis is only substantiated from
// an outpoint at vout 0, so every genesis source sits at vout 0 of its
// own transaction.
const s4Txid = await hop(s1Txid, 2, cAmt, 'hop S4');

// Categories are the genesis inputs' txids in display order (the SDK
// handles the wire byte order); only contract constructor arguments
// take the reversed form, because introspection returns wire order.
const yesCategory = s2Txid;
const noCategory = s3Txid;
const stateCategory = s4Txid;

const pool = new Contract(
  poolArtifact,
  [resolver.pkh, BETTING_DEADLINE, VOID_DEADLINE, revHex(yesCategory), revHex(noCategory)],
  { provider, addressType: 'p2sh32' },
);
const poolScriptHash = createHash('sha256').update(Buffer.from(pool.lockingBytecode, 'hex')).digest('hex');
const yesVault = new Contract(vaultArtifact, [poolScriptHash, revHex(yesCategory), 0n], { provider, addressType: 'p2sh32' });
const noVault = new Contract(vaultArtifact, [poolScriptHash, revHex(noCategory), 1n], { provider, addressType: 'p2sh32' });

console.log('pool:', pool.tokenAddress);
console.log('yes vault:', yesVault.tokenAddress);
console.log('no vault:', noVault.tokenAddress);

async function genesis(sourceTxid, vout, sats, tokenOutput, label) {
  const utxo = { txid: sourceTxid, vout, satoshis: BigInt(sats), lockingBytecode: creator.lockHex };
  const spent = tokenOutput.amount + 1500n; // token output sats + fee
  const b = new TransactionBuilder({ provider })
    .addInput(utxo, sig(creator))
    .addOutput(tokenOutput)
    .addOutput(plainOut(BigInt(sats) - spent));
  return buildAndStage(b, label);
}

const yesTxid = await genesis(s2Txid, 0, aAmt - 500n, {
  to: yesVault.tokenAddress, amount: 1000n,
  token: { category: yesCategory, amount: SUPPLY },
}, 'genesis Yes shares');
const noTxid = await genesis(s3Txid, 0, bAmt - 500n, {
  to: noVault.tokenAddress, amount: 1000n,
  token: { category: noCategory, amount: SUPPLY },
}, 'genesis No shares');
// A genesis transaction cannot create a mutable NFT directly. It creates
// a minting NFT, and a follow up transaction spends that minting NFT to
// create the single mutable state NFT, burning the minting NFT so the
// state NFT is provably unique.
const mintTxid = await genesis(s4Txid, 0, cAmt - 500n, {
  to: creator.address, amount: 1000n,
  token: { category: stateCategory, amount: 0n, nft: { capability: 'minting', commitment: '' } },
}, 'genesis state minting NFT');
const zeroCommitment = Buffer.alloc(18).toString('hex');
const mintUtxo = {
  txid: mintTxid, vout: 0, satoshis: 1000n, lockingBytecode: creator.lockHex,
  token: { category: stateCategory, amount: 0n, nft: { capability: 'minting', commitment: '' } },
};
const genesisChangeUtxo = {
  txid: mintTxid, vout: 1, satoshis: cAmt - 3000n, lockingBytecode: creator.lockHex,
};
const stateBuilder = new TransactionBuilder({ provider })
  .addInput(mintUtxo, sig(creator))
  .addInput(genesisChangeUtxo, sig(creator))
  .addOutput({
    to: pool.tokenAddress, amount: SEED_SATS,
    token: { category: stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: zeroCommitment } },
  })
  .addOutput(plainOut(cAmt - 2000n - SEED_SATS - 1200n));
const stateTxid = await buildAndStage(stateBuilder, 'create state NFT');

const entry = {
  id: 'market-' + stateTxid.slice(0, 12),
  question: args.question,
  detail: args.detail || '',
  network: 'mainnet',
  address: pool.tokenAddress,
  vaultYesAddress: yesVault.tokenAddress,
  vaultNoAddress: noVault.tokenAddress,
  stateCategory,
  poolScriptHash,
  params: {
    resolverPkh: resolver.pkh,
    bettingDeadline: Number(BETTING_DEADLINE),
    voidDeadline: Number(VOID_DEADLINE),
    yesCategory,
    noCategory,
  },
  supplyPerSide: SUPPLY.toString(),
  seedSats: SEED_SATS.toString(),
  createdTxids: { yes: yesTxid, no: noTxid, state: stateTxid },
};
const outPath = args.out || 'deployment.json';
writeFileSync(outPath, JSON.stringify({ market: entry, transactions: txs }, null, 2));
console.log('wrote', outPath);

if (args.broadcast) {
  for (const t of txs) {
    const res = execFileSync('curl', [
      '-s', '-X', 'POST', 'https://api.blockchair.com/bitcoin-cash/push/transaction',
      '-d', 'data=' + t.hex,
    ]).toString();
    console.log('broadcast', t.label, '->', res.slice(0, 160));
  }
} else {
  console.log('dry run only: re run with --broadcast to push these transactions');
}
