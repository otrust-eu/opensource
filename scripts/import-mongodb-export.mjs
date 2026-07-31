#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { DatabaseSync } from 'node:sqlite';

const MIGRATION_SCHEMA = 'otrust-mongodb-sqlite-migration/v1';
const DATE_MARKER = '__otrust_date';
const BUFFER_MARKER = '__otrust_buffer';

function usage() {
  console.log(`Usage:
  node scripts/import-mongodb-export.mjs --source <directory> --db <otrust.sqlite> [--dry-run]

The source directory must contain one mongoexport file per collection, named
<collection>.json or <collection>.jsonl. The destination must not exist.`);
}

function parseArguments(argv) {
  const options = { source: null, database: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--source') options.source = argv[++index];
    else if (argument === '--db') options.database = argv[++index];
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function decodeExtendedJson(value) {
  if (Array.isArray(value)) return value.map(decodeExtendedJson);
  if (!value || typeof value !== 'object') return value;

  const keys = Object.keys(value);
  if (keys.length === 1 && '$date' in value) {
    const raw = value.$date;
    const dateValue = raw && typeof raw === 'object' && '$numberLong' in raw ? Number(raw.$numberLong) : raw;
    const date = new Date(dateValue);
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid BSON date: ${JSON.stringify(raw)}`);
    return date;
  }
  if (keys.length === 1 && typeof value.$oid === 'string') return value.$oid;
  if (keys.length === 1 && '$numberInt' in value) return Number(value.$numberInt);
  if (keys.length === 1 && '$numberLong' in value) {
    const parsed = Number(value.$numberLong);
    return Number.isSafeInteger(parsed) ? parsed : String(value.$numberLong);
  }
  if (keys.length === 1 && '$numberDouble' in value) return Number(value.$numberDouble);
  if (keys.length === 1 && value.$binary && typeof value.$binary === 'object') {
    return Buffer.from(value.$binary.base64, 'base64');
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decodeExtendedJson(item)])
  );
}

function canonicalize(value) {
  if (value instanceof Date) return { [DATE_MARKER]: value.toISOString() };
  if (Buffer.isBuffer(value)) return { [BUFFER_MARKER]: value.toString('base64') };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function documentDigest(document) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalize(document)))
    .digest('hex');
}

function collectionDigest(documentDigests) {
  const hash = crypto.createHash('sha256');
  for (const digest of [...documentDigests].sort()) hash.update(digest).update('\n');
  return hash.digest('hex');
}

async function fileDigest(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function firstNonWhitespaceCharacter(filePath) {
  for await (const chunk of fs.createReadStream(filePath, { encoding: 'utf8' })) {
    for (const character of chunk) {
      if (!/\s/.test(character)) return character;
    }
  }
  return null;
}

async function *readDocuments(filePath) {
  const firstCharacter = await firstNonWhitespaceCharacter(filePath);
  if (firstCharacter === '[') {
    const documents = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(documents)) throw new Error(`${filePath} must contain a JSON array`);
    for (const document of documents) yield decodeExtendedJson(document);
    return;
  }

  const input = fs.createReadStream(filePath, 'utf8');
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield decodeExtendedJson(JSON.parse(line));
    } catch (error) {
      throw new Error(`${filePath}:${lineNumber}: ${error.message}`);
    }
  }
}

function exportFiles(sourceDirectory) {
  const files = fs.readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.jsonl?$/i.test(entry.name))
    .map((entry) => ({
      collection: entry.name.replace(/\.jsonl?$/i, ''),
      filePath: path.join(sourceDirectory, entry.name)
    }));
  const invalid = files.find(({ collection }) => !/^[A-Za-z0-9_]+$/.test(collection));
  if (invalid) {
    throw new Error(`Unsupported collection filename: ${path.basename(invalid.filePath)}`);
  }
  return files.sort((left, right) => left.collection.localeCompare(right.collection));
}

function verifyDatabase(databasePath, expectedCollections) {
  const verification = new DatabaseSync(databasePath, { readOnly: true });
  const actualCollections = new Map();

  try {
    const integrityRow = verification.prepare('PRAGMA integrity_check').get();
    const integrityResult = integrityRow && Object.values(integrityRow)[0];
    if (integrityResult !== 'ok') {
      throw new Error(`SQLite integrity check failed: ${integrityResult || 'unknown result'}`);
    }

    const rows = verification.prepare(`
      SELECT collection_name, body
      FROM documents
      ORDER BY collection_name, row_id
    `).iterate();
    for (const row of rows) {
      if (!actualCollections.has(row.collection_name)) actualCollections.set(row.collection_name, []);
      actualCollections.get(row.collection_name).push(documentDigest(JSON.parse(row.body)));
    }
  } finally {
    verification.close();
  }

  const expectedNames = new Set(expectedCollections.map(({ collection }) => collection));
  const unexpected = [...actualCollections.keys()].filter((name) => !expectedNames.has(name));
  if (unexpected.length > 0) {
    throw new Error(`SQLite contains unexpected collections: ${unexpected.join(', ')}`);
  }

  return expectedCollections.map((expected) => {
    const actualDigests = actualCollections.get(expected.collection) || [];
    const actualDigest = collectionDigest(actualDigests);
    if (actualDigests.length !== expected.documents) {
      throw new Error(
        `${expected.collection}: expected ${expected.documents} documents, found ${actualDigests.length}`
      );
    }
    if (actualDigest !== expected.source_logical_sha256) {
      throw new Error(`${expected.collection}: logical checksum mismatch after SQLite import`);
    }
    return {
      ...expected,
      sqlite_logical_sha256: actualDigest
    };
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.source || !options.database) {
    usage();
    throw new Error('--source and --db are required');
  }

  const sourceDirectory = path.resolve(options.source);
  const destination = path.resolve(options.database);
  if (!fs.statSync(sourceDirectory).isDirectory()) throw new Error('--source must be a directory');
  const files = exportFiles(sourceDirectory);
  if (files.length === 0) throw new Error('No .json or .jsonl collection exports found');
  if (!options.dryRun && fs.existsSync(destination)) {
    throw new Error(`Destination already exists: ${destination}`);
  }
  const manifestPath = `${destination}.migration.json`;
  if (!options.dryRun && fs.existsSync(manifestPath)) {
    throw new Error(`Migration manifest already exists: ${manifestPath}`);
  }

  const temporaryDatabase = `${destination}.importing-${process.pid}`;
  const temporaryManifest = `${temporaryDatabase}.migration.json`;
  let imported = 0;
  let database = null;
  let published = false;
  const collectionReports = [];

  try {
    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      process.env.OTRUST_DB_PATH = temporaryDatabase;
      process.env.NODE_ENV = 'production';
      const module = await import('../src/db.js');
      database = await module.createDb();
    }

    for (const { collection, filePath } of files) {
      let collectionCount = 0;
      const sourceDocumentDigests = [];
      for await (const document of readDocuments(filePath)) {
        if (!document || typeof document !== 'object' || Array.isArray(document)) {
          throw new Error(`${filePath} contains a non-document value`);
        }
        if (!Object.prototype.hasOwnProperty.call(document, '_id')) {
          throw new Error(`${filePath} contains a document without _id`);
        }
        if (!options.dryRun) await database.collection(collection).insertOne(document);
        sourceDocumentDigests.push(documentDigest(document));
        collectionCount += 1;
        imported += 1;
      }
      collectionReports.push({
        collection,
        documents: collectionCount,
        export_sha256: await fileDigest(filePath),
        source_logical_sha256: collectionDigest(sourceDocumentDigests)
      });
      console.log(`${collection}: ${collectionCount}`);
    }

    if (!options.dryRun) {
      const { closeDb } = await import('../src/db.js');
      await closeDb();
      database = null;
      const verifiedCollections = verifyDatabase(temporaryDatabase, collectionReports);
      const manifest = {
        schema: MIGRATION_SCHEMA,
        created_at: new Date().toISOString(),
        verified: true,
        total_documents: imported,
        collections: verifiedCollections,
        sqlite: {
          file: path.basename(destination),
          sha256: await fileDigest(temporaryDatabase),
          integrity_check: 'ok'
        }
      };
      fs.writeFileSync(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      fs.renameSync(temporaryDatabase, destination);
      published = true;
      fs.renameSync(temporaryManifest, manifestPath);
      console.log(`Verified ${imported} documents across ${collectionReports.length} collections`);
      console.log(`Imported ${imported} documents to ${destination}`);
      console.log(`Migration manifest: ${manifestPath}`);
    } else {
      console.log(`Validated ${imported} documents`);
    }
  } catch (error) {
    if (database) {
      const { closeDb } = await import('../src/db.js');
      await closeDb().catch(() => {});
    }
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(`${temporaryDatabase}${suffix}`, { force: true });
    }
    fs.rmSync(temporaryManifest, { force: true });
    if (published) {
      fs.rmSync(destination, { force: true });
      fs.rmSync(manifestPath, { force: true });
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
