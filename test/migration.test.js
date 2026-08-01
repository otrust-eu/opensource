import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDb, createDb } from '../src/db.js';

describe('MongoDB export migration', () => {
  let directory;
  const originalDatabasePath = process.env.OTRUST_DB_PATH;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    await closeDb();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'otrust-migration-'));
  });

  afterEach(async () => {
    await closeDb();
    if (originalDatabasePath === undefined) delete process.env.OTRUST_DB_PATH;
    else process.env.OTRUST_DB_PATH = originalDatabasePath;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('validates Extended JSON and publishes a complete SQLite file', async () => {
    const source = path.join(directory, 'export');
    const destination = path.join(directory, 'data', 'otrust.sqlite');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'claims.json'), [
      JSON.stringify({
        _id: { $oid: '64f000000000000000000001' },
        id: 'ot_migrated001',
        hash: 'a'.repeat(64),
        pubkey: null,
        created_at: { $date: '2026-07-31T12:00:00.000Z' }
      }),
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(source, 'sign_files.json'), JSON.stringify([{
      _id: { $oid: '64f000000000000000000002' },
      file_id: 'sf_migrated',
      data: { $binary: { base64: Buffer.from('document').toString('base64'), subType: '00' } }
    }]));

    const dryRun = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', source, '--db', destination, '--dry-run'
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain('Validated 2 documents');
    expect(fs.existsSync(destination)).toBe(false);

    const migration = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', source, '--db', destination
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(migration.status).toBe(0);
    expect(migration.stdout).toContain('Imported 2 documents');
    expect(fs.existsSync(destination)).toBe(true);
    expect(fs.existsSync(`${destination}-wal`)).toBe(false);
    expect(fs.existsSync(`${destination}-shm`)).toBe(false);
    const manifest = JSON.parse(fs.readFileSync(`${destination}.migration.json`, 'utf8'));
    expect(manifest).toMatchObject({
      schema: 'otrust-mongodb-sqlite-migration/v1',
      verified: true,
      total_documents: 2,
      sqlite: {
        file: 'otrust.sqlite',
        integrity_check: 'ok'
      }
    });
    expect(manifest.sqlite.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.collections).toHaveLength(2);
    for (const collection of manifest.collections) {
      expect(collection.source_logical_sha256).toBe(collection.sqlite_logical_sha256);
    }

    process.env.NODE_ENV = 'production';
    process.env.OTRUST_DB_PATH = destination;
    const database = await createDb();
    const claim = await database.collection('claims').findOne({ id: 'ot_migrated001' });
    const file = await database.collection('sign_files').findOne({ file_id: 'sf_migrated' });
    expect(claim.created_at).toBeInstanceOf(Date);
    expect(claim._id).toBe('64f000000000000000000001');
    expect(Buffer.isBuffer(file.data)).toBe(true);
    expect(file.data.toString()).toBe('document');
  });

  test('refuses to overwrite an existing destination', () => {
    const source = path.join(directory, 'export');
    const destination = path.join(directory, 'otrust.sqlite');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'claims.json'), '{}\n');
    fs.writeFileSync(destination, 'keep');

    const migration = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', source, '--db', destination
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(migration.status).toBe(1);
    expect(migration.stderr).toContain('Destination already exists');
    expect(fs.readFileSync(destination, 'utf8')).toBe('keep');
  });

  test('verifies a production-sized export without corrupting SQLite row data', () => {
    const source = path.join(directory, 'export');
    const destination = path.join(directory, 'otrust.sqlite');
    fs.mkdirSync(source);
    const documents = Array.from({ length: 1600 }, (_, index) => JSON.stringify({
      _id: { $oid: index.toString(16).padStart(24, '0') },
      sequence: { $numberInt: String(index) },
      payload: {
        $binary: {
          base64: Buffer.alloc(512, index % 256).toString('base64'),
          subType: '00'
        }
      }
    }));
    fs.writeFileSync(path.join(source, 'proofs.json'), `${documents.join('\n')}\n`);

    const migration = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', source, '--db', destination
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(migration.status).toBe(0);
    expect(migration.stdout).toContain('Verified 1600 documents');
    const manifest = JSON.parse(fs.readFileSync(`${destination}.migration.json`, 'utf8'));
    expect(manifest.total_documents).toBe(1600);
    expect(manifest.collections[0].source_logical_sha256)
      .toBe(manifest.collections[0].sqlite_logical_sha256);
  });

  test('removes partial output when an export document is invalid', () => {
    const source = path.join(directory, 'export');
    const destination = path.join(directory, 'otrust.sqlite');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'claims.json'), [
      JSON.stringify({ id: 'ot_valid', hash: 'b'.repeat(64) }),
      '{"broken":',
      ''
    ].join('\n'));

    const migration = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', source, '--db', destination
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(migration.status).toBe(1);
    expect(migration.stderr).toContain('Migration failed');
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readdirSync(directory).some((name) => name.includes('.importing-'))).toBe(false);
  });

  test('refuses exports that could otherwise be skipped or cannot prove identity parity', () => {
    const destination = path.join(directory, 'otrust.sqlite');

    const invalidNameSource = path.join(directory, 'invalid-name');
    fs.mkdirSync(invalidNameSource);
    fs.writeFileSync(path.join(invalidNameSource, 'legacy-events.json'), '{"_id":"one"}\n');
    const invalidName = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', invalidNameSource, '--db', destination
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(invalidName.status).toBe(1);
    expect(invalidName.stderr).toContain('Unsupported collection filename');

    const missingIdSource = path.join(directory, 'missing-id');
    fs.mkdirSync(missingIdSource);
    fs.writeFileSync(path.join(missingIdSource, 'claims.json'), '{"hash":"abc"}\n');
    const missingId = spawnSync(process.execPath, [
      'scripts/import-mongodb-export.mjs', '--source', missingIdSource, '--db', destination
    ], { cwd: process.cwd(), encoding: 'utf8' });
    expect(missingId.status).toBe(1);
    expect(missingId.stderr).toContain('document without _id');
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.existsSync(`${destination}.migration.json`)).toBe(false);
  });
});
