import crypto from 'crypto';

const rooms = new Map();
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

function cleanup() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (now - room.created_at > ROOM_TTL_MS) rooms.delete(id);
  }
}

setInterval(cleanup, 5 * 60 * 1000).unref?.();

export function createCeremony(hash, creator = {}) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error('invalid_hash');
  }
  const id = `cer_${crypto.randomBytes(8).toString('hex')}`;
  const room = {
    id,
    hash: hash.toLowerCase(),
    created_at: Date.now(),
    creator: creator.name || 'host',
    participants: [],
    attestations: [],
    status: 'open'
  };
  rooms.set(id, room);
  return room;
}

export function getCeremony(id) {
  return rooms.get(id) || null;
}

export function joinCeremony(id, { name, pubkey }) {
  const room = rooms.get(id);
  if (!room) return null;
  if (room.status !== 'open') return { error: 'ceremony_closed' };
  if (!pubkey || pubkey.length < 32) return { error: 'invalid_pubkey' };
  const existing = room.participants.find((p) => p.pubkey === pubkey);
  if (!existing) {
    room.participants.push({
      name: String(name || 'participant').slice(0, 64),
      pubkey,
      joined_at: new Date().toISOString()
    });
  }
  return room;
}

export function attestCeremony(id, { pubkey, signature }) {
  const room = rooms.get(id);
  if (!room) return null;
  if (!pubkey || !signature) return { error: 'invalid_attestation' };
  if (!room.participants.some((p) => p.pubkey === pubkey)) {
    return { error: 'not_joined' };
  }
  const dup = room.attestations.find((a) => a.pubkey === pubkey);
  if (!dup) {
    room.attestations.push({
      pubkey,
      signature,
      attested_at: new Date().toISOString()
    });
  }
  if (room.attestations.length >= room.participants.length && room.participants.length > 0) {
    room.status = 'complete';
    room.completed_at = new Date().toISOString();
  }
  return room;
}