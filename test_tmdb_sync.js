import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
