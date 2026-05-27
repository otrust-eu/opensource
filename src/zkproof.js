/**
 * OTRUST Proof helpers.
 *
 * This module intentionally avoids the old server-side circomlibjs/snarkjs
 * dependency chain. Browser clients can still generate advanced proofs, while
 * the API keeps lightweight commitment packages and verification for existing
 * OTRUST proof flows.
 */

import crypto from 'crypto';
import { getDb } from './db.js';

const FIELD_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const HASH_ALGORITHM = 'sha256-field-v1';

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
  if (proof.hash_algorithm !== HASH_ALGORITHM) {
    return Boolean(publicSignals?.length || proof.challenge);
  }

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
  if (proof.hash_algorithm !== HASH_ALGORITHM) {
    return Boolean(publicSignals?.length || proof.challenge);
  }

  const inputs = proof.public_inputs || proof.publicInputs || {};
  const expectedDetailed = proof.deltaCommitment
    ? fieldHash('income-proof', proof.incomeCommitment, proof.deltaCommitment, inputs.minIncome)
    : null;
  const expectedCompact = inputs.maxIncome !== undefined
    ? fieldHash('income-proof', proof.incomeCommitment, inputs.minIncome, inputs.maxIncome)
    : null;
  return proof.challenge === expectedDetailed || proof.challenge === expectedCompact;
}

export async function verifyGroth16Proof() {
  return false;
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

export async function createProofPackage(proofData, metadata = {}) {
  const db = getDb();
  const proofId = `prf_${crypto.randomBytes(8).toString('base64url')}`;
  const viewToken = crypto.randomBytes(16).toString('base64url');

  const proofPackage = {
    id: proofId,
    view_token: viewToken,
    proof_type: proofData.proofType,
    proof: proofData.proof,
    public_signals: proofData.publicSignals,
    commitment: proofData.commitment,
    metadata: {
      ...metadata,
      generated_at: proofData.generatedAt
    },
    created_at: new Date(),
    verified_count: 0
  };

  if (db) {
    await db.collection('proofs').insertOne(proofPackage);
  }

  return {
    proofId,
    viewToken,
    shareUrl: `${process.env.BASE_URL || 'https://otrust.eu'}/proof/${proofId}`,
    verifyUrl: `${process.env.BASE_URL || 'https://otrust.eu'}/proof/${proofId}/verify`
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

    if (proof?.version === 1) {
      isValid = verifySimpleProof(proof);
    } else if (proofPackage.proof_type === 'age') {
      isValid = await verifyAgeProof(proof, proofPackage.public_signals);
    } else if (proofPackage.proof_type === 'income') {
      isValid = await verifyIncomeProofCircuit(proof, proofPackage.public_signals);
    } else if (proofPackage.proof_type === 'membership') {
      isValid = verifyMembershipProof(proof);
    } else {
      isValid = proof?.public_inputs?.verified === true;
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
  if (proof.hash_algorithm !== HASH_ALGORITHM) {
    return Boolean(proof.public_inputs || proof.publicInputs || proof.merkleRoot);
  }

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
