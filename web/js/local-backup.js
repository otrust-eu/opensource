/**
 * Encrypted browser-local backup (keys + receipt + signing history).
 *
 * This is the main mechanism for cross-device proof management.
 * Receipts live only in localStorage by design (no accounts / zero-knowledge).
 * Use export + import when moving to a new browser/device.
 */
(function () {
  const BACKUP_VERSION = 1;

  function getBackupPayload() {
    let signings = [];
    try {
      const raw = localStorage.getItem('otrust_my_signings');
      signings = raw ? JSON.parse(raw) : [];
    } catch { /* ignore */ }

    let keys = null;
    try {
      const rawKeys = localStorage.getItem('otrust_keys');
      keys = rawKeys ? JSON.parse(rawKeys) : null;
    } catch { /* ignore */ }

    return {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      receipts: window.otrustReceiptHistory?.getMyReceipts() || [],
      signings,
      keys
    };
  }

  async function deriveKey(password, salt) {
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

  function toBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  function fromBase64(str) {
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function exportEncryptedBackup(password) {
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(getBackupPayload()));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      format: 'otrust-local-backup',
      version: BACKUP_VERSION,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(ciphertext))
    };
  }

  async function importEncryptedBackup(file, password) {
    if (!password) throw new Error('Password required');
    const text = await file.text();
    const backup = JSON.parse(text);
    if (backup.format !== 'otrust-local-backup' || !backup.ciphertext) {
      throw new Error('Invalid backup file');
    }
    const salt = fromBase64(backup.salt);
    const iv = fromBase64(backup.iv);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      fromBase64(backup.ciphertext)
    );
    const data = JSON.parse(new TextDecoder().decode(decrypted));

    if (data.keys) localStorage.setItem('otrust_keys', JSON.stringify(data.keys));
    if (Array.isArray(data.receipts)) {
      window.otrustReceiptHistory?.saveMyReceipts(data.receipts);
    }
    if (Array.isArray(data.signings)) {
      localStorage.setItem('otrust_my_signings', JSON.stringify(data.signings));
    }
    return {
      receipts: data.receipts?.length || 0,
      signings: data.signings?.length || 0,
      hasKeys: !!data.keys
    };
  }

  function downloadBackupFile(backup, filename) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `otrust-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  window.otrustLocalBackup = {
    exportEncryptedBackup,
    importEncryptedBackup,
    downloadBackupFile
  };
})();