/**
 * WORKER: smd-token-cron
 * Standalone background daemon to refresh Google Drive Service Account tokens
 * every 45 minutes and persist them directly into Cloudflare KV (SA_TOKENS).
 */

const TOKEN_EXPIRATION_TTL_SEC = 3600; // 1 Hour TTL
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// Fallback Embedded Service Account Pool
const FALLBACK_SA_POOL = [];

/**
 * Base64URL encoder helper
 */
function base64UrlEncode(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return btoa(str)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * ArrayBuffer to Base64URL helper
 */
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Native WebCrypto PKCS#8 Private Key Importer
 */
async function importPrivateKey(pemKey) {
  const cleanPem = pemKey
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s+/g, '');
  
  const binaryDer = atob(cleanPem);
  const derBuffer = new Uint8Array(binaryDer.length);
  for (let i = 0; i < binaryDer.length; i++) {
    derBuffer[i] = binaryDer.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    'pkcs8',
    derBuffer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' }
    },
    false,
    ['sign']
  );
}

/**
 * Native WebCrypto RS256 JWT Generator
 */
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
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  return `${signatureInput}.${bufferToBase64Url(signatureBuffer)}`;
}

/**
 * Fetch Fresh Access Token from Google OAuth2 API
 */
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
    throw new Error('OAuth API response missing access_token field');
  }

  return data.access_token;
}

/**
 * Read Service Account credentials list from env secrets or fallback
 */
function getServiceAccountPool(env) {
  if (env?.SA_CONFIG_JSON) {
    try {
      const parsed = JSON.parse(env.SA_CONFIG_JSON);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn('[smd-token-cron] Could not parse env.SA_CONFIG_JSON:', e.message);
    }
  }

  if (env?.GOOGLE_SERVICE_ACCOUNT_EMAIL && env?.GOOGLE_PRIVATE_KEY) {
    return [{
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }];
  }

  return FALLBACK_SA_POOL;
}

/**
 * Send Telegram Alert
 */
async function sendTelegramAlert(env, message) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID;
  if (!botToken || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('[smd-token-cron] Alert failed:', err.message);
  }
}

/**
 * Scheduled Event Daemon Logic
 */
async function handleScheduledEvent(event, env, ctx) {
  console.log(`[smd-token-cron] Starting 45-min token refresh daemon execution at ${new Date().toISOString()}...`);

  const kv = env.SA_TOKENS;
  if (!kv) {
    console.error('[smd-token-cron] CRITICAL: KV namespace binding "SA_TOKENS" is undefined!');
    await sendTelegramAlert(env, "❌ <b>CRITICAL ERROR</b>: KV namespace binding <code>SA_TOKENS</code> is undefined in smd-token-cron!");
    return;
  }

  const saPool = getServiceAccountPool(env);
  const activeEmails = [];

  for (let i = 0; i < saPool.length; i++) {
    const sa = saPool[i];
    const index = i + 1;

    try {
      const token = await fetchGoogleAccessToken(sa.email, sa.privateKey);

      await kv.put(`sa:${sa.email}`, token, {
        expirationTtl: TOKEN_EXPIRATION_TTL_SEC
      });

      await kv.put(`sa_index:${index}`, token, {
        expirationTtl: TOKEN_EXPIRATION_TTL_SEC
      });

      activeEmails.push(sa.email);
      console.log(`[smd-token-cron] Successfully refreshed token for SA #${index} (${sa.email}) -> KV Written.`);
    } catch (err) {
      console.error(`[smd-token-cron] Error refreshing token for SA #${index} (${sa.email}):`, err.message);
    }
  }

  if (activeEmails.length > 0) {
    await kv.put('ACTIVE_SA_EMAILS', JSON.stringify(activeEmails), {
      expirationTtl: TOKEN_EXPIRATION_TTL_SEC
    });
    console.log(`[smd-token-cron] Saved ${activeEmails.length} active SA email(s) to KV key "ACTIVE_SA_EMAILS".`);
  }

  if (activeEmails.length < 3) {
    const alertMsg = `🚨 <b>CRITICAL WARNING</b> 🚨\n\nSA Mesh is nearing Exhaustion or is fully blocked!\n\n<b>Available Accounts:</b> ${activeEmails.length} / ${saPool.length}\n\nPlease check Google Cloud Console immediately.`;
    await sendTelegramAlert(env, alertMsg);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduledEvent(event, env, ctx));
  }
};
