import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n') : '';

if (!FOLDER_ID || !SA_EMAIL || !PRIVATE_KEY) {
  console.warn('[Security Notice] Missing GOOGLE_DRIVE_FOLDER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in process.env for test_25_files.js.');
}

async function getAccessToken() {
  if (!SA_EMAIL || !PRIVATE_KEY) return null;
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: SA_EMAIL, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
  const base64UrlEncode = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(PRIVATE_KEY, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signatureInput}.${signature}`;
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const data = await res.json();
  return data.access_token || null;
}

function generateSmartUniqueQuality(fullName, fileSizeInBytes) {
  const rawSizeBytes = Number(fileSizeInBytes) || 0;

  // 1. Codec
  let codec = '';
  if (/(hevc|x265|h\.?265)/i.test(fullName)) codec = 'HEVC';
  else if (/(x264|h\.?264|avc)/i.test(fullName)) codec = 'x264';

  // 2. Base Resolution
  let baseRes = '';
  if (/(2160p|4K)/i.test(fullName)) baseRes = '4K';
  else if (/1080p/i.test(fullName)) baseRes = '1080p';
  else if (/720p/i.test(fullName)) baseRes = '720p';
  else if (/480p/i.test(fullName)) baseRes = '480p';
  else {
    const sizeInMB = rawSizeBytes / (1024 * 1024);
    if (sizeInMB < 600) baseRes = '480p';
    else if (sizeInMB >= 600 && sizeInMB < 1800) baseRes = '720p';
    else baseRes = '1080p';
  }

  // 3. Audio Languages
  const audioLangs = [];
  if (/\b(tam|tamil|tns)\b/i.test(fullName)) audioLangs.push('Tamil');
  if (/\b(tel|telugu|tl)\b/i.test(fullName)) audioLangs.push('Telugu');
  if (/\b(kan|kannada)\b/i.test(fullName)) audioLangs.push('Kannada');
  if (/\b(hin|hindi)\b/i.test(fullName)) audioLangs.push('Hindi');
  if (/\b(mal|malayalam)\b/i.test(fullName)) audioLangs.push('Malayalam');
  if (audioLangs.length === 0) audioLangs.push('Tamil'); // default fallback

  // 4. Format & Part
  let formatTag = '';
  if (/WEB-?DL/i.test(fullName)) formatTag = 'WEB-DL';
  else if (/HDRip/i.test(fullName)) formatTag = 'HDRip';
  else if (/BluRay/i.test(fullName)) formatTag = 'BluRay';

  let partTag = '';
  const partMatch = fullName.match(/\.part(\d+)/i) || fullName.match(/\bpart\s*(\d+)/i);
  if (partMatch) {
    partTag = ` Part ${parseInt(partMatch[1], 10)}`;
  }

  const sizeMb = Math.round(rawSizeBytes / (1024 * 1024));
  const sizeGb = (rawSizeBytes / (1024 * 1024 * 1024)).toFixed(1);
  const sizeStr = rawSizeBytes >= 1024 * 1024 * 1024 ? `${sizeGb}GB` : `${sizeMb}MB`;

  let label = baseRes;
  if (codec) label += ` ${codec}`;
  if (formatTag) label += ` ${formatTag}`;
  if (partTag) label += `${partTag}`;
  label += ` (${audioLangs.join('/')} - ${sizeStr})`;

  return { label, audioLangs, baseRes, sizeStr };
}

async function run() {
  const token = await getAccessToken();
  if (!token) return;
  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  const janaFiles = (data.files || []).filter(f => f.name.toLowerCase().includes('jana'));

  console.log(`=== SMART QUALITY DESCRIPTORS FOR ALL ${janaFiles.length} FILES ===`);
  const labelsSet = new Set();
  janaFiles.forEach((f, i) => {
    const { label, audioLangs } = generateSmartUniqueQuality(f.name, f.size);
    labelsSet.add(label);
    console.log(`${(i+1).toString().padStart(2, ' ')}. [${audioLangs.join(', ').padEnd(7)}] -> Quality: "${label}" | File: ${f.name.substring(0, 45)}...`);
  });

  console.log(`\nResult: Generated ${labelsSet.size} unique quality descriptors for ${janaFiles.length} files!`);
}

run().catch(console.error);
