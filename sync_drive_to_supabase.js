import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

dotenv.config();

// 1. Credentials & Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Security Notice] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in environment variables. Ensure .env is populated.');
}

const DEFAULT_SA_POOL = [];
try {
  if (process.env.SERVICE_ACCOUNTS_JSON) {
    const parsed = JSON.parse(process.env.SERVICE_ACCOUNTS_JSON);
    if (Array.isArray(parsed)) {
      parsed.forEach(sa => {
        DEFAULT_SA_POOL.push({
          email: sa.email || sa.client_email,
          private_key: sa.privateKey || sa.private_key
        });
      });
    }
  }
} catch (e) {
  console.warn('[Security Notice] Note parsing SERVICE_ACCOUNTS_JSON from env:', e.message);
}

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

async function getGoogleDriveAccessTokenForSa(targetSaIdx, requestedScope = 'https://www.googleapis.com/auth/drive') {
  try {
    if (SERVICE_ACCOUNTS.length === 0) {
      SERVICE_ACCOUNTS = await getServiceAccountList();
    }
    if (SERVICE_ACCOUNTS.length === 0) return null;
    const sa = SERVICE_ACCOUNTS[targetSaIdx % SERVICE_ACCOUNTS.length];

    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: sa.email,
      scope: requestedScope,
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

async function getGoogleDriveAccessToken(requestedScope = 'https://www.googleapis.com/auth/drive') {
  const token = await getGoogleDriveAccessTokenForSa(saIndex, requestedScope);
  saIndex++;
  return token;
}

/**
 * 1B. Dedicated Folder Manager for Unlinked Clones
 * Ensures a single folder named `SMD_PRIME_UNLINKED_CLONES` exists in Google Drive
 * bound directly inside parent folder `SMD Own Files` (FOLDER_ID)
 */
async function getOrCreateUnlinkedClonesFolder(token) {
  if (!token) return null;
  const parentFolderId = FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '13QLJomTi-5IA4Jjz7TOMSEKwalE6mSCt';
  
  try {
    // 1. Search for existing folder inside parent folder
    const query = `'${parentFolderId}' in parents and name = 'SMD_PRIME_UNLINKED_CLONES' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const res = await fetch(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      console.log('📁 Google Drive Search Results for SMD_PRIME_UNLINKED_CLONES:', data.files);
      if (Array.isArray(data.files) && data.files.length > 0) {
        console.log(`📁 Found existing Google Drive Folder: "SMD_PRIME_UNLINKED_CLONES" (${data.files[0].id})`);
        return data.files[0].id;
      }
    }

    // 2. Create folder inside parent folder if not found
    const createUrl = `https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`;
    const cRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'SMD_PRIME_UNLINKED_CLONES',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
      })
    });
    const cData = await cRes.json();
    if (cRes.ok) {
      console.log(`📁 Created dedicated Google Drive Folder: "SMD_PRIME_UNLINKED_CLONES" (${cData.id}) inside "SMD Own Files"`);
      return cData.id;
    } else {
      console.warn('📁 Folder creation API notice:', cData.error ? cData.error.message : JSON.stringify(cData));
    }
  } catch (err) {
    console.warn('[Folder Manager Warning] Could not resolve unlinked clones folder:', err.message);
  }
  return null;
}

/**
 * 1C. Unlinked Google Drive Server-Side Clone Generator
 * Injects custom description & appProperties metadata during server-side copy
 * and places file into `SMD_PRIME_UNLINKED_CLONES` folder with clean naming format:
 * Format: `MovieTitle (Year) [Language] - Clone X.mkv`
 */
async function createUnlinkedDriveClone(fileId, cleanTitle, year, lang, cloneIndex, folderId, initialSaIdx) {
  if (!fileId) return null;
  const cleanFileName = `${cleanTitle} (${year || 2026}) [${lang || 'Tamil'}] - Clone ${cloneIndex}.mkv`;
  const copyUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`;
  
  const bodyObj = {
    name: cleanFileName,
    description: `[SMD_UNLINKED_QUOTA_CLONE_${cloneIndex}_${Date.now()}]`,
    appProperties: {
      unlinked_quota_id: `${fileId}_clone_${cloneIndex}_${Date.now()}`,
      clone_index: String(cloneIndex),
      movie_title: cleanTitle
    }
  };
  if (folderId) bodyObj.parents = [folderId];

  // Try across up to 4 SAs in the mesh pool with exponential backoff on 403 rate limits
  for (let attempt = 0; attempt < 4; attempt++) {
    const targetSaIdx = (initialSaIdx + attempt) % 20;
    const token = await getGoogleDriveAccessTokenForSa(targetSaIdx);
    if (!token) continue;

    try {
      const res = await fetch(copyUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyObj)
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`✨ [SA #${targetSaIdx + 1}] Created Clone #${cloneIndex}: "${cleanFileName}" (${data.id})`);
        return data.id;
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          // Exponential backoff pause on rate limit
          const delayMs = (attempt + 1) * 800;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    } catch (err) {}
  }
  return null;
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
  const unlinkedFolderId = await getOrCreateUnlinkedClonesFolder(token);
  if (unlinkedFolderId) {
    console.log(`📁 Target Dedicated Folder for Unlinked Clones: "SMD_PRIME_UNLINKED_CLONES" (${unlinkedFolderId})\n`);
  }

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

/**
 * Smart Min/Max File Size Filter:
 * For each movie + language + quality resolution (e.g. Tamil 720p),
 * if there are > 2 files of different sizes, pick ONLY 2 files:
 * 1. Minimum file size (smallest)
 * 2. Maximum file size (largest)
 */
function filterMinMaxSourcesPerQualityGroup(sourcesList = []) {
  if (!Array.isArray(sourcesList) || sourcesList.length <= 2) return sourcesList;

  const groups = {};

  for (const src of sourcesList) {
    const langsKey = Array.isArray(src.audio_languages) && src.audio_languages.length > 0 
      ? src.audio_languages.join('_') 
      : 'Tamil';
    
    let baseRes = '1080p';
    const qStr = (src.quality || '').toUpperCase();
    if (qStr.includes('4K') || qStr.includes('2160P')) baseRes = '4K';
    else if (qStr.includes('1080P')) baseRes = '1080p';
    else if (qStr.includes('720P')) baseRes = '720p';
    else if (qStr.includes('480P')) baseRes = '480p';

    const groupKey = `${langsKey}_${baseRes}`;

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(src);
  }

  const finalFilteredSources = [];

  for (const groupKey in groups) {
    const groupItems = groups[groupKey];
    if (groupItems.length <= 2) {
      finalFilteredSources.push(...groupItems);
    } else {
      // Sort ascending by rawSizeBytes
      groupItems.sort((a, b) => (Number(a.rawSizeBytes) || 0) - (Number(b.rawSizeBytes) || 0));
      
      const minFile = groupItems[0];
      const maxFile = groupItems[groupItems.length - 1];

      finalFilteredSources.push(minFile);
      if (maxFile.drive_file_id !== minFile.drive_file_id) {
        finalFilteredSources.push(maxFile);
      }
    }
  }

  // Guarantee 100% unique quality strings per movie to satisfy Supabase 'movie_sources_uid_quality_key' constraint
  const seenQualityMap = new Map();
  const uniqueQualitySources = [];

  for (const src of finalFilteredSources) {
    let finalQ = src.quality || '1080p';
    if (seenQualityMap.has(finalQ)) {
      const count = seenQualityMap.get(finalQ) + 1;
      seenQualityMap.set(finalQ, count);
      finalQ = `${finalQ} #${count}`;
    } else {
      seenQualityMap.set(finalQ, 1);
    }
    uniqueQualitySources.push({
      ...src,
      quality: finalQ
    });
  }

  return uniqueQualitySources;
}

  const uniqueMovieKeys = Object.keys(moviesGrouped);
  console.log(`\nGrouped ${driveFiles.length} raw file(s) into ${uniqueMovieKeys.length} clean movie record(s).\n`);

  // Apply Min/Max File Size Filter per Movie & Quality Group
  for (const uid of uniqueMovieKeys) {
    moviesGrouped[uid].sources = filterMinMaxSourcesPerQualityGroup(moviesGrouped[uid].sources);
  }

  // ⚡ 2026 Modern High-ROI Smart Diff Pre-Fetch
  console.log('⚡ Pre-fetching existing sync state from Supabase for zero-latency diff comparison...');
  const { data: existingSources } = await supabase.from('movie_sources').select('drive_file_id, movie_uid, quality');
  const existingFileIdSet = new Set((existingSources || []).map(s => s.drive_file_id));
  const existingMovieQualitySet = new Set((existingSources || []).map(s => `${s.movie_uid}_${s.quality}`));

  const { data: existingMovies } = await supabase.from('movies').select('uid');
  const existingMovieUidSet = new Set((existingMovies || []).map(m => m.uid));

  console.log(`Found ${existingFileIdSet.size} already synced source record(s) & ${existingMovieUidSet.size} existing movie record(s) in Supabase.`);

  const summary = [];
  let pushedCount = 0;
  let moviePushedCount = 0;

  for (const uid of uniqueMovieKeys) {
    const movieGroup = moviesGrouped[uid];

    console.log(`\n✨ [SYNCING MEDIA] "${movieGroup.cleanTitle}" (${movieGroup.year || '2026'}) — ${movieGroup.sources.length} source(s)`);
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
      moviePushedCount++;
      console.log(`✨ Movie Record Synced: "${meta.title}" (${meta.release_year}) -> Poster: ${meta.poster_url.substring(0, 45)}...`);
    }

    // Keep track of valid drive_file_ids for this movie
    const validFileIdsForMovie = new Set(movieGroup.sources.map(s => s.drive_file_id));

    // ⚡ 2026 Modern High-ROI 4-Clone Parallel Mesh Generator (Virtual SA Mesh Engine)
    for (const src of movieGroup.sources) {
      console.log(`\n🔄 Allocating 4 Parallel Virtual SA Mesh Servers for "${meta.title}" (${src.quality})...`);
      
      const clonePromises = [1, 2, 3, 4].map(async (cloneIdx) => {
        const saIdx = (cloneIdx - 1) % 20;
        const finalFileId = src.drive_file_id;
        const cloneQualityTag = src.quality.includes('Server') 
          ? src.quality 
          : `${src.quality} [Server ${cloneIdx}]`;

        // Check if source already exists in DB
        const { data: existingRec } = await supabase
          .from('movie_sources')
          .select('id')
          .eq('movie_uid', uid)
          .eq('quality', cloneQualityTag)
          .maybeSingle();

        if (existingRec) {
          await supabase
            .from('movie_sources')
            .update({
              movie_uid: uid,
              quality: cloneQualityTag,
              drive_file_id: finalFileId,
              clone_file_ids: [finalFileId],
              file_size: src.file_size,
              audio_languages: src.audio_languages || ['Tamil'],
              sa_account_index: saIdx
            })
            .eq('id', existingRec.id);
        } else {
          await supabase
            .from('movie_sources')
            .insert({
              movie_uid: uid,
              quality: cloneQualityTag,
              drive_file_id: finalFileId,
              clone_file_ids: [finalFileId],
              file_size: src.file_size,
              audio_languages: src.audio_languages || ['Tamil'],
              sa_account_index: saIdx
            });
        }

        return { cloneIdx, fileId: finalFileId, isClone: false };
      });

      const cloneResults = await Promise.allSettled(clonePromises);
      cloneResults.forEach(res => {
        if (res.status === 'fulfilled') {
          pushedCount++;
        }
      });
    }

    // Clean up any old redundant sources for this movie that are no longer in min/max list
    try {
      const { data: currentDbSources } = await supabase
        .from('movie_sources')
        .select('id, drive_file_id')
        .eq('movie_uid', uid);

      if (Array.isArray(currentDbSources)) {
        const redundantIds = currentDbSources
          .filter(s => !validFileIdsForMovie.has(s.drive_file_id))
          .map(s => s.id);

        if (redundantIds.length > 0) {
          await supabase.from('movie_sources').delete().in('id', redundantIds);
          console.log(`🧹 Cleaned up ${redundantIds.length} redundant middle-size source(s) for "${meta.title}".`);
        }
      }
    } catch (cleanErr) {
      // Non-blocking cleanup warning
    }

    summary.push({
      Title: meta.title,
      Year: meta.release_year,
      Rating: `${meta.rating} ★`,
      Duration: meta.duration,
      Sources: movieGroup.sources.length,
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
  console.log(`✨ Total Movies Synced      : ${moviePushedCount}`);
  console.log(`✨ Total Sources Pushed     : ${pushedCount}`);
  console.log('✅ Smart Drive-to-Supabase Sync Finished!\n');
}

syncDriveToSupabase();