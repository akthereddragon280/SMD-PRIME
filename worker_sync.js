/**
 * SMD PRIME - CLOUDFLARE SINGLE-ENDPOINT HIGH-PERFORMANCE STREAMING WORKER
 * 
 * ARCHITECTURE OVERVIEW:
 * 1. UNIFIED SINGLE ENDPOINT: Replaces multi-node IP-switching with a single edge worker node.
 * 2. DYNAMIC SA VAULT POOL: Fetches active Google Drive Service Accounts from Supabase DB (`drive_service_accounts`)
 *    and caches them in-memory for 30 minutes with hardcoded fallback accounts for zero-downtime execution.
 * 3. DETERMINISTIC ROUND-ROBIN: Rotates through the SA pool sequentially per incoming chunk request.
 * 4. OAUTH TOKEN CACHING: Caches Google OAuth access tokens in worker memory with expiration buffers (expires_in - 60s).
 * 5. AUTOMATIC SILENT FAILOVER: Silently retries fetch using next SA in pool if Google Drive returns 403, 429, or 500.
 * 6. GLOBAL CORS & RANGE PIPELINING: Enforces global CORS compliance and forwards byte-range headers for 206 Partial Content streams.
 */

// 1. HARDCODED FALLBACK SERVICE ACCOUNT VAULT (Ensures zero-downtime if Supabase is unreachable)
const HARDCODED_SERVICE_ACCOUNTS = [
  {
    email: "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n"
  },
  {
    email: "tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpPGCGJjve2SM7\nB0Dv8fcUNV2seJ/Y94ap2oD1j4HGbuPhHEUmQUCq5Wqr4HN9zyVKY09LGQAw/MY7\nDBrT7P7k8B6e+TUtOMqhBBAgm/E6WeHZuUR4z84P2B3iOymLfWoD8pv/ekwC+vsF\n86bnvNXg+N7M8gMojNd3gB0XoU87wkUlQf1igK2AV/eAs2+tjZOS5KvZC/XemSBc\nvV9tNKOoZ03XAXJeX0hBeTZXSoLU6yXTXBXQerV0htydx9gjKnioBn7ayRNK1i3L\nWdIedraSEiIRM6WYoJkkZ68SLag20ci+gl3Y+9D3QxB99/eGZu6Q4RYr7FlHAK4U\ndAnzciHFAgMBAAECggEATcIQF5M5rwrVxSlwDM+AVyiuAbDqwSX6GdDrr+hgGGyb\nB7OVkh4pOFxwxsg6SHQFDkjTBg5WqCt8aWUGbplWBJrPdvvKEx0k/RaA0nrUO5tQ\nylj1vQy+AUmrcWb9j7nwHCA8zQXEJxpqfDGXXqLFIrk2pbQM/3S3C5ExzMmxPiMl\ncu6c1Dkeggdx6LNNU+lm/3Ep87pixUqlTadR1CyzSJFZK8JFB5s3Kod69OT234MM\ng/V8r54NOvCG2985s0BDIKMZ4A8qyLOMcTnzxtD5IQaMy7mB1nzT9mNSw2DLUhRD\nFvHet/zJbv6jab+/cbKH4ZNloVN/zBuvfDSUf6pPgQKBgQDY17Nit6qLEk4ewgkC\n0APfaqYeimjEE+PoEdsEcnBPLEpCZg7t+ctDrGaHIfLc5Skkk38tayd083tc04mK\nI3jvoRD2jgGY+rGQyeLMgJ4fxyQy/FbQ/ioYwit8tm45NWqM/5uSJ3+EwyCUnhbA\nkojprSiCNqfuAcrrpttWpwjSxwKBgQDHy+Pk6cQFFu542HddTBHFw+yVsvzHsdZR\n7keQEVwSMhOCFH0e1Xou+TMDB+kYbpXUktJK1bodMnD1e5GkFPb9dRY5pnqqzqkx\nxutq0CKWXhyb81jFO4dHoj3AT+IhlSFoifIJoxrkLhS5jw3Au/GpTzinGPbf+8ts\nzQ1ErHSbEwKBgEbEPlrdLd8tHimTkXVFhb4IBCa7bO1wwFQgX6XX4yczgRiiTgUE\nHH39aYh4X9YPQ5oYOM0Nx1a3j27/6kcWxIUPv4V3WrYeOozSFh4/a1tblki9aWfT\nStHBrIeK0fYBpMBXOuI72bXuKFfYL/yw1dXNGQdF5xAZrauyTKq+4HZJAoGBAIlH\nWLDixiLRHM2/vlRGfjeqZRZ+wxza3m2xEU61/tMpwSmxtj7HY4p/A0Pj3Y9B/ITw\n1LlCnPyOufqSCwH4vbRtDPZToxlVof9ntD3SANHcnD+zNp1eR5c6rL9EpBV7CFdx\n4PIqNcHuv6K33jU9bdBtdHmrt4Uy1xVM1v8Gl6AtAoGAQF83Ewp39E98mJCKMNeJ\n1LjPx1c8uFmPjw3i0XWUGKYSBhSckNBuoe35RGujQQy5ScaXGUjgN510Og/0+34Y\nn8Pk3tL44WEcs9ULQXFoWGBCEslbZoO1RjcCPckcLM+9SlrBPj7DTfhQFLlSQTjy\nbMmqArLWoY4bzJxd8zMc1k8=\n-----END PRIVATE KEY-----\n"
  },
  {
    email: "tgstream-bot-10@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDTPOFNebPYbkyI\ntsdb9eUl1x+BwbURoSWV//HW6uau8W5HNILnvhTuei5khz/MYncKjxCNAGoxym2r\nyBlAugfoXmEd1X7sZB5S/rcOVgWbH7B00j7aviPxpXwsxfVBnWq89MVBp2PqIQS+\ngmO1YsWYyuITJItIS088l+tEk6shoU3/Rws4EVswQA7XL/MfNySfzPsElxFtHOHR\nCgYfpx956YiZEgy1y8NeBJZqX+QKRY2AglNlaxWNBtCxCSlXYhh6Dz3+ovbz9NVE\nJfJoPrB382TDYUP23bcvBTGwCAV78j2Zd0UbBD1rzqV96eomYJyKO9V3xcspOkDn\nX+Bjp8aTAgMBAAECggEAFUznySizBmmE5SpNKww+GZU6M5rlV8xAnoILEGlqboyg\n2qREaPrlYHDImdF7kPAC4fkwKY+3paKscWyBg2He50MRFvGO1WZ5GlReAB+TfCNz\nZyxGM0eGF1lhDqC9jOrDNx+VfnvTGupOcKl0RXeaxj/7EQQX2WfiqxEEo8siMAdF\nby/2tOJRSUXPFZRMIi8XO7nUo8rL6+8G5e3bVRseIKDbuvMSKEiz7M3892Cd9ECX\nqQPwHFagTpC4lECcLTRmfnCAlhh+qkbuVVncc7W4/FoeN7rfjCpIFAQ77Gi5zjOk\nOzZcNo5VeSoD9ySpCurk5KZpx4oH9/pVNEWBLoRQFQKBgQD6kqergxUDZ6YB4DSc\n9nQtrf+Cr4tNcHNVb57uM6EtuPzu8IDOt/3/Fky9TRngtwjUvO5LgNhWRDt/UKfh\nEARVV8A3x5Shn9z2HsVW0m/OOdznjXB0kc20qhuITx+g9PUpi8QRwS/YiyZtiXsZ\nHZ2XVxeF9GS3AvPWWoOOeBBObQKBgQDX0CAB6KlINRpqHVZEB9Nan96KEcen6ZED\nrQZnPUwl3bUERdnuCrV9QPY0rUJlw3CiT6aorv1KWKgFoBi/inUdEgn0FPaiismd\n3I/RT+EaN03/eRubTiLim15hq0JzQCOMOXN1yi/4Mr5LUVJbNaldHSpgNgvQ61y9\n2ixuledI/wKBgGPqmOt+YKGz8fFriu9QIzGX4XwmLcEaZxMZaGGJuuq1ij5pLqO/\noIvYQ490sC34LpBOKiN3ZEy59pOlANxw+5lgXWigr/bm/UAzMvOVBDpSvnCi6N9I\nCKPS9Rmcm3seUqhXcD64LzEFA7TIDosMUSvo8ZtbwdFsXvkJrM3huHbdAoGAbcFp\nJc9fmFt5bZIx9zNLqAE6OlnEgn7kw0vRv9uKyI8yqlOj+83ycxsAm9WpuPtmYwXD\nKnKkWpUwDnxXWcJewUQVT88Bh7SxyNkNQ1QulRifUFgVVCyuzTRbEaz5hIeQDJaD\nQ9pp/v4/jSp0ifKGidZ1YKzb4YpxhhRZGHygPZ0CgYAJR20OerO+ZSM2rlqMERgm\ngwTKB9qvryuVjIdi7pgF51s0Td2/sWphjWap+0yGf0H2udfcLM+aUYiCYl/22tWz\nOa+braSl7wHBhDaG+NhdXvfc+vN9pz4CtD48FzIK9mPaQPcX94TfDxffkCVlL8NE\n7V/qeOtm+f4whn1F/B8ZQA==\n-----END PRIVATE KEY-----\n"
  }
];

// 2. IN-MEMORY GLOBAL STATE (Preserved across worker invocations on the same edge instance)
let cachedServiceAccounts = null;
let lastSaCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30-Minute Cache TTL for Supabase SA Vault
let globalRrCounter = 0; // Deterministic Round-Robin counter for chunk distribution
const tokenCache = new Map(); // Global OAuth Access Token Cache

/**
 * 3. SUPABASE SA VAULT POOL LOADER WITH AUTOMATIC HARDCODED FALLBACK
 * Fetches active Service Accounts from Supabase REST API (`drive_service_accounts`).
 * Uses a 30-minute in-memory cache to prevent database load spikes.
 */
async function getServiceAccountPool(env) {
  const now = Date.now();
  if (cachedServiceAccounts && (now - lastSaCacheTime < CACHE_TTL_MS)) {
    return cachedServiceAccounts;
  }

  const supabaseUrl = env?.SUPABASE_URL;
  const supabaseAnonKey = env?.SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const cleanUrl = supabaseUrl.replace(/\/+$/, '');
      const dbEndpoint = `${cleanUrl}/rest/v1/drive_service_accounts?is_active=eq.true&select=client_email,private_key`;

      const res = await fetch(dbEndpoint, {
        method: 'GET',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const mappedPool = rows
            .map(r => ({
              email: r.client_email || r.email,
              privateKey: r.private_key || r.privateKey
            }))
            .filter(sa => sa.email && sa.privateKey);

          if (mappedPool.length > 0) {
            cachedServiceAccounts = mappedPool;
            lastSaCacheTime = now;
            console.log(`[SA Vault Pool] Loaded ${mappedPool.length} active Service Accounts from Supabase.`);
            return cachedServiceAccounts;
          }
        }
      }
    } catch (err) {
      console.warn('[SA Vault Pool Warning] Supabase fetch failed, falling back to hardcoded SA mesh:', err.message);
    }
  }

  // Fallback to hardcoded Service Account pool if Supabase is unavailable
  cachedServiceAccounts = HARDCODED_SERVICE_ACCOUNTS;
  lastSaCacheTime = now;
  return HARDCODED_SERVICE_ACCOUNTS;
}

/**
 * 4. WEB CRYPTO RS256 GOOGLE OAUTH TOKEN GENERATOR WITH TOKEN CACHING
 * Caches generated access tokens globally in worker memory until (expires_in - 60s).
 */
async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(email);
  
  // Return cached token if valid for at least 60 seconds
  if (cached && cached.expiresAt > now + 60) {
    return cached.token;
  }

  try {
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const b64Url = (obj) => btoa(typeof obj === 'string' ? obj : JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const signatureInput = `${b64Url(header)}.${b64Url(payload)}`;
    const derString = atob(formattedKey.replace(/-----[^-]+-----|\s/g, ''));
    const der = new Uint8Array(derString.length);
    for (let i = 0; i < derString.length; i++) der[i] = derString.charCodeAt(i);

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      der.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signatureInput)
    );

    const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const jwt = `${signatureInput}.${signature}`;

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
      const ttlSec = data.expires_in || 3600;
      tokenCache.set(email, { token: data.access_token, expiresAt: now + ttlSec - 60 });
      return data.access_token;
    }
  } catch (err) {
    console.error(`[Token Error] Failed to generate token for ${email}:`, err.message);
  }
  return null;
}

/**
 * 5. WORKER HANDLER ENTRYPOINT
 */
export default {
  async fetch(request, env, ctx) {
    // Strict Global CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, POST, HEAD',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, Content-Type, X-Cache-Status, X-Sa-Active, X-Sa-Index',
      'X-Content-Type-Options': 'nosniff',
    };

    // Preflight OPTIONS handler returning 200 OK immediately
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const rawFidParam = url.searchParams.get('fid');
      const rawIdParam = url.searchParams.get('id');
      const isDownload = url.searchParams.has('download') || url.searchParams.has('dl');

      let fileId = rawIdParam;
      if (!fileId && rawFidParam) {
        try {
          let b64 = rawFidParam;
          while (b64.length % 4 !== 0) b64 += '=';
          fileId = atob(b64);
        } catch (e) {
          fileId = rawFidParam;
        }
      }

      if (fileId) {
        return await handleStream(request, fileId, isDownload, env, corsHeaders);
      }

      return new Response(JSON.stringify({ 
        status: 'online', 
        service: 'SMD PRIME Unified Single-Endpoint Stream Gateway v10.0',
        usage: '/?id=YOUR_GOOGLE_DRIVE_FILE_ID'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (fatalErr) {
      console.error('[Fatal Worker Error]:', fatalErr.message);
      return new Response(JSON.stringify({ 
        error: 'Internal Gateway Error', 
        message: fatalErr.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * 6. DETERMINISTIC ROUND-ROBIN & ZERO-BUFFER FAILOVER STREAMING PIPELINE
 */
async function handleStream(request, fileId, isDownload, env, corsHeaders) {
  const rangeHeader = request.headers.get('Range');
  const url = new URL(request.url);

  // Load active Service Account Vault Pool
  const saPool = await getServiceAccountPool(env);
  const poolSize = saPool.length;

  if (poolSize === 0) {
    return new Response(JSON.stringify({ error: 'Vault Pool Empty', message: 'No active Service Accounts available.' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Deterministic Round-Robin Start Index
  const startIndex = (globalRrCounter++) % poolSize;
  let lastErrorResponse = null;

  // Attempt stream fetch across SA pool with silent failover retries on 403, 429, or 500
  for (let attempt = 0; attempt < poolSize; attempt++) {
    const idx = (startIndex + attempt) % poolSize;
    const sa = saPool[idx];
    const token = await getAccessToken(sa.email, sa.privateKey);

    if (!token) continue;

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);

    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    } else if (!isDownload) {
      headers.set('Range', 'bytes=0-');
    }

    try {
      const driveRes = await fetch(driveUrl, { 
        method: request.method, 
        headers 
      });

      // Successful stream acquisition (HTTP 200 OK or HTTP 206 Partial Content)
      if (driveRes.ok || driveRes.status === 206) {
        const responseHeaders = new Headers(corsHeaders);

        ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'].forEach(h => {
          const val = driveRes.headers.get(h);
          if (val) responseHeaders.set(h, val);
        });

        const requestedMime = url.searchParams.get('mime') || url.searchParams.get('container');

        if (isDownload) {
          let rawTitle = url.searchParams.get('title') || 'Movie';
          let rawQuality = url.searchParams.get('quality') || '';
          let cleanName = `${rawTitle}${rawQuality ? '_' + rawQuality : ''}`.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
          cleanName = cleanName.replace(/^(SMD_PRIME_|SMD_PRIME|SMD_|Movie_|Movie)/i, '').replace(/^_+/, '');
          if (!cleanName) cleanName = 'Movie';
          const filename = `SMD_${cleanName}.mp4`;

          responseHeaders.set('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
          responseHeaders.set('Content-Type', 'application/octet-stream');
        } else {
          responseHeaders.set('Content-Disposition', 'inline');
          const rawContentType = driveRes.headers.get('content-type') || '';
          if (requestedMime) {
            responseHeaders.set('Content-Type', requestedMime.includes('/') ? requestedMime : `video/${requestedMime}`);
          } else if (!rawContentType || rawContentType.includes('matroska') || rawContentType.includes('mkv') || rawContentType.includes('octet-stream')) {
            responseHeaders.set('Content-Type', 'video/mp4');
          } else {
            responseHeaders.set('Content-Type', rawContentType);
          }
        }

        responseHeaders.set('Accept-Ranges', 'bytes');
        responseHeaders.set('Cache-Control', 'public, max-age=14400, s-maxage=86400, stale-while-revalidate=86400');
        responseHeaders.set('X-Sa-Active', sa.email);
        responseHeaders.set('X-Sa-Index', `${idx + 1}`);

        let status = driveRes.status;
        if (status === 206 && !responseHeaders.get('Content-Range')) {
          status = 200;
        }

        // Return instant zero-buffer stream to the browser
        return new Response(driveRes.body, {
          status,
          statusText: driveRes.statusText,
          headers: responseHeaders
        });
      }

      // Quota limit check (403, 429) or Server error (500, 502, 503): Trigger SILENT FAILOVER RETRY
      if ([403, 404, 429, 500, 502, 503].includes(driveRes.status)) {
        console.warn(`[Silent SA Failover] SA #${idx + 1} (${sa.email}) returned HTTP ${driveRes.status}. Retrying next SA...`);
        lastErrorResponse = driveRes;
        continue;
      }
    } catch (fetchErr) {
      console.warn(`[Drive Fetch Err] SA #${idx + 1} (${sa.email}):`, fetchErr.message);
    }
  }

  // Fallback response if all SAs in pool fail
  const errHeaders = new Headers(corsHeaders);
  errHeaders.set('Content-Type', 'application/json');
  
  if (lastErrorResponse) {
    const status = lastErrorResponse.status >= 400 ? lastErrorResponse.status : 403;
    return new Response(JSON.stringify({ 
      error: 'Upstream Stream Error', 
      status, 
      message: 'All Service Accounts in vault pool exceeded quota or permission limits.' 
    }), {
      status,
      headers: errHeaders
    });
  }

  return new Response(JSON.stringify({ 
    error: 'All Service Accounts Failed', 
    message: 'Unable to stream file from Google Drive.' 
  }), {
    status: 503,
    headers: errHeaders
  });
}
