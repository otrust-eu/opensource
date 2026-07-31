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
});
