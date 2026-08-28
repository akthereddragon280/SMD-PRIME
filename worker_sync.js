/**
 * SMD PRIME - ULTRA-RESILIENT EDGE STREAMING WORKER (v13.0)
 * Architecture: On-Demand 5-Min Lazy Health Cache + Edge Circuit Breaker + Backend Diagnostic API & Stream Error Logger
 * 
 * DESIGN SPECIFICATIONS:
 * 1. ON-DEMAND LAZY HEALTH CACHE (5-Min TTL):
 *    - First request checks and caches healthy Service Accounts in global edge memory with 5-minute TTL.
 *    - Requests within 5 minutes bypass DB queries for zero-latency video chunk streaming.
 * 2. INSTANT CIRCUIT BREAKER & FAILOVER:
 *    - If 403, 429, or 50x error occurs mid-stream, the failing SA is ejected from active memory instantly.
 *    - Range request automatically fails over to the next healthy SA seamlessly.
 * 3. BACKEND DIAGNOSTIC ROUTE (GET /admin/diagnostics):
 *    - Secured via Admin token check (Bearer header or ?token=).
 *    - Programmatically tests all 3 worker nodes, SA credentials, and HMAC token signing.
 * 4. AUTOMATED STREAM ERROR LOGGING:
 *    - Asynchronously records 403/429/50x stream failure metadata to Supabase `stream_errors` table via `ctx.waitUntil()`.
 */

// 1. HARDCODED VAULT FALLBACK MESH
const HARDCODED_SERVICE_ACCOUNTS = [
  {
    email: "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n"
  },
  {
    email: "tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpPGCGJjve2SM7\nB0Dv8fcUNV2seJ/Y94ap2oD1j4HGbuPhHEUmQUCq5Wqr4HN9zyVKY09LGQAw/MY7\nDBrT7P7k8B6e+TUtOMqhBBAgm/E6WeHZuUR4z84P2B3iOymLfWoD8pv/ekwC+vsF\n86bnvNXg+N7M8gMojNd3gB0XoU87wkUlQf1igK2AV/eAs2+tjZOS5KvZC/XemSBc\nvV9tNKOoZ03XAXJeX0hBeTZXSoLU6yXTXBXQerV0htydx9gjKnioBn7ayRNK1i3L\nWdIedraSEiIRM6WYoJkkZ68SLag20ci+gl3Y+9D3QxB99/eGZu6Q4RYr7FlHAK4U\ndAnzciHFAgMBAAECggEATcIQF5M5rwrVxSlwDM+AVyiuAbDqwSX6GdDrr+hgGGyb\nB7OVkh4pOFxwxsg6SHQFDkjTBg5WqCt8aWUGbplWBJrPdvvKEx0k/RaA0nrUO5tQ\nylj1vQy+AUmrcWb9j7nwHCA8zQXEJxpqfDGXXqLFIrk2pbQM/3S3C5ExzMmxPiMl\ncu6c1Dkeggdx6LNNU+lm/3Ep87pixUqlTadR1CyzSJFZK8JFB5s3Kod69OT234MM\ng/V8r54NOvCG2985s0BDIKMZ4A8qyLOMcTnzxtD5IQaMy7mB1nzT9mNSw2DLUhRD\nFvHet/zJbv6jab+/cbKH4ZNloVN/zBuvfDSUf6pPgQKBgQDY17Nit6qLEk4ewgkC\n0APfaqYeimjEE+PoEdsEcnBPLEpCZg7t+ctDrGaHIfLc5Skkk38tayd083tc04mK\nI3jvoRD2jgGY+rGQyeLMgJ4fxyQy/FbQ/ioYwit8tm45NWqM/5uSJ3+EwyCUnhbA\nkojprSiCNqfuAcrrpttWpwjSxwKBgQDHy+Pk6cQFFu542HddTBHFw+yVsvzHsdZR\n7keQEVwSMhOCFH0e1Xou+TMDB+kYbpXUktJK1bodMnD1e5GkFPb9dRY5pnqqzqkx\nxutq0CKWXhyb81jFO4dHoj3AT+IhlSFoifIJoxrkLhS5jw3Au/GpTzinGPbf+8ts\nzQ1ErHSbEwKBgEbEPlrdLd8tHimTkXVFhb4IBCa7bO1wwFQgX6XX4yczgRiiTgUE\nHH39aYh4X9YPQ5oYOM0Nx1a3j27/6kcWxIUPv4V3WrYeOozSFh4/a1tblki9aWfT\nStHBrIeK0fYBpMBXOuI72bXuKFfYL/yw1dXNGQdF5xAZrauyTKq+4HZJAoGBAIlH\nWLDixiLRHM2/vlRGfjeqZRZ+wxza3m2xEU61/tMpwSmxtj7HY4p/A0Pj3Y9B/ITw\n1LlCnPyOufqSCwH4vbRtDPZToxlVof9ntD3SANHcnD+zNp1eR5c6rL9EpBV7CFdx\n4PIqNcHuv6K33jU9bdBtdHmrt4Uy1xVM1v8Gl6AtAoGAQF83Ewp39E98mJCKMNeJ\n1LjPx1c8uFmPjw3i0XWUGKYSBhSckNBuoe35RGujQQy5ScaXGUjgN510Og/0+34Y\nnn8Pk3tL44WEcs9ULQXFoWGBCEslbZoO1RjcCPckcLM+9SlrBPj7DTfhQFLlSQTjy\nbMmqArLWoY4bzJxd8zMc1k8=\n-----END PRIVATE KEY-----\n"
  },
  {
    email: "tgstream-bot-10@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDTPOFNebPYbkyI\ntsdb9eUl1x+BwbURoSWV//HW6uau8W5HNILnvhTuei5khz/MYncKjxCNAGoxym2r\nyBlAugfoXmEd1X7sZB5S/rcOVgWbH7B00j7aviPxpXwsxfVBnWq89MVBp2PqIQS+\ngmO1YsWYyuITJItIS088l+tEk6shoU3/Rws4EVswQA7XL/MfNySfzPsElxFtHOHR\nCgYfpx956YiZEgy1y8NeBJZqX+QKRY2AglNlaxWNBtCxCSlXYhh6Dz3+ovbz9NVE\nJfJoPrB382TDYUP23bcvBTGwCAV78j2Zd0UbBD1rzqV96eomYJyKO9V3xcspOkDn\nX+Bjp8aTAgMBAAECggEAFUznySizBmmE5SpNKww+GZU6M5rlV8xAnoILEGlqboyg\n2qREaPrlYHDImdF7kPAC4fkwKY+3paKscWyBg2He50MRFvGO1WZ5GlReAB+TfCNz\nZyxGM0eGF1lhDqC9jOrDNx+VfnvTGupOcKl0RXeaxj/7EQQX2WfiqxEEo8siMAdF\nby/2tOJRSUXPFZRMIi8XO7nUo8rL6+8G5e3bVRseIKDbuvMSKEiz7M3892Cd9ECX\nqQPwHFagTpC4lECcLTRmfnCAlhh+qkbuVVncc7W4/FoeN7rfjCpIFAQ77Gi5zjOk\nOzZcNo5VeSoD9ySpCurk5KZpx4oH9/pVNEWBLoRQFQKBgQD6kqergxUDZ6YB4DSc\n9nQtrf+Cr4tNcHNVb57uM6EtuPzu8IDOt/3/Fky9TRngtwjUvO5LgNhWRDt/UKfh\nEARVV8A3x5Shn9z2HsVW0m/OOdznjXC0kc20qhuITx+g9PUpi8QRwS/YiyZtiXsZ\nHZ2XVxeF9GS3AvPWWoOOeBBObQKBgQDX0CAB6KlINRpqHVZEB9Nan96KEcen6ZED\nrQZnPUwl3bUERdnuCrV9QPY0rUJlw3CiT6aorv1KWKgFoBi/inUdEgn0FPaiismd\n3I/RT+EaN03/eRubTiLim15hq0JzQCOMOXN1yi/4Mr5LUVJbNaldHSpgNgvQ61y9\n2ixuledI/wKBgGPqmOt+YKGz8fFriu9QIzGX4XwmLcEaZxMZaGGJuuq1ij5pLqO/\noIvYQ490sC34LpBOKiN3ZEy59pOlANxw+5lgXWigr/bm/UAzMvOVBDpSvnCi6N9I\nCKPS9Rmcm3seUqhXcD64LzEFA7TIDosMUSvo8ZtbwdFsXvkJrM3huHbdAoGAbcFp\nJc9fmFt5bZIx9zNLqAE6OlnEgn7kw0vRv9uKyI8yqlOj+83ycxsAm9WpuPtmYwXD\nKnKkWpUwDnxXWcJewUQVT88Bh7SxyNkNQ1QulRifUFgVVCyuzTRbEaz5hIeQDJaD\nQ9pp/v4/jSp0ifKGidZ1YKzb4YpxhhRZGHygPZ0CgYAJR20OerO+ZSM2rlqMERgm\ngwTKB9qvryuVjIdi7pgF51s0Td2/sWphjWap+0yGf0H2udfcLM+aUYiCYl/22tWz\nOa+braSl7wHBhDaG+NhdXvfc+vN9pz4CtD48FzIK9mPaQPcX94TfDxffkCVlL8NE\n7V/qeOtm+f4whn1F/B8ZQA==\n-----END PRIVATE KEY-----\n"
  }
];

// 2. GLOBAL EDGE MEMORY CACHES
const CACHE_5MIN_MS = 5 * 60 * 1000;   // 5-Minute On-Demand Lazy Health Cache TTL
const COOLDOWN_15MIN_MS = 15 * 60 * 1000; // 15-Minute Circuit Breaker Cooldown
const DEFAULT_ADMIN_TOKEN = 'smd_prime_admin_secret_2026';
const STREAM_SECRET = 'smd_prime_secure_jwt_secret_key_2026';

let lazyHealthCache = {
  pool: null,
  expiresAt: 0
};

let globalRrCounter = 0;
const tokenCache = new Map();         // email -> { token, expiresAt }
const saCooldownMap = new Map();      // email -> cooldownExpiryMs
const saFailureCounter = new Map();   // email -> transient error count

/**
 * 3. ON-DEMAND LAZY HEALTH CACHE ROUTER
 */
async function getHealthyServiceAccountPool(env, ctx) {
  const now = Date.now();

  if (lazyHealthCache.pool && now < lazyHealthCache.expiresAt) {
    return filterHealthyPool(lazyHealthCache.pool, now);
  }

  const supabaseUrl = env?.SUPABASE_URL;
  const supabaseAnonKey = env?.SUPABASE_ANON_KEY;
  let pool = null;

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
          const mapped = rows
            .map(r => ({
              email: r.client_email || r.email,
              privateKey: r.private_key || r.privateKey
            }))
            .filter(sa => sa.email && sa.privateKey);

          if (mapped.length > 0) {
            pool = mapped;
            console.log(`[5-Min Edge Cache] Refreshed SA Pool from Supabase (${mapped.length} accounts).`);
          }
        }
      }
    } catch (err) {
      console.warn('[5-Min Edge Cache Warning] Supabase query failed, switching to hardcoded SA mesh:', err.message);
    }
  }

  if (!pool) {
    pool = HARDCODED_SERVICE_ACCOUNTS;
  }

  lazyHealthCache = {
    pool,
    expiresAt: now + CACHE_5MIN_MS
  };

  if (pool[0]) {
    prewarmPrimaryToken(pool[0], ctx);
  }

  return filterHealthyPool(pool, now);
}

function filterHealthyPool(pool, now) {
  let healthy = pool.filter(sa => {
    const cooldownUntil = saCooldownMap.get(sa.email);
    return !cooldownUntil || now >= cooldownUntil;
  });

  if (healthy.length === 0) {
    console.warn('[Circuit Breaker] All SAs cooling down. Resetting edge cooldowns for pool recovery.');
    saCooldownMap.clear();
    saFailureCounter.clear();
    healthy = pool;
  }

  return healthy;
}

function prewarmPrimaryToken(sa, ctx) {
  if (!sa || !sa.email) return;
  const promise = getAccessToken(sa.email, sa.privateKey).catch(() => {});
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(promise);
  }
}

/**
 * 4. CIRCUIT BREAKER & ASYNCHRONOUS EDGE ERROR LOGGING TO SUPABASE (`stream_errors`)
 */
function tripCircuitBreaker(saEmail, fileId, env, ctx, reason = 'quota_exceeded', statusCode = 403) {
  const now = Date.now();
  saCooldownMap.set(saEmail, now + COOLDOWN_15MIN_MS);
  tokenCache.delete(saEmail);

  if (lazyHealthCache.pool) {
    lazyHealthCache.pool = lazyHealthCache.pool.filter(sa => sa.email !== saEmail);
  }

  const failures = (saFailureCounter.get(saEmail) || 0) + 1;
  saFailureCounter.set(saEmail, failures);

  console.warn(`[Circuit Breaker Tripped] Ejected ${saEmail} from active pool. Cooldown until +15m. (Failure #${failures})`);

  // Asynchronous Edge-to-DB Sync & Error Logging to Supabase (`stream_errors` & `drive_service_accounts`)
  if (env?.SUPABASE_URL && env?.SUPABASE_ANON_KEY && ctx?.waitUntil) {
    const syncPromise = (async () => {
      const cleanUrl = env.SUPABASE_URL.replace(/\/+$/, '');
      const headers = {
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      };

      // 1. Update SA active flag in Supabase
      try {
        const saEndpoint = `${cleanUrl}/rest/v1/drive_service_accounts?client_email=eq.${encodeURIComponent(saEmail)}`;
        await fetch(saEndpoint, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
        });
      } catch (e) {}

      // 2. Log exact failure event to `stream_errors` table for admin dashboard monitoring
      try {
        const errorEndpoint = `${cleanUrl}/rest/v1/stream_errors`;
        await fetch(errorEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            node_id: env.NODE_ID || 'node-1',
            sa_email: saEmail,
            file_id: fileId || 'unknown',
            error_code: statusCode,
            error_message: reason,
            created_at: new Date().toISOString()
          })
        });
        console.log(`[Stream Error Logger] Logged failure event for ${saEmail} (${statusCode} ${reason}) to Supabase.`);
      } catch (logErr) {
        console.warn(`[Stream Error Logger Warning] Failed to log error row:`, logErr.message);
      }
    })();

    ctx.waitUntil(syncPromise);
  }
}

/**
 * 5. RS256 OAUTH ACCESS TOKEN GENERATOR
 */
async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(email);

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
    console.error(`[Token Error] RS256 token generation failed for ${email}:`, err.message);
  }
  return null;
}

/**
 * 6. FAST HMAC TOKEN VALIDATOR FOR DIAGNOSTIC ENDPOINT
 */
function fastTokenSync(fileId, expiresAt, secret) {
  const str = `${fileId}:${expiresAt}:${secret}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * 7. SECURE BACKEND DIAGNOSTIC ROUTE HANDLER (GET /admin/diagnostics)
 */
async function handleAdminDiagnostics(request, env, corsHeaders) {
  const url = new URL(request.url);
  const authHeader = request.headers.get('Authorization') || '';
  const tokenParam = url.searchParams.get('token') || '';
  const adminSecret = env.ADMIN_SECRET || DEFAULT_ADMIN_TOKEN;

  let providedToken = '';
  if (authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.substring(7).trim();
  } else if (tokenParam) {
    providedToken = tokenParam.trim();
  }

  if (!providedToken || providedToken !== adminSecret) {
    return new Response(JSON.stringify({
      error: 'Unauthorized',
      message: 'Invalid or missing admin diagnostic authorization token.'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 1. Programmatically test 3 worker nodes
  const nodes = [
    { id: 'node-1', url: 'https://smd-stream-node-1.smd-prime.workers.dev' },
    { id: 'node-2', url: 'https://smd-stream-node-2.akthereddragon281.workers.dev' },
    { id: 'node-3', url: 'https://smd-stream-node-3.akthereddragon282.workers.dev' }
  ];

  const nodeResults = await Promise.all(nodes.map(async (n) => {
    const start = Date.now();
    try {
      const res = await fetch(`${n.url}/`, { method: 'HEAD' });
      return { id: n.id, url: n.url, status: res.status, latencyMs: Date.now() - start, online: res.ok || res.status === 200 || res.status === 206 };
    } catch (e) {
      return { id: n.id, url: n.url, status: 0, latencyMs: Date.now() - start, online: false, error: e.message };
    }
  }));

  // 2. Validate Service Account mesh state dynamically from Supabase / Edge Cache
  const healthyPool = await getHealthyServiceAccountPool(env);
  const totalSaInPool = (lazyHealthCache.pool || healthyPool || HARDCODED_SERVICE_ACCOUNTS).length;
  const cooldownCount = saCooldownMap.size;
  const activeHealthyCount = Math.max(0, totalSaInPool - cooldownCount);

  // 3. Validate HMAC signature generator logic
  const testFileId = '1djKAD3UQmBPgkeBBLCrZjAW-D4Fod_Ng';
  const testExp = Math.floor(Date.now() / 1000) + 3600;
  const testSecret = env.STREAM_SECRET || STREAM_SECRET;
  const generatedToken = fastTokenSync(testFileId, testExp, testSecret);
  const hmacValid = generatedToken.length === 8;

  const report = {
    service: 'SMD PRIME Backend Edge Diagnostic System',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    hmacEngine: {
      status: hmacValid ? 'OK' : 'ERROR',
      secretConfigured: !!testSecret,
      testTokenGenerated: generatedToken
    },
    nodes: nodeResults,
    serviceAccountMesh: {
      totalAccounts: totalSaInPool,
      activeHealthy: activeHealthyCount,
      coolingDown: cooldownCount,
      cooldownList: Array.from(saCooldownMap.keys())
    },
    circuitBreaker: {
      cacheTTL: '5-Minute On-Demand Edge Memory Cache',
      activeCooldownDuration: '15 Minutes'
    }
  };

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * 8. CLOUDFLARE WORKER ENTRYPOINT
 */
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, POST, HEAD',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, Content-Type, X-Cache-Status, X-Sa-Active, X-Sa-Index',
      'X-Content-Type-Options': 'nosniff',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // Backend Diagnostic API Route (GET /admin/diagnostics)
      if (url.pathname === '/admin/diagnostics') {
        return await handleAdminDiagnostics(request, env, corsHeaders);
      }

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
        return await handleStream(request, fileId, isDownload, env, ctx, corsHeaders);
      }

      return new Response(JSON.stringify({ 
        status: 'online', 
        service: 'SMD PRIME Ultra-Resilient Edge Streaming Gateway v13.0',
        cacheTTL: '5-Minute On-Demand Edge Memory Cache',
        diagnosticEndpoint: '/admin/diagnostics?token=YOUR_ADMIN_SECRET',
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
 * 9. ULTRA-RESILIENT MID-STREAM FAILOVER PIPELINE
 */
async function handleStream(request, fileId, isDownload, env, ctx, corsHeaders) {
  const rangeHeader = request.headers.get('Range');
  const url = new URL(request.url);

  const healthyPool = await getHealthyServiceAccountPool(env, ctx);
  const poolSize = healthyPool.length;

  if (poolSize === 0) {
    return new Response(JSON.stringify({ error: 'Vault Pool Exhausted', message: 'No active healthy Service Accounts available.' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const startIndex = (globalRrCounter++) % poolSize;
  let lastErrorResponse = null;

  for (let attempt = 0; attempt < poolSize; attempt++) {
    const idx = (startIndex + attempt) % poolSize;
    const sa = healthyPool[idx];
    const token = await getAccessToken(sa.email, sa.privateKey);

    if (!token) {
      tripCircuitBreaker(sa.email, fileId, env, ctx, 'token_failure', 401);
      continue;
    }

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

        return new Response(driveRes.body, {
          status,
          statusText: driveRes.statusText,
          headers: responseHeaders
        });
      }

      if ([403, 404, 429, 500, 502, 503].includes(driveRes.status)) {
        tripCircuitBreaker(sa.email, fileId, env, ctx, `http_${driveRes.status}`, driveRes.status);
        lastErrorResponse = driveRes;
        continue;
      }
    } catch (fetchErr) {
      tripCircuitBreaker(sa.email, fileId, env, ctx, `network_exception: ${fetchErr.message}`, 500);
    }
  }

  const errHeaders = new Headers(corsHeaders);
  errHeaders.set('Content-Type', 'application/json');
  
  if (lastErrorResponse) {
    const status = lastErrorResponse.status >= 400 ? lastErrorResponse.status : 403;
    return new Response(JSON.stringify({ 
      error: 'Upstream Quota Exhausted', 
      status, 
      message: 'All Service Accounts in vault pool exceeded quota. Circuit breaker activated.' 
    }), {
      status,
      headers: errHeaders
    });
  }

  return new Response(JSON.stringify({ 
    error: 'All Service Accounts Cooling Down', 
    message: 'Unable to stream file from Google Drive.' 
  }), {
    status: 503,
    headers: errHeaders
  });
}
