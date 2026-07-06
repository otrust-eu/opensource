import crypto from 'crypto';

const VERIFY_INSTRUCTIONS = `OTRUST Evidence Bundle
========================

This archive contains everything needed to verify an OTRUST timestamp independently.

Contents:
  proof.json      — Receipt metadata and blockchain status
  receipt.ots     — OpenTimestamps proof file (if available)
  VERIFY.txt      — This file

Verify online:
  https://www.otrust.eu/proof/{RECEIPT_ID}

Verify offline (OpenTimestamps CLI):
  ots verify receipt.ots

Verify with OTRUST CLI:
  otrust verify <original-file>

OTRUST never stores your original file — only the SHA-256 hash.
`;

export function buildEvidenceBundleMeta(claim, receiptId, info = {}) {
  return {
    format: 'otrust-evidence-bundle',
    version: 1,
    receipt_id: receiptId,
    hash: claim.hash,
    filename: claim.filename || null,
    created_at: claim.created_at,
    pubkey: claim.pubkey || null,
    blockchain: {
      confirmed: !!claim.blockchain_confirmed,
      block_height: claim.blockchain_block || null,
      confirmed_at: claim.blockchain_confirmed_at || null,
      pending_calendars: info.pendingCalendars || []
    },
    verify_url: `https://www.otrust.eu/proof/${receiptId}`,
    exported_at: new Date().toISOString()
  };
}

export function instructionsText(receiptId) {
  return VERIFY_INSTRUCTIONS.replace(/\{RECEIPT_ID\}/g, receiptId);
}

export function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}