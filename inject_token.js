import { execSync } from 'child_process';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

async function generateAccessToken(sa) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj) =>
    Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signatureInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(sa.privateKey.replace(/\\n/g, '\n'), 'base64')
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
  if (data.access_token) return data.access_token;
  throw new Error("Failed to get access token from Google");
}

async function pushToKV() {
  console.log("Fetching Service Accounts from .env SERVICE_ACCOUNTS_JSON...");
  const data = JSON.parse(process.env.SERVICE_ACCOUNTS_JSON);
  const firstSA = data[0];

  console.log("Authenticating Service Account without external dependencies...");
  const token = await generateAccessToken(firstSA);
  const email = firstSA.client_email;
  
  console.log("Pushing Token to Cloudflare KV Store...");
  execSync(`npx wrangler kv:key put --binding=SA_TOKENS "sa:${email}" "${token}"`, { stdio: 'inherit' });
  execSync(`npx wrangler kv:key put --binding=SA_TOKENS "sa_index:1" "${token}"`, { stdio: 'inherit' });
  execSync(`npx wrangler kv:key put --binding=SA_TOKENS "ACTIVE_SA_EMAILS" "[\\"${email}\\"]"`, { stdio: 'inherit' });
  execSync(`npx wrangler kv:key put --binding=SA_TOKENS "ACTIVE_SA_COUNT" "1"`, { stdio: 'inherit' });
  
  console.log("Token successfully pumped into Cloudflare Edge KV! Streaming Proxy active.");
}

pushToKV();
