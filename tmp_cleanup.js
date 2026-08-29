import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iwulcblngplsjtsipods.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxjYmxuZ3Bsc2p0c2lwb2RzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzA0MTA2MywiZXhwIjoyMTAyNjE3MDYzfQ.X61a2cj17Zs8Q-0-Pe1ku1PMi_uiybIlYFLv61d8tDU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
