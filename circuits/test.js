/**
 * Test ZK Proofs - End-to-end test of the circuit
 */

import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, 'build');

async function testAgeProof() {
  console.log('\n🧪 Testing Age Proof Circuit');
  console.log('=' .repeat(50));
  
  const poseidon = await buildPoseidon();
  
  // Test case: Born 1990-05-15, proving age >= 18
  const birthYear = 1990;
  const birthMonth = 5;
  const birthDay = 15;
  const secret = BigInt('123456789012345678901234567890');
  
  const currentYear = 2026;
  const currentMonth = 1;
  const currentDay = 6;
  const minAge = 18;
  
  // Calculate commitment
  const commitment = poseidon([birthYear, birthMonth, birthDay, secret]);
  const commitmentStr = poseidon.F.toString(commitment);
  
  console.log('📋 Input:');
  console.log(`   Birth: ${birthYear}-${birthMonth}-${birthDay}`);
  console.log(`   Proving: age >= ${minAge}`);
  console.log(`   Current: ${currentYear}-${currentMonth}-${currentDay}`);
  console.log(`   Expected age: ${currentYear - birthYear} years`);
  
  const input = {
    birthYear,
    birthMonth,
    birthDay,
    secret: secret.toString(),
    currentYear,
    currentMonth,
    currentDay,
    minAge,
    identityCommitment: commitmentStr
  };
  
  const wasmPath = path.join(BUILD_DIR, 'ageProof_js', 'ageProof.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'ageProof_final.zkey');
  const vkeyPath = path.join(BUILD_DIR, 'ageProof_vkey.json');
  
  console.log('\n🔐 Generating proof...');
  const startProve = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const proveTime = Date.now() - startProve;
  console.log(`   ✅ Proof generated in ${proveTime}ms`);
  
  console.log('\n📤 Public signals:');
  publicSignals.forEach((s, i) => console.log(`   [${i}]: ${s}`));
  
  console.log('\n🔍 Verifying proof...');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const startVerify = Date.now();
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verifyTime = Date.now() - startVerify;
  if (!isValid) {
    throw new Error('Age proof verification failed');
  }
  
  console.log(`   ${isValid ? '✅' : '❌'} Proof is ${isValid ? 'VALID' : 'INVALID'} (${verifyTime}ms)`);
  
  // Test invalid case (too young)
  console.log('\n🧪 Testing INVALID case (age 15 < 18)...');
  const invalidInput = { ...input, birthYear: 2011 }; // Would be 15 years old
  const invalidCommitment = poseidon([2011, birthMonth, birthDay, secret]);
  invalidInput.identityCommitment = poseidon.F.toString(invalidCommitment);
  
  try {
    await snarkjs.groth16.fullProve(invalidInput, wasmPath, zkeyPath);
    console.log('   ❌ ERROR: Should have rejected!');
  } catch (err) {
    console.log('   ✅ Correctly rejected: constraint violation');
  }
  
  return { proof, publicSignals, isValid, proveTime, verifyTime };
}

async function testIncomeProof() {
  console.log('\n🧪 Testing Income Proof Circuit');
  console.log('=' .repeat(50));
  
  const poseidon = await buildPoseidon();
  
  const income = 75000;
  const minIncome = 50000;
  const maxIncome = 100000;
  const secret = BigInt('987654321098765432109876543210');
  
  const commitment = poseidon([BigInt(income), secret]);
  const commitmentStr = poseidon.F.toString(commitment);
  
  console.log('📋 Input:');
  console.log(`   Income: $${income.toLocaleString()}`);
  console.log(`   Proving: $${minIncome.toLocaleString()} <= income <= $${maxIncome.toLocaleString()}`);
  
  const input = {
    income,
    secret: secret.toString(),
    minIncome,
    maxIncome,
    commitment: commitmentStr
  };
  
  const wasmPath = path.join(BUILD_DIR, 'incomeProof_js', 'incomeProof.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'incomeProof_final.zkey');
  const vkeyPath = path.join(BUILD_DIR, 'incomeProof_vkey.json');
  
  console.log('\n🔐 Generating proof...');
  const startProve = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const proveTime = Date.now() - startProve;
  console.log(`   ✅ Proof generated in ${proveTime}ms`);
  
  console.log('\n🔍 Verifying proof...');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const startVerify = Date.now();
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verifyTime = Date.now() - startVerify;
  if (!isValid) {
    throw new Error('Income proof verification failed');
  }
  
  console.log(`   ${isValid ? '✅' : '❌'} Proof is ${isValid ? 'VALID' : 'INVALID'} (${verifyTime}ms)`);
  
  return { proof, publicSignals, isValid, proveTime, verifyTime };
}

async function testMembershipProof() {
  console.log('\nTesting Membership Proof Circuit');
  console.log('=' .repeat(50));

  const poseidon = await buildPoseidon();
  const secret = BigInt('112233445566778899');
  const externalNullifier = BigInt('20260723');
  const pathElements = Array.from({ length: 20 }, (_, index) => BigInt(index + 1));
  const pathIndices = Array.from({ length: 20 }, (_, index) => index % 2);

  let root = poseidon([secret]);
  for (let index = 0; index < pathElements.length; index++) {
    root = pathIndices[index] === 0
      ? poseidon([root, pathElements[index]])
      : poseidon([pathElements[index], root]);
  }

  const input = {
    secret: secret.toString(),
    pathElements: pathElements.map(String),
    pathIndices,
    merkleRoot: poseidon.F.toString(root),
    nullifierHash: poseidon.F.toString(poseidon([secret, externalNullifier])),
    externalNullifier: externalNullifier.toString()
  };

  const wasmPath = path.join(BUILD_DIR, 'membershipProof_js', 'membershipProof.wasm');
  const zkeyPath = path.join(BUILD_DIR, 'membershipProof_final.zkey');
  const vkeyPath = path.join(BUILD_DIR, 'membershipProof_vkey.json');

  console.log('\nGenerating proof...');
  const startProve = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  const proveTime = Date.now() - startProve;

  console.log('\nVerifying proof...');
  const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const startVerify = Date.now();
  const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
  const verifyTime = Date.now() - startVerify;
  if (!isValid) {
    throw new Error('Membership proof verification failed');
  }

  console.log(`   Proof is VALID (prove: ${proveTime}ms, verify: ${verifyTime}ms)`);
  return { proof, publicSignals, isValid, proveTime, verifyTime };
}

async function main() {
  console.log('🚀 OTRUST ZK Proof - End-to-End Test');
  console.log('====================================');
  
  const ageResult = await testAgeProof();
  const incomeResult = await testIncomeProof();
  const membershipResult = await testMembershipProof();
  
  console.log('\n📊 Summary');
  console.log('=' .repeat(50));
  console.log(`Age Proof:    ${ageResult.isValid ? '✅' : '❌'} (prove: ${ageResult.proveTime}ms, verify: ${ageResult.verifyTime}ms)`);
  console.log(`Income Proof: ${incomeResult.isValid ? '✅' : '❌'} (prove: ${incomeResult.proveTime}ms, verify: ${incomeResult.verifyTime}ms)`);
  console.log(`Membership:   ${membershipResult.isValid ? '✅' : '❌'} (prove: ${membershipResult.proveTime}ms, verify: ${membershipResult.verifyTime}ms)`);
  
  // Export proof as JSON for web use
  console.log('\n📦 Exporting sample proof...');
  const sampleProof = {
    proof: ageResult.proof,
    publicSignals: ageResult.publicSignals
  };
  fs.writeFileSync(path.join(BUILD_DIR, 'sample_proof.json'), JSON.stringify(sampleProof, null, 2));
  console.log('   Saved to build/sample_proof.json');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
