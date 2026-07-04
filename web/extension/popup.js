// OTRUST Chrome Extension - Popup

const API = 'https://www.otrust.eu';

const NOTIFY_EMAIL_KEY = 'otrust_notify_email';
const RECEIPTS_KEY = 'otrust_my_receipts';
const MAX_RECEIPTS = 200;

async function getMyReceipts() {
  const stored = await chrome.storage.local.get(RECEIPTS_KEY);
  return stored[RECEIPTS_KEY] || [];
}

async function addToMyReceipts(entry) {
  if (!entry?.receipt_id || !entry?.hash) return;
  const receipts = (await getMyReceipts()).filter((r) => r.receipt_id !== entry.receipt_id);
  receipts.unshift({
    receipt_id: entry.receipt_id,
    hash: entry.hash,
    filename: entry.filename || null,
    timestamp: entry.timestamp || new Date().toISOString(),
    blockchain_confirmed: !!entry.blockchain_confirmed
  });
  await chrome.storage.local.set({ [RECEIPTS_KEY]: receipts.slice(0, MAX_RECEIPTS) });
}

document.addEventListener('DOMContentLoaded', async () => {
  const timestampBtn = document.getElementById('timestamp-btn');
  const verifyBtn = document.getElementById('verify-btn');
  const historyBtn = document.getElementById('history-btn');
  const resultEl = document.getElementById('result');
  const pubkeyDisplay = document.getElementById('pubkey-display');
  const keyValueEl = pubkeyDisplay.querySelector('.key-value');
  const notifyEmailInput = document.getElementById('notify-email');
  const notifyOptIn = document.getElementById('notify-email-opt-in');

  const stored = await chrome.storage.local.get([NOTIFY_EMAIL_KEY]);
  if (stored[NOTIFY_EMAIL_KEY] && notifyEmailInput) {
    notifyEmailInput.value = stored[NOTIFY_EMAIL_KEY];
  }
  notifyOptIn?.addEventListener('change', () => {
    if (notifyEmailInput) notifyEmailInput.disabled = !notifyOptIn.checked;
  });
  notifyEmailInput?.addEventListener('change', async () => {
    const value = notifyEmailInput.value.trim();
    if (value) await chrome.storage.local.set({ [NOTIFY_EMAIL_KEY]: value });
  });
  if (notifyEmailInput && notifyOptIn) notifyEmailInput.disabled = !notifyOptIn.checked;

  // Show abbreviated pubkey in footer
  const keys = await getKeys();
  keyValueEl.textContent = `${keys.publicKey.slice(0, 6)}...${keys.publicKey.slice(-4)}`;
  pubkeyDisplay.addEventListener('click', async () => {
    await navigator.clipboard.writeText(keys.publicKey);
    keyValueEl.textContent = 'Copied!';
    setTimeout(() => {
      keyValueEl.textContent = `${keys.publicKey.slice(0, 6)}...${keys.publicKey.slice(-4)}`;
    }, 1500);
  });

  // Progress UI helper
  function showProgress(steps) {
    return `<div class="progress-section">${steps.map(s => 
      `<div class="progress-step ${s.status}">
        <span class="icon">${s.status === 'done' ? '✓' : s.status === 'active' ? '<span class="spinner"></span>' : '○'}</span>
        ${s.label}
      </div>`
    ).join('')}</div>`;
  }

  document.getElementById('backup-export-btn')?.addEventListener('click', async () => {
    const password = prompt('Backup password (min 8 chars):');
    if (!password) return;
    try {
      const backup = await exportEncryptedBackup(password);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `otrust-extension-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Backup failed: ' + e.message);
    }
  });

  historyBtn.addEventListener('click', async () => {
    const receipts = await getMyReceipts();
    if (!receipts.length) {
      resultEl.innerHTML = `
        <div class="result">
          <h4>Receipt history</h4>
          <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.35rem;">
            No receipts in this extension yet. Timestamps you create here are saved locally in this browser profile only.
          </p>
        </div>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="history-panel">
        <div class="history-header">
          <strong>${receipts.length} timestamp${receipts.length !== 1 ? 's' : ''} in this extension</strong>
        </div>
        ${receipts.map((r) => `
          <button type="button" class="history-item" data-receipt="${r.receipt_id}" data-hash="${r.hash}">
            <span class="history-title">${escapeHtml(r.filename || r.receipt_id)}</span>
            <span class="history-meta">${r.hash.slice(0, 12)}... · ${new Date(r.timestamp).toLocaleDateString()}</span>
          </button>
        `).join('')}
        <p class="history-note">Saved in this browser only — not shared via URL or server lookup.</p>
      </div>`;

    resultEl.querySelectorAll('.history-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        chrome.tabs.create({ url: `${API}/proof/${btn.dataset.receipt}` });
      });
    });
  });

  timestampBtn.addEventListener('click', async () => {
    timestampBtn.disabled = true;
    
    const steps = [
      { label: 'Reading page', status: 'active' },
      { label: 'Proof-of-work', status: '' },
      { label: 'Signing', status: '' },
      { label: 'Submitting', status: '' }
    ];
    resultEl.innerHTML = showProgress(steps);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check for restricted URLs
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        throw new Error('Cannot timestamp browser pages. Open a website first.');
      }
      
      const response = await getPageContent(tab.id);
      if (!response?.content) throw new Error('Could not read page');
      const hash = await sha256(response.content);
      fetch(`${API}/api/usage/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'hash_computed', count: 1 })
      }).catch(() => {});
      
      steps[0].status = 'done';
      steps[1].status = 'active';
      resultEl.innerHTML = showProgress(steps);
      
      // Get PoW challenge
      const challengeRes = await fetch(`${API}/challenge`);
      if (!challengeRes.ok) throw new Error('Server unavailable');
      const challenge = await challengeRes.json();
      if (!challenge.challenge || challenge.difficulty === undefined) {
        throw new Error('Invalid challenge response');
      }
      
      // Solve PoW
      const nonce = await solvePoW(challenge.challenge, challenge.difficulty);
      
      steps[1].status = 'done';
      steps[2].status = 'active';
      resultEl.innerHTML = showProgress(steps);
      
      // Get/create keys & sign
      const keys = await getKeys();
      const sig = await sign(hash, keys);
      
      steps[2].status = 'done';
      steps[3].status = 'active';
      resultEl.innerHTML = showProgress(steps);
      
      const notifyEmail = notifyOptIn?.checked ? notifyEmailInput?.value?.trim() : '';
      if (notifyEmail) await chrome.storage.local.set({ [NOTIFY_EMAIL_KEY]: notifyEmail });

      const res = await fetch(`${API}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hash,
          signature: sig,
          pubkey: keys.publicKey,
          pow: { challenge: challenge.challenge, nonce },
          filename: response.title || 'Web page',
          notify_email: notifyEmail || undefined
        })
      });
      
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);
      
      const isExisting = data.status === 'already_registered';
      if (!isExisting && data.receipt_id) {
        await addToMyReceipts({
          receipt_id: data.receipt_id,
          hash,
          filename: response.title || 'Web page',
          timestamp: new Date().toISOString()
        });
      }
      const emailNote = notifyEmail && !isExisting
        ? `<p style="font-size:0.72rem;color:var(--text-dim);margin-top:0.5rem;">We'll email you when Bitcoin confirms.</p>`
        : '';
      const verifyUrl = `${API}/proof/${data.receipt_id}`;
      resultEl.innerHTML = `
        <div class="result ${isExisting ? 'warning' : 'success'}">
          <h4>${isExisting ? '⚠️ Already Timestamped' : '✓ Timestamp created'}</h4>
          <div class="result-row"><span class="label">Receipt</span><span class="value">${data.receipt_id}</span></div>
          <div class="result-row"><span class="label">Hash</span><span class="value">${hash.slice(0,16)}...</span></div>
          ${emailNote}
          <div class="btn-row" style="margin-top:0.65rem;">
            <button type="button" class="btn btn-secondary" id="ext-open-proof">Open proof</button>
            <button type="button" class="btn btn-secondary" id="ext-copy-share">Copy share</button>
          </div>
        </div>`;
      document.getElementById('ext-open-proof')?.addEventListener('click', () => {
        chrome.tabs.create({ url: verifyUrl });
      });
      document.getElementById('ext-copy-share')?.addEventListener('click', async () => {
        const text = ['OTRUST timestamp', `Receipt: ${data.receipt_id}`, `Hash: ${hash}`, `Verify: ${verifyUrl}`].join('\n');
        await navigator.clipboard.writeText(text);
      });
    } catch (e) {
      resultEl.innerHTML = `<div class="result error"><h4>❌ Error</h4><p style="font-size:0.8rem;margin-top:0.25rem;">${e.message}</p></div>`;
    }
    timestampBtn.disabled = false;
  });

  verifyBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        throw new Error('Cannot verify browser pages. Open a website first.');
      }
      
      const response = await getPageContent(tab.id);
      const hash = await sha256(response.content);
      chrome.tabs.create({ url: `${API}/#verify=${hash}` });
    } catch (e) {
      resultEl.innerHTML = `<div class="result error"><h3>❌ Error</h3><p>${e.message}</p></div>`;
    }
  });
});

// Helper to get page content with injection fallback
async function getPageContent(tabId) {
  try {
    // Try sending message to existing content script
    const response = await chrome.tabs.sendMessage(tabId, { action: 'getPageContent' });
    if (response?.content) return response;
  } catch (e) {
    // Content script not loaded, inject it
  }
  
  // Inject content script and try again
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  
  // Wait a moment for injection
  await new Promise(r => setTimeout(r, 100));
  
  const response = await chrome.tabs.sendMessage(tabId, { action: 'getPageContent' });
  if (!response?.content) throw new Error('Could not read page content. Try refreshing the page.');
  return response;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getKeys() {
  let { otrust_keys } = await chrome.storage.local.get('otrust_keys');
  
  // Check if keys exist and have correct format (privateKey should be 64 hex chars = 32 bytes)
  if (otrust_keys && otrust_keys.privateKey && otrust_keys.privateKey.length === 64 && otrust_keys.pkcs8) {
    return otrust_keys;
  }
  
  // Generate new keys (or regenerate if old format)
  console.log('[OTRUST] Generating new Ed25519 keypair...');
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign']);
  const pub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  
  // Extract raw 32-byte seed from PKCS#8 (last 32 bytes of 48-byte PKCS#8)
  const pkcs8Bytes = new Uint8Array(pkcs8);
  const rawPriv = pkcs8Bytes.slice(-32);
  
  otrust_keys = {
    publicKey: Array.from(new Uint8Array(pub)).map(b => b.toString(16).padStart(2, '0')).join(''),
    privateKey: Array.from(rawPriv).map(b => b.toString(16).padStart(2, '0')).join(''),
    // Store full PKCS#8 for Web Crypto signing
    pkcs8: Array.from(pkcs8Bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  };
  await chrome.storage.local.set({ otrust_keys });
  console.log('[OTRUST] New keypair generated, pubkey:', otrust_keys.publicKey.slice(0, 16) + '...');
  return otrust_keys;
}

async function sign(hash, keys) {
  // Use PKCS#8 format for Web Crypto API
  const pkcs8Hex = keys.pkcs8 || keys.privateKey;
  const pkcs8Bytes = new Uint8Array(pkcs8Hex.match(/.{2}/g).map(b => parseInt(b, 16)));
  
  // If it's 32 bytes (raw), we need to construct PKCS#8
  let keyData;
  if (pkcs8Bytes.length === 32) {
    // Build PKCS#8 wrapper for raw Ed25519 seed
    // PKCS#8 header for Ed25519: 302e020100300506032b6570042204 + 32 bytes
    const header = new Uint8Array([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 
      0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
    ]);
    keyData = new Uint8Array(48);
    keyData.set(header, 0);
    keyData.set(pkcs8Bytes, 16);
  } else {
    keyData = pkcs8Bytes;
  }
  
  const key = await crypto.subtle.importKey('pkcs8', keyData, { name: 'Ed25519' }, false, ['sign']);
  const hashBytes = new Uint8Array(hash.match(/.{2}/g).map(b => parseInt(b, 16)));
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, hashBytes);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveBackupKey(password, salt) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function b64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function exportEncryptedBackup(password) {
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
  const stored = await chrome.storage.local.get(['otrust_keys', RECEIPTS_KEY, NOTIFY_EMAIL_KEY]);
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    source: 'extension',
    keys: stored.otrust_keys || null,
    receipts: stored[RECEIPTS_KEY] || [],
    notify_email: stored[NOTIFY_EMAIL_KEY] || null
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return {
    format: 'otrust-local-backup',
    version: 1,
    salt: b64(salt),
    iv: b64(iv),
    ciphertext: b64(new Uint8Array(ciphertext))
  };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function solvePoW(challenge, difficulty) {
  if (!challenge || typeof difficulty !== 'number') {
    throw new Error('Invalid PoW parameters');
  }
  const target = BigInt('0x' + 'f'.repeat(64)) >> BigInt(difficulty);
  for (let nonce = 0; nonce < 100000000; nonce++) {
    const nonceHex = nonce.toString(16).padStart(16, '0');
    const attempt = challenge + nonceHex;
    const hash = await sha256(attempt);
    if (BigInt('0x' + hash) <= target) return nonceHex; // Return hex string, not number
    if (nonce % 5000 === 0) await new Promise(r => setTimeout(r, 0));
  }
  throw new Error('PoW timeout');
}
