import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDb, createDb } from '../src/db.js';

describe('SQLite database', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDatabasePath = process.env.OTRUST_DB_PATH;
  const guardedEnvironmentNames = [
    'MONGODB_URL',
    'MONGODB_URI',
    'MONGO_URL',
    'OTRUST_ALLOW_EMPTY_DB',
    'RAILWAY_PROJECT_ID',
    'RAILWAY_ENVIRONMENT_ID',
    'RAILWAY_SERVICE_ID'
  ];
  const originalGuardedEnvironment = Object.fromEntries(
    guardedEnvironmentNames.map((name) => [name, process.env[name]])
  );
  let temporaryDirectory = null;

  beforeEach(async () => {
    await closeDb();
    process.env.NODE_ENV = 'test';
    delete process.env.OTRUST_DB_PATH;
    guardedEnvironmentNames.forEach((name) => delete process.env[name]);
  });

  afterEach(async () => {
    await closeDb();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalDatabasePath === undefined) delete process.env.OTRUST_DB_PATH;
    else process.env.OTRUST_DB_PATH = originalDatabasePath;
    for (const [name, value] of Object.entries(originalGuardedEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (temporaryDirectory) {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = null;
    }
  });

  test('uses an in-memory SQLite database during tests', async () => {
    const database = await createDb();
    expect(database.adapter).toBe('sqlite');
    expect(database.path).toBe(':memory:');
  });

  test('persists dates, buffers, nested arrays, and positional updates', async () => {
    const database = await createDb();
    const collection = database.collection('sign_requests');
    const createdAt = new Date('2026-07-31T12:00:00.000Z');

    await collection.insertOne({
      id: 'sign_one',
      created_at: createdAt,
      data: Buffer.from('document'),
      parties: [{ token: 'party_one', notified_at: null }]
    });
    await collection.updateOne(
      { id: 'sign_one', 'parties.token': 'party_one' },
      { $set: { 'parties.$.notified_at': createdAt } }
    );

    const stored = await collection.findOne({ 'parties.token': 'party_one' });
    expect(stored.created_at).toBeInstanceOf(Date);
    expect(stored.created_at.toISOString()).toBe(createdAt.toISOString());
    expect(Buffer.isBuffer(stored.data)).toBe(true);
    expect(stored.data.toString()).toBe('document');
    expect(stored.parties[0].notified_at).toBeInstanceOf(Date);
  });

  test('enforces unique indexes with the duplicate code expected by callers', async () => {
    const database = await createDb();
    const organizations = database.collection('organizations');

    await organizations.insertOne({ id: 'org_one' });
    await expect(organizations.insertOne({ id: 'org_one' })).rejects.toMatchObject({ code: 11000 });
  });

  test('expires TTL documents before they can be read', async () => {
    const database = await createDb();
    const sessions = database.collection('sessions');
    await sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    await sessions.insertOne({ id: 'expired', expires_at: new Date(Date.now() - 1000) });

    await expect(sessions.findOne({ id: 'expired' })).resolves.toBeNull();
  });

  test('consumes a challenge atomically', async () => {
    const database = await createDb();
    const challenges = database.collection('pow_challenges');
    const expiresAt = new Date(Date.now() + 60_000);
    await challenges.insertOne({ challenge: 'challenge_one', used: false, expires_at: expiresAt });

    const first = await challenges.findOneAndUpdate(
      { challenge: 'challenge_one', used: false, expires_at: { $gt: new Date() } },
      { $set: { used: true } },
      { returnDocument: 'before' }
    );
    const second = await challenges.findOneAndUpdate(
      { challenge: 'challenge_one', used: false, expires_at: { $gt: new Date() } },
      { $set: { used: true } },
      { returnDocument: 'before' }
    );

    expect(first.used).toBe(false);
    expect(second).toBeNull();
  });

  test('supports filtered sorting, pagination limits, and aggregation', async () => {
    const database = await createDb();
    const auditLog = database.collection('audit_log');
    const now = new Date();

    await auditLog.insertOne({ event_type: 'rate_limit_api', timestamp: now, severity: 'low' });
    await auditLog.insertOne({ event_type: 'rate_limit_api', timestamp: new Date(now.getTime() + 1000), severity: 'low' });
    await auditLog.insertOne({ event_type: 'other', timestamp: now, severity: 'low' });

    const recent = await auditLog.find({ event_type: { $ne: 'other' } })
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    const grouped = await auditLog.aggregate([
      { $match: { event_type: /^rate_limit_/ } },
      { $group: { _id: '$event_type', count: { $sum: 1 }, last_occurrence: { $max: '$timestamp' } } }
    ]).toArray();

    expect(recent).toHaveLength(1);
    expect(recent[0].timestamp.getTime()).toBe(now.getTime() + 1000);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ _id: 'rate_limit_api', count: 2 });
    expect(grouped[0].last_occurrence).toBeInstanceOf(Date);
  });

  test('survives a close and reopen when a file path is configured', async () => {
    await closeDb();
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'otrust-sqlite-'));
    process.env.OTRUST_DB_PATH = path.join(temporaryDirectory, 'otrust.sqlite');

    let database = await createDb();
    await database.collection('proofs').insertOne({ id: 'proof_one', verified: true });
    await closeDb();

    database = await createDb();
    await expect(database.collection('proofs').findOne({ id: 'proof_one' }))
      .resolves.toMatchObject({ id: 'proof_one', verified: true });
    expect(fs.existsSync(process.env.OTRUST_DB_PATH)).toBe(true);
  });

  test('refuses an empty Railway database while legacy MongoDB is configured', async () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'otrust-railway-'));
    process.env.NODE_ENV = 'production';
    process.env.OTRUST_DB_PATH = path.join(temporaryDirectory, 'otrust.sqlite');
    process.env.RAILWAY_ENVIRONMENT_ID = 'production';
    process.env.MONGODB_URL = 'mongodb://legacy.invalid/otrust';

    await expect(createDb()).rejects.toThrow('MongoDB migration required');
    expect(fs.existsSync(process.env.OTRUST_DB_PATH)).toBe(false);
  });

  test('requires an explicit opt-in for a fresh Railway database', async () => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'otrust-railway-new-'));
    process.env.NODE_ENV = 'production';
    process.env.OTRUST_DB_PATH = path.join(temporaryDirectory, 'otrust.sqlite');
    process.env.RAILWAY_ENVIRONMENT_ID = 'production';

    await expect(createDb()).rejects.toThrow('Railway storage initialization required');
    process.env.OTRUST_ALLOW_EMPTY_DB = 'true';
    await expect(createDb()).resolves.toMatchObject({ adapter: 'sqlite' });
    expect(fs.existsSync(process.env.OTRUST_DB_PATH)).toBe(true);
  });
});
