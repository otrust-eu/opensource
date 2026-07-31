#!/usr/bin/env node

import { build } from 'esbuild';
import { copyFile } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

await build({
  entryPoints: ['scripts/poseidon-browser-entry.js'],
  outfile: 'web/js/poseidon-lite.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  legalComments: 'eof',
  banner: {
    js: '/* poseidon-lite 0.3.0, MIT License */'
  }
});

const require = createRequire(import.meta.url);
const snarkjsEntry = require.resolve('snarkjs');
await copyFile(
  path.join(path.dirname(snarkjsEntry), 'snarkjs.min.js'),
  'web/js/snarkjs.min.js'
);

console.log('Built local ZK browser dependencies');
