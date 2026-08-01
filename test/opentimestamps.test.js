import path from 'path';
import { fileURLToPath } from 'url';
import {
  checkOtsRuntime,
  createTimestamp,
  getOtsRuntimeStatus,
  verifyTimestamp
} from '../src/opentimestamps.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const originalEnv = {};
const managedEnv = [
  'NODE_ENV',
  'OTRUST_MOCK_OTS',
  'ENABLE_BLOCKCHAIN',
  'OTS_CLI_COMMAND',
  'OTS_PYTHON_COMMAND'
];

describe('OpenTimestamps runtime', () => {
  beforeAll(() => {
    for (const key of managedEnv) originalEnv[key] = process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.OTRUST_MOCK_OTS = 'false';
    process.env.ENABLE_BLOCKCHAIN = 'true';
    process.env.OTS_CLI_COMMAND = path.join(fixtures, 'fake-ots-cli.js');
    process.env.OTS_PYTHON_COMMAND = path.join(fixtures, 'fake-ots-python.js');
  });

  afterAll(() => {
    for (const key of managedEnv) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  test('checks both the CLI and digest stamper', async () => {
    await expect(checkOtsRuntime()).resolves.toEqual(expect.objectContaining({
      available: true,
      mode: 'cli',
      cliVersion: 'v0.7.2'
    }));
    expect(getOtsRuntimeStatus().available).toBe(true);
  });

  test('creates a proof from an existing SHA-256 digest', async () => {
    const digest = 'a'.repeat(64);
    const result = await createTimestamp(digest);
    expect(Buffer.from(result.ots, 'base64').toString()).toBe(`proof:${digest}`);
    expect(result.pending).toBe(true);
  });

  test('uses the supported CLI digest option for verification', async () => {
    const result = await verifyTimestamp('a'.repeat(64), Buffer.from('proof').toString('base64'));
    expect(result).toEqual({
      valid: true,
      attestations: [{
        type: 'BitcoinBlockHeaderAttestation',
        blockHeight: 900000,
        timestamp: '2026-01-01 UTC'
      }]
    });
  });

  test('rejects malformed digests before starting a subprocess', async () => {
    await expect(createTimestamp('not-a-digest')).rejects.toThrow('SHA-256 hex digest');
  });
});
