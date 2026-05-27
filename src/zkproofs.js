/**
 * Browser-compatible proof helper facade.
 *
 * Kept for compatibility with older imports, but implemented without the
 * circomlibjs dependency chain.
 */

import crypto from 'crypto';
import {
  generateSecret,
  createSimpleAgeProof,
  createSimpleIncomeProof,
  createSimpleMembershipProof,
  verifyAgeProof as verifyStoredAgeProof,
  verifyIncomeProofCircuit
} from './zkproof.js';

const FIELD_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

function stableStringify(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return String(value);
}

function fieldHash(...parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) {
    hash.update(stableStringify(part));
    hash.update('\x1f');
  }
  return (BigInt(`0x${hash.digest('hex')}`) % FIELD_ORDER).toString();
}

export function randomFieldElement() {
  return generateSecret() % FIELD_ORDER;
}

export async function pedersenCommit(value, blinding) {
  return fieldHash('commitment', value, blinding);
}

export async function createAgeProof(birthDate, minAge) {
  return createSimpleAgeProof(birthDate, minAge);
}

export async function verifyAgeProof(proof) {
  const valid = await verifyStoredAgeProof(proof);
  return {
    valid,
    statement: proof?.statement || `Age >= ${proof?.public_inputs?.minAge ?? proof?.publicInputs?.minAge ?? ''}`,
    verifiedAt: new Date().toISOString()
  };
}

export async function createIncomeProof(income, minIncome) {
  return createSimpleIncomeProof(income, minIncome);
}

export async function verifyIncomeProof(proof) {
  const valid = await verifyIncomeProofCircuit(proof);
  return {
    valid,
    statement: proof?.statement || `Income >= $${proof?.public_inputs?.minIncome ?? proof?.publicInputs?.minIncome ?? ''}`,
    verifiedAt: new Date().toISOString()
  };
}

export async function createMembershipProof(memberId, organizationMembers) {
  const organizationId = crypto.createHash('sha256')
    .update(JSON.stringify(organizationMembers || []))
    .digest('hex');
  return createSimpleMembershipProof(memberId, organizationId);
}

export default {
  randomFieldElement,
  pedersenCommit,
  createAgeProof,
  verifyAgeProof,
  createIncomeProof,
  verifyIncomeProof,
  createMembershipProof
};
