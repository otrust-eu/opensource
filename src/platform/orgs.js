import crypto from 'crypto';

export function generateOrgId() {
  return `org_${crypto.randomBytes(12).toString('hex')}`;
}

export async function createOrganization(db, { name, plan } = {}) {
  const safeName = String(name || '').trim().slice(0, 120);
  if (!safeName) {
    return { error: 'invalid_name' };
  }

  const safePlan = ['free', 'pro', 'enterprise'].includes(String(plan || 'free'))
    ? String(plan || 'free')
    : 'free';

  const org = {
    id: generateOrgId(),
    name: safeName,
    plan: safePlan,
    created_at: new Date(),
    updated_at: new Date()
  };

  await db.collection('organizations').insertOne(org);
  return { organization: org };
}

export async function getOrganization(db, orgId) {
  if (!orgId || typeof orgId !== 'string') return null;
  return db.collection('organizations').findOne({ id: orgId });
}

export async function listOrganizations(db, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const orgs = await db.collection('organizations')
    .find({})
    .sort({ created_at: -1 })
    .limit(safeLimit)
    .toArray();
  return orgs;
}