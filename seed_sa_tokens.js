import dotenv from 'dotenv';
import crypto from 'node:crypto';
import dns from 'node:dns';
import { execSync } from 'child_process';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

dotenv.config();

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function base64UrlEncode(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function fetchGoogleAccessToken(clientEmail, pemPrivateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: GOOGLE_TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now
  };

  const signatureInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(pemPrivateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwtAssertion = `${signatureInput}.${signature}`;

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
  return data.access_token;
}

async function seedTokens() {
  console.log('🚀 Seeding Google Service Account OAuth tokens into Cloudflare KV (SA_TOKENS)...');

  let saPool = [];
  try {
    if (process.env.SERVICE_ACCOUNTS_JSON) {
      const parsed = JSON.parse(process.env.SERVICE_ACCOUNTS_JSON);
      if (Array.isArray(parsed)) {
        parsed.forEach(sa => {
          const email = sa.email || sa.client_email;
          const key = sa.privateKey || sa.private_key;
          if (email && key) {
            saPool.push({ email, privateKey: key.replace(/\\n/g, '\n') });
          }
        });
      }
    }
  } catch (e) {
    console.error('Error parsing SERVICE_ACCOUNTS_JSON:', e.message);
  }

  if (saPool.length === 0) {
    console.error('❌ No Service Accounts found in .env!');
    return;
  }

  console.log(`Found ${saPool.length} Service Accounts. Minting OAuth access tokens...`);
  const activeEmails = [];

  for (let i = 0; i < saPool.length; i++) {
    const sa = saPool[i];
    const index = i + 1;

    try {
      const token = await fetchGoogleAccessToken(sa.email, sa.privateKey);
      console.log(`✅ [SA #${index}] Token Minted for ${sa.email}`);

      // Push to Cloudflare KV via Wrangler
      execSync(`npx wrangler kv:key put --binding=SA_TOKENS --config=wrangler-1.toml "sa:${sa.email}" "${token}" --ttl 3600`, { stdio: 'inherit' });
      execSync(`npx wrangler kv:key put --binding=SA_TOKENS --config=wrangler-1.toml "sa_index:${index}" "${token}" --ttl 3600`, { stdio: 'inherit' });
      activeEmails.push(sa.email);
    } catch (err) {
      console.error(`❌ [SA #${index}] Error minting token for ${sa.email}:`, err.message);
    }
  }

  if (activeEmails.length > 0) {
    const emailsJson = JSON.stringify(activeEmails).replace(/"/g, '\\"');
    execSync(`npx wrangler kv:key put --binding=SA_TOKENS --config=wrangler-1.toml "ACTIVE_SA_EMAILS" "${emailsJson}" --ttl 3600`, { stdio: 'inherit' });
    execSync(`npx wrangler kv:key put --binding=SA_TOKENS --config=wrangler-1.toml "ACTIVE_SA_COUNT" "${activeEmails.length}" --ttl 3600`, { stdio: 'inherit' });
    console.log(`\n🎉 SUCCESSFULLY SEEDED ${activeEmails.length} ACTIVE SERVICE ACCOUNT TOKENS INTO CLOUDFLARE KV!`);
  }
}

seedTokens();
