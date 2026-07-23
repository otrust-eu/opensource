#!/usr/bin/env node
/**
 * Sync public paths from otrust-core → otrust-eu/opensource.
 * Usage: node scripts/sync-opensource.mjs [targetDir]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(__dirname, '..');
const targetRoot = path.resolve(process.argv[2] || process.env.OPENSOURCE_DIR || path.join(coreRoot, '..', 'opensource'));

const SYNC_PATHS = [
  'src/server.js',
  'src/canonical-url.js',
  'src/sign.js',
  'src/emailTemplate.js',
  'src/zkproof.js',
  'src/crypto.js',
  'src/db.js',
  'src/config.js',
  'src/email.js',
  'src/hosted',
  'src/opentimestamps.js',
  'src/pow.js',
  'src/webhooks.js',
  'src/wave4',
  'src/zkproofs.js',
  'src/platform',
  'test/email.test.js',
  'test/api.test.js',
  'test/canonical-url.test.js',
  'web',
  'sdk-js',
  'sdk-python',
  'sdk-react',
  'cli',
  'circuits',
  'examples',
  'scripts/quickstart.sh',
  'docker-compose.yml',
  'Dockerfile',
  '.env.example',
  'scripts/sync-opensource.mjs',
  'scripts/validate-openapi.js',
  'README.md',
  '.github/dependabot.yml',
  '.github/actions/otrust-timestamp',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/publish-action.yml',
  '.github/workflows/release-evidence.yml',
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
  fs.rmSync(dest, { recursive: true, force: true });
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, {
      recursive: true,
      force: true,
      preserveTimestamps: true
    });
  } else {
    fs.copyFileSync(src, dest);
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

// Ensure README in opensource points to the opensource repo for cloning (not core)
const readmePath = path.join(targetRoot, 'README.md');
if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, 'utf8');
  const original = readme;
  readme = readme.replace(
    /git clone https:\/\/github.com\/otrust-eu\/core\.git/g,
    'git clone https://github.com/otrust-eu/opensource.git'
  );
  readme = readme.replace(
    /cd core/g,
    'cd opensource'
  );
  if (readme !== original) {
    fs.writeFileSync(readmePath, readme);
    console.log('  ✓ updated README clone command to opensource repo');
  }
}

console.log('\nDone. Run tests in opensource:');
console.log(`  cd ${targetRoot}`);
console.log('  npm ci && npm run test:core && npm run test:integration');
