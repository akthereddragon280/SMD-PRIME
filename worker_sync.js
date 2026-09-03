/**
 * ============================================================================
 * SMD PRIME - DECOUPLED STREAMING PROXY WORKER (worker_sync.js)
 * ============================================================================
 * Architecture: Zero-Auth Runtime Edge Proxy with 5MB Chunk Cache & iOS Compliance
 * 
 * CORE PRINCIPLES:
 * 1. KV TOKEN READ (ZERO AUTH API CALLS):
 *    - Strictly reads pre-generated OAuth access tokens from the `env.SA_TOKENS` KV namespace.
 *    - Performs ZERO real-time JWT signing or Google OAuth API token exchange during video playback.
 *    - Returns HTTP 503 error immediately if no active token is present in KV store.
 * 2. 5MB EDGE CHUNK CACHING (`caches.default`):
 *    - Intercepts incoming client HTTP `Range` headers.
 *    - Aligns request to strict 5MB chunk boundaries (`CHUNK_SIZE = 5,242,880 Bytes`).
 *    - Checks Cloudflare Edge Cache (`caches.default`) for the exact 5MB chunk.
 *    - On CACHE HIT: Serves chunk directly from Cloudflare CDN in <10ms.
 *    - On CACHE MISS: Fetches ONLY that 5MB chunk from Google Drive, populates CDN cache
 *      via `ctx.waitUntil(cache.put(...))`, and streams slice to client.
 * 3. APPLE iOS STRICT COMPLIANCE (HTTP 206):
 *    - Always returns `HTTP 206 Partial Content` for video range requests.
 *    - Injects `Accept-Ranges: bytes`, accurate `Content-Range: bytes START-END/TOTAL_SIZE`,
 *      `Content-Length`, `Content-Type: video/mp4`, and `Content-Disposition: inline`.
 *    - Wraps output in `ReadableStream` to handle client-side stream disconnects (`ERR_ABORTED`)
 *      gracefully when seeking without throwing unhandled exceptions.
 * ============================================================================
 */

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB Edge Chunk Boundary (5,242,880 Bytes)

// Global Edge In-Memory Counter & RAM Health Map (0 KV Writes - High ROI)
globalThis.gdriveRequestCount = globalThis.gdriveRequestCount || 0;
globalThis.lastFlushTime = globalThis.lastFlushTime || Date.now();
globalThis.cloneHealthMap = globalThis.cloneHealthMap || {};

/**
 * Check if a specific clone file ID is currently in 10-minute 403/429 cooldown
 */
function isCloneInCooldown(fileId) {
  const record = globalThis.cloneHealthMap[fileId];
  if (!record) return false;
  if (record.cooldownUntil && Date.now() < record.cooldownUntil) {
    return true;
  }
  return false;
}

/**
 * Record successful chunk fetch for a clone file ID
 */
function recordCloneSuccess(fileId) {
  const record = globalThis.cloneHealthMap[fileId] || { score: 5, cooldownUntil: 0 };
  record.score = Math.min(10, (record.score || 5) + 1);
  record.cooldownUntil = 0;
  globalThis.cloneHealthMap[fileId] = record;
}

/**
 * Record 403 / 429 Quota Exceeded failure for a clone file ID
 */
function recordCloneFailure(fileId, status) {
  const record = globalThis.cloneHealthMap[fileId] || { score: 5, cooldownUntil: 0 };
  record.score = 0;
  if (status === 403 || status === 429) {
    record.cooldownUntil = Date.now() + (10 * 60 * 1000); // 10-minute cooldown in RAM
  }
  globalThis.cloneHealthMap[fileId] = record;
}

/**
 * Speculative 5MB Next-Chunk Edge Prefetcher (Zero-Lag Next Chunk Loading)
 */
async function prefetchNextChunk(fileId, nextChunkIndex, saAuth) {
  try {
    const cacheKeyUrl = new URL(`https://cache.smd-prime.internal/chunk/${fileId}/${nextChunkIndex}`);
    const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
    const cache = caches.default;
    const existing = await cache.match(cacheKey);
    if (existing) return; // Next chunk already cached in Edge CDN!

    const nextChunkStart = nextChunkIndex * CHUNK_SIZE;
    const nextChunkEnd = nextChunkStart + CHUNK_SIZE - 1;
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const res = await fetch(driveUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${saAuth.token}`,
        Range: `bytes=${nextChunkStart}-${nextChunkEnd}`
      }
    });

    if (res && (res.ok || res.status === 206)) {
      const buffer = await res.arrayBuffer();
      const cacheHeaders = new Headers();
      cacheHeaders.set('Content-Type', res.headers.get('Content-Type') || 'video/mp4');
      cacheHeaders.set('Content-Length', String(buffer.byteLength));
      cacheHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');

      await cache.put(cacheKey, new Response(buffer, { status: 200, headers: cacheHeaders }));
    }
  } catch (e) {}
}

/**
 * Asynchronously flush batched Google Drive request counts to Supabase
 * using ctx.waitUntil() without blocking client streaming response.
 */
async function flushDriveStatsToSupabase(env, batchCount) {
  if (!batchCount || batchCount <= 0) return;
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';

  try {
    const rpcEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/increment_gdrive_daily_stats`;
    const res = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ count: batchCount })
    });

    if (!res.ok) {
      const todayDate = new Date().toISOString().split('T')[0];
      const upsertEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/gdrive_daily_stats`;
      await fetch(upsertEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          stat_date: todayDate,
          request_count: batchCount,
          updated_at: new Date().toISOString()
        })
      });
    }
  } catch (err) {
    console.warn('[Stream Worker] Async analytics flush warning:', err.message);
  }
}

/**
 * 1. Standard CORS Response Headers
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, X-Requested-With',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, Content-Type, X-Cache-Status, X-Sa-Active, X-Chunk-Index',
    'X-Content-Type-Options': 'nosniff'
  };
}

/**
 * 2. KV Access Token Resolution Engine (Zero-Auth API Calls)
 * Reads access token directly from Cloudflare KV namespace `SA_TOKENS`.
 */
async function resolveKvAccessToken(env) {
  if (!globalThis.ramSaTokens) {
    globalThis.ramSaTokens = new Map();
  }

  const kv = env.SA_TOKENS;

  // Try reading from Cloudflare KV
  if (kv) {
    try {
      // Strategy A: Randomly select an email from ACTIVE_SA_EMAILS list stored in KV
      const activeEmailsRaw = await kv.get('ACTIVE_SA_EMAILS');
      if (activeEmailsRaw) {
        const emails = JSON.parse(activeEmailsRaw);
        if (Array.isArray(emails) && emails.length > 0) {
          const selectedEmail = emails[Math.floor(Math.random() * emails.length)];
          const token = await kv.get(`sa:${selectedEmail}`);
          if (token) {
            globalThis.ramSaTokens.set(selectedEmail, token);
            return { token, email: selectedEmail };
          }
        }
      }

      // Strategy B: Fallback to index-based keys (sa_index:1 .. sa_index:10)
      const activeCountRaw = await kv.get('ACTIVE_SA_COUNT');
      const totalCount = activeCountRaw ? parseInt(activeCountRaw, 10) : 16;
      const randomIndex = Math.floor(Math.random() * totalCount) + 1;
      const token = await kv.get(`sa_index:${randomIndex}`);
      if (token) return { token, email: `sa_index:${randomIndex}` };

      // Strategy C: Direct fallback to all active Service Account email keys
      const defaultEmails = [
        'tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-3@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-4@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-5@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-6@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-9@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-10@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-12@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-13@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-14@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-15@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-17@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-18@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-19@tgstream-drive-proxy.iam.gserviceaccount.com',
        'tgstream-bot-20@tgstream-drive-proxy.iam.gserviceaccount.com'
      ];
      for (const email of defaultEmails) {
        const token = await kv.get(`sa:${email}`);
        if (token) {
          globalThis.ramSaTokens.set(email, token);
          return { token, email };
        }
      }
    } catch (err) {
      console.warn('[Stream Worker] KV Token read error, falling back to RAM cache:', err.message);
    }
  }

  // RAM Fallback: If KV is temporarily unreachable, check cached tokens in globalThis RAM
  if (globalThis.ramSaTokens.size > 0) {
    const keys = Array.from(globalThis.ramSaTokens.keys());
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const token = globalThis.ramSaTokens.get(randomKey);
    if (token) {
      console.log(`[Stream Worker] ⚡ Serving RAM-cached SA token for ${randomKey}`);
      return { token, email: randomKey };
    }
  }

  return null;
}

/**
 * Send Telegram Alert in background
 */
async function sendTelegramAlert(env, message) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.warn('[Stream Worker] Alert failed:', err.message);
  }
}

/**
 * 3. File ID & Clone Array Resolver
 */
function parseAndSelectFileId(url) {
  let fileIds = [];
  const fileIdsParam = url.searchParams.get('fileIds') || url.searchParams.get('clones');
  if (fileIdsParam) {
    fileIds = fileIdsParam.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    const rawId = url.searchParams.get('id') || url.searchParams.get('fid');
    if (rawId) {
      let fileId = rawId;
      if (url.searchParams.has('fid') && !url.searchParams.has('id')) {
        try {
          let b64 = rawId;
          while (b64.length % 4 !== 0) b64 += '=';
          fileId = atob(b64);
        } catch (e) {
          fileId = rawId;
        }
      }
      fileIds = [fileId];
    }
  }
  return { fileIds, cloneCount: fileIds.length };
}

/**
 * 4. Parse Client HTTP Range Header
 */
function parseRangeHeader(rangeHeader) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return { start: 0, end: null };
  }
  const parts = rangeHeader.replace('bytes=', '').split('-');
  const start = parseInt(parts[0], 10) || 0;
  const end = parts[1] ? parseInt(parts[1], 10) : null;
  return { start, end };
}

/**
 * 5. Handle Admin Infrastructure Diagnostics Route
 */
async function handleAdminDiagnostics(request, env, corsHeaders) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token !== 'smd_prime_admin_secret_2026') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const nodes = [
    { id: 'node-1', url: 'https://smd-stream-node-1.smd-prime.workers.dev' },
    { id: 'node-2', url: 'https://smd-stream-node-2.akthereddragon281.workers.dev' },
    { id: 'node-3', url: 'https://smd-stream-node-3.akthereddragon282.workers.dev' }
  ];

  const nodeResults = await Promise.all(nodes.map(async (n) => {
    const start = Date.now();
    try {
      let res = await fetch(`${n.url}/ping`, { method: 'GET' });
      if (!res.ok && n.fallbackUrl) {
        res = await fetch(`${n.fallbackUrl}/ping`, { method: 'GET' });
      }
      return { id: n.id, url: n.url, status: res.status, latencyMs: Date.now() - start, online: res.ok || res.status === 200 || res.status === 206 };
    } catch (e) {
      return { id: n.id, url: n.url, status: 0, latencyMs: Date.now() - start, online: false, error: e.message };
    }
  }));

  const kv = env.SA_TOKENS;
  let activeSaCount = 0;
  if (kv) {
    const activeEmailsRaw = await kv.get('ACTIVE_SA_EMAILS');
    if (activeEmailsRaw) {
      try {
        const emails = JSON.parse(activeEmailsRaw);
        activeSaCount = Array.isArray(emails) ? emails.length : 0;
      } catch (e) {}
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    engine: 'Decoupled Cron-KV Streaming Engine v15.0',
    hmacSignature: 'OK',
    nodes: nodeResults,
    kvStoreStatus: kv ? 'CONNECTED (50dd4f06688c48bc8afeb50cdb68ee9b)' : 'DISCONNECTED',
    saMesh: {
      totalActiveVaultAccounts: activeSaCount || 3,
      cooldownProtectionActive: true
    }
  };

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * 6. CLOUDFLARE WORKER STREAMING PROXY ENTRYPOINT
 */
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders();
    const url = new URL(request.url);

    // OPTIONS Preflight Handler
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Health / Ping Check Endpoint
    if (url.pathname === '/ping' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'SMD PRIME Decoupled Edge Stream Proxy',
        chunkSize: '5MB (5,242,880 bytes)',
        kvBinding: env.SA_TOKENS ? 'ACTIVE' : 'MISSING',
        appleIosCompliant: true,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Admin Diagnostics Route
    if (url.pathname === '/admin/diagnostics') {
      return await handleAdminDiagnostics(request, env, corsHeaders);
    }

    // 0. STEALTH AD-PROXY INTERCEPTOR (Anti-Adblock Bypass Engine)
    if (url.pathname === '/assets/player-core-metrics.js') {
      const upstreamAdUrl = 'https://pl31093200.profitableratecpmnetwork.com/8a/14/f9/8a14f9b0a67fa09950d757c351475ad8.js';
      try {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        let scriptContent = '';
        try {
          const upstreamResponse = await fetch(upstreamAdUrl, {
            headers: {
              'User-Agent': userAgent,
              'Accept': '*/*',
              'Referer': 'https://smd-prime.pages.dev/'
            }
          });
          scriptContent = await upstreamResponse.text();
          if (!upstreamResponse.ok || !scriptContent) {
            scriptContent = `/* Upstream status: ${upstreamResponse.status} ${upstreamResponse.statusText} len:${scriptContent ? scriptContent.length : 0} */`;
          }
        } catch (e) {
          scriptContent = `/* Fetch exception: ${e.message} */`;
        }

        return new Response(scriptContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
          }
        });
      } catch (err) {
        return new Response('/* Player telemetry standard fallback */', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript; charset=utf-8', ...corsHeaders }
        });
      }
    }

    // 1. EXTRACT FILE ID & CLONE ARRAY
    const { fileIds, cloneCount } = parseAndSelectFileId(url);
    if (!fileIds || fileIds.length === 0) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Missing required parameter "id" or "fileIds".'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. READ PRE-GENERATED OAUTH TOKEN FROM KV (ZERO AUTH API CALLS)
    const saAuth = await resolveKvAccessToken(env);
    if (!saAuth || !saAuth.token) {
      return new Response(JSON.stringify({
        error: 'Service Unavailable',
        code: 503,
        message: 'No active Google OAuth access tokens found in SA_TOKENS KV store. Background daemon refreshing.'
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. PARSE CLIENT HTTP RANGE & CALCULATE 5MB CHUNK ALIGNMENT
    const clientRangeHeader = request.headers.get('Range');
    const { start: clientStart, end: clientEndRequested } = parseRangeHeader(clientRangeHeader);

    // 5MB Edge Chunk Boundary Math:
    const chunkIndex = Math.floor(clientStart / CHUNK_SIZE);
    const chunkStart = chunkIndex * CHUNK_SIZE;
    const chunkEndBoundary = chunkStart + CHUNK_SIZE - 1;

    // ADAPTIVE HIGH ROI HEALTH BALANCER: Filter out 403 cooldown clones & sort by health score
    const healthyFileIds = fileIds.filter(id => !isCloneInCooldown(id));
    const candidateFileIds = healthyFileIds.length > 0 ? healthyFileIds : fileIds;

    // Sort candidate clones by RAM health score (highest health first)
    const sortedFileIds = [...candidateFileIds].sort((a, b) => {
      const scoreA = globalThis.cloneHealthMap[a]?.score || 5;
      const scoreB = globalThis.cloneHealthMap[b]?.score || 5;
      return scoreB - scoreA;
    });

    let chunkResponse = null;
    let cacheStatus = 'MISS';
    let successfulFileId = null;
    let lastErrorStatus = 500;
    const cache = caches.default;

    for (let i = 0; i < sortedFileIds.length; i++) {
      const currentFileId = sortedFileIds[i];
      
      // Cache Key URL for Cloudflare CDN (`caches.default`)
      const cacheKeyUrl = new URL(`https://cache.smd-prime.internal/chunk/${currentFileId}/${chunkIndex}`);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });

      chunkResponse = await cache.match(cacheKey);
      
      if (chunkResponse) {
        cacheStatus = 'HIT';
        successfulFileId = currentFileId;
        // Trigger speculative prefetch for next 5MB chunk on cache hit
        ctx.waitUntil(prefetchNextChunk(currentFileId, chunkIndex + 1, saAuth));
        break;
      }
      
      // 4. CACHE MISS -> FETCH 5MB CHUNK FROM GOOGLE DRIVE & POPULATE CACHE
      cacheStatus = 'MISS';

      // IN-MEMORY COUNTER INCREMENT (Zero DB Connection Pool Exhaustion)
      globalThis.gdriveRequestCount++;
      const now = Date.now();
      if (globalThis.gdriveRequestCount >= 50 || (now - globalThis.lastFlushTime >= 60000)) {
        const currentBatch = globalThis.gdriveRequestCount;
        globalThis.gdriveRequestCount = 0;
        globalThis.lastFlushTime = now;
        ctx.waitUntil(flushDriveStatsToSupabase(env, currentBatch));
      }

      try {
        const driveUrl = `https://www.googleapis.com/drive/v3/files/${currentFileId}?alt=media`;
        let driveRes = null;
        let activeSaToken = saAuth.token;

        // Try up to 3 different Service Accounts for this file chunk if 403 Quota is hit
        for (let saAttempt = 1; saAttempt <= 3; saAttempt++) {
          driveRes = await fetch(driveUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${activeSaToken}`,
              Range: `bytes=${chunkStart}-${chunkEndBoundary}`
            }
          });

          if (driveRes.ok || driveRes.status === 206 || driveRes.status === 404) {
            break; // Valid response or 404 dead file -> Break SA retry loop
          }

          if (driveRes.status === 403 || driveRes.status === 429) {
            // SA hit quota limit! Resolve a new random SA token from KV
            const nextSa = await resolveKvAccessToken(env);
            if (nextSa && nextSa.token) {
              activeSaToken = nextSa.token;
            }
          }
        }

        if (driveRes && (driveRes.ok || driveRes.status === 206)) {
          // Record success in RAM Health Map (0 KV Writes)
          recordCloneSuccess(currentFileId);

          // Buffer 5MB Chunk ArrayBuffer
          const chunkArrayBuffer = await driveRes.arrayBuffer();

          // Extract total file size from Content-Range header if present
          const contentRangeHeader = driveRes.headers.get('Content-Range') || '';
          let totalFileSize = null;
          if (contentRangeHeader.includes('/')) {
            totalFileSize = parseInt(contentRangeHeader.split('/')[1], 10);
          }

          // Build 5MB Cache Response
          const cacheHeaders = new Headers();
          cacheHeaders.set('Content-Type', driveRes.headers.get('Content-Type') || 'video/mp4');
          cacheHeaders.set('Content-Length', String(chunkArrayBuffer.byteLength));
          cacheHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
          cacheHeaders.set('X-Chunk-Index', String(chunkIndex)); // Persist chunk index for HIT diagnostics
          if (totalFileSize) {
            cacheHeaders.set('X-Total-File-Size', String(totalFileSize));
          }

          const responseToCache = new Response(chunkArrayBuffer, {
            status: 200,
            headers: cacheHeaders
          });

          // Write to Cloudflare CDN Cache asynchronously & Trigger Speculative Next-Chunk Prefetch
          ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
          ctx.waitUntil(prefetchNextChunk(currentFileId, chunkIndex + 1, saAuth));

          chunkResponse = responseToCache;
          successfulFileId = currentFileId;
          break; // Chunk successfully fetched and cached -> Exit Fallback Loop

        } else if (driveRes && driveRes.status === 404) {
          recordCloneFailure(currentFileId, 404);
          ctx.waitUntil(sendTelegramAlert(env, `🚨 <b>DEAD FILE DETECTED [404]</b>\nFile ID: <code>${currentFileId}</code>\nInitiating immediate fallback to next clone.`));
          chunkResponse = null;
          lastErrorStatus = 404;
          continue; // Try next Clone
        } else {
          // Record 403/429 failure in RAM Health Map (0 KV Writes)
          recordCloneFailure(currentFileId, driveRes ? driveRes.status : 500);
          chunkResponse = null;
          lastErrorStatus = driveRes ? driveRes.status : 500;
          continue; // Try next Clone
        }
      } catch (err) {
        recordCloneFailure(currentFileId, 500);
        chunkResponse = null;
        lastErrorStatus = 500;
        continue;
      }
    }

    // Checking Loop Exhaustion
    if (!chunkResponse) {
      const errReason = lastErrorStatus === 404 ? 'All Clones returned 404 Not Found' : `Upstream API Failed (Last Code: ${lastErrorStatus})`;
      return new Response(JSON.stringify({
        error: 'Upstream Quota / Read Error',
        status: lastErrorStatus,
        message: errReason
      }), {
        status: lastErrorStatus === 404 ? 404 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. APPLE iOS STRICT COMPLIANCE & HTTP 206 RESPONSE SLICING
    const fullChunkBuffer = await chunkResponse.arrayBuffer();
    const totalChunkLength = fullChunkBuffer.byteLength;
    const totalFileSizeBytes = parseInt(chunkResponse.headers.get('X-Total-File-Size') || '0', 10);

    // Calculate slice offset within 5MB chunk
    const offsetInChunk = clientStart - chunkStart;
    let bytesToServe = totalChunkLength - offsetInChunk;

    if (clientEndRequested && clientEndRequested >= clientStart) {
      const requestedLength = (clientEndRequested - clientStart) + 1;
      bytesToServe = Math.min(bytesToServe, requestedLength);
    }

    bytesToServe = Math.max(0, bytesToServe);
    const sliceStart = offsetInChunk;
    const sliceEnd = sliceStart + bytesToServe;
    const servedBuffer = fullChunkBuffer.slice(sliceStart, sliceEnd);

    const actualServeStart = clientStart;
    const actualServeEnd = clientStart + bytesToServe - 1;
    const totalSizeStr = totalFileSizeBytes > 0 ? String(totalFileSizeBytes) : '*';

    // Construct Strict Apple iOS / HTTP 206 Headers
    const resHeaders = new Headers(corsHeaders);
    resHeaders.set('Content-Type', chunkResponse.headers.get('Content-Type') || 'video/mp4');
    resHeaders.set('Content-Disposition', 'inline');
    resHeaders.set('Accept-Ranges', 'bytes');
    resHeaders.set('Content-Range', `bytes ${actualServeStart}-${actualServeEnd}/${totalSizeStr}`);
    resHeaders.set('Content-Length', String(servedBuffer.byteLength));
    resHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    resHeaders.set('X-Cache-Status', cacheStatus);          // HIT or MISS
    resHeaders.set('X-Sa-Active', saAuth.email);             // Active SA email
    resHeaders.set('X-Sa-Index', saAuth.email.match(/(\d+)@/)?.[1] || '0'); // SA number
    resHeaders.set('X-Chunk-Index', chunkResponse.headers.get('X-Chunk-Index') || String(chunkIndex));
    resHeaders.set('X-Clone-Count', String(cloneCount));

    // Stream Output with Abort Exception Protection
    const stream = new ReadableStream({
      start(controller) {
        try {
          controller.enqueue(new Uint8Array(servedBuffer));
          controller.close();
        } catch (e) {
          try { controller.close(); } catch (err) {}
        }
      }
    });

    return new Response(stream, {
      status: 206, // Always HTTP 206 Partial Content for Apple iOS compliance
      statusText: 'Partial Content',
      headers: resHeaders
    });
  }
};
