import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

dotenv.config();

// 1. Credentials & Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '13QLJomTi-5IA4Jjz7TOMSEKwalE6mSCt';

const DEFAULT_SA_POOL = [
  {
    email: "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n`
  },
  {
    email: "tgstream-bot-2@tgstream-drive-proxy.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCpPGCGJjve2SM7\nB0Dv8fcUNV2seJ/Y94ap2oD1j4HGbuPhHEUmQUCq5Wqr4HN9zyVKY09LGQAw/MY7\nDBrT7P7k8B6e+TUtOMqhBBAgm/E6WeHZuUR4z84P2B3iOymLfWoD8pv/ekwC+vsF\n86bnvNXg+N7M8gMojNd3gB0XoU87wkUlQf1igK2AV/eAs2+tjZOS5KvZC/XemSBc\nvV9tNKOoZ03XAXJeX0hBeTZXSoLU6yXTXBXQerV0htydx9gjKnioBn7ayRNK1i3L\nWdIedraSEiIRM6WYoJkkZ68SLag20ci+gl3Y+9D3QxB99/eGZu6Q4RYr7FlHAK4U\ndAnzciHFAgMBAAECggEATcIQF5M5rwrVxSlwDM+AVyiuAbDqwSX6GdDrr+hgGGyb\nB7OVkh4pOFxwxsg6SHQFDkjTBg5WqCt8aWUGbplWBJrPdvvKEx0k/RaA0nrUO5tQ\nylj1vQy+AUmrcWb9j7nwHCA8zQXEJxpqfDGXXqLFIrk2pbQM/3S3C5ExzMmxPiMl\ncu6c1Dkeggdx6LNNU+lm/3Ep87pixUqlTadR1CyzSJFZK8JFB5s3Kod69OT234MM\ng/V8r54NOvCG2985s0BDIKMZ4A8qyLOMcTnzxtD5IQaMy7mB1nzT9mNSw2DLUhRD\nFvHet/zJbv6jab+/cbKH4ZNloVN/zBuvfDSUf6pPgQKBgQDY17Nit6qLEk4ewgkC\n0APfaqYeimjEE+PoEdsEcnBPLEpCZg7t+ctDrGaHIfLc5Skkk38tayd083tc04mK\nI3jvoRD2jgGY+rGQyeLMgJ4fxyQy/FbQ/ioYwit8tm45NWqM/5uSJ3+EwyCUnhbA\nkojprSiCNqfuAcrrpttWpwjSxwKBgQDHy+Pk6cQFFu542HddTBHFw+yVsvzHsdZR\n7keQEVwSMhOCFH0e1Xou+TMDB+kYbpXUktJK1bodMnD1e5GkFPb9dRY5pnqqzqkx\nxutq0CKWXhyb81jFO4dHoj3AT+IhlSFoifIJoxrkLhS5jw3Au/GpTzinGPbf+8ts\nzQ1ErHSbEwKBgEbEPlrdLd8tHimTkXVFhb4IBCa7bO1wwFQgX6XX4yczgRiiTgUE\nHH39aYh4X9YPQ5oYOM0Nx1a3j27/6kcWxIUPv4V3WrYeOozSFh4/a1tblki9aWfT\nStHBrIeK0fYBpMBXOuI72bXuKFfYL/yw1dXNGQdF5xAZrauyTKq+4HZJAoGBAIlH\nWLDixiLRHM2/vlRGfjeqZRZ+wxza3m2xEU61/tMpwSmxtj7HY4p/A0Pj3Y9B/ITw\n1LlCnPyOufqSCwH4vbRtDPZToxlVof9ntD3SANHcnD+zNp1eR5c6rL9EpBV7CFdx\n4PIqNcHuv6K33jU9bdBtdHmrt4Uy1xVM1v8Gl6AtAoGAQF83Ewp39E98mJCKMNeJ\n1LjPx1c8uFmPjw3i0XWUGKYSBhSckNBuoe35RGujQQy5ScaXGUjgN510Og/0+34Y\nnn8Pk3tL44WEcs9ULQXFoWGBCEslbZoO1RjcCPckcLM+9SlrBPj7DTfhQFLlSQTjy\nbMmqArLWoY4bzJxd8zMc1k8=\n-----END PRIVATE KEY-----\n`
  },
  {
    email: "tgstream-bot-10@tgstream-drive-proxy.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDTPOFNebPYbkyI\ntsdb9eUl1x+BwbURoSWV//HW6uau8W5HNILnvhTuei5khz/MYncKjxCNAGoxym2r\nyBlAugfoXmEd1X7sZB5S/rcOVgWbH7B00j7aviPxpXwsxfVBnWq89MVBp2PqIQS+\ngmO1YsWYyuITJItIS088l+tEk6shoU3/Rws4EVswQA7XL/MfNySfzPsElxFtHOHR\nCgYfpx956YiZEgy1y8NeBJZqX+QKRY2AglNlaxWNBtCxCSlXYhh6Dz3+ovbz9NVE\nJfJoPrB382TDYUP23bcvBTGwCAV78j2Zd0UbBD1rzqV96eomYJyKO9V3xcspOkDn\nX+Bjp8aTAgMBAAECggEAFUznySizBmmE5SpNKww+GZU6M5rlV8xAnoILEGlqboyg\n2qREaPrlYHDImdF7kPAC4fkwKY+3paKscWyBg2He50MRFvGO1WZ5GlReAB+TfCNz\nZyxGM0eGF1lhDqC9jOrDNx+VfnvTGupOcKl0RXeaxj/7EQQX2WfiqxEEo8siMAdF\nby/2tOJRSUXPFZRMIi8XO7nUo8rL6+8G5e3bVRseIKDbuvMSKEiz7M3892Cd9ECX\nqQPwHFagTpC4lECcLTRmfnCAlhh+qkbuVVncc7W4/FoeN7rfjCpIFAQ77Gi5zjOk\nOzZcNo5VeSoD9ySpCurk5KZpx4oH9/pVNEWBLoRQFQKBgQD6kqergxUDZ6YB4DSc\n9nQtrf+Cr4tNcHNVb57uM6EtuPzu8IDOt/3/Fky9TRngtwjUvO5LgNhWRDt/UKfh\nEARVV8A3x5Shn9z2HsVW0m/OOdznjXC0kc20qhuITx+g9PUpi8QRwS/YiyZtiXsZ\nHZ2XVxeF9GS3AvPWWoOOeBBObQKBgQDX0CAB6KlINRpqHVZEB9Nan96KEcen6ZED\nrQZnPUwl3bUERdnuCrV9QPY0rUJlw3CiT6aorv1KWKgFoBi/inUdEgn0FPaiismd\n3I/RT+EaN03/eRubTiLim15hq0JzQCOMOXN1yi/4Mr5LUVJbNaldHSpgNgvQ61y9\n2ixuledI/wKBgGPqmOt+YKGz8fFriu9QIzGX4XwmLcEaZxMZaGGJuuq1ij5pLqO/\noIvYQ490sC34LpBOKiN3ZEy59pOlANxw+5lgXWigr/bm/UAzMvOVBDpSvnCi6N9I\nCKPS9Rmcm3seUqhXcD64LzEFA7TIDosMUSvo8ZtbwdFsXvkJrM3huHbdAoGAbcFp\nJc9fmFt5bZIx9zNLqAE6OlnEgn7kw0vRv9uKyI8yqlOj+83ycxsAm9WpuPtmYwXD\nKnKkWpUwDnxXWcJewUQVT88Bh7SxyNkNQ1QulRifUFgVVCyuzTRbEaz5hIeQDJaD\nQ9pp/v4/jSp0ifKGidZ1YKzb4YpxhhRZGHygPZ0CgYAJR20OerO+ZSM2rlqMERgm\ngwTKB9qvryuVjIdi7pgF51s0Td2/sWphjWap+0yGf0H2udfcLM+aUYiCYl/22tWz\nOa+braSl7wHBhDaG+NhdXvfc+vN9pz4CtD48FzIK9mPaQPcX94TfDxffkCVlL8NE\n7V/qeOtm+f4whn1F/B8ZQA==\n-----END PRIVATE KEY-----\n`
  }
];

async function getServiceAccountList() {
  const list = [];

  try {
    const { data, error } = await supabase
      .from('drive_service_accounts')
      .select('*')
      .eq('is_active', true);

    if (!error && Array.isArray(data) && data.length > 0) {
      data.forEach(r => {
        let rawKey = '';
        if (typeof r.sa_json === 'string') {
          try {
            const parsed = JSON.parse(r.sa_json);
            rawKey = parsed.privateKey || parsed.private_key || r.private_key || r.privateKey;
          } catch (e) {}
        } else if (r.sa_json) {
          rawKey = r.sa_json.privateKey || r.sa_json.private_key || r.private_key || r.privateKey;
        } else {
          rawKey = r.private_key || r.privateKey;
        }

        const email = r.sa_email || r.client_email || r.email;
        if (email && rawKey) {
          const private_key = rawKey.replace(/\\n/g, '\n');
          if (!list.some(s => s.email === email)) {
            list.push({ email, private_key });
          }
        }
      });
    }
  } catch (err) {
    console.warn('Failed to fetch SAs from Supabase DB:', err.message);
  }

  for (let i = 1; i <= 20; i++) {
    const email = process.env[`GOOGLE_SA${i}_EMAIL`];
    const key = process.env[`GOOGLE_SA${i}_PRIVATE_KEY`];
    if (email && key && !list.some(s => s.email === email)) {
      list.push({ email, private_key: key.replace(/\\n/g, '\n') });
    }
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!list.some(s => s.email === email)) {
      list.push({
        email,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    }
  }

  for (const sa of DEFAULT_SA_POOL) {
    if (!list.some(s => s.email === sa.email)) {
      list.push(sa);
    }
  }

  return list;
}

let SERVICE_ACCOUNTS = [];
let saIndex = 0;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getGoogleDriveAccessToken() {
  try {
    if (SERVICE_ACCOUNTS.length === 0) {
      SERVICE_ACCOUNTS = await getServiceAccountList();
    }
    if (SERVICE_ACCOUNTS.length === 0) return null;
    const sa = SERVICE_ACCOUNTS[saIndex % SERVICE_ACCOUNTS.length];
    saIndex++;

    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
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
    const signature = signer.sign(sa.private_key, 'base64')
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

// 3. Strict Video-Only MIME & Extension Filter
async function fetchGoogleDriveFiles(accessToken) {
  try {
    if (accessToken) {
      // Try Folder query first, fallback to general video files query
      const targetFolders = [FOLDER_ID, '19FJzU-ZrwOOVOmxginGpBMo3YQC1swXM'].filter(Boolean);
      let allFiles = [];

      for (const folderId of targetFolders) {
        const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          allFiles = allFiles.concat(data.files);
        }
      }

      // If specific folders return empty, query all accessible video files directly
      if (allFiles.length === 0) {
        const fallbackUrl = `https://www.googleapis.com/drive/v3/files?q=trashed=false+and+mimeType!='application/vnd.google-apps.folder'&fields=files(id,name,size,mimeType)&pageSize=1000`;
        const res = await fetch(fallbackUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await res.json();
        if (data.files) {
          allFiles = data.files;
        }
      }

      if (allFiles.length > 0) {
        // Deduplicate by file ID
        const fileMap = new Map();
        allFiles.forEach(f => fileMap.set(f.id, f));
        const uniqueFiles = Array.from(fileMap.values());

        return uniqueFiles.filter(f => {
          if (!f.mimeType || f.mimeType === 'application/vnd.google-apps.folder') return false;
          const isVideoMime = typeof f.mimeType === 'string' && f.mimeType.toLowerCase().startsWith('video/');
          const isVideoExt = /\.(mp4|mkv|avi|mov|webm|flv|m4v|3gp)$/i.test(f.name);
          return isVideoMime || isVideoExt;
        });
      }
    }
  } catch (err) {
    console.error('Error fetching Google Drive files:', err);
  }
  return [];
}

/**
 * 4. ADVANCED REGEX FILENAME SANITIZATION & PURE TITLE EXTRACTION ENGINE
 * Removes leading @ handles, www. domains, enclosed bracket tags [1TamilMV], (Telegram), etc.
 */
function parseAndSanitizeFileName(fullName, fileSizeInBytes) {
  let name = fullName.trim();

  // Step A: Strip video file extension
  name = name.replace(/\.(mkv|mp4|avi|mov|flv|webm|m4v|3gp)$/i, '');

  // Step B: Strip Google Drive 'Copy of', 'Copy (1) of', etc.
  name = name.replace(/^Copy\s*(\(\d+\))?\s*of\s+/i, '');

  // Step C: Remove website domains (e.g., www.1TamilMV.cz, www.TamilBlasters.vip, https://...)
  name = name.replace(/^(https?:\/\/)?(www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,6}(\.[A-Za-z]{2,4})?\s*[-:_]*\s*/gi, '');

  // Step D: Remove Telegram channel handles starting with @ (e.g., @MoviezTamizha, @SAM_DUB_LEA, @LK_MOVIES2)
  name = name.replace(/^@[A-Za-z0-9_.]+\s*/gi, '');
  name = name.replace(/^@[A-Za-z0-9_.\s]+?[-:]\s*/gi, '');

  // Step E: Strip enclosed bracket tags like [1TamilMV], [TRL], (Telegram), (3.5GB)
  name = name.replace(/\[[^\]]*\]/g, ' ');
  name = name.replace(/\([^\)]*?\)/g, (match) => {
    if (/\b(19\d\d|20[0-3]\d)\b/.test(match)) return match;
    return ' ';
  });

  // Replace dots and underscores with spaces for clean parsing
  name = name.replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();

  // Step F: Extract 4-Digit Release Year (1900-2030)
  const yearMatch = name.match(/\b(19\d\d|20[0-3]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // Step G: Advanced Quality, Codec, Format & Size Disambiguation
  let codec = '';
  if (/(hevc|x265|h\.?265)/i.test(fullName)) codec = 'HEVC';
  else if (/av1/i.test(fullName)) codec = 'AV1';
  else if (/(x264|h\.?264|avc)/i.test(fullName)) codec = 'x264';
  else if (/(10bit|10-bit)/i.test(fullName)) codec = '10Bit';

  let baseQuality = '1080p';
  if (/(2160p|4K)/i.test(fullName)) baseQuality = '4K';
  else if (/1080p/i.test(fullName)) baseQuality = '1080p';
  else if (/720p/i.test(fullName)) baseQuality = '720p';
  else if (/480p/i.test(fullName)) baseQuality = '480p';
  else {
    const sizeInMB = Number(fileSizeInBytes) > 0 ? Number(fileSizeInBytes) / (1024 * 1024) : 0;
    if (sizeInMB > 0) {
      if (sizeInMB < 600) baseQuality = '480p';
      else if (sizeInMB >= 600 && sizeInMB < 1800) baseQuality = '720p';
      else baseQuality = '1080p';
    }
  }

  // Step H: Extract Audio Codecs & Languages accurately
  const cleanForLang = fullName
    .replace(/1TamilMV/gi, '')
    .replace(/TamilBlasters/gi, '')
    .replace(/TamilMV/gi, '')
    .replace(/MoviezTamizha/gi, '')
    .replace(/^@[A-Za-z0-9_.]+\s*/gi, '')
    .replace(/\[1TamilMV[^\]]*\]/gi, '');

  const audioLangs = [];
  const isMulti = /(dual[\s_-]*audio|multi[\s_-]*audio|multi|dual)/i.test(cleanForLang);

  if (/\b(tam|tamil|tns)\b/i.test(cleanForLang) || /\[tam\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Tamil')) audioLangs.push('Tamil');
  }
  if (/\b(tel|telugu|tl)\b/i.test(cleanForLang) || /\[tel\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Telugu')) audioLangs.push('Telugu');
  }
  if (/\b(hin|hindi|hd)\b/i.test(cleanForLang) || /\[hin\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Hindi')) audioLangs.push('Hindi');
  }
  if (/\b(mal|malayalam)\b/i.test(cleanForLang) || /\[mal\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Malayalam')) audioLangs.push('Malayalam');
  }
  if (/\b(kan|kannada)\b/i.test(cleanForLang) || /\[kan\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Kannada')) audioLangs.push('Kannada');
  }
  if (/\b(eng|english)\b/i.test(cleanForLang) || /\[eng\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('English')) audioLangs.push('English');
  }

  if (isMulti && audioLangs.length <= 1) {
    audioLangs.push('Multi Audio');
  }

  if (audioLangs.length === 0) {
    audioLangs.push('Tamil');
  }

  // Format & Part Tags
  let formatTag = '';
  if (/WEB-?DL/i.test(fullName)) formatTag = 'WEB-DL';
  else if (/HDRip/i.test(fullName)) formatTag = 'HDRip';
  else if (/BluRay/i.test(fullName)) formatTag = 'BluRay';

  let partTag = '';
  const partMatch = fullName.match(/\.part(\d+)/i) || fullName.match(/\bpart\s*(\d+)/i);
  if (partMatch) {
    partTag = ` Part ${parseInt(partMatch[1], 10)}`;
  }

  // Disambiguated Formatted Size
  const rawSizeBytes = Number(fileSizeInBytes) || 0;
  const sizeMb = Math.round(rawSizeBytes / (1024 * 1024));
  const sizeGb = (rawSizeBytes / (1024 * 1024 * 1024)).toFixed(1);
  const sizeStr = rawSizeBytes >= 1024 * 1024 * 1024 ? `${sizeGb}GB` : `${sizeMb}MB`;

  // Build Industry-Level Smart Unique Quality Label
  let quality = baseQuality;
  if (codec) quality += ` ${codec}`;
  if (formatTag) quality += ` ${formatTag}`;
  if (partTag) quality += `${partTag}`;
  quality += ` (${audioLangs.join('/')} - ${sizeStr})`;

  // Step I: Isolate Pure Clean Title (Cut off at year or resolution indicator)
  let cleanTitle = name;
  if (yearMatch) {
    cleanTitle = cleanTitle.substring(0, yearMatch.index);
  } else {
    cleanTitle = cleanTitle.replace(/\b(2160p|4K|1080p|720p|480p|HDRip|WEB-DL|BluRay|BRRip|DVDRip|HQ|x264|x265|HEVC)\b.*/i, '');
  }

  // Step J: Strip remaining tags, codecs, channel prefixes, language keywords, and symbols
  cleanTitle = cleanTitle
    .replace(/^@[A-Za-z0-9_.]+\s*/gi, '')
    .replace(/\b(BluRay|HDRp|HQ|HDRip|WEB-DL|HDR|x264|x265|HEVC|DD\+5\.1|ESub|MSub|AAC|Tamil|Tam|Telugu|Tel|Hindi|Hin|Kannada|Kan|Malayalam|Mal|English|Eng|Multi|Dual|Audio|TRUE|S\d+|^EP.*)\b/gi, '')
    .replace(/[-_.:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip residual promo noise words at start
  cleanTitle = cleanTitle.replace(/^(promo|vip|official|hd|hq)\s+/i, '').trim();

  if (!cleanTitle || cleanTitle.length < 2) {
    cleanTitle = fullName.replace(/\.(mkv|mp4|avi)$/i, '').replace(/[-_.]/g, ' ').trim();
  }

  // Step K: Multilingual Canonical Title Aliasing & Normalization
  let normalizedTitle = cleanTitle;
  const titleLower = cleanTitle.toLowerCase();

  if (titleLower.includes('jana nayakudu') || titleLower.includes('jana nayagan')) {
    normalizedTitle = 'Jana Nayagan';
  } else if (titleLower.includes('guntur kaaram') || titleLower.includes('guntur karam')) {
    normalizedTitle = 'Guntur Kaaram';
  } else if (titleLower.includes('devara')) {
    normalizedTitle = 'Devara';
  }

  const uid = `${normalizedTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year || 2026}`;
  return { cleanTitle: normalizedTitle, year, quality, audioLangs, uid };
}

// 5. Generate Dynamic SVG Poster for unmatched files
function generateDynamicSVGPoster(title, genre = 'CINEMA') {
  const safeTitle = (title || 'SMD CINEMA').toUpperCase().substring(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e1b4b" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#020617" />
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#dc2626" />
        <stop offset="100%" stop-color="#e11d48" />
      </linearGradient>
    </defs>
    <rect width="600" height="900" fill="url(#bg)" />
    <circle cx="300" cy="400" r="220" fill="#dc2626" opacity="0.08" />
    <rect x="40" y="40" width="520" height="820" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2" />
    <rect x="70" y="80" width="110" height="34" rx="17" fill="url(#accent)" />
    <text x="125" y="102" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#ffffff" text-anchor="middle" letter-spacing="2">SMD PRIME</text>
    <text x="300" y="430" font-family="system-ui, sans-serif" font-weight="900" font-size="32" fill="#ffffff" text-anchor="middle" letter-spacing="1">${safeTitle}</text>
    <text x="300" y="475" font-family="system-ui, sans-serif" font-weight="700" font-size="14" fill="#94a3b8" text-anchor="middle" letter-spacing="3">${genre.toUpperCase()} • ULTRA HD</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// 6. 0-Failure Multi-Source Dynamic Metadata Engine (OMDB + Dynamic SVG)
async function fetchMetadata(cleanTitle, year) {
  // 1. Query OMDB API with Title & Year
  try {
    const omdbUrl = `https://www.omdbapi.com/?apikey=trilogy&t=${encodeURIComponent(cleanTitle)}${year ? `&y=${year}` : ''}`;
    const res = await fetch(omdbUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.Response === 'True' && data.Poster && data.Poster !== 'N/A') {
        const posterUrl = data.Poster;
        const genres = data.Genre ? data.Genre.split(', ').slice(0, 3) : ['Action', 'Drama'];
        const rating = data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : 7.5;
        const releaseYear = data.Year ? parseInt(data.Year, 10) : (year || 2026);
        const duration = data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : '2h 15m';

        return {
          success: true,
          title: data.Title || cleanTitle,
          original_title: data.Title || cleanTitle,
          overview: data.Plot && data.Plot !== 'N/A' ? data.Plot : 'High quality stream loaded live from 7TB Google Drive cloud repository.',
          poster_url: posterUrl,
          backdrop_url: posterUrl,
          rating: rating,
          duration: duration,
          release_year: releaseYear,
          genres: genres
        };
      }
    }
  } catch (e) {}

  // 2. Query OMDB API with Title only (without year restriction)
  try {
    const omdbUrl = `https://www.omdbapi.com/?apikey=trilogy&t=${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(omdbUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.Response === 'True' && data.Poster && data.Poster !== 'N/A') {
        const posterUrl = data.Poster;
        const genres = data.Genre ? data.Genre.split(', ').slice(0, 3) : ['Action', 'Drama'];
        const rating = data.imdbRating && data.imdbRating !== 'N/A' ? parseFloat(data.imdbRating) : 7.5;
        const releaseYear = data.Year ? parseInt(data.Year, 10) : (year || 2026);
        const duration = data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : '2h 15m';

        return {
          success: true,
          title: data.Title || cleanTitle,
          original_title: data.Title || cleanTitle,
          overview: data.Plot && data.Plot !== 'N/A' ? data.Plot : 'High quality stream loaded live from 7TB Google Drive cloud repository.',
          poster_url: posterUrl,
          backdrop_url: posterUrl,
          rating: rating,
          duration: duration,
          release_year: releaseYear,
          genres: genres
        };
      }
    }
  } catch (e) {}

  // 3. Fallback to Dynamic SVG Poster tailored specifically to cleanTitle
  const dynamicPoster = generateDynamicSVGPoster(cleanTitle);

  return {
    success: true,
    title: cleanTitle,
    original_title: cleanTitle,
    overview: 'High quality stream loaded live from 7TB Google Drive cloud repository.',
    poster_url: dynamicPoster,
    backdrop_url: dynamicPoster,
    rating: 7.5,
    duration: '2h 15m',
    release_year: year || 2026,
    genres: ['Action', 'Drama']
  };
}

// 7. Main Execution Pipeline — Multi-Quality Grouped Sync Engine
async function syncDriveToSupabase() {
  console.log('\n======================================================================');
  console.log('  🚀 SMD PRIME - INTELLIGENT DRIVE TO SUPABASE SYNC ENGINE');
  console.log('======================================================================\n');

  const token = await getGoogleDriveAccessToken();
  const driveFiles = await fetchGoogleDriveFiles(token);

  if (driveFiles.length === 0) {
    console.log('⚠️ No video files retrieved from Google Drive.');
    return;
  }

  console.log(`Found ${driveFiles.length} file(s) in Google Drive folder.\n`);

  const moviesGrouped = {};
  for (const file of driveFiles) {
    // Skip multi-part split archive chunks (.part001, .part002, Part 1, Part 2)
    if (/\.part\d+/i.test(file.name) || /\bpart\s*\d+/i.test(file.name) || /\bpart\d+/i.test(file.name) || /\bpt\s*\d+/i.test(file.name)) {
      console.log(`⏩ [PART FILE SKIPPED] : "${file.name}"`);
      continue;
    }

    const rawSizeBytes = Number(file.size) || 0;
    const { cleanTitle, year, quality, audioLangs, uid } = parseAndSanitizeFileName(file.name, rawSizeBytes);
    
    // Log Sanitization Diff
    console.log(`[RAW FILENAME]  : "${file.name}"`);
    console.log(`[CLEAN TITLE]   : "${cleanTitle}" (Year: ${year || 'N/A'} | Quality: ${quality} | Audios: ${audioLangs.join(', ')})`);
    console.log(`[MOVIE UID]     : ${uid}\n----------------------------------------------------------------------`);

    if (!moviesGrouped[uid]) {
      moviesGrouped[uid] = { cleanTitle, year, uid, allAudioLangs: new Set(), sources: [] };
    }
    
    audioLangs.forEach(l => moviesGrouped[uid].allAudioLangs.add(l));

    const exists = moviesGrouped[uid].sources.some(s => s.drive_file_id === file.id);
    if (!exists) {
      const formattedSize = rawSizeBytes > 0 
        ? (rawSizeBytes >= 1024 * 1024 * 1024 
            ? `${(rawSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
            : `${Math.round(rawSizeBytes / (1024 * 1024))} MB`)
        : '1.2 GB';

      moviesGrouped[uid].sources.push({
        quality,
        drive_file_id: file.id,
        file_size: formattedSize,
        audio_languages: audioLangs,
        rawSizeBytes
      });
    }
  }

  const uniqueMovieKeys = Object.keys(moviesGrouped);
  console.log(`\nGrouped ${driveFiles.length} raw file(s) into ${uniqueMovieKeys.length} clean movie record(s).\n`);

  // ⚡ 2026 Modern High-ROI Smart Diff Pre-Fetch
  console.log('⚡ Pre-fetching existing sync state from Supabase for zero-latency diff comparison...');
  const { data: existingSources } = await supabase.from('movie_sources').select('drive_file_id, movie_uid, quality');
  const existingFileIdSet = new Set((existingSources || []).map(s => s.drive_file_id));
  const existingMovieQualitySet = new Set((existingSources || []).map(s => `${s.movie_uid}_${s.quality}`));

  const { data: existingMovies } = await supabase.from('movies').select('uid');
  const existingMovieUidSet = new Set((existingMovies || []).map(m => m.uid));

  console.log(`Found ${existingFileIdSet.size} already synced source record(s) & ${existingMovieUidSet.size} existing movie record(s) in Supabase.`);

  const summary = [];
  let skippedCount = 0;
  let pushedCount = 0;

  for (const uid of uniqueMovieKeys) {
    const movieGroup = moviesGrouped[uid];

    // Check if all file sources for this movie already exist in Supabase
    const unsyncedSources = movieGroup.sources.filter(src => 
      !existingFileIdSet.has(src.drive_file_id) && !existingMovieQualitySet.has(`${uid}_${src.quality}`)
    );
    const isMovieInDb = existingMovieUidSet.has(uid);

    if (unsyncedSources.length === 0 && isMovieInDb) {
      // 🚀 TIME SAVER: O(1) Instant Skip for already synced movies!
      skippedCount += movieGroup.sources.length;
      continue;
    }

    console.log(`\n✨ [NEW MEDIA DETECTED] Syncing: "${movieGroup.cleanTitle}" (${movieGroup.year || '2026'})`);
    const meta = await fetchMetadata(movieGroup.cleanTitle, movieGroup.year);

    // Upsert into Supabase 'movies' table
    const { error: mErr } = await supabase.from('movies').upsert({
      uid,
      title: meta.title,
      original_title: meta.original_title,
      overview: meta.overview,
      poster_url: meta.poster_url,
      backdrop_url: meta.backdrop_url,
      release_year: meta.release_year,
      rating: meta.rating,
      genres: meta.genres
    }, { onConflict: 'uid' });

    if (mErr) {
      console.error(`✖ Movie Push Failed [${meta.title}]:`, mErr.message);
    } else {
      console.log(`✨ Movie Record Pushed: "${meta.title}" (${meta.release_year}) -> Poster: ${meta.poster_url.substring(0, 45)}...`);
    }

      let saCounter = 1;
      for (const src of movieGroup.sources) {
        if (existingFileIdSet.has(src.drive_file_id)) continue;
        const saIndex = (saCounter % 20) + 1;
        saCounter++;

        let { error: sErr } = await supabase.from('movie_sources').upsert({
          movie_uid: uid,
          quality: src.quality,
          drive_file_id: src.drive_file_id,
          file_size: src.file_size,
          audio_languages: src.audio_languages || ['Tamil'],
          sa_account_index: saIndex
        }, { onConflict: 'drive_file_id' });

      if (sErr) {
        const { error: insErr } = await supabase.from('movie_sources').insert({
          movie_uid: uid,
          quality: src.quality,
          drive_file_id: src.drive_file_id,
          file_size: src.file_size,
          audio_languages: src.audio_languages || ['Tamil'],
          sa_account_index: 1
        });
        sErr = insErr;
      }
      pushedCount++;
    }

    summary.push({
      Title: meta.title,
      Year: meta.release_year,
      Rating: `${meta.rating} ★`,
      Duration: meta.duration,
      PosterSource: meta.poster_url.startsWith('data:') ? 'DYNAMIC_SVG' : 'AUTHENTIC_HD',
      Status: mErr ? 'FAILED' : 'PUSHED'
    });
  }

  console.log('\n======================================================================');
  console.log('  ⚡ SMART INCREMENTAL SYNC SUMMARY');
  console.log('======================================================================');
  if (summary.length > 0) {
    console.table(summary);
  }
  console.log(`⏩ Skipped (Already Synced) : ${skippedCount} file(s)`);
  console.log(`✨ Newly Pushed to Supabase  : ${pushedCount} file(s)`);
  console.log('✅ Smart Drive-to-Supabase Incremental Sync Finished!\n');
}

syncDriveToSupabase();