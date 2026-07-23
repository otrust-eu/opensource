import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';
import { fileURLToPath } from 'url';
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

const circuitsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(circuitsDir);
const artifactsDir = path.join(repoRoot, 'web', 'circuits');
const manifestPath = path.join(artifactsDir, 'manifest.json');
const requireProduction = process.argv.includes('--require-production');

function fail(message) {
  throw new Error(message);
}

function resolveWithin(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    fail(`Invalid relative path: ${relativePath}`);
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail(`Path escapes its root: ${relativePath}`);
  }
  return resolved;
}

function hashFile(filePath, algorithm) {
  return createHash(algorithm).update(fs.readFileSync(filePath)).digest('hex');
}

function verifyFile(root, descriptor, label) {
  if (!descriptor || typeof descriptor !== 'object') {
    fail(`Missing descriptor for ${label}`);
  }

  const filePath = resolveWithin(root, descriptor.file);
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${label}: ${descriptor.file}`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size !== descriptor.bytes) {
    fail(`${label} size mismatch: expected ${descriptor.bytes}, got ${stats.size}`);
  }

  const actualHash = hashFile(filePath, 'sha256');
  if (actualHash !== descriptor.sha256) {
    fail(`${label} checksum mismatch: expected ${descriptor.sha256}, got ${actualHash}`);
  }

  return filePath;
}

function validateProductionMetadata(manifest) {
  const ceremony = manifest.ceremony;
  if (ceremony?.status !== 'complete' || ceremony.productionReady !== true) {
    fail('Published artifacts are not marked as production-ready');
  }
  if (!manifest.compiler?.version || manifest.compiler.reproducible !== true) {
    fail('Production artifacts require a pinned, reproducible compiler');
  }
  if (!ceremony.coordinator || !ceremony.finalizedAt || !ceremony.transcriptUrl) {
    fail('Production ceremony coordinator, finalization time, and transcript URL are required');
  }
  if (!Array.isArray(ceremony.contributions) || ceremony.contributions.length < 2) {
    fail('Production ceremony requires at least two documented independent contributions');
  }
  for (const contribution of ceremony.contributions) {
    if (!contribution.id || !contribution.attestationUrl ||
        !contribution.inputSha256 || !contribution.outputSha256) {
      fail('Each production contribution requires an ID, attestation, and input/output checksums');
    }
  }
  if (!ceremony.beacon?.value || !ceremony.beacon?.source) {
    fail('Production ceremony requires a documented public randomness beacon');
  }
}

async function verifyCircuit(name, descriptor, poseidon, manifest) {
  const sourcePath = verifyFile(repoRoot, descriptor.source, `${name} source`);
  const wasmPath = verifyFile(artifactsDir, descriptor.artifacts?.wasm, `${name} WASM`);
  const zkeyPath = verifyFile(artifactsDir, descriptor.artifacts?.zkey, `${name} proving key`);
  const vkeyPath = verifyFile(artifactsDir, descriptor.artifacts?.vkey, `${name} verification key`);

  const storedVkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
  const exportedVkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
  if (!isDeepStrictEqual(storedVkey, exportedVkey)) {
    fail(`${name} verification key does not match its proving key`);
  }

  if (descriptor.r1cs) {
    const r1csPath = verifyFile(repoRoot, descriptor.r1cs, `${name} R1CS`);
    const ptauPath = path.join(circuitsDir, 'build', 'pot14_final.ptau');
    if (!fs.existsSync(ptauPath)) {
      fail(`Missing Powers of Tau transcript required to verify ${name} R1CS`);
    }
    const expectedPtauHash = manifest.powersOfTau.blake2b512;
    if (hashFile(ptauPath, 'blake2b512') !== expectedPtauHash) {
      fail('Powers of Tau transcript checksum mismatch');
    }
    if (!await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauPath, zkeyPath)) {
      fail(`${name} proving key does not match its recorded R1CS`);
    }
  } else if (requireProduction) {
    fail(`${name} has no reproducible R1CS record`);
  }

  let input;
  if (name === 'ageProof') {
    const birthYear = 1990;
    const birthMonth = 5;
    const birthDay = 15;
    const secret = 123456789012345678901234567890n;
    input = {
      birthYear,
      birthMonth,
      birthDay,
      secret: secret.toString(),
      currentYear: 2026,
      currentMonth: 1,
      currentDay: 6,
      minAge: 18,
      identityCommitment: poseidon.F.toString(
        poseidon([birthYear, birthMonth, birthDay, secret])
      )
    };
  } else if (name === 'incomeProof') {
    const income = 75000;
    const secret = 987654321098765432109876543210n;
    input = {
      income,
      secret: secret.toString(),
      minIncome: 50000,
      maxIncome: 100000,
      commitment: poseidon.F.toString(poseidon([BigInt(income), secret]))
    };
  } else {
    fail(`No published proof smoke test defined for ${name}`);
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
  if (!await snarkjs.groth16.verify(storedVkey, publicSignals, proof)) {
    fail(`${name} published artifacts failed end-to-end proof verification`);
  }

  console.log(`Verified ${name}: ${path.relative(repoRoot, sourcePath)}, checksums, keys, and proof`);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.hashAlgorithm !== 'sha256') {
    fail('Unsupported published artifact manifest');
  }
  if (!manifest.powersOfTau?.url || !manifest.powersOfTau?.blake2b512) {
    fail('Missing Powers of Tau provenance');
  }
  if (requireProduction) {
    validateProductionMetadata(manifest);
  }

  const poseidon = await buildPoseidon();
  for (const [name, descriptor] of Object.entries(manifest.circuits || {})) {
    await verifyCircuit(name, descriptor, poseidon, manifest);
  }

  if (!Object.keys(manifest.circuits || {}).length) {
    fail('Manifest contains no circuits');
  }

  if (manifest.ceremony?.productionReady !== true) {
    console.warn(`Warning: ceremony status is "${manifest.ceremony?.status || 'unknown'}"; artifacts are not production-ready`);
  }
  console.log('Published circuit artifacts verified');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`Published artifact verification failed: ${error.message}`);
    process.exit(1);
  });
