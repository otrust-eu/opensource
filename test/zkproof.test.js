import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { poseidon4 } from 'poseidon-lite';
import * as snarkjs from 'snarkjs';
import {
  getZkArtifactStatus,
  parseGroth16PublicSignals,
  verifyGroth16Proof
} from '../src/zkproof.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

describe('ZK proof verification', () => {
  jest.setTimeout(30000);

  test('verifies a valid published proof and rejects tampered public signals', async () => {
    const secret = 123456789012345678901234567890n;
    const input = {
      birthYear: 1990,
      birthMonth: 5,
      birthDay: 15,
      secret: secret.toString(),
      currentYear: 2026,
      currentMonth: 1,
      currentDay: 6,
      minAge: 18,
      identityCommitment: poseidon4([1990, 5, 15, secret]).toString()
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      path.join(root, 'web/circuits/ageProof.wasm'),
      path.join(root, 'web/circuits/ageProof_final.zkey')
    );

    await expect(verifyGroth16Proof('age', proof, publicSignals)).resolves.toBe(true);

    const tamperedSignals = [...publicSignals];
    tamperedSignals[1] = (BigInt(tamperedSignals[1]) + 1n).toString();
    await expect(verifyGroth16Proof('age', proof, tamperedSignals)).resolves.toBe(false);
  });

  test('reports the legacy ceremony as not production-ready', () => {
    expect(getZkArtifactStatus()).toEqual(expect.objectContaining({
      status: 'legacy-development',
      productionReady: false
    }));
  });

  test('derives age metadata from current public signals and rejects stale dates', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const current = ['1', '2026', '7', '23', '18', '9'];

    expect(parseGroth16PublicSignals('age', current, now)).toEqual({
      commitment: '9',
      statement: 'Self-attested age >= 18',
      metadata: {
        minAge: 18,
        proofDate: '2026-07-23',
        credentialBinding: 'none',
        selfAttested: true
      }
    });
    expect(parseGroth16PublicSignals(
      'age',
      ['1', '2026', '7', '22', '18', '9'],
      now
    )).toBeNull();
  });

  test('browser Poseidon bundle matches the circuit helper', () => {
    const source = fs.readFileSync(path.join(root, 'web/js/poseidon-lite.js'), 'utf8');
    const context = {
      window: {},
      atob: (value) => Buffer.from(value, 'base64').toString('binary')
    };
    vm.runInNewContext(source, context);

    const inputs = [1990n, 5n, 15n, 123456789n];
    expect(context.window.PoseidonLite.poseidon4(inputs).toString())
      .toBe(poseidon4(inputs).toString());
  });
});
