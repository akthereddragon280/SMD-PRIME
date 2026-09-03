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
export function getOptimalStreamSource(sources = [], preferredLang = 'Tamil', maxResolutionCap = '4K') {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const qualityRank = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };
  const capRank = qualityRank[maxResolutionCap] || 4;

  // Rule 1: Filter out sources > 4.0 GB (Hard Cutoff) & sources exceeding maxResolutionCap
  const streamableSources = sources.filter(s => {
    const size = parseSizeInGB(s);
    const qRank = qualityRank[extractQualityBase(s.quality)] || 1;
    return size > 0 && size <= 4.0 && qRank <= capRank;
  });

  if (streamableSources.length === 0) {
    // Fallback to any source <= 4.0GB if all are capped out
    const fallback = sources.filter(s => parseSizeInGB(s) <= 4.0);
    return fallback.length > 0 ? fallback[0] : null;
  }

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
 * HELPER: Accurate parser for file size in GB from source object or size string.
 * Specifically targets number preceding "GB" or "MB", ignoring resolution numbers like 1080p/720p.
 */
export function parseSizeInGB(sourceInput) {
  if (!sourceInput) return 0;
  
  if (typeof sourceInput === 'number') return sourceInput;
  
  if (typeof sourceInput === 'object') {
    if (typeof sourceInput.size_gb === 'number' && sourceInput.size_gb > 0) {
      return sourceInput.size_gb;
    }
  }

  const text = typeof sourceInput === 'string' 
    ? sourceInput 
    : `${sourceInput.file_size || ''} ${sourceInput.quality || ''} ${sourceInput.title || ''}`;

  if (!text) return 0;

  // 1. Specific regex matching number immediately preceding "GB"
  const gbMatch = text.match(/([\d.]+)\s*GB/i);
  if (gbMatch && gbMatch[1]) {
    const val = parseFloat(gbMatch[1]);
    if (!isNaN(val) && val > 0) return val;
  }

  // 2. Specific regex matching number immediately preceding "MB"
  const mbMatch = text.match(/([\d.]+)\s*MB/i);
  if (mbMatch && mbMatch[1]) {
    const val = parseFloat(mbMatch[1]);
    if (!isNaN(val) && val > 0) return val / 1024;
  }

  return 0;
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
