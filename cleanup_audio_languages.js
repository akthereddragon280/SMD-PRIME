import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Security Notice] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in process.env for cleanup_audio_languages.js.');
}

const supabase = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key');

function parseAudioLanguagesFromFileName(fullName) {
  const cleanForLang = (fullName || '')
    .replace(/1TamilMV/gi, '')
    .replace(/TamilBlasters/gi, '')
    .replace(/TamilMV/gi, '')
    .replace(/MoviezTamizha/gi, '')
    .replace(/^@[A-Za-z0-9_.]+\s*/gi, '')
    .replace(/\[1TamilMV[^\]]*\]/gi, '');

  const audioLangs = [];
  const isMulti = /(dual[\s_-]*audio|multi[\s_-]*audio|multi|dual)/i.test(cleanForLang);

  if (/\b(tam|tamil|tns)\b/i.test(cleanForLang) || /\[tam\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Tamil')) audioLangs.push('Tamil');
  }
  if (/\b(tel|telugu|tl)\b/i.test(cleanForLang) || /\[tel\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Telugu')) audioLangs.push('Telugu');
  }
  if (/\b(hin|hindi|hd)\b/i.test(cleanForLang) || /\[hin\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Hindi')) audioLangs.push('Hindi');
  }
  if (/\b(mal|malayalam)\b/i.test(cleanForLang) || /\[mal\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Malayalam')) audioLangs.push('Malayalam');
  }
  if (/\b(kan|kannada)\b/i.test(cleanForLang) || /\[kan\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('Kannada')) audioLangs.push('Kannada');
  }
  if (/\b(eng|english)\b/i.test(cleanForLang) || /\[eng\]/i.test(cleanForLang)) {
    if (!audioLangs.includes('English')) audioLangs.push('English');
  }

  if (isMulti && audioLangs.length <= 1) {
    return ['Multi Audio'];
  }

  // High ROI Default Fallback: If no language tag is present in filename, default to ["Tamil"]
  if (audioLangs.length === 0) {
    return ['Tamil'];
  }

  return audioLangs;
}

async function cleanUpLegacyAudioLanguages() {
  console.log('🧹 Starting Supabase movie_sources audio language cleanup...');

  try {
    const { data: sources, error } = await supabase
      .from('movie_sources')
      .select('id, movie_uid, quality, audio_languages, drive_file_id');

    if (error) {
      console.error('Failed to fetch movie_sources:', error.message);
      return;
    }

    if (!sources || sources.length === 0) {
      console.log('No movie_sources found.');
      return;
    }

    const { data: movies } = await supabase.from('movies').select('uid, title');
    const movieTitleMap = {};
    if (movies) {
      movies.forEach(m => {
        if (m.uid) movieTitleMap[m.uid] = m.title;
      });
    }

    let updatedCount = 0;

    for (const source of sources) {
      const currentLangs = source.audio_languages || [];
      const title = movieTitleMap[source.movie_uid] || source.movie_uid || '';

      // Check if currentLangs is legacy default (has 4 elements "Tam", "Tel", "Hin", "Eng" or similar)
      const isLegacyDefault = currentLangs.length >= 3 && 
        (currentLangs.includes('Tam') || currentLangs.includes('Tamil')) &&
        (currentLangs.includes('Tel') || currentLangs.includes('Hin'));

      if (isLegacyDefault) {
        const cleanLangs = parseAudioLanguagesFromFileName(title);

        const { error: updateErr } = await supabase
          .from('movie_sources')
          .update({ audio_languages: cleanLangs })
          .eq('id', source.id);

        if (!updateErr) {
          console.log(`✅ Fixed Source #${source.id} (${source.movie_uid}): Old [${currentLangs.join(', ')}] -> New [${cleanLangs.join(', ')}]`);
          updatedCount++;
        }
      }
    }

    console.log(`🎉 Audio Language Cleanup Complete! Total records updated: ${updatedCount}/${sources.length}`);

  } catch (err) {
    console.error('Cleanup script error:', err);
  }
}

cleanUpLegacyAudioLanguages();
