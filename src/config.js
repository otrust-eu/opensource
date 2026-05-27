/**
 * OTRUST Configuration & Feature Flags
 * 
 * Controls which modules are enabled and system settings.
 * All settings can be overridden via environment variables.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config from file if exists (created by setup wizard)
let fileConfig = {};
const configPath = path.join(__dirname, '../config.json');
if (fs.existsSync(configPath)) {
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.warn('[Config] Failed to load config.json:', e.message);
  }
}

// Helper to get config value with fallback chain: ENV -> config.json -> default
function getConfig(key, defaultValue) {
  // Environment variable takes precedence (convert to proper type)
  const envKey = key.toUpperCase().replace(/\./g, '_');
  if (process.env[envKey] !== undefined) {
    const val = process.env[envKey];
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(val)) return Number(val);
    return val;
  }
  
  // Then config file
  const keys = key.split('.');
  let value = fileConfig;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      value = undefined;
      break;
    }
  }
  if (value !== undefined) return value;
  
  // Finally default
  return defaultValue;
}

/**
 * Main configuration object
 */
export const config = {
  // ===================
  // Core Settings
  // ===================
  port: getConfig('PORT', 3000),
  nodeEnv: getConfig('NODE_ENV', 'development'),
  isProduction: getConfig('NODE_ENV', 'development') === 'production',
  baseUrl: getConfig('BASE_URL', 'http://localhost:3000'),
  
  // ===================
  // Feature Flags
  // ===================
  features: {
    // Core timestamp functionality (always enabled)
    timestamp: getConfig('ENABLE_TIMESTAMP', true),
    
    // Document signing module
    sign: getConfig('ENABLE_SIGN', true),
    
    // Email notifications
    email: getConfig('ENABLE_EMAIL', false),
    
    // Bitcoin blockchain anchoring via OpenTimestamps
    blockchain: getConfig('ENABLE_BLOCKCHAIN', false),
    
    // Web UI (disable for API-only mode)
    webUi: getConfig('ENABLE_WEB_UI', true),
    
    // Setup wizard - DISABLED by default in production
    setupWizard: getConfig('ENABLE_SETUP_WIZARD', false),
  },
  
  // ===================
  // Database
  // ===================
  database: {
    uri: getConfig('MONGODB_URI', 'mongodb://localhost:27017'),
    name: getConfig('MONGODB_DB', 'otrust'),
  },
  
  // ===================
  // Email
  // ===================
  email: {
    mode: getConfig('EMAIL_MODE', 'mock'), // 'smtp', 'resend', 'mock'
    from: getConfig('EMAIL_FROM', 'OTRUST <noreply@otrust.eu>'),
    
    // SMTP settings
    smtp: {
      host: getConfig('SMTP_HOST', ''),
      port: getConfig('SMTP_PORT', 587),
      secure: getConfig('SMTP_SECURE', false),
      user: getConfig('SMTP_USER', ''),
      pass: getConfig('SMTP_PASS', ''),
    },
    
    // Resend settings
    resend: {
      apiKey: getConfig('RESEND_API_KEY', ''),
    },
  },
  
  // ===================
  // Security
  // ===================
  security: {
    // Rate limiting
    rateLimit: {
      windowMs: getConfig('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      maxRequests: getConfig('RATE_LIMIT_MAX', 1000),
    },
    
    // CORS origins (comma-separated)
    corsOrigins: getConfig('CORS_ORIGINS', 'https://www.otrust.eu,https://otrust.eu'),
  },
  
  // ===================
  // Sign Module Settings
  // ===================
  sign: {
    maxParties: getConfig('SIGN_MAX_PARTIES', 20),
    maxDeadlineDays: getConfig('SIGN_MAX_DEADLINE_DAYS', 90),
    maxFileSizeMb: getConfig('SIGN_MAX_FILE_SIZE_MB', 25),
    fileTtlHours: getConfig('SIGN_FILE_TTL_HOURS', 12),
  },
};

/**
 * Save configuration to file
 */
export function saveConfig(newConfig) {
  const merged = { ...fileConfig, ...newConfig };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
  console.log('[Config] Saved to', configPath);
}

/**
 * Check if initial setup is needed
 */
export function needsSetup() {
  return config.features.setupWizard && !fs.existsSync(configPath);
}

/**
 * Log active features on startup
 */
export function logFeatures() {
  if (config.nodeEnv === 'test') {
    console.log(`[Config] port=${config.port} env=${config.nodeEnv}`);
    return;
  }

  console.log('\n┌─────────────────────────────────────┐');
  console.log('│         OTRUST Configuration        │');
  console.log('├─────────────────────────────────────┤');
  console.log(`│  Port:        ${config.port.toString().padEnd(22)}│`);
  console.log(`│  Environment: ${config.nodeEnv.padEnd(22)}│`);
  console.log('├─────────────────────────────────────┤');
  console.log('│  Features:                          │');
  console.log(`│    ◆ Timestamp:  ${config.features.timestamp ? '✓ enabled ' : '✗ disabled'}           │`);
  console.log(`│    ◆ Sign:       ${config.features.sign ? '✓ enabled ' : '✗ disabled'}           │`);
  console.log(`│    ◆ Email:      ${config.features.email ? '✓ enabled ' : '✗ disabled'}           │`);
  console.log(`│    ◆ Blockchain: ${config.features.blockchain ? '✓ enabled ' : '✗ disabled'}           │`);
  console.log(`│    ◆ Web UI:     ${config.features.webUi ? '✓ enabled ' : '✗ disabled'}           │`);
  console.log('└─────────────────────────────────────┘\n');
}

export default config;
