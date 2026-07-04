#!/usr/bin/env node
/**
 * Sync public paths from otrust-core → otrust-eu/opensource.
 * Usage: node scripts/sync-opensource.mjs [targetDir]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(__dirname, '..');
const targetRoot = path.resolve(process.argv[2] || process.env.OPENSOURCE_DIR || path.join(coreRoot, '..', 'otrust'));

const SYNC_PATHS = [
  'src/server.js',
  'src/sign.js',
  'src/zkproof.js',
  'src/crypto.js',
  'src/db.js',
  'web',
  'sdk-js',
  'sdk-python',
  'sdk-react',
  'cli',
  'circuits',
  'examples',
  'docker-compose.yml',
  'Dockerfile',
  '.env.example',
  'scripts/sync-opensource.mjs',
  '.github/workflows/live-smoke.yml',
  '.github/workflows/e2e.yml',
  '.github/workflows/lighthouse.yml',
  'lighthouserc.json'
];

if (!fs.existsSync(targetRoot)) {
  console.error(`Target not found: ${targetRoot}`);
  console.error('Set OPENSOURCE_DIR or pass the opensource clone path as the first argument.');
  process.exit(1);
}

console.log(`Syncing core → ${targetRoot}`);

for (const rel of SYNC_PATHS) {
  const src = path.join(coreRoot, rel);
  const dest = path.join(targetRoot, rel);
  if (!fs.existsSync(src)) {
    console.warn(`  skip (missing): ${rel}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    execSync(`rsync -a --delete "${src}/" "${dest}/"`, { stdio: 'inherit' });
  } else {
    execSync(`rsync -a "${src}" "${dest}"`, { stdio: 'inherit' });
  }
  console.log(`  ✓ ${rel}`);
}

const gitignorePath = path.join(targetRoot, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  const cleaned = gitignore
    .split('\n')
    .filter((line) => !line.includes('partners-hemsted'))
    .join('\n');
  if (cleaned !== gitignore) {
    fs.writeFileSync(gitignorePath, cleaned);
    console.log('  ✓ cleaned .gitignore (partners-hemsted)');
  }
}

console.log('\nDone. Run tests in opensource:');
console.log(`  cd ${targetRoot}`);
console.log('  npm ci && npm run test:core && npm run test:integration');