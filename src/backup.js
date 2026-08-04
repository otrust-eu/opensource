import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MINIMUM_AGE_MS = 20 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_START_DELAY_MS = 15_000;
const BACKUP_PREFIX = 'sqlite/';

let timer = null;
let running = false;
let processorOptions = null;
let backupStatus = {
  enabled: false,
  state: 'disabled',
  last_backup_at: null,
  next_backup_at: null,
  last_error_at: null
};

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function timestampForKey(date) {
  return date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function createClient(configuration) {
  return new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: configuration.urlStyle === 'path',
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey
    }
  });
}

function loadConfiguration(environment = process.env) {
  const enabled = environment.OTRUST_BACKUP_ENABLED === 'true';
  const configuration = {
    enabled,
    endpoint: environment.BUCKET_ENDPOINT?.trim(),
    accessKeyId: environment.BUCKET_ACCESS_KEY_ID?.trim(),
    secretAccessKey: environment.BUCKET_SECRET_ACCESS_KEY?.trim(),
    bucket: environment.BUCKET_NAME?.trim(),
    region: environment.BUCKET_REGION?.trim() || 'auto',
    urlStyle: environment.BUCKET_URL_STYLE?.trim() || 'virtual',
    intervalMs: positiveNumber(environment.OTRUST_BACKUP_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    minimumAgeMs: positiveNumber(environment.OTRUST_BACKUP_MINIMUM_AGE_MS, DEFAULT_MINIMUM_AGE_MS),
    retentionDays: positiveNumber(environment.OTRUST_BACKUP_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
    startDelayMs: positiveNumber(environment.OTRUST_BACKUP_START_DELAY_MS, DEFAULT_START_DELAY_MS)
  };

  if (!enabled) return configuration;

  const missing = [
    ['BUCKET_ENDPOINT', configuration.endpoint],
    ['BUCKET_ACCESS_KEY_ID', configuration.accessKeyId],
    ['BUCKET_SECRET_ACCESS_KEY', configuration.secretAccessKey],
    ['BUCKET_NAME', configuration.bucket]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`SQLite backup configuration is missing: ${missing.join(', ')}`);
  }

  return configuration;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function listBackupObjects(client, bucket) {
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: BACKUP_PREFIX,
      ContinuationToken: continuationToken
    }));
    objects.push(...(response.Contents || []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects
    .filter((object) => object.Key && object.LastModified)
    .sort((left, right) => new Date(right.LastModified) - new Date(left.LastModified));
}

function verifySnapshot(snapshotPath) {
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const rows = snapshot.prepare('PRAGMA integrity_check').all();
    if (rows.length !== 1 || rows[0].integrity_check !== 'ok') {
      throw new Error('SQLite snapshot failed integrity_check');
    }
  } finally {
    snapshot.close();
  }
}

async function removeExpiredBackups(client, bucket, objects, retentionDays, now, currentKey) {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const expired = objects
    .filter((object) => object.Key !== currentKey && new Date(object.LastModified).getTime() < cutoff)
    .map((object) => ({ Key: object.Key }));

  for (let index = 0; index < expired.length; index += 1000) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: expired.slice(index, index + 1000), Quiet: true }
    }));
  }

  return expired.length;
}

export async function runSqliteBackup({
  databasePath,
  configuration = loadConfiguration(),
  client = createClient(configuration),
  now = new Date(),
  force = false
}) {
  if (!configuration.enabled) return { status: 'disabled' };
  if (!databasePath || databasePath === ':memory:') {
    throw new Error('SQLite backup requires a persistent database file');
  }

  const existing = await listBackupObjects(client, configuration.bucket);
  const latest = existing[0];
  if (!force && latest && now.getTime() - new Date(latest.LastModified).getTime() < configuration.minimumAgeMs) {
    return {
      status: 'skipped',
      latestBackupAt: new Date(latest.LastModified).toISOString(),
      key: latest.Key
    };
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'otrust-backup-'));
  const snapshotPath = path.join(temporaryDirectory, `${randomUUID()}.sqlite`);
  const archivePath = `${snapshotPath}.gz`;
  let source = null;

  try {
    source = new DatabaseSync(path.resolve(databasePath));
    source.exec('PRAGMA busy_timeout = 30000');
    source.exec(`VACUUM INTO ${sqlString(snapshotPath)}`);
    source.close();
    source = null;

    verifySnapshot(snapshotPath);
    const snapshotSha256 = await sha256File(snapshotPath);
    await pipeline(fs.createReadStream(snapshotPath), createGzip({ level: 9 }), fs.createWriteStream(archivePath));
    const archiveSha256 = await sha256File(archivePath);
    const archiveStat = await stat(archivePath);
    const key = `${BACKUP_PREFIX}otrust-${timestampForKey(now)}.sqlite.gz`;

    await client.send(new PutObjectCommand({
      Bucket: configuration.bucket,
      Key: key,
      Body: fs.createReadStream(archivePath),
      ContentLength: archiveStat.size,
      ContentType: 'application/vnd.sqlite3',
      ContentEncoding: 'gzip',
      Metadata: {
        snapshotsha256: snapshotSha256,
        archivesha256: archiveSha256,
        integritycheck: 'ok',
        createdat: now.toISOString()
      }
    }));

    const uploaded = await client.send(new HeadObjectCommand({ Bucket: configuration.bucket, Key: key }));
    if (Number(uploaded.ContentLength) !== archiveStat.size) {
      throw new Error('Uploaded SQLite backup size does not match the local archive');
    }
    if (uploaded.Metadata?.snapshotsha256 !== snapshotSha256 || uploaded.Metadata?.archivesha256 !== archiveSha256) {
      throw new Error('Uploaded SQLite backup metadata could not be verified');
    }

    const deleted = await removeExpiredBackups(
      client,
      configuration.bucket,
      [...existing, { Key: key, LastModified: now }],
      configuration.retentionDays,
      now,
      key
    );

    return {
      status: 'uploaded',
      key,
      size: archiveStat.size,
      snapshotSha256,
      archiveSha256,
      deleted
    };
  } finally {
    source?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function runScheduledBackup() {
  if (!processorOptions || running) return;
  running = true;
  backupStatus.state = 'running';
  backupStatus.next_backup_at = null;

  try {
    const result = await runSqliteBackup(processorOptions);
    const completedAt = new Date();
    backupStatus.state = 'ok';
    backupStatus.last_backup_at = result.latestBackupAt || completedAt.toISOString();
    backupStatus.last_error_at = null;
    console.log(result.status === 'uploaded'
      ? `[Backup] SQLite snapshot uploaded (${result.size} bytes)`
      : '[Backup] Recent SQLite snapshot already exists');
  } catch (error) {
    backupStatus.state = 'error';
    backupStatus.last_error_at = new Date().toISOString();
    console.error('[Backup] SQLite snapshot failed:', error.message);
  } finally {
    running = false;
    if (processorOptions) {
      const nextBackup = new Date(Date.now() + processorOptions.configuration.intervalMs);
      backupStatus.next_backup_at = nextBackup.toISOString();
      timer = setTimeout(runScheduledBackup, processorOptions.configuration.intervalMs);
      timer.unref?.();
    }
  }
}

export function startBackupProcessor(databasePath, environment = process.env) {
  stopBackupProcessor();

  let configuration;
  try {
    configuration = loadConfiguration(environment);
  } catch (error) {
    backupStatus = {
      enabled: true,
      state: 'error',
      last_backup_at: null,
      next_backup_at: null,
      last_error_at: new Date().toISOString()
    };
    console.error('[Backup] Configuration error:', error.message);
    return false;
  }

  if (!configuration.enabled) return false;

  const client = createClient(configuration);
  processorOptions = { databasePath, configuration, client };
  const firstRun = new Date(Date.now() + configuration.startDelayMs);
  backupStatus = {
    enabled: true,
    state: 'pending',
    last_backup_at: null,
    next_backup_at: firstRun.toISOString(),
    last_error_at: null
  };
  timer = setTimeout(runScheduledBackup, configuration.startDelayMs);
  timer.unref?.();
  console.log('[Backup] SQLite backup processor enabled');
  return true;
}

export function stopBackupProcessor() {
  if (timer) clearTimeout(timer);
  timer = null;
  processorOptions?.client?.destroy?.();
  processorOptions = null;
  running = false;
}

export function getBackupStatus() {
  return { ...backupStatus };
}
