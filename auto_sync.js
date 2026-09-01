import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { fetchAuthenticTMDBMetadata } from './src/utils/tmdb.js';

dotenv.config();

// Config
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Security Notice] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in process.env for auto_sync.js. Ensure .env is loaded.');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key');

async function getGoogleDriveAccessToken() {
  try {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
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
    const signature = signer.sign(GOOGLE_PRIVATE_KEY, 'base64')
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

/**
 * HIGH ROI SMART AUDIO LANGUAGE PARSER
 * Strips website domains/channel handles first so "1TamilMV", "TamilBlasters", "@MoviezTamizha"
 * do NOT trigger false Tamil/Multi-Audio matches.
 */
export function parseAudioLanguagesFromFileName(fullName) {
  // Strip promo site names & handles BEFORE running language keyword regex
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
    return ['Multi Audio'];
  }

  // High ROI Default Fallback: If no language tag is present in filename, default to ["Tamil"]
  if (audioLangs.length === 0) {
    return ['Tamil'];
  }

  return audioLangs;
}

function parseAndSanitizeFileName(fullName, fileSizeInBytes) {
  let name = fullName.trim();
  name = name.replace(/\.(mkv|mp4|avi|mov|flv|webm)$/i, '');
  name = name.replace(/^Copy\s*(\(\d+\))?\s*of\s+/i, '');
  name = name.replace(/^@[A-Za-z0-9_.\s]+?[-:]\s*/i, ''); 
  name = name.replace(/^@[A-Za-z0-9_.\s]{2,40}\s{2,}/i, '');
  name = name.replace(/^@[A-Za-z0-9_.]+\s*/i, '');
  name = name.replace(/^(https?:\/\/)?(www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,6}(\.[A-Za-z]{2,4})?\s*[-:_]*\s*/i, '');

  const yearMatch = name.match(/\b(19\d\d|20[0-3]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  let quality = '1080p';
  if (/(2160p|4K)/i.test(fullName)) quality = '4K';
  else if (/1080p/i.test(fullName)) quality = '1080p';
  else if (/720p/i.test(fullName)) quality = '720p';
  else if (/480p/i.test(fullName)) quality = '480p';

  // Use smart language parser
  const audioLangs = parseAudioLanguagesFromFileName(fullName);

  let cleanTitle = name;
  if (yearMatch) {
    cleanTitle = cleanTitle.substring(0, yearMatch.index);
  } else {
    cleanTitle = cleanTitle.replace(/\b(2160p|4K|1080p|720p|480p|HDRip|WEB-DL|BluRay|BRRip|DVDRip|HQ|x264|x265|HEVC)\b.*/i, '');
  }

  cleanTitle = cleanTitle
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(BluRay|HDRp|HQ|HDRip|WEB-DL|HDR|x264|x265|HEVC|DD\+5\.1|ESub|MSub|AAC|Tamil|Tam|Telugu|Tel|Hindi|Hin|Kannada|Kan|Malayalam|Mal|English|Eng|Multi|Dual|Audio|TRUE|S\d+|^EP.*)\b/gi, '')
    .replace(/[-_.:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  cleanTitle = cleanTitle.replace(/^(promo|vip|official|hd|hq)\s+/i, '').trim();

  if (!cleanTitle || cleanTitle.length < 2) {
    cleanTitle = fullName.replace(/\.(mkv|mp4|avi)$/i, '').replace(/[-_]/g, ' ').trim();
  }

  // Multilingual Canonical Title Aliasing & Normalization
  let normalizedTitle = cleanTitle;
  const titleLower = cleanTitle.toLowerCase();

  if (titleLower.includes('jana nayakudu') || titleLower.includes('jana nayagan')) {
    normalizedTitle = 'Jana Nayagan';
  } else if (titleLower.includes('guntur kaaram') || titleLower.includes('guntur karam')) {
    normalizedTitle = 'Guntur Kaaram';
  } else if (titleLower.includes('devara')) {
    normalizedTitle = 'Devara';
  }

  let codec = 'H264';
  if (/(hevc|x265|h\.?265)/i.test(fullName)) codec = 'HEVC';
  else if (/(x264|h\.?264|avc)/i.test(fullName)) codec = 'H264';

  const size_gb = fileSizeInBytes > 0 ? parseFloat((fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(2)) : 1.5;

  const uid = `${normalizedTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year || 2026}`;
  return { cleanTitle: normalizedTitle, year, quality, audioLangs, video_codec: codec, size_gb, uid };
}

async function runAutoSyncPass() {
  console.log(`[${new Date().toLocaleTimeString()}] ⚡ Checking Google Drive Folder (${FOLDER_ID}) for new uploads...`);

  const token = await getGoogleDriveAccessToken();
  if (!token) return;

  try {
    const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    if (!data.files || data.files.length === 0) return;

    const files = data.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    let fileIndex = 0;
    for (const file of files) {
      fileIndex++;
      const saIndex = (fileIndex % 20) + 1;
      const rawSizeBytes = Number(file.size) || 0;
      const { cleanTitle, year, quality, audioLangs, video_codec, size_gb, uid } = parseAndSanitizeFileName(file.name, rawSizeBytes);

      const tmdb = await fetchAuthenticTMDBMetadata(cleanTitle, year);

      // Upsert into movies
      await supabase.from('movies').upsert({
        uid,
        title: cleanTitle,
        original_title: tmdb.original_title,
        overview: tmdb.overview,
        poster_url: tmdb.poster_url,
        backdrop_url: tmdb.backdrop_url,
        release_year: tmdb.release_year || year || 2026,
        rating: tmdb.rating,
        genres: tmdb.genres
      }, { onConflict: 'uid' });

      // Upsert into movie_sources
      await supabase.from('movie_sources').upsert({
        movie_uid: uid,
        quality,
        video_codec,
        size_gb,
        drive_file_id: file.id,
        file_size: rawSizeBytes > 0 ? `${(rawSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : '1.5 GB',
        audio_languages: audioLangs,
        sa_account_index: saIndex
      }, { onConflict: 'movie_uid, quality' });
    }

    console.log(`[${new Date().toLocaleTimeString()}] ✅ Auto-Sync Complete! (${files.length} clean file(s) synchronized with Supabase)`);
  } catch (err) {
    console.error('Auto sync error:', err.message);
  }
}

// Initial pass & 60-second auto-poll interval
runAutoSyncPass();
setInterval(runAutoSyncPass, 60000);
