/**
 * Test ZK Proof Generation and Verification
 */

import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'build');

async function testAgeProof() {
  console.log('\n🧪 Testing Age Proof...\n');

  const poseidon = await buildPoseidon();

  // Test data: Someone born 1990-05-15, proving age >= 18
  const birthYear = 1990;
  const birthMonth = 5;
  const birthDay = 15;
  const secret = BigInt('12345678901234567890'); // In production, use crypto.randomBytes

  const currentYear = 2026;
  const currentMonth = 1;
  const currentDay = 6;
  const minAge = 18;

  // Calculate commitment
  const commitment = poseidon([birthYear, birthMonth, birthDay, secret]);
  const commitmentStr = poseidon.F.toString(commitment);

  console.log('📋 Test Case:');
  console.log(`   Birth date: ${birthYear}-${birthMonth}-${birthDay}`);
  console.log(`   Proving: Age >= ${minAge}`);
  console.log(`   Current date: ${currentYear}-${currentMonth}-${currentDay}`);
  console.log(`   Expected age: ${currentYear - birthYear} (birthday ${currentMonth < birthMonth ? 'not passed' : 'passed'})`);
  console.log(`   Commitment: ${commitmentStr.slice(0, 20)}...`);

  // Inputs for circuit
  const input = {
    // Private
    birthYear,
    birthMonth,
    birthDay,
    secret: secret.toString(),
    // Public
    currentYear,
    currentMonth,
    currentDay,
    minAge,
    identityCommitment: commitmentStr
  };

  const wasmPath = path.join(BUILD_DIR, 'ageProof_js', 'ageProof.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'ageProof_final.zkey');
  const vkeyPath = path.join(BUILD_DIR, 'ageProof_vkey.json');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log('\n⚠️  Circuit not compiled. Run:');
    console.log('   cd circuits && npm install && npm run build');
    return;
  }

  console.log('\n🔐 Generating proof...');
  const startGen = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  console.log(`   ✅ Proof generated in ${Date.now() - startGen}ms`);

  console.log('\n📤 Public signals:');
  console.log(`   ${JSON.stringify(publicSignals)}`);

  console.log('\n🔍 Verifying proof...');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const startVerify = Date.now();
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  console.log(`   ${isValid ? '✅' : '❌'} Proof is ${isValid ? 'VALID' : 'INVALID'} (${Date.now() - startVerify}ms)`);

  // Generate Solidity verifier (for on-chain verification)
  console.log('\n📝 Generating Solidity verifier...');
  const solidityVerifier = await snarkjs.zKey.exportSolidityVerifier(zkeyPath, {
    groth16: fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'snarkjs', 'templates', 'verifier_groth16.sol.ejs'), 'utf8')
  });
  fs.writeFileSync(path.join(BUILD_DIR, 'AgeVerifier.sol'), solidityVerifier);
  console.log('   ✅ Solidity verifier saved to build/AgeVerifier.sol');

  // Test with wrong data (should fail)
  console.log('\n🧪 Testing with INVALID proof (wrong age)...');
  const invalidInput = { ...input, birthYear: 2020 }; // Too young
  try {
    await snarkjs.groth16.fullProve(invalidInput, wasmPath, zkeyPath);
    console.log('   ❌ ERROR: Should have failed!');
  } catch (err) {
    console.log('   ✅ Correctly rejected invalid proof');
  }

  return { proof, publicSignals, isValid };
}

async function testIncomeProof() {
  console.log('\n🧪 Testing Income Proof...\n');

  const poseidon = await buildPoseidon();

  const income = 50000;
  const minIncome = 30000;
  const maxIncome = 100000;
  const secret = BigInt('98765432109876543210');

  const commitment = poseidon([income, secret]);
  const commitmentStr = poseidon.F.toString(commitment);

  console.log('📋 Test Case:');
  console.log(`   Actual income: $${income.toLocaleString()}`);
  console.log(`   Proving: $${minIncome.toLocaleString()} <= income <= $${maxIncome.toLocaleString()}`);

  const wasmPath = path.join(BUILD_DIR, 'incomeProof_js', 'incomeProof.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'incomeProof_final.zkey');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    console.log('\n⚠️  Income circuit not compiled yet');
    return;
  }

  // Continue with test...
}

// Run tests
testAgeProof().catch(console.error);
