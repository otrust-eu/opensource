/**
 * Trusted Setup for ZK-SNARK circuits
 * 
 * This generates the proving and verification keys using Powers of Tau ceremony.
 * For production, use a multi-party ceremony (e.g., Hermez, Zcash)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'build');

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
  
  // Download Powers of Tau if needed (using Hermez ceremony)
  // Using execFile with array arguments to prevent shell injection
  if (!fs.existsSync(ptauPath)) {
    console.log('📥 Downloading Powers of Tau (14) from Hermez...');
    await execFileAsync('curl', [
      '-L',
      'https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau',
      '-o',
      ptauPath
    ]);
  }
  
  // Phase 2: Circuit-specific setup
  console.log('⚙️  Running circuit-specific setup...');
  
  const zkey0Path = path.join(BUILD_DIR, `${circuitName}_0.zkey`);
  const zkey1Path = path.join(BUILD_DIR, `${circuitName}_1.zkey`);
  
  // Create initial zkey
  await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkey0Path);
  
  // Contribute randomness (in production, do multi-party)
  await snarkjs.zKey.contribute(zkey0Path, zkey1Path, 'OTRUST Contribution', 'random-entropy-' + Date.now());
  
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
  
  // Verify the setup
  console.log('\n🔍 Verifying setup...');
  const isValid = await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauPath, zkeyPath);
  if (isValid) {
    console.log('✅ Setup verified successfully!');
  } else {
    console.error('❌ Setup verification failed!');
    process.exit(1);
  }
}

// Run
const circuitName = process.argv[2];
if (!circuitName) {
  console.log('Usage: node trusted-setup.js <circuitName>');
  console.log('Example: node trusted-setup.js ageProof');
  process.exit(1);
}

trustedSetup(circuitName).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
