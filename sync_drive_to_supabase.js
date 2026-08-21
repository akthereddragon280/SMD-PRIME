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

function getServiceAccountList() {
  const list = [];
  for (let i = 1; i <= 10; i++) {
    const email = process.env[`GOOGLE_SA${i}_EMAIL`];
    const key = process.env[`GOOGLE_SA${i}_PRIVATE_KEY`];
    if (email && key) {
      list.push({ email, private_key: key.replace(/\\n/g, '\n') });
    }
  }
  if (list.length === 0 && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    list.push({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
  }
  return list;
}

const SERVICE_ACCOUNTS = getServiceAccountList();
let saIndex = 0;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 2. Generate Google Drive Access Token
async function getGoogleDriveAccessToken() {
  try {
    const sa = SERVICE_ACCOUNTS[saIndex % SERVICE_ACCOUNTS.length] || {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    };
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
      const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files.filter(f => {
          // Strictly reject folders, documents, images, audio, zips
          if (!f.mimeType || f.mimeType === 'application/vnd.google-apps.folder') return false;

          const isVideoMime = typeof f.mimeType === 'string' && f.mimeType.toLowerCase().startsWith('video/');
          const isVideoExt = /\.(mp4|mkv|avi|mov|webm|flv|m4v|3gp)$/i.test(f.name);

          // Must be video MIME or video Extension
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

  // Step G: Advanced Quality & Codec Detection (e.g. 1080p HEVC, 4K HEVC, 720p x264)
  let codec = null;
  if (/(hevc|x265|h\.?265)/i.test(fullName)) codec = 'HEVC';
  else if (/av1/i.test(fullName)) codec = 'AV1';
  else if (/(x264|h\.?264|avc)/i.test(fullName)) codec = 'x264';
  else if (/(10bit|10-bit)/i.test(fullName)) codec = '10Bit';

  let baseQuality = null;
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
    } else {
      baseQuality = '1080p';
    }
  }

  const quality = codec ? `${baseQuality} ${codec}` : baseQuality;

  // Step H: Extract Audio Codecs & Languages
  const audioLangs = [];
  if (/tam|tamil/i.test(fullName)) audioLangs.push('Tam');
  if (/tel|telugu/i.test(fullName)) audioLangs.push('Tel');
  if (/hin|hindi/i.test(fullName)) audioLangs.push('Hin');
  if (/eng|english/i.test(fullName)) audioLangs.push('Eng');
  if (audioLangs.length === 0) audioLangs.push('Tam', 'Tel', 'Hin', 'Eng');

  // Step I: Isolate Pure Clean Title (Cut off at year or resolution indicator)
  let cleanTitle = name;
  if (yearMatch) {
    cleanTitle = cleanTitle.substring(0, yearMatch.index);
  } else {
    cleanTitle = cleanTitle.replace(/\b(2160p|4K|1080p|720p|480p|HDRip|WEB-DL|BluRay|BRRip|DVDRip|HQ|x264|x265|HEVC)\b.*/i, '');
  }

  // Step J: Strip remaining tags, codecs, channel prefixes, and symbols
  cleanTitle = cleanTitle
    .replace(/^@[A-Za-z0-9_.]+\s*/gi, '')
    .replace(/\b(BluRay|HDRp|HQ|HDRip|WEB-DL|HDR|x264|x265|HEVC|DD\+5\.1|ESub|MSub|AAC|Tamil|Tam|Tel|Hin|Eng|TRUE|S\d+|^EP.*)\b/gi, '')
    .replace(/[-_.:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip residual promo noise words at start
  cleanTitle = cleanTitle.replace(/^(promo|vip|official|hd|hq)\s+/i, '').trim();

  if (!cleanTitle || cleanTitle.length < 2) {
    cleanTitle = fullName.replace(/\.(mkv|mp4|avi)$/i, '').replace(/[-_.]/g, ' ').trim();
  }

  const uid = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year || 2026}`;
  return { cleanTitle, year, quality, audioLangs, uid };
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
    const rawSizeBytes = Number(file.size) || 0;
    const { cleanTitle, year, quality, audioLangs, uid } = parseAndSanitizeFileName(file.name, rawSizeBytes);
    
    // Log Sanitization Diff
    console.log(`[RAW FILENAME]  : "${file.name}"`);
    console.log(`[CLEAN TITLE]   : "${cleanTitle}" (Year: ${year || 'N/A'} | Quality: ${quality} | Audios: ${audioLangs.join(', ')})`);
    console.log(`[MOVIE UID]     : ${uid}\n----------------------------------------------------------------------`);

    if (!moviesGrouped[uid]) {
      moviesGrouped[uid] = { cleanTitle, year, uid, audioLangs, sources: [] };
    }
    
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
        file_size: formattedSize
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

    // Insert/Upsert only NEW quality variants into Supabase 'movie_sources' table
    for (const src of movieGroup.sources) {
      if (existingFileIdSet.has(src.drive_file_id)) continue;

      let { error: sErr } = await supabase.from('movie_sources').upsert({
        movie_uid: uid,
        quality: src.quality,
        drive_file_id: src.drive_file_id,
        file_size: src.file_size,
        audio_languages: movieGroup.audioLangs || ['Tam', 'Tel', 'Hin', 'Eng'],
        sa_account_index: 1
      }, { onConflict: 'movie_uid, quality' });

      if (sErr) {
        const { error: insErr } = await supabase.from('movie_sources').insert({
          movie_uid: uid,
          quality: src.quality,
          drive_file_id: src.drive_file_id,
          file_size: src.file_size,
          audio_languages: movieGroup.audioLangs || ['Tam', 'Tel', 'Hin', 'Eng'],
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