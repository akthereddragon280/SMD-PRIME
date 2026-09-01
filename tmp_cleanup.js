import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Security Notice] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in process.env for tmp_cleanup.js.');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key');

async function main() {
  const { data: sources, error } = await supabase
    .from('movie_sources')
    .select('*')
    .eq('movie_uid', 'jana_nayagan_2026');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`=== JANA NAYAGAN 2026 TOTAL SOURCES IN SUPABASE: ${sources.length} ===`);
  
  const byLang = {};
  for (const s of sources) {
    const langs = (s.audio_languages || ['Tamil']).join(', ');
    if (!byLang[langs]) byLang[langs] = 0;
    byLang[langs]++;
    console.log(`- [${langs.padEnd(10)}] Quality: "${s.quality}" | Size: ${s.file_size}`);
  }

  console.log('\nSummary by Language:', byLang);
}

main().catch(console.error);
