import { createGunzip } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';

import { runSqliteBackup } from '../src/backup.js';

function configuration(overrides = {}) {
  return {
    enabled: true,
    endpoint: 'https://storage.example.test',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    bucket: 'test-bucket',
    region: 'auto',
    urlStyle: 'virtual',
    intervalMs: 86_400_000,
    minimumAgeMs: 72_000_000,
    retentionDays: 14,
    startDelayMs: 1,
    ...overrides
  };
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('SQLite backups', () => {
  let directory;
  let databasePath;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'otrust-backup-test-'));
    databasePath = path.join(directory, 'otrust.sqlite');
    const database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE records (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    database.prepare('INSERT INTO records (id, value) VALUES (?, ?)').run('one', 'preserved');
    database.close();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('uploads a restorable, verified snapshot', async () => {
    let archive = null;
    let upload = null;
    const client = {
      async send(command) {
        const name = command.constructor.name;
        if (name === 'ListObjectsV2Command') return { Contents: [] };
        if (name === 'PutObjectCommand') {
          upload = command.input;
          archive = await streamToBuffer(command.input.Body);
          return { ETag: 'test-etag' };
        }
        if (name === 'HeadObjectCommand') {
          return { ContentLength: archive.length, Metadata: upload.Metadata };
        }
        throw new Error(`Unexpected command: ${name}`);
      }
    };

    const now = new Date('2026-08-04T01:02:03.456Z');
    const result = await runSqliteBackup({
      databasePath,
      configuration: configuration(),
      client,
      now,
      force: true
    });

    expect(result.status).toBe('uploaded');
    expect(result.key).toBe('sqlite/otrust-2026-08-04T01-02-03-456Z.sqlite.gz');
    expect(upload.ContentEncoding).toBe('gzip');
    expect(upload.Metadata.integritycheck).toBe('ok');
    expect(upload.Metadata.snapshotsha256).toMatch(/^[a-f0-9]{64}$/);
    expect(upload.Metadata.archivesha256).toMatch(/^[a-f0-9]{64}$/);

    const archivePath = path.join(directory, 'restore.sqlite.gz');
    const restoredPath = path.join(directory, 'restore.sqlite');
    await writeFile(archivePath, archive);
    await pipeline(fs.createReadStream(archivePath), createGunzip(), fs.createWriteStream(restoredPath));

    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    expect(restored.prepare('PRAGMA integrity_check').get().integrity_check).toBe('ok');
    expect(restored.prepare('SELECT value FROM records WHERE id = ?').get('one')).toEqual({ value: 'preserved' });
    restored.close();
  });

  test('does not create another snapshot while a recent one exists', async () => {
    const latest = new Date('2026-08-04T00:00:00.000Z');
    const client = {
      async send(command) {
        if (command.constructor.name !== 'ListObjectsV2Command') {
          throw new Error('A recent backup should skip uploads');
        }
        return {
          Contents: [{ Key: 'sqlite/latest.sqlite.gz', LastModified: latest, Size: 10 }]
        };
      }
    };

    const result = await runSqliteBackup({
      databasePath,
      configuration: configuration(),
      client,
      now: new Date('2026-08-04T01:00:00.000Z')
    });

    expect(result).toMatchObject({
      status: 'skipped',
      latestBackupAt: latest.toISOString(),
      key: 'sqlite/latest.sqlite.gz'
    });
  });
});
