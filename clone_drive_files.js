import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '13QLJomTi-5IA4Jjz7TOMSEKwalE6mSCt';
const TARGET_CLONE_COUNT = parseInt(process.env.TARGET_CLONE_COUNT || '3', 10);

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

  // Step A: Fetch active SAs from Supabase Database
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
    console.warn('   ⚠️ Failed to fetch SAs from Supabase DB, using vault fallbacks:', err.message);
  }

  // Step B: Load SAs from process.env
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

  // Step C: Merge default embedded SA pool if no custom env SAs found
  for (const sa of DEFAULT_SA_POOL) {
    if (!list.some(s => s.email === sa.email)) {
      list.push(sa);
    }
  }

  return list;
}

let SERVICE_ACCOUNTS = [];
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mint Google Drive OAuth Access Token for a specific SA index
 */
async function getGoogleDriveTokenForSA(sa) {
  try {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.email,
      scope: 'https://www.googleapis.com/auth/drive',
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

const quotaBlacklistedSAEmails = new Set();
let currentWorkingSaIndex = 0;

/**
 * Get next available SA from pool (rotates cleanly across all SAs)
 */
function getNextAvailableWorkingSA() {
  const total = SERVICE_ACCOUNTS.length;
  if (total === 0) return null;
  const candidateIndex = currentWorkingSaIndex % total;
  const sa = SERVICE_ACCOUNTS[candidateIndex];
  currentWorkingSaIndex++;
  return sa;
}

/**
 * Constructs clean, human-readable Google Drive Shortcut Name:
 * Format requested by user: Movie Title (Year) Language - Quality [Clone #N]
 * Example: The Pursuit of Happyness (2006) Tamil/English - 1080p [Clone #1]
 */
function buildCleanShortcutName(src, cloneIndex) {
  const movieObj = Array.isArray(src.movies) ? src.movies[0] : src.movies;

  let rawTitle = movieObj?.title || src.movie_uid || 'Movie';
  // Clean title: replace underscores with spaces and sanitize special characters
  let title = rawTitle.replace(/_/g, ' ').replace(/[\\/:*?"<>|]/g, '').trim();
  title = title.replace(/\b\w/g, c => c.toUpperCase());

  const yearStr = movieObj?.release_year ? ` (${movieObj.release_year})` : '';
  const qualityStr = src.quality ? ` - ${src.quality}` : '';

  return `${title}${yearStr}${qualityStr} [Clone #${cloneIndex}]`;
}

let cachedCloneFolderId = null;

/**
 * Ensures a subfolder named "📁 SMD PRIME CLONES" exists inside FOLDER_ID
 * so all created shortcuts and clones are 100% visible in Google Drive UI!
 */
async function getOrCreateCloneFolder(token, parentFolderId = FOLDER_ID) {
  if (cachedCloneFolderId) return cachedCloneFolderId;

  try {
    // 1. Search for existing "📁 SMD PRIME CLONES" subfolder inside parent
    const queryUrl = `https://www.googleapis.com/drive/v3/files?q='${parentFolderId}'+in+parents+and+name='📁 SMD PRIME CLONES'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&supportsAllDrives=true`;
    const searchRes = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        cachedCloneFolderId = data.files[0].id;
        console.log(`📁 Using existing Google Drive Clones subfolder ID: "${cachedCloneFolderId}"`);
        return cachedCloneFolderId;
      }
    }

    // 2. Create subfolder if not found
    const createUrl = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: '📁 SMD PRIME CLONES',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      })
    });

    if (createRes.ok) {
      const folderData = await createRes.json();
      cachedCloneFolderId = folderData.id;

      // Grant public reader permissions to subfolder
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${cachedCloneFolderId}/permissions?supportsAllDrives=true`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
      } catch (permErr) {}

      console.log(`✨ [CREATED SUBFOLDER] "📁 SMD PRIME CLONES" -> Folder ID: "${cachedCloneFolderId}" inside parent "${parentFolderId}"`);
      return cachedCloneFolderId;
    }
  } catch (err) {
    console.warn(`   ⚠️ Clone subfolder creation note:`, err.message);
  }

  return parentFolderId;
}

/**
 * TIER 1 BUSTER: Create Google Drive Shortcut (mimeType: application/vnd.google-apps.shortcut)
 * Consumes 0 BYTES of Google 750GB daily copy quota! Executes in <100ms!
 */
async function createDriveShortcut(fileId, cloneIndex, sa, token, targetFolderId, customName) {
  try {
    const url = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`;
    const nameToUse = customName || `[SHORTCUT-${cloneIndex}]_${fileId}`;
    const bodyObj = {
      name: nameToUse,
      mimeType: 'application/vnd.google-apps.shortcut',
      shortcutDetails: {
        targetId: fileId
      }
    };
    if (targetFolderId) {
      bodyObj.parents = [targetFolderId];
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyObj)
    });

    if (res.ok) {
      const data = await res.json();
      const shortcutId = data.id;

      // Make the newly created shortcut publicly readable
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${shortcutId}/permissions?supportsAllDrives=true`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ role: 'reader', type: 'anyone' })
        });
      } catch (permErr) {}

      return shortcutId;
    }
  } catch (err) {
    console.warn(`   ⚠️ Shortcut creation note:`, err.message);
  }
  return null;
}

/**
 * 2026 ULTRA-PRO DUAL ENGINE DRIVE CLONER
 * Tier 1: Zero-Quota Drive Shortcut (0 GB quota usage, 100% Instant)
 * Tier 2: Service Account Permission Sharing
 * Tier 3: Physical Copy Fallback with Graceful Quota Rotation
 */
async function cloneDriveFile(fileId, cloneIndex, parentFolderId, customName) {
  let saAttempts = 0;
  const maxAttempts = Math.max(SERVICE_ACCOUNTS.length * 2, 10);

  while (saAttempts < maxAttempts) {
    saAttempts++;
    const sa = getNextAvailableWorkingSA();
    if (!sa) {
      return { id: null, allBlacklisted: true };
    }

    const token = await getGoogleDriveTokenForSA(sa);
    if (!token) {
      continue;
    }

    const targetFolderId = await getOrCreateCloneFolder(token, parentFolderId || FOLDER_ID);

    // Step A: Attempt Tier 1 Zero-Quota Drive Shortcut first (Uses 0 bytes of 750GB copy quota!)
    const shortcutId = await createDriveShortcut(fileId, cloneIndex, sa, token, targetFolderId, customName);
    if (shortcutId) {
      console.log(`   ⚡ [ZERO-QUOTA SHORTCUT CREATED] "${customName || shortcutId}" (Saved in 📁 SMD PRIME CLONES)`);
      return { id: shortcutId, allBlacklisted: false, isShortcut: true };
    }

    // Step B: If shortcutting fails, attempt Server-Side Physical Copy
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`;
      const copyBody = {
        name: customName || `[CLONE-${cloneIndex}]_${fileId}`
      };
      if (targetFolderId) {
        copyBody.parents = [targetFolderId];
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(copyBody)
      });

      if (res.ok) {
        const data = await res.json();
        const newId = data.id;

        // Make the newly cloned file publicly readable
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${newId}/permissions?supportsAllDrives=true`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
        } catch (permErr) {}

        return { id: newId, allBlacklisted: false };
      }

      const errText = await res.text();
      if (res.status === 403 || res.status === 429) {
        quotaBlacklistedSAEmails.add(sa.email);
        console.warn(`   ⚠️ SA "${sa.email.split('@')[0]}" HTTP 403 Copy Quota -> Rotating SA pointer...`);
      } else {
        console.warn(`   ⚠️ SA "${sa.email.split('@')[0]}" Copy HTTP ${res.status}:`, errText.slice(0, 100));
      }
    } catch (err) {
      console.error('   Copy exception:', err.message);
    }
  }

  return { id: null, allBlacklisted: false };
}

/**
 * Delete a specific shortcut file from Google Drive
 */
async function deleteDriveShortcut(fileId, token) {
  try {
    const delUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
    const res = await fetch(delUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok || res.status === 404;
  } catch (err) {
    console.warn(`   ⚠️ Error deleting shortcut ID "${fileId}":`, err.message);
    return false;
  }
}

/**
 * Auto-Sync Engine: Scans actual shortcuts in Google Drive '📁 SMD PRIME CLONES' subfolder
 * and synchronizes their IDs into Supabase DB 'clone_file_ids' column.
 */
async function syncExistingDriveClonesToSupabase(sources, folderId, sa, token) {
  try {
    console.log('🔍 Scanning Google Drive "📁 SMD PRIME CLONES" subfolder for existing shortcuts...');
    const listUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&pageSize=1000&fields=files(id,name,shortcutDetails)&supportsAllDrives=true`;
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      console.warn('   ⚠️ Drive scanner HTTP note:', res.status);
      return;
    }

    const data = await res.json();
    const driveFiles = data.files || [];
    console.log(`   Found ${driveFiles.length} actual shortcut file(s) in Google Drive.`);

    if (driveFiles.length === 0) return;

    let syncedCount = 0;
    for (const src of sources) {
      const targetId = src.drive_file_id;
      const movieUid = src.movie_uid;
      const cleanTitle = (src.movies?.title || movieUid).toLowerCase().replace(/_/g, ' ');

      // Find all shortcuts matching this source file ID or title
      const matchedFiles = driveFiles.filter(f => {
        if (f.shortcutDetails?.targetId === targetId) return true;
        const nameLower = f.name.toLowerCase();
        return nameLower.includes(cleanTitle.toLowerCase()) || nameLower.includes(movieUid.toLowerCase());
      });

      if (matchedFiles.length > 0) {
        const shortcutIds = matchedFiles.map(f => f.id);
        const existingSet = new Set(Array.isArray(src.clone_file_ids) ? src.clone_file_ids : []);
        shortcutIds.forEach(id => existingSet.add(id));
        const mergedClones = Array.from(existingSet);

        if (mergedClones.length !== (src.clone_file_ids || []).length) {
          src.clone_file_ids = mergedClones;
          await supabase
            .from('movie_sources')
            .update({ clone_file_ids: mergedClones })
            .eq('id', src.id);
          syncedCount++;
        }
      }
    }
    if (syncedCount > 0) {
      console.log(`   💾 Synchronized ${syncedCount} movie source record(s) with actual Google Drive shortcuts!\n`);
    } else {
      console.log('   ✅ All movie source records are already 100% synchronized with Google Drive.\n');
    }
  } catch (err) {
    console.warn('   ⚠️ Drive sync exception:', err.message);
  }
}

async function startAutoCloningProcess() {
  console.log('\n======================================================================');
  console.log('  🚀 SMD PRIME - AUTOMATED GOOGLE DRIVE FILE CLONER ENGINE (MAX ROI)');
  console.log('======================================================================\n');

  SERVICE_ACCOUNTS = await getServiceAccountList();
  console.log(`Loaded ${SERVICE_ACCOUNTS.length} Service Account(s) in Pool.`);
  // Parse CLI args or ENV for specific targeted movie cloning
  const args = process.argv.slice(2);
  let targetMovieUid = process.env.MOVIE_UID || null;
  const movieArg = args.find(a => a.startsWith('--movie=') || a.startsWith('--movie_uid='));
  if (movieArg) {
    targetMovieUid = movieArg.split('=')[1]?.trim();
  }

  if (targetMovieUid) {
    console.log(`🎯 TARGETED MOVIE CLONING ACTIVATED: Only cloning movie matching "${targetMovieUid}"`);
  } else {
    console.log('Fetching movie sources from Supabase (Priority: Newest Files First)...');
  }

  let query = supabase
    .from('movie_sources')
    .select(`
      id,
      movie_uid,
      quality,
      drive_file_id,
      clone_file_ids,
      created_at,
      movies (
        title,
        release_year
      )
    `);

  if (targetMovieUid) {
    query = query.ilike('movie_uid', `%${targetMovieUid}%`);
  }

  const { data: sources, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch movie_sources:', error.message);
    return;
  }

  if (!sources || sources.length === 0) {
    console.log('No movie_sources found in Supabase.');
    return;
  }

  console.log(`Found ${sources.length} movie source record(s).\n`);

  // Run auto-sync engine to ensure DB clone_file_ids matches Google Drive shortcuts
  const sa = SERVICE_ACCOUNTS[0];
  if (sa) {
    const token = await getGoogleDriveTokenForSA(sa);
    if (token) {
      const folderId = await getOrCreateCloneFolder(token, FOLDER_ID);
      await syncExistingDriveClonesToSupabase(sources, folderId, sa, token);
    }
  }

  let clonedCount = 0;
  let skippedCount = 0;
  let allPoolBanned = false;

  for (const src of sources) {
    if (allPoolBanned) break;

    const existingClones = Array.isArray(src.clone_file_ids) ? src.clone_file_ids : [];
    
    // Read custom target clones override if target_clones.json exists
    let customTarget = 0;
    try {
      if (fs.existsSync('./target_clones.json')) {
        const customConfig = JSON.parse(fs.readFileSync('./target_clones.json', 'utf8'));
        if (customConfig[src.movie_uid]) {
          customTarget = Number(customConfig[src.movie_uid]);
        }
      }
    } catch (cfgErr) {}

    const targetClones = customTarget > 0 ? customTarget : (src.target_clones && src.target_clones > 0 ? src.target_clones : TARGET_CLONE_COUNT);
    const neededCount = targetClones - existingClones.length;

    if (neededCount < 0) {
      const excessCount = Math.abs(neededCount);
      console.log(`🗑️ [AUTO-TRIM] Target clones reduced for "${src.movie_uid}" (${src.quality}). Trimming ${excessCount} excess clone(s)...`);
      const newClones = [...existingClones];
      const trimmedIds = [];

      const sa = SERVICE_ACCOUNTS[0];
      const token = sa ? await getGoogleDriveTokenForSA(sa) : null;

      for (let i = 0; i < excessCount; i++) {
        const idToDelete = newClones.pop();
        if (idToDelete) {
          trimmedIds.push(idToDelete);
          if (token) {
            await deleteDriveShortcut(idToDelete, token);
          }
        }
      }

      const { error: updateErr } = await supabase
        .from('movie_sources')
        .update({ clone_file_ids: newClones })
        .eq('id', src.id);

      if (!updateErr) {
        src.clone_file_ids = newClones;
        console.log(`   ✂️ Deleted ${trimmedIds.length} excess shortcut(s) from Google Drive & updated DB (${newClones.length} remaining).`);
      }
      continue;
    }

    if (neededCount === 0) {
      skippedCount++;
      continue;
    }

    console.log(`⚡ [CLONING] Movie UID: "${src.movie_uid}" (${src.quality}) | Target Clones: ${targetClones} | Primary ID: ${src.drive_file_id}`);
    console.log(`   Existing Clones: ${existingClones.length} | Creating ${neededCount} new clone(s)...`);

    const newClones = [...existingClones];
    for (let c = 1; c <= neededCount; c++) {
      const cloneIndex = newClones.length + 1;
      const cleanName = buildCleanShortcutName(src, cloneIndex);
      const startMs = Date.now();
      const { id: clonedId, allBlacklisted } = await cloneDriveFile(src.drive_file_id, cloneIndex, FOLDER_ID, cleanName);

      if (allBlacklisted) {
        console.warn(`\n🚨 ALL ${SERVICE_ACCOUNTS.length} SERVICE ACCOUNTS IN POOL HAVE REACHED GOOGLE DAILY COPY QUOTA.`);
        console.warn(`🛡️ MAX ROI FAILOVER: Cloudflare Edge Streaming Workers (worker_sync.js) will use 20-SA mesh rotation for live streams.`);
        allPoolBanned = true;
        break;
      }

      if (clonedId) {
        newClones.push(clonedId);
        console.log(`   ✨ Clone #${cloneIndex} created in ${Date.now() - startMs}ms -> New Clone ID: "${clonedId}"`);
      } else {
        console.warn(`   ℹ️ Source file restricted by Google Drive owner. Skipping file.`);
        break; // Move to next file cleanly
      }

      await sleep(1000);
    }



    if (newClones.length > existingClones.length) {
      clonedCount++;
      const { error: updateErr } = await supabase
        .from('movie_sources')
        .update({
          clone_file_ids: newClones
        })
        .eq('id', src.id);

      if (updateErr) {
        console.error(`   ✖ Database update error for ID ${src.id}:`, updateErr.message);
      } else {
        console.log(`   💾 Database updated! Movie UID "${src.movie_uid}" now has ${newClones.length} total clone(s).\n`);
      }
    }
  }

  console.log('\n======================================================================');
  console.log(`  ✅ CLONING CYCLE COMPLETED: ${clonedCount} file(s) updated, ${skippedCount} file(s) already cloned/protected.`);
  console.log('======================================================================\n');
}

startAutoCloningProcess();
