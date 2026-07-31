/**
 * OTRUST Proof helpers.
 *
 * Browser clients generate Groth16 proofs without sending private inputs.
 * The server uses snarkjs only to verify submitted proofs and keeps legacy
 * commitment verification for previously stored packages.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as snarkjs from 'snarkjs';
import { getDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(__dirname, '../web/circuits');
const MANIFEST_PATH = path.join(ARTIFACTS_DIR, 'manifest.json');
const FIELD_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const HASH_ALGORITHM = 'sha256-field-v1';
const CIRCUIT_KEYS = new Map();
const CIRCUIT_VKEY_FILES = Object.freeze({
  age: 'ageProof_vkey.json',
  income: 'incomeProof_vkey.json'
});

export function getZkArtifactStatus() {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const ceremony = manifest.ceremony || {};
    return {
      status: ceremony.status || 'unknown',
      productionReady: ceremony.status === 'complete' && ceremony.productionReady === true,
      compilerVersion: manifest.compiler?.version || null,
      transcriptUrl: ceremony.transcriptUrl || null
    };
  } catch {
    return {
      status: 'unavailable',
      productionReady: false,
      compilerVersion: null,
      transcriptUrl: null
    };
  }
}

function loadVerificationKey(proofType) {
  const filename = CIRCUIT_VKEY_FILES[proofType];
  if (!filename) return null;
  if (!CIRCUIT_KEYS.has(proofType)) {
    CIRCUIT_KEYS.set(
      proofType,
      JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, filename), 'utf8'))
    );
  }
  return CIRCUIT_KEYS.get(proofType);
}

function publicInteger(value, minimum, maximum) {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

function publicField(value) {
  const normalized = String(value);
  if (!/^\d+$/.test(normalized)) return null;
  const field = BigInt(normalized);
  if (field < 0n || field >= FIELD_ORDER) return null;
  return field.toString();
}

export function parseGroth16PublicSignals(proofType, publicSignals, now = new Date()) {
  if (!Array.isArray(publicSignals) || String(publicSignals[0]) !== '1') return null;

  if (proofType === 'age' && publicSignals.length === 6) {
    const currentYear = publicInteger(publicSignals[1], 2000, 9999);
    const currentMonth = publicInteger(publicSignals[2], 1, 12);
    const currentDay = publicInteger(publicSignals[3], 1, 31);
    const minAge = publicInteger(publicSignals[4], 1, 150);
    const commitment = publicField(publicSignals[5]);
    if (!currentYear || !currentMonth || !currentDay || !minAge || !commitment) return null;

    const proofDate = [
      String(currentYear).padStart(4, '0'),
      String(currentMonth).padStart(2, '0'),
      String(currentDay).padStart(2, '0')
    ].join('-');
    if (proofDate !== now.toISOString().slice(0, 10)) return null;

    return {
      commitment,
      statement: `Self-attested age >= ${minAge}`,
      metadata: {
        minAge,
        proofDate,
        credentialBinding: 'none',
        selfAttested: true
      }
    };
  }

  if (proofType === 'income' && publicSignals.length === 4) {
    const minIncome = publicInteger(publicSignals[1], 0, 1_000_000_000);
    const maxIncome = publicInteger(publicSignals[2], 0, 1_000_000_000);
    const commitment = publicField(publicSignals[3]);
    if (
      minIncome === null ||
      maxIncome === null ||
      minIncome > maxIncome ||
      !commitment
    ) {
      return null;
    }

    return {
      commitment,
      statement: `Self-attested committed value between ${minIncome} and ${maxIncome}`,
      metadata: {
        minIncome,
        maxIncome,
        credentialBinding: 'none',
        selfAttested: true
      }
    };
  }

  return null;
}

function stableStringify(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return String(value);
}

function sha256Hex(...parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    hash.update(stableStringify(part));
    hash.update('\x1f');
  }
  return hash.digest('hex');
}

function fieldHash(...parts) {
  return (BigInt(`0x${sha256Hex(...parts)}`) % FIELD_ORDER).toString();
}

function currentDateParts(now = new Date()) {
  return {
    currentYear: now.getFullYear(),
    currentMonth: now.getMonth() + 1,
    currentDay: now.getDate(),
    currentDate: now.toISOString().split('T')[0]
  };
}

function calculateAge(birthDate, now = new Date()) {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function generateSecret() {
  return BigInt(`0x${crypto.randomBytes(32).toString('hex')}`);
}

export async function createIdentityCommitment(birthYear, birthMonth, birthDay, secret) {
  return fieldHash('identity', birthYear, birthMonth, birthDay, secret);
}

export async function createIncomeCommitment(income, secret) {
  return fieldHash('income', income, secret);
}

export async function generateAgeProof(privateInputs, publicInputs) {
  const { birthYear, birthMonth, birthDay, secret } = privateInputs;
  const { currentYear, currentMonth, currentDay, minAge } = publicInputs;

  const identityCommitment = await createIdentityCommitment(birthYear, birthMonth, birthDay, secret);
  const currentDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
  const challenge = fieldHash('age-proof', identityCommitment, minAge, currentDate);

  return {
    proof: {
      version: 2,
      type: 'zk_age_proof',
      protocol: 'commitment_challenge',
      hash_algorithm: HASH_ALGORITHM,
      identityCommitment,
      challenge,
      public_inputs: {
        minAge,
        currentYear,
        currentMonth,
        currentDay,
        currentDate
      }
    },
    publicSignals: [identityCommitment, String(minAge), currentDate],
    commitment: identityCommitment,
    proofType: 'age',
    minAge,
    generatedAt: new Date().toISOString()
  };
}

export async function verifyAgeProof(proof, publicSignals) {
  if (!proof || proof.type !== 'zk_age_proof') return false;
  if (proof.hash_algorithm !== HASH_ALGORITHM) return false;

  const inputs = proof.public_inputs || proof.publicInputs || {};
  const currentDate = inputs.currentDate
    || `${inputs.currentYear}-${String(inputs.currentMonth).padStart(2, '0')}-${String(inputs.currentDay).padStart(2, '0')}`;
  const expectedCompact = fieldHash('age-proof', proof.identityCommitment, inputs.minAge, currentDate);
  const dateNumber = inputs.currentYear && inputs.currentMonth && inputs.currentDay
    ? inputs.currentYear * 10000 + inputs.currentMonth * 100 + inputs.currentDay
    : currentDate;
  const expectedDetailed = proof.ageCommitment && proof.deltaCommitment
    ? fieldHash('age-proof', proof.identityCommitment, proof.ageCommitment, proof.deltaCommitment, inputs.minAge, dateNumber)
    : null;
  return proof.challenge === expectedCompact || proof.challenge === expectedDetailed;
}

export async function verifyIncomeProofCircuit(proof, publicSignals) {
  if (!proof || proof.type !== 'zk_income_proof') return false;
  if (proof.hash_algorithm !== HASH_ALGORITHM) return false;

  const inputs = proof.public_inputs || proof.publicInputs || {};
  const expectedDetailed = proof.deltaCommitment
    ? fieldHash('income-proof', proof.incomeCommitment, proof.deltaCommitment, inputs.minIncome)
    : null;
  const expectedCompact = inputs.maxIncome !== undefined
    ? fieldHash('income-proof', proof.incomeCommitment, inputs.minIncome, inputs.maxIncome)
    : null;
  return proof.challenge === expectedDetailed || proof.challenge === expectedCompact;
}

export async function verifyGroth16Proof(proofType, proof, publicSignals) {
  if (
    !proof ||
    typeof proof !== 'object' ||
    !Array.isArray(proof.pi_a) ||
    !Array.isArray(proof.pi_b) ||
    !Array.isArray(proof.pi_c) ||
    !Array.isArray(publicSignals) ||
    publicSignals.length === 0 ||
    publicSignals.length > 64
  ) {
    return false;
  }

  const verificationKey = loadVerificationKey(proofType);
  if (!verificationKey) return false;
  return snarkjs.groth16.verify(verificationKey, publicSignals, proof);
}

export async function generateIncomeProof(privateInputs, publicInputs) {
  const { income, secret } = privateInputs;
  const { minIncome, maxIncome } = publicInputs;
  const commitment = await createIncomeCommitment(income, secret);
  const challenge = fieldHash('income-proof', commitment, minIncome, maxIncome);

  return {
    proof: {
      version: 2,
      type: 'zk_income_proof',
      protocol: 'commitment_challenge',
      hash_algorithm: HASH_ALGORITHM,
      incomeCommitment: commitment,
      challenge,
      public_inputs: { minIncome, maxIncome }
    },
    publicSignals: [commitment, String(minIncome), String(maxIncome)],
    commitment,
    proofType: 'income',
    range: { min: minIncome, max: maxIncome },
    generatedAt: new Date().toISOString()
  };
}

export async function createProofPackage(proofData, metadata = {}, baseUrl = null) {
  const db = getDb();
  const proofId = `prf_${crypto.randomBytes(8).toString('base64url')}`;
  const viewToken = crypto.randomBytes(16).toString('base64url');
  const createdAt = new Date();

  const proofPackage = {
    id: proofId,
    view_token: viewToken,
    proof_type: proofData.proofType,
    proof_version: proofData.version || null,
    proof: proofData.proof,
    public_signals: proofData.publicSignals,
    commitment: proofData.commitment,
    statement: proofData.statement || proofData.proof?.statement || null,
    metadata: {
      ...metadata,
      generated_at: createdAt.toISOString()
    },
    created_at: createdAt,
    verified_count: 0
  };

  if (db) {
    await db.collection('proofs').insertOne(proofPackage);
  }

  const origin = new URL(baseUrl || process.env.BASE_URL || 'http://localhost:3000').origin;
  return {
    proofId,
    viewToken,
    shareUrl: `${origin}/proof/${proofId}`,
    verifyUrl: `${origin}/proof/${proofId}/verify`
  };
}

export async function verifyProofPackage(proofId, viewToken) {
  const db = getDb();
  if (!db) throw new Error('Database not available');

  const proofPackage = await db.collection('proofs').findOne({ id: proofId });
  if (!proofPackage) {
    return { valid: false, error: 'Proof not found' };
  }

  let isValid = false;
  try {
    const proof = proofPackage.proof;

    if (proofPackage.proof_version === 'groth16-v3') {
      isValid = await verifyGroth16Proof(
        proofPackage.proof_type,
        proof,
        proofPackage.public_signals
      );
    } else if (proof?.version === 1) {
      isValid = verifySimpleProof(proof);
    } else if (proofPackage.proof_type === 'age') {
      isValid = await verifyAgeProof(proof, proofPackage.public_signals);
    } else if (proofPackage.proof_type === 'income') {
      isValid = await verifyIncomeProofCircuit(proof, proofPackage.public_signals);
    } else if (proofPackage.proof_type === 'membership') {
      isValid = verifyMembershipProof(proof);
    }
  } catch (err) {
    console.error('[ZKProof] Verification error:', err.message);
    isValid = false;
  }

  await db.collection('proofs').updateOne(
    { id: proofId },
    { $inc: { verified_count: 1 }, $set: { last_verified: new Date() } }
  );

  return {
    valid: isValid,
    proofType: proofPackage.proof_type,
    metadata: proofPackage.metadata,
    commitment: proofPackage.commitment,
    statement: proofPackage.proof?.statement,
    verifiedCount: proofPackage.verified_count + 1
  };
}

function verifySimpleProof(proof) {
  if (!proof || !proof.public_inputs) return false;

  if (proof.version === 1 && proof.proof_hash && proof.commitment) {
    let expectedHash;

    if (proof.type === 'simple_age_proof' && proof.public_inputs.minAge !== undefined) {
      expectedHash = crypto.createHash('sha256')
        .update(proof.commitment + proof.public_inputs.minAge + proof.public_inputs.currentDate)
        .digest('hex');
    } else if (proof.type === 'simple_income_proof' && proof.public_inputs.minIncome !== undefined) {
      expectedHash = crypto.createHash('sha256')
        .update(proof.commitment + proof.public_inputs.minIncome + proof.public_inputs.currentDate)
        .digest('hex');
    } else if (proof.type === 'simple_membership_proof') {
      return proof.public_inputs.verified === true;
    }

    return expectedHash ? proof.proof_hash === expectedHash : false;
  }

  return false;
}

function verifyMembershipProof(proof) {
  if (!proof) return false;
  if (proof.hash_algorithm !== HASH_ALGORITHM) return false;

  const inputs = proof.public_inputs || proof.publicInputs || {};
  const expectedNullifier = fieldHash('membership-nullifier', proof.commitment, inputs.organizationHash, inputs.currentDate);
  return proof.nullifier === expectedNullifier;
}

export async function createSimpleAgeProof(birthDate, minAge) {
  const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const now = new Date();
  const age = calculateAge(birth, now);

  if (age < minAge) {
    throw new Error(`Age ${age} is less than required ${minAge}`);
  }

  const secret = generateSecret();
  const deltaSecret = generateSecret();
  const dateParts = currentDateParts(now);
  const birthYear = birth.getFullYear();
  const birthMonth = birth.getMonth() + 1;
  const birthDay = birth.getDate();
  const delta = age - minAge;

  const identityCommitment = await createIdentityCommitment(birthYear, birthMonth, birthDay, secret);
  const ageCommitment = fieldHash('age', age, secret);
  const deltaCommitment = fieldHash('age-delta', delta, deltaSecret);
  const challenge = fieldHash(
    'age-proof',
    identityCommitment,
    ageCommitment,
    deltaCommitment,
    minAge,
    dateParts.currentYear * 10000 + dateParts.currentMonth * 100 + dateParts.currentDay
  );

  const proofData = {
    version: 2,
    type: 'zk_age_proof',
    protocol: 'commitment_challenge',
    hash_algorithm: HASH_ALGORITHM,
    identityCommitment,
    ageCommitment,
    deltaCommitment,
    challenge,
    public_inputs: {
      minAge,
      ...dateParts
    },
    statement: `Age >= ${minAge}`
  };

  return {
    proof: proofData,
    secret: JSON.stringify({ secret: secret.toString(), deltaSecret: deltaSecret.toString() }),
    commitment: identityCommitment
  };
}

export async function createSimpleIncomeProof(income, minIncome) {
  if (income < minIncome) {
    throw new Error(`Income ${income} is less than required ${minIncome}`);
  }

  const now = new Date();
  const secret = generateSecret();
  const deltaSecret = generateSecret();
  const incomeCommitment = await createIncomeCommitment(income, secret);
  const deltaCommitment = fieldHash('income-delta', income - minIncome, deltaSecret);
  const challenge = fieldHash('income-proof', incomeCommitment, deltaCommitment, minIncome);

  const proofData = {
    version: 2,
    type: 'zk_income_proof',
    protocol: 'commitment_challenge',
    hash_algorithm: HASH_ALGORITHM,
    incomeCommitment,
    deltaCommitment,
    challenge,
    public_inputs: {
      minIncome,
      currentDate: now.toISOString().split('T')[0]
    },
    statement: `Income >= $${minIncome.toLocaleString()}`
  };

  return {
    proof: proofData,
    secret: JSON.stringify({ secret: secret.toString(), deltaSecret: deltaSecret.toString() }),
    commitment: incomeCommitment
  };
}

export async function createSimpleMembershipProof(memberId, organizationId) {
  const secret = generateSecret();
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const organizationHash = sha256Hex(organizationId).slice(0, 16);
  const commitment = fieldHash('membership', memberId, organizationId, secret);
  const nullifier = fieldHash('membership-nullifier', commitment, organizationHash, currentDate);

  const proofData = {
    version: 2,
    type: 'zk_membership_proof',
    protocol: 'commitment_challenge',
    hash_algorithm: HASH_ALGORITHM,
    commitment,
    nullifier,
    public_inputs: {
      organizationHash,
      currentDate,
      verified: true
    },
    statement: 'Member of organization'
  };

  return {
    proof: proofData,
    secret: secret.toString(),
    commitment
  };
}

export default {
  generateSecret,
  createIdentityCommitment,
  createIncomeCommitment,
  generateAgeProof,
  verifyAgeProof,
  verifyIncomeProofCircuit,
  verifyGroth16Proof,
  generateIncomeProof,
  createProofPackage,
  verifyProofPackage,
  createSimpleAgeProof,
  createSimpleIncomeProof,
  createSimpleMembershipProof
};
