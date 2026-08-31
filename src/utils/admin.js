import { updateUserAdminStatus } from '../supabaseClient';

// Initial Default Super Admin Telegram User IDs (e.g. 0 for dev localhost)
const ENV_ADMIN_IDS = (import.meta.env?.VITE_ADMIN_TELEGRAM_IDS || '')
  .split(',')
  .map(id => Number(id.trim()))
  .filter(id => !isNaN(id));

const DEFAULT_ADMIN_IDS = Array.from(new Set([0, ...ENV_ADMIN_IDS]));

/**
 * Get current list of Admin Telegram User IDs
 */
export function getAdminUserIds() {
  try {
    const stored = localStorage.getItem('smd_prime_admin_ids');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse admin IDs:', e);
  }
  return DEFAULT_ADMIN_IDS;
}

/**
 * Check if a given Telegram User ID is an Admin
 */
export function isAdminUser(telegramUserId, explicitRole) {
  // 1. Explicit DB/state role is the SINGLE SOURCE OF TRUTH
  if (explicitRole) {
    const norm = String(explicitRole).toLowerCase();
    if (norm === 'vip' || norm === 'premium' || norm === 'normal' || norm === 'user') {
      return false;
    }
    if (norm === 'admin') return true;
  }

  // 2. Check stored admin IDs list
  const idNum = Number(telegramUserId);
  const adminList = getAdminUserIds();
  const isInAdminList = adminList.some(id => Number(id) === idNum);

  if (isInAdminList) return true;

  // 3. Dev ID 0 check ONLY if not explicitly demoted
  if (telegramUserId === undefined || telegramUserId === null || telegramUserId === 0 || telegramUserId === '0') {
    try {
      const isDemoted = localStorage.getItem('smd_dev_0_demoted') === 'true';
      return !isDemoted;
    } catch (e) {
      return true;
    }
  }

  return false;
}

/**
 * Add a Telegram User ID to Admin List and sync to Supabase
 */
export function addAdminUser(telegramUserId) {
  if (telegramUserId === undefined || telegramUserId === null) return false;
  const idNum = Number(telegramUserId);
  
  if (idNum === 0 || String(telegramUserId) === '0') {
    try { localStorage.removeItem('smd_dev_0_demoted'); } catch (e) {}
  }

  const currentAdmins = getAdminUserIds();
  if (!currentAdmins.includes(idNum)) {
    const updated = [...currentAdmins, idNum];
    try {
      localStorage.setItem('smd_prime_admin_ids', JSON.stringify(updated));
    } catch (e) {}
  }
  // Sync to Supabase PostgreSQL database table 'users'
  updateUserAdminStatus(idNum, true);
  return true;
}

/**
 * Remove a Telegram User ID from Admin List and sync to Supabase
 */
export function removeAdminUser(telegramUserId) {
  const idNum = Number(telegramUserId);

  if (idNum === 0 || String(telegramUserId) === '0') {
    try { localStorage.setItem('smd_dev_0_demoted', 'true'); } catch (e) {}
  }

  const currentAdmins = getAdminUserIds();
  const updated = currentAdmins.filter(id => Number(id) !== idNum);
  try {
    localStorage.setItem('smd_prime_admin_ids', JSON.stringify(updated));
  } catch (e) {}
  // Sync to Supabase PostgreSQL database table 'users'.....
  updateUserAdminStatus(idNum, false);
  return true;
}
