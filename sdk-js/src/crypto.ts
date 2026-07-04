/**
 * OTRUST SDK - Crypto Utilities
 * 
 * Hash functions and cryptographic utilities using Web Crypto API.
 * Works in all environments: Node.js, Deno, Bun, browsers, and edge runtimes.
 */

/** Hash a string or ArrayBuffer using SHA-256 */
export async function sha256(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  let buffer: ArrayBuffer;
  
  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else if (data instanceof ArrayBuffer) {
    buffer = data;
  } else {
    buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

/** Hash a File object using SHA-256 */
export async function hashFile(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  return sha256(buffer);
}

/** Hash a file with progress callback */
export async function hashFileWithProgress(
  file: File | Blob,
  onProgress?: (progress: number) => void
): Promise<string> {
  const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks
  const totalSize = file.size;
  
  if (totalSize <= CHUNK_SIZE) {
    onProgress?.(1);
    return hashFile(file);
  }

  // For large files, we need to hash in chunks
  // This is a simplified version - for true streaming, 
  // we'd need a different approach
  let offset = 0;
  const chunks: ArrayBuffer[] = [];
  
  while (offset < totalSize) {
    const chunk = file.slice(offset, Math.min(offset + CHUNK_SIZE, totalSize));
    chunks.push(await chunk.arrayBuffer());
    offset += CHUNK_SIZE;
    onProgress?.(Math.min(offset / totalSize, 1));
  }

  // Combine all chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let position = 0;
  for (const chunk of chunks) {
    combined.set(new Uint8Array(chunk), position);
    position += chunk.byteLength;
  }

  return sha256(combined.buffer as ArrayBuffer);
}

/** Convert ArrayBuffer to hex string */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert hex string to Uint8Array */
export function hexToBuffer(hex: string): Uint8Array {
  const length = hex.length / 2;
  const result = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

/** Generate random bytes as hex string */
export function randomHex(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bufferToHex(bytes.buffer as ArrayBuffer);
}

/** Generate a random UUID v4 */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Validate a SHA-256 hash string */
export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

/** Ed25519 key pair generation (if available) */
export async function generateEd25519Keypair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  // Note: Ed25519 is available in Node.js but not in all browsers
  // For browsers without Ed25519 support, use a polyfill or secp256k1
  
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'Ed25519',
    },
    true,
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: bufferToHex(publicKeyBuffer),
    privateKey: bufferToHex(privateKeyBuffer),
  };
}

/** Sign data with Ed25519 private key */
export async function signEd25519(
  data: string | ArrayBuffer,
  privateKeyHex: string
): Promise<string> {
  const privateKeyBuffer = hexToBuffer(privateKeyHex);
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer.buffer as ArrayBuffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const dataBuffer = typeof data === 'string' 
    ? new TextEncoder().encode(data).buffer as ArrayBuffer
    : data;

  const signature = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    dataBuffer
  );

  return bufferToHex(signature);
}

/** Verify Ed25519 signature */
export async function verifyEd25519(
  data: string | ArrayBuffer,
  signature: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    const publicKeyBuffer = hexToBuffer(publicKeyHex);
    const signatureBuffer = hexToBuffer(signature);
    
    const publicKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBuffer.buffer as ArrayBuffer,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    const dataBuffer = typeof data === 'string' 
      ? new TextEncoder().encode(data).buffer as ArrayBuffer
      : data;

    return await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signatureBuffer.buffer as ArrayBuffer,
      dataBuffer
    );
  } catch {
    return false;
  }
}
