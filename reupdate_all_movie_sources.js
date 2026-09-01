import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Security Notice] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in process.env for reupdate_all_movie_sources.js.');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key');

/**
 * Parses numeric GB size from file_size string (e.g. "1.8 GB" -> 1.8, "850 MB" -> 0.83)
 */
function parseSizeInGb(fileSizeStr) {
  if (!fileSizeStr) return 1.5;
  const match = String(fileSizeStr).match(/([\d.]+)\s*(GB|MB)?/i);
  if (!match) return 1.5;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'GB').toUpperCase();
  if (unit === 'MB') return parseFloat((val / 1024).toFixed(2));
  return parseFloat(val.toFixed(2));
}

/**
 * Detects video_codec from quality string or filename metadata
 */
function detectVideoCodec(qualityStr) {
  if (!qualityStr) return 'H264';
  const q = String(qualityStr).toUpperCase();
  if (q.includes('HEVC') || q.includes('X265') || q.includes('H265')) {
    return 'HEVC';
  }
  return 'H264';
}

async function reupdateAllMovieSources() {
  console.log('🚀 Starting Database Re-Update for All Movie Sources...');

  // Fetch all movie_sources from Supabase
  const { data: sources, error } = await supabase
    .from('movie_sources')
    .select('*');

  if (error) {
    console.error('✖ Error fetching movie_sources:', error.message);
    return;
  }

  console.log(`📦 Found ${sources.length} movie source records in Supabase.`);

  let updatedCount = 0;
  for (const src of sources) {
    const video_codec = detectVideoCodec(src.quality);
    const size_gb = parseSizeInGb(src.file_size);

    const { error: updateErr } = await supabase
      .from('movie_sources')
      .update({
        video_codec,
        size_gb
      })
      .eq('id', src.id);

    if (updateErr) {
      console.error(`✖ Failed to update record ID ${src.id}:`, updateErr.message);
    } else {
      updatedCount++;
      console.log(`✅ [UPDATED] ID: ${src.id} | Quality: "${src.quality}" -> Codec: "${video_codec}", Size: ${size_gb} GB`);
    }
  }

  console.log(`\n🎉 Successfully re-updated ${updatedCount}/${sources.length} movie source records in Supabase!`);
}

reupdateAllMovieSources();
