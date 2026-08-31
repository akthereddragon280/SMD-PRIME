import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '1uW5X1ta_RsIHEWDe7lARtsYV-0g39E_W';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_SA_POOL = [
  {
    email: "tgstream-bot-1@tgstream-drive-proxy.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDH/ZrgLW4U9Bhi\nHCKkwxrjJ/YhruF9kQONhMbZnvpeHFQb3+Tyc/sv1nrl0XkJ/NhittZ7zTGqQHhM\nbmxs76TWGCi/cK9e5bzO1jj+p/GxY2GnnOBQr3VMVGldpoS/9RrE00dN+RRLbrR6\nwNzWk+zjMNINE7bhKDDBjCzZMzOeJYbzjArls4GcgPYBNOmUDx31s1PSagpBAwzc\nzKJNSmJlDraWrbEvYWRHpgZbVXmfy0Dc+6cOs61Y6NpScHDVPe7lNpnr3HXzW/KA\nm8f04Gd5V+VLBV9aYLPx013S/cvb7/qcKMnwU3VBPTAlsK8TrRdx1JrVXFA1E4Bd\nKQq8Yg5PAgMBAAECggEAD+n3TAVxcAtocU4p15CK8C564H1JBjPm43kAVcrXw2tf\nqgQr9LsT7t+TUfxUNF5BXcGM2bcfT5vntrVGvXhoVnz/qRQvcE65sn/Lc0Ar9GCj\nIbJTCzibDeLdq40XnSrE4YqqbuL2IXaCuA3mxNBqlj2JSW8bK1mGX7Bm1TXE0r2n\ntNDu8bOapl4vt2g+Y+ad8ArC5oDOO+NaVGoDtHGvcBQAeEuKebmLLeIj0Aa8luFr\nYPTyZWvcOwdqeM4dYmiLfYSvCXFtys0NXeJ86KLw71RuD+ox2fSiR6EvvRPmk2SL\nPRx923xjRnMP9tclJuKFht1KnjDhGgwVjStK0dSIOQKBgQDoD/oD/WhPR9RyEdfU\n9gN+QZH+TILiXcbTZ+D2fGFVDlg5F+9nhpmBLeB20/frC1JyofWmxy11578YegKW\nwbdYD55jJ/fwBsPidPhBT3R/2HlzMj1VCIVwDtqKkorn9Rsr/byD+XdjLMIrW3/p\nmwnFHsW5G8lmZYPEpgH+f4+LpQKBgQDcnrdMJBtEsQTGB2tTiuZ4pTjNMICShjtH\n8xAW5/aOs0YAAjQc7RAaG9FbY06ahwViXPonPPUgRwNLud3pwlXyYe6VZyPvTq6J\ni1OrA+Bdhvskw7KAa8BzcOo6RuWtfxmZX7/TGMSqtMoILoX9lCTZAZQ7uxI8ewVS\nTv40x3tf4wKBgQCei6PNrAji+Xk8wdIKrlWuoc/DxLQ7QcSAVN1OqaW5/cXqo96t\nhTlFF3ne1WzxCdg3d02ktzno7v8REvLH2uuPX4RfzEPJmmWkRzQBMu6uFdDMEkvy\n15KK/6rxt7LtTPlWcdGk/QBDIqY6BxZ6HLFtGlwN3t0Xd02yQZTlMnN4/QKBgQCx\n2cEqQHE7DvkqKxD6aB8jYw5HW7JKbKuddPSjgpvgreTgXOZl6zXv1j0Pzx6us+pD\nQXDn8NwrCRQ/F7ctmtxuaURMbLkrUeKiPw9T7ewReZ88JAbiP/sFFSG9mSnOk4ev\nfODG7FCezN+ReO/LXIHX7s3w2P36g7HmiIelRKrQwQKBgQCxydU5F191YOg/G3mF\nKg0ETT8SygNgvM/mLLPX6tr4pR85E5ju35uy56xj0MHfnW+Qg2FcwVhPwQNUcCqu\nd6ddgLdaVx1V7kLqQW0soiGdf3J1bM4JH/rFW1gPcmhBUWLGGQDyyk3eOsK+3CzT\nfOPlZNKYGtgFbD+AgdhoQx5MNA==\n-----END PRIVATE KEY-----\n`
  }
];

/**
 * Load Service Accounts Pool
 */
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
          rawKey = r.sa_json.privateKey || r.sa_json.private_key;
        }
        if (r.client_email && rawKey) {
          list.push({ email: r.client_email, private_key: rawKey });
        }
      });
    }
  } catch (e) {}

  if (list.length === 0) {
    list.push(...DEFAULT_SA_POOL);
  }
  return list;
}

/**
 * OAuth2 Access Token Generator for Service Account
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

/**
 * Delete a specific file from Google Drive
 */
async function deleteDriveFile(fileId, token) {
  try {
    const delUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
    const res = await fetch(delUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.ok || res.status === 404;
  } catch (err) {
    return false;
  }
}

/**
 * Daily Garbage Collector Main Engine
 */
async function startDailyDriveGarbageCollection() {
  console.log('\n======================================================================');
  console.log('  🧹 SMD PRIME - AUTOMATED DAILY GOOGLE DRIVE GARBAGE COLLECTOR');
  console.log('======================================================================\n');

  const saList = await getServiceAccountList();
  if (saList.length === 0) {
    console.error('❌ No Service Accounts found in ./service_accounts directory.');
    return;
  }

  const token = await getGoogleDriveTokenForSA(saList[0]);
  if (!token) {
    console.error('❌ Failed to obtain Google Drive OAuth Token.');
    return;
  }

  console.log('1️⃣ Fetching valid registered File IDs from Supabase DB...');
  const { data: sources, error } = await supabase
    .from('movie_sources')
    .select('drive_file_id, clone_file_ids');

  if (error) {
    console.error('❌ Failed to fetch movie_sources:', error.message);
    return;
  }

  const validFileIdsSet = new Set();
  (sources || []).forEach(src => {
    if (src.drive_file_id) validFileIdsSet.add(src.drive_file_id);
    if (Array.isArray(src.clone_file_ids)) {
      src.clone_file_ids.forEach(cid => {
        if (cid) validFileIdsSet.add(cid);
      });
    }
  });

  console.log(`   Found ${validFileIdsSet.size} valid primary & clone File ID(s) registered in DB.\n`);

  console.log('2️⃣ Scanning Google Drive "📁 SMD PRIME CLONES" subfolder for actual files...');
  const listUrl = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&pageSize=1000&fields=files(id,name,shortcutDetails)&supportsAllDrives=true`;
  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    console.error('❌ Google Drive API scan error:', res.status);
    return;
  }

  const data = await res.json();
  const driveFiles = data.files || [];
  console.log(`   Found ${driveFiles.length} file(s) inside Google Drive folder.\n`);

  let deletedCount = 0;
  let keptCount = 0;

  console.log('3️⃣ Evaluating & Purging Orphaned Files...');
  for (const file of driveFiles) {
    const isShortcutIdValid = validFileIdsSet.has(file.id);
    const isTargetIdValid = file.shortcutDetails?.targetId ? validFileIdsSet.has(file.shortcutDetails.targetId) : false;

    if (isShortcutIdValid || isTargetIdValid) {
      keptCount++;
    } else {
      console.log(`   🗑️ [PURGING ORPHAN] File Name: "${file.name}" | ID: "${file.id}" (Not in DB)`);
      const deleted = await deleteDriveFile(file.id, token);
      if (deleted) {
        deletedCount++;
        console.log(`      ✨ Permanently deleted from Google Drive!`);
      } else {
        console.warn(`      ⚠️ Delete attempt note for ID: "${file.id}"`);
      }
      await sleep(300);
    }
  }

  console.log('\n======================================================================');
  console.log(`  ✅ GARBAGE COLLECTION COMPLETE: ${keptCount} file(s) kept, ${deletedCount} orphan(s) purged.`);
  console.log('======================================================================\n');
}

startDailyDriveGarbageCollection().catch(console.error);
