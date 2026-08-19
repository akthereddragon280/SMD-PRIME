import { createClient } from '@supabase/supabase-js';
import { REAL_MOVIE_METADATA, getCinematicPoster, getCinematicBackdrop } from './utils/posters';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      const title = item.title;

      // Find matching metadata from repository key or title
      let meta = REAL_MOVIE_METADATA[uid] || {};
      if (!meta.title) {
        const tLower = title.toLowerCase();
        if (tLower.includes('master')) meta = REAL_MOVIE_METADATA.master_2021;
        else if (tLower.includes('jurassic')) meta = REAL_MOVIE_METADATA.return_to_the_jurassic_2025;
        else if (tLower.includes('lik') || tLower.includes('insurance')) meta = REAL_MOVIE_METADATA.lik_love_insurance_kompany_2026;
        else if (tLower.includes('lbw') || tLower.includes('wicket')) meta = REAL_MOVIE_METADATA.lbw___love_beyond_wicket_2025;
        else if (tLower.includes('batch')) meta = REAL_MOVIE_METADATA.batchmates_2026;
      }

      const poster_url = getCinematicPoster(title, uid, item.poster_url);
      const backdrop_url = getCinematicBackdrop(title, uid, item.backdrop_url);

      const sources = item.movie_sources || [];
      const primarySource = sources.find(s => s.quality === '1080p') || 
                            sources.find(s => s.quality === '4K') || 
                            sources[0];

      const genresList = meta.genres || (Array.isArray(item.genres) && item.genres.length > 0 ? item.genres : ['Action']);

      const ratingValue = meta.rating 
        ? String(meta.rating) 
        : (item.rating !== null && item.rating !== undefined ? String(item.rating) : '8.0');

      return {
        id: uid,
        uid: uid,
        title: title,
        original_title: item.original_title || meta.original_title || title,
        description: meta.overview || item.overview || 'High quality cinema stream loaded live from 7TB Google Drive cloud repository.',
        thumbnail_url: poster_url,
        banner_url: backdrop_url,
        genre: genresList[0] || 'Action',
        all_genres: genresList,
        year: item.release_year ? String(item.release_year) : (meta.release_year ? String(meta.release_year) : '2026'),
        duration: item.duration || meta.duration || '2h 15m',
        rating: ratingValue,
        trending: true,
        isHero: true,
        file_id: primarySource?.drive_file_id || '1djKAD3UQmBPgkeBBLCrZjAW-D4Fod_Ng',
        sources: sources.length > 0 ? sources : [
          {
            quality: '1080p',
            drive_file_id: primarySource?.drive_file_id || '1djKAD3UQmBPgkeBBLCrZjAW-D4Fod_Ng',
            file_size: primarySource?.file_size || '2.4 GB'
          }
        ]
      };
    });
  } catch (err) {
    console.error('Unexpected Supabase connection error:', err);
    return null;
  }
}
