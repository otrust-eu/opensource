/**
 * Plan limits for otrust.eu hosted service only (HOSTED_MODE=true).
 *
 * Self-host / OSS: never set HOSTED_MODE — all checks are no-ops, unlimited platform.
 */

const PLAN_LIMITS = {
  free: { claims_per_month: 10_000, api_keys: 5, webhook_endpoints: 3 },
  pro: { claims_per_month: 100_000, api_keys: 20, webhook_endpoints: 10 },
  enterprise: { claims_per_month: Infinity, api_keys: Infinity, webhook_endpoints: Infinity }
};

export function isHostedMode() {
  return process.env.HOSTED_MODE === 'true';
}

export function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export async function checkClaimAllowance(db, org) {
  if (!isHostedMode() || !org?.id) return { allowed: true };

  const limits = getPlanLimits(org.plan || 'free');
  if (!Number.isFinite(limits.claims_per_month)) return { allowed: true };

  const monthKey = new Date().toISOString().slice(0, 7);
  const counterId = `org:${org.id}:${monthKey}`;

  const row = await db.collection('usage_counters').findOne({ _id: counterId });
  const used = Number(row?.claims_created) || 0;

  if (used >= limits.claims_per_month) {
    return {
      allowed: false,
      error: 'plan_limit_exceeded',
      message: `Monthly claim limit reached for plan "${org.plan || 'free'}"`,
      limit: limits.claims_per_month,
      used
    };
  }

  return { allowed: true };
}

export async function incrementOrgClaimUsage(db, orgId) {
  if (!orgId) return;
  const monthKey = new Date().toISOString().slice(0, 7);
  const counterId = `org:${orgId}:${monthKey}`;
  const now = new Date();

  await db.collection('usage_counters').updateOne(
    { _id: counterId },
    {
      $inc: { claims_created: 1 },
      $set: { updated_at: now, org_id: orgId, month: monthKey },
      $setOnInsert: { created_at: now }
    },
    { upsert: true }
  ).catch(() => {});
}

export async function getOrgUsageSummary(db, orgId) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const counterId = `org:${orgId}:${monthKey}`;
  const org = await db.collection('organizations').findOne({ id: orgId });
  const limits = getPlanLimits(org?.plan || 'free');
  const row = await db.collection('usage_counters').findOne({ _id: counterId }) || {};

  return {
    org_id: orgId,
    plan: org?.plan || 'free',
    month: monthKey,
    claims_created: Number(row.claims_created) || 0,
    limits: {
      claims_per_month: limits.claims_per_month,
      api_keys: limits.api_keys,
      webhook_endpoints: limits.webhook_endpoints
    },
    hosted_mode: isHostedMode()
  };
}