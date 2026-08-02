#!/usr/bin/env node
/**
 * Deep live functional tests for otrust.eu
 * - Sign flow with real file upload + hash-based sign request
 * - Auth with Hemsted partner branding
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.OTRUST_URL || 'https://otrust.eu';
const ORIGIN = BASE;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const results = { passed: 0, failed: 0 };

function pass(msg) {
  results.passed++;
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg, err) {
  results.failed++;
  console.log(`${colors.red}✗${colors.reset} ${msg}${err ? `: ${err}` : ''}`);
}

function section(title) {
  console.log(`\n${colors.bold}${colors.cyan}═══ ${title} ═══${colors.reset}`);
}

async function fetchJSON(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Origin: ORIGIN,
      ...options.headers
    }
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { status: res.status, data, ok: res.ok, headers: res.headers, text };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function assert(condition, name, detail = '') {
  if (condition) {
    pass(name);
    return true;
  }
  fail(name, detail);
  return false;
}

async function testSignFlow() {
  section('Sign — file upload + sign request');

  const docContent = `OTRUST deep live test document\nGenerated: ${new Date().toISOString()}\nNonce: ${crypto.randomBytes(8).toString('hex')}\n`;
  const docName = 'otrust-deep-test.txt';
  const docBuffer = Buffer.from(docContent, 'utf8');
  const documentHash = sha256(docBuffer);

  const upload = await fetch(`${BASE}/sign/upload`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'text/plain',
      'X-Filename': docName,
      'X-TTL-Hours': '1'
    },
    body: docBuffer
  });
  const uploadData = await upload.json().catch(() => ({}));

  assert(
    upload.ok && uploadData.file_id && uploadData.file_token,
    'Upload document via POST /sign/upload',
    `status=${upload.status} body=${JSON.stringify(uploadData).slice(0, 120)}`
  );

  if (!uploadData.file_id) return;

  const fileRes = await fetch(
    `${BASE}/sign/file/${uploadData.file_id}?file_token=${uploadData.file_token}`,
    { headers: { Origin: ORIGIN } }
  );
  const fileBody = await fileRes.text();
  const disposition = fileRes.headers.get('content-disposition') || '';

  assert(
    fileRes.ok && fileBody === docContent,
    'Download uploaded file with file_token',
    `status=${fileRes.status}`
  );
  assert(
    disposition.includes('attachment'),
    'Uploaded file served as attachment (XSS mitigation)',
    disposition || 'missing Content-Disposition'
  );

  const create = await fetchJSON('/sign/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document_hash: documentHash,
      title: 'Deep Live Test Agreement',
      filename: docName,
      document_url: `${BASE}/sign/file/${uploadData.file_id}?file_token=${uploadData.file_token}`,
      creator_email: 'deep-test@otrust.eu',
      signing_order: 'parallel',
      message: 'Automated deep live test — safe to ignore',
      parties: [
        { email: 'signer-a@otrust.eu', role: 'signer', name: 'Signer A' },
        { email: 'signer-b@otrust.eu', role: 'viewer', name: 'Viewer B' }
      ]
    })
  });

  const signId = create.data?.sign_id || create.data?.id || create.data?.sign_request_id;
  assert(
    create.status === 201 && signId?.startsWith('sr_'),
    'Create sign request with document hash',
    `status=${create.status} body=${JSON.stringify(create.data).slice(0, 160)}`
  );

  if (!signId) return;

  const viewToken = create.data?.view_token;

  const publicStatus = await fetchJSON(`/sign/${signId}`, {
    headers: { Accept: 'application/json' }
  });
  assert(
    publicStatus.ok && publicStatus.data?.requires_token === true && publicStatus.data?.is_authenticated === false,
    'Unsigned status view returns minimal public metadata only',
    `status=${publicStatus.status} body=${JSON.stringify(publicStatus.data)}`
  );

  const status = viewToken
    ? await fetchJSON(`/sign/${signId}?token=${viewToken}`, {
        headers: { Accept: 'application/json' }
      })
    : publicStatus;

  assert(
    status.ok && status.data?.id === signId && status.data?.is_authenticated === true,
    'Authenticated sign status via view_token',
    `status=${status.status}`
  );

  if (status.data?.is_authenticated) {
    assert(
      status.data.document_hash === documentHash,
      'Sign request stores correct document hash',
      `got=${status.data.document_hash}`
    );
    assert(
      status.data.total_parties === 2,
      'Sign request has expected parties',
      `count=${status.data.total_parties}`
    );
  }
  if (viewToken) {
    const viewPage = await fetch(`${BASE}/sign/${signId}?token=${viewToken}`, {
      headers: { Accept: 'text/html' }
    });
    const html = await viewPage.text();
    assert(
      viewPage.ok && html.includes('OTRUST'),
      'Sign view page loads with view token',
      `status=${viewPage.status}`
    );
  } else {
    fail('Sign view page loads with view token', 'missing view_token in response');
  }

  const badToken = await fetchJSON(`/sign/${signId}?token=invalid-token-123`, {
    headers: { Accept: 'application/json' }
  });
  assert(
    badToken.ok && badToken.data?.requires_token === true && badToken.data?.is_authenticated === false,
    'Invalid view token falls back to minimal public status (no data leak)',
    `status=${badToken.status}`
  );
}

async function testAuthBranding() {
  section('Auth — Hemsted partner branding');

  const health = await fetchJSON('/health');
  if (health.data?.features?.identity_auth === false) {
    const unavailable = await fetchJSON('/api/v1/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'hemsted_prod',
        redirectUri: 'https://hemsted.se/auth/callback',
        scope: ['identity', 'profile']
      })
    });
    assert(
      unavailable.status === 503 && unavailable.data?.error === 'auth_capability_unavailable',
      'Hosted Auth fails closed without a trusted issuer',
      `status=${unavailable.status}`
    );

    const partnerPreview = await fetch(`${BASE}/partners/hemsted`);
    const partnerHtml = await partnerPreview.text();
    assert(
      partnerPreview.ok && (partnerHtml.includes('Branded Auth') || partnerHtml.includes('Hemsted')),
      'Hemsted partner preview remains available while Auth is disabled'
    );
    return;
  }

  const challenge = await fetchJSON('/api/v1/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'hemsted_prod',
      redirectUri: 'https://hemsted.se/auth/callback',
      scope: ['identity', 'profile'],
      state: 'deep-live-test-state'
    })
  });

  const challengeId = challenge.data?.challengeId;
  assert(
    challenge.ok && challengeId?.startsWith('ch_'),
    'Create Hemsted auth challenge',
    `status=${challenge.status}`
  );
  assert(
    challenge.data?.themeId === 'hemsted_dark',
    'Hemsted challenge defaults to hemsted_dark theme',
    `themeId=${challenge.data?.themeId}`
  );
  assert(
    challenge.data?.loginUrl?.includes('theme_id=hemsted_dark'),
    'Login URL includes theme_id=hemsted_dark',
    challenge.data?.loginUrl
  );

  if (!challengeId) return;

  const metadata = await fetchJSON(`/api/v1/auth/challenge/${challengeId}`);
  assert(metadata.ok && metadata.data?.success, 'Fetch challenge metadata', `status=${metadata.status}`);

  if (metadata.data?.branding) {
    assert(
      metadata.data.branding.headline?.includes('Hemsted'),
      'Branding headline references Hemsted',
      metadata.data.branding.headline
    );
    assert(
      metadata.data.branding.primaryColor === '#0F1B2D',
      'Branding uses Hemsted primary color',
      metadata.data.branding.primaryColor
    );
    assert(
      metadata.data.branding.allowedIdentityMethods?.includes('proof'),
      'Branding allows proof identity method'
    );
    assert(
      !metadata.data.redirectUri && !metadata.data.challenge,
      'Metadata does not leak redirect URI or challenge secret'
    );
  }

  const loginPage = await fetch(`${BASE}/auth/login?challenge=${challengeId}&theme_id=hemsted_dark`);
  const loginHtml = await loginPage.text();
  assert(loginPage.ok, 'Hemsted branded login page loads', `status=${loginPage.status}`);
  assert(
    loginHtml.includes('Hemsted') || loginHtml.includes('hemsted'),
    'Login page renders Hemsted branding'
  );
  assert(
    loginHtml.includes('DPO') || loginHtml.includes('__cf_email__'),
    'Login page shows DPO contact (required disclosure)'
  );
  assert(
    loginHtml.includes('createProofLink') && loginHtml.includes('auth_challenge'),
    'Login page wires proof flow via createProofLink + auth_challenge'
  );

  const proofPage = await fetch(`${BASE}/proof?auth_challenge=${challengeId}`);
  const proofHtml = await proofPage.text();
  assert(proofPage.ok, 'Proof page loads with auth_challenge', `status=${proofPage.status}`);
  assert(
    proofHtml.includes('Hemsted') || proofHtml.includes('hemsted') || proofHtml.includes('ID'),
    'Proof page shows partner-aware ID setup'
  );

  const partnerPreview = await fetch(`${BASE}/partners/hemsted`);
  const partnerHtml = await partnerPreview.text();
  assert(partnerPreview.ok, 'Hemsted partner preview page loads');
  assert(
    partnerHtml.includes('Branded Auth') || partnerHtml.includes('Hemsted'),
    'Partner preview explains branded auth flow'
  );

  const staging = await fetchJSON('/api/v1/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'hemsted_prod',
      redirectUri: 'https://hemsted.se/auth/callback',
      theme_id: 'hemsted_dark_staging'
    })
  });
  assert(
    staging.data?.themeId === 'hemsted_dark_staging',
    'Staging theme_id supported',
    staging.data?.themeId
  );

  const unsafeTheme = await fetchJSON('/api/v1/auth/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'hemsted_prod',
      redirectUri: 'https://hemsted.se/auth/callback',
      theme_id: '<script>alert(1)</script>'
    })
  });
  assert(
    unsafeTheme.status === 400 && unsafeTheme.data?.error === 'invalid_theme_id',
    'Unsafe theme_id rejected',
    `status=${unsafeTheme.status}`
  );

  const noAdmin = await fetchJSON('/admin/auth-branding/smoke_client', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headline: 'Unauthorized' })
  });
  assert(
    noAdmin.status === 403,
    'Branding admin endpoint requires admin key',
    `status=${noAdmin.status}`
  );

  const badToken = await fetchJSON('/api/v1/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'not-a-real-token' })
  });
  assert(
    badToken.status === 401 || badToken.status === 400,
    'Invalid auth token rejected on verify',
    `status=${badToken.status}`
  );
}

async function testProofVerify() {
  section('Proof — public verification surface');

  const unknown = await fetchJSON('/api/proof/id_does_not_exist_12345');
  assert(unknown.status === 404, 'Unknown proof ID returns 404');

  const proofPage = await fetch(`${BASE}/proof`);
  const html = await proofPage.text();
  assert(proofPage.ok && html.includes('OTRUST'), 'Proof tool page loads');
}

async function main() {
  console.log(`
${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════╗
║          OTRUST Deep Live Test Suite                     ║
║          Target: ${BASE.padEnd(40)}║
╚══════════════════════════════════════════════════════════╝${colors.reset}
`);

  const started = Date.now();
  try {
    const health = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(10000) });
    assert(health.ok, 'Server reachable', `status=${health.status}`);
    if (!health.ok) process.exit(1);

    await testSignFlow();
    await testAuthBranding();
    await testProofVerify();
  } catch (err) {
    fail('Test suite crashed', err.message);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(2);
  console.log(`
${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}
  ${colors.green}Passed:${colors.reset} ${results.passed}
  ${colors.red}Failed:${colors.reset} ${results.failed}
  ${colors.dim}Duration: ${seconds}s${colors.reset}
${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}
`);

  process.exit(results.failed > 0 ? 1 : 0);
}

main();
