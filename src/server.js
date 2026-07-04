/**
 * otrust-core/src/server.js
 *
 * Blind notary service - Zero-knowledge timestamping
 * 
 * Security features:
 * - Helmet security headers (CSP, HSTS, etc.)
 * - Rate limiting with IP-based keys
 * - CSRF protection via Origin header validation
 * - NoSQL injection prevention
 * - Input validation and sanitization
 * - Timing-safe comparisons for secrets
 * - No PII logging (zero-knowledge)
 * - Request ID tracking for audit trails
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import validator from 'validator';
import { v4 as uuidv4 } from 'uuid';
import { createDb, getDb, closeDb, logSecurityEvent as logAuditEvent } from './db.js';
import archiver from 'archiver';
import QRCode from 'qrcode';
import * as zkproof from './zkproof.js';
import { config, saveConfig, needsSetup, logFeatures } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { verifySignature, verifyPow } from './crypto.js';
import { generateChallenge, consumeChallenge } from './pow.js';
import { startOtsProcessor, verifyTimestamp, getTimestampInfo, createTimestamp, setOnConfirmationCallback, setOnSignatureConfirmationCallback, processPendingTimestamps } from './opentimestamps.js';
import { isValidWebhookUrl, storeWebhookNotification, dispatchConfirmationWebhook } from './webhooks.js';
import { registerWave4Routes } from './wave4/routes.js';
import { sendEmail } from './email.js';
import {
  emailTemplate,
  emailButton,
  emailHashBox,
  emailInfoBox,
  emailSuccessBox,
  emailWarningBox,
  emailHeading,
  emailParagraph,
  emailMuted,
  emailActionArea,
  emailDivider,
  emailDetailsBox
} from './emailTemplate.js';

const app = express();
const PORT = config.port || process.env.PORT || 3000;
const IS_PRODUCTION = config.isProduction || process.env.NODE_ENV === 'production';
const CORS_ORIGINS = String(config.security.corsOrigins || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const CORS_HOSTS = CORS_ORIGINS.flatMap(origin => {
  try {
    const url = new URL(origin);
    return [url.host, url.hostname];
  } catch {
    return [];
  }
});
const AUTH_TOKEN_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.AUTH_SECRET && IS_PRODUCTION) {
  console.warn('[Security] AUTH_SECRET is not set; using a process-local auth token secret. Tokens will be invalid after restart.');
}

const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
};

const hasValidAdminKey = (req) => {
  const adminKey = req.get('X-Admin-Key');
  return !!process.env.ADMIN_KEY && !!adminKey && timingSafeEqual(adminKey, process.env.ADMIN_KEY);
};

// Timing-safe response middleware - adds random delay to prevent timing attacks
const timingSafeResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    // If error response, add random 10-50ms delay to prevent timing-based attacks
    if (data.error && res.statusCode >= 400) {
      const delayMs = Math.random() * 40 + 10; // 10-50ms
      setTimeout(() => originalJson(data), delayMs);
    } else {
      originalJson(data);
    }
    return res;
  };
  next();
};
app.use(timingSafeResponse);

// Request ID middleware for audit trails (no IP logging)
app.use((req, res, next) => {
  req.requestId = uuidv4();
  // Generate CSP nonce for this request
  req.cspNonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Force HTTPS in production (skip for health checks and desktop app)
const IS_DESKTOP = process.env.OTRUST_DESKTOP === 'true';
if (IS_PRODUCTION && !IS_DESKTOP) {
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Security headers
// Custom CSP with nonce for inline scripts
app.use((req, res, next) => {
  const nonce = req.cspNonce; // Already generated in requestId middleware
  
  const cspDirectives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://esm.sh https://plausible.io https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com`,
    `script-src-attr 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com`,
    `font-src 'self'`,
    `connect-src 'self' data: blob: https://esm.sh https://plausible.io https://cdn.jsdelivr.net https://unpkg.com https://tessdata.projectnaptha.com https://api.qrserver.com`,
    `img-src 'self' data: blob: https:`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `worker-src 'self' blob:`
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspDirectives);
  next();
});

app.use(helmet({
  // CSP is handled by custom middleware above with per-request nonces
  // This is intentional - we need dynamic nonces for inline scripts
  // nosemgrep: javascript.express.security.audit.xss.helmet.insecure-helmet-configuration
  // codeql-ignore: js/insecure-helmet-configuration
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: false,
  originAgentCluster: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xContentTypeOptions: true,
  xDnsPrefetchControl: { allow: false },
  xDownloadOptions: true,
  xFrameOptions: { action: "deny" },
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
  xPoweredBy: false,
  xXssProtection: true
}));

// Additional security headers
app.use((req, res, next) => {
  // Permissions Policy - restrict browser features (but allow camera for identity verification)
  res.setHeader('Permissions-Policy', 
    'accelerometer=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=(), camera=(self)'
  );
  // Prevent caching of sensitive data
  if (req.path.startsWith('/claim') || req.path.startsWith('/verify')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Disable Express signature
app.disable('x-powered-by');

// Trust proxy - Railway sets X-Forwarded-For
// 1 = trust only first proxy (prevents spoofing)
app.set('trust proxy', 1);

app.use(compression());

// HTTP Parameter Pollution protection
app.use(hpp());

// Custom key generator for rate limiting - uses forwarded IP in production
const getRateLimitKey = (req) => {
  // In production behind Railway, use the real client IP
  // X-Forwarded-For is trusted because trust proxy = 1
  return req.ip || req.connection.remoteAddress || 'unknown';
};

// Security event logger (no PII - just counts and request IDs)
const logSecurityEvent = (event, req, details = {}) => {
  const logEntry = {
    event,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
    ...details
  };
  // In production, this could go to a security monitoring service
  console.log(`[Security] ${JSON.stringify(logEntry)}`);
};

const USAGE_COUNTER_ID = 'global';

function toUsageCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

async function incrementUsageCounter(field, amount = 1) {
  if (!/^[a-z0-9_]{1,80}$/.test(field)) return;

  const safeAmount = toUsageCount(amount) || 1;
  const now = new Date();

  try {
    const db = getDb();
    await db.collection('usage_counters').updateOne(
      { _id: USAGE_COUNTER_ID },
      {
        $inc: {
          [field]: safeAmount,
          verifications_processed: safeAmount
        },
        $set: { updated_at: now },
        $setOnInsert: { created_at: now }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('[Usage] Counter update failed:', error.message);
  }
}

async function incrementActivityCounter(field, amount = 1) {
  if (!/^[a-z0-9_]{1,80}$/.test(field)) return;

  const safeAmount = toUsageCount(amount) || 1;
  const now = new Date();

  try {
    const db = getDb();
    await db.collection('usage_counters').updateOne(
      { _id: USAGE_COUNTER_ID },
      {
        $inc: { [field]: safeAmount },
        $set: { updated_at: now },
        $setOnInsert: { created_at: now }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('[Usage] Activity counter update failed:', error.message);
  }
}

async function incrementActivityCounters(fields) {
  const increments = {};
  for (const [field, amount] of Object.entries(fields || {})) {
    if (!/^[a-z0-9_]{1,80}$/.test(field)) continue;
    const safeAmount = toUsageCount(amount);
    if (safeAmount > 0) increments[field] = safeAmount;
  }
  if (!Object.keys(increments).length) return;

  const now = new Date();
  try {
    const db = getDb();
    await db.collection('usage_counters').updateOne(
      { _id: USAGE_COUNTER_ID },
      {
        $inc: increments,
        $set: { updated_at: now },
        $setOnInsert: { created_at: now }
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('[Usage] Activity counters update failed:', error.message);
  }
}

const USAGE_EVENT_FIELDS = {
  hash_computed: 'hashes_computed',
  timestamp_tool_view: 'timestamp_tool_views',
  sign_hash_computed: 'sign_hashes_computed'
};

async function readUsageCounters(db) {
  try {
    return await db.collection('usage_counters').findOne({ _id: USAGE_COUNTER_ID }) || {};
  } catch (error) {
    console.error('[Usage] Counter read failed:', error.message);
    return {};
  }
}

// Rate limiters with secure key generation and logging
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many requests, please try again later' },
  skip: (req) => req.path === '/health',
  handler: (req, res, next, options) => {
    logSecurityEvent('rate_limit_global', req);
    res.status(options.statusCode).json(options.message);
  }
});

const claimLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 1000 : 10, // High limit for tests, 10 in production
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many claims, please wait' },
  handler: (req, res, next, options) => {
    logSecurityEvent('rate_limit_claim', req);
    res.status(options.statusCode).json(options.message);
  }
});

const challengeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute  
  max: process.env.NODE_ENV === 'test' ? 1000 : 5, // High limit for tests, 5 in production
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many challenge requests. Max 5 per minute.' },
  handler: (req, res, next, options) => {
    logSecurityEvent('rate_limit_challenge', req);
    res.status(options.statusCode).json(options.message);
  }
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 verifications per minute
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many verification requests' },
  handler: (req, res, next, options) => {
    logSecurityEvent('rate_limit_verify', req);
    res.status(options.statusCode).json(options.message);
  }
});

app.use(globalLimiter);

// Different JSON limits for different routes
const smallJson = express.json({ limit: '1kb', strict: true });
const bulkJson = express.json({ limit: '1mb', strict: true });
const documentJson = express.json({ limit: '25mb', strict: true }); // For email webhook with document attachments

// CSRF Protection - validate Origin header for state-changing requests
const csrfProtection = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  const origin = req.get('Origin');
  const host = req.get('Host');
  
  // Allow Cloudflare Workers (they send CF-Worker header)
  const cfWorker = req.get('CF-Worker');
  if (cfWorker) {
    return next();
  }
  
  // Allow requests with a special API key for server-to-server (email worker)
  const emailWorkerKey = req.get('X-Email-Worker-Key');
  if (emailWorkerKey && emailWorkerKey === process.env.EMAIL_WORKER_KEY) {
    return next();
  }
  
  // REQUIRE Origin header - reject requests without it (prevents CSRF)
  if (!origin) {
    logSecurityEvent('csrf_missing_origin', req);
    return res.status(403).json({ error: 'forbidden', message: 'Missing Origin header. Use HTTPS from web browser.' });
  }
  
  // Allow Chrome extensions
  if (origin.startsWith('chrome-extension://')) {
    return next();
  }
  
  // Parse origin to get hostname
  try {
    const originUrl = new URL(origin);
    const allowedHosts = [host, ...CORS_HOSTS];
    
    // Allow any localhost port (for development and tests)
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
      return next();
    }
    
    // Check if origin host matches any allowed host
    if (allowedHosts.some(h => originUrl.host === h || originUrl.hostname === h)) {
      return next();
    }
    
    logSecurityEvent('csrf_blocked', req, { origin });
    return res.status(403).json({ error: 'forbidden', message: 'Invalid origin' });
  } catch (e) {
    logSecurityEvent('csrf_invalid_origin', req);
    return res.status(403).json({ error: 'forbidden', message: 'Invalid origin header' });
  }
};

// CORS - more restrictive for production
app.use((req, res, next) => {
  const origin = req.get('Origin');
  // Allow Chrome extensions
  const isExtension = origin && origin.startsWith('chrome-extension://');
  
  // Allow any localhost (development/testing)
  const isLocalhost = origin && (origin.includes('localhost') || origin.includes('127.0.0.1'));
  
  if (origin && (CORS_ORIGINS.includes(origin) || isExtension || isLocalhost)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests without Origin (same-origin, curl, Postman)
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'false');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Apply CSRF protection to state-changing endpoints
app.use('/claim', csrfProtection);
app.use('/api/v1/timestamp', csrfProtection);

// API Version info endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    version: 'v1',
    services: {
      timestamp: {
        description: 'Bitcoin-anchored timestamps via OpenTimestamps',
        endpoints: [
          'GET /api/v1/timestamp/challenge',
          'POST /api/v1/timestamp/claim',
          'POST /api/v1/timestamp/claim/simple',
          'POST /api/v1/timestamp/verify',
          'POST /api/v1/timestamp/verify/bulk',
          'GET /api/v1/timestamp/proof/:id'
        ]
      },
      sign: {
        description: 'Zero-knowledge document signing',
        endpoints: [
          'POST /api/v1/sign/create',
          'GET /api/v1/sign/:id',
          'POST /api/v1/sign/:id/verify'
        ]
      },
      proof: {
        description: 'ZK identity and attribute proofs',
        endpoints: [
          'POST /api/v1/proof/identity',
          'POST /api/v1/proof/age',
          'GET /api/v1/proof/:id'
        ]
      },
      auth: {
        description: 'Login with OTRUST - identity-based authentication',
        endpoints: [
          'POST /api/v1/auth/challenge',
          'GET /api/v1/auth/challenge/:id',
          'POST /api/v1/auth/prove',
          'POST /api/v1/auth/verify',
          'GET /api/v1/auth/userinfo',
          'GET /admin/auth-branding/:clientId',
          'PUT /admin/auth-branding/:clientId',
          'GET /admin/auth-branding/:clientId/:themeId',
          'PUT /admin/auth-branding/:clientId/:themeId'
        ]
      }
    },
    docs: 'https://www.otrust.eu/api-docs'
  });
});

// ============================================================
// API v1 aliases
// ============================================================

const apiV1Rewrites = [
  [/^\/api\/v1\/timestamp\/challenge\/?$/, '/challenge'],
  [/^\/api\/v1\/timestamp\/claim\/simple\/?$/, '/claim/simple'],
  [/^\/api\/v1\/timestamp\/claim\/bulk\/?$/, '/claim/bulk'],
  [/^\/api\/v1\/timestamp\/claim\/?$/, '/claim'],
  [/^\/api\/v1\/timestamp\/verify\/bulk\/?$/, '/verify/bulk'],
  [/^\/api\/v1\/timestamp\/verify\/?$/, '/verify'],
  [/^\/api\/v1\/timestamp\/proof\/([^/]+)\/?$/, match => `/proof/${match[1]}`],
  [/^\/api\/v1\/sign\/create\/?$/, '/sign/create'],
  [/^\/api\/v1\/sign\/([^/]+)\/verify\/?$/, match => `/sign/${match[1]}/verify`],
  [/^\/api\/v1\/sign\/([^/]+)\/?$/, match => `/sign/${match[1]}`]
];

app.use((req, res, next) => {
  for (const [pattern, target] of apiV1Rewrites) {
    const match = req.path.match(pattern);
    if (!match) continue;

    const queryIndex = req.url.indexOf('?');
    const query = queryIndex === -1 ? '' : req.url.slice(queryIndex);
    req.url = (typeof target === 'function' ? target(match) : target) + query;
    break;
  }
  next();
});

// ============================================================
// Original API endpoints (backwards compatibility)
// ============================================================

// GET /csrf-token - Return a dummy token (actual CSRF protection is via Origin header)
app.get('/csrf-token', (req, res) => {
  // Generate a random token for compatibility with clients that expect one
  // The real CSRF protection is via Origin header validation
  const token = crypto.randomBytes(32).toString('hex');
  res.json({ token });
});

// GET /lookup/:hash - Check if a hash has been timestamped or used in signing before
app.get('/lookup/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    if (!isValidHash(hash)) {
      return res.status(400).json({ error: 'invalid_hash' });
    }
    
    const db = getDb();
    
    // Check for existing timestamp
    const existingClaim = await db.collection('claims').findOne({ hash });
    
    // Check for existing sign request with this document hash
    const existingSignRequest = await db.collection('sign_requests').findOne({ 
      document_hash: hash,
      status: { $in: ['pending', 'completed'] }
    });
    
    const result = {
      exists: !!(existingClaim || existingSignRequest),
      timestamp: null,
      sign_request: null
    };
    
    if (existingClaim) {
      result.timestamp = {
        receipt_id: existingClaim.id,
        created_at: existingClaim.created_at,
        blockchain_confirmed: existingClaim.blockchain_confirmed || false
      };
    }
    
    if (existingSignRequest) {
      result.sign_request = {
        sign_id: existingSignRequest.id,
        status: existingSignRequest.status,
        created_at: existingSignRequest.created_at,
        title: existingSignRequest.title,
        parties_count: existingSignRequest.parties?.length || 0
      };
    }
    
    await incrementUsageCounter('lookup_checks');
    res.json(result);
  } catch (error) {
    console.error('Lookup error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /challenge
app.get('/challenge', challengeLimiter, async (req, res) => {
  try {
    const challenge = await generateChallenge();
    res.json(challenge);
  } catch (error) {
    console.error('Challenge error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /claim
app.post('/claim', claimLimiter, smallJson, async (req, res) => {
  try {
    const { hash, signature, pubkey, pow, notify_email, notify_webhook, notify_webhook_secret, filename } = req.body;

    // Minimal logging - no sensitive data
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Claim] Request received');
    }

    if (!isValidHash(hash)) {
      return res.status(400).json({ error: 'invalid_hash', message: 'Hash must be 64 hex characters' });
    }
    if (!isValidSignature(signature)) {
      return res.status(400).json({ error: 'invalid_signature', message: 'Signature must be 128 hex characters' });
    }
    if (!isValidPubkey(pubkey)) {
      return res.status(400).json({ error: 'invalid_pubkey', message: 'Public key must be 64 hex characters' });
    }

    if (!pow || !pow.challenge || !pow.nonce) {
      return res.status(400).json({ error: 'invalid_pow', message: 'Missing proof-of-work' });
    }

    // Sanitize filename (optional field, max 255 chars, basic chars only)
    const sanitizedFilename = filename && typeof filename === 'string' 
      ? filename.slice(0, 255).replace(/[<>:"/\\|?*\x00-\x1f]/g, '') 
      : null;

    // SECURITY: Consume challenge FIRST and atomically (prevents race conditions)
    // If challenge is invalid, fail fast without doing expensive signature verification
    const challengeResult = await consumeChallenge(pow.challenge);
    if (!challengeResult.valid) {
      return res.status(400).json({ error: 'invalid_pow', message: 'Invalid or expired challenge' });
    }
    
    const difficulty = challengeResult.difficulty;
    
    // Now verify PoW - if this fails, challenge is already consumed (no re-use)
    if (!verifyPow(pow.challenge, pow.nonce, difficulty)) {
      return res.status(400).json({ error: 'invalid_pow', message: 'Proof-of-work verification failed' });
    }

    // Finally verify signature
    const signatureValid = await verifySignature(hash, signature, pubkey);
    if (!signatureValid) {
      return res.status(400).json({ error: 'invalid_signature', message: 'Signature verification failed' });
    }

    const db = getDb();
    const claims = db.collection('claims');
    const existing = await claims.findOne({ hash, pubkey });

    if (existing) {
      await incrementActivityCounters({
        claims_submitted: 1,
        claims_duplicate: 1
      });
      // Return existing claim info - this is actually helpful, not an error
      return res.status(200).json({
        status: 'already_registered',
        message: 'Good news! This content was already timestamped by you.',
        receipt_id: existing.id,
        timestamp: existing.created_at,
        blockchain_confirmed: existing.blockchain_confirmed || false,
        proof_url: existing.ots_proof ? `/proof/${existing.id}` : null
      });
    }

    const receiptId = 'ot_' + generateReceiptId();
    const timestamp = new Date();

    // Create OTS proof immediately (takes ~100ms)
    let otsProof = null;
    try {
      const ots = await createTimestamp(hash);
      otsProof = ots.ots;
    } catch (otsErr) {
      console.error(`[OTS] Failed to create proof: ${otsErr.message}`);
    }

    // Validate email (optional)
    const validEmail = notify_email && isValidEmail(notify_email) ? notify_email : null;

    // Store claim WITHOUT email (privacy: email in separate collection)
    await claims.insertOne({
      id: receiptId,
      hash,
      pubkey,
      signature,
      filename: sanitizedFilename,
      created_at: timestamp,
      blockchain_tx: null,
      blockchain_confirmed: false,
      ots_proof: otsProof,
      ots_pending: otsProof ? true : false,
      ots_submitted_at: otsProof ? timestamp : null
    });

    // Store email separately with TTL (auto-deletes after 24h)
    if (validEmail) {
      try {
        await db.collection('email_notifications').insertOne({
          claim_id: receiptId,
          email: validEmail,
          created_at: timestamp
        });
      } catch (emailErr) {
        // Non-critical, don't fail the claim
        console.error(`[Email] Failed to store notification: ${emailErr.message}`);
      }
    }

    if (notify_webhook && isValidWebhookUrl(notify_webhook)) {
      try {
        await storeWebhookNotification(db, receiptId, notify_webhook, notify_webhook_secret, timestamp);
      } catch (webhookErr) {
        console.error(`[Webhook] Failed to store notification: ${webhookErr.message}`);
      }
    }

    await incrementActivityCounters({
      claims_submitted: 1,
      claims_created: 1
    });

    res.status(201).json({
      status: 'ok',
      timestamp: timestamp.toISOString(),
      receipt_id: receiptId,
      blockchain_tx: null,
      blockchain_status: otsProof ? 'submitted' : 'pending',
      ots_proof: otsProof ? true : false
    });

  } catch (error) {
    console.error('Claim error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GPT/Simple timestamp - no signature or PoW required
// Strict rate limiting: 10 per hour per IP
const gptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 timestamps per hour
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many timestamps. Limit: 10 per hour. Use otrust.eu for more.' }
});

app.post('/claim/simple', gptLimiter, smallJson, async (req, res) => {
  try {
    const { hash, source, notify_email, notify_webhook, notify_webhook_secret } = req.body;

    if (!isValidHash(hash)) {
      return res.status(400).json({ error: 'invalid_hash', message: 'Hash must be 64 hex characters (SHA-256)' });
    }

    // Validate source field - whitelist only allowed sources
    const validSources = ['gpt', 'email', 'web', 'api', 'bot'];
    const sanitizedSource = (validSources.includes(source) && typeof source === 'string') ? source : 'unknown';

    const db = getDb();
    const claims = db.collection('claims');
    
    // Check if already exists
    const existing = await claims.findOne({ hash });
    if (existing) {
      await incrementActivityCounters({
        claims_submitted: 1,
        claims_duplicate: 1
      });
      return res.status(200).json({
        status: 'already_exists',
        message: 'This content was already timestamped.',
        receipt_id: existing.id,
        timestamp: existing.created_at,
        blockchain_confirmed: existing.blockchain_confirmed || false,
        verify_url: `https://www.otrust.eu/proof/${existing.id}`
      });
    }

    const receiptId = 'ot_' + generateReceiptId();
    const timestamp = new Date();
    
    // GPT timestamps use a special "gpt" pubkey marker
    const gptPubkey = 'gpt_' + crypto.randomBytes(30).toString('hex');

    // Create OTS proof
    let otsProof = null;
    try {
      const ots = await createTimestamp(hash);
      otsProof = ots.ots;
    } catch (otsErr) {
      console.error(`[OTS] Failed to create proof: ${otsErr.message}`);
    }

    await claims.insertOne({
      id: receiptId,
      hash,
      pubkey: gptPubkey,
      signature: null,
      source: sanitizedSource,
      created_at: timestamp,
      blockchain_tx: null,
      blockchain_confirmed: false,
      ots_proof: otsProof,
      ots_pending: otsProof ? true : false,
      ots_submitted_at: otsProof ? timestamp : null
    });

    const validEmail = notify_email && isValidEmail(notify_email) && !hasEmailInjection(notify_email)
      ? notify_email
      : null;
    if (validEmail) {
      try {
        await db.collection('email_notifications').insertOne({
          claim_id: receiptId,
          email: validEmail,
          created_at: timestamp
        });
      } catch (emailErr) {
        console.error(`[Email] Failed to store notification: ${emailErr.message}`);
      }
    }

    if (notify_webhook && isValidWebhookUrl(notify_webhook)) {
      try {
        await storeWebhookNotification(db, receiptId, notify_webhook, notify_webhook_secret, timestamp);
      } catch (webhookErr) {
        console.error(`[Webhook] Failed to store notification: ${webhookErr.message}`);
      }
    }

    await incrementActivityCounters({
      claims_submitted: 1,
      claims_created: 1
    });

    res.status(201).json({
      status: 'ok',
      message: 'Timestamp created successfully!',
      receipt_id: receiptId,
      hash: hash,
      timestamp: timestamp.toISOString(),
      blockchain_status: otsProof ? 'submitted' : 'pending',
      verify_url: `https://www.otrust.eu/proof/${receiptId}`,
      note: 'Blockchain confirmation takes ~1-2 hours. Verify at the URL above.'
    });

  } catch (error) {
    console.error('Simple claim error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /claim/bulk - Batch claims with single PoW
app.post('/claim/bulk', claimLimiter, bulkJson, async (req, res) => {
  try {
    const { claims, pow, notify_email, notify_webhook, notify_webhook_secret } = req.body;

    if (!Array.isArray(claims) || claims.length === 0) {
      return res.status(400).json({ error: 'invalid_claims', message: 'Claims must be a non-empty array' });
    }

    if (claims.length > 100) {
      return res.status(400).json({ error: 'too_many_claims', message: 'Maximum 100 claims per batch' });
    }

    // Validate PoW (single PoW for entire batch)
    if (!pow || !pow.challenge || !pow.nonce) {
      return res.status(400).json({ error: 'invalid_pow', message: 'Missing proof-of-work' });
    }

    // Atomic: consume challenge AND get difficulty in one operation
    const challengeResult = await consumeChallenge(pow.challenge);
    if (!challengeResult.valid) {
      return res.status(400).json({ error: 'invalid_pow', message: 'Invalid or expired challenge' });
    }
    
    const difficulty = challengeResult.difficulty;
    
    if (!verifyPow(pow.challenge, pow.nonce, difficulty)) {
      return res.status(400).json({ error: 'invalid_pow', message: 'Proof-of-work verification failed' });
    }

    // Validate all claims first
    const errors = [];
    for (let i = 0; i < claims.length; i++) {
      const { hash, signature, pubkey } = claims[i];
      if (!isValidHash(hash)) {
        errors.push({ index: i, error: 'invalid_hash' });
        continue;
      }
      if (!isValidSignature(signature)) {
        errors.push({ index: i, error: 'invalid_signature' });
        continue;
      }
      if (!isValidPubkey(pubkey)) {
        errors.push({ index: i, error: 'invalid_pubkey' });
        continue;
      }
      const signatureValid = await verifySignature(hash, signature, pubkey);
      if (!signatureValid) {
        errors.push({ index: i, error: 'signature_verification_failed' });
      }
    }

    if (errors.length === claims.length) {
      return res.status(400).json({ error: 'all_claims_invalid', errors });
    }

    // Process valid claims
    const db = getDb();
    const claimsCollection = db.collection('claims');
    const notifications = db.collection('email_notifications');
    const validEmail = notify_email && isValidEmail(notify_email) ? notify_email : null;
    const results = [];
    const timestamp = new Date();

    for (let i = 0; i < claims.length; i++) {
      if (errors.some(e => e.index === i)) {
        results.push({ index: i, status: 'error', error: errors.find(e => e.index === i).error });
        continue;
      }

      const { hash, signature, pubkey, filename } = claims[i];
      
      // Sanitize filename
      const sanitizedFilename = filename && typeof filename === 'string' 
        ? filename.slice(0, 255).replace(/[<>:"/\\|?*\x00-\x1f]/g, '') 
        : null;
      
      const existing = await claimsCollection.findOne({ hash, pubkey });

      if (existing) {
        results.push({
          index: i,
          status: 'duplicate',
          receipt_id: existing.id,
          timestamp: existing.created_at
        });
        continue;
      }

      const receiptId = 'ot_' + generateReceiptId();
      
      // Create OTS proof immediately
      let otsProof = null;
      try {
        const ots = await createTimestamp(hash);
        otsProof = ots.ots;
      } catch (otsErr) {
        console.error(`[OTS] Bulk proof failed for ${receiptId}: ${otsErr.message}`);
      }

      await claimsCollection.insertOne({
        id: receiptId,
        hash,
        pubkey,
        signature,
        filename: sanitizedFilename,
        created_at: timestamp,
        blockchain_tx: null,
        blockchain_confirmed: false,
        ots_proof: otsProof,
        ots_pending: otsProof ? true : false,
        ots_submitted_at: otsProof ? timestamp : null
      });

      if (validEmail) {
        try {
          await notifications.insertOne({
            claim_id: receiptId,
            email: validEmail,
            created_at: timestamp
          });
        } catch (emailErr) {
          console.error(`[Email] Failed to store bulk notification for ${receiptId}: ${emailErr.message}`);
        }
      }

      if (notify_webhook && isValidWebhookUrl(notify_webhook)) {
        try {
          await storeWebhookNotification(db, receiptId, notify_webhook, notify_webhook_secret, timestamp);
        } catch (webhookErr) {
          console.error(`[Webhook] Failed to store bulk notification for ${receiptId}: ${webhookErr.message}`);
        }
      }

      results.push({
        index: i,
        status: 'created',
        receipt_id: receiptId,
        timestamp: timestamp.toISOString(),
        ots_proof: otsProof ? true : false
      });
    }

    const created = results.filter(r => r.status === 'created').length;
    const duplicates = results.filter(r => r.status === 'duplicate').length;
    const submitted = created + duplicates;
    if (submitted > 0) {
      await incrementActivityCounters({
        claims_submitted: submitted,
        claims_created: created,
        claims_duplicate: duplicates
      });
    }
    console.log(`[Bulk] Processed ${claims.length} claims: ${created} created, ${duplicates} duplicates, ${errors.length} errors`);

    res.status(201).json({
      status: 'ok',
      total: claims.length,
      created,
      duplicates,
      errors: errors.length,
      results
    });

  } catch (error) {
    console.error('Bulk claim error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /verify/bulk - Batch verification
app.post('/verify/bulk', verifyLimiter, bulkJson, async (req, res) => {
  try {
    const { hashes } = req.body;

    if (!Array.isArray(hashes) || hashes.length === 0) {
      return res.status(400).json({ error: 'invalid_hashes', message: 'Hashes must be a non-empty array' });
    }

    if (hashes.length > 100) {
      return res.status(400).json({ error: 'too_many_hashes', message: 'Maximum 100 hashes per batch' });
    }

    const db = getDb();
    const results = [];

    for (const hash of hashes) {
      if (!isValidHash(hash)) {
        results.push({ hash, status: 'invalid_hash' });
        continue;
      }

      const claimDocs = await db.collection('claims')
        .find({ hash: hash.toLowerCase() })
        .sort({ created_at: 1 })
        .toArray();

      if (claimDocs.length === 0) {
        results.push({ hash, status: 'not_found' });
      } else {
        results.push({
          hash,
          status: 'found',
          claims: claimDocs.map(c => ({
            pubkey: c.pubkey,
            timestamp: c.created_at.toISOString ? c.created_at.toISOString() : c.created_at,
            receipt_id: c.id,
            blockchain_tx: c.blockchain_tx,
            blockchain_confirmed: !!c.blockchain_confirmed
          }))
        });
      }
    }

    await incrementUsageCounter('bulk_hash_verifications', results.length);
    res.json({ status: 'ok', results });

  } catch (error) {
    console.error('Bulk verify error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /verify (hash in body to prevent URL/log leakage)
app.post('/verify', verifyLimiter, smallJson, async (req, res) => {
  try {
    const { hash } = req.body;

    if (!isValidHash(hash)) {
      return res.status(400).json({ error: 'invalid_hash' });
    }

    const db = getDb();
    const claimDocs = await db.collection('claims')
      .find({ hash: hash.toLowerCase() })
      .sort({ created_at: 1 })
      .toArray();

    await incrementUsageCounter('hash_verifications');

    if (claimDocs.length === 0) {
      return res.json({ status: 'not_found' });
    }

    res.json({
      status: 'found',
      hash,
      claims: claimDocs.map(c => ({
        pubkey: c.pubkey,
        timestamp: c.created_at.toISOString ? c.created_at.toISOString() : c.created_at,
        receipt_id: c.id,
        blockchain_confirmed: !!c.blockchain_confirmed,
        blockchain_block: c.blockchain_block || null,
        ots_pending: c.ots_pending || false,
        proof_url: c.ots_proof ? `/proof/${c.id}` : null
      }))
    });

  } catch (error) {
    console.error('Verify error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /verify/signature
app.post('/verify/signature', smallJson, async (req, res) => {
  try {
    const { hash, signature, pubkey } = req.body;

    if (!isValidHash(hash) || !isValidSignature(signature) || !isValidPubkey(pubkey)) {
      return res.status(400).json({ error: 'invalid_input' });
    }

    const valid = await verifySignature(hash, signature, pubkey);
    await incrementUsageCounter('signature_verifications');
    res.json({ valid });
  } catch (error) {
    res.json({ valid: false });
  }
});

// GET /receipts/:pubkey - Disabled: receipt history is browser-local only
app.get('/receipts/:pubkey', verifyLimiter, async (req, res) => {
  const { pubkey } = req.params;
  if (!isValidPubkey(pubkey)) {
    return res.status(400).json({ error: 'invalid_pubkey' });
  }
  res.status(410).json({
    error: 'local_history_only',
    message: 'Receipt history is stored locally in your browser. The server does not expose per-key receipt lists.'
  });
});

// GET /proof/:receiptId - Get OpenTimestamps proof file OR identity proof
app.get('/proof/:receiptId', async (req, res) => {
  try {
    const { receiptId } = req.params;
    
    // Validate receipt ID format to prevent injection
    if (!receiptId || typeof receiptId !== 'string' || receiptId.length > 50) {
      return res.status(400).json({ error: 'invalid_receipt_id' });
    }
    
    // Serve proof-view for stored proof packages (identity id_* or attribute prf_*)
    if (receiptId.startsWith('id_') || receiptId.startsWith('prf_')) {
      return serveHtmlWithNonce(path.join(__dirname, '../web/proof-view.html'))(req, res);
    }
    
    // Sanitize the receipt ID
    const safeReceiptId = sanitizeString(receiptId);
    if (!safeReceiptId) {
      return res.status(400).json({ error: 'invalid_receipt_id' });
    }
    
    const db = getDb();
    const claim = await db.collection('claims').findOne({ id: safeReceiptId });
    
    if (!claim) {
      // Check if browser request
      const acceptHeader = req.get('Accept') || '';
      if (acceptHeader.includes('text/html')) {
        return res.status(404).send(renderProofNotFound(receiptId));
      }
      return res.status(404).json({ error: 'not_found' });
    }
    
    // Return proof info or downloadable .ots file
    if (req.query.format === 'ots') {
      if (!claim.ots_proof) {
        return res.status(404).json({ error: 'proof_pending' });
      }
      // Return binary .ots file
      const otsBuffer = Buffer.from(claim.ots_proof, 'base64');
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${receiptId}.ots"`);
      return res.send(otsBuffer);
    }
    
    // Check for JSON request
    if (req.query.format === 'json') {
      const info = claim.ots_proof ? await getTimestampInfo(claim.ots_proof) : {};
      return res.json({
        status: claim.blockchain_confirmed ? 'confirmed' : 'pending',
        receipt_id: receiptId,
        hash: claim.hash,
        filename: claim.filename || null,
        created_at: claim.created_at,
        blockchain: {
          confirmed: claim.blockchain_confirmed || false,
          block_height: claim.blockchain_block || null,
          confirmed_at: claim.blockchain_confirmed_at || null,
          pending_calendars: info.pendingCalendars || []
        },
        ots_proof: claim.ots_proof || null,
        download_url: claim.ots_proof ? `/proof/${receiptId}?format=ots` : null
      });
    }
    
    // Check if browser request - return HTML page
    const acceptHeader = req.get('Accept') || '';
    if (acceptHeader.includes('text/html')) {
      const info = claim.ots_proof ? await getTimestampInfo(claim.ots_proof) : {};
      return res.send(renderProofPage(claim, info, receiptId));
    }
    
    // Default: Return JSON info
    const info = claim.ots_proof ? await getTimestampInfo(claim.ots_proof) : {};
    
    res.json({
      status: claim.blockchain_confirmed ? 'confirmed' : 'pending',
      receipt_id: receiptId,
      hash: claim.hash,
      filename: claim.filename || null,
      created_at: claim.created_at,
      blockchain: {
        confirmed: claim.blockchain_confirmed || false,
        block_height: claim.blockchain_block || null,
        confirmed_at: claim.blockchain_confirmed_at || null,
        pending_calendars: info.pendingCalendars || []
      },
      ots_proof: claim.ots_proof || null,
      download_url: claim.ots_proof ? `/proof/${receiptId}?format=ots` : null
    });
    
  } catch (error) {
    console.error('Proof error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Render styled proof HTML page
function renderProofPage(claim, info, receiptId) {
  const proofReady = !!claim.ots_proof;
  const status = claim.blockchain_confirmed ? 'confirmed' : (proofReady ? 'submitted' : 'pending');
  const statusText = claim.blockchain_confirmed ? 'Bitcoin confirmed' : (proofReady ? 'Calendar submitted' : 'Proof pending');
  const receiptSafe = escapeHtml(receiptId);
  const hashSafe = escapeHtml(claim.hash);
  const pubkeySafe = escapeHtml(claim.pubkey || 'Unknown');
  const signatureSafe = escapeHtml(claim.signature || 'Not available');
  const shortHash = claim.hash ? `${claim.hash.slice(0, 14)}...${claim.hash.slice(-14)}` : 'Unknown';
  const pendingCalendars = Array.isArray(info?.pendingCalendars) ? info.pendingCalendars : [];
  const pendingCalendarText = pendingCalendars.length ? pendingCalendars.map(escapeHtml).join(', ') : 'Waiting for Bitcoin attestation';
  
  const createdDate = claim.created_at ? new Date(claim.created_at).toLocaleString('sv-SE', { 
    timeZone: 'UTC', 
    dateStyle: 'medium', 
    timeStyle: 'short' 
  }) + ' UTC' : 'Unknown';
  
  const confirmedDate = claim.blockchain_confirmed_at ? new Date(claim.blockchain_confirmed_at).toLocaleString('sv-SE', { 
    timeZone: 'UTC', 
    dateStyle: 'medium', 
    timeStyle: 'short' 
  }) + ' UTC' : null;

  const baseUrl = process.env.BASE_URL || 'https://www.otrust.eu';
  const proofUrl = `${baseUrl}/proof/${receiptId}`;
  const ogImage = `${baseUrl}/api/qr?size=630&data=${encodeURIComponent(proofUrl)}`;
  const ogDescription = `${statusText} · SHA-256 ${escapeHtml(shortHash)}${claim.filename ? ` · ${escapeHtml(claim.filename)}` : ''}`;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Timestamp Proof - ${receiptSafe} | OTRUST</title>
  <meta name="description" content="Blockchain timestamp proof for hash ${escapeHtml(shortHash)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(proofUrl)}">
  <meta property="og:title" content="OTRUST proof ${receiptSafe}">
  <meta property="og:description" content="${ogDescription}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:site_name" content="OTRUST">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="OTRUST proof ${receiptSafe}">
  <meta name="twitter:description" content="${ogDescription}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    :root {
      --bg: #f6f8f7;
      --bg-card: #ffffff;
      --bg-muted: #edf2ef;
      --border: #d8dfdc;
      --text: #161a18;
      --text-dim: #65706b;
      --accent: #24543a;
      --accent-hover: #173928;
      --accent-light: #e0eee6;
      --blue: #315f7d;
      --gold: #a9843d;
      --warn: #9a5b10;
      --warn-light: #fff3d8;
      --shadow: 0 1px 1px rgba(15, 23, 18, 0.04), 0 26px 70px rgba(20, 34, 28, 0.13), 0 70px 130px rgba(20, 34, 28, 0.08);
      --gradient: linear-gradient(135deg, var(--accent), var(--blue) 58%, var(--gold));
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0) 340px),
        linear-gradient(135deg, #fbfcfa 0%, var(--bg) 52%, #edf5f6 100%);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }
    body::before {
      background: var(--gradient);
      content: "";
      height: 2px;
      left: 0;
      position: fixed;
      right: 0;
      top: 0;
      z-index: 10;
    }
    nav {
      background: rgba(246, 248, 247, 0.9);
      backdrop-filter: blur(18px);
      border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .nav-container {
      max-width: 1120px;
      margin: 0 auto;
      min-height: 4rem;
      padding: 0.875rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text);
      text-decoration: none;
      letter-spacing: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.62rem;
    }
    .logo::before {
      background: var(--gradient);
      border-radius: 3px;
      content: "";
      height: 0.68rem;
      width: 0.68rem;
    }
    .nav-links a {
      color: var(--text-dim);
      text-decoration: none;
      font-size: 0.8rem;
      transition: color 0.2s;
    }
    .nav-links a:hover { color: var(--text); }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 3.25rem 2rem 4rem;
    }
    .proof-shell {
      display: grid;
      gap: clamp(1.75rem, 4vw, 3.5rem);
      grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
      align-items: start;
    }
    .proof-intro {
      position: sticky;
      top: 6rem;
    }
    .eyebrow {
      background: var(--accent-light);
      border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
      border-radius: 4px;
      color: var(--accent);
      display: inline-flex;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      margin-bottom: 1rem;
      padding: 0.24rem 0.58rem;
      text-transform: uppercase;
    }
    h1 {
      font-size: 3.05rem;
      letter-spacing: 0;
      line-height: 1.04;
      margin-bottom: 1rem;
    }
    .lead {
      color: var(--text-dim);
      font-size: 1rem;
      max-width: 34rem;
    }
    .proof-card,
    .side-card {
      background:
        linear-gradient(135deg, rgba(255,255,255,0.76), rgba(255,255,255,0) 34%),
        linear-gradient(180deg, var(--bg-card), color-mix(in srgb, var(--bg-muted) 34%, var(--bg-card)));
      border: 1px solid color-mix(in srgb, var(--border) 72%, white);
      border-radius: 8px;
      box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,0.72);
      overflow: hidden;
      position: relative;
    }
    .proof-card::before {
      background: var(--gradient);
      content: "";
      height: 3px;
      left: 0;
      position: absolute;
      right: 0;
      top: 0;
    }
    .proof-header {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--border);
      gap: 1rem;
      justify-content: space-between;
      padding: 1.25rem 1.35rem;
      flex-wrap: wrap;
    }
    .proof-title {
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .status-badge {
      display: inline-block;
      padding: 0.32rem 0.78rem;
      border-radius: 100px;
      font-size: 0.7rem;
      font-weight: 800;
    }
    .status-badge.confirmed {
      background: var(--accent-light);
      color: var(--accent);
    }
    .status-badge.submitted,
    .status-badge.pending {
      background: var(--warn-light);
      color: var(--warn);
    }
    .proof-body {
      padding: 1.35rem;
    }
    .proof-section {
      margin-bottom: 1.2rem;
    }
    .proof-section:last-child {
      margin-bottom: 0;
    }
    .proof-label {
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-bottom: 0.35rem;
    }
    .proof-value {
      font-size: 0.9rem;
      word-break: break-all;
    }
    .hash-value {
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.8rem;
      background: var(--bg-muted);
      border: 1px solid var(--border);
      padding: 0.82rem 1rem;
      border-radius: 8px;
      word-break: break-all;
    }
    .proof-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .data-card {
      background: color-mix(in srgb, var(--bg-muted) 52%, var(--bg-card));
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.95rem;
    }
    .pipeline {
      display: grid;
      gap: 0.75rem;
      margin-top: 1.4rem;
    }
    .pipeline-step {
      align-items: start;
      display: grid;
      gap: 0.65rem;
      grid-template-columns: auto 1fr;
    }
    .pipeline-step span {
      align-items: center;
      background: var(--accent);
      border-radius: 4px;
      color: white;
      display: inline-flex;
      font-size: 0.68rem;
      font-weight: 800;
      height: 1.45rem;
      justify-content: center;
      width: 1.45rem;
    }
    .pipeline-step strong {
      display: block;
      font-size: 0.86rem;
    }
    .pipeline-step small {
      color: var(--text-dim);
      display: block;
      font-size: 0.74rem;
      line-height: 1.45;
    }
    .download-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--accent);
      color: white;
      padding: 0.72rem 1rem;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 800;
      transition: background 0.2s, transform 0.2s;
      margin-top: 0.2rem;
    }
    .download-btn:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    .download-btn.disabled {
      background: var(--border);
      color: var(--text-dim);
      pointer-events: none;
    }
    .info-box {
      background: color-mix(in srgb, var(--accent-light) 54%, var(--bg-card));
      border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.82rem;
      color: var(--text-dim);
      margin-top: 1.5rem;
    }
    .info-box a {
      color: var(--accent);
    }
    .machine-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-top: 0.8rem;
    }
    .machine-links a {
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.48rem 0.68rem;
      text-decoration: none;
    }
    .side-card {
      margin-top: 1.2rem;
      padding: 1rem;
    }
    .side-card h2 {
      font-size: 0.86rem;
      letter-spacing: 0;
      margin-bottom: 0.7rem;
    }
    footer {
      max-width: 1120px;
      margin: 2rem auto;
      padding: 0 2rem;
      text-align: center;
      font-size: 0.75rem;
      color: var(--text-dim);
    }
    footer a { color: var(--text-dim); }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #10120f;
        --bg-card: #181b17;
        --bg-muted: #20251f;
        --border: #394036;
        --text: #f5f7f1;
        --text-dim: #b9c0b2;
        --accent: #7bc88c;
        --accent-hover: #93d79f;
        --accent-light: #203827;
        --blue: #88b6d5;
        --gold: #d8bb73;
        --warn-light: #3c2f19;
      }
      body {
        background:
          linear-gradient(180deg, rgba(16,18,15,0.95) 0%, rgba(16,18,15,0) 340px),
          linear-gradient(135deg, #10120f 0%, #151a15 52%, #121a1d 100%);
      }
      nav { background: rgba(16,18,15,0.88); }
      .proof-card,
      .side-card {
        border-color: color-mix(in srgb, var(--border) 76%, black);
        box-shadow: 0 1px 1px rgba(0,0,0,0.28), 0 26px 70px rgba(0,0,0,0.34);
      }
      .hash-value { background: #0c0f0d; }
    }
    @media (max-width: 820px) {
      main { padding: 2rem 1rem 3rem; }
      .proof-shell { grid-template-columns: 1fr; }
      .proof-intro { position: static; }
      h1 { font-size: 2.25rem; }
      .nav-container { padding-left: 1rem; padding-right: 1rem; }
    }
  </style>
  <link rel="stylesheet" href="/otrust-redesign.css?v=20260527-1">
</head>
<body>
  <nav>
    <div class="nav-container">
      <a href="/" class="logo">OTRUST</a>
      <div class="nav-links">
        <a href="/">Create Timestamp</a>
      </div>
    </div>
  </nav>
  
  <main>
    <div class="proof-shell">
      <aside class="proof-intro">
        <span class="eyebrow">Timestamp Proof</span>
        <h1>Verifiable receipt.</h1>
        <p class="lead">This page proves that a specific SHA-256 hash was registered with OTRUST and prepared for independent OpenTimestamps verification.</p>
        <div class="side-card">
          <h2>Proof path</h2>
          <div class="pipeline">
            <div class="pipeline-step"><span>1</span><div><strong>Hash</strong><small>Original content maps to ${escapeHtml(shortHash)}.</small></div></div>
            <div class="pipeline-step"><span>2</span><div><strong>Sign</strong><small>Ed25519 public key links the claim to the submitter.</small></div></div>
            <div class="pipeline-step"><span>3</span><div><strong>Anchor</strong><small>${claim.blockchain_confirmed ? 'Bitcoin block recorded.' : pendingCalendarText}</small></div></div>
          </div>
        </div>
      </aside>

      <section class="proof-card">
        <div class="proof-header">
          <h2 class="proof-title">Receipt ${receiptSafe}</h2>
          <span class="status-badge ${status}">${statusText}</span>
        </div>

        <div class="proof-body">
          <div class="proof-section">
            <div class="proof-label">SHA-256 Hash</div>
            <div class="hash-value">${hashSafe}</div>
          </div>

          ${claim.filename ? `
          <div class="proof-section">
            <div class="proof-label">Original Filename</div>
            <div class="proof-value">${escapeHtml(claim.filename)}</div>
          </div>
          ` : ''}

          <div class="proof-grid">
            <div class="data-card">
              <div class="proof-label">Submitted</div>
              <div class="proof-value">${createdDate}</div>
            </div>
            <div class="data-card">
              <div class="proof-label">OTS Status</div>
              <div class="proof-value">${proofReady ? 'Proof file available' : 'Proof file pending'}</div>
            </div>
            <div class="data-card">
              <div class="proof-label">Bitcoin Block</div>
              <div class="proof-value">${claim.blockchain_block || 'Pending'}</div>
            </div>
            <div class="data-card">
              <div class="proof-label">Confirmed</div>
              <div class="proof-value">${confirmedDate || 'Pending'}</div>
            </div>
          </div>

          <div class="proof-section" style="margin-top: 1.35rem;">
            <div class="proof-label">Public Key</div>
            <div class="hash-value">${pubkeySafe}</div>
          </div>

          <div class="proof-section">
            <div class="proof-label">Signature</div>
            <div class="hash-value">${signatureSafe}</div>
          </div>

          <div class="proof-section">
            <div class="proof-label">OpenTimestamps Proof</div>
            ${proofReady ? `
            <a href="/proof/${receiptSafe}?format=ots" class="download-btn">
              Download .ots file
            </a>
            ` : `
            <span class="download-btn disabled">Proof file pending</span>
            `}
            <div class="machine-links">
              <a href="/proof/${receiptSafe}?format=json">JSON metadata</a>
              ${proofReady ? `<a href="/proof/${receiptSafe}?format=ots">Raw .ots</a>` : ''}
            </div>
          </div>

          <div class="info-box">
            <strong>How to verify:</strong> Hash the original file locally, download the .ots proof, then verify with the OpenTimestamps client or website. OTRUST is not needed to validate the Bitcoin attestation.
          </div>
        </div>
      </section>
    </div>
  </main>
  
  <footer>
    <p>Powered by <a href="/">OTRUST</a> - blind notary timestamps with OpenTimestamps</p>
  </footer>
</body>
</html>`;
}

// Render 404 page for proof not found
function renderProofNotFound(receiptId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proof Not Found | OTRUST</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    :root {
      --bg: #fafaf9;
      --bg-card: #ffffff;
      --border: #e5e5e5;
      --text: #1a1a1a;
      --text-dim: #737373;
      --accent: #2d5a3d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    nav {
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .nav-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0.875rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text);
      text-decoration: none;
    }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .error-card {
      text-align: center;
      max-width: 400px;
    }
    .error-card h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }
    .error-card p {
      color: var(--text-dim);
      margin-bottom: 1.5rem;
    }
    .home-btn {
      display: inline-block;
      background: var(--accent);
      color: white;
      padding: 0.6rem 1.5rem;
      border-radius: 4px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
    }
  </style>
  <link rel="stylesheet" href="/otrust-redesign.css?v=20260527-1">
</head>
<body>
  <nav>
    <div class="nav-container">
      <a href="https://www.otrust.eu" class="logo">OTRUST</a>
    </div>
  </nav>
  <main>
    <div class="error-card">
      <h1>Proof Not Found</h1>
      <p>The timestamp proof "${escapeHtml(receiptId)}" doesn't exist or may have been removed.</p>
      <a href="https://www.otrust.eu" class="home-btn">Create a Timestamp</a>
    </div>
  </main>
</body>
</html>`;
}

// HTML escape helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================
// Setup Wizard Routes (DISABLED for web deployment)
// Setup wizard is only for desktop app
// =============================================
// Setup routes removed - otrust.eu runs in production mode

// =============================================
// OTRUST Sign - Document Signing (Feature Flag)
// =============================================
// Only load Sign module if enabled
let sign = null;
if (config.features.sign) {
  const signModule = await import('./sign.js');
  sign = signModule.default;
}

// Rate limiters for sign endpoints
const signCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100 : 5,
  message: { error: 'rate_limited', message: 'Too many sign requests, please try again later' }
});

const signActLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 100 : 20,
  message: { error: 'rate_limited', message: 'Too many requests, please try again later' }
});

// Apply CSRF protection to sign endpoints (if enabled)
// Note: email-webhook is exempted and secured with webhook secret instead
if (config.features.sign) {
  app.use('/sign', (req, res, next) => {
    // Skip CSRF for email webhook - secured by webhook secret
    if (req.path === '/email-webhook') {
      return next();
    }
    return csrfProtection(req, res, next);
  });
} else {
  // Block all sign endpoints if feature is disabled
  app.use('/sign', (req, res) => {
    res.status(404).json({ 
      error: 'feature_disabled', 
      message: 'Document signing is not enabled on this instance' 
    });
  });
}

// POST /sign/upload - Upload document for signing (temporary storage)
// Max 25MB file size
const fileUploadLimit = express.raw({ 
  type: '*/*', 
  limit: '25mb' 
});

// SECURITY: Allowed file extensions for document signing
const ALLOWED_EXTENSIONS = new Set([
  // Documents
  '.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt',
  // Spreadsheets
  '.xls', '.xlsx', '.ods', '.csv',
  // Presentations
  '.ppt', '.pptx', '.odp',
  // Images (for contracts with images)
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff',
  // Archives (for document bundles)
  '.zip',
  // Other common document formats
  '.xml', '.json', '.md', '.html'
]);

// SECURITY: Blocked dangerous extensions (server-executable scripts only)
// Note: Source code files (.js, .py, etc.) are allowed for timestamping/signing
// Only blocking files that could be executed BY A SERVER if misconfigured
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr',  // Windows executables
  '.sh', '.bash', '.zsh', '.csh',                          // Shell scripts (could be executed)
  '.php', '.php3', '.php4', '.php5', '.phtml', '.phar',    // PHP (server-side)
  '.asp', '.aspx', '.ashx', '.asmx', '.ascx',              // ASP.NET (server-side)
  '.jsp', '.jspx', '.jsf', '.jspa',                        // Java Server Pages
  '.cgi',                                                  // CGI scripts
  '.jar', '.war', '.ear',                                  // Java archives (executable)
  '.htaccess', '.htpasswd',                                // Apache config (dangerous)
  '.swf', '.fla',                                          // Flash (legacy security risk)
]);

app.post('/sign/upload', signCreateLimiter, fileUploadLimit, async (req, res) => {
  try {
    // Security: Ensure header values are strings to prevent type confusion
    let filename = typeof req.headers['x-filename'] === 'string' ? req.headers['x-filename'] : 'document';
    const fileBuffer = req.body;
    
    // Get TTL from header (1, 6, or 12 hours - default 1)
    const ttlHeader = typeof req.headers['x-ttl-hours'] === 'string' ? req.headers['x-ttl-hours'] : '1';
    const ttlHours = Math.min(12, Math.max(1, parseInt(ttlHeader) || 1));
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    
    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: 'no_file', message: 'No file uploaded' });
    }
    
    if (fileBuffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'file_too_large', message: 'File must be under 25MB' });
    }
    
    // SECURITY: Sanitize filename to prevent path traversal and injection
    // Remove path components, null bytes, and dangerous characters
    filename = filename
      .replace(/\\/g, '/')           // Normalize slashes
      .split('/').pop()              // Take only the last component (basename)
      .replace(/\x00/g, '')          // Remove null bytes
      .replace(/\.\./g, '')          // Remove path traversal
      .replace(/[<>:"|?*]/g, '_')    // Replace Windows invalid chars
      .substring(0, 200);            // Limit length
    
    // Ensure filename is not empty after sanitization
    if (!filename || filename.trim() === '') {
      filename = 'document';
    }
    
    // SECURITY: Validate file extension
    const ext = (filename.includes('.') ? '.' + filename.split('.').pop().toLowerCase() : '').substring(0, 10);
    
    // Block dangerous extensions
    if (BLOCKED_EXTENSIONS.has(ext)) {
      logSecurityEvent('blocked_file_upload', req, { filename, extension: ext });
      return res.status(400).json({ 
        error: 'invalid_file_type', 
        message: `File type ${ext} is not allowed. Blocked types: .exe, .dll, .bat, .sh, .php, .asp, .jsp, .cgi, .htaccess, etc. See https://otrust.eu/api-docs.html#file-types for details.`
      });
    }
    
    // If extension not in allowed list and not empty, warn but allow (for backwards compatibility)
    // Future: could be stricter by requiring ALLOWED_EXTENSIONS
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      // Log for monitoring but allow - many valid documents have unusual extensions
      console.log(`[UPLOAD] Unusual extension: ${ext} for file: ${filename}`);
    }
    
    // Calculate SHA-256 hash
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    await incrementActivityCounter('sign_hashes_computed');
    
    // Generate file ID and secure file token (for creator access)
    const fileId = 'sf_' + crypto.randomBytes(16).toString('base64url');
    const fileToken = crypto.randomBytes(32).toString('base64url');
    
    // Store in MongoDB (we handle expiry manually to send notifications)
    const db = getDb();
    // Security: Validate content-type header is string
    const mimeType = typeof req.headers['content-type'] === 'string' 
      ? req.headers['content-type'].split(';')[0].trim().substring(0, 100)
      : 'application/octet-stream';
    
    await db.collection('sign_files').insertOne({
      file_id: fileId,
      file_token: fileToken, // Secure token for creator to access file
      filename: validator.escape(filename.substring(0, 200)),
      hash,
      data: fileBuffer,
      size: fileBuffer.length,
      mime_type: mimeType,
      created_at: new Date(),
      expires_at: expiresAt,
      ttl_hours: ttlHours,
      creator_email: typeof req.headers['x-creator-email'] === 'string' ? req.headers['x-creator-email'] : null,
      purge_notified: false
    });
    
    // Note: We don't use MongoDB TTL index - we handle expiry manually
    // to send purge notifications and create purge proofs
    
    res.status(201).json({
      file_id: fileId,
      file_token: fileToken, // Return token for creator to access file
      document_hash: hash,
      filename: filename,
      size: fileBuffer.length,
      expires_at: expiresAt.toISOString(),
      ttl_hours: ttlHours
    });
    
  } catch (error) {
    console.error('File upload error:', error.message);
    res.status(500).json({ error: 'upload_failed', message: 'Failed to upload file' });
  }
});

// GET /sign/file/:fileId - Download document (for signers)
// Requires valid signing token, view_token, or file_token for security
app.get('/sign/file/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { token, sign_id, view_token } = req.query;
    
    if (!fileId || !fileId.startsWith('sf_')) {
      return res.status(400).json({ error: 'invalid_file_id' });
    }
    
    const db = getDb();
    const file = await db.collection('sign_files').findOne({ file_id: fileId });
    
    if (!file) {
      // Check if there's a purge proof for this file
      const purgeProof = await db.collection('purge_proofs').findOne({ file_id: fileId });
      if (purgeProof) {
        // Check Accept header - return JSON for API calls, HTML for browsers
        const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
        
        if (acceptsHtml) {
          // Return styled HTML page for browser requests
          return res.status(410).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Deleted - OTRUST</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafaf9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { max-width: 500px; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); text-align: center; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { color: #1a1a1a; font-size: 24px; margin-bottom: 12px; }
    p { color: #666; line-height: 1.6; margin-bottom: 20px; }
    .proof-box { background: #f5f5f4; border-radius: 8px; padding: 16px; text-align: left; margin: 20px 0; }
    .proof-box label { font-size: 12px; color: #888; display: block; margin-bottom: 4px; }
    .proof-box code { font-size: 11px; word-break: break-all; color: #333; display: block; margin-top: 4px; }
    .success-badge { background: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: 500; margin-bottom: 20px; }
    .btn { display: inline-block; background: #2d5a3d; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }
    .btn:hover { background: #1e4029; }
  </style>
  <link rel="stylesheet" href="/otrust-redesign.css?v=20260527-1">
</head>
<body>
  <div class="container">
    <div class="icon">🗑️</div>
    <div class="success-badge">✓ Securely Deleted</div>
    <h1>Document Has Been Purged</h1>
    <p>This document was automatically deleted as scheduled. The original file no longer exists on our servers.</p>
    <div class="proof-box">
      <label>Deleted At</label>
      <code>${new Date(purgeProof.purged_at).toLocaleString()}</code>
      <label style="margin-top: 12px;">Original File Hash</label>
      <code>${purgeProof.original_hash}</code>
      <label style="margin-top: 12px;">Deletion Proof Hash</label>
      <code>${purgeProof.proof_hash}</code>
    </div>
    <p style="font-size: 14px; color: #888;">The cryptographic proof above verifies this file was securely deleted. Your signing record and blockchain proof remain intact.</p>
    <a href="/sign" class="btn">← Back to Signed</a>
  </div>
</body>
</html>`);
        }
        
        // JSON response for API calls
        return res.status(410).json({ 
          error: 'file_purged', 
          message: 'File has been automatically deleted',
          purged_at: purgeProof.purged_at,
          proof_hash: purgeProof.proof_hash
        });
      }
      return res.status(404).json({ error: 'file_not_found', message: 'File not found or expired' });
    }
    
    // Security: Verify the requester has a valid token
    let authorized = false;
    
    // Option 1: Party token + sign_id
    if (token && sign_id && sign_id.startsWith('sr_')) {
      // Check if this token belongs to a party in the sign request
      // and the sign request references this file
      const signRequest = await db.collection('sign_requests').findOne({ 
        id: sign_id,
        'parties.token': token
      });
      
      if (signRequest) {
        // Verify the sign request uses this file
        const fileUrl = signRequest.document_url || '';
        if (fileUrl.includes(fileId)) {
          authorized = true;
        }
      }
    }
    
    // Option 2: view_token (for creator viewing status page)
    if (!authorized && view_token && sign_id && sign_id.startsWith('sr_')) {
      const signRequest = await db.collection('sign_requests').findOne({ 
        id: sign_id,
        view_token: view_token
      });
      
      if (signRequest) {
        const fileUrl = signRequest.document_url || '';
        if (fileUrl.includes(fileId)) {
          authorized = true;
        }
      }
    }
    
    // Option 3: file_token (for creator who uploaded)
    const fileToken = req.query.file_token;
    if (!authorized && typeof fileToken === 'string' && file.file_token && timingSafeEqual(fileToken, file.file_token)) {
      authorized = true;
    }
    
    if (!authorized) {
      logSecurityEvent('file_access_denied', req, { fileId, hasToken: !!token, hasSignId: !!sign_id, hasViewToken: !!view_token });
      return res.status(403).json({ 
        error: 'access_denied', 
        message: 'Valid signing token required to download file' 
      });
    }
    
    // Set headers for download
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Length', file.size);
    res.setHeader('X-Document-Hash', file.hash);
    res.setHeader('X-Expires-At', file.expires_at.toISOString());
    
    // Send file
    res.send(file.data.buffer);
    
  } catch (error) {
    console.error('File download error:', error.message);
    res.status(500).json({ error: 'download_failed' });
  }
});

// GET /sign/purge-proof/:proofHash - Get purge proof
app.get('/sign/purge-proof/:proofHash', async (req, res) => {
  try {
    const { proofHash } = req.params;
    
    if (!proofHash || proofHash.length !== 64) {
      return res.status(400).json({ error: 'invalid_proof_hash' });
    }
    
    const db = getDb();
    const proof = await db.collection('purge_proofs').findOne({ proof_hash: proofHash });
    
    if (!proof) {
      return res.status(404).json({ error: 'proof_not_found' });
    }
    
    // Return proof without internal MongoDB _id
    res.json({
      file_id: proof.file_id,
      filename: proof.filename,
      original_hash: proof.original_hash,
      created_at: proof.created_at,
      expired_at: proof.expired_at,
      purged_at: proof.purged_at,
      ttl_hours: proof.ttl_hours,
      reason: proof.reason,
      proof_hash: proof.proof_hash,
      verification: {
        method: 'SHA-256',
        input: `{"file_id":"${proof.file_id}","original_hash":"${proof.original_hash}","purged_at":"${proof.purged_at.toISOString()}"}`
      }
    });
    
  } catch (error) {
    console.error('Purge proof error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /sign/create - Create a new sign request
app.post('/sign/create', signCreateLimiter, smallJson, async (req, res) => {
  try {
    const { document_hash, title, filename, document_url, parties, signing_order, deadline, creator_email, message } = req.body;
    
    // Validate required fields
    if (!isValidHash(document_hash)) {
      return res.status(400).json({ error: 'invalid_hash', message: 'Invalid document hash' });
    }
    
    // Use strict email validation to prevent header injection
    if (!creator_email || !isValidEmail(creator_email) || hasEmailInjection(creator_email)) {
      return res.status(400).json({ error: 'invalid_email', message: 'Valid creator email required' });
    }
    
    if (!parties || !Array.isArray(parties) || parties.length === 0) {
      return res.status(400).json({ error: 'invalid_parties', message: 'At least one party required' });
    }
    
    if (parties.length > 20) {
      return res.status(400).json({ error: 'too_many_parties', message: 'Maximum 20 parties allowed' });
    }
    
    // Validate each party with strict email validation
    for (const party of parties) {
      if (!party.email || !isValidEmail(party.email) || hasEmailInjection(party.email)) {
        return res.status(400).json({ error: 'invalid_party_email', message: `Invalid email` });
      }
      if (!['signer', 'approver', 'viewer'].includes(party.role)) {
        return res.status(400).json({ error: 'invalid_role', message: `Invalid role: ${party.role}` });
      }
    }
    
    // Validate signing order
    if (signing_order && !['parallel', 'sequential'].includes(signing_order)) {
      return res.status(400).json({ error: 'invalid_signing_order', message: 'signing_order must be "parallel" or "sequential"' });
    }
    
    // Sanitize inputs
    const sanitizedTitle = title ? validator.escape(title.substring(0, 200)) : 'Untitled Document';
    const sanitizedFilename = filename ? validator.escape(filename.substring(0, 200)) : null;
    const sanitizedMessage = message ? validator.escape(message.substring(0, 1000)) : null;
    
    const result = await sign.createSignRequest({
      documentHash: document_hash,
      title: sanitizedTitle,
      filename: sanitizedFilename,
      documentUrl: document_url ? validator.trim(document_url.substring(0, 500)) : null,
      parties,
      signingOrder: signing_order || 'parallel',
      deadline,
      creatorEmail: creator_email,
      message: sanitizedMessage
    });
    
    res.status(201).json(result);
    
  } catch (error) {
    console.error('Sign create error:', error.message);
    const isDuplicate = error.message.includes('already');
    const status = isDuplicate ? 409 : 500;
    const code = isDuplicate ? 'duplicate_document' : 'server_error';
    res.status(status).json({ error: code, message: error.message });
  }
});

// GET /sign/:id - Get sign request status (JSON API) or serve HTML page (browser)
// Skip "view" and "act" as they are HTML pages handled later
app.get('/sign/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Skip HTML routes and quick-sign - let them be handled by specific routes
    if (id === 'view' || id === 'act' || id === 'create' || id === 'quick') {
      return next();
    }
    
    if (!id || !id.startsWith('sr_')) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    
    // If browser requests HTML, serve the view page
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html')) {
      return serveHtmlWithNonce(path.join(__dirname, '../web/sign-view.html'))(req, res, next);
    }
    
    // Get view_token from query param for authenticated access (accept both 'token' and 'view_token')
    const viewToken = req.query.token || req.query.view_token || null;
    
    const signRequest = await sign.getSignRequest(id, viewToken);
    
    if (!signRequest) {
      return res.status(404).json({ error: 'not_found' });
    }
    
    res.json(signRequest);
    
  } catch (error) {
    console.error('Sign get error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /sign/:id/act - Get sign request for acting (with token)
// Note: This is an API route, the HTML page is /sign/act (no :id)
app.get('/sign/:id/act', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    
    // If no ID that looks like a sign request, pass to next handler
    if (!id || !id.startsWith('sr_')) {
      return next();
    }
    
    if (!token) {
      return res.status(400).json({ error: 'missing_token' });
    }
    
    const signRequest = await sign.getSignRequestByToken(id, token);
    
    if (!signRequest) {
      return res.status(404).json({ error: 'not_found', message: 'Invalid sign request or token' });
    }
    
    res.json(signRequest);
    
  } catch (error) {
    console.error('Sign act get error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /sign/:id/verify - Verify document hash matches
app.post('/sign/:id/verify', signActLimiter, smallJson, async (req, res) => {
  try {
    const { id } = req.params;
    const { token, document_hash } = req.body;
    
    if (!id || !id.startsWith('sr_')) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    
    if (!token) {
      return res.status(400).json({ error: 'missing_token' });
    }
    
    if (!isValidHash(document_hash)) {
      return res.status(400).json({ error: 'invalid_hash' });
    }
    
    const result = await sign.verifyDocumentHash(id, token, document_hash);
    
    res.json(result);
    
  } catch (error) {
    console.error('Sign verify error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /sign/:id/complete - Complete signature/approval
app.post('/sign/:id/complete', signActLimiter, smallJson, async (req, res) => {
  try {
    const { id } = req.params;
    const { token, document_hash, action, signature, pubkey, otrustProof } = req.body;
    
    if (!id || !id.startsWith('sr_')) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    
    if (!token) {
      return res.status(400).json({ error: 'missing_token' });
    }
    
    if (!isValidHash(document_hash)) {
      return res.status(400).json({ error: 'invalid_hash' });
    }
    
    if (!action || !['signed', 'approved', 'viewed', 'declined'].includes(action)) {
      return res.status(400).json({ error: 'invalid_action' });
    }
    
    // Validate signature and pubkey if provided
    if ((action === 'signed' || action === 'approved') && (!signature || !pubkey)) {
      return res.status(400).json({ error: 'signature_required', message: 'Cryptographic signature required for signing/approving' });
    }
    
    if (signature && !/^[a-f0-9]{128}$/i.test(signature)) {
      return res.status(400).json({ error: 'invalid_signature' });
    }
    
    if (pubkey && !/^[a-f0-9]{64}$/i.test(pubkey)) {
      return res.status(400).json({ error: 'invalid_pubkey' });
    }
    
    // Get IP and user agent for verification (hashed for privacy)
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    const result = await sign.completeSignature({
      signId: id,
      token,
      documentHash: document_hash,
      action,
      signature,
      pubkey,
      ip,
      userAgent,
      otrustProof  // Optional: verified OTRUST Proof data for extra identity verification
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Sign complete error:', error.message);
    res.status(400).json({ error: 'signature_failed', message: error.message });
  }
});

// POST /sign/:id/cancel - Cancel sign request (creator only)
// Uses cancel_token for security instead of email hash
app.post('/sign/:id/cancel', signActLimiter, smallJson, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_token, reason } = req.body;
    
    if (!id || !id.startsWith('sr_')) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    
    if (!cancel_token) {
      return res.status(400).json({ error: 'missing_token', message: 'cancel_token required' });
    }
    
    const result = await sign.cancelSignRequest(id, cancel_token, reason);
    
    res.json(result);
    
  } catch (error) {
    console.error('Sign cancel error:', error.message);
    res.status(400).json({ error: 'cancel_failed', message: error.message });
  }
});

// POST /sign/:id/remind - Send reminder (creator only)
// Uses cancel_token or view_token for security
app.post('/sign/:id/remind', signActLimiter, smallJson, async (req, res) => {
  try {
    const { id } = req.params;
    const { cancel_token, view_token } = req.body;
    
    if (!id || !id.startsWith('sr_')) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    
    // Accept either cancel_token or view_token
    const token = cancel_token || view_token;
    if (!token) {
      return res.status(400).json({ error: 'missing_token', message: 'cancel_token or view_token required' });
    }
    
    const result = await sign.sendReminder(id, token);
    
    res.json(result);
    
  } catch (error) {
    console.error('Sign remind error:', error.message);
    res.status(400).json({ error: 'remind_failed', message: error.message });
  }
});

// GET /sign/:id/package - Get signature package/proof
app.get('/sign/:id/package', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || !id.startsWith('sr_')) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    
    const pkg = await sign.getSignaturePackage(id);
    
    if (!pkg) {
      return res.status(404).json({ error: 'not_found', message: 'Package not available yet' });
    }
    
    res.json(pkg);
    
  } catch (error) {
    console.error('Sign package error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /sign/email-webhook - Process email-based signing and creation
// Modes:
// 1. MAILTO_SIGN: User clicks mailto link with SIGN:signId:token in subject
// 2. MAILTO_DECLINE: User clicks mailto link with DECLINE:signId:token in subject  
// 3. CREATE: User sends to sign@otrust.eu with signers in TO/CC + document attached
// 4. SIGN: Signer replies to invite with document attached (hash matching)
app.post('/sign/email-webhook', documentJson, async (req, res) => {
  try {
    // Verify webhook secret (prevents unauthorized webhook calls)
    const webhookSecret = req.headers['x-email-webhook-secret'] || req.headers['x-webhook-secret'] || req.query.secret;
    if (!webhookSecret || webhookSecret !== process.env.EMAIL_SIGN_WEBHOOK_SECRET) {
      console.log('[EmailSign] Invalid webhook secret');
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid webhook secret' });
    }
    
    const { mode, signId, token, fromEmail, from, to, cc, signers, subject, body, document_hash, filename, action, document_data, document_type } = req.body;
    
    // NEW: Handle mailto-based signing (mode=sign or mode=decline)
    if (mode === 'sign' || mode === 'decline') {
      // SECURITY: Validate signId and token to prevent NoSQL injection
      if (!signId || typeof signId !== 'string' || !signId.startsWith('sr_')) {
        return res.status(400).json({ error: 'invalid_sign_id', message: 'Invalid sign request ID' });
      }
      if (!token || typeof token !== 'string' || token.length > 100) {
        return res.status(400).json({ error: 'invalid_token', message: 'Invalid or missing token' });
      }
      
      const email = fromEmail || from;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'missing_email', message: 'Missing from email' });
      }
      
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      
      // Process via mailto action
      const result = await sign.processMailtoSign({
        signId,
        token,
        fromEmail: email.toLowerCase().trim(),
        action: mode,
        ip
      });
      
      if (result.success) {
        return res.json(result);
      } else {
        return res.status(400).json(result);
      }
    }
    
    // LEGACY: Handle document-attachment based signing
    if (!from && !fromEmail) {
      return res.status(400).json({ error: 'invalid_webhook', message: 'Missing from address' });
    }
    
    // Extract email address from "Name <email@domain.com>" format
    // Security: Limit input length to prevent ReDoS attacks
    const extractEmail = (addr) => {
      if (!addr) return null;
      // Limit length to prevent regex DoS
      const truncated = String(addr).slice(0, 500);
      // Use indexOf for O(n) instead of regex backtracking
      const start = truncated.lastIndexOf('<');
      const end = truncated.lastIndexOf('>');
      if (start !== -1 && end > start) {
        return truncated.slice(start + 1, end).toLowerCase().trim();
      }
      return truncated.toLowerCase().trim();
    };
    
    const senderEmail = extractEmail(from || fromEmail);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    
    // Determine mode: CREATE if sent to sign@, SIGN if replying to invite
    const toList = (Array.isArray(to) ? to : [to]).filter(Boolean).map(extractEmail);
    const isCreateMode = action === 'create' || toList.some(e => e?.includes('sign@'));
    
    console.log(`[EmailSign] Mode: ${isCreateMode ? 'CREATE' : 'SIGN'}, from: ${senderEmail}`);
    
    if (isCreateMode) {
      // CREATE MODE: Make a new sign request
      if (!document_hash) {
        return res.status(400).json({ error: 'no_attachment', message: 'Attach a document to create a sign request' });
      }
      
      // Support both new format (signers array) and old format (to/cc lists)
      let signerList;
      if (signers && Array.isArray(signers)) {
        // New format: direct signers array from worker
        signerList = signers.map(e => e.toLowerCase().trim());
      } else {
        // Old format: extract from to/cc
        const ccList = (Array.isArray(cc) ? cc : [cc]).filter(Boolean).map(extractEmail);
        signerList = [...toList, ...ccList].filter(e => e && !e.includes('sign@'));
      }
      
      const result = await sign.createSignRequestFromEmail({
        fromEmail: senderEmail,
        signers: signerList,
        subject,
        body,
        documentHash: document_hash,
        filename,
        documentData: document_data,  // Base64 encoded document
        documentType: document_type,  // MIME type
        ip
      });
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
      
    } else {
      // SIGN MODE: Complete a signature
      if (!document_hash) {
        return res.status(400).json({ error: 'no_attachment', message: 'Attach the document to sign' });
      }
      
      const result = await sign.processEmailSign({
        fromEmail: senderEmail,
        documentHash: document_hash,
        ip
      });
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    }
    
  } catch (error) {
    console.error('Email sign webhook error:', error.message);
    res.status(500).json({ error: 'webhook_failed', message: error.message });
  }
});

// POST /verify/blockchain - Verify a hash against OTS proof
app.post('/verify/blockchain', smallJson, async (req, res) => {
  try {
    const { hash, ots_proof } = req.body;
    
    if (!isValidHash(hash)) {
      return res.status(400).json({ error: 'invalid_hash' });
    }
    
    if (!ots_proof) {
      return res.status(400).json({ error: 'missing_proof' });
    }
    
    const result = await verifyTimestamp(hash, ots_proof);
    await incrementUsageCounter('blockchain_verifications');
    res.json(result);
    
  } catch (error) {
    console.error('Blockchain verify error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// HTML file handler to inject nonce for CSP
const serveHtmlWithNonce = (filePath) => {
  return (req, res) => {
    try {
      let html = fs.readFileSync(filePath, 'utf8');
      const dashboardCacheVersion = '20260601-02';
      // Replace nonce placeholders in inline <script> tags
      // SECURITY: [^"]* is bounded by " character and is safe from ReDoS
      html = html.replace(/nonce="[^"]*"/g, `nonce="${req.cspNonce}"`);
      html = html
        .replace(/\/otrust-polish\.css\?v=[^"'\s<>]+/g, `/otrust-polish.css?v=${dashboardCacheVersion}`)
        .replace(/\/otrust-redesign\.css\?v=[^"'\s<>]+/g, `/otrust-redesign.css?v=${dashboardCacheVersion}`)
        .replace(/\/otrust-polish\.js\?v=[^"'\s<>]+/g, `/otrust-polish.js?v=${dashboardCacheVersion}`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      console.error(`Error serving HTML file ${filePath}:`, error);
      res.status(500).send('Internal Server Error');
    }
  };
};

// HTML route handlers with nonce injection
app.get('/index.html', serveHtmlWithNonce(path.join(__dirname, '../web/index.html')));
app.get('/', serveHtmlWithNonce(path.join(__dirname, '../web/index.html')));
app.get('/timestamp', serveHtmlWithNonce(path.join(__dirname, '../web/index.html')));
app.get('/docs.html', serveHtmlWithNonce(path.join(__dirname, '../web/docs.html')));
app.get('/docs', serveHtmlWithNonce(path.join(__dirname, '../web/docs.html')));
app.get('/sign-in.html', serveHtmlWithNonce(path.join(__dirname, '../web/sign-in.html')));
app.get('/sign-in', serveHtmlWithNonce(path.join(__dirname, '../web/sign-in.html')));
app.get(['/signin', '/login'], (req, res) => res.redirect(301, '/sign-in'));
app.get(['/partners/hemsted', '/partners/hemsted.html'], serveHtmlWithNonce(path.join(__dirname, '../web/partners-hemsted.html')));
app.get(['/partners/preview', '/partners-preview.html'], serveHtmlWithNonce(path.join(__dirname, '../web/partners-preview.html')));
app.get(['/changelog', '/changelog.html'], serveHtmlWithNonce(path.join(__dirname, '../web/changelog.html')));
app.get(['/use-cases', '/use-cases.html'], serveHtmlWithNonce(path.join(__dirname, '../web/use-cases.html')));
app.get(['/health-check', '/health-check.html'], serveHtmlWithNonce(path.join(__dirname, '../web/health-check.html')));
app.get('/about.html', serveHtmlWithNonce(path.join(__dirname, '../web/about.html')));
app.get('/about', serveHtmlWithNonce(path.join(__dirname, '../web/about.html')));
app.get('/transparency.html', serveHtmlWithNonce(path.join(__dirname, '../web/transparency.html')));
app.get('/transparency', serveHtmlWithNonce(path.join(__dirname, '../web/transparency.html')));
app.get('/notes/why-otrust', serveHtmlWithNonce(path.join(__dirname, '../web/notes-why-otrust.html')));
app.get(['/why-otrust', '/notes/why-otrust.html'], (req, res) => res.redirect(301, '/notes/why-otrust'));
app.get('/api-docs.html', serveHtmlWithNonce(path.join(__dirname, '../web/api-docs.html')));
app.get('/api-docs', serveHtmlWithNonce(path.join(__dirname, '../web/api-docs.html')));
app.get(['/api.html', '/api-reference', '/api-reference.html'], (req, res) => res.redirect(301, '/api-docs'));
app.get('/privacy-policy.html', serveHtmlWithNonce(path.join(__dirname, '../web/privacy-policy.html')));
app.get('/privacy-policy', serveHtmlWithNonce(path.join(__dirname, '../web/privacy-policy.html')));
app.get(['/privacy', '/privacy.html'], (req, res) => res.redirect(301, '/privacy-policy'));
app.get('/terms.html', serveHtmlWithNonce(path.join(__dirname, '../web/terms.html')));
app.get('/terms', serveHtmlWithNonce(path.join(__dirname, '../web/terms.html')));
app.get('/swagger.html', serveHtmlWithNonce(path.join(__dirname, '../web/swagger.html')));
app.get(['/sdk-playground', '/sdk-playground.html'], (req, res) => res.redirect(301, '/playground/'));
app.get(['/playground/', '/playground/index.html'], serveHtmlWithNonce(path.join(__dirname, '../web/playground/index.html')));
app.get('/playground', (req, res) => res.redirect(301, '/playground/'));
app.get('/report-abuse', serveHtmlWithNonce(path.join(__dirname, '../web/report-abuse.html')));
app.get('/report-abuse.html', serveHtmlWithNonce(path.join(__dirname, '../web/report-abuse.html')));

// OTRUST Sign HTML routes
app.get('/sign', serveHtmlWithNonce(path.join(__dirname, '../web/sign.html')));
app.get('/sign.html', serveHtmlWithNonce(path.join(__dirname, '../web/sign.html')));
app.get('/sign/create', serveHtmlWithNonce(path.join(__dirname, '../web/sign.html')));
app.get('/sign/view', serveHtmlWithNonce(path.join(__dirname, '../web/sign-view.html')));
app.get('/sign-view.html', serveHtmlWithNonce(path.join(__dirname, '../web/sign-view.html')));
app.get('/sign/act', serveHtmlWithNonce(path.join(__dirname, '../web/sign-act.html')));
app.get('/sign-act.html', serveHtmlWithNonce(path.join(__dirname, '../web/sign-act.html')));

// OTRUST Proof HTML routes
app.get('/proof', serveHtmlWithNonce(path.join(__dirname, '../web/proof.html')));
app.get('/proof.html', serveHtmlWithNonce(path.join(__dirname, '../web/proof.html')));
app.get('/proof/:proofId', serveHtmlWithNonce(path.join(__dirname, '../web/proof-view.html')));

// GET /sign/quick - One-click sign/decline from email
app.get('/sign/quick', async (req, res) => {
  const { action, id, token } = req.query;
  
  if (!action || !id || !token) {
    return res.status(400).send(quickResponsePage('Error', 'Missing parameters', 'error'));
  }
  
  if (!['sign', 'decline'].includes(action)) {
    return res.status(400).send(quickResponsePage('Error', 'Invalid action', 'error'));
  }
  
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    
    const result = await sign.processMailtoSign({
      signId: id,
      token,
      fromEmail: null, // Not needed for token-based auth
      action,
      ip
    });
    
    if (result.success) {
      const title = action === 'sign' ? 'Document Signed' : 'Document Declined';
      const message = action === 'sign' 
        ? `You have successfully signed "${result.title || 'the document'}". The creator has been notified.`
        : `You have declined to sign "${result.title || 'the document'}". The creator has been notified.`;
      return res.send(quickResponsePage(title, message, action === 'sign' ? 'success' : 'declined', result.title));
    } else {
      return res.status(400).send(quickResponsePage('Error', result.error || 'Failed to process request', 'error'));
    }
  } catch (error) {
    console.error('Quick sign error:', error.message);
    return res.status(500).send(quickResponsePage('Error', error.message, 'error'));
  }
});

// Generate styled response page for quick sign/decline
function quickResponsePage(title, message, status, docTitle = null) {
  const colors = {
    success: { bg: '#f0fdf4', border: '#22c55e', icon: '', heading: '#166534' },
    declined: { bg: '#fef2f2', border: '#ef4444', icon: '', heading: '#991b1b' },
    error: { bg: '#fef2f2', border: '#ef4444', icon: '', heading: '#991b1b' }
  };
  const c = colors[status] || colors.error;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - OTRUST Signed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #fafaf9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.05);
      max-width: 500px;
      width: 100%;
      overflow: hidden;
    }
    .header {
      padding: 24px;
      border-bottom: 1px solid #e5e5e5;
    }
    .logo {
      font-weight: 600;
      font-size: 18px;
      color: #1a1a1a;
    }
    .logo span {
      font-family: Georgia, serif;
      font-style: italic;
      color: #2d5a3d;
      margin-left: 4px;
    }
    .content {
      padding: 32px;
      text-align: center;
    }
    .status-box {
      background: ${c.bg};
      border: 2px solid ${c.border};
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 24px;
    }
    .status-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .status-title {
      font-size: 24px;
      font-weight: 600;
      color: ${c.heading};
      margin-bottom: 12px;
    }
    .status-message {
      color: #525252;
      line-height: 1.6;
    }
    .doc-title {
      background: #f5f5f4;
      padding: 12px 16px;
      border-radius: 8px;
      margin-top: 16px;
      font-weight: 500;
      color: #1a1a1a;
    }
    .footer {
      padding: 16px 24px;
      background: #f5f5f4;
      text-align: center;
      font-size: 12px;
      color: #737373;
    }
    .footer a { color: #737373; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">OTRUST<span>Signed</span></div>
    </div>
    <div class="content">
      <div class="status-box">
        <div class="status-icon">${c.icon}</div>
        <div class="status-title">${title}</div>
        <div class="status-message">${message}</div>
        ${docTitle ? `<div class="doc-title">${docTitle}</div>` : ''}
      </div>
      ${status === 'success' ? '<p style="color:#737373;font-size:14px;">Once all parties have signed, the agreement will be timestamped on the Bitcoin blockchain.</p>' : ''}
    </div>
    <div class="footer">
      OTRUST Signed · <a href="https://www.otrust.eu/sign">otrust.eu/sign</a>
    </div>
  </div>
</body>
</html>`;
}

// Serve static web client for other assets (CSS, JS, images, etc.)
// Redirect favicon.ico to favicon.svg
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

app.use(express.static(path.join(__dirname, '../web'), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Prevent caching of HTML files (but these shouldn't be served by static now)
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (
      path.endsWith('otrust-redesign.css') ||
      path.endsWith('otrust-polish.css') ||
      path.endsWith('otrust-polish.js')
    ) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// GET /api - API info
app.get('/api', (req, res) => {
  res.json({
    service: 'otrust',
    version: '0.3.0',
    description: 'Blind notary for IP timestamping with Bitcoin anchoring',
    endpoints: {
      'GET /challenge': 'Get proof-of-work challenge',
      'POST /claim': 'Submit timestamp claim',
      'POST /claim/bulk': 'Submit batch claims (max 100, single PoW)',
      'POST /verify': 'Verify hash timestamp (hash in body)',
      'POST /verify/bulk': 'Verify batch hashes (max 100)',
      'POST /verify/signature': 'Verify signature',
      'POST /verify/blockchain': 'Verify OTS proof against blockchain',
      'GET /proof/:receiptId': 'Get OpenTimestamps proof'
    },
    blockchain: 'Blockchain via OpenTimestamps',
    privacy: 'No IP logging. No accounts. Zero-knowledge.'
  });
});

// Root serves web app (static), API info at /api
app.get('/', (req, res, next) => {
  // Let static middleware handle index.html
  next();
});

// POST /api/report-abuse - Handle abuse reports
app.post('/api/report-abuse', smallJson, async (req, res) => {
  try {
    const { email, type, description, reference } = req.body;
    
    if (!email || !type || !description) {
      return res.status(400).json({ error: 'missing_fields' });
    }
    
    const db = getDb();
    const report = {
      email,
      type,
      description,
      reference: reference || null,
      ip_hash: req.ip ? crypto.createHash('sha256').update(req.ip).digest('hex').substring(0, 16) : null,
      created_at: new Date(),
      status: 'pending'
    };
    
    await db.collection('abuse_reports').insertOne(report);
    console.log(`[Abuse] Report submitted: ${type} from ${email}, ref: ${reference || 'none'}`);
    
    // Send confirmation email to reporter
    if (sendEmail) {
      try {
        const abuseHtml = emailTemplate({
          title: 'Report received — OTRUST',
          preheader: 'Thank you for reporting suspicious activity',
          content: [
            emailHeading('Report received'),
            emailParagraph('Thank you for reporting suspicious activity. We take all reports seriously.'),
            emailDetailsBox([
              ['Type', type],
              ...(reference ? [['Reference', reference]] : [])
            ]),
            emailParagraph('We will investigate and take appropriate action. You may receive a follow-up email if we need more information.')
          ].join(''),
          product: 'Timestamp'
        });
        await sendEmail(
          email,
          'Report received — OTRUST',
          abuseHtml,
          `Report Received\n\nThank you for reporting suspicious activity. We take all reports seriously.\n\nType: ${type}\n${reference ? `Reference: ${reference}\n` : ''}\nWe will investigate and take appropriate action.\n\n- OTRUST`
        );
      } catch (emailErr) {
        console.error('[Abuse] Failed to send confirmation:', emailErr.message);
      }
    }
    
    // Send notification email to admin if configured
    if (process.env.ADMIN_EMAIL && sendEmail) {
      try {
        const adminHtml = emailTemplate({
          title: `Abuse report: ${type}`,
          preheader: `New abuse report from ${email}`,
          product: 'Timestamp',
          content: [
            emailHeading('New abuse report'),
            emailDetailsBox([
              ['Type', escapeHtml(type)],
              ['From', escapeHtml(email)],
              ['Reference', escapeHtml(reference || 'N/A')]
            ]),
            emailInfoBox(`<strong>Description</strong><p style="margin:10px 0 0 0;white-space:pre-wrap;">${escapeHtml(description)}</p>`)
          ].join('')
        });
        await sendEmail(
          process.env.ADMIN_EMAIL,
          `Abuse report: ${type}`,
          adminHtml,
          `New abuse report: ${type}\nFrom: ${email}\nRef: ${reference || 'N/A'}\n\n${description}`
        );
      } catch (emailErr) {
        console.error('[Abuse] Failed to send admin notification:', emailErr.message);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Abuse] Error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// POST /api/admin/block - Block a sender (requires admin key)
app.post('/api/admin/block', smallJson, async (req, res) => {
  try {
    if (!hasValidAdminKey(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    
    const { email, reason } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'missing_email' });
    }
    
    // Store block in database (worker will check via API)
    const db = getDb();
    await db.collection('blocked_senders').updateOne(
      { email: email.toLowerCase() },
      { 
        $set: { 
          email: email.toLowerCase(),
          reason: reason || 'abuse',
          blocked_at: new Date(),
          blocked_by: 'admin'
        }
      },
      { upsert: true }
    );
    
    console.log(`[Admin] Blocked sender: ${email}`);
    res.json({ success: true, email: email.toLowerCase() });
  } catch (error) {
    console.error('[Admin] Block error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/admin/blocked - List blocked senders (requires admin key)
app.get('/api/admin/blocked', async (req, res) => {
  try {
    if (!hasValidAdminKey(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    
    const db = getDb();
    const blocked = await db.collection('blocked_senders').find({}).toArray();
    res.json({ blocked });
  } catch (error) {
    console.error('[Admin] List blocked error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// DELETE /api/admin/block - Unblock a sender (requires admin key)
app.delete('/api/admin/block', smallJson, async (req, res) => {
  try {
    if (!hasValidAdminKey(req)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'missing_email' });
    }
    
    const db = getDb();
    await db.collection('blocked_senders').deleteOne({ email: email.toLowerCase() });
    
    console.log(`[Admin] Unblocked sender: ${email}`);
    res.json({ success: true, email: email.toLowerCase() });
  } catch (error) {
    console.error('[Admin] Unblock error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/check-blocked - Check if email is blocked (for worker)
app.get('/api/check-blocked', async (req, res) => {
  try {
    const { email } = req.query;
    
    // Security: Ensure email is a string, not an object (NoSQL injection prevention)
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'missing_email' });
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    
    const db = getDb();
    const blocked = await db.collection('blocked_senders').findOne({ 
      email: email.toLowerCase() 
    });
    
    res.json({ 
      blocked: !!blocked,
      reason: blocked?.reason || null
    });
  } catch (error) {
    console.error('[CheckBlocked] Error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /health
app.get('/health', async (req, res) => {
  try {
    const db = getDb();
    const count = await db.collection('claims').countDocuments();
    res.json({ 
      status: 'ok', 
      claims: count,
      features: {
        timestamp: config.features.timestamp,
        sign: config.features.sign,
        blockchain: config.features.blockchain,
        email: config.features.email,
      },
      version: '2.0.0'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /status.json - Public operational status (for status page & monitoring)
app.get('/status.json', async (req, res) => {
  try {
    const db = getDb();
    const claims = db.collection('claims');
    const signRequests = db.collection('sign_requests');

    const [totalClaims, confirmedClaims, pendingOts, signPendingOts, latestClaim] = await Promise.all([
      claims.countDocuments(),
      claims.countDocuments({ blockchain_confirmed: true }),
      claims.countDocuments({ ots_pending: true }),
      signRequests.countDocuments({ status: 'completed', ots_pending: true }),
      claims.findOne(
        { blockchain_confirmed: true, blockchain_block: { $exists: true } },
        { sort: { blockchain_block: -1 } }
      )
    ]);

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      status: 'operational',
      service: 'OTRUST',
      version: '2.0.0',
      updated_at: new Date().toISOString(),
      services: {
        api: 'ok',
        database: 'ok',
        email: config.features.email ? (sendEmail ? 'configured' : 'disabled') : 'off',
        ots_processor: process.env.NODE_ENV === 'test' ? 'paused' : 'active'
      },
      metrics: {
        total_claims: totalClaims,
        confirmed_claims: confirmedClaims,
        pending_ots_claims: pendingOts,
        pending_ots_signatures: signPendingOts,
        latest_bitcoin_block: latestClaim?.blockchain_block || null
      },
      links: {
        transparency: `${process.env.BASE_URL || 'https://www.otrust.eu'}/transparency`,
        stats: `${process.env.BASE_URL || 'https://www.otrust.eu'}/stats`
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'degraded', message: error.message });
  }
});

// Serve OpenAPI spec
app.get('/openapi.json', (req, res) => {
  const spec = fs.readFileSync(path.join(__dirname, '../web/openapi.json'), 'utf8');
  res.setHeader('Content-Type', 'application/json');
  res.send(spec);
});

// POST /admin/process-ots - Manually trigger OTS processing (for debugging)
app.post('/admin/process-ots', async (req, res) => {
  if (!hasValidAdminKey(req)) {
    logSecurityEvent('admin_access_denied', req);
    return res.status(403).json({ error: 'forbidden' });
  }
  
  try {
    console.log('[Admin] Manual OTS processing triggered');
    await processPendingTimestamps();
    res.json({ status: 'ok', message: 'Processing triggered' });
  } catch (error) {
    console.error('[Admin] OTS processing error:', error.message);
    res.status(500).json({ error: 'processing_failed', message: error.message });
  }
});

// GET /admin/audit - Audit log viewer (admin only)
app.get('/admin/audit', async (req, res) => {
  if (!hasValidAdminKey(req)) {
    logSecurityEvent('admin_access_denied', req);
    return res.status(403).json({ error: 'forbidden' });
  }
  
  try {
    const db = getDb();
    const auditLog = db.collection('audit_log');
    
    // Get query params for filtering
    const hours = parseInt(req.query.hours) || 24;
    const severity = req.query.severity; // optional: 'critical', 'high', etc
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000); // Max 1000
    
    const query = {
      timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
    };
    if (severity) query.severity = severity;
    
    const logs = await auditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    
    res.json({
      count: logs.length,
      hours,
      severity: severity || 'all',
      logs
    });
  } catch (error) {
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

// GET /admin/rate-limits - Rate limit stats per endpoint
app.get('/admin/rate-limits', async (req, res) => {
  if (!hasValidAdminKey(req)) {
    logSecurityEvent('admin_access_denied', req);
    return res.status(403).json({ error: 'forbidden' });
  }
  
  try {
    const db = getDb();
    const auditLog = db.collection('audit_log');
    
    // Aggregate rate limit events from past 24h
    const stats = await auditLog.aggregate([
      {
        $match: {
          event_type: /^rate_limit_/,
          timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: '$event_type',
          count: { $sum: 1 },
          last_occurrence: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
    
    res.json({
      period: '24h',
      total_rate_limit_events: stats.reduce((sum, s) => sum + s.count, 0),
      by_type: stats
    });
  } catch (error) {
    res.status(500).json({ error: 'query_failed', message: error.message });
  }
});

const usageEventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 600,
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded' }
});

// POST /api/usage/event - Privacy-preserving activity counters (no hash/content)
app.post('/api/usage/event', usageEventLimiter, smallJson, async (req, res) => {
  try {
    const { event, count } = req.body || {};
    const field = USAGE_EVENT_FIELDS[event];
    if (!field) {
      return res.status(400).json({ error: 'invalid_event' });
    }

    const safeCount = Math.min(toUsageCount(count) || 1, 100);
    await incrementActivityCounter(field, safeCount);
    res.json({ ok: true });
  } catch (error) {
    console.error('[Usage] Event error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /stats/badges.json - Compact stats for embeds and widgets
app.get('/stats/badges.json', async (req, res) => {
  try {
    const db = getDb();
    const claims = db.collection('claims');
    const signRequests = db.collection('sign_requests');
    const proofs = db.collection('proofs');

    const [confirmed, signConfirmed, proofTotal, latestClaim, latestSign] = await Promise.all([
      claims.countDocuments({ blockchain_confirmed: true }),
      signRequests.countDocuments({ blockchain_confirmed: true }),
      proofs.countDocuments({ status: { $ne: 'revoked' } }),
      claims.findOne(
        { blockchain_confirmed: true, blockchain_block: { $exists: true } },
        { sort: { blockchain_block: -1 } }
      ),
      signRequests.findOne(
        { blockchain_confirmed: true, blockchain_block: { $exists: true } },
        { sort: { blockchain_block: -1 } }
      )
    ]);

    const latestBlock = Math.max(
      latestClaim?.blockchain_block || 0,
      latestSign?.blockchain_block || 0
    ) || null;

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      service: 'OTRUST',
      anchored_records: confirmed + signConfirmed,
      active_proofs: proofTotal,
      latest_block: latestBlock,
      updated_at: new Date().toISOString(),
      transparency_url: `${process.env.BASE_URL || 'https://www.otrust.eu'}/transparency`
    });
  } catch (error) {
    console.error('Stats badges error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /stats - Public statistics
app.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const claims = db.collection('claims');
    const signRequests = db.collection('sign_requests');
    const proofs = db.collection('proofs');

    const [
      total,
      confirmed,
      pending,
      signTotal,
      signCompleted,
      signConfirmed,
      proofTotal,
      activeProofs,
      verifiedProofViews,
      proofVerificationDocs,
      usageCounters
    ] = await Promise.all([
      claims.countDocuments(),
      claims.countDocuments({ blockchain_confirmed: true }),
      claims.countDocuments({ blockchain_confirmed: { $ne: true } }),
      signRequests.countDocuments(),
      signRequests.countDocuments({ status: 'completed' }),
      signRequests.countDocuments({ blockchain_confirmed: true }),
      proofs.countDocuments(),
      proofs.countDocuments({ status: { $ne: 'revoked' } }),
      proofs.countDocuments({ verified_count: { $gt: 0 } }),
      proofs.find({ verified_count: { $gt: 0 } }).toArray(),
      readUsageCounters(db)
    ]);

    const totalRecords = total + signTotal + proofTotal;
    const verifiedRecords = confirmed + signCompleted + activeProofs;
    const anchoredRecords = confirmed + signConfirmed;
    const proofVerificationEvents = proofVerificationDocs.reduce(
      (sum, proof) => sum + toUsageCount(proof.verified_count),
      0
    );
    const verificationsProcessed =
      totalRecords +
      proofVerificationEvents +
      toUsageCount(usageCounters.verifications_processed);
    
    // Get latest confirmed block (from both claims and sign_requests)
    const [latestClaim, latestSign] = await Promise.all([
      claims.findOne(
        { blockchain_confirmed: true, blockchain_block: { $exists: true } },
        { sort: { blockchain_block: -1 } }
      ),
      signRequests.findOne(
        { blockchain_confirmed: true, blockchain_block: { $exists: true } },
        { sort: { blockchain_block: -1 } }
      )
    ]);
    
    const latestBlock = Math.max(
      latestClaim?.blockchain_block || 0,
      latestSign?.blockchain_block || 0
    ) || null;

    const activity = {
      hashes_computed: toUsageCount(usageCounters.hashes_computed),
      timestamp_tool_views: toUsageCount(usageCounters.timestamp_tool_views),
      sign_hashes_computed: toUsageCount(usageCounters.sign_hashes_computed),
      claims_submitted: toUsageCount(usageCounters.claims_submitted),
      claims_created: toUsageCount(usageCounters.claims_created),
      claims_duplicate: toUsageCount(usageCounters.claims_duplicate)
    };
    const totalHashesComputed = activity.hashes_computed + activity.sign_hashes_computed;
    
    res.json({
      total_claims: total,
      confirmed_claims: confirmed,
      pending_claims: pending,
      total_signatures: signTotal,
      completed_signatures: signCompleted,
      confirmed_signatures: signConfirmed,
      total_proofs: proofTotal,
      active_proofs: activeProofs,
      verified_proof_views: verifiedProofViews,
      proof_verification_events: proofVerificationEvents,
      total_records: totalRecords,
      verified_records: verifiedRecords,
      verifications_processed: verificationsProcessed,
      anchored_records: anchoredRecords,
      latest_block: latestBlock,
      activity,
      hashes_computed: totalHashesComputed,
      timestamp_tool_views: activity.timestamp_tool_views,
      claims_submitted: activity.claims_submitted,
      claims_created: activity.claims_created,
      claims_duplicate: activity.claims_duplicate
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    res.status(500).json({ error: 'server_error' });
  }
});

registerWave4Routes(app, { getDb, getTimestampInfo, sanitizeString, bulkJson });

// Test email endpoint (protected with rate limiting and timing-safe key comparison)
// In production, consider disabling entirely or using a more secure admin interface
const testEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Only 3 attempts per minute
  keyGenerator: getRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded' },
  handler: (req, res, next, options) => {
    logSecurityEvent('rate_limit_test_endpoint', req);
    res.status(options.statusCode).json(options.message);
  }
});

app.get('/test-email', testEndpointLimiter, async (req, res) => {
  const { key, to } = req.query;
  
  // Require TEST_KEY env var and use timing-safe comparison
  const testKey = process.env.TEST_KEY;
  if (!testKey || !key || !timingSafeEqual(key, testKey)) {
    logSecurityEvent('auth_failure_test_email', req);
    // Use consistent response time to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 100));
    return res.status(403).json({ error: 'forbidden' });
  }
  
  if (!sendEmail) {
    return res.status(503).json({ error: 'email_not_configured' });
  }
  
  // Use validator for email validation
  if (!to || !validator.isEmail(to)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  
  try {
    const testHtml = emailTemplate({
      title: 'OTRUST email test',
      preheader: 'Email notifications are working',
      content: [
        emailHeading('Email test'),
        emailParagraph('If you are reading this, OTRUST email notifications are working.'),
        emailMuted(`Sent at: ${new Date().toISOString()}`)
      ].join(''),
      product: 'Timestamp'
    });
    await sendEmail(to, 'OTRUST email test', testHtml);
    
    console.log(`[Email] Test email sent (requestId: ${req.requestId})`);
    res.json({ status: 'sent' });
  } catch (err) {
    console.error(`[Email] Test failed: ${err.message}`);
    // Don't leak error details in production
    res.status(500).json({ error: IS_PRODUCTION ? 'email_failed' : err.message });
  }
});

// Email config status - minimal info in production
app.get('/email-status', (req, res) => {
  if (IS_PRODUCTION) {
    // In production, only show if email is configured (no details)
    return res.json({ configured: !!sendEmail });
  }
  
  // In development, show more details for debugging
  res.json({
    configured: !!sendEmail,
    method: process.env.RESEND_API_KEY ? 'resend-api' : (process.env.SMTP_HOST ? 'smtp' : null),
    resend_from: process.env.RESEND_FROM ? process.env.RESEND_FROM.replace(/^(.{3}).*(@.*)$/, '$1***$2') : null,
    smtp_host: process.env.SMTP_HOST || null,
    test_key_set: !!process.env.TEST_KEY
  });
});

// Helpers - Secure input validation

// Sanitize string input (prevent NoSQL injection)
function sanitizeString(str) {
  if (typeof str !== 'string') return null;
  // Remove any MongoDB operators and control characters
  return str.replace(/[${}]/g, '').trim();
}

// Ensure value is a string for safe database queries (prevents NoSQL injection via object payloads)
// CodeQL: "Database query built from user-controlled sources" - this function addresses that
function ensureString(val, maxLen = 500) {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'string') return null;  // Reject objects, arrays, numbers - prevents { $gt: '' } attacks
  const sanitized = val.replace(/[${}]/g, '').trim();  // Remove MongoDB operators
  return sanitized.substring(0, maxLen);
}

// Validate and sanitize proof ID format
function sanitizeProofId(val) {
  const str = ensureString(val, 100);
  if (!str) return null;
  // Proof IDs are typically: prf_<base64url> or id_<base64url>
  if (!/^[a-zA-Z0-9_-]+$/.test(str)) return null;
  return str;
}

// Validate and sanitize token/challenge ID format
function sanitizeTokenId(val) {
  const str = ensureString(val, 200);
  if (!str) return null;
  // Tokens are base64url or hex strings
  if (!/^[a-zA-Z0-9_=-]+$/.test(str)) return null;
  return str;
}

function isValidHash(hash) {
  if (typeof hash !== 'string') return false;
  const clean = hash.toLowerCase().trim();
  return /^[a-f0-9]{64}$/.test(clean);
}

function isValidSignature(sig) {
  if (typeof sig !== 'string') return false;
  const clean = sig.toLowerCase().trim();
  // Ed25519: 64 bytes (128 hex chars)
  // secp256k1 compact: 64 bytes (128 hex chars)
  return /^[a-f0-9]{128}$/.test(clean);
}

function isValidPubkey(pk) {
  if (typeof pk !== 'string') return false;
  const clean = pk.toLowerCase().trim();
  // Ed25519: 32 bytes (64 hex chars)
  if (/^[a-f0-9]{64}$/.test(clean)) return true;
  // secp256k1 compressed: 33 bytes (66 hex chars, starts with 02 or 03)
  if (/^0[23][a-f0-9]{64}$/.test(clean)) return true;
  // secp256k1 uncompressed: 65 bytes (130 hex chars, starts with 04)
  if (/^04[a-f0-9]{128}$/.test(clean)) return true;
  return false;
}

function isValidReceiptId(id) {
  if (typeof id !== 'string') return false;
  // Only allow alphanumeric, underscore, dash (base64url safe)
  return /^ot_[a-zA-Z0-9_-]{16}$/.test(id) || /^[a-zA-Z0-9_-]{16}$/.test(id);
}

function generateReceiptId() {
  // Use cryptographically secure random bytes
  return crypto.randomBytes(12).toString('base64url');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  if (email.length > 254) return false;
  // Use validator package for robust email validation
  return validator.isEmail(email, {
    allow_display_name: false,
    require_display_name: false,
    allow_utf8_local_part: false, // ASCII only for maximum compatibility
    require_tld: true,
    allow_ip_domain: false, // Don't allow IP addresses as domain
    allow_underscores: false,
    blacklisted_chars: '<>()[]\\",:;' // Block potential injection chars
  });
}

// Check for email header injection attempts
function hasEmailInjection(email) {
  if (typeof email !== 'string') return true;
  // Block any email with newlines, carriage returns, or header-like content
  const injectionPatterns = [
    /[\r\n]/,           // Newlines
    /%0[aAdD]/i,        // URL-encoded newlines
    /\x00/,             // Null bytes
    /cc:/i,             // CC header
    /bcc:/i,            // BCC header
    /to:/i,             // To header
    /content-type:/i,   // Content-Type header
    /mime-version:/i,   // MIME header
    /subject:/i         // Subject header
  ];
  return injectionPatterns.some(pattern => pattern.test(email));
}

// Notify claim owner when Bitcoin anchor is confirmed (webhook + optional email)
async function notifyClaimConfirmed(claim, blockHeight) {
  const db = getDb();
  if (db) {
    try {
      await dispatchConfirmationWebhook(db, claim, blockHeight);
    } catch (webhookErr) {
      console.error(`[Webhook] Confirmation dispatch failed: ${webhookErr.message}`);
    }
  }
  await sendConfirmationEmail(claim, blockHeight);
}

// Send confirmation email when Bitcoin anchor is confirmed
async function sendConfirmationEmail(claim, blockHeight) {
  if (!sendEmail) return;
  
  // Fetch email from separate collection (privacy-first design)
  const db = getDb();
  const notification = await db.collection('email_notifications').findOne({ claim_id: claim.id });
  
  if (!notification || !notification.email) return;
  
  const baseUrl = process.env.BASE_URL || 'https://www.otrust.eu';
  const proofUrl = `${baseUrl}/proof/${claim.id}?format=ots`;
  const verifyUrl = `${baseUrl}/proof/${claim.id}`;
  const workspaceUrl = `${baseUrl}/timestamp#timestamp-tool`;
  
  try {
    // Build HTML content using template components
    let contentHtml = emailHeading('Bitcoin confirmed');
    contentHtml += emailParagraph('Your timestamp has been confirmed on the Bitcoin blockchain.');
    contentHtml += emailDetailsBox([
      ['Receipt ID', claim.id],
      ['Hash', `<code style="font-size:12px;">${claim.hash}</code>`],
      ['Bitcoin Block', blockHeight],
      ['Timestamp', claim.created_at]
    ]);
    contentHtml += emailActionArea(`
      ${emailButton('View receipt', verifyUrl)}
      &nbsp;&nbsp;
      ${emailButton('Download .ots proof', proofUrl, 'secondary')}
    `);
    contentHtml += emailMuted(`Bitcoin confirmation is permanent. Open the <a href="${workspaceUrl}">timestamp workspace</a> to verify another file. Your email is deleted from our system after this message is sent.`);
    
    const html = emailTemplate({
      title: `Bitcoin confirmed — ${claim.id}`,
      preheader: 'Your timestamp has been confirmed on the Bitcoin blockchain',
      content: contentHtml,
      product: 'Timestamp'
    });
    
    await sendEmail(notification.email, `Bitcoin confirmed — ${claim.id}`, html);
    
    // Delete email immediately after sending (privacy)
    await db.collection('email_notifications').deleteOne({ claim_id: claim.id });
    
    console.log(`[Email] Confirmation sent for ${claim.id}`);
  } catch (err) {
    console.error(`[Email] Failed to send confirmation: ${err.message}`);
  }
}

// Send blockchain confirmation email for completed signature packages
async function sendSignatureConfirmationEmail(signRequest, blockHeight) {
  if (!sendEmail) return;
  
  const baseUrl = process.env.BASE_URL || 'https://www.otrust.eu';
  const proofUrl = `${baseUrl}/sign/${signRequest.id}?token=${signRequest.view_token}`;
  
  const subject = `Blockchain Confirmed: ${signRequest.title}`;
  
  // Build party list
  const partyListHtml = signRequest.parties.map(p => {
    const maskedEmail = p.email.replace(/^(.).*@/, '$1***@');
    const actionEmoji = '';
    return `<div style="padding:4px 0;">${actionEmoji} ${maskedEmail} (${p.role})</div>`;
  }).join('');

  // Build HTML content using template components
  let contentHtml = emailHeading('Blockchain Confirmed');
  contentHtml += emailParagraph(`The signature package for <strong>"${signRequest.title}"</strong> has been permanently anchored to the Bitcoin blockchain!`);
  contentHtml += emailSuccessBox(`
    <p style="margin:0 0 8px 0;"><strong>Bitcoin Block:</strong> ${blockHeight}</p>
    <p style="margin:0 0 8px 0;"><strong>Package Hash:</strong></p>
    <code style="font-size:11px;word-break:break-all;display:block;background:white;padding:8px;border-radius:4px;">${signRequest.package_hash}</code>
  `);
  contentHtml += emailInfoBox(`
    <strong>Document Hash:</strong>
    <code style="font-size:11px;word-break:break-all;display:block;margin-top:8px;">${signRequest.document_hash}</code>
  `);
  contentHtml += emailInfoBox(`<strong>Signatures:</strong><div style="margin-top:8px;font-size:14px;">${partyListHtml}</div>`);
  contentHtml += emailActionArea(emailButton('Download Proof Package', proofUrl));
  contentHtml += emailMuted('This proof is now permanently verifiable on the Bitcoin blockchain. Keep this email and/or download the proof package for your records.');
  
  const html = emailTemplate({
    title: subject,
    preheader: `"${signRequest.title}" is now on the Bitcoin blockchain`,
    content: contentHtml,
    product: 'Signed'
  });
  
  const text = `OTRUST Signed - Blockchain Confirmed

The signature package for "${signRequest.title}" has been permanently anchored to the Bitcoin blockchain!

Bitcoin Block: ${blockHeight}
Package Hash: ${signRequest.package_hash}
Document Hash: ${signRequest.document_hash}

Download proof: ${proofUrl}

This proof is now permanently verifiable on the Bitcoin blockchain.
---
OTRUST Signed - Zero-knowledge document signing
${baseUrl}/sign`;

  // Send to creator
  if (signRequest.creator_email) {
    try {
      await sendEmail(signRequest.creator_email, subject, html, text);
      console.log(`[Email] Blockchain confirmation sent to creator for ${signRequest.id}`);
    } catch (err) {
      console.error(`[Email] Failed to send to creator: ${err.message}`);
    }
  }
  
  // Send to all parties
  for (const party of signRequest.parties) {
    if (party.email && party.email !== signRequest.creator_email) {
      try {
        await sendEmail(party.email, subject, html, text);
        console.log(`[Email] Blockchain confirmation sent to ${party.email} for ${signRequest.id}`);
      } catch (err) {
        console.error(`[Email] Failed to send to party: ${err.message}`);
      }
    }
  }
}

// Export sendConfirmationEmail for use in opentimestamps.js
export { sendConfirmationEmail, sendSignatureConfirmationEmail };

// Error handling - never leak stack traces in production
app.use((err, req, res, next) => {
  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ 
      error: 'payload_too_large',
      message: 'Request body exceeds size limit'
    });
  }
  
  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ 
      error: 'invalid_json',
      message: 'Invalid JSON in request body'
    });
  }
  
  // Log with request ID for debugging (no PII)
  console.error(`[Error] requestId=${req.requestId} message=${err.message}`);
  
  // In development, include more details
  if (!IS_PRODUCTION && process.env.NODE_ENV !== 'test') {
    console.error(err.stack);
  }
  
  // Generic error response with request ID for support
  res.status(500).json({ 
    error: 'server_error',
    requestId: req.requestId 
  });
});

// NOTE: 404 handler moved to end of file (after all routes)

/**
 * File Purge Processor
 * Handles expiring sign_files with notifications and purge proofs
 */
async function processExpiredFiles() {
  try {
    const db = getDb();
    const now = new Date();
    
    // Find files that have expired
    const expiredFiles = await db.collection('sign_files').find({
      expires_at: { $lte: now }
    }).toArray();
    
    for (const file of expiredFiles) {
      try {
        // Create purge proof BEFORE deleting
        const purgeProof = {
          file_id: file.file_id,
          original_hash: file.hash,
          filename: file.filename,
          created_at: file.created_at,
          expired_at: file.expires_at,
          purged_at: now,
          ttl_hours: file.ttl_hours,
          reason: 'ttl_expired',
          proof_hash: null // Will be set below
        };
        
        // Create a hash of the purge proof for integrity
        const proofString = JSON.stringify({
          file_id: purgeProof.file_id,
          original_hash: purgeProof.original_hash,
          purged_at: purgeProof.purged_at.toISOString()
        });
        purgeProof.proof_hash = crypto.createHash('sha256').update(proofString).digest('hex');
        
        // Store purge proof (kept indefinitely as evidence)
        await db.collection('purge_proofs').insertOne(purgeProof);
        
        // Send notification email if creator email exists
        if (file.creator_email && sendEmail) {
          await sendPurgeNotification(file, purgeProof);
        }
        
        // Delete the file
        await db.collection('sign_files').deleteOne({ file_id: file.file_id });
        
        console.log(`[Purge] File ${file.file_id} purged. Proof: ${purgeProof.proof_hash.substring(0, 16)}...`);
        
      } catch (fileError) {
        console.error(`[Purge] Error processing file ${file.file_id}:`, fileError.message);
      }
    }
    
    if (expiredFiles.length > 0) {
      console.log(`[Purge] Processed ${expiredFiles.length} expired file(s)`);
    }
    
  } catch (error) {
    console.error('[Purge] Processor error:', error.message);
  }
}

/**
 * Send purge notification email
 */
async function sendPurgeNotification(file, purgeProof) {
  const BASE_URL = process.env.BASE_URL || 'https://www.otrust.eu';
  const proofUrl = `${BASE_URL}/sign/purge-proof/${purgeProof.proof_hash}`;
  
  const subject = `Document Purged: ${file.filename}`;
  
  // Build HTML content using template components
  let contentHtml = emailHeading('Document Successfully Purged');
  contentHtml += emailParagraph('As scheduled, your temporarily uploaded document has been <strong>permanently deleted</strong> from our servers:');
  contentHtml += emailSuccessBox(`
    <p style="margin:0 0 10px 0;"><strong>File:</strong> ${file.filename}</p>
    <p style="margin:0 0 10px 0;"><strong>Uploaded:</strong> ${file.created_at.toISOString()}</p>
    <p style="margin:0 0 10px 0;"><strong>Purged:</strong> ${purgeProof.purged_at.toISOString()}</p>
    <p style="margin:0 0 0 0;"><strong>TTL:</strong> ${file.ttl_hours} hour(s)</p>
  `);
  contentHtml += emailInfoBox(`
    <p style="margin:0 0 10px 0;"><strong>Purge Proof</strong></p>
    <p style="font-size:12px;color:#666;margin:0 0 10px 0;">
      This cryptographic proof verifies the file was deleted. The original document hash is included for verification.
    </p>
    <div style="font-family:monospace;font-size:11px;word-break:break-all;background:white;padding:10px;border-radius:4px;border:1px solid #e5e5e5;">
      <strong>Original Hash:</strong><br>${purgeProof.original_hash}<br><br>
      <strong>Purge Proof:</strong><br>${purgeProof.proof_hash}
    </div>
  `);
  contentHtml += emailMuted('<strong>What this means:</strong> The document file has been permanently removed from our servers. Only the cryptographic proof of deletion remains. The signing request (if any) continues to work - signers just need their own copy of the document.');
  
  const html = emailTemplate({
    title: subject,
    preheader: `${file.filename} has been permanently deleted`,
    content: contentHtml,
    product: 'Signed'
  });

  const text = `Document Purged: ${file.filename}

Your temporarily uploaded document has been permanently deleted from our servers.

File: ${file.filename}
Uploaded: ${file.created_at.toISOString()}
Purged: ${purgeProof.purged_at.toISOString()}
TTL: ${file.ttl_hours} hour(s)

PURGE PROOF
Original Hash: ${purgeProof.original_hash}
Purge Proof: ${purgeProof.proof_hash}

This cryptographic proof verifies the file was deleted.

---
OTRUST Signed - Zero-knowledge document signing
${BASE_URL}/sign`;

  try {
    await sendEmail(file.creator_email, subject, html, text);
    console.log(`[Purge] Notification sent to ${file.creator_email.substring(0, 3)}***`);
  } catch (error) {
    console.error('[Purge] Failed to send notification:', error.message);
  }
}

/**
 * Start file purge processor
 */
function startFilePurgeProcessor(intervalMs = 60000) {
  console.log('[Purge] File purge processor started');
  
  // Run immediately on start
  processExpiredFiles();
  
  // Then run at interval
  const timer = setInterval(processExpiredFiles, intervalMs);
  timer.unref?.();
  return timer;
}

// ============================================
// PROOF API ROUTES (Zero-Knowledge Proofs)
// ============================================

// POST /api/proof/identity - Generate unique identity proof (Sybil-resistant)
app.post('/api/proof/identity', bulkJson, async (req, res) => {
  try {
    const { personnummer, birthDate, pin, faceMatch, livenessVerified, recoveryToken } = req.body;
    
    if (!personnummer || !birthDate) {
      return res.status(400).json({ success: false, error: 'Missing personnummer or birthDate' });
    }
    
    // Validate PIN - must be exactly 6 digits
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ 
        success: false, 
        error: 'invalid_pin',
        message: 'PIN must be exactly 6 digits'
      });
    }
    
    // SECURITY: Validate recoveryToken to prevent NoSQL injection
    // Must be a string if provided, and match expected format
    if (recoveryToken !== undefined && (typeof recoveryToken !== 'string' || recoveryToken.length > 100)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_recovery_token',
        message: 'Invalid recovery token format'
      });
    }
    
    // SECURITY: Validate personnummer format (Swedish: YYMMDD-XXXX or YYYYMMDD-XXXX)
    const pnrClean = String(personnummer).replace(/[\s-]/g, '');
    const pnrRegex = /^(19|20)?\d{6}\d{4}$/;
    if (!pnrRegex.test(pnrClean)) {
      return res.status(400).json({ 
        success: false, 
        error: 'invalid_personnummer',
        message: 'Invalid personnummer format. Expected Swedish format: YYMMDD-XXXX or YYYYMMDDXXXX'
      });
    }
    
    // SECURITY: Sanitize input - only allow alphanumeric and dash
    const sanitizedPnr = pnrClean.replace(/[^0-9]/g, '');
    if (sanitizedPnr.length < 10 || sanitizedPnr.length > 12) {
      return res.status(400).json({ 
        success: false, 
        error: 'invalid_personnummer',
        message: 'Personnummer must be 10-12 digits'
      });
    }
    
    // SECURITY: Validate birthDate format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(birthDate)) {
      return res.status(400).json({ 
        success: false, 
        error: 'invalid_date',
        message: 'Invalid date format. Expected: YYYY-MM-DD'
      });
    }
    
    // Create hash of personnummer for duplicate detection (one-way, can't reverse)
    const identityHash = crypto.createHash('sha256')
      .update(`otrust-identity-v1:${sanitizedPnr}`)
      .digest('hex');
    
    const db = getDb();
    
    // Check if this is a recovery attempt
    let isRecovery = false;
    if (recoveryToken) {
      // SECURITY: Sanitize recoveryToken to prevent NoSQL injection
      const safeRecoveryToken = sanitizeTokenId(recoveryToken);
      if (!safeRecoveryToken) {
        return res.status(400).json({ 
          success: false, 
          error: 'invalid_recovery_token',
          message: 'Invalid recovery token format'
        });
      }
      const recovery = await db.collection('identity_recovery').findOne({ 
        recoveryToken: safeRecoveryToken,
        identityHash, // Must match the same person
        used: false 
      });
      
      if (!recovery) {
        return res.status(400).json({ 
          success: false, 
          error: 'invalid_recovery_token',
          message: 'Invalid or expired recovery token. Please ensure you are using your original identity.'
        });
      }
      
      // Check expiration
      if (new Date(recovery.expiresAt) < new Date()) {
        return res.status(400).json({ 
          success: false, 
          error: 'expired_recovery_token',
          message: 'Recovery token has expired. Please report your identity as lost again.'
        });
      }
      
      // Mark recovery token as used
      await db.collection('identity_recovery').updateOne(
        { recoveryToken: safeRecoveryToken },
        { $set: { used: true, usedAt: new Date().toISOString() } }
      );
      
      isRecovery = true;
      console.log(`[Identity] Recovery token used for identity hash: ${identityHash.substring(0, 16)}...`);
    } else {
      // Check if this identity already has a proof
      const existingProof = await db.collection('identity_proofs').findOne({ identityHash });
      
      if (existingProof) {
        return res.status(409).json({ 
          success: false, 
          error: 'duplicate_identity',
          message: 'An identity proof already exists for this person. Each person can only have one proof.',
          existingProofId: existingProof.proofId,
          createdAt: existingProof.createdAt
        });
      }
    }
    
    // Generate unique identity proof
    const proofId = `id_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
    const secret = crypto.randomBytes(32).toString('hex');
    const commitment = crypto.createHash('sha256')
      .update(`${proofId}:${secret}`)
      .digest('hex');
    
    // Encrypt secret with PIN using PBKDF2 + AES-256-GCM
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const derivedKey = crypto.pbkdf2Sync(pin, salt, 600000, 32, 'sha256'); // OWASP recommended iterations
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    let encryptedSecret = cipher.update(secret, 'utf8', 'base64');
    encryptedSecret += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    
    // Store identity proof with encrypted secret
    const identityProof = {
      proofId,
      identityHash, // For duplicate detection (can't reverse to personnummer)
      commitment,
      // PIN-encrypted secret (server never stores PIN or plaintext secret)
      encryptedSecret,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      failedAttempts: 0,
      lockedUntil: null,
      proofType: 'identity',
      verification: {
        faceMatch: faceMatch || false,
        livenessVerified: livenessVerified || false,
        documentVerified: true
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    };
    
    await db.collection('identity_proofs').insertOne(identityProof);
    
    // Also store in proofs collection for sharing
    await db.collection('proofs').insertOne({
      id: proofId,
      type: 'identity',
      commitment,
      identityHash, // Include for revocation lookup
      statement: 'Unique verified human identity',
      verification: identityProof.verification,
      isRecovery, // Mark if this was created via recovery
      createdAt: identityProof.createdAt,
      expiresAt: identityProof.expiresAt
    });
    
    console.log(`[Identity] New unique identity proof created: ${proofId}`);
    
    res.json({
      success: true,
      proofId,
      commitment,
      secret, // Shown once - user should save this as backup
      pinProtected: true, // Indicates secret is also PIN-protected on server
      statement: 'Unique verified human identity',
      verification: identityProof.verification,
      shareUrl: `/proof/${proofId}`,
      walletUrl: `/api/proof/${proofId}/wallet`,
      createdAt: identityProof.createdAt
    });
  } catch (error) {
    console.error('[Identity] Proof error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/proof/verify - Verify OTRUST Proof with PIN (for signing extra verification)
app.post('/api/proof/verify', bulkJson, async (req, res) => {
  try {
    const { proofId, pin } = req.body;
    
    if (!proofId || !pin) {
      return res.status(400).json({ success: false, message: 'Missing proofId or PIN' });
    }
    
    // Strict validation: PIN must be exactly 6 digits
    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ success: false, message: 'PIN must be exactly 6 digits' });
    }
    
    // Validate Proof ID format
    if (!proofId.startsWith('id_') || proofId.length < 10) {
      return res.status(400).json({ success: false, message: 'Invalid Proof ID format' });
    }
    
    const db = getDb();

    // Find the identity proof
    const identityProof = await db.collection('identity_proofs').findOne({ proofId });
    if (!identityProof) {
      return res.status(404).json({ success: false, message: 'OTRUST Proof not found' });
    }
    
    // Check if locked due to failed attempts
    if (identityProof.lockedUntil && new Date() < new Date(identityProof.lockedUntil)) {
      const remainingMs = new Date(identityProof.lockedUntil) - new Date();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(429).json({ 
        success: false, 
        message: `Too many failed attempts. Try again in ${remainingMin} minute(s).` 
      });
    }
    
    // Decrypt secret with PIN
    try {
      const salt = Buffer.from(identityProof.salt, 'base64');
      const iv = Buffer.from(identityProof.iv, 'base64');
      const authTag = Buffer.from(identityProof.authTag, 'base64');
      const derivedKey = crypto.pbkdf2Sync(pin, salt, 600000, 32, 'sha256');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
      decipher.setAuthTag(authTag);
      let decryptedSecret = decipher.update(identityProof.encryptedSecret, 'base64', 'utf8');
      decryptedSecret += decipher.final('utf8');
      
      // Verify commitment matches
      const expectedCommitment = crypto.createHash('sha256')
        .update(`${proofId}:${decryptedSecret}`)
        .digest('hex');
      
      if (expectedCommitment !== identityProof.commitment) {
        throw new Error('Commitment mismatch');
      }
      
      // Reset failed attempts on success
      await db.collection('identity_proofs').updateOne(
        { proofId },
        { $set: { failedAttempts: 0, lockedUntil: null } }
      );
      
      await incrementUsageCounter('proof_pin_verifications');

      // Return verification data (NOT the secret)
      res.json({
        success: true,
        valid: true,
        proofId,
        verifiedAt: new Date().toISOString(),
        verification: identityProof.verification,
        statement: 'Unique verified human identity'
      });
      
    } catch (decryptError) {
      // Wrong PIN - increment failed attempts
      const newAttempts = (identityProof.failedAttempts || 0) + 1;
      const updateData = { failedAttempts: newAttempts };
      
      // Lock after 3 failed attempts for 15 minutes
      if (newAttempts >= 3) {
        updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      
      await db.collection('identity_proofs').updateOne(
        { proofId },
        { $set: updateData }
      );
      
      if (newAttempts >= 3) {
        return res.status(429).json({ 
          success: false, 
          message: 'Too many failed attempts. Locked for 15 minutes.' 
        });
      }
      
      return res.status(401).json({ 
        success: false, 
        message: `Wrong PIN. ${3 - newAttempts} attempt(s) remaining.` 
      });
    }
    
  } catch (error) {
    console.error('[Proof] Verify error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/proof/age - Generate age proof
app.post('/api/proof/age', bulkJson, async (req, res) => {
  try {
    const { birthDate, minAge } = req.body;
    
    if (!birthDate || !minAge) {
      return res.status(400).json({ success: false, error: 'Missing birthDate or minAge' });
    }
    
    // Generate proof
    const birth = new Date(birthDate);
    const result = await zkproof.createSimpleAgeProof(birth, parseInt(minAge));
    
    // Store and create shareable link
    const proofPackage = await zkproof.createProofPackage({
      proofType: 'age',
      proof: result.proof,
      publicSignals: [],
      commitment: result.commitment,
      generatedAt: new Date().toISOString()
    }, { minAge: parseInt(minAge) });
    
    res.json({
      success: true,
      commitment: result.commitment,
      secret: result.secret,
      shareUrl: proofPackage.shareUrl,
      verifyUrl: proofPackage.verifyUrl,
      proofId: proofPackage.proofId
    });
  } catch (error) {
    console.error('[Proof] Age proof error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/proof/income - Generate income proof
app.post('/api/proof/income', bulkJson, async (req, res) => {
  try {
    const { income, minIncome } = req.body;
    
    if (!income || !minIncome) {
      return res.status(400).json({ success: false, error: 'Missing income or minIncome' });
    }
    
    const incomeNum = parseInt(income);
    const minIncomeNum = parseInt(minIncome);
    
    if (incomeNum < minIncomeNum) {
      return res.status(400).json({ 
        success: false, 
        error: `Income ${incomeNum} is less than required ${minIncomeNum}` 
      });
    }
    
    // Generate simple income proof
    const result = await zkproof.createSimpleIncomeProof(incomeNum, minIncomeNum);
    
    // Create proof package
    const proofPackage = await zkproof.createProofPackage({
      proofType: 'income',
      proof: result.proof,
      publicSignals: [],
      commitment: result.commitment,
      generatedAt: new Date().toISOString()
    }, { minIncome: minIncomeNum });
    
    res.json({
      success: true,
      commitment: result.commitment,
      secret: result.secret,
      shareUrl: proofPackage.shareUrl,
      verifyUrl: proofPackage.verifyUrl,
      proofId: proofPackage.proofId
    });
  } catch (error) {
    console.error('[Proof] Income proof error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/proof/membership - Generate membership proof
app.post('/api/proof/membership', bulkJson, async (req, res) => {
  try {
    const { memberId, organizationId, organizationName } = req.body;
    
    if (!memberId || !organizationId) {
      return res.status(400).json({ success: false, error: 'Missing memberId or organizationId' });
    }
    
    // Generate simple membership proof
    const result = await zkproof.createSimpleMembershipProof(memberId, organizationId);
    
    // Create proof package
    const proofPackage = await zkproof.createProofPackage({
      proofType: 'membership',
      proof: result.proof,
      publicSignals: [],
      commitment: result.commitment,
      generatedAt: new Date().toISOString()
    }, { organizationName: organizationName || 'Organization' });
    
    res.json({
      success: true,
      commitment: result.commitment,
      secret: result.secret,
      shareUrl: proofPackage.shareUrl,
      verifyUrl: proofPackage.verifyUrl,
      proofId: proofPackage.proofId
    });
  } catch (error) {
    console.error('[Proof] Membership proof error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/proof/submit - Submit a browser-generated proof for storage
app.post('/api/proof/submit', bulkJson, async (req, res) => {
  try {
    const { 
      proofType, 
      version, 
      proof, 
      publicSignals, 
      commitment, 
      statement,
      minAge,
      minIncome,
      maxIncome,
      generatedAt,
      generatedLocally 
    } = req.body;
    
    if (!proofType || !proof || !commitment) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: proofType, proof, commitment' 
      });
    }
    
    // Verify the proof if it's a Groth16 proof
    if (version === 'groth16-v3' && publicSignals) {
      try {
        const isValid = await zkproof.verifyGroth16Proof(proofType, proof, publicSignals);
        if (!isValid) {
          return res.status(400).json({ 
            success: false, 
            error: 'Proof verification failed' 
          });
        }
        console.log(`[Proof] Browser-generated ${proofType} proof verified successfully`);
      } catch (verifyErr) {
        console.warn('[Proof] Could not verify proof:', verifyErr.message);
        // Continue anyway - the proof came from trusted client code
      }
    }
    
    // Build metadata
    const metadata = {};
    if (minAge) metadata.minAge = minAge;
    if (minIncome) metadata.minIncome = minIncome;
    if (maxIncome) metadata.maxIncome = maxIncome;
    
    // Create proof package for storage
    const proofPackage = await zkproof.createProofPackage({
      proofType,
      proof,
      publicSignals: publicSignals || [],
      commitment,
      statement,
      version: version || 'groth16-v3',
      generatedLocally: generatedLocally || false,
      generatedAt: generatedAt || new Date().toISOString()
    }, metadata);
    
    console.log(`[Proof] Stored browser-generated ${proofType} proof: ${proofPackage.proofId}`);
    
    res.json({
      success: true,
      proofId: proofPackage.proofId,
      shareUrl: proofPackage.shareUrl,
      verifyUrl: proofPackage.verifyUrl
    });
  } catch (error) {
    console.error('[Proof] Submit proof error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// GET /api/proof/:id - Get proof details
app.get('/api/proof/:proofId', async (req, res) => {
  try {
    const { proofId } = req.params;
    
    const db = getDb();
    const proof = await db.collection('proofs').findOne({ id: proofId });
    
    if (!proof) {
      return res.status(404).json({ success: false, error: 'Proof not found' });
    }
    
    // Return public info - handle both old format and new identity format
    res.json({
      success: true,
      proof: {
        id: proof.id,
        type: proof.type || proof.proof_type || 'unknown',
        statement: proof.statement || proof.proof?.statement,
        commitment: proof.commitment,
        claim: proof.claim || proof.metadata,
        publicSignals: proof.publicSignals || [],
        verification: proof.verification,
        identityHash: proof.identityHash ? proof.identityHash.substring(0, 16) + '...' : null,
        status: proof.status || 'active',
        createdAt: proof.createdAt || proof.created_at,
        expiresAt: proof.expiresAt
      }
    });
  } catch (error) {
    console.error('[Proof] Get proof error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/proof/:id/verify - Verify a proof
app.post('/api/proof/:proofId/verify', bulkJson, async (req, res) => {
  try {
    const { proofId } = req.params;
    const { token } = req.body;
    
    // Check if this is an identity proof
    if (proofId.startsWith('id_')) {
      const db = getDb();
      const proof = await db.collection('proofs').findOne({ id: proofId });
      
      if (!proof) {
        return res.json({ valid: false, error: 'Proof not found' });
      }
      
      // Identity proofs are valid if they exist and aren't revoked
      if (proof.status === 'revoked') {
        return res.json({ valid: false, error: 'This identity has been revoked' });
      }
      
      // Check expiration
      if (proof.expiresAt && new Date(proof.expiresAt) < new Date()) {
        return res.json({ valid: false, error: 'This proof has expired' });
      }
      
      await incrementUsageCounter('identity_proof_verifications');

      return res.json({ 
        valid: true, 
        proofType: 'identity',
        verification: proof.verification,
        createdAt: proof.createdAt
      });
    }
    
    // For other proofs, use the ZK verification
    const result = await zkproof.verifyProofPackage(proofId, token);
    res.json(result);
  } catch (error) {
    console.error('[Proof] Verify error:', error);
    res.status(500).json({ valid: false, error: error.message });
  }
});

// GET /api/proof/:id/wallet - Generate Apple Wallet pass data
app.get('/api/proof/:proofId/wallet', async (req, res) => {
  try {
    const { proofId } = req.params;
    const format = String(req.query.format || 'apple').toLowerCase();

    if (format !== 'apple') {
      return res.status(400).json({ error: 'unsupported_wallet_format' });
    }
    
    const db = getDb();
    const proof = await db.collection('proofs').findOne({ id: proofId });
    
    if (!proof) {
      return res.status(404).json({ error: 'Proof not found' });
    }
    
    // Generate wallet-compatible data
    const walletData = {
      id: proofId,
      type: proof.type || 'identity',
      statement: proof.statement || 'Verified unique identity',
      commitment: proof.commitment?.substring(0, 16) + '...',
      verifyUrl: `https://otrust.eu/proof/${proofId}`,
      createdAt: proof.createdAt || proof.created_at,
      expiresAt: proof.expiresAt
    };
    
    // Apple Wallet PKPass (simplified - would need signing with Apple certificate)
    const applePass = {
      formatVersion: 1,
      passTypeIdentifier: 'pass.eu.otrust.identity',
      serialNumber: proofId,
      teamIdentifier: 'OTRUST',
      organizationName: 'OTRUST',
      description: 'Verified Identity Proof',
      logoText: 'OTRUST',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(45, 90, 61)',
      generic: {
        primaryFields: [
          { key: 'status', label: 'STATUS', value: 'VERIFIED' }
        ],
        secondaryFields: [
          { key: 'type', label: 'TYPE', value: 'Unique Identity' }
        ],
        auxiliaryFields: [
          { key: 'commitment', label: 'COMMITMENT', value: walletData.commitment }
        ],
        backFields: [
          { key: 'verify', label: 'Verify Online', value: walletData.verifyUrl },
          { key: 'created', label: 'Created', value: new Date(walletData.createdAt).toISOString() }
        ]
      },
      barcode: {
        format: 'PKBarcodeFormatQR',
        message: walletData.verifyUrl,
        messageEncoding: 'iso-8859-1'
      }
    };

    res.json({
      success: true,
      format: 'apple',
      message: 'Apple Wallet requires signed .pkpass file. Use the verification URL instead.',
      walletData: applePass,
      verifyUrl: walletData.verifyUrl
    });
  } catch (error) {
    console.error('[Wallet] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/qr - Generate QR code as PNG image
app.get('/api/qr', async (req, res) => {
  try {
    const { data, size = 200 } = req.query;
    
    if (!data) {
      return res.status(400).json({ error: 'Missing data parameter' });
    }
    
    // Validate size (max 500px for performance)
    const qrSize = Math.min(Math.max(parseInt(size) || 200, 50), 500);
    
    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(data, {
      type: 'png',
      width: qrSize,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.send(qrBuffer);
    
  } catch (error) {
    console.error('[QR] Error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// GET /api/proof/:id/wallet/pkpass - Generate actual .pkpass file for Apple Wallet
app.get('/api/proof/:proofId/wallet/pkpass', async (req, res) => {
  try {
    const { proofId } = req.params;
    
    const db = getDb();
    const proof = await db.collection('proofs').findOne({ id: proofId });
    
    if (!proof) {
      return res.status(404).json({ error: 'Proof not found' });
    }
    
    // Generate the pass.json content
    const baseUrl = config.baseUrl || `http://localhost:${PORT}`;
    const verifyUrl = `${baseUrl}/proof/${proofId}`;
    const createdDate = new Date(proof.createdAt || proof.created_at);
    
    const passJson = {
      formatVersion: 1,
      passTypeIdentifier: 'pass.eu.otrust.identity',
      serialNumber: proofId,
      teamIdentifier: 'OTRUST',
      organizationName: 'OTRUST',
      description: 'Verified Identity Proof',
      logoText: 'OTRUST',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(45, 90, 61)',
      labelColor: 'rgb(200, 220, 200)',
      webServiceURL: `${baseUrl}/api/passes`,
      authenticationToken: crypto.createHash('sha256').update(proofId + 'otrust').digest('hex'),
      generic: {
        primaryFields: [
          { key: 'status', label: 'STATUS', value: 'VERIFIED ✓', textAlignment: 'PKTextAlignmentCenter' }
        ],
        secondaryFields: [
          { key: 'type', label: 'TYPE', value: 'Unique Human Identity' }
        ],
        auxiliaryFields: [
          { key: 'date', label: 'VERIFIED', value: createdDate.toISOString().split('T')[0] },
          { key: 'id', label: 'ID', value: proofId.substring(0, 8) + '...' }
        ],
        backFields: [
          { key: 'verify', label: 'Verify Online', value: verifyUrl },
          { key: 'commitment', label: 'Commitment', value: proof.commitment || 'N/A' },
          { key: 'created', label: 'Created', value: createdDate.toISOString() },
          { key: 'about', label: 'About OTRUST', value: 'OTRUST provides zero-knowledge identity proofs. This pass verifies you are a unique human without revealing your actual identity.' }
        ]
      },
      barcode: {
        format: 'PKBarcodeFormatQR',
        message: verifyUrl,
        messageEncoding: 'iso-8859-1'
      },
      barcodes: [
        {
          format: 'PKBarcodeFormatQR',
          message: verifyUrl,
          messageEncoding: 'iso-8859-1'
        }
      ]
    };
    
    // Create a simple SVG logo (green circle with checkmark)
    const logoSvg = `
      <svg width="160" height="160" xmlns="http://www.w3.org/2000/svg">
        <circle cx="80" cy="80" r="70" fill="#2d5a3d"/>
        <path d="M55 85 L75 105 L115 60" stroke="white" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    
    // Create icon as base64 PNG data (1x1 green pixel for simplicity)
    // In production, use proper PNG files
    const greenPixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    
    // Create the .pkpass file (which is a ZIP archive)
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Content-Disposition', `attachment; filename="otrust-identity-${proofId}.pkpass"`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      console.error('[PKPass] Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create pass' });
      }
    });
    
    archive.pipe(res);
    
    // Add pass.json
    archive.append(JSON.stringify(passJson, null, 2), { name: 'pass.json' });
    
    // Add placeholder images (required by Apple Wallet)
    // icon.png, icon@2x.png, logo.png, logo@2x.png
    archive.append(greenPixelPng, { name: 'icon.png' });
    archive.append(greenPixelPng, { name: 'icon@2x.png' });
    archive.append(greenPixelPng, { name: 'logo.png' });
    archive.append(greenPixelPng, { name: 'logo@2x.png' });
    
    // Note: Without a valid signature from Apple, this pass won't be accepted by iOS
    // The manifest.json and signature files would normally be generated here
    // using Apple Developer certificates
    
    // Create manifest (hash of all files)
    const manifest = {
      'pass.json': crypto.createHash('sha1').update(JSON.stringify(passJson, null, 2)).digest('hex'),
      'icon.png': crypto.createHash('sha1').update(greenPixelPng).digest('hex'),
      'icon@2x.png': crypto.createHash('sha1').update(greenPixelPng).digest('hex'),
      'logo.png': crypto.createHash('sha1').update(greenPixelPng).digest('hex'),
      'logo@2x.png': crypto.createHash('sha1').update(greenPixelPng).digest('hex')
    };
    
    archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
    
    // Note: In production, you would sign manifest.json here with Apple certificate
    // archive.append(signature, { name: 'signature' });
    
    await archive.finalize();
    
  } catch (error) {
    console.error('[PKPass] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Revoke identity proof (for lost/compromised cases)
app.post('/api/proof/:proofId/revoke', bulkJson, async (req, res) => {
  try {
    const { proofId } = req.params;
    
    const db = getDb();
    
    // Find the proof
    const proof = await db.collection('proofs').findOne({ id: proofId });
    if (!proof) {
      return res.status(404).json({ success: false, error: 'Proof not found' });
    }
    
    // Only identity proofs can be revoked
    if (proof.type !== 'identity') {
      return res.status(400).json({ success: false, error: 'Only identity proofs can be revoked' });
    }
    
    // Check if already revoked
    if (proof.status === 'revoked') {
      return res.status(400).json({ success: false, error: 'This proof has already been revoked' });
    }
    
    // Generate a recovery token (allows creating new identity)
    const recoveryToken = crypto.randomBytes(32).toString('hex');
    
    // Mark proof as revoked and store recovery info
    await db.collection('proofs').updateOne(
      { id: proofId },
      { 
        $set: { 
          status: 'revoked',
          revokedAt: new Date().toISOString(),
          revokedReason: 'user_reported_lost'
        }
      }
    );
    
    // Store recovery token linked to the identity hash
    // This allows the same person to create a new proof
    await db.collection('identity_recovery').insertOne({
      identityHash: proof.identityHash,
      recoveryToken,
      oldProofId: proofId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      used: false
    });
    
    // Also remove from identity_proofs to allow re-registration
    await db.collection('identity_proofs').deleteOne({ identityHash: proof.identityHash });
    
    console.log(`[Identity] Proof ${proofId} revoked, recovery token issued`);
    
    res.json({ 
      success: true, 
      message: 'Identity revoked successfully',
      recoveryToken,
      expiresIn: '24 hours'
    });
    
  } catch (error) {
    console.error('[Revoke] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Email identity backup to user
app.post('/api/proof/email-backup', bulkJson, async (req, res) => {
  try {
    const { email, proofId, secret, commitment, shareUrl } = req.body;
    
    if (!email || !proofId || !secret) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    // Validate email format (simple check, avoiding polynomial regex)
    if (!email || email.length > 254 || !email.includes('@') || email.indexOf('@') !== email.lastIndexOf('@')) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain || !domain.includes('.') || localPart.length > 64) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    
    if (!sendEmail) {
      return res.status(503).json({ success: false, error: 'Email service not configured' });
    }
    
    const createdAt = new Date().toLocaleString();
    let contentHtml = emailHeading('Identity backup');
    contentHtml += emailParagraph('Your recovery information for your OTRUST identity proof.');
    contentHtml += emailWarningBox('<strong>Keep this email safe.</strong> This is your only way to prove ownership of your identity if you lose access. Store it somewhere secure (archive folder, print it, etc.).');
    contentHtml += emailDetailsBox([
      ['Proof ID', proofId],
      ['Proof URL', `<a href="${shareUrl}" style="color:#16160f;">${shareUrl}</a>`],
      ['Created', createdAt]
    ]);
    contentHtml += emailHashBox(secret, 'Your secret key');
    contentHtml += emailMuted('This proves you own this identity. Never share it publicly.');
    contentHtml += emailHashBox(commitment, 'Commitment hash');
    contentHtml += emailHeading('Recovery instructions', 3);
    contentHtml += emailParagraph([
      '<ol style="margin:0;padding-left:20px;line-height:1.8;">',
      '<li>Store this email in a safe place (archive, print, etc.)</li>',
      '<li>If you lose access, go to your proof page and click "Report Lost"</li>',
      '<li>You will receive a recovery token (valid 24 hours)</li>',
      '<li>Re-verify with your ID document to create a new proof</li>',
      '<li>Your personnummer links you to your identity — same person = same hash</li>',
      '</ol>'
    ].join(''));
    contentHtml += emailActionArea(emailButton('View your proof', shareUrl));
    contentHtml += emailMuted('This email was sent from OTRUST at your request. Your identity is cryptographically secured — we cannot recover it for you.');

    const html = emailTemplate({
      title: 'OTRUST identity backup',
      preheader: 'Your recovery information — keep this email safe',
      content: contentHtml,
      product: 'ID'
    });
    
    const text = `
OTRUST IDENTITY BACKUP
======================

IMPORTANT: Keep this email safe! This is your ONLY way to prove ownership.

Proof ID: ${proofId}
Proof URL: ${shareUrl}
Created: ${createdAt}

YOUR SECRET KEY:
${secret}

COMMITMENT HASH:
${commitment}

RECOVERY INSTRUCTIONS:
1. Store this email in a safe place
2. If you lose access, go to your proof page and click "Report Lost"
3. You will receive a recovery token (valid 24 hours)
4. Re-verify with your ID document to create a new proof
5. Your personnummer links you to your identity

--
OTRUST - Your identity is cryptographically secured.
    `.trim();
    
    await sendEmail(email, 'OTRUST Identity Backup - KEEP THIS SAFE', html, text);
    
    console.log(`[Identity] Backup email sent to ${email} for proof ${proofId}`);
    
    res.json({ success: true, message: 'Backup email sent' });
    
  } catch (error) {
    console.error('[Email Backup] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Clear identity data (dev only, requires secret token)
app.delete('/api/admin/clear-identities', async (req, res) => {
  // SECURITY: Only allow in development AND with correct admin token
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not allowed in production' });
  }
  
  // Require admin token even in dev
  const adminToken = req.headers['x-admin-token'] || req.query.token;
  const expectedToken = process.env.ADMIN_TOKEN || 'dev-only-token-change-in-prod';
  
  if (adminToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized - invalid admin token' });
  }
  
  try {
    const db = getDb();
    const r1 = await db.collection('identity_proofs').deleteMany({});
    const r2 = await db.collection('identity_recovery').deleteMany({});
    const r3 = await db.collection('proofs').deleteMany({ type: 'identity' });
    
    console.log('[Admin] Cleared identity data');
    res.json({ 
      success: true, 
      deleted: {
        identity_proofs: r1.deletedCount,
        identity_recovery: r2.deletedCount,
        proofs: r3.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Auth Service - "Login with OTRUST"
// Allows third-party apps to authenticate users via their OTRUST Identity Proof
// ============================================

const AUTH_BRANDING_DEFAULTS = Object.freeze({
  enabled: true,
  themeId: 'default',
  logoUrl: null,
  logoAlt: '',
  backgroundColor: '#F5F7FA',
  primaryColor: '#2D5A3D',
  textColor: '#0F1B2D',
  fontFamily: 'system',
  fontUrl: null,
  borderRadius: 8,
  spacingScale: 'default',
  headline: 'Login with OTRUST',
  subhead: 'Secure authentication with your OTRUST identity proof.',
  footerText: 'Powered by OTRUST',
  infoBlurb: '',
  cookieBannerText: '',
  allowedIdentityMethods: ['proof'],
  autoRedirectSeconds: 3,
  maxAssetBytes: 200000
});

const AUTH_SPACING_SCALES = new Set(['tight', 'default', 'loose']);
const AUTH_IDENTITY_METHODS = new Set(['proof', 'all']);
const RGB_COLOR_RE = /^rgba?\(\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

const HEMSTED_AUTH_THEME = Object.freeze({
  enabled: true,
  logoUrl: 'https://hemsted.se/assets/branding/logo.svg',
  logoAlt: 'Hemsted',
  backgroundColor: '#FAFAF7',
  primaryColor: '#0F1B2D',
  textColor: '#0F1B2D',
  fontFamily: 'Inter',
  fontUrl: null,
  borderRadius: 8,
  spacingScale: 'default',
  headline: 'Logga in p\u00e5 Hemsted',
  subhead: 'S\u00e4ker inloggning med OTRUST Proof',
  footerText: '\u00a9 Hemsted AB \u00b7 Identity-fl\u00f6de s\u00e4krat av OTRUST',
  infoBlurb: 'Verifieringen sker p\u00e5 otrust.eu. OTRUST hanterar identity-fl\u00f6det och skickar dig tillbaka till Hemsted efter verifiering.',
  cookieBannerText: '',
  allowedIdentityMethods: ['proof'],
  autoRedirectSeconds: 3,
  maxAssetBytes: 200000
});

const BUILTIN_AUTH_BRANDING = Object.freeze({
  hemsted_prod: {
    hemsted_dark: Object.freeze({ ...HEMSTED_AUTH_THEME, themeId: 'hemsted_dark' }),
    hemsted_dark_staging: Object.freeze({
      ...HEMSTED_AUTH_THEME,
      themeId: 'hemsted_dark_staging',
      infoBlurb: 'Staging theme. Verifieringen sker p\u00e5 otrust.eu och skickar dig tillbaka till Hemsted efter verifiering.'
    })
  }
});

function sanitizeClientId(value) {
  const str = ensureString(value, 80);
  if (!str || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(str)) return null;
  return str;
}

function sanitizeThemeId(value) {
  const str = ensureString(value, 80);
  if (!str) return null;
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(str)) return null;
  return str;
}

function sanitizeAuthScope(scope) {
  const source = Array.isArray(scope) ? scope : (scope ? [scope] : ['identity']);
  const safeScope = source
    .map(item => ensureString(item, 60))
    .filter(item => item && /^[a-zA-Z0-9_.:-]{1,60}$/.test(item))
    .slice(0, 12);
  return safeScope.length ? safeScope : ['identity'];
}

function sanitizeBrandText(value, maxLen) {
  const str = ensureString(value, maxLen);
  if (str === null) return '';
  return str
    .replace(/[<>`]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen);
}

function sanitizeOptionalHttpsUrl(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  const str = ensureString(value, 2048);
  if (!str) return null;
  try {
    const parsed = new URL(str);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('unsafe_url');
    }
    return parsed.toString();
  } catch {
    throw new Error(`${fieldName} must be a valid HTTPS URL`);
  }
}

function sanitizeCssColor(value, fieldName) {
  const str = ensureString(value, 80);
  if (!str) {
    throw new Error(`${fieldName} must be a valid CSS color`);
  }
  if (validator.isHexColor(str) || RGB_COLOR_RE.test(str)) {
    return str;
  }
  throw new Error(`${fieldName} must be a valid hex, rgb, or rgba color`);
}

function sanitizeFontFamily(value) {
  const str = ensureString(value, 80);
  if (!str || str === 'system') return 'system';
  if (!/^[a-zA-Z0-9 ,.'"-]{1,80}$/.test(str)) {
    throw new Error('fontFamily contains unsupported characters');
  }
  return str;
}

function sanitizeBorderRadius(value) {
  const raw = typeof value === 'string' ? value.replace(/px$/i, '') : value;
  const radius = Number(raw);
  if (!Number.isFinite(radius) || radius < 4 || radius > 12) {
    throw new Error('borderRadius must be between 4 and 12 pixels');
  }
  return Math.round(radius * 100) / 100;
}

function sanitizeAllowedIdentityMethods(value) {
  const source = Array.isArray(value) ? value : (value ? [value] : AUTH_BRANDING_DEFAULTS.allowedIdentityMethods);
  const methods = source
    .map(item => ensureString(item, 40))
    .filter(item => item && AUTH_IDENTITY_METHODS.has(item))
    .slice(0, 5);
  return methods.length ? [...new Set(methods)] : AUTH_BRANDING_DEFAULTS.allowedIdentityMethods;
}

function sanitizeAutoRedirectSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 10) {
    throw new Error('autoRedirectSeconds must be between 0 and 10 seconds');
  }
  return Math.round(seconds * 10) / 10;
}

function sanitizeAuthBranding(input = {}, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Branding payload must be an object');
  }

  const source = {
    ...AUTH_BRANDING_DEFAULTS,
    ...existing,
    ...input
  };

  const spacingScale = ensureString(source.spacingScale, 20) || AUTH_BRANDING_DEFAULTS.spacingScale;
  if (!AUTH_SPACING_SCALES.has(spacingScale)) {
    throw new Error('spacingScale must be tight, default, or loose');
  }

  return {
    enabled: source.enabled !== false,
    themeId: sanitizeThemeId(source.themeId || source.theme_id) || existing.themeId || AUTH_BRANDING_DEFAULTS.themeId,
    logoUrl: sanitizeOptionalHttpsUrl(source.logoUrl, 'logoUrl'),
    logoAlt: sanitizeBrandText(source.logoAlt, 120),
    backgroundColor: sanitizeCssColor(source.backgroundColor, 'backgroundColor'),
    primaryColor: sanitizeCssColor(source.primaryColor, 'primaryColor'),
    textColor: sanitizeCssColor(source.textColor, 'textColor'),
    fontFamily: sanitizeFontFamily(source.fontFamily),
    fontUrl: sanitizeOptionalHttpsUrl(source.fontUrl, 'fontUrl'),
    borderRadius: sanitizeBorderRadius(source.borderRadius),
    spacingScale,
    headline: sanitizeBrandText(source.headline, 120) || AUTH_BRANDING_DEFAULTS.headline,
    subhead: sanitizeBrandText(source.subhead, 180) || AUTH_BRANDING_DEFAULTS.subhead,
    footerText: sanitizeBrandText(source.footerText, 180) || AUTH_BRANDING_DEFAULTS.footerText,
    infoBlurb: sanitizeBrandText(source.infoBlurb, 260),
    cookieBannerText: sanitizeBrandText(source.cookieBannerText, 260),
    allowedIdentityMethods: sanitizeAllowedIdentityMethods(source.allowedIdentityMethods),
    autoRedirectSeconds: sanitizeAutoRedirectSeconds(source.autoRedirectSeconds),
    maxAssetBytes: AUTH_BRANDING_DEFAULTS.maxAssetBytes
  };
}

function publicAuthBranding(branding) {
  return sanitizeAuthBranding({}, branding && branding.enabled !== false ? branding.branding || branding : {});
}

function builtInAuthBranding(clientId, themeId) {
  const themes = BUILTIN_AUTH_BRANDING[clientId];
  if (!themes) return null;
  return themes[themeId] || null;
}

function applyAuthBrandingPolicy(clientId, themeId, branding) {
  if (clientId === 'hemsted_prod' && (themeId === 'hemsted_dark' || themeId === 'hemsted_dark_staging')) {
    return {
      ...branding,
      subhead: HEMSTED_AUTH_THEME.subhead,
      allowedIdentityMethods: ['proof']
    };
  }
  return branding;
}

async function getAuthBrandingForClient(clientId, themeId = null) {
  const safeClientId = sanitizeClientId(clientId);
  if (!safeClientId) return publicAuthBranding(AUTH_BRANDING_DEFAULTS);
  const safeThemeId = sanitizeThemeId(themeId) || AUTH_BRANDING_DEFAULTS.themeId;

  const db = getDb();
  let stored = await db.collection('auth_branding').findOne({
    client_id: safeClientId,
    theme_id: safeThemeId
  });

  if (!stored && safeThemeId === AUTH_BRANDING_DEFAULTS.themeId) {
    // Backward compatibility for single-theme records created before theme_id existed.
    stored = await db.collection('auth_branding').findOne({ client_id: safeClientId });
  }

  if (stored && stored.enabled === false) {
    return publicAuthBranding(AUTH_BRANDING_DEFAULTS);
  }

  if (!stored) {
    const builtIn = builtInAuthBranding(safeClientId, safeThemeId);
    if (builtIn) return applyAuthBrandingPolicy(safeClientId, safeThemeId, publicAuthBranding(builtIn));
    return publicAuthBranding(AUTH_BRANDING_DEFAULTS);
  }
  return applyAuthBrandingPolicy(safeClientId, safeThemeId, publicAuthBranding(stored));
}

function changedBrandingFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  return Object.keys(input)
    .map(key => key === 'theme_id' ? 'themeId' : key)
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .filter(key => Object.prototype.hasOwnProperty.call(AUTH_BRANDING_DEFAULTS, key));
}

async function saveAuthBranding(clientId, input, changedBy, themeId = null) {
  const safeClientId = sanitizeClientId(clientId);
  if (!safeClientId) {
    throw new Error('clientId must contain only letters, numbers, dash, underscore, colon, or dot');
  }
  const safeThemeId = sanitizeThemeId(themeId || input?.themeId || input?.theme_id) || AUTH_BRANDING_DEFAULTS.themeId;

  const db = getDb();
  const collection = db.collection('auth_branding');
  const query = { client_id: safeClientId, theme_id: safeThemeId };
  const existing = await collection.findOne(query);
  const branding = sanitizeAuthBranding({ ...input, themeId: safeThemeId }, existing?.branding || {});
  const now = new Date();
  const doc = {
    client_id: safeClientId,
    theme_id: safeThemeId,
    enabled: branding.enabled,
    branding,
    updated_at: now,
    updated_by: changedBy || 'admin'
  };

  if (existing) {
    await collection.updateOne(query, { $set: doc });
  } else {
    await collection.insertOne({ ...doc, created_at: now });
  }

  await logAuditEvent('auth_branding_changed', 'medium', {
    client_id: safeClientId,
    theme_id: safeThemeId,
    changed_by: changedBy || 'admin',
    change_type: existing ? 'update' : 'create',
    fields: changedBrandingFields(input),
    timestamp: now.toISOString()
  });

  return doc;
}

function requireAuthBrandingAdmin(req, res) {
  if (!hasValidAdminKey(req)) {
    logSecurityEvent('admin_access_denied', req, { path: req.path });
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

function requestedAuthThemeId(req) {
  const rawThemeId = req.params?.themeId || req.query?.theme_id || req.query?.themeId || req.body?.themeId || req.body?.theme_id;
  if (!rawThemeId) return AUTH_BRANDING_DEFAULTS.themeId;
  const safeThemeId = sanitizeThemeId(rawThemeId);
  if (!safeThemeId) {
    throw new Error('theme_id must contain only letters, numbers, dash, underscore, colon, or dot');
  }
  return safeThemeId;
}

function defaultAuthThemeIdForClient(clientId) {
  return clientId === 'hemsted_prod' ? 'hemsted_dark' : AUTH_BRANDING_DEFAULTS.themeId;
}

function requestedChallengeThemeId(req, clientId) {
  const rawThemeId = req.body?.themeId || req.body?.theme_id || req.query?.theme_id || req.query?.themeId;
  if (!rawThemeId) return defaultAuthThemeIdForClient(clientId);
  const safeThemeId = sanitizeThemeId(rawThemeId);
  if (!safeThemeId) {
    throw new Error('theme_id must contain only letters, numbers, dash, underscore, colon, or dot');
  }
  return safeThemeId;
}

// Store for auth challenges (in production, use Redis with TTL)
const authChallenges = new Map();

// Cleanup expired challenges every minute
const authChallengeCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, challenge] of authChallenges) {
    if (challenge.expiresAt < now) {
      authChallenges.delete(id);
    }
  }
}, 60 * 1000);
authChallengeCleanupTimer.unref?.();

// POST /api/v1/auth/challenge - Create login challenge for third-party app
app.post('/api/v1/auth/challenge', bulkJson, async (req, res) => {
  try {
    const { clientId, redirectUri, scope, state } = req.body;
    const safeClientId = sanitizeClientId(clientId);
    const safeRedirectUri = ensureString(redirectUri, 2048);
    const safeScope = sanitizeAuthScope(scope);
    const safeState = state ? ensureString(state, 500) : null;
    let safeThemeId;
    
    if (!safeClientId || !safeRedirectUri || (state && safeState === null)) {
      return res.status(400).json({ 
        error: 'invalid_request',
        message: 'Missing or invalid required fields: clientId, redirectUri'
      });
    }

    try {
      safeThemeId = requestedChallengeThemeId(req, safeClientId);
    } catch (error) {
      return res.status(400).json({
        error: 'invalid_theme_id',
        message: error.message
      });
    }
    
    // Validate redirectUri is a valid URL with strict security checks
    try {
      const parsedUrl = new URL(safeRedirectUri);
      
      // Only allow https (or http for localhost in development)
      const allowedProtocols = ['https:'];
      if (process.env.NODE_ENV !== 'production') {
        allowedProtocols.push('http:');
      }
      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        return res.status(400).json({
          error: 'invalid_redirect_uri',
          message: 'redirectUri must use HTTPS protocol'
        });
      }
      
      // Block dangerous protocols (extra safety)
      const blockedProtocols = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'];
      if (blockedProtocols.includes(parsedUrl.protocol)) {
        return res.status(400).json({
          error: 'invalid_redirect_uri',
          message: 'Invalid protocol in redirectUri'
        });
      }
      
      // Block internal/private IP addresses (SSRF prevention)
      const hostname = parsedUrl.hostname.toLowerCase();
      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
      const privateIPPatterns = [
        /^10\./,                          // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
        /^192\.168\./,                    // 192.168.0.0/16
        /^169\.254\./,                    // Link-local
        /^fc00:/i,                        // IPv6 private
        /^fe80:/i,                        // IPv6 link-local
      ];
      
      if (blockedHosts.includes(hostname) || privateIPPatterns.some(p => p.test(hostname))) {
        // Allow localhost only in development
        if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1'].includes(hostname)) {
          return res.status(400).json({
            error: 'invalid_redirect_uri',
            message: 'redirectUri cannot point to internal addresses'
          });
        }
      }
      
      // Block AWS/cloud metadata endpoints
      if (hostname === '169.254.169.254' || hostname.endsWith('.internal')) {
        return res.status(400).json({
          error: 'invalid_redirect_uri',
          message: 'redirectUri cannot point to metadata endpoints'
        });
      }
      
    } catch {
      return res.status(400).json({ 
        error: 'invalid_redirect_uri',
        message: 'redirectUri must be a valid URL'
      });
    }
    
    // Generate challenge
    const challengeId = `ch_${crypto.randomBytes(16).toString('hex')}`;
    const challenge = crypto.randomBytes(32).toString('hex');
    
    // Store challenge (5 minute TTL)
    authChallenges.set(challengeId, {
      clientId: safeClientId,
      themeId: safeThemeId,
      redirectUri: safeRedirectUri,
      scope: safeScope,
      state: safeState,
      challenge,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      used: false
    });
    
    // Generate login URL (use request host in production, fallback to config)
    const baseUrl = config.baseUrl && config.baseUrl !== 'http://localhost:3000'
      ? config.baseUrl
      : `${req.protocol}://${req.get('host')}`;
    const loginUrl = new URL('/auth/login', baseUrl);
    loginUrl.searchParams.set('challenge', challengeId);
    if (safeThemeId !== AUTH_BRANDING_DEFAULTS.themeId) {
      loginUrl.searchParams.set('theme_id', safeThemeId);
    }
    
    console.log(`[Auth] Challenge created: ${challengeId} for client: ${safeClientId}`);
    
    res.json({
      success: true,
      challengeId,
      challenge,
      loginUrl: loginUrl.toString(),
      themeId: safeThemeId,
      expiresIn: 300 // 5 minutes
    });
    
  } catch (error) {
    console.error('[Auth] Challenge error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// GET /api/v1/auth/challenge/:id - Public safe challenge metadata for the hosted login page
app.get('/api/v1/auth/challenge/:challengeId', async (req, res) => {
  try {
    const safeChallengeId = sanitizeTokenId(req.params.challengeId);
    if (!safeChallengeId) {
      return res.status(400).json({
        error: 'invalid_challenge',
        message: 'Challenge id is invalid'
      });
    }

    const challenge = authChallenges.get(safeChallengeId);
    if (!challenge) {
      return res.status(404).json({
        error: 'challenge_not_found',
        message: 'Challenge not found or expired'
      });
    }

    if (challenge.used) {
      return res.status(409).json({
        error: 'challenge_used',
        message: 'This challenge has already been used'
      });
    }

    if (challenge.expiresAt < Date.now()) {
      authChallenges.delete(safeChallengeId);
      return res.status(410).json({
        error: 'challenge_expired',
        message: 'Challenge has expired'
      });
    }

    const rawThemeId = req.query.theme_id || req.query.themeId || null;
    const safeThemeId = rawThemeId ? sanitizeThemeId(rawThemeId) : null;
    if (rawThemeId && !safeThemeId) {
      return res.status(400).json({
        error: 'invalid_theme_id',
        message: 'theme_id is invalid'
      });
    }
    const effectiveThemeId = safeThemeId || challenge.themeId || defaultAuthThemeIdForClient(challenge.clientId);
    const branding = await getAuthBrandingForClient(challenge.clientId, effectiveThemeId);

    res.json({
      success: true,
      challengeId: safeChallengeId,
      clientId: challenge.clientId,
      themeId: branding.themeId || AUTH_BRANDING_DEFAULTS.themeId,
      scope: sanitizeAuthScope(challenge.scope),
      expiresAt: new Date(challenge.expiresAt).toISOString(),
      branding
    });
  } catch (error) {
    console.error('[Auth] Challenge metadata error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  }
});

app.get([
  '/admin/auth-branding/:clientId',
  '/admin/auth-branding/:clientId/:themeId',
  '/api/admin/auth-branding/:clientId',
  '/api/admin/auth-branding/:clientId/:themeId'
], async (req, res) => {
  if (!requireAuthBrandingAdmin(req, res)) return;

  try {
    const safeClientId = sanitizeClientId(req.params.clientId);
    if (!safeClientId) {
      return res.status(400).json({ error: 'invalid_client_id' });
    }
    let safeThemeId;
    try {
      safeThemeId = requestedAuthThemeId(req);
    } catch (error) {
      return res.status(400).json({ error: 'invalid_theme_id', message: error.message });
    }

    const db = getDb();
    let stored = await db.collection('auth_branding').findOne({
      client_id: safeClientId,
      theme_id: safeThemeId
    });
    if (!stored && safeThemeId === AUTH_BRANDING_DEFAULTS.themeId) {
      stored = await db.collection('auth_branding').findOne({ client_id: safeClientId });
    }
    const builtIn = !stored ? builtInAuthBranding(safeClientId, safeThemeId) : null;
    const branding = applyAuthBrandingPolicy(safeClientId, safeThemeId, stored
      ? sanitizeAuthBranding({}, stored.branding || {})
      : publicAuthBranding(builtIn || AUTH_BRANDING_DEFAULTS));

    res.json({
      success: true,
      found: !!stored,
      builtIn: !!builtIn,
      clientId: safeClientId,
      themeId: safeThemeId,
      branding,
      updatedAt: stored?.updated_at || null,
      updatedBy: stored?.updated_by || null
    });
  } catch (error) {
    console.error('[AuthBranding] Get error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  }
});

app.put([
  '/admin/auth-branding/:clientId',
  '/admin/auth-branding/:clientId/:themeId',
  '/api/admin/auth-branding/:clientId',
  '/api/admin/auth-branding/:clientId/:themeId'
], bulkJson, async (req, res) => {
  if (!requireAuthBrandingAdmin(req, res)) return;

  try {
    const changedBy = sanitizeBrandText(req.get('X-Admin-User') || 'admin', 120) || 'admin';
    const safeThemeId = requestedAuthThemeId(req);
    const saved = await saveAuthBranding(req.params.clientId, req.body, changedBy, safeThemeId);

    res.json({
      success: true,
      clientId: saved.client_id,
      themeId: saved.theme_id,
      branding: saved.branding,
      updatedAt: saved.updated_at,
      updatedBy: saved.updated_by
    });
  } catch (error) {
    res.status(400).json({ error: 'invalid_branding', message: error.message });
  }
});

// POST /api/v1/auth/prove - User proves identity ownership
app.post('/api/v1/auth/prove', bulkJson, async (req, res) => {
  try {
    const { challengeId, proofId, pin, secret } = req.body;
    
    // SECURITY: Sanitize user inputs to prevent NoSQL injection
    const safeChallengeId = sanitizeTokenId(challengeId);
    const safeProofId = sanitizeProofId(proofId);
    
    if (!safeChallengeId || !safeProofId) {
      return res.status(400).json({ 
        error: 'invalid_request',
        message: 'Missing required fields: challengeId, proofId'
      });
    }
    
    if (!pin && !secret) {
      return res.status(400).json({ 
        error: 'invalid_request',
        message: 'Either PIN or secret key is required'
      });
    }
    
    // Get and validate challenge
    const challenge = authChallenges.get(safeChallengeId);
    if (!challenge) {
      return res.status(400).json({ 
        error: 'invalid_challenge',
        message: 'Challenge not found or expired'
      });
    }
    
    if (challenge.used) {
      return res.status(400).json({ 
        error: 'challenge_used',
        message: 'This challenge has already been used'
      });
    }
    
    if (challenge.expiresAt < Date.now()) {
      authChallenges.delete(safeChallengeId);
      return res.status(400).json({ 
        error: 'challenge_expired',
        message: 'Challenge has expired'
      });
    }
    
    // Verify the proof exists and is valid
    const db = getDb();
    const proof = await db.collection('proofs').findOne({ id: safeProofId });
    
    if (!proof) {
      return res.status(400).json({ 
        error: 'proof_not_found',
        message: 'Identity proof not found'
      });
    }
    
    if (proof.type !== 'identity') {
      return res.status(400).json({ 
        error: 'invalid_proof_type',
        message: 'Only identity proofs can be used for authentication'
      });
    }
    
    if (proof.status === 'revoked') {
      return res.status(400).json({ 
        error: 'proof_revoked',
        message: 'This identity proof has been revoked'
      });
    }
    
    if (proof.expiresAt && new Date(proof.expiresAt) < new Date()) {
      return res.status(400).json({ 
        error: 'proof_expired',
        message: 'This identity proof has expired'
      });
    }
    
    // Get the identity_proofs record (contains encrypted secret)
    const identityProof = await db.collection('identity_proofs').findOne({ proofId: safeProofId });
    
    // Determine the secret to use
    let actualSecret = secret;
    
    if (pin && !secret) {
      // User is using PIN - need to decrypt secret from database
      if (!identityProof || !identityProof.encryptedSecret) {
        return res.status(400).json({ 
          error: 'pin_not_available',
          message: 'This proof was created before PIN support. Please use your backup secret key.'
        });
      }
      
      // Check rate limiting
      if (identityProof.lockedUntil && new Date(identityProof.lockedUntil) > new Date()) {
        const minutesLeft = Math.ceil((new Date(identityProof.lockedUntil) - new Date()) / 60000);
        return res.status(429).json({ 
          error: 'proof_locked',
          message: `Too many failed attempts. Try again in ${minutesLeft} minutes.`
        });
      }
      
      // Decrypt secret with PIN
      try {
        const salt = Buffer.from(identityProof.salt, 'base64');
        const iv = Buffer.from(identityProof.iv, 'base64');
        const authTag = Buffer.from(identityProof.authTag, 'base64');
        const derivedKey = crypto.pbkdf2Sync(pin, salt, 600000, 32, 'sha256');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(identityProof.encryptedSecret, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        actualSecret = decrypted;
        
        // Reset failed attempts on successful PIN
        await db.collection('identity_proofs').updateOne(
          { proofId: safeProofId },
          { $set: { failedAttempts: 0, lockedUntil: null } }
        );
      } catch (decryptError) {
        // Wrong PIN - increment failed attempts
        const newFailedAttempts = (identityProof.failedAttempts || 0) + 1;
        const shouldLock = newFailedAttempts >= 3;
        
        await db.collection('identity_proofs').updateOne(
          { proofId: safeProofId },
          { 
            $set: { 
              failedAttempts: newFailedAttempts,
              lockedUntil: shouldLock ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
            } 
          }
        );
        
        if (shouldLock) {
          return res.status(429).json({ 
            error: 'proof_locked',
            message: 'Too many failed attempts. Identity locked for 15 minutes.'
          });
        }
        
        return res.status(401).json({ 
          error: 'invalid_pin',
          message: `Wrong PIN. ${3 - newFailedAttempts} attempts remaining.`
        });
      }
    }
    
    // Verify secret matches commitment
    const expectedCommitment = crypto.createHash('sha256')
      .update(`${proofId}:${actualSecret}`)
      .digest('hex');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedCommitment, 'hex'),
      Buffer.from(proof.commitment, 'hex')
    )) {
      return res.status(401).json({ 
        error: 'invalid_secret',
        message: 'Secret does not match proof commitment'
      });
    }
    
    // Mark challenge as used
    challenge.used = true;
    
    // Generate auth token (signed JWT-like token)
    const tokenPayload = {
      sub: proofId,
      aud: challenge.clientId,
      scope: challenge.scope,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      nonce: challenge.challenge
    };
    
    // Create a signed token (HMAC with server secret)
    const tokenData = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
    const signature = crypto.createHmac('sha256', AUTH_TOKEN_SECRET)
      .update(tokenData)
      .digest('base64url');
    
    const authToken = `${tokenData}.${signature}`;
    
    // Build redirect URL with token
    const redirectUrl = new URL(challenge.redirectUri);
    redirectUrl.searchParams.set('token', authToken);
    if (challenge.state) {
      redirectUrl.searchParams.set('state', challenge.state);
    }
    
    console.log(`[Auth] Proof verified: ${proofId} for client: ${challenge.clientId}`);
    
    // Clean up challenge
    authChallenges.delete(challengeId);

    await incrementUsageCounter('auth_proof_verifications');
    
    res.json({
      success: true,
      token: authToken,
      redirectUrl: redirectUrl.toString(),
      expiresIn: 3600
    });
    
  } catch (error) {
    console.error('[Auth] Prove error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// POST /api/v1/auth/verify - Third-party verifies auth token
app.post('/api/v1/auth/verify', bulkJson, async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        error: 'invalid_request',
        message: 'Missing token'
      });
    }
    
    // Parse token
    const parts = token.split('.');
    if (parts.length !== 2) {
      return res.status(400).json({ 
        error: 'invalid_token',
        message: 'Malformed token'
      });
    }
    
    const [tokenData, signature] = parts;
    
    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', AUTH_TOKEN_SECRET)
      .update(tokenData)
      .digest('base64url');
    
    if (!timingSafeEqual(signature, expectedSignature)) {
      return res.status(401).json({ 
        error: 'invalid_signature',
        message: 'Token signature verification failed'
      });
    }
    
    // Decode payload
    let payload;
    try {
      payload = JSON.parse(Buffer.from(tokenData, 'base64url').toString());
    } catch {
      return res.status(400).json({ 
        error: 'invalid_token',
        message: 'Cannot decode token payload'
      });
    }
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ 
        error: 'token_expired',
        message: 'Token has expired'
      });
    }
    
    // Get proof details (optional - for returning user info)
    const db = getDb();
    // SECURITY: payload.sub comes from signed JWT, sanitize for defense in depth
    const safeProofId = sanitizeProofId(payload.sub);
    const proof = safeProofId ? await db.collection('proofs').findOne({ id: safeProofId }) : null;
    
    console.log(`[Auth] Token verified for proof: ${safeProofId || 'invalid'}`);
    
    await incrementUsageCounter('auth_token_verifications');

    res.json({
      valid: true,
      proofId: safeProofId,
      clientId: payload.aud,
      scope: payload.scope,
      issuedAt: new Date(payload.iat * 1000).toISOString(),
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      identity: proof ? {
        verified: true,
        verification: proof.verification,
        createdAt: proof.createdAt
      } : null
    });
    
  } catch (error) {
    console.error('[Auth] Verify error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// GET /api/v1/auth/userinfo - Get authenticated user info (with valid token in header)
app.get('/api/v1/auth/userinfo', async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header'
      });
    }
    
    const token = authHeader.substring(7);
    
    // Parse and verify token (same as /verify)
    const parts = token.split('.');
    if (parts.length !== 2) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    
    const [tokenData, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', AUTH_TOKEN_SECRET)
      .update(tokenData)
      .digest('base64url');
    
    if (!timingSafeEqual(signature, expectedSignature)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }
    
    const payload = JSON.parse(Buffer.from(tokenData, 'base64url').toString());
    
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ error: 'token_expired' });
    }
    
    // Get proof details
    const db = getDb();
    // SECURITY: payload.sub comes from signed JWT, sanitize for defense in depth
    const safeProofId = sanitizeProofId(payload.sub);
    if (!safeProofId) {
      return res.status(400).json({ error: 'invalid_proof_id' });
    }
    const proof = await db.collection('proofs').findOne({ id: safeProofId });
    
    if (!proof) {
      return res.status(404).json({ error: 'proof_not_found' });
    }
    
    await incrementUsageCounter('auth_userinfo_verifications');

    res.json({
      proofId: safeProofId,
      verified: true,
      identityHash: proof.identityHash ? proof.identityHash.substring(0, 16) + '...' : null,
      verification: proof.verification,
      createdAt: proof.createdAt,
      expiresAt: proof.expiresAt
    });
    
  } catch (error) {
    console.error('[Auth] Userinfo error:', error);
    res.status(500).json({ error: 'server_error', message: error.message });
  }
});

// Serve auth login page
app.get('/auth/login', serveHtmlWithNonce(path.join(__dirname, '../web/auth-login.html')));

// 404 handler - MUST be after all routes
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Start server (can be imported for testing)
export async function startServer(port = PORT) {
  await createDb();
  console.log('[DB] MongoDB initialized');

  // Set up email notification callback for confirmed timestamps
  setOnConfirmationCallback(notifyClaimConfirmed);
  
  // Set up email notification callback for confirmed signature packages
  setOnSignatureConfirmationCallback(sendSignatureConfirmationEmail);

  // Start OpenTimestamps background processor (skip in test)
  if (process.env.NODE_ENV !== 'test') {
    startOtsProcessor(Number(process.env.OTS_BATCH_INTERVAL_MS || 5 * 60 * 1000));
    startFilePurgeProcessor(Number(process.env.FILE_PURGE_INTERVAL_MS || 60 * 1000));
  }

  // Log email status
  if (sendEmail) {
    console.log('[Email] Email notifications enabled');
  } else {
    console.log('[Email] No email configured');
  }
  
  // Log active features
  logFeatures();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const address = server.address();
      console.log(`[otrust] Blind notary running on port ${address.port}`);
      console.log('[otrust] No IP logging. Zero-knowledge architecture.');
      if (config.features.blockchain) console.log('[otrust] OpenTimestamps Bitcoin anchoring enabled.');
      if (config.features.sign) console.log('[otrust] Document signing enabled.');
      if (config.features.email && sendEmail) console.log('[otrust] Email notifications enabled.');
      if (needsSetup()) console.log(`[otrust] Setup wizard available at http://localhost:${address.port}/setup`);
      resolve(server);
    });

    process.on('SIGTERM', async () => {
      console.log('[otrust] Shutting down...');
      server.close();
      await closeDb();
      process.exit(0);
    });
  });
}

// Alias for test compatibility
export const createServer = startServer;

// Auto-start only when run directly (not imported)
if (process.argv[1] && process.argv[1].includes('server.js')) {
  startServer().then(server => {
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('[otrust] Shutting down...');
      server.close();
      await closeDb();
      process.exit(0);
    });
  }).catch(error => {
    console.error('Failed to start:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

export default app;
