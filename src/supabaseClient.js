import { createClient } from '@supabase/supabase-js';
import { REAL_MOVIE_METADATA, getCinematicPoster, getCinematicBackdrop } from './utils/posters';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
 * Fetch all movies with joined quality sources from Supabase
 * Enriches metadata with high-definition posters and authentic ratings for every movie.
 */
export async function fetchMoviesFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('movies')
      .select('*, movie_sources(*)');

    if (error) {
      console.warn('Supabase fetch note:', error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // Format Supabase data into UI shape with authentic posters and ratings
    return data.map((item) => {
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
        description: item.overview || meta.overview || 'High quality cinema stream loaded live from 7TB Google Drive cloud repository.',
        thumbnail_url: poster_url,
        banner_url: backdrop_url,
        genre: genresList[0] || 'Action',
        all_genres: genresList,
        year: item.release_year ? String(item.release_year) : (meta.release_year ? String(meta.release_year) : '2026'),
        duration: item.duration || meta.duration || '2h 15m',
        rating: ratingValue,
        trending: parseFloat(ratingValue) >= 8.0 || Boolean(item.release_year && item.release_year >= 2026),
        isHero: true,
        file_id: primarySource?.drive_file_id || '',
        sources: sources.length > 0 ? sources : []
      };
    });
  } catch (err) {
    console.error('Unexpected Supabase connection error:', err);
    return null;
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
