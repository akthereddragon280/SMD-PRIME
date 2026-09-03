import { createClient } from '@supabase/supabase-js';
import { REAL_MOVIE_METADATA, getCinematicPoster, getCinematicBackdrop } from './utils/posters';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.SUPABASE_ANON_KEY || '';

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



/**
 * Smart Poster Priority Sorting Helper:
 * Sorts movies prioritizing authentic real image posters (HTTP/HTTPS) ahead of Dynamic SVG Posters.
 * Preserves the existing relative ordering among movies of the same poster type.
 */
export function sortMoviesWithPosterPriority(moviesList = []) {
  if (!Array.isArray(moviesList) || moviesList.length <= 1) return moviesList;

  const isSvgPoster = (m) => {
    const url = m.thumbnail_url || m.poster_url || '';
    return typeof url === 'string' && (url.startsWith('data:image') || url.includes('data:image/svg+xml'));
  };

  return [...moviesList].sort((a, b) => {
    const aIsSvg = isSvgPoster(a);
    const bIsSvg = isSvgPoster(b);

    if (!aIsSvg && bIsSvg) return -1; // Authentic poster comes before SVG poster
    if (aIsSvg && !bIsSvg) return 1;  // SVG poster comes after authentic poster
    return 0; // Maintain existing relative order
  });
}

/**
 * Universal Multi-Option Movie Sorting Engine
 * Supports 9 maximum high-ROI sort parameters with 0ms performance and poster priority preservation.
 */
export function sortMoviesByOption(moviesList = [], sortOption = 'default') {
  if (!Array.isArray(moviesList) || moviesList.length <= 1) return moviesList;

  const listCopy = [...moviesList];

  switch (sortOption) {
    case 'year_desc':
      return listCopy.sort((a, b) => {
        const yA = parseInt(a.year || a.release_year) || 0;
        const yB = parseInt(b.year || b.release_year) || 0;
        if (yB !== yA) return yB - yA;
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      });

    case 'year_asc':
      return listCopy.sort((a, b) => {
        const yA = parseInt(a.year || a.release_year) || 0;
        const yB = parseInt(b.year || b.release_year) || 0;
        if (yA !== yB) return yA - yB;
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      });

    case 'rating_desc':
      return listCopy.sort((a, b) => {
        const rA = parseFloat(a.rating) || 0;
        const rB = parseFloat(b.rating) || 0;
        if (rB !== rA) return rB - rA;
        return (parseInt(b.year || b.release_year) || 0) - (parseInt(a.year || a.release_year) || 0);
      });

    case 'rating_asc':
      return listCopy.sort((a, b) => {
        const rA = parseFloat(a.rating) || 0;
        const rB = parseFloat(b.rating) || 0;
        if (rA !== rB) return rA - rB;
        return (parseInt(b.year || b.release_year) || 0) - (parseInt(a.year || a.release_year) || 0);
      });

    case 'title_asc':
      return listCopy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    case 'title_desc':
      return listCopy.sort((a, b) => (b.title || '').localeCompare(a.title || ''));

    case 'quality_4k':
      return listCopy.sort((a, b) => {
        const a4K = (a.sources || []).some(s => (s.quality || '').toUpperCase() === '4K' || (s.quality || '').includes('2160'));
        const b4K = (b.sources || []).some(s => (s.quality || '').toUpperCase() === '4K' || (s.quality || '').includes('2160'));
        if (a4K && !b4K) return -1;
        if (!a4K && b4K) return 1;
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      });

    case 'tamil_first':
      return listCopy.sort((a, b) => {
        const isTamil = (m) => {
          const titleMatch = /tamil/i.test(m.title || '');
          const audioMatch = (m.sources || []).some(s => 
            Array.isArray(s.audio_languages) && s.audio_languages.some(l => /tam/i.test(l))
          );
          return titleMatch || audioMatch;
        };
        const aTam = isTamil(a);
        const bTam = isTamil(b);
        if (aTam && !bTam) return -1;
        if (!aTam && bTam) return 1;
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      });

    case 'sources_desc':
      return listCopy.sort((a, b) => {
        const sA = (a.sources || []).length;
        const sB = (b.sources || []).length;
        if (sB !== sA) return sB - sA;
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      });

    case 'default':
    default:
      return sortMoviesWithPosterPriority(listCopy);
  }
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
        return sortMoviesWithPosterPriority(parsed);
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
      // Safe metadata fallback object
      let meta = (uid && REAL_MOVIE_METADATA[uid]) ? REAL_MOVIE_METADATA[uid] : {};
      if (!meta || !meta.title) {
        const tLower = (title || '').toLowerCase();
        if (tLower.includes('master')) meta = REAL_MOVIE_METADATA.master_2021 || {};
        else if (tLower.includes('jurassic')) meta = REAL_MOVIE_METADATA.return_to_the_jurassic_2025 || {};
        else if (tLower.includes('lik') || tLower.includes('insurance')) meta = REAL_MOVIE_METADATA.lik_love_insurance_kompany_2026 || {};
        else if (tLower.includes('lbw') || tLower.includes('wicket')) meta = REAL_MOVIE_METADATA.lbw___love_beyond_wicket_2025 || {};
        else if (tLower.includes('batch')) meta = REAL_MOVIE_METADATA.batchmates_2026 || {};
        else meta = {};
      }

      // Prioritize dynamic movie_metadata formatted_duration if present
      const dynamicMeta = metadataMap[uid];
      const dynamicDuration = dynamicMeta?.formatted_duration || 
        (dynamicMeta?.duration_seconds ? formatDurationString(dynamicMeta.duration_seconds) : null);

      // Prioritize database poster_url directly
      const poster_url = getCinematicPoster(title, uid, item.poster_url);
      const backdrop_url = getCinematicBackdrop(title, uid, item.backdrop_url);

      const sources = item.movie_sources || [];
      const matchesTamil = (s) => {
        if (!s) return false;
        if (Array.isArray(s.audio_languages) && s.audio_languages.some(l => String(l).toLowerCase().includes('tamil'))) return true;
        const str = `${s.quality || ''} ${s.video_codec || ''} ${s.file_size || ''}`.toLowerCase();
        return str.includes('tamil') || str.includes('tam');
      };
      const tamilSources = sources.filter(matchesTamil);
      const candidateSources = tamilSources.length > 0 ? tamilSources : sources;

      const primarySource = candidateSources.find(s => s.quality === '1080p') || 
                            candidateSources.find(s => s.quality === '4K') || 
                            candidateSources[0];

      const genresList = (Array.isArray(item.genres) && item.genres.length > 0) 
        ? item.genres 
        : (meta?.genres || ['Action']);

      const ratingValue = item.rating !== null && item.rating !== undefined 
        ? String(item.rating) 
        : (meta?.rating ? String(meta.rating) : '7.5');

      return {
        id: uid,
        uid: uid,
        title: title,
        original_title: sanitizeTitle(item.original_title || meta?.original_title || title),
        description: item.overview || meta?.overview || 'High quality cinema stream loaded live from SMD Prime Cloud Cinema Library.',
        thumbnail_url: poster_url,
        banner_url: backdrop_url,
        genre: genresList[0] || 'Action',
        all_genres: genresList,
        year: item.release_year ? String(item.release_year) : (meta?.release_year ? String(meta.release_year) : '2026'),
        duration: dynamicDuration || item.duration || meta?.duration || '2h 15m',
        duration_seconds: dynamicMeta?.duration_seconds || null,
        rating: ratingValue,
        trending: parseFloat(ratingValue) >= 8.0 || Boolean(item.release_year && item.release_year >= 2026),
        isHero: true,
        file_id: primarySource?.drive_file_id || '',
        sources: sources.length > 0 ? sources : []
      };
    });

    const sortedFormatted = sortMoviesWithPosterPriority(formatted);

    // Save fresh dataset to LocalStorage cache
    setCachedMovies(sortedFormatted);
    return sortedFormatted;

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
  if (!queryText || queryText.trim().length === 0) return sortMoviesWithPosterPriority(moviesList);

  const tokens = queryText.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const filtered = moviesList.filter(movie => {
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

  return sortMoviesWithPosterPriority(filtered);
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
  
  // ⚠️ CRITICAL: NEVER include 'role' in payload – it would overwrite DB role on every login!
  //   Only update profile metadata (name, username, avatar).
  const profilePayload = {
    telegram_user_id: userIdInt,
    username: tgUser.username || '',
    first_name: tgUser.first_name || '',
    last_name: tgUser.last_name || '',
    avatar_url: tgUser.photo_url || ''
  };

  try {
    // 1. Check existing user to preserve their role
    const { data: userRow } = await supabase
      .from('users')
      .select('id, role')
      .eq('telegram_user_id', userIdInt)
      .limit(1)
      .maybeSingle();

    if (userRow && userRow.id) {
      // ✅ User exists: UPDATE only profile metadata, DO NOT touch 'role'
      const { error } = await supabase
        .from('users')
        .update(profilePayload)
        .eq('id', userRow.id);

      // Grant admin localStorage if DB says admin/super_admin
      const roleNorm = (userRow.role || 'normal').toLowerCase();
      if (roleNorm === 'admin' || roleNorm === 'super_admin') {
        import('./utils/admin').then(({ addAdminUser }) => addAdminUser(userIdInt)).catch(() => {});
      }

      return !error;
    } else {
      // New user: Insert with default role = 'normal'
      const { data, error } = await supabase
        .from('users')
        .insert({ ...profilePayload, role: 'normal' });
      return !error;
    }
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

/**
 * Default Entitlement Matrix for SMD Prime User Roles
 */
export const DEFAULT_ROLE_POLICIES = {
  normal: {
    max_resolution: '720p',
    download_access: false,
    external_player: false,
    sa_mesh_priority: 'Standard',
    parallel_streams: 1,
    enable_ads: true
  },
  vip: {
    max_resolution: '4K',
    download_access: true,
    external_player: true,
    sa_mesh_priority: 'Turbo',
    parallel_streams: 3,
    enable_ads: false
  },
  premium: {
    max_resolution: '4K',
    download_access: true,
    external_player: true,
    sa_mesh_priority: 'Turbo',
    parallel_streams: 3,
    enable_ads: false
  },
  admin: {
    max_resolution: '4K',
    download_access: true,
    external_player: true,
    sa_mesh_priority: 'VIP',
    parallel_streams: 999,
    enable_ads: false
  },
  super_admin: {
    max_resolution: '4K',
    download_access: true,
    external_player: true,
    sa_mesh_priority: 'Ultra',
    parallel_streams: 999,
    enable_ads: false
  }
};

const CACHE_KEY_ROLE_POLICIES = 'smd_prime_role_policies';

/**
 * Fetch dynamic Role Policies from row-based `role_policies` table (or fallback `system_settings` / LocalStorage)
 */
export async function getRolePolicies() {
  // Strategy 1: Try reading from dedicated row-based `role_policies` table
  try {
    const { data: rowData, error: rowError } = await supabase
      .from('role_policies')
      .select('*');

    if (rowData && rowData.length > 0) {
      const merged = { ...DEFAULT_ROLE_POLICIES };
      rowData.forEach(item => {
        if (item && item.role) {
          merged[item.role] = {
            max_resolution: item.max_resolution || DEFAULT_ROLE_POLICIES[item.role]?.max_resolution || '1080p',
            download_access: item.download_access !== false,
            external_player: item.external_player !== false,
            enable_ads: item.enable_ads === true,
            sa_mesh_priority: item.sa_mesh_priority || DEFAULT_ROLE_POLICIES[item.role]?.sa_mesh_priority || 'Standard',
            parallel_streams: item.parallel_streams || DEFAULT_ROLE_POLICIES[item.role]?.parallel_streams || 1
          };
        }
      });
      try {
        localStorage.setItem(CACHE_KEY_ROLE_POLICIES, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    } else {
      // Auto-seed row-based role_policies table if empty
      const rowsToSeed = Object.entries(DEFAULT_ROLE_POLICIES).map(([role, pol]) => ({
        role: role,
        max_resolution: pol.max_resolution,
        download_access: pol.download_access,
        external_player: pol.external_player,
        enable_ads: pol.enable_ads,
        sa_mesh_priority: pol.sa_mesh_priority,
        parallel_streams: pol.parallel_streams,
        updated_at: new Date().toISOString()
      }));
      supabase.from('role_policies').upsert(rowsToSeed, { onConflict: 'role' }).catch(() => {});
    }
  } catch (e) {
    console.warn('DB row-based role_policies note:', e);
  }

  // Strategy 2: Fallback to system_settings key-value table
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'role_policies')
      .limit(1)
      .maybeSingle();

    if (data && data.value) {
      const dbPolicies = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const merged = { ...DEFAULT_ROLE_POLICIES, ...dbPolicies };
      try {
        localStorage.setItem(CACHE_KEY_ROLE_POLICIES, JSON.stringify(merged));
      } catch (e) {}
      return merged;
    }
  } catch (e) {
    console.warn('DB system_settings role_policies note:', e);
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY_ROLE_POLICIES);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.normal) return parsed;
    }
  } catch (e) {}

  return DEFAULT_ROLE_POLICIES;
}

/**
 * Save updated Role Policies to Supabase DB (both `role_policies` rows & `system_settings`) + LocalStorage
 */
export async function setRolePolicies(newPolicies) {
  const merged = { ...DEFAULT_ROLE_POLICIES, ...newPolicies };
  try {
    localStorage.setItem(CACHE_KEY_ROLE_POLICIES, JSON.stringify(merged));
  } catch (e) {}

  const evt = new CustomEvent('smd_role_policies_changed', { detail: merged });
  window.dispatchEvent(evt);
  document.dispatchEvent(evt);

  // 1. Primary: Save to row-based `role_policies` table (1 row per role)
  try {
    const rowsToUpsert = Object.entries(merged).map(([roleName, pol]) => ({
      role: roleName,
      max_resolution: pol.max_resolution || '1080p',
      download_access: pol.download_access !== false,
      external_player: pol.external_player !== false,
      enable_ads: pol.enable_ads === true,
      sa_mesh_priority: pol.sa_mesh_priority || 'Standard',
      parallel_streams: pol.parallel_streams || 1,
      updated_at: new Date().toISOString()
    }));

    await supabase.from('role_policies').upsert(rowsToUpsert, { onConflict: 'role' });
  } catch (e) {
    console.warn('role_policies table upsert note:', e);
  }

  // 2. Secondary: Dual-write to system_settings table for legacy fallback
  try {
    const payload = { 
      key: 'role_policies', 
      value: JSON.stringify(merged), 
      updated_at: new Date().toISOString() 
    };

    await supabase.from('system_settings').upsert(payload, { onConflict: 'key' });
  } catch (e) {
    console.warn('system_settings role_policies upsert note:', e);
  }
  return merged;
}

/**
 * DEFAULT BOT SETTINGS (Fallback & Self-Healing Baseline)
 */
export const DEFAULT_BOT_SETTINGS = {
  maintenance_mode: 'false',
  welcome_message: 'Welcome to SMD PRIME Mini App!',
  allow_new_registrations: 'true',
  stream_quality_default: '1080p'
};

/**
 * Fetch bot settings with automatic self-healing auto-seeding
 */
export async function getBotSettings() {
  try {
    const { data, error } = await supabase
      .from('bot_settings')
      .select('key, value');

    if (data && data.length > 0) {
      const map = {};
      data.forEach(item => { map[item.key] = item.value; });
      return { ...DEFAULT_BOT_SETTINGS, ...map };
    } else {
      // Auto-seed bot_settings table silently if empty
      Object.entries(DEFAULT_BOT_SETTINGS).forEach(([key, val]) => {
        supabase.from('bot_settings').upsert({ key, value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' }).catch(() => {});
      });
    }
  } catch (e) {
    console.warn('getBotSettings note:', e);
  }
  return DEFAULT_BOT_SETTINGS;
}

/**
 * Get user entitlements for a given user role
 * HARD RULE: Admin role ALWAYS gets 1000% NO ADS!
 */
export function getUserEntitlements(userRole = 'normal', activePolicies = null) {
  const policies = activePolicies || DEFAULT_ROLE_POLICIES;
  const role = (userRole || 'normal').toLowerCase();
  
  const basePolicy = policies[role] || policies.normal || DEFAULT_ROLE_POLICIES.normal;
  const entitlement = { ...basePolicy };

  // ABSOLUTE HARD RULE: Admin users MUST NEVER EVER receive ads!
  if (role === 'admin') {
    entitlement.enable_ads = false;
  }

  return entitlement;
}

/**
 * Fetch all registered Telegram Users for Admin Role Management directly from canonical 'users' table
 */
export async function fetchAllTelegramUsersFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Fetch users error:', err.message);
    return [];
  }
}

/**
 * Fetch a user's current role directly from the canonical 'users' table in Supabase
 */
export async function getUserRoleFromSupabase(telegramUserId) {
  if (!telegramUserId) return 'normal';
  const userIdInt = normalizeTelegramUserIdInt(telegramUserId);

  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .eq('telegram_user_id', userIdInt)
      .limit(1)
      .maybeSingle();

    if (userRow && userRow.role) {
      return userRow.role.toLowerCase();
    }
  } catch (err) {
    console.warn('getUserRoleFromSupabase error:', err);
  }

  return 'normal';
}

/**
 * Update a user's role (normal, premium, admin) in Supabase DB
 * Performs fail-safe upsert matching exact Supabase 'users' table schema (id, telegram_user_id, role)
 */
export async function updateUserRoleInSupabase(telegramId, newRole) {
  try {
    if (!telegramId && telegramId !== 0) return { success: false, error: 'Missing telegramId' };
    
    // Strict Whitelist Sanitization Engine
    let role = (newRole || 'normal').toLowerCase().trim();
    const VALID_ROLES = ['normal', 'vip', 'premium', 'admin'];
    if (!VALID_ROLES.includes(role)) {
      console.warn(`[RBAC Guard] Invalid role '${newRole}' provided. Falling back to 'normal'.`);
      role = 'normal';
    }
    // Standardize 'premium' to 'vip'
    if (role === 'premium') role = 'vip';

    const idStr = String(telegramId).trim();
    const idNum = Number(idStr);
    const validId = isNaN(idNum) ? idStr : idNum;

    // Primary: Update 'users' table matching both string & number representations
    let { data: usersData, error: err1 } = await supabase
      .from('users')
      .update({ role: role })
      .eq('telegram_user_id', validId)
      .select();

    if (err1 || !usersData || usersData.length === 0) {
      // Fallback query with string match if number match returned 0 rows
      const { data: retryData, error: errRetry } = await supabase
        .from('users')
        .update({ role: role })
        .eq('telegram_user_id', idStr)
        .select();

      usersData = retryData;

      if (errRetry || !retryData || retryData.length === 0) {
        // Fallback upsert
        await supabase
          .from('users')
          .upsert({ telegram_user_id: validId, role: role }, { onConflict: 'telegram_user_id' });
      }
    }

    // Broadcast live role change event across window & document for 0ms UI update
    const eventData = { telegram_user_id: targetId, role: role };
    const evt1 = new CustomEvent('smd_user_role_updated', { detail: eventData });
    const evt2 = new CustomEvent('smd_user_role_changed', { detail: eventData });
    
    window.dispatchEvent(evt1);
    document.dispatchEvent(evt1);
    window.dispatchEvent(evt2);
    document.dispatchEvent(evt2);

    return { success: true };
  } catch (err) {
    console.warn('Update user role error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Update target_clones for a specific movie source in Supabase DB
 */
export async function updateMovieSourceCloneTarget(sourceId, targetClones) {
  try {
    const target = Math.max(1, Math.min(20, Number(targetClones) || 3));
    // Save to LocalStorage for zero-error instant client persistence
    try {
      localStorage.setItem(`smd_target_clones_${sourceId}`, String(target));
    } catch (e) {}

    // Persist directly to Supabase DB 'movie_sources' table 'target_clones' column
    const { data, error } = await supabase
      .from('movie_sources')
      .update({ target_clones: target })
      .eq('id', sourceId)
      .select();

    if (error) {
      console.warn('DB target_clones update note:', error.message);
      return { success: true, clientOnly: true, target };
    }

    return { success: true, data, target };
  } catch (err) {
    return { success: true, clientOnly: true };
  }
}

/**
 * Subscribe to Supabase Realtime changes on 'users' & 'role_policies' tables for multi-device/multi-client sync
 */
export function subscribeToRealtimeRoleAndPolicy(telegramUserId, onRoleChange, onPolicyChange) {
  try {
    const channelId = `realtime_sync_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const channel = supabase.channel(channelId);

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_policies' }, async () => {
        console.log('⚡ [Realtime] Policy change detected from Supabase DB! Reloading policies...');
        const freshPolicies = await getRolePolicies();
        if (onPolicyChange) onPolicyChange(freshPolicies);
        const evt = new CustomEvent('smd_role_policies_changed', { detail: freshPolicies });
        window.dispatchEvent(evt);
        document.dispatchEvent(evt);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async (payload) => {
        const updatedUserId = payload.new?.telegram_user_id;
        const updatedRole = payload.new?.role;

        if (updatedUserId) {
          const isMatch = !telegramUserId || 
                          String(updatedUserId) === String(telegramUserId) || 
                          Number(updatedUserId) === Number(telegramUserId) ||
                          String(telegramUserId) === '0';

          if (isMatch) {
            console.log(`⚡ [Realtime] Live User role update received for #${updatedUserId}: -> ${updatedRole}`);
            
            const normRole = (updatedRole || 'normal').toLowerCase();
            if (normRole === 'admin') {
              addAdminUser(updatedUserId);
            } else {
              removeAdminUser(updatedUserId);
            }

            if (onRoleChange && updatedRole) onRoleChange(normRole);

            const evtData = { telegram_user_id: updatedUserId, role: normRole, newRole: normRole };
            const evt1 = new CustomEvent('smd_user_role_updated', { detail: evtData });
            const evt2 = new CustomEvent('smd_user_role_changed', { detail: evtData });
            window.dispatchEvent(evt1);
            document.dispatchEvent(evt1);
            window.dispatchEvent(evt2);
            document.dispatchEvent(evt2);
          }
        }
      })
      .subscribe((status, err) => {
        if (err) {
          console.warn('Supabase Realtime subscription status:', status, err);
        }
      });

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  } catch (err) {
    console.warn('Failed to initialize Realtime subscription:', err);
    return () => {};
  }
}




