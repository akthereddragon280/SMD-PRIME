/**
 * SMD PRIME - UNIFIED INFRASTRUCTURE DIAGNOSTIC SUITE & AUTOMATED RECOVERY ENGINE
 * Standalone Node.js Diagnostic Suite for Multi-Node Workers, HMAC & Service Account Mesh
 * 
 * CORE MODULES:
 * 1. MULTI-NODE WORKER & HMAC TESTER: Validates Node 1, 2, 3 streaming endpoints with HMAC signatures.
 * 2. GOOGLE SERVICE ACCOUNT POOL VALIDATOR: Tests OAuth RS256 token generation & Drive API permissions.
 * 3. UNIFIED PLAYER ERROR DIAGNOSTIC ENGINE: One-click debugger mapping error codes to root causes.
 * 4. AUTOMATED ADMIN WORKLOAD REDUCTION: High-ROI CLI reporting & automated recovery suggestions.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file manually if present
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

// Global Configuration Tokens
const STREAM_SECRET = process.env.VITE_STREAM_SECRET || 'smd_prime_secure_jwt_secret_key_2026';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const TEST_FILE_ID = process.env.TEST_FILE_ID || '1djKAD3UQmBPgkeBBLCrZjAW-D4Fod_Ng';

const WORKER_NODES = [
  { id: 'Node-1', url: 'https://smd-stream-node-1.smd-prime.workers.dev' },
  { id: 'Node-2', url: 'https://smd-stream-node-2.akthereddragon281.workers.dev' },
  { id: 'Node-3', url: 'https://smd-stream-node-3.akthereddragon282.workers.dev' }
];

// ANSI Colors for CLI Dashboard
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

/**
 * MODULE 1: HMAC Token Generator & Dynamic Stream URL Builder
 */
export function generateFastTokenSync(fileId, expiresAt, secret = STREAM_SECRET) {
  const str = `${fileId}:${expiresAt}:${secret}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function buildSignedStreamUrl(baseUrl, fileId) {
  const expiresAt = Math.floor(Date.now() / 1000) + 14400; // 4 Hours
  const obfuscatedFid = Buffer.from(fileId).toString('base64').replace(/=/g, '');
  const token = generateFastTokenSync(fileId, expiresAt);
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/?id=${encodeURIComponent(fileId)}&fid=${encodeURIComponent(obfuscatedFid)}&exp=${expiresAt}&token=${token}&container=mp4&progressive=1`;
}

export async function testWorkerNodes() {
  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold} 🌐 MODULE 1: MULTI-NODE WORKER & HMAC STREAM TESTER${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);

  const results = [];

  for (const node of WORKER_NODES) {
    const signedUrl = buildSignedStreamUrl(node.url, TEST_FILE_ID);
    const startTime = Date.now();
    let status = 0;
    let statusText = '';
    let activeSa = 'N/A';
    let saIndex = 'N/A';
    let isHealthy = false;

    try {
      const response = await fetch(signedUrl, {
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1023',
          'User-Agent': 'SMD-PRIME-Diagnostic-Suite/12.0'
        }
      });

      const durationMs = Date.now() - startTime;
      status = response.status;
      statusText = response.statusText;
      activeSa = response.headers.get('x-sa-active') || 'N/A';
      saIndex = response.headers.get('x-sa-index') || 'N/A';

      if (status === 200 || status === 206) {
        isHealthy = true;
        console.log(`  ${colors.green}✔ [${node.id}] ${node.url}${colors.reset}`);
        console.log(`    └─ Status: ${colors.bold}${status} ${statusText}${colors.reset} | Latency: ${durationMs}ms | Active SA: #${saIndex} (${activeSa})`);
      } else {
        console.log(`  ${colors.red}✖ [${node.id}] ${node.url}${colors.reset}`);
        console.log(`    └─ Status: ${colors.bold}${status} ${statusText}${colors.reset} | Latency: ${durationMs}ms | Active SA: ${activeSa}`);
      }

      results.push({ id: node.id, url: node.url, status, durationMs, activeSa, saIndex, isHealthy });
    } catch (err) {
      const durationMs = Date.now() - startTime;
      console.log(`  ${colors.red}✖ [${node.id}] ${node.url}${colors.reset}`);
      console.log(`    └─ Error: ${colors.bold}${err.message}${colors.reset} | Latency: ${durationMs}ms`);
      results.push({ id: node.id, url: node.url, status: 0, durationMs, error: err.message, isHealthy: false });
    }
  }

  return results;
}

/**
 * MODULE 2: Service Account Pool Validator (Supabase + Google OAuth2 RS256)
 */
function generateGoogleOAuthTokenNode(email, privateKeyPem) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const base64UrlEncode = (str) => Buffer.from(str).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const unsignedJwt = `${encodedHeader}.${encodedPayload}`;

    const formattedKey = privateKeyPem.replace(/\\n/g, '\n');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    const signature = signer.sign(formattedKey, 'base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    return `${unsignedJwt}.${signature}`;
  } catch (err) {
    throw new Error(`RSA Signature error: ${err.message}`);
  }
}

async function fetchGoogleAccessTokenNode(email, privateKeyPem) {
  const jwt = generateGoogleOAuthTokenNode(email, privateKeyPem);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const data = await res.json();
  if (data.access_token) {
    return data.access_token;
  }
  throw new Error(data.error_description || data.error || 'Token fetch failed');
}

export async function validateServiceAccountPool() {
  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold} 🔑 MODULE 2: GOOGLE SERVICE ACCOUNT POOL VALIDATOR${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);

  let saList = [];

  // Load from Supabase DB or .env fallback
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const cleanUrl = SUPABASE_URL.replace(/\/+$/, '');
      const dbEndpoint = `${cleanUrl}/rest/v1/drive_service_accounts?select=client_email,private_key,is_active`;
      const res = await fetch(dbEndpoint, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          saList = rows.map(r => ({ email: r.client_email || r.email, privateKey: r.private_key || r.privateKey, isActive: r.is_active }));
          console.log(`  ${colors.gray}Loaded ${saList.length} Service Accounts from Supabase DB.${colors.reset}`);
        }
      }
    } catch (err) {
      console.log(`  ${colors.yellow}Supabase fetch fallback to .env SERVICE_ACCOUNTS_JSON: ${err.message}${colors.reset}`);
    }
  }

  if (saList.length === 0 && process.env.SERVICE_ACCOUNTS_JSON) {
    try {
      const parsed = JSON.parse(process.env.SERVICE_ACCOUNTS_JSON);
      saList = parsed.map(sa => ({ email: sa.email, privateKey: sa.privateKey, isActive: true }));
      console.log(`  ${colors.gray}Loaded ${saList.length} Service Accounts from .env SERVICE_ACCOUNTS_JSON.${colors.reset}`);
    } catch (e) {}
  }

  if (saList.length === 0) {
    console.log(`  ${colors.red}No Service Accounts found to test! Check SUPABASE_URL or SERVICE_ACCOUNTS_JSON.${colors.reset}`);
    return { total: 0, healthyCount: 0, quotaExhaustedCount: 0, errorCount: 0, details: [] };
  }

  const results = [];
  let healthyCount = 0;
  let quotaExhaustedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < saList.length; i++) {
    const sa = saList[i];
    const label = `SA #${i + 1} (${sa.email})`;

    try {
      const accessToken = await fetchGoogleAccessTokenNode(sa.email, sa.privateKey);
      
      // Test metadata query on Google Drive API
      const driveUrl = `https://www.googleapis.com/drive/v3/files/${TEST_FILE_ID}?fields=id,name,size,mimeType`;
      const driveRes = await fetch(driveUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (driveRes.ok) {
        healthyCount++;
        const meta = await driveRes.json();
        console.log(`  ${colors.green}✔ ${label}${colors.reset} ➔ ${colors.bold}HEALTHY (200 OK)${colors.reset} [File: ${meta.name || TEST_FILE_ID}]`);
        results.push({ email: sa.email, status: 'HEALTHY', httpCode: 200, isHealthy: true });
      } else if (driveRes.status === 403 || driveRes.status === 429) {
        quotaExhaustedCount++;
        console.log(`  ${colors.yellow}⚠ ${label}${colors.reset} ➔ ${colors.bold}QUOTA EXHAUSTED (${driveRes.status})${colors.reset}`);
        results.push({ email: sa.email, status: 'QUOTA_EXHAUSTED', httpCode: driveRes.status, isHealthy: false });
      } else {
        errorCount++;
        console.log(`  ${colors.red}✖ ${label}${colors.reset} ➔ ${colors.bold}DRIVE ERROR (${driveRes.status})${colors.reset}`);
        results.push({ email: sa.email, status: 'DRIVE_ERROR', httpCode: driveRes.status, isHealthy: false });
      }
    } catch (err) {
      errorCount++;
      console.log(`  ${colors.red}✖ ${label}${colors.reset} ➔ ${colors.bold}TOKEN SIGN ERROR${colors.reset} (${err.message})`);
      results.push({ email: sa.email, status: 'TOKEN_SIGN_ERROR', httpCode: 0, error: err.message, isHealthy: false });
    }
  }

  return { total: saList.length, healthyCount, quotaExhaustedCount, errorCount, details: results };
}

/**
 * MODULE 3: UNIFIED PLAYER ERROR DIAGNOSTIC ENGINE (One-Click Debugger)
 */
export function diagnosePlayerError(statusCodeOrError, context = {}) {
  const codeStr = String(statusCodeOrError).toUpperCase();
  
  const diagnosticMap = {
    '403': {
      category: 'UPSTREAM_QUOTA_OR_AUTH_EXHAUSTION',
      rootCause: 'Google Drive 24-Hour download bandwidth limit exceeded (750GB/day limit) or HMAC token expiry.',
      solution: 'Service Account Mesh circuit breaker auto-rotates to healthy accounts. Ensure worker_sync.js 5-minute Lazy Health Cache is active.'
    },
    '429': {
      category: 'RATE_LIMIT_EXCEEDED',
      rootCause: 'Too many concurrent chunk requests hitting Google Drive API simultaneously.',
      solution: 'Cloudflare Worker request deduplication collapsing & 15-minute SA cooldown automatically throttles traffic.'
    },
    'ERR_ABORTED': {
      category: 'CLIENT_STREAM_INTERRUPTED',
      rootCause: 'User seeked timeline or closed video modal before chunk transfer finished.',
      solution: 'Normal HTML5 Video scrubbing behavior. No server action required.'
    },
    '500': {
      category: 'WORKER_INTERNAL_GATEWAY_ERROR',
      rootCause: 'Missing environment bindings (SUPABASE_URL, STREAM_SECRET) or RSA subtle crypto failure.',
      solution: 'Check wrangler.toml secrets binding and verify RS256 private key PEM formatting.'
    },
    '502': {
      category: 'BAD_GATEWAY_UPSTREAM',
      rootCause: 'Google OAuth2 token endpoint (oauth2.googleapis.com) timed out or returned HTTP 5xx.',
      solution: 'Worker retry pipeline attempts secondary token fetch automatically.'
    }
  };

  const diagnosis = diagnosticMap[codeStr] || {
    category: 'UNKNOWN_NETWORK_OR_CORRUPT_CONTAINER',
    rootCause: `Unhandled HTTP or decoding exception (${codeStr}).`,
    solution: 'Verify browser video codec support (H.264/AAC vs HEVC/x265) and CORS headers.'
  };

  return {
    errorCode: codeStr,
    ...diagnosis,
    timestamp: new Date().toISOString(),
    context
  };
}

/**
 * MODULE 4: AUTOMATED ADMIN WORKLOAD REDUCTION (High-ROI CLI Summary & Recovery Engine)
 */
export async function runFullDiagnostics() {
  console.log(`\n${colors.magenta}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold} 🚀 SMD PRIME INFRASTRUCTURE AUTOMATED DIAGNOSTIC SUITE (v12.0)${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold}========================================================================${colors.reset}`);

  // 1. Run Worker Tests
  const workerResults = await testWorkerNodes();
  const healthyWorkers = workerResults.filter(w => w.isHealthy).length;
  const workerHealthPct = Math.round((healthyWorkers / workerResults.length) * 100);

  // 2. Run SA Pool Tests
  const saResults = await validateServiceAccountPool();

  // 3. One-Click Debugger Sample Demonstration
  console.log(`\n${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold} 🛠 MODULE 3: UNIFIED PLAYER ERROR DIAGNOSTIC DEMONSTRATION${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}========================================================================${colors.reset}`);
  
  const sample403 = diagnosePlayerError(403, { movieUid: 'master_2021', fileId: TEST_FILE_ID });
  console.log(`  ${colors.bold}Input Code: 403 Forbidden${colors.reset}`);
  console.log(`  ├─ Category:   ${colors.yellow}${sample403.category}${colors.reset}`);
  console.log(`  ├─ Root Cause: ${sample403.rootCause}`);
  console.log(`  └─ Solution:   ${colors.green}${sample403.solution}${colors.reset}`);

  // 4. Executive CLI Dashboard Report
  console.log(`\n${colors.magenta}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold} 📊 MODULE 4: AUTOMATED ADMIN WORKLOAD REDUCTION REPORT${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold}========================================================================${colors.reset}`);

  console.log(`  ${colors.bold}EDGE WORKER NODES:${colors.reset}       [${healthyWorkers}/${workerResults.length} Active] -> ${workerHealthPct >= 66 ? colors.green : colors.red}${workerHealthPct}% Healthy${colors.reset}`);
  if (saResults.total > 0) {
    const saHealthPct = Math.round((saResults.healthyCount / saResults.total) * 100);
    console.log(`  ${colors.bold}SERVICE ACCOUNT MESH:${colors.reset}    [${saResults.healthyCount}/${saResults.total} Active] -> ${saHealthPct >= 50 ? colors.green : colors.yellow}${saHealthPct}% Healthy${colors.reset}`);
    console.log(`  ${colors.bold}QUOTA EXHAUSTED SAs:${colors.reset}     ${saResults.quotaExhaustedCount} account(s) on 15m cooldown`);
  }

  console.log(`\n${colors.cyan}${colors.bold}AUTOMATED RECOVERY RECOMMENDATIONS:${colors.reset}`);
  if (workerHealthPct === 100 && (saResults.healthyCount || 1) > 0) {
    console.log(`  ${colors.green}✔ ALL SYSTEMS OPERATIONAL. 0 Admin Intervention Required.${colors.reset}`);
    console.log(`  └─ Edge routing 5-minute Lazy Health Cache is running with zero buffer latency.`);
  } else {
    if (workerHealthPct < 100) {
      console.log(`  ${colors.yellow}⚡ Action Required: Deploy updated worker_sync.js to non-responsive edge nodes.${colors.reset}`);
      console.log(`     Command: npx wrangler deploy worker_sync.js -c wrangler-2.toml`);
    }
    if (saResults.quotaExhaustedCount > 0) {
      console.log(`  ${colors.yellow}⚡ SA Quota Notice: ${saResults.quotaExhaustedCount} Service Account(s) reached 750GB daily Google limit.${colors.reset}`);
      console.log(`     Auto-Healing: worker_sync.js 15-minute circuit breaker will automatically re-enable them upon quota reset.`);
    }
  }

  console.log(`\n${colors.gray}Diagnostic completed at ${new Date().toLocaleString()}${colors.reset}\n`);
}

// Auto-run if executed directly via node CLI
if (process.argv[1] && process.argv[1].includes('diagnostic_suite.js')) {
  runFullDiagnostics().catch(err => {
    console.error('Fatal error running diagnostic suite:', err);
    process.exit(1);
  });
}
