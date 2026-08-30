import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Star, Clock, Calendar, Download, ShieldCheck, Film, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, logDownloadAnalytics, formatDurationString, getRolePolicies, getUserEntitlements, DEFAULT_ROLE_POLICIES } from '../supabaseClient';
import { getProxyStreamUrl, downloadMovieStream } from '../utils/proxy';
import { triggerHaptic, useTelegramBackButton, getTelegramUserInfo } from '../utils/telegram';
import { getExactMovieDuration } from '../utils/posters';
import { getOptimalStreamSource } from '../utils/streamHelpers';
import { triggerIntentionalAd } from '../utils/adEngine';

export default function MovieModal({ movie, onClose, onPlay, darkMode }) {
  const [sources, setSources] = useState(movie?.sources || []);
  const [loadingSources, setLoadingSources] = useState(false);
  const [downloadingQuality, setDownloadingQuality] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [dynamicDuration, setDynamicDuration] = useState(movie?.duration_seconds ? formatDurationString(movie.duration_seconds) : null);
  const [userRole, setUserRole] = useState('normal');
  const [rolePolicies, setRolePolicies] = useState(DEFAULT_ROLE_POLICIES);
  const [showUpgradeToast, setShowUpgradeToast] = useState(null);

  // Global Streaming Mode State ('both' | 'download_only' | 'stream_only')
  const [streamingMode, setStreamingMode] = useState(() => {
    try {
      return localStorage.getItem('smd_prime_streaming_mode') || 'both';
    } catch (e) {
      return 'both';
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const mode = localStorage.getItem('smd_prime_streaming_mode') || 'both';
        setStreamingMode(mode);
      } catch (e) {}
    };
    const handlePolicyChange = (e) => {
      if (e?.detail) setRolePolicies(e.detail);
    };

    getRolePolicies().then(policies => {
      if (policies) setRolePolicies(policies);
    });

    const tgUser = getTelegramUserInfo();
    if (tgUser?.id) {
      supabase
        .from('telegram_users')
        .select('role')
        .eq('telegram_id', String(tgUser.id))
        .maybeSingle()
        .then(({ data }) => {
          if (data && data.role) setUserRole(data.role);
        });
    }

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('smd_streaming_mode_changed', handleStorageChange);
    window.addEventListener('smd_role_policies_changed', handlePolicyChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('smd_streaming_mode_changed', handleStorageChange);
      window.removeEventListener('smd_role_policies_changed', handlePolicyChange);
    };
  }, []);

  // Bind Telegram native BackButton to close modal when active
  useTelegramBackButton(movie ? onClose : null);

  // Query dynamic duration from Supabase 'movie_metadata' table (or user_watch_history)
  useEffect(() => {
    async function fetchDynamicMetadata() {
      if (!movie) return;
      const targetUid = movie.uid || movie.id;
      if (!targetUid) return;

      try {
        // 1. Primary: Query movie_metadata table for updated duration
        const { data, error } = await supabase
          .from('movie_metadata')
          .select('formatted_duration, duration_seconds')
          .eq('movie_uid', targetUid)
          .maybeSingle();

        if (!error && data) {
          if (data.formatted_duration) {
            setDynamicDuration(data.formatted_duration);
            return;
          } else if (data.duration_seconds && data.duration_seconds > 0) {
            setDynamicDuration(formatDurationString(data.duration_seconds));
            return;
          }
        }

        // 2. Secondary Fallback: Query user_watch_history table for duration_seconds
        const { data: watchData } = await supabase
          .from('user_watch_history')
          .select('duration_seconds')
          .eq('movie_uid', targetUid)
          .gt('duration_seconds', 0)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (watchData && watchData.duration_seconds > 0) {
          setDynamicDuration(formatDurationString(watchData.duration_seconds));
        }
      } catch (err) {
        console.warn('Failed to fetch movie metadata duration:', err);
      }
    }

    fetchDynamicMetadata();
  }, [movie]);

  // Dynamic live query from Supabase 'movie_sources' relational table
  useEffect(() => {
    async function fetchSourcesForMovie() {
      if (!movie) return;
      const targetUid = movie.uid || movie.id;
      if (!targetUid) return;

      setLoadingSources(true);
      try {
        const { data, error } = await supabase
          .from('movie_sources')
          .select('*')
          .eq('movie_uid', targetUid);

        if (!error && data && data.length > 0) {
          setSources(data);
        } else if (movie.sources && movie.sources.length > 0) {
          setSources(movie.sources);
        }
      } catch (err) {
        console.error('Failed to query movie_sources:', err);
      } finally {
        setLoadingSources(false);
      }
    }

    fetchSourcesForMovie();
  }, [movie]);

  // Lock body & document scroll when movie detail page is open
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  if (!movie) return null;

  // Helper to parse file size string into MB for descending sorting
  const parseSizeInMB = (sizeStr) => {
    if (!sizeStr) return 0;
    const str = String(sizeStr).toUpperCase().trim();
    const val = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    if (str.includes('GB')) return val * 1024;
    if (str.includes('TB')) return val * 1024 * 1024;
    return val;
  };

  const qualityRank = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };

  const sortedSources = [...sources].sort((a, b) => {
    const sizeA = parseSizeInMB(a.file_size);
    const sizeB = parseSizeInMB(b.file_size);
    if (sizeA !== sizeB) return sizeB - sizeA;
    const rankA = qualityRank[a.quality] || 0;
    const rankB = qualityRank[b.quality] || 0;
    return rankB - rankA;
  });

  const exactDuration = dynamicDuration || (movie.duration && movie.duration !== '2h 15m' ? movie.duration : null) || getExactMovieDuration(movie.title, movie.uid, movie.duration);

  const handlePlayClick = (source) => {
    triggerHaptic('medium');
    if (streamingMode === 'download_only') {
      handleDownloadClick(source);
      return;
    }

    try {
      const entitlement = getUserEntitlements(userRole, rolePolicies);
      triggerIntentionalAd({
        userRole: userRole,
        enableAds: entitlement.enable_ads,
        actionType: 'play'
      });
    } catch (e) {}

    if (onPlay) onPlay(movie, source);
  };

  const handleDownloadClick = async (source) => {
    triggerHaptic('heavy');
    const entitlement = getUserEntitlements(userRole, rolePolicies);
    if (!entitlement.download_access) {
      setShowUpgradeToast('⭐ Direct Downloads require a Premium Account!');
      setTimeout(() => setShowUpgradeToast(null), 3500);
      return;
    }

    try {
      triggerIntentionalAd({
        userRole: userRole,
        enableAds: entitlement.enable_ads,
        actionType: 'download'
      });
    } catch (e) {}

    const quality = source?.quality || '1080p';
    const fileId = source?.drive_file_id || movie.file_id;
    const movieUid = movie.uid || movie.id;
    const movieTitle = movie.title || movie.name || 'Movie';
    const tgUser = getTelegramUserInfo();

    // Log download event asynchronously into Supabase download_analytics table
    logDownloadAnalytics(movieUid, tgUser?.id || 0, quality).catch(err => {
      console.warn('Failed to record download analytics:', err);
    });

    setDownloadingQuality(quality);

    await downloadMovieStream(fileId, movieTitle, quality, (percent, state) => {
      setDownloadProgress(percent);
      if (state === 'completed') {
        setTimeout(() => {
          setDownloadingQuality(null);
          setDownloadProgress(null);
        }, 2000);
      }
    });
  };

  const parseSizeInGB = (sizeStr) => {
    if (!sizeStr) return 0;
    const str = String(sizeStr).toUpperCase().trim();
    const val = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    if (str.includes('MB')) return val / 1024;
    return val;
  };

  // 1. Helper to extract and normalize audio languages for a source
  const getSourceAudioLanguages = (src) => {
    let langs = [];
    if (Array.isArray(src.audio_languages) && src.audio_languages.length > 0) {
      langs = src.audio_languages;
    } else if (src.audio_language) {
      langs = [src.audio_language];
    } else if (src.audio_lang) {
      langs = [src.audio_lang];
    } else {
      // Fallback: Parse from filename or title tags
      const text = `${src.title || ''} ${src.quality || ''} ${src.file_name || ''}`.toLowerCase();
      if (text.includes('multi') || text.includes('dual')) {
        if (text.includes('tam')) langs.push('Tamil');
        if (text.includes('tel')) langs.push('Telugu');
        if (text.includes('hin')) langs.push('Hindi');
        if (text.includes('mal') || text.includes('kan')) langs.push('Malayalam');
        if (text.includes('eng')) langs.push('English');
        if (langs.length === 0) langs.push('Multi Audio');
      } else if (text.includes('tam')) langs.push('Tamil');
      else if (text.includes('tel')) langs.push('Telugu');
      else if (text.includes('hin')) langs.push('Hindi');
      else if (text.includes('mal')) langs.push('Malayalam');
      else if (text.includes('eng')) langs.push('English');
      else langs.push('Original Audio');
    }

    return Array.from(new Set(langs.map(l => {
      const clean = String(l).trim();
      if (/tam/i.test(clean)) return 'Tamil';
      if (/tel/i.test(clean)) return 'Telugu';
      if (/hin/i.test(clean)) return 'Hindi';
      if (/mal/i.test(clean)) return 'Malayalam';
      if (/eng/i.test(clean)) return 'English';
      return clean;
    })));
  };

  // Language Flag Helper (Flags disabled per user request)
  const getLanguageFlag = () => '';

  // Helper to detect multi-part broken archive files (.part001, Part 1, Part 2)
  const isMultiPartFile = (src) => {
    const text = `${src.quality || ''} ${src.drive_file_id || ''} ${src.title || ''} ${src.file_name || ''}`.toLowerCase();
    return (
      /\.part\d+/i.test(text) ||
      /\bpart\s*\d+/i.test(text) ||
      /\bpart\d+/i.test(text) ||
      /\bpt\s*\d+/i.test(text)
    );
  };

  // Helper to extract clean resolution (e.g., "1080p", "720p", "480p", "4K") and sub-tags ("WEB-DL", "HDRip")
  const parseCleanQualityBadge = (qualityStr) => {
    if (!qualityStr) return { res: '1080p', tag: '', codec: '' };
    const text = String(qualityStr).replace(/\s*\([^)]*\)/g, '').trim();
    
    let res = '1080p';
    if (/(2160p|4K)/i.test(text)) res = '4K';
    else if (/1080p/i.test(text)) res = '1080p';
    else if (/720p/i.test(text)) res = '720p';
    else if (/480p/i.test(text)) res = '480p';

    let tag = '';
    if (/WEB-?DL/i.test(text)) tag = 'WEB-DL';
    else if (/HDRip/i.test(text)) tag = 'HDRip';
    else if (/BluRay/i.test(text)) tag = 'BluRay';
    else if (/BRRip/i.test(text)) tag = 'BRRip';

    let codec = '';
    if (/(hevc|x265)/i.test(text)) codec = 'x265';
    else if (/(x264|h\.?264)/i.test(text)) codec = 'x264';
    else if (/av1/i.test(text)) codec = 'AV1';

    return { res, tag, codec };
  };

  // Helper to clean quality badge text
  const formatCleanQualityBadge = (qualityStr) => {
    return parseCleanQualityBadge(qualityStr).res;
  };

  // 1. Filter out multi-part archive files
  const validSources = React.useMemo(() => {
    return sources.filter(s => !isMultiPartFile(s));
  }, [sources]);

  // 2. Extract All Unique Available Languages (NO 'All' tab, Tamil Priority #1)
  const availableLanguages = React.useMemo(() => {
    const set = new Set();
    validSources.forEach(s => {
      const lList = getSourceAudioLanguages(s);
      lList.forEach(l => set.add(l));
    });

    const langs = Array.from(set);
    const langPriority = { 'tamil': 1, 'telugu': 2, 'kannada': 3, 'hindi': 4, 'malayalam': 5, 'english': 6 };

    langs.sort((a, b) => {
      const prioA = langPriority[a.toLowerCase()] || 99;
      const prioB = langPriority[b.toLowerCase()] || 99;
      return prioA - prioB;
    });

    return langs;
  }, [validSources]);

  const [selectedAudioFilter, setSelectedAudioFilter] = useState(() => {
    if (availableLanguages.includes('Tamil')) return 'Tamil';
    return availableLanguages[0] || 'Tamil';
  });

  React.useEffect(() => {
    if (availableLanguages.length > 0 && !availableLanguages.includes(selectedAudioFilter)) {
      if (availableLanguages.includes('Tamil')) setSelectedAudioFilter('Tamil');
      else setSelectedAudioFilter(availableLanguages[0]);
    }
  }, [availableLanguages, selectedAudioFilter]);

  const getBaseQualityTier = (qualityStr) => {
    if (/4K|2160p/i.test(qualityStr)) return '4K';
    if (/1080p/i.test(qualityStr)) return '1080p';
    if (/720p/i.test(qualityStr)) return '720p';
    return '480p';
  };

  // Filter & Deduplicate sources (Max 2 files per quality tier: MIN & MAX size)
  const filteredSortedSources = React.useMemo(() => {
    const list = validSources.filter(s => {
      const langs = getSourceAudioLanguages(s);
      return langs.some(l => l.toLowerCase() === selectedAudioFilter.toLowerCase());
    });

    const groupedByTier = { '4K': [], '1080p': [], '720p': [], '480p': [] };
    list.forEach(s => {
      const tier = getBaseQualityTier(s.quality);
      if (groupedByTier[tier]) groupedByTier[tier].push(s);
      else groupedByTier['1080p'].push(s);
    });

    const finalDeduplicated = [];

    ['4K', '1080p', '720p', '480p'].forEach(tier => {
      const tierFiles = groupedByTier[tier];
      if (tierFiles.length === 0) return;

      tierFiles.sort((a, b) => parseSizeInMB(b.file_size) - parseSizeInMB(a.file_size));

      if (tierFiles.length <= 2) {
        finalDeduplicated.push(...tierFiles);
      } else {
        const maxFile = tierFiles[0];
        const minFile = tierFiles[tierFiles.length - 1];

        finalDeduplicated.push(maxFile);
        if (minFile !== maxFile) {
          finalDeduplicated.push(minFile);
        }
      }
    });

    return finalDeduplicated;
  }, [validSources, selectedAudioFilter]);

  const optimalStreamSource = getOptimalStreamSource(sources);

  // State for user explicitly selecting a stream source card
  const [selectedStreamSource, setSelectedStreamSource] = useState(null);

  // Reset explicit stream card selection when switching language tabs
  React.useEffect(() => {
    setSelectedStreamSource(null);
  }, [selectedAudioFilter]);

  // Determine active hero source dynamically (selected card OR top stream of active language tab)
  const activeHeroSource = React.useMemo(() => {
    if (selectedStreamSource && filteredSortedSources.some(s => s.id === selectedStreamSource.id || s.drive_file_id === selectedStreamSource.drive_file_id)) {
      return selectedStreamSource;
    }
    return filteredSortedSources[0] || optimalStreamSource || sources[0];
  }, [selectedStreamSource, filteredSortedSources, optimalStreamSource, sources]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 280 }}
        className={`fixed inset-0 h-[100dvh] w-[100dvw] z-50 overflow-y-auto flex flex-col transition-colors duration-300 ${
          darkMode 
            ? 'bg-[#090c15] text-white' 
            : 'bg-slate-50 text-slate-900'
        }`}
      >
        {/* Full Page Sticky Top Bar */}
        <div className={`sticky top-0 z-40 w-full px-4 py-3 flex items-center justify-between border-b backdrop-blur-2xl transition-colors ${
          darkMode 
            ? 'bg-[#090c15]/85 border-zinc-800/80 text-white' 
            : 'bg-white/85 border-slate-200/80 text-slate-900'
        }`}>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl font-black text-xs transition border active:scale-95 ${
              darkMode 
                ? 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border-zinc-800' 
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-xs'
            }`}
          >
            <ArrowLeft className="w-4 h-4 text-red-500" />
            <span>Back</span>
          </button>

          <h2 className="font-extrabold text-sm truncate max-w-[200px] text-center font-heading">
            {movie.title}
          </h2>

          <div className="w-16" /> {/* Balance layout flex spacer */}
        </div>

        {/* Full Page Content Body */}
        <div className="flex-1 max-w-3xl mx-auto w-full p-4 sm:p-6 space-y-6 pb-16 relative">

          {/* Premium Role Entitlement Upgrade Toast Alert */}
          <AnimatePresence>
            {showUpgradeToast && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="fixed top-20 left-1/2 -translate-x-1/2 z-60 px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black text-xs shadow-2xl shadow-amber-500/30 flex items-center gap-2.5 border border-amber-300/40"
              >
                <Sparkles className="w-4 h-4 animate-spin text-amber-200" />
                <span>{showUpgradeToast}</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Hero Banner Backdrop */}
          <div className="relative w-full rounded-3xl overflow-hidden shadow-2xl border border-zinc-800/50 aspect-[16/9] bg-slate-950">
            <img
              src={movie.backdrop_url || movie.banner_url || movie.poster_url || movie.thumbnail_url}
              alt={movie.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = movie.thumbnail_url || 'https://images.unsplash.com/photo-153444677768-be436bb09401?q=80&w=800&auto=format&fit=crop';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            
            {/* Rating Tag */}
            <div className="absolute top-3 right-3 flex items-center gap-1 px-3 py-1 rounded-full bg-slate-950/80 text-amber-400 text-xs font-black backdrop-blur-md border border-white/10 shadow-md">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span>{movie.rating || '8.8'}</span>
            </div>

            {/* Title & Category Tag on Hero */}
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-md shadow-red-600/40">
                  {movie.genre || 'Cinema'}
                </span>
                <span className="text-xs font-bold text-slate-300">{movie.year || '2026'}</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black font-heading leading-tight drop-shadow-md text-white">
                {movie.title}
              </h1>
            </div>
          </div>

          {/* Quick Meta Pills & Primary Action */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                darkMode ? 'bg-zinc-900/80 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
              }`}>
                <Clock className="w-4 h-4 text-red-500" />
                <span>{exactDuration}</span>
              </div>

              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                darkMode ? 'bg-zinc-900/80 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
              }`}>
                <Calendar className="w-4 h-4 text-amber-500" />
                <span>Released {movie.release_year || movie.year || '2026'}</span>
              </div>

              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
                darkMode ? 'bg-zinc-900/80 border-zinc-800 text-emerald-400' : 'bg-white border-slate-200 text-emerald-600 shadow-xs'
              }`}>
                <Sparkles className="w-4 h-4" />
                <span>Ultra HD 1080p</span>
              </div>
            </div>

            {/* Primary Action Button (Play vs Download Only) */}
            {activeHeroSource ? (
              <button
                onClick={() => handlePlayClick(activeHeroSource)}
                className={`w-full flex items-center justify-center gap-3 font-black text-sm py-4 px-6 rounded-2xl shadow-xl transition active:scale-[0.98] ${
                  streamingMode === 'download_only'
                    ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 hover:brightness-110 text-white shadow-amber-600/35 border border-amber-400/30'
                    : 'bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:brightness-110 text-white shadow-red-600/35 border border-red-400/30'
                }`}
              >
                {streamingMode === 'download_only' ? (
                  <>
                    <Download className="w-5 h-5 ml-0.5" />
                    <span>
                      Download Movie ({formatCleanQualityBadge(activeHeroSource.quality)} • {selectedAudioFilter}{activeHeroSource.file_size ? ` • ${activeHeroSource.file_size}` : ''})
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                    <span>
                      Play Movie ({formatCleanQualityBadge(activeHeroSource.quality)} • {selectedAudioFilter}{activeHeroSource.file_size ? ` • ${activeHeroSource.file_size}` : ''})
                    </span>
                  </>
                )}
              </button>
            ) : (
              <div className={`w-full text-center py-4 text-xs font-bold rounded-2xl border ${
                darkMode ? 'bg-red-950/40 text-red-400 border-red-500/30' : 'bg-red-50 text-red-600 border-red-200'
              }`}>
                {loadingSources ? 'Loading stream options...' : 'Streaming Unavailable (>4GB File Size Cutoff)'}
              </div>
            )}
          </div>

          {/* Synopsis Section */}
          <div className={`space-y-2 p-5 rounded-2xl border ${
            darkMode ? 'bg-zinc-900/50 border-zinc-800/80 text-zinc-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
          }`}>
            <h3 className={`text-xs font-black uppercase tracking-wider ${
              darkMode ? 'text-zinc-400' : 'text-slate-500'
            }`}>
              Synopsis
            </h3>
            <p className="text-xs sm:text-sm leading-relaxed font-medium">
              {movie.overview || movie.description || 'Enjoy seamless high definition streaming with multi-audio and subtitle support.'}
            </p>
          </div>

          {/* Clean Quality & Multi-Audio Stream Options List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
                darkMode ? 'text-zinc-400' : 'text-slate-600'
              }`}>
                <Film className="w-4 h-4 text-red-500" />
                <span>Available Stream Files ({filteredSortedSources.length})</span>
              </h3>

              {/* Audio Language Filter Tabs */}
              {availableLanguages.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {availableLanguages.map(lang => (
                    <button
                      key={lang}
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedAudioFilter(lang);
                      }}
                      className={`px-3 py-1 rounded-xl text-[11px] font-extrabold transition-all whitespace-nowrap active:scale-95 flex items-center gap-1 ${
                        selectedAudioFilter === lang
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/30 font-black'
                          : darkMode
                            ? 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 shadow-xs'
                      }`}
                    >
                      <span>{getLanguageFlag(lang)}</span>
                      <span>{lang}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {filteredSortedSources.map((src, index) => {
                const sizeInGb = typeof src.size_gb === 'number' ? src.size_gb : parseSizeInGB(src.file_size);
                const isExceedingLimit = sizeInGb > 4.0;
                const audioLangs = getSourceAudioLanguages(src);
                const isActive = activeHeroSource && (activeHeroSource.id === src.id || activeHeroSource.drive_file_id === src.drive_file_id);
                const { res, tag, codec } = parseCleanQualityBadge(src.quality);
                const finalCodec = src.video_codec || codec || '';

                return (
                  <div
                    key={src.id || index}
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedStreamSource(src);
                    }}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 gap-3 cursor-pointer ${
                      isActive
                        ? darkMode
                          ? 'bg-red-950/30 border-red-500/70 text-white shadow-lg shadow-red-950/30 ring-1 ring-red-500/50'
                          : 'bg-red-50 border-red-400 text-slate-900 shadow-xs ring-1 ring-red-400/50'
                        : darkMode 
                          ? 'bg-zinc-900/80 hover:bg-zinc-800/90 border-zinc-800 text-zinc-200 hover:border-zinc-700' 
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Fixed-Width Resolution Badge for 100% Alignment */}
                      <div className={`w-16 sm:w-20 py-2 rounded-xl text-center shrink-0 flex items-center justify-center font-black text-xs sm:text-sm tracking-wide shadow-sm ${
                        res === '4K'
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950'
                          : 'bg-gradient-to-r from-red-600 to-rose-600 text-white'
                      }`}>
                        {res}
                      </div>

                      {/* Clean Aligned Metadata Column */}
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs sm:text-sm font-black tracking-tight">{src.file_size || `${sizeInGb.toFixed(1)} GB`}</p>

                          {/* Format Tag (WEB-DL / HDRip) */}
                          {tag && (
                            <span className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wider border ${
                              darkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {tag}
                            </span>
                          )}

                          {/* Codec Tag (x264 / HEVC) */}
                          {finalCodec && (
                            <span className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded border ${
                              darkMode ? 'bg-zinc-800 text-zinc-400 border-zinc-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              {finalCodec}
                            </span>
                          )}
                        </div>

                        {/* Audio Language & Status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {audioLangs.map((lang, lIdx) => (
                            <span
                              key={lIdx}
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md flex items-center gap-1 border ${
                                darkMode 
                                  ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/30' 
                                  : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                              }`}
                            >
                              <span>{lang}</span>
                            </span>
                          ))}

                          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                            {isExceedingLimit ? '• Download Only (>4GB)' : '• Direct Stream Ready'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {streamingMode === 'download_only' ? (
                        <button
                          onClick={() => handleDownloadClick(src)}
                          className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-amber-600/30 flex items-center gap-1.5 active:scale-95"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Now</span>
                        </button>
                      ) : !isExceedingLimit ? (
                        <button
                          onClick={() => handlePlayClick(src)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-red-600/30 flex items-center gap-1.5 active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Stream</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownloadClick(src)}
                          className="px-3 py-1.5 text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition"
                        >
                          Download Now
                        </button>
                      )}
                      
                      {streamingMode !== 'stream_only' && streamingMode !== 'download_only' && (
                        <button
                          onClick={() => handleDownloadClick(src)}
                          disabled={downloadingQuality === src.quality}
                          className={`p-2.5 rounded-xl transition flex items-center justify-center min-w-[40px] ${
                            darkMode 
                              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900'
                          }`}
                          title="Download Movie"
                        >
                          {downloadingQuality === src.quality ? (
                            <div className="flex items-center gap-1 text-[10px] font-mono font-extrabold text-emerald-400">
                              {downloadProgress !== null ? `${downloadProgress}%` : <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />}
                            </div>
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Clean Consumer Security & Quality Badge */}
          <div className={`flex items-center gap-2.5 p-4 rounded-2xl border text-xs font-semibold ${
            darkMode ? 'bg-zinc-900/60 border-zinc-800 text-zinc-300' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
          }`}>
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <span>Encrypted Direct Stream • Ultra HD Playback Ready</span>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
