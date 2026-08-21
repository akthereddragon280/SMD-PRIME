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

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com';
const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi
HCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM
bmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6
wNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc
zKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA
m8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd
KQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf
qgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj
IbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n
tNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr
YPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL
PRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU
9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW
wbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p
mwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH
8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J
i1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS
Tv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t
hTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy
15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx
2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD
QXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev
fODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF
Kg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu
d6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT
fOPlZNKYGtgFbD+AgdhoQx5MNA==
-----END PRIVATE KEY-----`).replace(/\\n/g, '\n');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 2. Generate Google Drive Access Token
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

  // Step G: Extract Video Quality (Explicit tags or Size-based fallback)
  let quality = null;
  if (/(2160p|4K)/i.test(fullName)) quality = '4K';
  else if (/1080p/i.test(fullName)) quality = '1080p';
  else if (/720p/i.test(fullName)) quality = '720p';
  else if (/480p/i.test(fullName)) quality = '480p';
  else {
    const sizeInMB = Number(fileSizeInBytes) > 0 ? Number(fileSizeInBytes) / (1024 * 1024) : 0;
    if (sizeInMB > 0) {
      if (sizeInMB < 600) quality = '480p';
      else if (sizeInMB >= 600 && sizeInMB < 1800) quality = '720p';
      else quality = '1080p';
    } else {
      quality = '1080p';
    }
  }

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