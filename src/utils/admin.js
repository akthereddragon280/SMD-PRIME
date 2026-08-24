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
export function isAdminUser(telegramUserId) {
  // If no user ID provided or in dev mode (id 0 or null), allow admin in dev
  if (telegramUserId === undefined || telegramUserId === null || telegramUserId === 0 || telegramUserId === '0') {
    return true;
  }
  const idNum = Number(telegramUserId);
  const adminList = getAdminUserIds();
  return adminList.some(id => Number(id) === idNum);
}

/**
 * Add a Telegram User ID to Admin List and sync to Supabase
 */
export function addAdminUser(telegramUserId) {
  if (!telegramUserId && telegramUserId !== 0) return false;
  const idNum = Number(telegramUserId);
  const currentAdmins = getAdminUserIds();
  if (!currentAdmins.includes(idNum)) {
    const updated = [...currentAdmins, idNum];
    localStorage.setItem('smd_prime_admin_ids', JSON.stringify(updated));
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
  const currentAdmins = getAdminUserIds();
  const updated = currentAdmins.filter(id => Number(id) !== idNum);
  localStorage.setItem('smd_prime_admin_ids', JSON.stringify(updated));
  // Sync to Supabase PostgreSQL database table 'users'
  updateUserAdminStatus(idNum, false);
  return true;
}
