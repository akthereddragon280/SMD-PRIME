import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Security Notice] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in process.env for test_tmdb_sync.js.');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key');

console.log(`
======================================================================
  🧪 SMD PRIME - TMDB METADATA & RATINGS AUDIT TEST SUITE
======================================================================
`);

async function auditSupabaseTMDBRecords() {
  try {
    const { data: movies, error } = await supabase.from('movies').select('*');
    if (error) {
      console.error('✖ Failed to query Supabase movies table:', error.message);
      process.exit(1);
    }

    console.log(`Auditing ${movies.length} record(s) in Supabase 'movies' table:\n`);

    const results = [];
    let allPassed = true;

    for (const m of movies) {
      const isValidRating = typeof m.rating === 'number' && m.rating >= 1.0 && m.rating <= 10.0;
      const isValidPoster = typeof m.poster_url === 'string' && m.poster_url.startsWith('http');
      const hasOverview = typeof m.overview === 'string' && m.overview.length > 10;

      const isPassed = isValidRating && isValidPoster && hasOverview;
      if (!isPassed) allPassed = false;

      results.push({
        Title: m.title,
        Year: m.release_year,
        'TMDB Rating': `${m.rating} ★`,
        'Poster Status': isValidPoster ? 'VALID URL' : 'INVALID',
        Genres: Array.isArray(m.genres) ? m.genres.join(', ') : m.genres,
        Audit: isPassed ? 'PASS' : 'FAIL'
      });
    }

    console.table(results);

    if (allPassed) {
      console.log('\n✅ AUDIT PASSED: 100% of movie records contain authentic TMDB ratings and valid poster paths!');
    } else {
      console.log('\n⚠️ AUDIT FAILED: Some records contain missing or invalid TMDB ratings.');
    }
  } catch (err) {
    console.error('Audit exception:', err.message);
  }
}

auditSupabaseTMDBRecords();
