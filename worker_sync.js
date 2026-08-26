/**
 * SMD PRIME - CLOUDFLARE MULTI-NODE EDGE STREAMING WORKER
 * Hybrid Service Account Architecture with Hardcoded Local Fallback, Safe Supabase DB Fetch,
 * Zero-Buffer Range Pipelining, and Global Cross-Origin Resource Sharing (CORS) Enforcement.
 */

const STREAM_SECRET = 'smd_prime_secure_jwt_secret_key_2026';

/**
 * 1. HARDCODED FALLBACK SERVICE ACCOUNTS
 * Guaranteed local fallback if Supabase DB is down, timing out, or empty.
 */
const FALLBACK_SERVICE_ACCOUNTS = [
  {
    email: "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n"
  },
  {
    email: "tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpPGCGJjve2SM7\nB0Dv8fcUNV2seJ/Y94ap2oD1j4HGbuPhHEUmQUCq5Wqr4HN9zyVKY09LGQAw/MY7\nDBrT7P7k8B6e+TUtOMqhBBAgm/E6WeHZuUR4z84P2B3iOymLfWoD8pv/ekwC+vsF\n86bnvNXg+N7M8gMojNd3gB0XoU87wkUlQf1igK2AV/eAs2+tjZOS5KvZC/XemSBc\nvV9tNKOoZ03XAXJeX0hBeTZXSoLU6yXTXBXQerV0htydx9gjKnioBn7ayRNK1i3L\nWdIedraSEiIRM6WYoJkkZ68SLag20ci+gl3Y+9D3QxB99/eGZu6Q4RYr7FlHAK4U\ndAnzciHFAgMBAAECggEATcIQF5M5rwrVxSlwDM+AVyiuAbDqwSX6GdDrr+hgGGyb\nB7OVkh4pOFxwxsg6SHQFDkjTBg5WqCt8aWUGbplWBJrPdvvKEx0k/RaA0nrUO5tQ\nylj1vQy+AUmrcWb9j7nwHCA8zQXEJxpqfDGXXqLFIrk2pbQM/3S3C5ExzMmxPiMl\ncu6c1Dkeggdx6LNNU+lm/3Ep87pixUqlTadR1CyzSJFZK8JFB5s3Kod69OT234MM\ng/V8r54NOvCG2985s0BDIKMZ4A8qyLOMcTnzxtD5IQaMy7mB1nzT9mNSw2DLUhRD\nFvHet/zJbv6jab+/cbKH4ZNloVN/zBuvfDSUf6pPgQKBgQDY17Nit6qLEk4ewgkC\n0APfaqYeimjEE+PoEdsEcnBPLEpCZg7t+ctDrGaHIfLc5Skkk38tayd083tc04mK\nI3jvoRD2jgGY+rGQyeLMgJ4fxyQy/FbQ/ioYwit8tm45NWqM/5uSJ3+EwyCUnhbA\nkojprSiCNqfuAcrrpttWpwjSxwKBgQDHy+Pk6cQFFu542HddTBHFw+yVsvzHsdZR\n7keQEVwSMhOCFH0e1Xou+TMDB+kYbpXUktJK1bodMnD1e5GkFPb9dRY5pnqqzqkx\nxutq0CKWXhyb81jFO4dHoj3AT+IhlSFoifIJoxrkLhS5jw3Au/GpTzinGPbf+8ts\nzQ1ErHSbEwKBgEbEPlrdLd8tHimTkXVFhb4IBCa7bO1wwFQgX6XX4yczgRiiTgUE\nHH39aYh4X9YPQ5oYOM0Nx1a3j27/6kcWxIUPv4V3WrYeOozSFh4/a1tblki9aWfT\nStHBrIeK0fYBpMBXOuI72bXuKFfYL/yw1dXNGQdF5xAZrauyTKq+4HZJAoGBAIlH\nWLDixiLRHM2/vlRGfjeqZRZ+wxza3m2xEU61/tMpwSmxtj7HY4p/A0Pj3Y9B/ITw\n1LlCnPyOufqSCwH4vbRtDPZToxlVof9ntD3SANHcnD+zNp1eR5c6rL9EpBV7CFdx\n4PIqNcHuv6K33jU9bdBtdHmrt4Uy1xVM1v8Gl6AtAoGAQF83Ewp39E98mJCKMNeJ\n1LjPx1c8uFmPjw3i0XWUGKYSBhSckNBuoe35RGujQQy5ScaXGUjgN510Og/0+34Y\nn8Pk3tL44WEcs9ULQXFoWGBCEslbZoO1RjcCPckcLM+9SlrBPj7DTfhQFLlSQTjy\nbMmqArLWoY4bzJxd8zMc1k8=\n-----END PRIVATE KEY-----\n"
  }
];

// Simple 10-minute in-memory cache for fetched SAs
let saMemoryCache = null;
let saMemoryCacheTime = 0;
const SA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * 2. SAFE SUPABASE SA FETCH WITH FOOLPROOF FALLBACK
 */
async function getServiceAccounts(env) {
  const now = Date.now();
  if (saMemoryCache && saMemoryCache.length > 0 && (now - saMemoryCacheTime < SA_CACHE_TTL)) {
    return saMemoryCache;
  }

  try {
    const supabaseUrl = env?.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
    const supabaseKey = env?.SUPABASE_ANON_KEY || env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s strict timeout

    const res = await fetch(`${supabaseUrl}/rest/v1/drive_service_accounts?is_active=eq.true&select=*`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const list = [];
        const seen = new Set();

        rows.forEach(r => {
          const email = r.email || r.client_email;
          const key = r.private_key || r.privateKey;
          if (email && key && !seen.has(email)) {
            seen.add(email);
            list.push({ email: email.trim(), privateKey: key.trim() });
          }
        });

        if (list.length > 0) {
          saMemoryCache = list;
          saMemoryCacheTime = now;
          console.log(`[SA Fetch Success] Cached ${list.length} accounts from Supabase.`);
          return saMemoryCache;
        }
      }
    }
  } catch (err) {
    console.warn('[SA Fetch Warning] Supabase DB fetch failed or timed out. Falling back to local SAs:', err.message);
  }

  // Fallback to local hardcoded accounts
  saMemoryCache = FALLBACK_SERVICE_ACCOUNTS;
  saMemoryCacheTime = now;
  return saMemoryCache;
}

// Token cache to prevent redundant OAuth token calls
const tokenCache = new Map();

async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(email);
  if (cached && cached.expiresAt > now + 300) {
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
      tokenCache.set(email, { token: data.access_token, expiresAt: now + 3500 });
      return data.access_token;
    }
  } catch (err) {
    console.error(`[Token Error] Failed to generate token for ${email}:`, err.message);
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    // 4. GLOBAL CORS HEADERS ENFORCEMENT
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS, POST, HEAD',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, X-Requested-With',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, Content-Type, X-Cache-Status, X-Sa-Active',
      'X-Content-Type-Options': 'nosniff',
    };

    // Preflight OPTIONS handling returning 200 OK immediately
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
        service: 'SMD PRIME Multi-Node Hybrid Stream Engine v8.0',
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
 * 3. ZERO-BUFFERING STREAM & ROTATION PIPELINE
 */
async function handleStream(request, fileId, isDownload, env, corsHeaders) {
  const serviceAccounts = await getServiceAccounts(env);
  const rangeHeader = request.headers.get('Range');
  const url = new URL(request.url);

  // Pick random starting index to distribute load across accounts
  const startIdx = Math.floor(Math.random() * serviceAccounts.length);
  let lastError = null;

  for (let attempt = 0; attempt < serviceAccounts.length; attempt++) {
    const idx = (startIdx + attempt) % serviceAccounts.length;
    const sa = serviceAccounts[idx];
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

      // Check quota error & rotate
      if (driveRes.status === 403 || driveRes.status === 404 || driveRes.status === 429) {
        console.warn(`[SA Quota Rotate] SA #${idx + 1} (${sa.email}) returned HTTP ${driveRes.status}. Rotating...`);
        lastError = driveRes;
        continue;
      }
    } catch (fetchErr) {
      console.warn(`[Drive Fetch Err] SA #${idx + 1}:`, fetchErr.message);
    }
  }

  // If all SAs failed, return CORS-compliant error
  const errHeaders = new Headers(corsHeaders);
  errHeaders.set('Content-Type', 'application/json');
  
  if (lastError) {
    const status = lastError.status >= 400 ? lastError.status : 403;
    return new Response(JSON.stringify({ 
      error: 'Upstream Stream Error', 
      status, 
      message: 'Service Account quota exceeded or permission denied on Google Drive.' 
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
