import fs from 'fs';
import { fileURLToPath } from 'url';

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

export const APP_VERSION = packageJson.version;

function safeBuildValue(value) {
  const normalized = String(value || '').trim();
  return /^[a-zA-Z0-9._-]{7,128}$/.test(normalized) ? normalized : null;
}

export function getBuildMetadata(env = process.env) {
  return {
    version: APP_VERSION,
    commit_sha: safeBuildValue(
      env.RAILWAY_GIT_COMMIT_SHA ||
      env.GIT_COMMIT_SHA ||
      env.COMMIT_SHA ||
      env.SOURCE_VERSION
    )
  };
}
