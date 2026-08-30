/**
 * HELPER: Calculates optimal streaming source based on strict business logic.
 * 
 * Rules:
 * 1. Filter out ANY source where size_gb > 4.0 (Hard Cutoff).
 * 2. Prioritize preferred language ("Tamil" by default) in audio_languages array or filename.
 * 3. Prioritize video_codec === "HEVC" (1080p HEVC > 720p HEVC > 480p HEVC).
 * 4. Fallback to highest quality "H264" under 4.0GB if no HEVC exists.
 * 5. Return null if ALL sources exceed 4.0GB.
 */
export function getOptimalStreamSource(sources = [], preferredLang = 'Tamil') {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  // Rule 1: Filter out sources > 4.0 GB
  const streamableSources = sources.filter(s => {
    const size = typeof s.size_gb === 'number' ? s.size_gb : parseSizeInGB(s.file_size);
    return size <= 4.0;
  });

  if (streamableSources.length === 0) return null;

  // Helper to check if a source matches the preferred language (e.g. Tamil)
  const matchesLang = (src, lang) => {
    if (!src) return false;
    const target = lang.toLowerCase();
    
    // Check audio_languages array
    if (Array.isArray(src.audio_languages) && src.audio_languages.length > 0) {
      const hasLang = src.audio_languages.some(l => String(l).toLowerCase().includes(target));
      if (hasLang) return true;
    }
    
    // Check quality / filename strings for tags like [Tamil], TAM, etc.
    const str = `${src.quality || ''} ${src.video_codec || ''} ${src.file_size || ''}`.toLowerCase();
    return str.includes(target) || str.includes('tam');
  };

  // Helper to normalize codec string
  const isHEVC = (src) => {
    const codec = (src.video_codec || src.quality || '').toUpperCase();
    return codec.includes('HEVC') || codec.includes('X265') || codec.includes('H265');
  };

  const qualityRank = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };

  // Rule 2: Separate preferred language (Tamil) sources vs other language sources
  const langMatchedSources = streamableSources.filter(s => matchesLang(s, preferredLang));
  const candidatePool = langMatchedSources.length > 0 ? langMatchedSources : streamableSources;

  // Rule 3: Prioritize HEVC within the chosen candidate pool
  const hevcSources = candidatePool.filter(isHEVC);

  if (hevcSources.length > 0) {
    hevcSources.sort((a, b) => {
      const qA = qualityRank[extractQualityBase(a.quality)] || 0;
      const qB = qualityRank[extractQualityBase(b.quality)] || 0;
      return qB - qA;
    });
    return hevcSources[0]; // Highest HEVC under 4GB matching preferred language
  }

  // Rule 4: Fallback to H264 within candidate pool
  candidatePool.sort((a, b) => {
    const qA = qualityRank[extractQualityBase(a.quality)] || 0;
    const qB = qualityRank[extractQualityBase(b.quality)] || 0;
    return qB - qA;
  });

  return candidatePool[0];
}

/**
 * HELPER: Fallback parser for size string like "1.8 GB" -> 1.8
 */
export function parseSizeInGB(fileSizeStr) {
  if (!fileSizeStr) return 0;
  const match = String(fileSizeStr).match(/([\d.]+)\s*(GB|MB)?/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = (match[2] || 'GB').toUpperCase();
  if (unit === 'MB') return val / 1024;
  return val;
}

/**
 * HELPER: Extracts base quality label (e.g. "1080p HEVC" -> "1080p")
 */
export function extractQualityBase(qualityStr) {
  if (!qualityStr) return '1080p';
  if (/4K|2160p/i.test(qualityStr)) return '4K';
  if (/1080p/i.test(qualityStr)) return '1080p';
  if (/720p/i.test(qualityStr)) return '720p';
  if (/480p/i.test(qualityStr)) return '480p';
  return '1080p';
}
