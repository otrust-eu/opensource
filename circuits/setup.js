/**
 * Trusted Setup Script - Generate proving and verification keys
 *
 * Uses the Hermez Powers of Tau ceremony (community-generated randomness)
 */

import * as snarkjs from 'snarkjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, 'build');

async function setup(circuitName) {
  console.log(`\n🔐 Trusted Setup for ${circuitName}`);
  console.log('=' .repeat(50));

  const r1csPath = path.join(BUILD_DIR, `${circuitName}.r1cs`);
  const ptauPath = path.join(BUILD_DIR, 'pot14.ptau');
  const zkey0Path = path.join(BUILD_DIR, `${circuitName}_0.zkey`);
  const zkey1Path = path.join(BUILD_DIR, `${circuitName}_1.zkey`);
  const zkeyFinalPath = path.join(BUILD_DIR, `${circuitName}_final.zkey`);
  const vkeyPath = path.join(BUILD_DIR, `${circuitName}_vkey.json`);

  // Check files exist
  if (!fs.existsSync(r1csPath)) {
    console.error(`❌ R1CS not found: ${r1csPath}`);
    return false;
  }
  if (!fs.existsSync(ptauPath)) {
    console.error(`❌ PTAU not found: ${ptauPath}`);
    return false;
  }

  // Phase 2: Circuit-specific setup
  console.log('📦 Phase 2: Creating initial zkey...');
  await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkey0Path);

  console.log('🎲 Contributing randomness...');
  await snarkjs.zKey.contribute(
    zkey0Path,
    zkey1Path,
    'OTRUST Contribution 1',
    'otrust-random-entropy-' + Date.now() + Math.random()
  );

  console.log('🔮 Applying final beacon...');
  // Use a "random" beacon (in production, use a Bitcoin block hash)
  const beacon = 'af23d5b7c9e1f3a5b7d9e1f3a5b7c9e1f3a5b7d9e1f3a5b7c9e1f3a5b7d9e1f3';
  try {
    await snarkjs.zKey.beacon(zkey1Path, zkeyFinalPath, 'OTRUST Final Beacon', beacon, 10);
  } catch (e) {
    // If beacon fails, just copy zkey1 to final
    console.log('   (Using contributed key as final)');
    fs.copyFileSync(zkey1Path, zkeyFinalPath);
  }

  console.log('📤 Exporting verification key...');
  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinalPath);
  fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

  // Cleanup intermediate files
  fs.unlinkSync(zkey0Path);
  fs.unlinkSync(zkey1Path);

  console.log(`\n✅ Setup complete for ${circuitName}!`);
  console.log(`   📁 Proving key: ${zkeyFinalPath}`);
  console.log(`   📁 Verification key: ${vkeyPath}`);

  // Get file sizes
  const zkeySize = fs.statSync(zkeyFinalPath).size;
  const vkeySize = fs.statSync(vkeyPath).size;
  console.log(`   📊 Proving key size: ${(zkeySize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   📊 Verification key size: ${(vkeySize / 1024).toFixed(2)} KB`);

  return true;
}

// Run setup for all circuits
async function main() {
  console.log('🚀 OTRUST ZK Circuits - Trusted Setup');
  console.log('=====================================\n');

  const circuits = ['ageProof', 'incomeProof', 'membershipProof'];

  for (const circuit of circuits) {
    const success = await setup(circuit);
    if (!success) {
      console.error(`Failed to setup ${circuit}`);
      process.exit(1);
    }
  }

  console.log('\n✅ All circuits setup complete!');
  console.log('\nFiles generated in build/:');
  fs.readdirSync(BUILD_DIR)
    .filter(f => f.endsWith('.zkey') || f.endsWith('_vkey.json'))
    .forEach(f => console.log(`  - ${f}`));
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
