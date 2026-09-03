import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function resetDbSources() {
  console.log('🧹 Clearing old movie_sources from Supabase database...');
  const { error, count } = await supabase
    .from('movie_sources')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (!error) {
    console.log(`✅ Successfully deleted ${count || 0} old source record(s) from Supabase DB.`);
    console.log('💡 Now run "node sync_drive_to_supabase.js" to generate fresh unlinked clone files!');
  } else {
    console.error('✖ Error clearing DB sources:', error.message);
  }
}

resetDbSources();
