/**
 * ============================================================================
 * SMD PRIME - ULTRA-HIGH PERFORMANCE STREAMING PROXY (stream_worker.js)
 * ============================================================================
 * Architecture: Decoupled Edge Proxy with 5MB Chunk Caching & iOS Compliance
 * 
 * DESIGN SPECIFICATIONS:
 * 1. ZERO RUNTIME DB/OAUTH DECOUPLING:
 *    - NEVER contacts Supabase or Google Auth during video playback.
 *    - Reads pre-minted OAuth access tokens directly from Cloudflare KV (`SA_TOKENS`).
 * 2. CLONE ARRAY ROUTING (CONCURRENT READ LOAD BALANCING):
 *    - Accepts single file ID (`?id=xyz`) or array of cloned file IDs (`?fileIds=id1,id2,id3`).
 *    - On a cache miss, randomly selects one cloned file ID to fetch from Google Drive,
 *      bypassing single-file Google Drive read concurrency limits.
 * 3. 5MB EDGE CHUNK CACHING MATH (caches.default):
 *    - Intercepts incoming client HTTP `Range` headers.
 *    - Align client requests to strict 5MB chunk boundaries (5,242,880 bytes).
 *    - Chunk Index Math: `chunkIndex = Math.floor(requestedStart / 5242880)`.
 *    - On Cache Hit: Serves 5MB chunk instantly from Cloudflare Edge CDN (<10ms).
 *    - On Cache Miss: Fetches ONLY that 5MB chunk from Google Drive, puts into
 *      Cloudflare Cache asynchronously via `ctx.waitUntil()`, and streams to client.
 * 4. APPLE STRICT MODE (iOS COMPLIANCE & ERR_ABORTED PROTECTION):
 *    - Enforces HTTP 206 Partial Content, `Accept-Ranges: bytes`, accurate `Content-Range`,
 *      and strict `Content-Length`.
 *    - Gracefully handles client-side stream disconnects (`ERR_ABORTED`) when seeking
 *      without throwing unhandled state exceptions in Cloudflare Workers.
 * ============================================================================
 */

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB Edge Chunk Size (5,242,880 Bytes)

/**
 * 1. Standard CORS Response Headers Builder
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
 * 2. KV Token Resolution Strategy
 * Fetches token from Cloudflare KV. Uses active email list or index keys.
 */
async function resolveKvAccessToken(env) {
  const kv = env.SA_TOKENS;
  if (!kv) return null;

  try {
    // Strategy A: Fetch list of active emails written by Cron Worker
    const activeEmailsRaw = await kv.get('ACTIVE_SA_EMAILS');
    if (activeEmailsRaw) {
      const emails = JSON.parse(activeEmailsRaw);
      if (Array.isArray(emails) && emails.length > 0) {
        // Randomly select one active SA email to balance load across token pool
        const selectedEmail = emails[Math.floor(Math.random() * emails.length)];
        const token = await kv.get(`sa:${selectedEmail}`);
        if (token) return { token, email: selectedEmail };
      }
    }

    // Strategy B: Fallback to index-based keys (sa_index:1 .. sa_index:10)
    const countRaw = await kv.get('ACTIVE_SA_COUNT');
    const totalCount = countRaw ? parseInt(countRaw, 10) : 3;
    const randomIndex = Math.floor(Math.random() * totalCount) + 1;
    const token = await kv.get(`sa_index:${randomIndex}`);
    if (token) return { token, email: `sa_index:${randomIndex}` };

    // Strategy C: Try hardcoded emails from fallback list
    const fallbackEmails = [
      'tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com',
      'tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com',
      'tgstream-bot-10@tgstream-drive-proxy.iam.gserviceaccount.com'
    ];
    for (const email of fallbackEmails) {
      const t = await kv.get(`sa:${email}`);
      if (t) return { token: t, email };
    }
  } catch (e) {
    console.warn('[Stream Proxy] KV Token read error:', e.message);
  }

  return null;
}

/**
 * 3. Clone Array File ID Selection Engine
 * Parses ?fileIds=clone1,clone2,clone3 or ?id=xyz.
 * Randomly picks 1 file ID to distribute concurrent read load across Drive copies.
 */
function parseAndSelectFileId(url) {
  const fileIdsParam = url.searchParams.get('fileIds') || url.searchParams.get('clones');
  if (fileIdsParam) {
    const ids = fileIdsParam.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      const selected = ids[Math.floor(Math.random() * ids.length)];
      return { fileId: selected, cloneCount: ids.length };
    }
  }

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
    return { fileId, cloneCount: 1 };
  }

  return { fileId: null, cloneCount: 0 };
}

/**
 * 4. Parse Client HTTP Range Header
 * Examples: "bytes=0-", "bytes=5242880-10485759", "bytes=1000-"
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
 * 5. Fetch 5MB Chunk from Google Drive API
 */
async function fetch5MbChunkFromDrive(fileId, chunkStart, chunkEnd, accessToken) {
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(driveUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Range: `bytes=${chunkStart}-${chunkEnd}`
    }
  });

  return response;
}

/**
 * 6. MAIN WORKER STREAMING HANDLER
 */
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders();
    const url = new URL(request.url);

    // Handle Preflight OPTIONS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // 0. STEALTH AD-PROXY INTERCEPTOR (Anti-Adblock Bypass Engine)
    if (url.pathname === '/assets/player-core-metrics.js') {
      const upstreamAdUrl = 'https://pl31093200.profitableratecpmnetwork.com/8a/14/f9/8a14f9b0a67fa09950d757c351475ad8.js';
      try {
        const upstreamResponse = await fetch(upstreamAdUrl, {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': '*/*',
            'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
          },
          cf: {
            cacheEverything: true,
            cacheTtl: 3600 // Edge Cache for 1 Hour
          }
        });

        if (!upstreamResponse.ok) {
          return new Response('/* Metrics player init fallback */', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript; charset=utf-8', ...corsHeaders }
          });
        }

        const scriptContent = await upstreamResponse.text();
        return new Response(scriptContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
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

    // Diagnostic Health Check Route
    if (url.pathname === '/health' || url.pathname === '/ping') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'SMD PRIME Decoupled Stream Proxy v14.0',
        chunkSize: '5MB (5,242,880 bytes)',
        appleIosCompliant: true,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. EXTRACT FILE ID & CLONE ARRAY ROUTING
    const { fileId, cloneCount } = parseAndSelectFileId(url);
    if (!fileId) {
      return new Response(JSON.stringify({
        error: 'Bad Request',
        message: 'Missing required query parameter "id" or "fileIds".'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. READ ACCESS TOKEN DIRECTLY FROM CLOUDFLARE KV (ZERO DB / ZERO OAUTH)
    const saAuth = await resolveKvAccessToken(env);
    if (!saAuth || !saAuth.token) {
      return new Response(JSON.stringify({
        error: 'Service Unavailable',
        code: 503,
        message: 'No active Google OAuth access tokens available in Cloudflare KV cache. Cron worker executing daemon refresh.'
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. PARSE CLIENT HTTP RANGE & CALCULATE 5MB CHUNK ALIGNMENT
    const clientRangeHeader = request.headers.get('Range');
    const { start: clientStart, end: clientEndRequested } = parseRangeHeader(clientRangeHeader);

    // 5MB Edge Chunk Math:
    // chunkIndex = Math.floor(clientStart / 5MB)
    // chunkStart = chunkIndex * 5MB
    // chunkEnd = chunkStart + 5MB - 1
    const chunkIndex = Math.floor(clientStart / CHUNK_SIZE);
    const chunkStart = chunkIndex * CHUNK_SIZE;
    const chunkEndBoundary = chunkStart + CHUNK_SIZE - 1;

    // Construct Cache Key for Cloudflare CDN (`caches.default`)
    // Key format is normalized by fileId and chunkIndex so all clients hitting this chunk hit CDN cache!
    const cacheKeyUrl = new URL(`https://cache.smd-prime.internal/chunk/${fileId}/${chunkIndex}`);
    const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
    const cache = caches.default;

    let chunkResponse = await cache.match(cacheKey);
    let cacheStatus = 'HIT';

    // 4. CACHE MISS -> FETCH 5MB CHUNK FROM GOOGLE DRIVE & POPULATE CACHE
    if (!chunkResponse) {
      cacheStatus = 'MISS';
      try {
        const driveRes = await fetch5MbChunkFromDrive(fileId, chunkStart, chunkEndBoundary, saAuth.token);

        if (!driveRes.ok && driveRes.status !== 206) {
          // If 403 / 429 quota error occurs, return JSON failure
          return new Response(JSON.stringify({
            error: 'Upstream Stream Error',
            status: driveRes.status,
            message: `Google Drive API returned HTTP ${driveRes.status}.`
          }), {
            status: driveRes.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Buffer the 5MB chunk response for caching & piping
        const chunkArrayBuffer = await driveRes.arrayBuffer();

        // Extract total file size from Content-Range header if present (e.g., "bytes 0-5242879/1073741824")
        const contentRangeHeader = driveRes.headers.get('Content-Range') || '';
        let totalFileSize = null;
        if (contentRangeHeader.includes('/')) {
          totalFileSize = parseInt(contentRangeHeader.split('/')[1], 10);
        }

        // Construct 5MB Cached Response Object
        const cacheHeaders = new Headers();
        cacheHeaders.set('Content-Type', driveRes.headers.get('Content-Type') || 'video/mp4');
        cacheHeaders.set('Content-Length', String(chunkArrayBuffer.byteLength));
        cacheHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800'); // Cache for 7 days at CDN
        if (totalFileSize) {
          cacheHeaders.set('X-Total-File-Size', String(totalFileSize));
        }

        const responseToCache = new Response(chunkArrayBuffer, {
          status: 200,
          headers: cacheHeaders
        });

        // Store in Cloudflare CDN Cache asynchronously
        ctx.waitUntil(cache.put(cacheKey, responseToCache));

        // Create response instance for current request
        chunkResponse = new Response(chunkArrayBuffer, {
          status: 200,
          headers: cacheHeaders
        });
      } catch (fetchErr) {
        return new Response(JSON.stringify({
          error: 'Gateway Fetch Exception',
          message: fetchErr.message
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 5. APPLE STRICT MODE & HTTP 206 RESPONSE FORMATTING
    // Slice 5MB chunk ArrayBuffer to match requested client range slice precisely
    const fullChunkBuffer = await chunkResponse.arrayBuffer();
    const totalChunkLength = fullChunkBuffer.byteLength;
    const totalFileSizeBytes = parseInt(chunkResponse.headers.get('X-Total-File-Size') || '0', 10);

    // Calculate offset within this 5MB chunk
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

    // Construct Strict iOS / Apple Compliant HTTP 206 Response Headers
    const responseHeaders = new Headers(corsHeaders);
    responseHeaders.set('Content-Type', chunkResponse.headers.get('Content-Type') || 'video/mp4');
    responseHeaders.set('Content-Disposition', 'inline');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Content-Range', `bytes ${actualServeStart}-${actualServeEnd}/${totalSizeStr}`);
    responseHeaders.set('Content-Length', String(servedBuffer.byteLength));
    responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    responseHeaders.set('X-Cache-Status', cacheStatus);
    responseHeaders.set('X-Sa-Active', saAuth.email);
    responseHeaders.set('X-Chunk-Index', String(chunkIndex));
    responseHeaders.set('X-Clone-Count', String(cloneCount));

    // Wrap in ReadableStream to handle client-side ERR_ABORTED gracefully without throwing unhandled exceptions
    const stream = new ReadableStream({
      start(controller) {
        try {
          controller.enqueue(new Uint8Array(servedBuffer));
          controller.close();
        } catch (e) {
          // Client aborted connection mid-stream (e.g. user seeked video)
          // Swallow exception gracefully to protect worker state
          try { controller.close(); } catch (err) {}
        }
      }
    });

    return new Response(stream, {
      status: 206, // Always HTTP 206 Partial Content for Apple iOS compliance
      statusText: 'Partial Content',
      headers: responseHeaders
    });
  }
};
