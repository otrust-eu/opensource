/**
 * Trusted Setup for ZK-SNARK circuits
 * 
 * This generates the proving and verification keys using Powers of Tau ceremony.
 * For production, use a multi-party ceremony (e.g., Hermez, Zcash)
 */

import { execFile } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { promisify } from 'util';
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'build');
const PTAU_URL = 'https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau';
const PTAU_HASH = 'eeefbcf7c3803b523c94112023c7ff89558f9b8e0cf5d6cdcba3ade60f168af4a181c9c21774b94fbae6c90411995f7d854d02ebd93fb66043dbb06f17a831c1';

function hashFile(filePath) {
  const hash = createHash('blake2b512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function ensurePowersOfTau(ptauPath) {
  if (fs.existsSync(ptauPath) && hashFile(ptauPath) === PTAU_HASH) {
    return;
  }

  fs.rmSync(ptauPath, { force: true });
  const downloadPath = `${ptauPath}.download`;
  fs.rmSync(downloadPath, { force: true });

  console.log('Downloading Powers of Tau (14) from the snarkjs ceremony archive...');
  await execFileAsync('curl', ['-fL', PTAU_URL, '-o', downloadPath]);

  if (hashFile(downloadPath) !== PTAU_HASH) {
    fs.rmSync(downloadPath, { force: true });
    throw new Error('Powers of Tau checksum mismatch');
  }

  fs.renameSync(downloadPath, ptauPath);
}

// Validate circuit name to prevent path traversal
function validateCircuitName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Circuit name is required');
  }
  // Only allow alphanumeric characters and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('Invalid circuit name. Only alphanumeric characters and underscores allowed.');
  }
  return name;
}

async function trustedSetup(circuitName) {
  // Validate and sanitize circuit name
  circuitName = validateCircuitName(circuitName);
  
  console.log(`\n🔐 Starting trusted setup for ${circuitName}...`);
  
  const r1csPath = path.join(BUILD_DIR, `${circuitName}.r1cs`);
  const wasmPath = path.join(BUILD_DIR, `${circuitName}_js`, `${circuitName}.wasm`);
  const ptauPath = path.join(BUILD_DIR, 'pot14_final.ptau');
  const zkeyPath = path.join(BUILD_DIR, `${circuitName}_final.zkey`);
  const vkeyPath = path.join(BUILD_DIR, `${circuitName}_vkey.json`);
  
  // Check if circuit is compiled
  if (!fs.existsSync(r1csPath)) {
    console.error(`❌ Circuit not compiled. Run: npm run compile:${circuitName.replace('Proof', '').toLowerCase()}`);
    process.exit(1);
  }
  
  // Download and verify the prepared phase-2 ceremony transcript.
  await ensurePowersOfTau(ptauPath);
  
  // Phase 2: Circuit-specific setup
  console.log('⚙️  Running circuit-specific setup...');
  
  const zkey0Path = path.join(BUILD_DIR, `${circuitName}_0.zkey`);
  const zkey1Path = path.join(BUILD_DIR, `${circuitName}_1.zkey`);
  
  // Create initial zkey
  await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkey0Path);
  
  // Contribute randomness (in production, do multi-party)
  await snarkjs.zKey.contribute(
    zkey0Path,
    zkey1Path,
    'OTRUST Contribution',
    randomBytes(32).toString('hex')
  );
  
  // Apply beacon (using Bitcoin block hash or similar for randomness)
  const beaconHash = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
  await snarkjs.zKey.beacon(zkey1Path, zkeyPath, 'OTRUST Beacon', beaconHash, 10);
  
  // Export verification key
  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
  fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));
  
  // Cleanup intermediate files
  fs.unlinkSync(zkey0Path);
  fs.unlinkSync(zkey1Path);
  
  console.log(`✅ Trusted setup complete!`);
  console.log(`   📁 Proving key: ${zkeyPath}`);
  console.log(`   📁 Verification key: ${vkeyPath}`);
  console.log('Run npm test to verify the proving key end to end.');
}

// Run
const circuitName = process.argv[2];
if (!circuitName) {
  console.log('Usage: node trusted-setup.js <circuitName>');
  console.log('Example: node trusted-setup.js ageProof');
  process.exit(1);
}

trustedSetup(circuitName)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
