/**
 * Standard webhook event types and envelope format.
 */

import crypto from 'crypto';

export const WEBHOOK_EVENTS = [
  'timestamp.created',
  'timestamp.confirmed',
  'sign.created',
  'sign.party_signed',
  'sign.completed',
  'sign.declined',
  'auth.success'
];

export function isValidWebhookEvent(type) {
  return WEBHOOK_EVENTS.includes(type);
}

export function buildWebhookEnvelope(type, data) {
  return {
    id: `evt_${crypto.randomBytes(12).toString('hex')}`,
    type,
    created_at: new Date().toISOString(),
    data
  };
}