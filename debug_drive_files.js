import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

if (!FOLDER_ID || !SA_EMAIL || !PRIVATE_KEY) {
  console.warn('[Security Notice] Missing GOOGLE_DRIVE_FOLDER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in process.env for debug_drive_files.js.');
}

async function getAccessToken() {
  if (!SA_EMAIL || !PRIVATE_KEY) return null;
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj) =>
    Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
      .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const signatureInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(PRIVATE_KEY, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

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
}

async function debug() {
  const token = await getAccessToken();
  if (!token) return;
  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();

  const janaFiles = (data.files || []).filter(f => f.name.toLowerCase().includes('jana'));

  console.log(`=== ALL 25 JANA FILES IN DRIVE ===`);
  janaFiles.forEach((f) => {
    console.log(f.name);
  });
}

debug().catch(console.error);
