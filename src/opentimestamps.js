/**
 * OpenTimestamps integration for Bitcoin blockchain anchoring.
 *
 * The old npm OpenTimestamps package pulls in abandoned dependencies. This
 * module keeps OTRUST's storage contract but delegates real stamping,
 * upgrading, info, and verification to the maintained OpenTimestamps CLI.
 *
 * Production requirement for real Bitcoin anchoring:
 *   - install opentimestamps-client so `ots` is on PATH, or
 *   - set OTS_CLI_COMMAND to the CLI executable path.
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getDb } from './db.js';

const MOCK_OTS_PREFIX = 'OTRUST_TEST_OTS:';
const DEFAULT_OTS_TIMEOUT_MS = 120_000;

function shouldMockOts() {
  return process.env.NODE_ENV === 'test' || process.env.OTRUST_MOCK_OTS === 'true';
}

function isBlockchainDisabled() {
  return process.env.ENABLE_BLOCKCHAIN === 'false';
}

function createMockOts(hashHex) {
  return Buffer.from(`${MOCK_OTS_PREFIX}${hashHex}:${Date.now()}`, 'utf8').toString('base64');
}

function isMockOts(otsBase64) {
  try {
    return Buffer.from(otsBase64, 'base64').toString('utf8').startsWith(MOCK_OTS_PREFIX);
  } catch {
    return false;
  }
}

function otsCommand() {
  return process.env.OTS_CLI_COMMAND || process.env.OTS_CLI_PATH || 'ots';
}

function otsTimeoutMs() {
  const timeout = Number(process.env.OTS_CLI_TIMEOUT_MS || DEFAULT_OTS_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_OTS_TIMEOUT_MS;
}

async function withTempDir(callback) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'otrust-ots-'));
  try {
    return await callback(tmpDir);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function runOtsCli(args, options = {}) {
  const configuredCommand = otsCommand();
  const isNodeScript = configuredCommand.toLowerCase().endsWith('.js');
  const command = isNodeScript ? process.execPath : configuredCommand;
  const commandArgs = isNodeScript ? [configuredCommand, ...args] : args;

  return new Promise((resolve, reject) => {
    execFile(command, commandArgs, {
      cwd: options.cwd,
      timeout: otsTimeoutMs(),
      windowsHide: true,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        const reason = stderr?.trim() || stdout?.trim() || error.message;
        const hint = error.code === 'ENOENT'
          ? `OpenTimestamps CLI not found. Install opentimestamps-client or set OTS_CLI_COMMAND.`
          : reason;
        reject(new Error(hint));
        return;
      }

      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function firstSuccessfulOtsRun(commandVariants, options = {}) {
  let lastError;

  for (const args of commandVariants) {
    try {
      return await runOtsCli(args, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('OpenTimestamps CLI failed');
}

async function readFirstOtsFile(tmpDir, preferredName) {
  const preferredPath = path.join(tmpDir, preferredName);
  try {
    return await fs.readFile(preferredPath);
  } catch {
    const files = await fs.readdir(tmpDir);
    const otsFile = files.find(file => file.toLowerCase().endsWith('.ots'));
    if (!otsFile) {
      throw new Error('OpenTimestamps CLI did not produce an .ots file');
    }
    return fs.readFile(path.join(tmpDir, otsFile));
  }
}

function writeProofFile(tmpDir, otsBase64) {
  const proofPath = path.join(tmpDir, 'proof.ots');
  return fs.writeFile(proofPath, Buffer.from(otsBase64, 'base64')).then(() => proofPath);
}

function parseTimestampInfo(text) {
  const pendingCalendars = [];
  const pendingRegex = /PendingAttestation\(['"]([^'"]+)['"]\)/g;
  let pendingMatch;
  while ((pendingMatch = pendingRegex.exec(text)) !== null) {
    pendingCalendars.push(pendingMatch[1]);
  }

  const blockMatch = text.match(/BitcoinBlockHeaderAttestation\((\d+)\)/i)
    || text.match(/Bitcoin\s+block\s+(\d+)/i);
  const txMatch = text.match(/transaction id\s+([a-f0-9]{64})/i);

  return {
    confirmed: Boolean(blockMatch),
    bitcoinTx: txMatch ? txMatch[1] : null,
    blockHeight: blockMatch ? Number(blockMatch[1]) : null,
    pendingCalendars
  };
}

function parseVerifyAttestations(text) {
  const attestations = [];
  const successRegex = /Success!\s+([A-Za-z]+)\s+block\s+(\d+)\s+attests existence as of\s+(.+)/g;
  let match;

  while ((match = successRegex.exec(text)) !== null) {
    attestations.push({
      type: `${match[1]}BlockHeaderAttestation`,
      blockHeight: Number(match[2]),
      timestamp: match[3].trim()
    });
  }

  return attestations;
}

/**
 * Create an OpenTimestamps proof for a SHA-256 hash.
 * @param {string} hashHex - SHA-256 hash in hex format
 * @returns {Promise<{pending: boolean, ots: string|null}>}
 */
export async function createTimestamp(hashHex) {
  if (shouldMockOts()) {
    return {
      pending: true,
      ots: createMockOts(hashHex)
    };
  }

  if (isBlockchainDisabled()) {
    return { pending: false, ots: null };
  }

  return withTempDir(async (tmpDir) => {
    await firstSuccessfulOtsRun([
      ['stamp', '-d', hashHex, '-a', 'sha256'],
      ['stamp', '--digest', hashHex, '--algorithm', 'sha256'],
      ['stamp', '-d', hashHex]
    ], { cwd: tmpDir });

    const otsBytes = await readFirstOtsFile(tmpDir, `${hashHex}.ots`);
    return {
      pending: true,
      ots: Buffer.from(otsBytes).toString('base64')
    };
  });
}

/**
 * Upgrade a pending timestamp by asking the OTS CLI for newer attestations.
 * @param {string} otsBase64 - Base64 encoded OTS proof
 * @returns {Promise<{upgraded: boolean, ots: string, bitcoinTx?: string|null, blockHeight?: number|null, confirmed?: boolean}>}
 */
export async function upgradeTimestamp(otsBase64) {
  if (!otsBase64 || shouldMockOts() || isMockOts(otsBase64) || isBlockchainDisabled()) {
    return { upgraded: false, ots: otsBase64, confirmed: false };
  }

  try {
    return await withTempDir(async (tmpDir) => {
      const proofPath = await writeProofFile(tmpDir, otsBase64);
      await runOtsCli(['upgrade', proofPath], { cwd: tmpDir });

      const upgradedBytes = await fs.readFile(proofPath);
      const upgradedOts = Buffer.from(upgradedBytes).toString('base64');
      const info = await getTimestampInfo(upgradedOts);

      return {
        upgraded: upgradedOts !== otsBase64,
        ots: upgradedOts,
        bitcoinTx: info.bitcoinTx,
        blockHeight: info.blockHeight,
        confirmed: info.confirmed
      };
    });
  } catch (error) {
    console.error('[OTS] Upgrade error:', error.message);
    return { upgraded: false, ots: otsBase64, confirmed: false };
  }
}

/**
 * Verify a timestamp proof against a SHA-256 hash.
 * @param {string} hashHex - Original SHA-256 hash
 * @param {string} otsBase64 - Base64 encoded OTS proof
 * @returns {Promise<{valid: boolean, attestations: Array}>}
 */
export async function verifyTimestamp(hashHex, otsBase64) {
  if (isMockOts(otsBase64)) {
    return { valid: true, attestations: [] };
  }

  if (!otsBase64 || isBlockchainDisabled()) {
    return { valid: false, attestations: [] };
  }

  try {
    return await withTempDir(async (tmpDir) => {
      const proofPath = await writeProofFile(tmpDir, otsBase64);
      const result = await firstSuccessfulOtsRun([
        ['verify', proofPath, '-d', hashHex, '-a', 'sha256'],
        ['verify', proofPath, '--digest', hashHex, '--algorithm', 'sha256'],
        ['verify', proofPath, '-d', hashHex]
      ], { cwd: tmpDir });

      const output = `${result.stdout}\n${result.stderr}`;
      const attestations = parseVerifyAttestations(output);
      return {
        valid: /Success!/i.test(output) || attestations.length > 0,
        attestations
      };
    });
  } catch (error) {
    console.error('[OTS] Verify error:', error.message);
    return { valid: false, attestations: [] };
  }
}

/**
 * Get high-level info about an OTS proof.
 */
export async function getTimestampInfo(otsBase64) {
  if (isMockOts(otsBase64)) {
    return {
      confirmed: false,
      bitcoinTx: null,
      blockHeight: null,
      pendingCalendars: ['mock://opentimestamps']
    };
  }

  if (!otsBase64 || isBlockchainDisabled()) {
    return { confirmed: false, bitcoinTx: null, blockHeight: null, pendingCalendars: [] };
  }

  try {
    return await withTempDir(async (tmpDir) => {
      const proofPath = await writeProofFile(tmpDir, otsBase64);
      const result = await runOtsCli(['info', proofPath], { cwd: tmpDir });
      return parseTimestampInfo(`${result.stdout}\n${result.stderr}`);
    });
  } catch {
    return { confirmed: false, bitcoinTx: null, blockHeight: null, pendingCalendars: [] };
  }
}

let onConfirmationCallback = null;

export function setOnConfirmationCallback(callback) {
  onConfirmationCallback = callback;
}

/**
 * Background job: process pending claim and sign-request timestamps.
 */
export async function processPendingTimestamps() {
  const db = getDb();
  if (!db) return;

  const claims = db.collection('claims');

  const newClaims = await claims.find({
    $or: [
      { ots_proof: { $exists: false } },
      { ots_proof: null }
    ]
  }).limit(10).toArray();

  for (const claim of newClaims) {
    try {
      console.log(`[OTS] Stamping: ${claim.id}`);
      const result = await createTimestamp(claim.hash);

      if (!result.ots) continue;

      await claims.updateOne(
        { _id: claim._id },
        {
          $set: {
            ots_proof: result.ots,
            ots_pending: true,
            ots_submitted_at: new Date()
          }
        }
      );
      console.log(`[OTS] Submitted: ${claim.id}`);
    } catch (error) {
      console.error(`[OTS] Failed to stamp ${claim.id}:`, error.message);
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const pendingClaims = await claims.find({
    ots_pending: true,
    $or: [
      { ots_submitted_at: { $lt: oneHourAgo } },
      { ots_submitted_at: { $exists: false } }
    ]
  }).limit(20).toArray();

  for (const claim of pendingClaims) {
    try {
      const result = await upgradeTimestamp(claim.ots_proof);

      if (result.confirmed) {
        console.log(`[OTS] Confirmed: ${claim.id} at block ${result.blockHeight}`);
        await claims.updateOne(
          { _id: claim._id },
          {
            $set: {
              ots_proof: result.ots,
              ots_pending: false,
              blockchain_confirmed: true,
              blockchain_block: result.blockHeight,
              blockchain_confirmed_at: new Date()
            }
          }
        );

        if (onConfirmationCallback) {
          try {
            await onConfirmationCallback(claim, result.blockHeight);
          } catch (emailErr) {
            console.error(`[OTS] Email callback failed: ${emailErr.message}`);
          }
        }
      } else if (result.upgraded) {
        await claims.updateOne(
          { _id: claim._id },
          { $set: { ots_proof: result.ots } }
        );
      }
    } catch (error) {
      console.error(`[OTS] Failed to upgrade ${claim.id}:`, error.message);
    }
  }

  await processSignRequestTimestamps();
}

async function processSignRequestTimestamps() {
  const db = getDb();
  if (!db) return;

  const signRequests = db.collection('sign_requests');

  const totalCompleted = await signRequests.countDocuments({ status: 'completed' });
  const totalPending = await signRequests.countDocuments({ status: 'completed', ots_pending: true });
  const totalConfirmed = await signRequests.countDocuments({ status: 'completed', blockchain_confirmed: true });
  console.log(`[OTS-SIGN] Stats: ${totalCompleted} completed, ${totalPending} pending OTS, ${totalConfirmed} confirmed`);

  const newSignRequests = await signRequests.find({
    status: 'completed',
    ots_pending: true,
    $or: [
      { ots_proof: { $exists: false } },
      { ots_proof: null }
    ]
  }).limit(10).toArray();

  console.log(`[OTS-SIGN] Found ${newSignRequests.length} sign requests needing OTS submission`);

  for (const sr of newSignRequests) {
    try {
      console.log(`[OTS-SIGN] Stamping: ${sr.id} (hash: ${sr.package_hash?.substring(0, 16)}...)`);
      const result = await createTimestamp(sr.package_hash);

      if (!result.ots) continue;

      await signRequests.updateOne(
        { _id: sr._id },
        {
          $set: {
            ots_proof: result.ots,
            ots_submitted_at: new Date()
          }
        }
      );
      console.log(`[OTS-SIGN] Submitted: ${sr.id}`);
    } catch (error) {
      console.error(`[OTS-SIGN] Failed to stamp ${sr.id}:`, error.message);
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const pendingSignRequests = await signRequests.find({
    status: 'completed',
    ots_pending: true,
    ots_proof: { $exists: true, $ne: null, $type: 'string' },
    $or: [
      { ots_submitted_at: { $lt: oneHourAgo } },
      { ots_submitted_at: { $exists: false } }
    ]
  }).limit(20).toArray();

  console.log(`[OTS-SIGN] Found ${pendingSignRequests.length} sign requests to check for upgrade`);

  for (const sr of pendingSignRequests) {
    try {
      console.log(`[OTS-SIGN] Checking upgrade: ${sr.id} (submitted: ${sr.ots_submitted_at?.toISOString() || 'unknown'})`);
      const result = await upgradeTimestamp(sr.ots_proof);

      if (result.confirmed) {
        console.log(`[OTS-SIGN] CONFIRMED: ${sr.id} at block ${result.blockHeight}`);
        await signRequests.updateOne(
          { _id: sr._id },
          {
            $set: {
              ots_proof: result.ots,
              ots_pending: false,
              blockchain_confirmed: true,
              blockchain_block: result.blockHeight,
              blockchain_confirmed_at: new Date()
            }
          }
        );

        if (onSignatureConfirmationCallback) {
          console.log(`[OTS-SIGN] Sending confirmation emails for ${sr.id} to ${sr.parties?.length || 0} parties...`);
          try {
            await onSignatureConfirmationCallback(sr, result.blockHeight);
            console.log(`[OTS-SIGN] Emails sent for ${sr.id}`);
          } catch (emailErr) {
            console.error(`[OTS-SIGN] Email callback failed for ${sr.id}:`, emailErr.message);
          }
        } else {
          console.warn(`[OTS-SIGN] No email callback registered. Emails not sent for ${sr.id}`);
        }
      } else if (result.upgraded) {
        console.log(`[OTS-SIGN] Upgraded, not yet confirmed: ${sr.id}`);
        await signRequests.updateOne(
          { _id: sr._id },
          { $set: { ots_proof: result.ots } }
        );
      } else {
        console.log(`[OTS-SIGN] No change: ${sr.id}`);
      }
    } catch (error) {
      console.error(`[OTS-SIGN] Failed to upgrade ${sr.id}:`, error.message);
    }
  }
}

let onSignatureConfirmationCallback = null;

export function setOnSignatureConfirmationCallback(callback) {
  onSignatureConfirmationCallback = callback;
}

export function startOtsProcessor(intervalMs = 5 * 60 * 1000) {
  processPendingTimestamps().catch(console.error);

  const timer = setInterval(() => {
    processPendingTimestamps().catch(console.error);
  }, intervalMs);
  timer.unref?.();

  console.log('[OTS] Background processor started');
  return timer;
}
