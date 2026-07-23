#!/usr/bin/env node
/**
 * Build browser extension zip for distribution
 *
 * Usage: npm run build:extension
 */
import { createWriteStream, existsSync, mkdirSync, copyFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'addons', 'browser-extension');
const DEST = join(ROOT, 'web', 'extension');
const ZIP = join(ROOT, 'web', 'extension.zip');

// Files to include in the extension (exclude store assets)
const EXTENSION_FILES = [
  'manifest.json',
  'popup.html',
  'popup.js',
  'background.js',
  'content.js'
];

async function main() {
console.log('🔧 Building browser extension...');

// 1. Clean previous build output (ensures no stale files like store/ assets)
console.log('🧹 Cleaning previous build output...');
if (existsSync(DEST)) {
  rmSync(DEST, { recursive: true, force: true });
}

// 2. Sync from addons/browser-extension to web/extension
console.log('📁 Syncing source files...');
mkdirSync(DEST, { recursive: true });
for (const file of EXTENSION_FILES) {
  copyFileSync(join(SRC, file), join(DEST, file));
}

// 3. Create zip file (deterministic/reproducible using fixed date)
console.log('📦 Creating extension.zip...');
await new Promise((resolve, reject) => {
  const output = createWriteStream(ZIP);
  const archive = archiver('zip', { zlib: { level: 9 } });
  output.on('close', resolve);
  archive.on('error', reject);
  archive.pipe(output);
  const BUILD_DATE = process.env.SOURCE_DATE_EPOCH
    ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH, 10) * 1000)
    : new Date('2024-01-01T00:00:00Z');
  archive.directory(DEST, false, { date: BUILD_DATE });
  archive.finalize();
});

console.log('✅ Extension built successfully!');
console.log(`   📄 Source: ${SRC}`);
console.log(`   📁 Output: ${DEST}`);
console.log(`   📦 Zip: ${ZIP}`);
}

main().catch((error) => {
  console.error('❌ Extension build failed:', error.message);
  process.exit(1);
});
