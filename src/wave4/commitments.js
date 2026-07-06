import crypto from 'crypto';

export function hashPreimage(preimage) {
  return crypto.createHash('sha256').update(preimage, 'utf8').digest('hex');
}

export function validateCommitmentPayload({ commitment_hash, reveal_at }) {
  if (!commitment_hash || !/^[a-f0-9]{64}$/i.test(commitment_hash)) {
    return { error: 'invalid_commitment_hash' };
  }
  const revealMs = Date.parse(reveal_at);
  if (!Number.isFinite(revealMs) || revealMs <= Date.now()) {
    return { error: 'invalid_reveal_at' };
  }
  return null;
}

export async function createCommitment(db, { commitment_hash, reveal_at, label, created_by }) {
  const err = validateCommitmentPayload({ commitment_hash, reveal_at });
  if (err) return err;

  const id = `tlc_${crypto.randomBytes(8).toString('hex')}`;
  const doc = {
    id,
    commitment_hash: commitment_hash.toLowerCase(),
    reveal_at: new Date(reveal_at).toISOString(),
    label: label ? String(label).slice(0, 200) : null,
    created_by: created_by ? String(created_by).slice(0, 128) : null,
    created_at: new Date().toISOString(),
    revealed: false,
    revealed_at: null,
    preimage: null
  };
  await db.collection('time_commitments').insertOne(doc);
  return { commitment: doc };
}

export async function getCommitment(db, id) {
  const doc = await db.collection('time_commitments').findOne({ id });
  if (!doc) return null;
  const now = Date.now();
  const revealMs = Date.parse(doc.reveal_at);
  return {
    id: doc.id,
    commitment_hash: doc.commitment_hash,
    reveal_at: doc.reveal_at,
    label: doc.label,
    created_at: doc.created_at,
    revealed: doc.revealed,
    revealed_at: doc.revealed_at,
    can_reveal: !doc.revealed && now >= revealMs,
    locked_until: doc.revealed ? null : doc.reveal_at
  };
}

export async function revealCommitment(db, id, preimage) {
  const doc = await db.collection('time_commitments').findOne({ id });
  if (!doc) return { error: 'not_found' };
  if (doc.revealed) return { error: 'already_revealed' };
  if (Date.now() < Date.parse(doc.reveal_at)) return { error: 'locked_until_reveal_at' };
  const hash = hashPreimage(preimage);
  if (hash !== doc.commitment_hash) return { error: 'invalid_preimage' };

  await db.collection('time_commitments').updateOne(
    { id },
    { $set: { revealed: true, revealed_at: new Date().toISOString(), preimage: String(preimage) } }
  );
  return {
    id: doc.id,
    commitment_hash: doc.commitment_hash,
    revealed_at: new Date().toISOString(),
    preimage: String(preimage)
  };
}