import { createClient } from '@supabase/supabase-js';
import { REAL_MOVIE_METADATA, getCinematicPoster, getCinematicBackdrop } from './utils/posters';

export const SUPABASE_URL = import.meta.env?.SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env?.SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

// Safe fallback placeholder URL if configuration is missing to avoid crashing top-level module load
const validSupabaseUrl = SUPABASE_URL && SUPABASE_URL.startsWith('http') 
  ? SUPABASE_URL 
  : 'https://placeholder.supabase.co';
const validSupabaseKey = SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(validSupabaseUrl, validSupabaseKey);

/**
 * Dynamic Title Sanitizer Helper
 * Strips residual torrent/telegram prefix noise on the fly
 */
export function sanitizeTitle(rawTitle) {
  if (!rawTitle) return 'Untitled Movie';
  let t = rawTitle.trim();
  t = t.replace(/^@[A-Za-z0-9_.\s]+?[-:]\s*/i, '');
  t = t.replace(/^@[A-Za-z0-9_.\s]{2,40}\s{2,}/i, '');
  t = t.replace(/^@[A-Za-z0-9_.]+\s*/i, '');
  t = t.replace(/^(https?:\/\/)?(www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,6}\s*[-:_]*\s*/i, '');
  t = t.replace(/^\+\s*\+\s*/g, '');
  t = t.replace(/[-_.]/g, ' ').replace(/\s+/g, ' ').trim();
  return t || 'Untitled Movie';
}

const CACHE_KEY_MOVIES = 'smd_cached_movies';

/**
 * Retrieve cached movie catalog from LocalStorage for 0ms instant app boot
 */
export function getCachedMovies() {
  try {
    const raw = localStorage.getItem(CACHE_KEY_MOVIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Save movie catalog to LocalStorage for offline/stale-while-revalidate acceleration
 */
export function setCachedMovies(movies) {
  try {
    if (Array.isArray(movies) && movies.length > 0) {
      localStorage.setItem(CACHE_KEY_MOVIES, JSON.stringify(movies));
    }
  } catch (e) {}
}

/**
 * Helper to wrap any promise with a strict execution timeout guard
 */

export function promiseWithTimeout(promise, ms = 4000, timeoutMsg = 'Operation timed out') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

/**
 * Fetch all movies with joined quality sources and movie metadata from Supabase
 * High ROI Optimization: Parallel Query Execution + 4-Second Timeout Guard + Stale-While-Revalidate Caching.
 */
export async function fetchMoviesFromSupabase() {
  try {
    // Execute movies query and movie_metadata query IN PARALLEL with a strict 4-second timeout
    const fetchPromise = Promise.all([
      supabase.from('movies').select('*, movie_sources(*)'),
      supabase.from('movie_metadata').select('*')
    ]);

    const [moviesRes, metaRes] = await promiseWithTimeout(fetchPromise, 12000, 'Supabase fetch timeout (12s)');

    if (moviesRes.error) {
      console.warn('Supabase movies fetch error:', moviesRes.error.message);
      return getCachedMovies();
    }

    const data = moviesRes.data;
    if (!data || data.length === 0) {
      return getCachedMovies();
    }

    // Build metadata map from parallel query
    let metadataMap = {};
    if (metaRes && metaRes.data && metaRes.data.length > 0) {
      metaRes.data.forEach(m => {
        if (m.movie_uid) metadataMap[m.movie_uid] = m;
      });
    }

    // Format Supabase data into UI shape with authentic posters and ratings
    const formatted = data.map((item) => {
      const uid = item.uid || item.id;
      const title = sanitizeTitle(item.title);

      // Find matching metadata from repository key or title
      let meta = REAL_MOVIE_METADATA[uid] || {};
      if (!meta.title) {
        const tLower = (title || '').toLowerCase();
        if (tLower.includes('master')) meta = REAL_MOVIE_METADATA.master_2021;
        else if (tLower.includes('jurassic')) meta = REAL_MOVIE_METADATA.return_to_the_jurassic_2025;
        else if (tLower.includes('lik') || tLower.includes('insurance')) meta = REAL_MOVIE_METADATA.lik_love_insurance_kompany_2026;
        else if (tLower.includes('lbw') || tLower.includes('wicket')) meta = REAL_MOVIE_METADATA.lbw___love_beyond_wicket_2025;
        else if (tLower.includes('batch')) meta = REAL_MOVIE_METADATA.batchmates_2026;
      }

      // Prioritize dynamic movie_metadata formatted_duration if present
      const dynamicMeta = metadataMap[uid];
      const dynamicDuration = dynamicMeta?.formatted_duration || 
        (dynamicMeta?.duration_seconds ? formatDurationString(dynamicMeta.duration_seconds) : null);

      // Prioritize database poster_url directly
      const poster_url = getCinematicPoster(title, uid, item.poster_url);
      const backdrop_url = getCinematicBackdrop(title, uid, item.backdrop_url);

      const sources = item.movie_sources || [];
      const primarySource = sources.find(s => s.quality === '1080p') || 
                            sources.find(s => s.quality === '4K') || 
                            sources[0];

      const genresList = (Array.isArray(item.genres) && item.genres.length > 0) 
        ? item.genres 
        : (meta.genres || ['Action']);

      const ratingValue = item.rating !== null && item.rating !== undefined 
        ? String(item.rating) 
        : (meta.rating ? String(meta.rating) : '7.5');

      return {
        id: uid,
        uid: uid,
        title: title,
        original_title: sanitizeTitle(item.original_title || meta.original_title || title),
        description: item.overview || meta.overview || 'High quality cinema stream loaded live from SMD Prime Cloud Cinema Library.',
        thumbnail_url: poster_url,
        banner_url: backdrop_url,
        genre: genresList[0] || 'Action',
        all_genres: genresList,
        year: item.release_year ? String(item.release_year) : (meta.release_year ? String(meta.release_year) : '2026'),
        duration: dynamicDuration || item.duration || meta.duration || '2h 15m',
        duration_seconds: dynamicMeta?.duration_seconds || null,
        rating: ratingValue,
        trending: parseFloat(ratingValue) >= 8.0 || Boolean(item.release_year && item.release_year >= 2026),
        isHero: true,
        file_id: primarySource?.drive_file_id || '',
        sources: sources.length > 0 ? sources : []
      };
    });

    // Save fresh dataset to LocalStorage cache
    setCachedMovies(formatted);
    return formatted;

  } catch (err) {
    console.warn('Supabase fetch note (falling back to cache/local):', err.message);
    return getCachedMovies();
  }
}

/**
 * High-performance Multi-Parameter Client Filter
 */
export function filterMoviesByMultiParam(moviesList, queryText) {
  if (!moviesList || moviesList.length === 0) return [];
  if (!queryText || queryText.trim().length === 0) return moviesList;

  const tokens = queryText.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return moviesList.filter(movie => {
    const titleLower = (movie.title || '').toLowerCase();
    const origLower = (movie.original_title || '').toLowerCase();
    const descLower = (movie.description || '').toLowerCase();
    const yearStr = String(movie.year || movie.release_year || '');
    const genresStr = Array.isArray(movie.all_genres) ? movie.all_genres.join(' ').toLowerCase() : (movie.genre || '').toLowerCase();
    
    const qualities = (movie.sources || []).map(s => (s.quality || '').toLowerCase());
    const qualityStr = qualities.join(' ');

    const audioLangs = (movie.sources || [])
      .flatMap(s => s.audio_languages || [])
      .map(l => l.toLowerCase());
    const audioStr = audioLangs.join(' ');

    return tokens.every(token => {
      if (/^\d{4}$/.test(token)) {
        return yearStr.includes(token);
      }

      if (/^(4k|2160p|1080p|720p|480p)$/i.test(token)) {
        return qualityStr.includes(token) || (token === '4k' && qualityStr.includes('2160p'));
      }

      if (/^(tamil|tam|telugu|tel|hindi|hin|english|eng|malayalam|mal|kannada|kan)$/i.test(token)) {
        const shortToken = token.substring(0, 3);
        return audioStr.includes(token) || audioStr.includes(shortToken) || titleLower.includes(token) || descLower.includes(token);
      }

      return (
        titleLower.includes(token) ||
        origLower.includes(token) ||
        genresStr.includes(token) ||
        descLower.includes(token) ||
        yearStr.includes(token) ||
        qualityStr.includes(token)
      );
    });
  });
}

/**
 * Optimized Supabase Multi-Parameter Search Engine
 */
export async function searchMoviesFromSupabase(queryText) {
  if (!queryText || queryText.trim().length === 0) {
    return fetchMoviesFromSupabase();
  }

  try {
    const tokens = queryText.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const firstToken = tokens[0];

    const { data, error } = await supabase
      .from('movies')
      .select('*, movie_sources(*)')
      .or(`title.ilike.%${firstToken}%,original_title.ilike.%${firstToken}%,overview.ilike.%${firstToken}%`);

    if (error || !data) {
      const all = await fetchMoviesFromSupabase();
      if (!all) return [];
      return filterMoviesByMultiParam(all, queryText);
    }

    const formatted = data.map(item => {
      const uid = item.uid || item.id;
      const title = sanitizeTitle(item.title);
      let meta = REAL_MOVIE_METADATA[uid] || {};

      const poster_url = getCinematicPoster(title, uid, item.poster_url);
      const backdrop_url = getCinematicBackdrop(title, uid, item.backdrop_url);

      const sources = item.movie_sources || [];
      const primarySource = sources.find(s => s.quality === '1080p') || 
                            sources.find(s => s.quality === '4K') || 
                            sources[0];

      const genresList = (Array.isArray(item.genres) && item.genres.length > 0) ? item.genres : (meta.genres || ['Action']);
      const ratingValue = item.rating !== null && item.rating !== undefined ? String(item.rating) : '7.5';

      return {
        id: uid,
        uid: uid,
        title: title,
        original_title: sanitizeTitle(item.original_title || title),
        description: item.overview || 'High quality cinema stream loaded live from cloud repository.',
        thumbnail_url: poster_url,
        banner_url: backdrop_url,
        genre: genresList[0] || 'Action',
        all_genres: genresList,
        year: item.release_year ? String(item.release_year) : '2026',
        duration: item.duration || '2h 15m',
        rating: ratingValue,
        trending: parseFloat(ratingValue) >= 8.0 || Boolean(item.release_year && item.release_year >= 2026),
        file_id: primarySource?.drive_file_id || '',
        sources: sources.length > 0 ? sources : []
      };
    });

    return filterMoviesByMultiParam(formatted, queryText);
  } catch (err) {
    console.error('Supabase search error:', err);
    return [];
  }
}

/**
 * Helper to normalize telegram_user_id for int8 schema compatibility
 */
function normalizeTelegramUserIdInt(userIdInput) {
  if (!userIdInput) return 0;
  const num = Number(userIdInput);
  if (!isNaN(num) && isFinite(num) && num > 0) {
    return Math.floor(num);
  }
  return 0; // Fallback numeric 0 for local guest testing
}

/**
 * 1. User Authentication & Profile Synchronization Helper
 * Automatically upserts user details into Supabase 'users' table.
 */
export async function upsertTelegramUser(tgUser) {
  if (!tgUser || !tgUser.id) return null;
  const userIdInt = normalizeTelegramUserIdInt(tgUser.id);
  
  const payload = {
    telegram_user_id: userIdInt,
    username: tgUser.username || '',
    first_name: tgUser.first_name || '',
    last_name: tgUser.last_name || '',
    avatar_url: tgUser.photo_url || ''
  };

  try {
    // 0. Check if user is marked as admin in Supabase users table
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('telegram_user_id', userIdInt)
      .limit(1)
      .maybeSingle();

    if (userRow && userRow.role === 'admin') {
      import('./utils/admin').then(({ addAdminUser }) => addAdminUser(userIdInt)).catch(() => {});
    }

    // 1. Try standard upsert with onConflict
    const { data, error } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'telegram_user_id' });

    if (!error) return data;

    // 2. Manual Fallback: Check then Update/Insert
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_user_id', userIdInt)
      .limit(1)
      .maybeSingle();

    if (existing && existing.id) {
      await supabase.from('users').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('users').insert(payload);
    }
    return true;
  } catch (err) {
    return null;
  }
}

/**
 * Persist user admin status directly to Supabase 'users' table using the 'role' column
 */
export async function updateUserAdminStatus(telegramUserId, isAdmin) {
  if (telegramUserId === undefined || telegramUserId === null) return false;
  const userIdInt = normalizeTelegramUserIdInt(telegramUserId);
  const roleValue = isAdmin ? 'admin' : 'user';

  try {
    const { error } = await supabase
      .from('users')
      .update({ role: roleValue })
      .eq('telegram_user_id', userIdInt);

    if (!error) return true;

    // Fallback upsert if record doesn't exist
    await supabase.from('users').upsert({
      telegram_user_id: userIdInt,
      role: roleValue
    }, { onConflict: 'telegram_user_id' });
    return true;
  } catch (err) {
    console.warn('updateUserAdminStatus error:', err);
    return false;
  }
}

/**
 * Helper to convert seconds into human-readable duration (e.g., "2h 15m" or "45m")
 */
export function formatDurationString(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '0m';
  const totalSeconds = Math.round(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);

  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${m}m`;
}

/**
 * 2. Dynamic Movie Duration Fetcher & Storer Helper
 * Automatically inserts/updates exact duration_seconds & formatted_duration in 'movie_metadata' table.
 */
export async function upsertMovieDuration(movieUid, durationSeconds, formattedDuration) {
  if (!movieUid || !durationSeconds || isNaN(durationSeconds) || durationSeconds <= 0) return null;

  const validDurationSeconds = Math.round(durationSeconds);
  const validFormattedDuration = formattedDuration || formatDurationString(validDurationSeconds);
  const nowIso = new Date().toISOString();

  const payload = {
    movie_uid: movieUid,
    duration_seconds: validDurationSeconds,
    formatted_duration: validFormattedDuration,
    fetched_at: nowIso
  };

  try {
    // 1. Try standard upsert with onConflict
    let { data, error } = await supabase
      .from('movie_metadata')
      .upsert(payload, { onConflict: 'movie_uid' });

    if (!error) return data;

    // 2. Manual Fallback: Check then Update/Insert (bypasses missing UNIQUE constraints)
    const { data: existing } = await supabase
      .from('movie_metadata')
      .select('id')
      .eq('movie_uid', movieUid)
      .limit(1)
      .maybeSingle();

    if (existing && existing.id) {
      await supabase.from('movie_metadata').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('movie_metadata').insert(payload);
    }
    return true;
  } catch (err) {
    return null;
  }
}

/**
 * 3. Continue Watching & Watch History Engine Helper
 * Debounced progress saver into 'user_watch_history' table.
 */
export async function saveWatchProgress(telegramUserId, movieUid, progressSeconds, durationSeconds) {
  if (!movieUid || progressSeconds === undefined || progressSeconds === null || isNaN(progressSeconds)) return null;

  const userIdInt = normalizeTelegramUserIdInt(telegramUserId);
  const nowIso = new Date().toISOString();

  const payload = {
    telegram_user_id: userIdInt,
    movie_uid: movieUid,
    progress_seconds: Math.round(progressSeconds),
    duration_seconds: durationSeconds ? Math.round(durationSeconds) : 0,
    updated_at: nowIso
  };

  try {
    // 1. Try standard upsert with onConflict
    let { error } = await supabase
      .from('user_watch_history')
      .upsert(payload, { onConflict: 'telegram_user_id,movie_uid' });

    if (!error) return true;

    // 2. Manual Fallback: Check then Update/Insert (bypasses missing UNIQUE constraints)
    const { data: existing } = await supabase
      .from('user_watch_history')
      .select('id')
      .eq('telegram_user_id', userIdInt)
      .eq('movie_uid', movieUid)
      .limit(1)
      .maybeSingle();

    if (existing && existing.id) {
      await supabase
        .from('user_watch_history')
        .update(payload)
        .eq('id', existing.id);
    } else {
      await supabase
        .from('user_watch_history')
        .insert(payload);
    }
    return true;
  } catch (err) {
    return null;
  }
}

/**
 * 3b. Fetch Continue Watching List for Homepage
 * Retrieves incomplete movies where progress_seconds < duration_seconds - 30 and progress_seconds > 5
 */
export async function fetchContinueWatching(telegramUserId, allMovies = []) {
  const userIdInt = normalizeTelegramUserIdInt(telegramUserId);
  try {
    const { data, error } = await supabase
      .from('user_watch_history')
      .select('*')
      .eq('telegram_user_id', userIdInt)
      .order('updated_at', { ascending: false });

    if (error || !data || data.length === 0) return [];

    // Filter incomplete movies: progress > 5s and (duration <= 0 OR progress < duration - 30)
    const incompleteItems = data.filter(item => {
      const prog = Number(item.progress_seconds || 0);
      const dur = Number(item.duration_seconds || 0);
      return prog > 5 && (dur <= 0 || prog < (dur - 30));
    });

    if (incompleteItems.length === 0) return [];

    // Map watch history items to full movie objects in allMovies
    return incompleteItems.map(item => {
      const foundMovie = allMovies.find(m => m.uid === item.movie_uid || m.id === item.movie_uid);
      if (foundMovie) {
        return {
          ...foundMovie,
          progress_seconds: Number(item.progress_seconds),
          duration_seconds: Number(item.duration_seconds || foundMovie.duration_seconds || 0),
          last_watched_at: item.updated_at
        };
      }
      return null;
    }).filter(Boolean);

  } catch (err) {
    return [];
  }
}

/**
 * 4. Stream Analytics Logger Helper
 * Telemetry logger for video stream playback triggers & quality changes.
 */
export async function logStreamAnalytics(movieUid, telegramUserId, qualityWatched, saAccountIndex = 1) {
  if (!movieUid) return null;

  const userIdInt = normalizeTelegramUserIdInt(telegramUserId);
  const payload = {
    movie_uid: movieUid,
    telegram_user_id: userIdInt,
    quality_watched: qualityWatched || '1080p',
    sa_account_index: Number(saAccountIndex) || 1,
    watched_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('stream_analytics')
      .insert(payload);

    if (!error) return data;
    return true;
  } catch (err) {
    return null;
  }
}

/**
 * 5. Download Analytics Logger Helper
 * Asynchronously records file download events into 'download_analytics' table.
 */
export async function logDownloadAnalytics(movieUid, telegramUserId, qualityDownloaded) {
  if (!movieUid) return null;

  const userIdInt = normalizeTelegramUserIdInt(telegramUserId);
  const payload = {
    movie_uid: movieUid,
    telegram_user_id: userIdInt,
    quality_downloaded: qualityDownloaded || '1080p',
    downloaded_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('download_analytics')
      .insert(payload);

    if (!error) return data;
    return true;
  } catch (err) {
    console.warn('Download telemetry log note:', err.message);
    return null;
  }
}

/**
 * 6. Global Streaming Mode State Helpers
 * Persists streaming mode ('both' | 'download_only' | 'stream_only') across Supabase & LocalStorage.
 */
export async function getGlobalStreamingMode() {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'streaming_mode')
      .maybeSingle();
    if (data && data.value) {
      localStorage.setItem('smd_prime_streaming_mode', data.value);
      return data.value;
    }
  } catch (e) {}
  try {
    return localStorage.getItem('smd_prime_streaming_mode') || 'both';
  } catch (e) {
    return 'both';
  }
}

export async function setGlobalStreamingMode(mode) {
  try {
    localStorage.setItem('smd_prime_streaming_mode', mode);
  } catch (e) {}

  // Broadcast event globally across window and document
  const evt = new CustomEvent('smd_streaming_mode_changed', { detail: mode });
  window.dispatchEvent(evt);
  document.dispatchEvent(evt);

  try {
    await supabase
      .from('system_settings')
      .upsert({ key: 'streaming_mode', value: mode, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch (e) {
    console.warn('System settings upsert note:', e);
  }
}


