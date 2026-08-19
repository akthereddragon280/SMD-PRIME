import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { fetchAuthenticTMDBMetadata } from './src/utils/tmdb.js';

dotenv.config();

// Config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '19FJzU-ZrwOOVOmxginGpBMo3YQC1swXM';
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

    for (const file of files) {
      const yearMatch = file.name.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : 2026;

      let quality = '1080p';
      if (file.name.includes('720p')) quality = '720p';
      else if (file.name.includes('480p')) quality = '480p';
      else if (file.name.includes('2160p') || file.name.includes('4K')) quality = '4K';

      let cleanTitle = file.name
        .replace(/www\.\w+\.\w+/g, '')
        .replace(/\(\d{4}\).*/, '')
        .replace(/\b(BluRay|HDRp|HQ|HDRip|WEB-DL|HDR|x264|x265|HEVC|DD\+5\.1|ESub|AAC|Tamil|Tam|Tel|Hin|Eng|mkv|mp4|avi)\b/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/[-_.]/g, ' ')
        .trim();

      const uid = `${cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${year}`;

      const tmdb = await fetchAuthenticTMDBMetadata(cleanTitle, year);

      // Upsert into movies
      await supabase.from('movies').upsert({
        uid,
        title: cleanTitle,
        original_title: tmdb.original_title,
        overview: tmdb.overview,
        poster_url: tmdb.poster_url,
        backdrop_url: tmdb.backdrop_url,
        release_year: tmdb.release_year || year,
        rating: tmdb.rating,
        genres: tmdb.genres
      }, { onConflict: 'uid' });

      // Upsert into movie_sources
      await supabase.from('movie_sources').upsert({
        movie_uid: uid,
        quality,
        drive_file_id: file.id,
        file_size: file.size ? `${Math.round(file.size / (1024 * 1024))} MB` : 'Unknown',
        audio_languages: ['Tam', 'Tel', 'Hin', 'Eng'],
        sa_account_index: 1
      }, { onConflict: 'movie_uid, quality' });
    }

    console.log(`[${new Date().toLocaleTimeString()}] ✅ Sync Pass Complete! (${files.length} files active in Supabase with TMDB metadata)`);
  } catch (err) {
    console.error('Auto sync error:', err.message);
  }
}

// Initial pass & 60-second auto-poll interval
runAutoSyncPass();
setInterval(runAutoSyncPass, 60000);
