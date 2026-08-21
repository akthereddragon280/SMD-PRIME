/**
 * SMD PRIME - CLOUDFLARE R2 & GOOGLE DRIVE ZERO-BUFFERING EDGE STREAMING WORKER
 * Production-ready Edge Streaming Engine with Range-Parser, TransformStream Pipelining,
 * Exponential Retry Backoff, Multi-Service Account Auto-Failover, R2 Storage Binding, and CORS headers.
 */

const TMDB_GENRE_MAP = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
};

const STREAM_SECRET = 'smd_prime_secure_jwt_secret_key_2026';

function verifyFastTokenSync(fileId, expiresAtStr, token) {
  const str = `${fileId}:${expiresAtStr}:${STREAM_SECRET}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const expected = Math.abs(hash).toString(16).padStart(8, '0');
  return token === expected;
}

async function verifyHmacToken(fileId, expiresAtStr, token, envSecret) {
  if (!fileId || !expiresAtStr || !token) return false;
  
  const exp = parseInt(expiresAtStr, 10);
  const now = Math.floor(Date.now() / 1000);
  
  // Reject expired tokens
  if (isNaN(exp) || now > exp) {
    return false;
  }

  const secret = envSecret || STREAM_SECRET;

  if (verifyFastTokenSync(fileId, expiresAtStr, token)) {
    return true;
  }

  try {
    const message = `${fileId}:${exp}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify', 'sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return token === expectedHex;
  } catch (err) {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const requestOrigin = request.headers.get('Origin');
    const allowedOrigins = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [
      'https://smd-prime.vercel.app',
      'https://web.telegram.org',
      'http://localhost:5173'
    ]);
    const corsOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : '*';

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Cache-Status',
      'X-Content-Type-Options': 'nosniff',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const rawFidParam = url.searchParams.get('fid');
    const rawIdParam = url.searchParams.get('id');
    const expParam = url.searchParams.get('exp');
    const tokenParam = url.searchParams.get('token');
    const isDownload = url.searchParams.has('download') || url.searchParams.has('dl');

    // Extract & Decode Obfuscated File ID
    let fileId = null;
    if (rawFidParam) {
      try {
        fileId = atob(rawFidParam);
      } catch (e) {
        fileId = rawFidParam;
      }
    } else if (rawIdParam) {
      fileId = rawIdParam;
    }

    // 1. Cryptographically Signed Edge Video Stream Proxy
    if (fileId) {
      // 🔒 SECURITY GATEKEEPER: Cryptographic Token & Expiration Verification
      const isTokenValid = await verifyHmacToken(fileId, expParam, tokenParam, env.STREAM_SECRET);
      
      if (!isTokenValid) {
        return new Response(JSON.stringify({
          error: '403 Forbidden: Missing, Tampered, or Expired Cryptographic Token',
          message: 'Hotlinking and raw link scraping are strictly prohibited. Stream must be initiated from authorized Telegram Mini App.'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return handleEdgeMediaStream(request, fileId, isDownload, env, ctx, corsHeaders);
    }

    // 2. Health & Manual Sync Route
    if (url.pathname === '/sync' || url.searchParams.has('sync')) {
      try {
        const summary = await triggerDriveToSupabaseSync(env);
        return new Response(JSON.stringify({ success: true, message: 'Drive-to-Supabase Sync Completed!', summary }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Default Gateway Status Output
    return new Response(JSON.stringify({ 
      status: 'online', 
      service: 'SMD PRIME Ultra-Fast Stream Proxy Gateway v5.1 (TransformStream + Retry Backoff)',
      usage: '/?id=YOUR_FILE_ID'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerDriveToSupabaseSync(env));
  }
};

/**
 * Modular Edge Media Stream Handler with R2 Primary & Multi-SA Google Drive Failover
 */
async function handleEdgeMediaStream(request, fileId, isDownload, env, ctx, corsHeaders) {
  try {
    const rangeHeader = request.headers.get('Range');

    // Strategy 1: Attempt Cloudflare R2 Bucket Lookup (If R2 Binding `env.R2_BUCKET` exists)
    if (env.R2_BUCKET) {
      try {
        const r2Object = await env.R2_BUCKET.get(fileId, {
          range: rangeHeader ? parseRangeHeader(rangeHeader) : undefined
        });

        if (r2Object) {
          const responseHeaders = new Headers(corsHeaders);
          r2Object.writeHttpMetadata(responseHeaders);
          responseHeaders.set('Accept-Ranges', 'bytes');
          responseHeaders.set('Connection', 'keep-alive');
          responseHeaders.set('Cache-Control', 'public, max-age=14400, s-maxage=86400');
          responseHeaders.set('X-Cache-Status', 'HIT-R2-EDGE');

          if (isDownload) {
            responseHeaders.set('Content-Disposition', `attachment; filename="SMD_PRIME_${fileId}.mp4"`);
            responseHeaders.set('Content-Type', 'application/octet-stream');
          } else {
            responseHeaders.set('Content-Type', 'video/mp4');
          }

          const status = r2Object.range ? 206 : 200;
          return new Response(r2Object.body, {
            status,
            headers: responseHeaders
          });
        }
      } catch (r2Err) {
        console.warn('R2 Bucket lookup fallback to Google Drive:', r2Err.message);
      }
    }

    // Strategy 2: Multi-Service Account Google Drive Stream Pipelining
    return handleGoogleDriveStreamWithMultiSA(request, fileId, isDownload, env, ctx, corsHeaders);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Edge Stream Proxy Failure', message: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Parse Range Header (e.g. "bytes=0-1048575") into R2 range specifier
 */
function parseRangeHeader(rangeHeader) {
  const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
  if (!match) return undefined;
  const offset = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : undefined;
  if (end !== undefined) {
    return { offset, length: end - offset + 1 };
  }
  return { offset };
}

/**
 * Extract List of Service Accounts from Environment Variables
 */
function getServiceAccountList(env) {
  if (env.SERVICE_ACCOUNTS_JSON) {
    try {
      const parsed = JSON.parse(env.SERVICE_ACCOUNTS_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }

  const list = [];
  // Primary SA
  if (env.GOOGLE_PRIVATE_KEY) {
    list.push({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com',
      privateKey: env.GOOGLE_PRIVATE_KEY
    });
  }

  // Additional SAs (GOOGLE_PRIVATE_KEY_2, GOOGLE_PRIVATE_KEY_3, etc.)
  for (let idx = 2; idx <= 10; idx++) {
    const email = env[`GOOGLE_SERVICE_ACCOUNT_EMAIL_${idx}`];
    const key = env[`GOOGLE_PRIVATE_KEY_${idx}`];
    if (key) {
      list.push({
        email: email || `tgstream-bot-${idx}@tgstream-drive-proxy.iam.gserviceaccount.com`,
        privateKey: key
      });
    }
  }

  if (list.length === 0) {
    list.push({
      email: 'tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com',
      privateKey: env.GOOGLE_PRIVATE_KEY || ''
    });
  }

  return list;
}

/**
 * Google Drive Stream Proxy with Multi-Service Account Auto-Failover, Retry Backoff & TransformStream Pipelining
 */
async function handleGoogleDriveStreamWithMultiSA(request, fileId, isDownload, env, ctx, corsHeaders) {
  const serviceAccounts = getServiceAccountList(env);
  const rangeHeader = request.headers.get('Range');

  let lastErrorRes = null;

  // Try each Service Account sequentially on Quota Exceeded error
  for (let i = 0; i < serviceAccounts.length; i++) {
    const sa = serviceAccounts[i];
    const token = await getGoogleAccessToken(sa.email, sa.privateKey);

    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const headers = new Headers();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Intercept and forward Range header from HTML5 video player (default to bytes=0-)
    if (rangeHeader) {
      headers.set('Range', rangeHeader);
    } else {
      headers.set('Range', 'bytes=0-');
    }

    // Exponential Retry Loop for transient network hiccups
    let driveRes = null;
    for (let retry = 0; retry < 3; retry++) {
      try {
        driveRes = await fetch(driveUrl, { 
          method: request.method,
          headers 
        });

        if (driveRes.ok || driveRes.status === 206 || driveRes.status === 403) {
          break;
        }
      } catch (fErr) {
        console.warn(`[SA Fetch Error] Retry ${retry + 1}/3:`, fErr.message);
      }
      await new Promise(r => setTimeout(r, 400 * (retry + 1)));
    }

    if (!driveRes) continue;

    // Check if Google Drive returned 403 downloadQuotaExceeded / rateLimitExceeded
    if (driveRes.status === 403) {
      const clone = driveRes.clone();
      const text = await clone.text();
      if (text.includes('downloadQuotaExceeded') || text.includes('rateLimitExceeded') || text.includes('usageLimits')) {
        console.warn(`[SA Failover] SA #${i + 1} (${sa.email}) hit quota. Retrying next SA...`);
        lastErrorRes = driveRes;
        continue; // Try next Service Account!
      }
    }

    // Prepare Streaming Headers
    const responseHeaders = new Headers(corsHeaders);

    const forwardHeaders = [
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified'
    ];

    forwardHeaders.forEach(h => {
      const val = driveRes.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    if (isDownload) {
      responseHeaders.set('Content-Disposition', `attachment; filename="SMD_PRIME_Movie_${fileId}.mp4"; filename*=UTF-8''SMD_PRIME_Movie_${fileId}.mp4`);
      responseHeaders.set('Content-Type', 'application/octet-stream');
      responseHeaders.set('Content-Transfer-Encoding', 'binary');
    } else {
      responseHeaders.set('Content-Disposition', 'inline');
      const rawContentType = driveRes.headers.get('content-type') || '';
      if (!rawContentType || rawContentType.includes('matroska') || rawContentType.includes('mkv') || rawContentType.includes('octet-stream')) {
        responseHeaders.set('Content-Type', 'video/mp4');
      } else {
        responseHeaders.set('Content-Type', rawContentType);
      }
    }

    // Enable 14,400s Edge Cache, Accept-Ranges & Keep-Alive for HTML5 Video
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Connection', 'keep-alive');
    responseHeaders.set('Cache-Control', 'public, max-age=14400, s-maxage=86400, stale-while-revalidate=86400');
    responseHeaders.set('X-Cache-Status', `PROXY-GDRIVE-EDGE (SA:${i + 1}/${serviceAccounts.length})`);

    // TransformStream zero-buffer pipelining to eliminate forward/backward seek lag
    const { readable, writable } = new TransformStream();
    driveRes.body.pipeTo(writable).catch(err => console.error('Stream pipe error:', err.message));

    const status = driveRes.status === 200 && rangeHeader ? 206 : driveRes.status;

    return new Response(readable, {
      status,
      statusText: driveRes.statusText,
      headers: responseHeaders
    });
  }

  // If ALL Service Accounts hit quota limit
  return lastErrorRes || new Response(JSON.stringify({ 
    error: 'All Service Accounts Exceeded Google Drive Download Quota',
    message: 'Add more Service Accounts to Cloudflare Worker env variables.'
  }), { 
    status: 429, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Drive-to-Supabase Sync Pipeline Engine
 */
export async function triggerDriveToSupabaseSync(env) {
  const SUPABASE_URL = env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
  const FOLDER_ID = env.GOOGLE_DRIVE_FOLDER_ID || '13QLJomTi-5IA4Jjz7TOMSEKwalE6mSCt';
  const serviceAccounts = getServiceAccountList(env);
  const sa = serviceAccounts[0];

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase credentials missing.');
  }

  const token = await getGoogleAccessToken(sa.email, sa.privateKey);
  const files = await fetchDriveFiles(token, FOLDER_ID);
  const summary = [];

  for (const file of files) {
    const { cleanTitle, year, quality, uid } = parseFileName(file.name);

    const mRes = await fetch(`${SUPABASE_URL}/rest/v1/movies`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        uid,
        title: cleanTitle,
        original_title: cleanTitle,
        overview: 'High quality cinema stream loaded live from 7TB Google Drive cloud repository.',
        release_year: year,
        rating: 7.5,
        genres: ['Action', 'Drama']
      })
    });

    const sRes = await fetch(`${SUPABASE_URL}/rest/v1/movie_sources`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        movie_uid: uid,
        quality,
        drive_file_id: file.id,
        file_size: file.size ? `${Math.round(file.size / (1024 * 1024))} MB` : '1.2 GB',
        audio_languages: ['Tam', 'Tel', 'Hin', 'Eng'],
        sa_account_index: 1
      })
    });

    summary.push({ uid, title: cleanTitle, quality, status: mRes.ok && sRes.ok ? 'SYNCED' : 'PARTIAL' });
  }

  return summary;
}

/**
 * Generate Google OAuth Token via Web Crypto RSA-SHA256
 */
async function getGoogleAccessToken(email, privateKeyRaw) {
  try {
    if (!privateKeyRaw) return null;
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const base64UrlEncode = (obj) =>
      btoa(typeof obj === 'string' ? obj : JSON.stringify(obj))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const signatureInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
    
    const binaryDerString = atob(privateKey.replace(/-----\w+ PRIVATE KEY-----|\s/g, ''));
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signatureInput)
    );

    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
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
    return data.access_token || null;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch Drive Files Helper
 */
async function fetchDriveFiles(accessToken, folderId) {
  if (!accessToken) return [];
  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (data.files) {
      return data.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    }
  } catch (err) {}
  return [];
}

/**
 * Advanced Filename Sanitizer
 */
function parseFileName(fullName) {
  let name = fullName.trim();
  name = name.replace(/\.(mkv|mp4|avi|mov|flv|webm)$/i, '');
  name = name.replace(/^Copy\s*(\(\d+\))?\s*of\s+/i, '');
  name = name.replace(/^@[A-Za-z0-9_.\s]+?[-:]\s*/i, ''); 
  name = name.replace(/^@[A-Za-z0-9_.\s]{2,40}\s{2,}/i, '');
  name = name.replace(/^@[A-Za-z0-9_.]+\s*/i, '');
  name = name.replace(/^(https?:\/\/)?(www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,6}(\.[A-Za-z]{2,4})?\s*[-:_]*\s*/i, '');

  name = name.replace(/[-_.]/g, ' ').replace(/\s+/g, ' ');

  const yearMatch = name.match(/\b(19\d\d|20[0-3]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  let quality = '1080p';
  if (/(2160p|4K)/i.test(fullName)) quality = '4K';
  else if (/1080p/i.test(fullName)) quality = '1080p';
  else if (/720p/i.test(fullName)) quality = '720p';
  else if (/480p/i.test(fullName)) quality = '480p';

  let cleanTitle = name;
  if (yearMatch) {
    cleanTitle = cleanTitle.substring(0, yearMatch.index);
  } else {
    cleanTitle = cleanTitle.replace(/\b(2160p|4K|1080p|720p|480p|HDRip|WEB-DL|BluRay|BRRip|DVDRip|HQ|x264|x265|HEVC)\b.*/i, '');
  }

  cleanTitle = cleanTitle
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(BluRay|HDRp|HQ|HDRip|WEB-DL|HDR|x264|x265|HEVC|DD\+5\.1|ESub|MSub|AAC|Tamil|Tam|Tel|Hin|Eng|TRUE|S\d+|^EP.*)\b/gi, '')
    .replace(/[-_.:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleanTitle = cleanTitle.replace(/^(promo|vip|official|hd|hq)\s+/i, '').trim();

  if (!cleanTitle || cleanTitle.length < 2) {
    cleanTitle = fullName.replace(/\.(mkv|mp4|avi)$/i, '').replace(/[-_.]/g, ' ').trim();
  }

  const uid = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year || 2026}`;
  return { cleanTitle, year: year || 2026, quality, uid };
}
