/**
 * OTRUST open source cryptographic helpers.
 *
 * Cryptographic operations using @noble libraries
 * Supports:
 * - Ed25519 (EdDSA) - default, fast
 * - secp256k1 (ECDSA) - Ethereum compatible
 */

import * as ed25519 from '@noble/ed25519';
import * as secp256k1 from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { hmac } from '@noble/hashes/hmac';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Use synchronous SHA-512 for Ed25519 (required by noble)
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

// Use synchronous HMAC-SHA256 for secp256k1 (required by noble)
secp256k1.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp256k1.etc.concatBytes(...m));

// Key type detection based on public key length
// Ed25519: 32 bytes (64 hex chars)
// secp256k1 compressed: 33 bytes (66 hex chars, starts with 02 or 03)
// secp256k1 uncompressed: 65 bytes (130 hex chars, starts with 04)
function detectKeyType(pubkey) {
  const len = pubkey.length;
  if (len === 64) return 'ed25519';
  if (len === 66 && (pubkey.startsWith('02') || pubkey.startsWith('03'))) return 'secp256k1';
  if (len === 130 && pubkey.startsWith('04')) return 'secp256k1';
  return 'unknown';
}

/**
 * Verify a signature (auto-detects key type)
 */
export async function verifySignature(messageHash, signature, pubkey) {
  try {
    const keyType = detectKeyType(pubkey);
    const messageBytes = hexToBytes(messageHash);

    if (keyType === 'ed25519') {
      const signatureBytes = hexToBytes(signature);
      const pubkeyBytes = hexToBytes(pubkey);
      return ed25519.verify(signatureBytes, messageBytes, pubkeyBytes);
    } else if (keyType === 'secp256k1') {
      const signatureBytes = hexToBytes(signature);
      const pubkeyBytes = hexToBytes(pubkey);
      return secp256k1.verify(signatureBytes, messageBytes, pubkeyBytes);
    } else {
      console.error('[Crypto] Unknown key type for pubkey:', pubkey.substring(0, 16) + '...');
      return false;
    }
  } catch (error) {
    console.error('[Crypto] Signature verification error:', error.message);
    return false;
  }
}

/**
 * Sign a message hash with a private key (Ed25519)
 */
export async function sign(messageHash, privateKey) {
  const messageBytes = hexToBytes(messageHash);
  const privateKeyBytes = hexToBytes(privateKey);
  const signature = ed25519.sign(messageBytes, privateKeyBytes);
  return bytesToHex(signature);
}

/**
 * Sign a message hash with secp256k1 private key
 */
export async function signSecp256k1(messageHash, privateKey) {
  const messageBytes = hexToBytes(messageHash);
  const privateKeyBytes = hexToBytes(privateKey);
  const signature = secp256k1.sign(messageBytes, privateKeyBytes);
  return signature.toCompactHex();
}

/**
 * Generate a new Ed25519 keypair
 */
export function generateKeypair(type = 'ed25519') {
  if (type === 'secp256k1') {
    const privateKey = secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.getPublicKey(privateKey, true); // compressed
    return {
      type: 'secp256k1',
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey)
    };
  }

  // Default: Ed25519
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    type: 'ed25519',
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey)
  };
}

/**
 * Derive public key from private key
 */
export function getPublicKey(privateKey, type = 'ed25519') {
  const privateKeyBytes = hexToBytes(privateKey);
  if (type === 'secp256k1') {
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    return bytesToHex(publicKey);
  }
  const publicKey = ed25519.getPublicKey(privateKeyBytes);
  return bytesToHex(publicKey);
}

/**
 * Hash data with SHA-256
 */
export function hash(data) {
  if (typeof data === 'string') {
    data = new TextEncoder().encode(data);
  }
  return bytesToHex(sha256(data));
}

/**
 * Verify proof-of-work
 */
export function verifyPow(challenge, nonce, difficulty = 20) {
  try {
    if (!challenge || typeof nonce !== 'string' || !/^[0-9a-f]+$/i.test(nonce)) return false;
    const combined = challenge + nonce;
    const hashResult = sha256(new TextEncoder().encode(combined));

    let zeroBits = 0;
    for (const byte of hashResult) {
      if (byte === 0) {
        zeroBits += 8;
      } else {
        zeroBits += Math.clz32(byte) - 24;
        break;
      }
      if (zeroBits >= difficulty) break;
    }
    return zeroBits >= difficulty;
  } catch (error) {
    return false;
  }
}

/**
 * Solve proof-of-work (for testing/CLI)
 */
export function solvePow(challenge, difficulty = 20) {
  let nonce = 0;
  while (true) {
    const nonceStr = nonce.toString(16).padStart(16, '0');
    if (verifyPow(challenge, nonceStr, difficulty)) {
      return nonceStr;
    }
    nonce++;
    if (nonce > 100000000) {
      throw new Error('PoW solving timeout');
    }
  }
}
