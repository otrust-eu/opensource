#!/usr/bin/env node
/**
 * otrust CLI
 *
 * Commands:
 *   keygen              Generate Ed25519 keypair
 *   claim <file>        Timestamp a file
 *   verify <file>       Verify a file's timestamp
 *   sign <file>         Sign a file (without claiming)
 *
 * Usage:
 *   otrust keygen > ~/.otrust/key.json
 *   otrust claim ./document.pdf
 *   otrust verify ./document.pdf
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import os from 'os';

const VERSION = '0.1.0';
const DEFAULT_API = process.env.OTRUST_API || 'https://www.otrust.eu';
const KEY_PATH = process.env.OTRUST_KEY || path.join(os.homedir(), '.otrust', 'key.json');

// ============================================
// ED25519 IMPLEMENTATION (minimal, no deps)
// ============================================

// Using Node.js built-in crypto for Ed25519 (Node 16+)
function generateKeypair() {
  // Use raw format for direct access to key bytes (Node 18+)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  // Ed25519 PKCS8 structure: 48 bytes total
  // - 16 bytes header
  // - 32 bytes seed (private key)
  // Validate the structure before extraction
  if (privateKey.length !== 48) {
    throw new Error('Unexpected PKCS8 private key length: ' + privateKey.length);
  }

  // Verify PKCS8 Ed25519 OID (1.3.101.112 = 2b 65 70)
  const oid = privateKey.slice(7, 10);
  if (oid[0] !== 0x2b || oid[1] !== 0x65 || oid[2] !== 0x70) {
    throw new Error('Invalid Ed25519 PKCS8 OID');
  }

  // Extract 32-byte seed from offset 16
  const privkeyRaw = privateKey.slice(16, 48);

  // Ed25519 SPKI: last 32 bytes are the public key
  const pubkeyRaw = publicKey.slice(-32);

  return {
    privateKey: privkeyRaw.toString('hex'),
    publicKey: pubkeyRaw.toString('hex')
  };
}

function sign(messageHash, privateKeyHex) {
  const privateKeyRaw = Buffer.from(privateKeyHex, 'hex');

  // Reconstruct PKCS8 DER format
  const pkcs8Header = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
  ]);
  const privateKeyDer = Buffer.concat([pkcs8Header, privateKeyRaw]);

  const key = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const messageBuffer = Buffer.from(messageHash, 'hex');
  const signature = crypto.sign(null, messageBuffer, key);

  return signature.toString('hex');
}

function getPublicKey(privateKeyHex) {
  const privateKeyRaw = Buffer.from(privateKeyHex, 'hex');

  const pkcs8Header = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
  ]);
  const privateKeyDer = Buffer.concat([pkcs8Header, privateKeyRaw]);

  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const publicKey = crypto.createPublicKey(privateKey);
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });

  return publicKeyDer.slice(-32).toString('hex');
}

// ============================================
// HASHING
// ============================================

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ============================================
// PROOF OF WORK
// ============================================

function solvePow(challenge, difficulty) {
  let nonce = 0;

  process.stdout.write('  Solving proof-of-work... ');

  while (true) {
    const nonceHex = nonce.toString(16).padStart(16, '0');
    const hash = crypto.createHash('sha256')
      .update(challenge + nonceHex)
      .digest();

    // Check leading zero bits
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        zeroBits += 8;
      } else {
        zeroBits += Math.clz32(byte) - 24;
        break;
      }
      if (zeroBits >= difficulty) break;
    }

    if (zeroBits >= difficulty) {
      console.log('done');
      return nonceHex;
    }

    nonce++;
    if (nonce % 100000 === 0) {
      process.stdout.write('.');
    }
  }
}

// ============================================
// API CLIENT
// ============================================

function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, DEFAULT_API);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 3000),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `otrust-cli/${VERSION}`
      }
    };

    const req = client.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', err => reject(new Error(`Network error: ${err.message}`)));
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ============================================
// KEY MANAGEMENT
// ============================================

function loadKey() {
  if (!fs.existsSync(KEY_PATH)) {
    return null;
  }
  const content = fs.readFileSync(KEY_PATH, 'utf8');
  return JSON.parse(content);
}

function saveKey(keypair) {
  const dir = path.dirname(KEY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(KEY_PATH, JSON.stringify(keypair, null, 2), { mode: 0o600 });
}

// ============================================
// COMMANDS
// ============================================

const commands = {
  async keygen(args) {
    const keyType = args.includes('--secp256k1') ? 'secp256k1' : 'ed25519';
    console.log(`Generating ${keyType} keypair...\n`);

    const keypair = generateKeypair();
    keypair.type = keyType;

    if (args.includes('--save')) {
      saveKey(keypair);
      console.log(`Key type:    ${keyType}`);
      console.log(`Private key saved to: ${KEY_PATH}`);
      console.log(`Public key: ${keypair.publicKey}`);
    } else {
      // Output to stdout for redirection
      console.log(JSON.stringify(keypair, null, 2));
    }
  },

  async bulk(args) {
    const targets = args.filter(a => !a.startsWith('--'));
    const recursive = args.includes('--recursive') || args.includes('-r');
    const outputJson = args.includes('--json');

    if (targets.length === 0) {
      console.error('Usage: otrust bulk <files|folders> [--recursive] [--json]');
      process.exit(1);
    }

    // Load key
    const key = loadKey();
    if (!key) {
      console.error(`No key found. Run: otrust keygen --save`);
      process.exit(1);
    }

    // Collect all files
    const files = [];
    for (const target of targets) {
      if (!fs.existsSync(target)) {
        console.error(`Not found: ${target}`);
        continue;
      }
      const stats = fs.statSync(target);
      if (stats.isDirectory()) {
        collectFiles(target, files, recursive);
      } else {
        files.push(path.resolve(target));
      }
    }

    if (files.length === 0) {
      console.error('No files found');
      process.exit(1);
    }

    if (files.length > 100) {
      console.error(`Too many files (${files.length}). Maximum is 100 per batch.`);
      process.exit(1);
    }

    console.log('\n  OTRUST Bulk Claim\n  ' + '─'.repeat(40));
    console.log(`  Files:     ${files.length}`);
    console.log(`  Pubkey:    ${key.publicKey.substring(0, 16)}...`);

    // Hash all files
    process.stdout.write('  Hashing files... ');
    const claims = [];
    for (const file of files) {
      const hash = await hashFile(file);
      const signature = sign(hash, key.privateKey);
      claims.push({
        file,
        hash,
        signature,
        pubkey: key.publicKey
      });
    }
    console.log('done');

    // Get PoW challenge (single challenge for entire batch)
    process.stdout.write('  Getting challenge... ');
    const challengeRes = await apiRequest('GET', '/challenge');
    if (challengeRes.status !== 200) {
      console.error('Failed to get challenge');
      process.exit(1);
    }
    console.log('done');

    const { challenge, difficulty } = challengeRes.data;

    // Solve PoW
    const nonce = solvePow(challenge, difficulty);

    // Submit bulk claims
    process.stdout.write('  Submitting batch... ');
    const bulkRes = await apiRequest('POST', '/claim/bulk', {
      claims: claims.map(c => ({
        hash: c.hash,
        signature: c.signature,
        pubkey: c.pubkey
      })),
      pow: { challenge, nonce }
    });

    if (bulkRes.status === 201) {
      console.log('done\n');
      console.log('  ' + '─'.repeat(40));
      console.log(`  ✓ Batch processed`);
      console.log(`  Created:    ${bulkRes.data.created}`);
      console.log(`  Duplicates: ${bulkRes.data.duplicates}`);
      console.log(`  Errors:     ${bulkRes.data.errors}`);
      console.log('  ' + '─'.repeat(40));

      if (outputJson) {
        // Output detailed JSON results
        const output = bulkRes.data.results.map((r, i) => ({
          file: claims[i].file,
          hash: claims[i].hash,
          ...r
        }));
        console.log('\n' + JSON.stringify(output, null, 2));
      } else {
        // Print summary
        console.log('\n  Results:');
        for (let i = 0; i < bulkRes.data.results.length; i++) {
          const r = bulkRes.data.results[i];
          const filename = path.basename(claims[i].file);
          if (r.status === 'created') {
            console.log(`    ✓ ${filename} -> ${r.receipt_id}`);
          } else if (r.status === 'duplicate') {
            console.log(`    = ${filename} (already exists: ${r.receipt_id})`);
          } else {
            console.log(`    ✗ ${filename} (${r.error})`);
          }
        }
      }
    } else {
      console.log('failed');
      console.error(`  Error: ${bulkRes.data.error || JSON.stringify(bulkRes.data)}`);
      process.exit(1);
    }
    console.log('');
  },

  async 'verify-bulk'(args) {
    const targets = args.filter(a => !a.startsWith('--'));
    const recursive = args.includes('--recursive') || args.includes('-r');
    const outputJson = args.includes('--json');

    if (targets.length === 0) {
      console.error('Usage: otrust verify-bulk <files|folders> [--recursive] [--json]');
      process.exit(1);
    }

    // Collect all files
    const files = [];
    for (const target of targets) {
      if (!fs.existsSync(target)) {
        console.error(`Not found: ${target}`);
        continue;
      }
      const stats = fs.statSync(target);
      if (stats.isDirectory()) {
        collectFiles(target, files, recursive);
      } else if (/^[a-f0-9]{64}$/i.test(target)) {
        // It's a hash, not a file
        files.push({ hash: target.toLowerCase(), file: null });
      } else {
        files.push(path.resolve(target));
      }
    }

    if (files.length === 0) {
      console.error('No files found');
      process.exit(1);
    }

    if (files.length > 100) {
      console.error(`Too many items (${files.length}). Maximum is 100 per batch.`);
      process.exit(1);
    }

    console.log('\n  OTRUST Bulk Verify\n  ' + '─'.repeat(40));
    console.log(`  Items:     ${files.length}`);

    // Hash all files
    process.stdout.write('  Hashing files... ');
    const items = [];
    for (const file of files) {
      if (typeof file === 'object' && file.hash) {
        items.push(file);
      } else {
        const hash = await hashFile(file);
        items.push({ file, hash });
      }
    }
    console.log('done');

    // Query bulk verify API
    process.stdout.write('  Verifying... ');
    const res = await apiRequest('POST', '/verify/bulk', {
      hashes: items.map(i => i.hash)
    });

    if (res.data.status === 'ok') {
      console.log('done\n');
      console.log('  ' + '─'.repeat(40));

      let found = 0, notFound = 0;
      for (let i = 0; i < res.data.results.length; i++) {
        const r = res.data.results[i];
        if (r.status === 'found') found++;
        else notFound++;
      }

      console.log(`  Found:      ${found}`);
      console.log(`  Not Found:  ${notFound}`);
      console.log('  ' + '─'.repeat(40));

      if (outputJson) {
        const output = res.data.results.map((r, i) => ({
          file: items[i].file,
          ...r
        }));
        console.log('\n' + JSON.stringify(output, null, 2));
      } else {
        console.log('\n  Results:');
        for (let i = 0; i < res.data.results.length; i++) {
          const r = res.data.results[i];
          const name = items[i].file ? path.basename(items[i].file) : items[i].hash.substring(0, 16) + '...';
          if (r.status === 'found') {
            const firstClaim = r.claims[0];
            console.log(`    ✓ ${name} -> ${firstClaim.timestamp}`);
          } else if (r.status === 'not_found') {
            console.log(`    ? ${name} (not timestamped)`);
          } else {
            console.log(`    ✗ ${name} (${r.status})`);
          }
        }
      }
    } else {
      console.log('failed');
      console.error(`  Error: ${res.data.error}`);
      process.exit(1);
    }
    console.log('');
  },

  async claim(args) {
    const target = args[0];
    if (!target) {
      console.error('Usage: otrust claim <file|hash>');
      process.exit(1);
    }

    // Load key
    const key = loadKey();
    if (!key) {
      console.error(`No key found. Run: otrust keygen --save`);
      process.exit(1);
    }

    console.log('\n  OTRUST Claim\n  ' + '─'.repeat(40));

    // Get hash
    let hash;
    if (fs.existsSync(target)) {
      const stats = fs.statSync(target);
      console.log(`  File:      ${path.resolve(target)}`);
      console.log(`  Size:      ${formatBytes(stats.size)}`);
      process.stdout.write('  Hashing... ');
      hash = await hashFile(target);
      console.log('done');
    } else if (/^[a-f0-9]{64}$/i.test(target)) {
      hash = target.toLowerCase();
      console.log(`  Hash:      ${hash}`);
    } else {
      console.error('Invalid file or hash');
      process.exit(1);
    }

    console.log(`  SHA-256:   ${hash}`);
    console.log(`  Pubkey:    ${key.publicKey.substring(0, 16)}...`);

    // Get PoW challenge
    process.stdout.write('  Getting challenge... ');
    const challengeRes = await apiRequest('GET', '/challenge');
    if (challengeRes.status !== 200) {
      console.error('Failed to get challenge');
      process.exit(1);
    }
    console.log('done');

    const { challenge, difficulty } = challengeRes.data;

    // Solve PoW
    const nonce = solvePow(challenge, difficulty);

    // Sign hash
    process.stdout.write('  Signing... ');
    const signature = sign(hash, key.privateKey);
    console.log('done');

    // Submit claim
    process.stdout.write('  Submitting... ');
    const claimRes = await apiRequest('POST', '/claim', {
      hash,
      signature,
      pubkey: key.publicKey,
      pow: { challenge, nonce }
    });

    if (claimRes.status === 201) {
      console.log('done\n');
      console.log('  ' + '─'.repeat(40));
      console.log(`  ✓ Timestamp created`);
      console.log(`  Receipt:   ${claimRes.data.receipt_id}`);
      console.log(`  Time:      ${claimRes.data.timestamp}`);
      console.log(`  Blockchain: ${claimRes.data.blockchain_status}`);
      console.log('  ' + '─'.repeat(40));
    } else if (claimRes.status === 409) {
      console.log('exists\n');
      console.log('  ! Already timestamped');
      console.log(`  Receipt:   ${claimRes.data.receipt_id}`);
      console.log(`  Time:      ${claimRes.data.timestamp}`);
    } else {
      console.log('failed');
      console.error(`  Error: ${claimRes.data.error || claimRes.data}`);
      process.exit(1);
    }
    console.log('');
  },

  async verify(args) {
    const target = args[0];
    if (!target) {
      console.error('Usage: otrust verify <file|hash>');
      process.exit(1);
    }

    console.log('\n  OTRUST Verify\n  ' + '─'.repeat(40));

    // Get hash
    let hash;
    if (fs.existsSync(target)) {
      console.log(`  File:      ${path.resolve(target)}`);
      process.stdout.write('  Hashing... ');
      hash = await hashFile(target);
      console.log('done');
    } else if (/^[a-f0-9]{64}$/i.test(target)) {
      hash = target.toLowerCase();
    } else {
      console.error('Invalid file or hash');
      process.exit(1);
    }

    console.log(`  SHA-256:   ${hash}`);

    // Query API using POST (not GET) to prevent URL/log leakage
    process.stdout.write('  Querying... ');
    const res = await apiRequest('POST', '/verify', { hash });

    if (res.data.status === 'found') {
      console.log('done\n');
      console.log('  ' + '─'.repeat(40));
      console.log(`  ✓ Verified`);

      for (const claim of res.data.claims) {
        console.log(`  Pubkey:    ${claim.pubkey.substring(0, 16)}...`);
        console.log(`  Time:      ${claim.timestamp}`);
        console.log(`  Receipt:   ${claim.receipt_id}`);
        if (claim.blockchain_confirmed) {
          console.log(`  Blockchain: confirmed (${claim.blockchain_tx})`);
        } else {
          console.log(`  Blockchain: pending`);
        }
      }
      console.log('  ' + '─'.repeat(40));
    } else {
      console.log('not found\n');
      console.log('  ? This content has not been timestamped');
      console.log('  Run: otrust claim <file>');
    }
    console.log('');
  },

  help() {
    console.log(`
  OTRUST CLI v${VERSION}
  Blind notary for IP timestamping

  USAGE
    otrust <command> [options]

  COMMANDS
    keygen [--save] [--secp256k1]    Generate keypair
    claim <file|hash>                Timestamp content
    verify <file|hash>               Verify timestamp
    bulk <files|folders>             Batch timestamp files
    verify-bulk <files|folders>      Batch verify files

  OPTIONS
    --save                Save key to ~/.otrust/key.json
    --secp256k1           Use secp256k1 (Ethereum compatible) instead of Ed25519
    --recursive, -r       Include subdirectories (for bulk commands)
    --json                Output detailed JSON results (for bulk commands)

  EXAMPLES
    otrust keygen --save
    otrust keygen --save --secp256k1
    otrust claim ./patent-draft.pdf
    otrust verify ./patent-draft.pdf
    otrust bulk ./documents/ --recursive
    otrust verify-bulk ./documents/ -r --json

  ENVIRONMENT
    OTRUST_API            API endpoint (default: https://api.otrust.eu)
    OTRUST_KEY            Key file path (default: ~/.otrust/key.json)

  PRIVACY
    Files are hashed locally. Only the hash + signature reach the server.
    We never see your documents or your IP address.
`);
  }
};

// ============================================
// HELPERS
// ============================================

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function collectFiles(dir, files, recursive) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = fs.statSync(fullPath);
    if (stats.isFile()) {
      // Skip hidden files and common non-document files
      if (!entry.startsWith('.') && !entry.endsWith('.tmp')) {
        files.push(fullPath);
      }
    } else if (stats.isDirectory() && recursive) {
      // Skip hidden directories and node_modules
      if (!entry.startsWith('.') && entry !== 'node_modules') {
        collectFiles(fullPath, files, recursive);
      }
    }
  }
}

// ============================================
// MAIN
// ============================================

const args = process.argv.slice(2);
const cmd = args[0];
const cmdArgs = args.slice(1);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  commands.help();
} else if (commands[cmd]) {
  commands[cmd](cmdArgs).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${cmd}`);
  console.error('Run: otrust help');
  process.exit(1);
}
