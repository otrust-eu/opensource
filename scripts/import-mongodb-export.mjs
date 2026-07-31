#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

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

async function *readDocuments(filePath) {
  const firstCharacter = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).trimStart()[0];
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
  return fs.readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.jsonl?$/i.test(entry.name))
    .map((entry) => ({
      collection: entry.name.replace(/\.jsonl?$/i, ''),
      filePath: path.join(sourceDirectory, entry.name)
    }))
    .filter(({ collection }) => /^[A-Za-z0-9_]+$/.test(collection))
    .sort((left, right) => left.collection.localeCompare(right.collection));
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

  const temporaryDatabase = `${destination}.importing-${process.pid}`;
  let imported = 0;
  let database = null;

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
      for await (const document of readDocuments(filePath)) {
        if (!document || typeof document !== 'object' || Array.isArray(document)) {
          throw new Error(`${filePath} contains a non-document value`);
        }
        if (!options.dryRun) await database.collection(collection).insertOne(document);
        collectionCount += 1;
        imported += 1;
      }
      console.log(`${collection}: ${collectionCount}`);
    }

    if (!options.dryRun) {
      const { closeDb } = await import('../src/db.js');
      await closeDb();
      database = null;
      fs.renameSync(temporaryDatabase, destination);
      console.log(`Imported ${imported} documents to ${destination}`);
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
    throw error;
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
