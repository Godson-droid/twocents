// Two Cents market contracts: end to end tests on the CashScript mock
// network, which validates every transaction against the real BCH VM.
import { readFileSync } from 'fs';
import {
  Contract,
  MockNetworkProvider,
  TransactionBuilder,
  SignatureTemplate,
} from 'cashscript';
import { secp256k1, hash160, binToHex, encodeCashAddress } from '@bitauth/libauth';
import { createHash } from 'crypto';

const TB = (provider) => new TransactionBuilder({ provider, allowImplicitFungibleTokenBurn: true });

const poolArtifact = JSON.parse(readFileSync('./artifacts/MarketPool.json', 'utf8'));
const vaultArtifact = JSON.parse(readFileSync('./artifacts/ShareVault.json', 'utf8'));

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name); }
}
async function expectFail(name, promise) {
  try {
    await promise;
    failed++; console.log('  FAIL (tx unexpectedly succeeded)', name);
  } catch (e) {
    passed++; console.log('  PASS (rejected)', name, '-', String(e.message).slice(0, 80));
  }
}

function keypair(seedByte) {
  const priv = new Uint8Array(32);
  priv[31] = seedByte;
  const pub = secp256k1.derivePublicKeyCompressed(priv);
  const pkh = hash160(pub);
  const { address } = encodeCashAddress({ payload: pkh, type: 'p2pkhWithTokens', prefix: 'bchtest' });
  return { priv, pub, pkh: binToHex(pkh), address };
}

const resolver = keypair(1);
const alice = keypair(2);
const bob = keypair(3);
const carol = keypair(4);

let txidCounter = 0;
function fakeUtxo(satoshis, token) {
  txidCounter += 1;
  const utxo = {
    txid: txidCounter.toString(16).padStart(64, '0'),
    vout: 0,
    satoshis: BigInt(satoshis),
  };
  if (token) utxo.token = token;
  return utxo;
}

function commitment(totalYes, totalNo, state, winner) {
  const b = Buffer.alloc(18);
  b.writeBigInt64LE(BigInt(totalYes), 0);
  b.writeBigInt64LE(BigInt(totalNo), 8);
  b[16] = state;
  b[17] = winner;
  return b.toString('hex');
}

function parseCommitment(hex) {
  const b = Buffer.from(hex, 'hex');
  return {
    totalYes: Number(b.readBigInt64LE(0)),
    totalNo: Number(b.readBigInt64LE(8)),
    state: b[16],
    winner: b[17],
  };
}

const NOW = 1795000000;
const BET_DEADLINE = NOW + 86400;
const VOID_DEADLINE = BET_DEADLINE + 7 * 86400;
const SUPPLY = 10000000n;
const SHARE_DUST = 5000n; // sats riding on each share UTXO; pays claim fees

// CashScript introspection returns token categories in wire order, so
// categories passed as contract constructor arguments must be reversed.
const revHex = (h) => Buffer.from(h, 'hex').reverse().toString('hex');

function makeMarket(provider, tag) {
  const yesCategory = tag.repeat(32).slice(0, 64);
  const noCategory = (tag + 'a').repeat(32).slice(0, 64);
  const stateCategory = (tag + 'b').repeat(32).slice(0, 64);
  const pool = new Contract(
    poolArtifact,
    [resolver.pkh, BigInt(BET_DEADLINE), BigInt(VOID_DEADLINE), revHex(yesCategory), revHex(noCategory)],
    { provider, addressType: 'p2sh32' },
  );
  const poolScriptHash = createHash('sha256').update(Buffer.from(pool.lockingBytecode, 'hex')).digest('hex');
  const yesVault = new Contract(
    vaultArtifact,
    [poolScriptHash, revHex(yesCategory), 0n],
    { provider, addressType: 'p2sh32' },
  );
  const noVault = new Contract(
    vaultArtifact,
    [poolScriptHash, revHex(noCategory), 1n],
    { provider, addressType: 'p2sh32' },
  );
  provider.addUtxo(pool.tokenAddress, fakeUtxo(100000, {
    category: stateCategory,
    amount: 0n, nft: { capability: 'mutable', commitment: commitment(0, 0, 0, 0) },
  }));
  provider.addUtxo(yesVault.tokenAddress, fakeUtxo(1000, { category: yesCategory, amount: SUPPLY }));
  provider.addUtxo(noVault.tokenAddress, fakeUtxo(1000, { category: noCategory, amount: SUPPLY }));
  return { pool, yesVault, noVault, yesCategory, noCategory, stateCategory };
}

async function poolUtxo(provider, pool) {
  return (await provider.getUtxos(pool.tokenAddress))[0];
}
async function vaultUtxo(provider, vault) {
  return (await provider.getUtxos(vault.tokenAddress))[0];
}
async function fundUser(provider, user, sats) {
  provider.addUtxo(user.address, fakeUtxo(sats));
  const utxos = await provider.getUtxos(user.address);
  return utxos[utxos.length - 1];
}
async function shareUtxo(provider, user, category) {
  const utxos = await provider.getUtxos(user.address);
  return utxos.find((u) => u.token && u.token.category === category);
}
function poolOutput(mkt, amount, commit) {
  return {
    to: mkt.pool.tokenAddress,
    amount: BigInt(amount),
    token: { category: mkt.stateCategory, amount: 0n, nft: { capability: 'mutable', commitment: commit } },
  };
}

async function bet(provider, mkt, user, outcome, amount) {
  const poolU = await poolUtxo(provider, mkt.pool);
  const vault = outcome === 0 ? mkt.yesVault : mkt.noVault;
  const vaultU = await vaultUtxo(provider, vault);
  const funds = await fundUser(provider, user, amount + 12000);
  const state = parseCommitment(poolU.token.nft.commitment);
  const newYes = state.totalYes + (outcome === 0 ? amount : 0);
  const newNo = state.totalNo + (outcome === 1 ? amount : 0);
  const category = outcome === 0 ? mkt.yesCategory : mkt.noCategory;
  return TB(provider)
    .addInput(poolU, mkt.pool.unlock.bet(BigInt(outcome)))
    .addInput(vaultU, vault.unlock.release())
    .addInput(funds, new SignatureTemplate(user.priv).unlockP2PKH())
    .addOutput(poolOutput(mkt, poolU.satoshis + BigInt(amount), commitment(newYes, newNo, 0, 0)))
    .addOutput({ to: vault.tokenAddress, amount: 1000n, token: { category, amount: vaultU.token.amount - BigInt(amount) } })
    .addOutput({ to: user.address, amount: SHARE_DUST, token: { category, amount: BigInt(amount) } })
    .addOutput({ to: user.address, amount: 2000n })
    .send();
}

async function closeMarket(provider, mkt, user) {
  const poolU = await poolUtxo(provider, mkt.pool);
  const st = parseCommitment(poolU.token.nft.commitment);
  const funds = await fundUser(provider, user, 8000);
  return TB(provider)
    .addInput(poolU, mkt.pool.unlock.close())
    .addInput(funds, new SignatureTemplate(user.priv).unlockP2PKH())
    .addOutput(poolOutput(mkt, poolU.satoshis, commitment(st.totalYes, st.totalNo, 2, 0)))
    .addOutput({ to: user.address, amount: 3000n })
    .setLocktime(BET_DEADLINE + 10)
    .send();
}

async function resolveMarket(provider, mkt, winner, signer, pubHex) {
  const poolU = await poolUtxo(provider, mkt.pool);
  const st = parseCommitment(poolU.token.nft.commitment);
  const funds = await fundUser(provider, alice, 8000);
  return TB(provider)
    .addInput(poolU, mkt.pool.unlock.resolve(pubHex, new SignatureTemplate(signer.priv), BigInt(winner)))
    .addInput(funds, new SignatureTemplate(alice.priv).unlockP2PKH())
    .addOutput(poolOutput(mkt, poolU.satoshis, commitment(st.totalYes, st.totalNo, 1, winner)))
    .addOutput({ to: alice.address, amount: 3000n })
    .setLocktime(BET_DEADLINE + 20)
    .send();
}

// ---------------------------------------------------------------- market 1
console.log('Market 1: full lifecycle, final claim drains the pool');
{
  const provider = new MockNetworkProvider();
  const mkt = makeMarket(provider, '11');

  await bet(provider, mkt, alice, 0, 50000);
  let p = await poolUtxo(provider, mkt.pool);
  let st = parseCommitment(p.token.nft.commitment);
  ok('alice bet 50k Yes: pool 150000', p.satoshis === 150000n);
  ok('totals 50000/0, open', st.totalYes === 50000 && st.totalNo === 0 && st.state === 0);
  const aliceShares = await shareUtxo(provider, alice, mkt.yesCategory);
  ok('alice holds 50000 Yes shares', aliceShares && aliceShares.token.amount === 50000n);

  await bet(provider, mkt, bob, 1, 30000);
  p = await poolUtxo(provider, mkt.pool);
  st = parseCommitment(p.token.nft.commitment);
  ok('bob bet 30k No: pool 180000, totals 50000/30000', p.satoshis === 180000n && st.totalYes === 50000 && st.totalNo === 30000);

  // Wrong vault for the chosen outcome must fail.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const noVaultU = await vaultUtxo(provider, mkt.noVault);
    const funds = await fundUser(provider, alice, 17000);
    const bad = TB(provider)
      .addInput(poolU, mkt.pool.unlock.bet(0n))
      .addInput(noVaultU, mkt.noVault.unlock.release())
      .addInput(funds, new SignatureTemplate(alice.priv).unlockP2PKH())
      .addOutput(poolOutput(mkt, poolU.satoshis + 5000n, commitment(55000, 30000, 0, 0)))
      .addOutput({ to: mkt.noVault.tokenAddress, amount: 1000n, token: { category: mkt.noCategory, amount: SUPPLY - 5000n } })
      .addOutput({ to: alice.address, amount: SHARE_DUST, token: { category: mkt.noCategory, amount: 5000n } })
      .addOutput({ to: alice.address, amount: 2000n });
    await expectFail('bet Yes with the No vault', bad.send());
  }

  // Claim before resolution must fail.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const shares = await shareUtxo(provider, alice, mkt.yesCategory);
    const bad = TB(provider)
      .addInput(poolU, mkt.pool.unlock.claim())
      .addInput(shares, new SignatureTemplate(alice.priv).unlockP2PKH())
      .addOutput({ to: alice.address, amount: poolU.satoshis });
    await expectFail('claim before resolution', bad.send());
  }

  // A non resolver cannot resolve.
  await expectFail('resolve by a non resolver', resolveMarket(provider, mkt, 0, alice, binToHex(alice.pub)));

  // Anyone can close betting after the deadline.
  await closeMarket(provider, mkt, bob);
  p = await poolUtxo(provider, mkt.pool);
  st = parseCommitment(p.token.nft.commitment);
  ok('close() after deadline: state 2, totals kept', st.state === 2 && st.totalYes === 50000 && st.totalNo === 30000);

  // Betting is frozen once closed.
  await expectFail('bet after close', bet(provider, mkt, alice, 0, 5000));

  // The resolver settles: Yes wins.
  await resolveMarket(provider, mkt, 0, resolver, binToHex(resolver.pub));
  p = await poolUtxo(provider, mkt.pool);
  st = parseCommitment(p.token.nft.commitment);
  ok('resolve: state 1, winner Yes', st.state === 1 && st.winner === 0);

  // Bob's losing No shares cannot claim.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const bobShares = await shareUtxo(provider, bob, mkt.noCategory);
    const bad = TB(provider)
      .addInput(poolU, mkt.pool.unlock.claim())
      .addInput(bobShares, new SignatureTemplate(bob.priv).unlockP2PKH())
      .addOutput({ to: bob.address, amount: poolU.satoshis });
    await expectFail('claim with losing shares', bad.send());
  }

  // Alice is the only winner: her claim drains the whole pool.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const shares = await shareUtxo(provider, alice, mkt.yesCategory);
    await TB(provider)
      .addInput(poolU, mkt.pool.unlock.claim())
      .addInput(shares, new SignatureTemplate(alice.priv).unlockP2PKH())
      .addOutput({ to: alice.address, amount: poolU.satoshis })
      .send();
    const remaining = await provider.getUtxos(mkt.pool.tokenAddress);
    ok('final claim drains the pool', remaining.length === 0);
    const aliceUtxos = await provider.getUtxos(alice.address);
    ok('alice received the 180000 payout', aliceUtxos.some((u) => u.satoshis === 180000n));
  }
}

// ---------------------------------------------------------------- market 2
console.log('Market 2: partial claims pay pro rata, last claim takes the dust');
{
  const provider = new MockNetworkProvider();
  const mkt = makeMarket(provider, '44');

  await bet(provider, mkt, alice, 0, 40000);
  await bet(provider, mkt, bob, 0, 20000);
  await bet(provider, mkt, carol, 1, 10000);
  let p = await poolUtxo(provider, mkt.pool);
  let st = parseCommitment(p.token.nft.commitment);
  ok('pool 170000, totals 60000/10000', p.satoshis === 170000n && st.totalYes === 60000 && st.totalNo === 10000);

  await resolveMarket(provider, mkt, 0, resolver, binToHex(resolver.pub));

  // Bob claims 20000 of 60000 winning shares: 170000 * 20000 / 60000 = 56666.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const shares = await shareUtxo(provider, bob, mkt.yesCategory);
    await TB(provider)
      .addInput(poolU, mkt.pool.unlock.claim())
      .addInput(shares, new SignatureTemplate(bob.priv).unlockP2PKH())
      .addOutput(poolOutput(mkt, 170000n - 56666n, commitment(40000, 10000, 1, 0)))
      .addOutput({ to: bob.address, amount: 56666n })
      .send();
    p = await poolUtxo(provider, mkt.pool);
    st = parseCommitment(p.token.nft.commitment);
    ok('partial claim: bob paid 56666, pool 113334, yes total 40000', p.satoshis === 113334n && st.totalYes === 40000);
  }

  // Alice takes the rest, including the rounding dust.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const shares = await shareUtxo(provider, alice, mkt.yesCategory);
    await TB(provider)
      .addInput(poolU, mkt.pool.unlock.claim())
      .addInput(shares, new SignatureTemplate(alice.priv).unlockP2PKH())
      .addOutput({ to: alice.address, amount: 113334n })
      .send();
    const remaining = await provider.getUtxos(mkt.pool.tokenAddress);
    ok('last claim takes the remaining 113334', remaining.length === 0);
  }
}

// ---------------------------------------------------------------- market 3
console.log('Market 3: an unresolved market refunds 1:1 after the void deadline');
{
  const provider = new MockNetworkProvider();
  const mkt = makeMarket(provider, '77');

  await bet(provider, mkt, alice, 0, 10000);

  // Too early to void.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const shares = await shareUtxo(provider, alice, mkt.yesCategory);
    const bad = TB(provider)
      .addInput(poolU, mkt.pool.unlock.voidClaim())
      .addInput(shares, new SignatureTemplate(alice.priv).unlockP2PKH())
      .addOutput({ to: alice.address, amount: poolU.satoshis })
      .setLocktime(VOID_DEADLINE - 100);
    await expectFail('void claim before the void deadline', bad.send());
  }

  // After the void deadline the only bettor refunds and closes the pool.
  {
    const poolU = await poolUtxo(provider, mkt.pool);
    const shares = await shareUtxo(provider, alice, mkt.yesCategory);
    await TB(provider)
      .addInput(poolU, mkt.pool.unlock.voidClaim())
      .addInput(shares, new SignatureTemplate(alice.priv).unlockP2PKH())
      .addOutput({ to: alice.address, amount: poolU.satoshis })
      .setLocktime(VOID_DEADLINE + 10)
      .send();
    const remaining = await provider.getUtxos(mkt.pool.tokenAddress);
    ok('void claim drains the pool back to the bettor', remaining.length === 0);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
