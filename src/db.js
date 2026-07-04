/**
 * otrust-core/src/db.js
 * 
 * MongoDB database for claims storage
 * Falls back to in-memory storage if MongoDB unavailable
 */

import { MongoClient } from 'mongodb';

let client = null;
let db = null;
let usingInMemory = false;

// In-memory fallback storage
const inMemoryCollections = {
  claims: [],
  proofs: [],
  pow_challenges: [],
  email_notifications: [],
  auth_branding: [],
  audit_log: [],
  usage_counters: []
};

function matchesQuery(doc, query = {}) {
  return Object.keys(query).every(key => {
    const expected = query[key];

    if (typeof expected === 'object' && expected !== null) {
      let handledOperator = false;
      if ('$lte' in expected && !(doc[key] <= expected.$lte)) return false;
      if ('$gte' in expected && !(doc[key] >= expected.$gte)) return false;
      if ('$lt' in expected && !(doc[key] < expected.$lt)) return false;
      if ('$gt' in expected && !(doc[key] > expected.$gt)) return false;
      if ('$in' in expected && !expected.$in.includes(doc[key])) return false;
      if ('$ne' in expected && doc[key] === expected.$ne) return false;
      if ('$exists' in expected && ((doc[key] !== undefined) !== expected.$exists)) return false;
      handledOperator = ['$lte', '$gte', '$lt', '$gt', '$in', '$ne', '$exists'].some(operator => operator in expected);
      return handledOperator ? true : doc[key] === expected;
    }

    return doc[key] === expected;
  });
}

/**
 * Create an in-memory mock collection
 */
function createMockCollection(name) {
  const data = inMemoryCollections[name] || [];
  inMemoryCollections[name] = data;
  
  return {
    insertOne: async (doc) => {
      const _id = Math.random().toString(36).substring(7);
      data.push({ ...doc, _id });
      return { insertedId: _id };
    },
    findOne: async (query) => {
      return data.find(doc => matchesQuery(doc, query)) || null;
    },
    find: (query = {}) => {
      const filtered = data.filter(doc => matchesQuery(doc, query));
      return {
        toArray: async () => filtered,
        sort: () => ({
          toArray: async () => filtered,
          limit: () => ({ toArray: async () => filtered })
        }),
        limit: (n) => ({
          toArray: async () => filtered.slice(0, n),
          sort: () => ({ toArray: async () => filtered.slice(0, n) })
        })
      };
    },
    updateOne: async (query, update, options = {}) => {
      let idx = data.findIndex(doc => matchesQuery(doc, query));

      if (idx < 0 && options.upsert) {
        const doc = { ...query, ...(update.$setOnInsert || {}) };
        data.push(doc);
        idx = data.length - 1;
      }

      if (idx >= 0) {
        if (update.$set) {
          data[idx] = { ...data[idx], ...update.$set };
        }
        if (update.$inc) {
          Object.entries(update.$inc).forEach(([key, value]) => {
            data[idx][key] = (Number(data[idx][key]) || 0) + value;
          });
        }
        return { modifiedCount: 1 };
      }
      return { modifiedCount: 0 };
    },
    deleteOne: async (query) => {
      const idx = data.findIndex(doc => matchesQuery(doc, query));
      if (idx >= 0) {
        data.splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    },
    deleteMany: async (query = {}) => {
      // If empty query, delete all
      if (Object.keys(query).length === 0) {
        const count = data.length;
        data.length = 0;
        return { deletedCount: count };
      }
      // Otherwise filter and remove matching
      const toRemove = [];
      data.forEach((doc, idx) => {
        if (matchesQuery(doc, query)) {
          toRemove.push(idx);
        }
      });
      // Remove in reverse order to preserve indices
      for (let i = toRemove.length - 1; i >= 0; i--) {
        data.splice(toRemove[i], 1);
      }
      return { deletedCount: toRemove.length };
    },
    findOneAndUpdate: async (query, update, options = {}) => {
      const idx = data.findIndex(doc => matchesQuery(doc, query));
      if (idx >= 0) {
        const original = { ...data[idx] };
        if (update.$set) {
          data[idx] = { ...data[idx], ...update.$set };
        }
        if (update.$inc) {
          Object.entries(update.$inc).forEach(([key, value]) => {
            data[idx][key] = (Number(data[idx][key]) || 0) + value;
          });
        }
        // Return the document directly (MongoDB driver v4+ behavior)
        return options.returnDocument === 'before' ? original : data[idx];
      }
      return null;
    },
    createIndex: async () => ({ ok: 1 }),
    dropIndex: async () => ({ ok: 1 }),
    countDocuments: async (query = {}) => data.filter(doc => matchesQuery(doc, query)).length
  };
}

/**
 * Create in-memory mock database
 */
function createMockDb() {
  return {
    collection: (name) => createMockCollection(name)
  };
}

/**
 * Initialize MongoDB connection
 */
export async function createDb() {
  const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'otrust';

  if (process.env.NODE_ENV === 'test' && !process.env.TEST_MONGODB_URL) {
    db = createMockDb();
    usingInMemory = true;
    client = null;
    return db;
  }

  console.log('[DB] Connecting to MongoDB...');
  
  try {
    client = new MongoClient(mongoUrl, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db(dbName);
    usingInMemory = false;

  // Create indexes
  const claims = db.collection('claims');
  await claims.createIndex({ hash: 1 });
  await claims.createIndex({ pubkey: 1 });
  await claims.createIndex({ hash: 1, pubkey: 1 }, { unique: true });
  await claims.createIndex({ created_at: 1 });

  const challenges = db.collection('pow_challenges');
  await challenges.createIndex({ challenge: 1 }, { unique: true });
  await challenges.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });

  // Email notifications - separate collection with TTL for privacy
  // Emails auto-delete after 7 days if not used (Bitcoin confirmations can take 24-48h)
  const notifications = db.collection('email_notifications');
  await notifications.createIndex({ claim_id: 1 }, { unique: true });
  
  // Handle TTL index update (drop old if exists with different TTL)
  try {
    await notifications.createIndex({ created_at: 1 }, { expireAfterSeconds: 604800 }); // 7 days TTL
  } catch (err) {
    if (err.code === 85) { // IndexOptionsConflict
      console.log('[DB] Updating TTL index for email_notifications...');
      await notifications.dropIndex('created_at_1');
      await notifications.createIndex({ created_at: 1 }, { expireAfterSeconds: 604800 });
    } else {
      throw err;
    }
  }

  // Audit log collection for security events (optional - don't block startup)
  try {
    const auditLog = db.collection('audit_log');
    await auditLog.createIndex({ event_type: 1 }); 
    await auditLog.createIndex({ severity: 1 });
    // Try TTL index, ignore conflicts
    await auditLog.createIndex({ timestamp: 1 }, { expireAfterSeconds: 2592000 }).catch(() => {});
  } catch (err) {
    console.log('[DB] Audit log index setup skipped:', err.message);
  }

  try {
    const authBranding = db.collection('auth_branding');
    await authBranding.dropIndex('client_id_1').catch(() => {});
    await authBranding.createIndex({ client_id: 1, theme_id: 1 }, { unique: true });
    await authBranding.createIndex({ client_id: 1 });
    await authBranding.createIndex({ updated_at: -1 });

    const timeCommitments = db.collection('time_commitments');
    await timeCommitments.createIndex({ id: 1 }, { unique: true });
    await timeCommitments.createIndex({ reveal_at: 1 });
  } catch (err) {
    console.log('[DB] Auth branding index setup skipped:', err.message);
  }

  console.log('[DB] MongoDB connected, indexes ready');
  return db;
  
  } catch (mongoErr) {
    // Fallback to in-memory storage
    console.warn('[DB] MongoDB unavailable, using in-memory storage:', mongoErr.message);
    console.warn('[DB] WARNING: Data will not persist across restarts!');
    client = null;
    db = createMockDb();
    usingInMemory = true;
    return db;
  }
}

/**
 * Log security event to audit trail
 */
export async function logSecurityEvent(eventType, severity, details = {}) {
  try {
    const db = getDb();
    const auditLog = db.collection('audit_log');
    await auditLog.insertOne({
      event_type: eventType,
      severity: severity, // 'low', 'medium', 'high', 'critical'
      timestamp: new Date(),
      details: details,
      // No IP logging - zero-knowledge design
    });
  } catch (error) {
    console.error('[AUDIT] Error logging security event:', error.message);
    // Don't throw - audit logging should not crash the app
  }
}

/**
 * Get database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call createDb() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    console.log('[DB] MongoDB connection closed');
  }
  db = null;
  usingInMemory = false;
}
