/**
 * SMD PRIME - DECOUPLED CRON-KV TOKEN ENGINE (cron_worker.js)
 * Autonomous Edge Daemon for Proactive OAuth Token Minting
 */

const FALLBACK_SA_POOL = [];

const TOKEN_EXPIRATION_TTL_SEC = 3300; // 55 minutes
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function base64UrlEncode(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  const base64 = btoa(str);
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function importPrivateKey(pemKey) {
  const cleanPem = pemKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const binaryDer = atob(cleanPem);
  const derBuffer = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derBuffer[i] = binaryDer.charCodeAt(i);
  }
  return await crypto.subtle.importKey(
    'pkcs8',
    derBuffer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
}

async function createSignedJwt(clientEmail, pemPrivateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: GOOGLE_TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const cryptoKey = await importPrivateKey(pemPrivateKey);
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );

  return `${signatureInput}.${bufferToBase64Url(signatureBuffer)}`;
}

async function fetchGoogleAccessToken(clientEmail, privateKey) {
  const jwtAssertion = await createSignedJwt(clientEmail, privateKey);
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtAssertion
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google OAuth API HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Google OAuth API returned response without access_token');
  }

  return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
}

async function resolveServiceAccountPool(env) {
  if (env?.SA_CONFIG_JSON) {
    try {
      const parsed = JSON.parse(env.SA_CONFIG_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('[Cron Engine] Failed to parse SA_CONFIG_JSON:', e.message);
    }
  }

  if (env?.SUPABASE_URL && env?.SUPABASE_ANON_KEY) {
    try {
      const dbEndpoint = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/drive_service_accounts?is_active=eq.true&select=client_email,private_key`;
      const res = await fetch(dbEndpoint, {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          Accept: 'application/json'
        }
      });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map(r => ({
            email: r.client_email || r.email,
            privateKey: (r.private_key || r.privateKey || '').replace(/\\n/g, '\n')
          })).filter(sa => sa.email && sa.privateKey);
        }
      }
    } catch (dbErr) {
      console.warn('[Cron Engine] Supabase fetch warning:', dbErr.message);
    }
  }

  return FALLBACK_SA_POOL;
}

async function executeTokenRefreshPipeline(env) {
  const kv = env.SA_TOKENS;
  if (!kv) {
    throw new Error('Cloudflare KV binding "SA_TOKENS" is missing in wrangler environment!');
  }

  const saPool = await resolveServiceAccountPool(env);
  const results = {
    timestamp: new Date().toISOString(),
    totalAccounts: saPool.length,
    successfulCount: 0,
    failedCount: 0,
    accountsProcessed: []
  };

  const validEmails = [];
  for (let idx = 0; idx < saPool.length; idx++) {
    const sa = saPool[idx];
    const saEmail = sa.email;
    const saIndex = idx + 1;

    try {
      const { accessToken } = await fetchGoogleAccessToken(saEmail, sa.privateKey);
      await kv.put(`sa:${saEmail}`, accessToken, { expirationTtl: TOKEN_EXPIRATION_TTL_SEC });
      await kv.put(`sa_index:${saIndex}`, accessToken, { expirationTtl: TOKEN_EXPIRATION_TTL_SEC });

      validEmails.push(saEmail);
      results.successfulCount++;
      results.accountsProcessed.push({ index: saIndex, email: saEmail, status: 'SUCCESS', ttl: TOKEN_EXPIRATION_TTL_SEC });
    } catch (saErr) {
      results.failedCount++;
      results.accountsProcessed.push({ index: saIndex, email: saEmail, status: 'FAILED', error: saErr.message });
    }
  }

  if (validEmails.length > 0) {
    await kv.put('ACTIVE_SA_EMAILS', JSON.stringify(validEmails), { expirationTtl: TOKEN_EXPIRATION_TTL_SEC });
    await kv.put('ACTIVE_SA_COUNT', String(validEmails.length), { expirationTtl: TOKEN_EXPIRATION_TTL_SEC });
  }

  return results;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(executeTokenRefreshPipeline(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

    if (url.pathname === '/trigger' || url.pathname === '/refresh') {
      const adminToken = url.searchParams.get('token') || request.headers.get('Authorization') || '';
      const expectedSecret = env.ADMIN_SECRET || 'smd_prime_admin_secret_2026';

      if (adminToken.replace('Bearer ', '').trim() !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }

      try {
        const report = await executeTokenRefreshPipeline(env);
        return new Response(JSON.stringify(report, null, 2), { status: 200, headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({
      service: 'SMD PRIME Decoupled Cron-KV Token Engine',
      status: 'online',
      cronInterval: 'Every 45 Minutes (0/45 * * * *)',
      manualTriggerEndpoint: '/trigger?token=YOUR_ADMIN_SECRET'
    }, null, 2), { status: 200, headers: corsHeaders });
  }
};
