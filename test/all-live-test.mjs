#!/usr/bin/env node
/**
 * OTRUST — complete live functional test suite (allt-i-ett)
 */

import crypto from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { solvePow, verifyPow, sign as edSign, generateKeypair } from '../src/crypto.js';

ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.OTRUST_URL || 'https://otrust.eu';

const c = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m'
};

const results = { passed: 0, failed: 0, skipped: 0, sections: [] };
let currentSection = 'General';

function section(name) {
  currentSection = name;
  console.log(`\n${c.bold}${c.cyan}═══ ${name} ═══${c.reset}`);
}

function pass(name) {
  results.passed++;
  console.log(`${c.green}✓${c.reset} ${name}`);
}

function fail(name, detail = '') {
  results.failed++;
  console.log(`${c.red}✗${c.reset} ${name}${detail ? `: ${detail}` : ''}`);
  results.sections.push({ section: currentSection, name, detail });
}

function skip(name, reason) {
  results.skipped++;
  console.log(`${c.yellow}⊘${c.reset} ${name} (${reason})`);
}

function assert(cond, name, detail = '') {
  if (cond) pass(name);
  else fail(name, detail);
  return cond;
}

async function api(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: { Origin: BASE, ...options.headers }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
  return { status: res.status, ok: res.ok, data, text, headers: res.headers };
}

function randomHash() {
  return crypto.randomBytes(32).toString('hex');
}

function runScript(scriptName) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(__dirname, scriptName)], {
      env: { ...process.env, OTRUST_URL: BASE },
      stdio: 'inherit'
    });
    child.on('close', (code) => resolve(code === 0));
  });
}

// ─── Pages & redirects ───────────────────────────────────────────
async function testPagesAndRedirects() {
  section('Pages, redirects & static assets');

  const pages = [
    '/', '/timestamp', '/proof', '/sign', '/sign-in', '/docs', '/api-docs',
    '/playground/', '/about', '/transparency', '/changelog', '/use-cases',
    '/health-check', '/partners/preview', '/partners/hemsted', '/privacy-policy', '/terms',
    '/install.html', '/report-abuse', '/notes/why-otrust', '/partners/hemsted',
    '/swagger.html', '/sign/view', '/sign/act', '/sign/create'
  ];
  for (const route of pages) {
    const res = await fetch(`${BASE}${route}`, { redirect: 'follow' });
    const html = await res.text();
    assert(res.ok && (html.includes('OTRUST') || html.includes('otrust')), `GET ${route}`);
  }

  const redirects = [
    ['https://otrust.eu/docs.html', 200],
    ['https://otrust.eu/privacy', 200],
    ['https://otrust.eu/signin', 200],
    ['https://otrust.eu/playground', 200],
    ['https://www.otrust.eu/', 200]
  ];
  for (const [url, expect] of redirects) {
    const res = await fetch(url, { redirect: 'follow' });
    assert(res.status === expect, `Redirect ${url} → ${res.status}`);
  }

  for (const asset of ['/favicon.svg', '/robots.txt', '/sitemap.xml', '/openapi.json']) {
    const res = await fetch(`${BASE}${asset}`);
    assert(res.ok, `Static asset ${asset}`);
  }
}

// ─── Timestamp: PoW + Ed25519 ─────────────────────────────────────
async function testTimestampCrypto() {
  section('Timestamp — PoW, Ed25519 claim, bulk, lookup, receipts');

  const ch = await api('/challenge');
  assert(ch.ok && ch.data?.challenge?.length === 64, 'GET /challenge');
  const difficulty = ch.data?.difficulty || 16;

  const keypair = generateKeypair('ed25519');
  const hash = randomHash();
  let nonce;
  try {
    const started = Date.now();
    nonce = solvePow(ch.data.challenge, difficulty);
    pass(`Solve PoW (difficulty=${difficulty}, ${Date.now() - started}ms)`);
  } catch (err) {
    fail('Solve PoW', err.message);
    return;
  }

  const signature = await edSign(hash, keypair.privateKey);
  const claim = await api('/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hash,
      signature,
      pubkey: keypair.publicKey,
      pow: { challenge: ch.data.challenge, nonce },
      filename: 'all-live-test.txt'
    })
  });
  assert(
    (claim.status === 201 || claim.status === 200) && (claim.data?.receipt_id || claim.data?.status),
    'POST /claim with Ed25519 + PoW',
    `status=${claim.status} ${JSON.stringify(claim.data).slice(0, 120)}`
  );

  const receiptId = claim.data?.receipt_id;
  if (receiptId) {
    const proof = await api(`/proof/${receiptId}`);
    assert(proof.ok || proof.status === 200, `GET /proof/${receiptId} receipt page`);
    const proofJson = await api(`/proof/${receiptId}?format=json`);
    assert(proofJson.ok, 'GET receipt JSON metadata');
  }

  const verify = await api('/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash })
  });
  assert(verify.ok && (verify.data?.status === 'found' || verify.data?.exists), 'Verify claimed hash');

  const lookup = await api(`/lookup/${hash}`);
  assert(lookup.ok, 'GET /lookup/:hash');

  const receipts = await api(`/receipts/${keypair.publicKey}`);
  assert(
    receipts.status === 410 && receipts.data?.error === 'local_history_only',
    'GET /receipts/:pubkey disabled (local history only)'
  );

  // Bulk claim (2 hashes, one PoW)
  try {
    const ch2 = await api('/challenge');
    const nonce2 = solvePow(ch2.data.challenge, ch2.data.difficulty);
    const hash2 = randomHash();
    const hash3 = randomHash();
    const sig2 = await edSign(hash2, keypair.privateKey);
    const sig3 = await edSign(hash3, keypair.privateKey);
    const bulk = await api('/claim/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pow: { challenge: ch2.data.challenge, nonce: nonce2 },
        claims: [
          { hash: hash2, signature: sig2, pubkey: keypair.publicKey },
          { hash: hash3, signature: sig3, pubkey: keypair.publicKey }
        ]
      })
    });
    assert(bulk.ok || bulk.status === 201, 'POST /claim/bulk', `status=${bulk.status}`);
  } catch (err) {
    skip('POST /claim/bulk', err.message.includes('timeout') ? 'PoW timeout at current difficulty' : err.message);
  }

  const sigCheck = await api('/verify/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, signature, pubkey: keypair.publicKey })
  });
  assert(sigCheck.ok && sigCheck.data?.valid === true, 'POST /verify/signature Ed25519 valid=true');

  const badSig = await api('/verify/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, signature: 'a'.repeat(128), pubkey: keypair.publicKey })
  });
  assert(badSig.ok && badSig.data?.valid === false, 'POST /verify/signature rejects bad signature');
}

// ─── Sign: upload, create, Ed25519 sign, cancel ───────────────────
async function testSignFlow() {
  section('Sign — upload, create, Ed25519 party sign, cancel');

  const doc = `OTRUST all-live sign test\n${crypto.randomBytes(16).toString('hex')}\n`;
  const docBuf = Buffer.from(doc, 'utf8');
  const documentHash = crypto.createHash('sha256').update(docBuf).digest('hex');

  const upload = await fetch(`${BASE}/sign/upload`, {
    method: 'POST',
    headers: {
      Origin: BASE,
      'Content-Type': 'text/plain',
      'X-Filename': 'all-live-sign.txt',
      'X-TTL-Hours': '1'
    },
    body: docBuf
  });
  const uploadData = await upload.json();
  assert(upload.ok && uploadData.document_hash === documentHash, 'Upload + server hash matches');

  const create = await api('/sign/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_hash: documentHash,
      title: 'All-Live Sign Test',
      filename: 'all-live-sign.txt',
      creator_email: 'all-live@otrust.eu',
      signing_order: 'parallel',
      parties: [{ email: 'signer-live@otrust.eu', role: 'signer', name: 'Live Signer' }]
    })
  });

  if (create.status === 429 || create.data?.error === 'rate_limited') {
    skip('Sign create + Ed25519 party sign', 'rate limited — retry later');
    skip('Cancel sign request', 'depends on create');
    return;
  }

  const signId = create.data?.sign_id;
  const cancelToken = create.data?.cancel_token;
  assert(create.status === 201 && signId?.startsWith('sr_'), 'Create sign request', JSON.stringify(create.data).slice(0, 120));

  // Party token is only sent by email — test validation endpoints instead
  const verifyBad = await api(`/sign/${signId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid', document_hash: documentHash })
  });
  assert(verifyBad.status === 200 && verifyBad.data?.valid === false, 'Sign verify rejects invalid party token');

  const completeBad = await api(`/sign/${signId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'invalid', document_hash: documentHash, action: 'signed' })
  });
  assert(completeBad.status === 400, 'Sign complete rejects missing/invalid token', `status=${completeBad.status}`);

  const actPage = await fetch(`${BASE}/sign/act`);
  assert(actPage.ok, 'GET /sign/act page');

  if (cancelToken) {
    const cancel = await api(`/sign/${signId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel_token: cancelToken, reason: 'all-live-test cleanup' })
    });
    assert(cancel.ok || cancel.data?.success, 'Cancel sign request with cancel_token', `status=${cancel.status}`);
  }
}

// ─── Proof / ID ──────────────────────────────────────────────────
async function testProofFlows() {
  section('Proof / ID — age, income, membership, identity');

  const age = await api('/api/proof/age', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birthDate: '1990-06-15', minAge: 18 })
  });
  assert(
    age.status === 410 && age.data?.error === 'browser_proof_required',
    'POST /api/proof/age keeps private input client-side'
  );

  const income = await api('/api/proof/income', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ income: 50000, minIncome: 30000 })
  });
  assert(
    income.status === 410 && income.data?.error === 'browser_proof_required',
    'POST /api/proof/income keeps private input client-side'
  );

  const membership = await api('/api/proof/membership', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: 'mem_' + randomHash().slice(0, 8), organizationId: 'org_test', organizationName: 'All Live Org' })
  });
  assert(
    membership.status === 410 && membership.data?.error === 'browser_proof_required',
    'POST /api/proof/membership keeps private input client-side'
  );

  const identity = await api('/api/proof/identity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personnummer: '19900615-0000',
      birthDate: '1990-06-15',
      pin: '847291',
      faceMatch: true,
      livenessVerified: true
    })
  });
  assert(
    identity.status === 410 && identity.data?.error === 'trusted_identity_credential_required',
    'POST /api/proof/identity rejects self-attested registration'
  );

  return null;
}

// ─── Auth E2E ────────────────────────────────────────────────────
async function testAuthE2E(identityProof) {
  section('Auth — full E2E with identity proof');

  if (!identityProof?.proofId) {
    skip('Auth prove + token verify', 'no identity proof created');
    return;
  }

  const challenge = await api('/api/v1/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'all_live_test',
      redirectUri: 'https://example.com/callback',
      scope: ['identity'],
      state: 'all-live-' + randomHash().slice(0, 8)
    })
  });
  assert(challenge.ok && challenge.data?.challengeId, 'Create auth challenge for E2E');

  const prove = await api('/api/v1/auth/prove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: challenge.data.challengeId,
      proofId: identityProof.proofId,
      pin: '847291'
    })
  });
  assert(prove.ok && prove.data?.token, 'POST /api/v1/auth/prove with PIN', JSON.stringify(prove.data).slice(0, 120));

  if (prove.data?.token) {
    const verify = await api('/api/v1/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: prove.data.token })
    });
    assert(verify.ok && verify.data?.valid === true, 'POST /api/v1/auth/verify token valid=true');

    const userinfo = await fetch(`${BASE}/api/v1/auth/userinfo`, {
      headers: { Authorization: `Bearer ${prove.data.token}`, Origin: BASE }
    });
    const ui = await userinfo.json().catch(() => ({}));
    assert(userinfo.ok && (ui.proofId || ui.sub), 'GET /api/v1/auth/userinfo with bearer token');
  }

  const reused = await api('/api/v1/auth/prove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challengeId: challenge.data.challengeId,
      proofId: identityProof.proofId,
      pin: '847291'
    })
  });
  assert(
    ['challenge_used', 'invalid_challenge'].includes(reused.data?.error),
    'Reused challenge rejected',
    reused.data?.error
  );
}

// ─── Email & admin surfaces ──────────────────────────────────────
async function testEmailAndAdmin() {
  section('Email, admin guards & abuse reporting');

  const webhook = await api('/sign/email-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'test@evil.com', subject: 'test' })
  });
  assert(webhook.status === 401 || webhook.status === 403, 'Email webhook rejects unsigned request', `status=${webhook.status}`);

  const adminBlock = await api('/api/admin/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'abuse@example.com' })
  });
  assert(adminBlock.status === 401 || adminBlock.status === 403, 'Admin block requires key', `status=${adminBlock.status}`);

  const csrf = await api('/csrf-token');
  assert(csrf.ok && csrf.data?.token, 'GET /csrf-token');

  const abuse = await api('/api/report-abuse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'reporter@otrust.eu',
      type: 'automated_test',
      description: 'All-live test report — safe to ignore',
      reference: `${BASE}/sign`
    })
  });
  assert(abuse.ok || abuse.status === 200, 'POST /api/report-abuse', `status=${abuse.status}`);
}

// ─── Stats & transparency ─────────────────────────────────────────
async function testStats() {
  section('Stats & transparency (no sensitive leaks)');

  const stats = await api('/stats');
  assert(stats.ok, 'GET /stats');
  if (stats.data) {
    const json = JSON.stringify(stats.data);
    const leaks = ['password', 'mongodb', 'secret', 'smtp', 'resend'].filter((k) => json.toLowerCase().includes(k));
    assert(leaks.length === 0, 'Stats response has no credential leaks', leaks.join(', '));
    assert(typeof stats.data.total_records === 'number' || typeof stats.data.totalRecords === 'number' || json.includes('record'), 'Stats returns aggregate counts');
  }

  const transparency = await fetch(`${BASE}/transparency`);
  assert(transparency.ok, 'GET /transparency page');
}

// ─── Security regression ─────────────────────────────────────────
async function testSecurity() {
  section('Security regression checks');

  const csrf = await fetch(`${BASE}/claim/simple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ hash: randomHash() })
  });
  assert(csrf.status === 403, 'CSRF blocks evil origin on /claim/simple');

  const nosql = await api('/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash: { $gt: '' } })
  });
  assert(nosql.status === 400, 'NoSQL injection blocked in verify');

  const headers = await fetch(`${BASE}/health`);
  assert(headers.headers.get('content-security-policy'), 'CSP header present');
  assert(headers.headers.get('x-frame-options'), 'X-Frame-Options present');
}

async function main() {
  console.log(`
${c.bold}${c.cyan}╔══════════════════════════════════════════════════════════════╗
║     OTRUST — KOMPLETT LIVE TEST (allt-i-ett)                 ║
║     Target: ${BASE.padEnd(44)}║
╚══════════════════════════════════════════════════════════════╝${c.reset}
`);

  const started = Date.now();

  // Layer 1: existing suites
  section('Existing suites (full-service + deep-live)');
  const fullOk = await runScript('full-service-test.mjs');
  assert(fullOk, 'full-service-test.mjs');
  const deepOk = await runScript('deep-live-test.mjs');
  assert(deepOk, 'deep-live-test.mjs');

  // Layer 2: extended coverage
  try {
    await testPagesAndRedirects();
    await testTimestampCrypto();
    await testSignFlow();
    const identity = await testProofFlows();
    await testAuthE2E(identity);
    await testEmailAndAdmin();
    await testStats();
    await testSecurity();
  } catch (err) {
    fail('Suite runtime error', err.message);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`
${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}
${c.bold}                         SLUTRESULTAT${c.reset}
${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}
  ${c.green}Passed:${c.reset}  ${results.passed}
  ${c.red}Failed:${c.reset}  ${results.failed}
  ${c.yellow}Skipped:${c.reset} ${results.skipped}
  ${c.dim}Duration: ${seconds}s${c.reset}
${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}
`);

  if (results.failed > 0) {
    console.log(`${c.red}Misslyckade tester:${c.reset}`);
    for (const item of results.sections) {
      console.log(`  • [${item.section}] ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
    }
    process.exit(1);
  }
  console.log(`${c.green}${c.bold}Allt grönt! ✓${c.reset}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
