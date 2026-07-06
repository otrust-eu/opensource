#!/usr/bin/env node
/**
 * Minimal OpenAPI contract check for platform v1 paths.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specPath = path.join(__dirname, '../web/openapi.json');
const required = [
  '/api/v1/platform/me',
  '/api/v1/platform/scopes',
  '/api/v1/platform/organizations',
  '/claim/simple'
];

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const paths = spec.paths || {};
const missing = required.filter((p) => !paths[p]);

if (missing.length) {
  console.error('OpenAPI missing required paths:', missing.join(', '));
  process.exit(1);
}

if (!spec.components?.securitySchemes?.ApiKeyAuth) {
  console.warn('OpenAPI: ApiKeyAuth security scheme not defined (optional)');
}

console.log('OpenAPI contract check passed.');