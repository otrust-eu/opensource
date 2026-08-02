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
  'src/version.js',
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
  'test/crypto.test.js',
  'test/db.test.js',
  'test/migration.test.js',
  'test/opentimestamps.test.js',
  'test/fixtures',
  'test/email.test.js',
  'test/pow.test.js',
  'test/security.test.js',
  'test/validation.test.js',
  'test/api.test.js',
  'test/auth.test.js',
  'test/canonical-url.test.js',
  'test/platform.test.js',
  'test/zkproof.test.js',
  'test/all-live-test.mjs',
  'test/full-service-test.mjs',
  'test/e2e',
  'web',
  'addons/browser-extension/background.js',
  'addons/browser-extension/content.js',
  'addons/browser-extension/manifest.json',
  'addons/browser-extension/popup.html',
  'addons/browser-extension/popup.js',
  'sdk-js',
  'sdk-python',
  'sdk-react',
  'cli',
  'circuits',
  'examples',
  'scripts/build-extension.js',
  'scripts/build-poseidon.js',
  'scripts/import-mongodb-export.mjs',
  'scripts/ots-stamp-digest.py',
  'scripts/poseidon-browser-entry.js',
  'scripts/quickstart.ps1',
  'scripts/quickstart.sh',
  '.dockerignore',
  'docker-compose.yml',
  'Dockerfile',
  '.env.example',
  'requirements-ots.txt',
  'scripts/sync-opensource.mjs',
  'scripts/validate-openapi.js',
  'docs/API_POLICY.md',
  'docs/CHANGELOG.md',
  'docs/MONGODB_MIGRATION.md',
  'docs/sdk-design.md',
  'README.md',
  '.github/dependabot.yml',
  '.github/SECURITY.md',
  '.github/codeql-config.md',
  '.github/actions/otrust-timestamp',
  '.github/workflows/ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/publish-action.yml',
  '.github/workflows/release-evidence.yml',
  '.github/workflows/live-smoke.yml',
  '.github/workflows/e2e.yml',
  '.github/workflows/lighthouse.yml',
  'playwright.config.js',
  'lighthouserc.json'
];

function shouldCopy(sourceRoot, sourcePath) {
  const relativePath = path.relative(sourceRoot, sourcePath);
  return !relativePath.split(path.sep).includes('node_modules');
}

function removeStaleEntries(sourceDir, destinationDir) {
  if (!fs.existsSync(destinationDir)) return;

  for (const entry of fs.readdirSync(destinationDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (!fs.existsSync(sourcePath)) {
      fs.rmSync(destinationPath, { recursive: true, force: true });
      continue;
    }

    const sourceStat = fs.statSync(sourcePath);
    if (sourceStat.isDirectory() && entry.isDirectory()) {
      removeStaleEntries(sourcePath, destinationPath);
    } else if (sourceStat.isDirectory() !== entry.isDirectory()) {
      fs.rmSync(destinationPath, { recursive: true, force: true });
    }
  }
}

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
    removeStaleEntries(src, dest);
    fs.cpSync(src, dest, {
      recursive: true,
      force: true,
      preserveTimestamps: true,
      filter: (sourcePath) => shouldCopy(src, sourcePath)
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

// Keep the public workspace metadata independent while synchronizing runtime
// dependencies, build steps, and the complete server test command.
const corePackagePath = path.join(coreRoot, 'package.json');
const targetPackagePath = path.join(targetRoot, 'package.json');
if (fs.existsSync(targetPackagePath)) {
  const corePackage = JSON.parse(fs.readFileSync(corePackagePath, 'utf8'));
  const targetPackage = JSON.parse(fs.readFileSync(targetPackagePath, 'utf8'));

  targetPackage.scripts['build:poseidon'] = corePackage.scripts['build:poseidon'];
  targetPackage.scripts.build =
    'npm run build:extension && npm run build:poseidon && npm run build --workspace @otrust/sdk && npm run build --workspace @otrust/react';
  targetPackage.scripts['test:core'] = corePackage.scripts.test;
  targetPackage.scripts['test:unit'] = targetPackage.scripts['test:core'];
  targetPackage.scripts['test:integration'] =
    'node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand test/api.test.js test/auth.test.js test/platform.test.js';
  targetPackage.scripts['migrate:mongodb-export'] = corePackage.scripts['migrate:mongodb-export'];
  targetPackage.engines = corePackage.engines;
  delete targetPackage.dependencies.mongodb;

  for (const dependency of ['archiver', 'poseidon-lite', 'snarkjs']) {
    targetPackage.dependencies[dependency] = corePackage.dependencies[dependency];
  }
  targetPackage.devDependencies.esbuild = corePackage.devDependencies.esbuild;
  targetPackage.overrides.bfj = corePackage.overrides.bfj;
  targetPackage.overrides['brace-expansion'] = corePackage.overrides['brace-expansion'];
  targetPackage.overrides.ejs = corePackage.overrides.ejs;
  targetPackage.overrides.postcss = corePackage.overrides.postcss;
  targetPackage.overrides.esbuild = corePackage.devDependencies.esbuild;

  fs.writeFileSync(targetPackagePath, `${JSON.stringify(targetPackage, null, 2)}\n`);
  console.log('  âœ“ synchronized public package build, test, and ZK dependencies');
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
  readme = readme.replace(
    /Set-Location core/g,
    'Set-Location opensource'
  );
  if (readme !== original) {
    fs.writeFileSync(readmePath, readme);
    console.log('  ✓ updated README clone command to opensource repo');
  }
}

console.log('\nDone. Run tests in opensource:');
console.log(`  cd ${targetRoot}`);
console.log('  npm ci && npm run test:core && npm run test:integration');
