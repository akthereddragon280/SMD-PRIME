import crypto from 'node:crypto';

const FOLDER_ID = '13QLJomTi-5IA4Jjz7TOMSEKwalE6mSCt';
const SA_EMAIL = "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com";
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n`;

async function getAccessToken() {
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

  // Formatted Size String for disambiguation
  const sizeMb = Math.round(rawSizeBytes / (1024 * 1024));
  const sizeGb = (rawSizeBytes / (1024 * 1024 * 1024)).toFixed(1);
  const sizeStr = rawSizeBytes >= 1024 * 1024 * 1024 ? `${sizeGb}GB` : `${sizeMb}MB`;

  // Build clean unique descriptor
  let label = baseRes;
  if (codec) label += ` ${codec}`;
  if (formatTag) label += ` ${formatTag}`;
  if (partTag) label += `${partTag}`;
  label += ` (${audioLangs.join('/')} - ${sizeStr})`;

  return { label, audioLangs, baseRes, sizeStr };
}

async function run() {
  const token = await getAccessToken();
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
