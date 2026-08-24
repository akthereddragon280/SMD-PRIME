import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Star, Clock, Calendar, Download, ShieldCheck, Film, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, logDownloadAnalytics } from '../supabaseClient';
import { getProxyStreamUrl, downloadMovieStream } from '../utils/proxy';
import { triggerHaptic, useTelegramBackButton, getTelegramUserInfo } from '../utils/telegram';
import { getExactMovieDuration } from '../utils/posters';
import { getOptimalStreamSource } from './SmartVideoPlayer';

export default function MovieModal({ movie, onClose, onPlay, darkMode }) {
  const [sources, setSources] = useState(movie?.sources || []);
  const [loadingSources, setLoadingSources] = useState(false);
  const [downloadingQuality, setDownloadingQuality] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);

  // Bind Telegram native BackButton to close modal when active
  useTelegramBackButton(movie ? onClose : null);

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

  const exactDuration = getExactMovieDuration(movie.title, movie.uid, movie.duration);

  const handlePlayClick = (source) => {
    triggerHaptic('medium');
    if (onPlay) onPlay(movie, source);
  };

  const handleDownloadClick = async (source) => {
    triggerHaptic('heavy');
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

  const optimalStreamSource = getOptimalStreamSource(sources);

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
        <div className="flex-1 max-w-3xl mx-auto w-full p-4 sm:p-6 space-y-6 pb-16">
          
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

            {/* Primary Play Button */}
            {optimalStreamSource ? (
              <button
                onClick={() => handlePlayClick(optimalStreamSource)}
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:brightness-110 text-white font-black text-sm py-4 px-6 rounded-2xl shadow-xl shadow-red-600/35 border border-red-400/30 transition active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-white ml-0.5" />
                <span>Play Movie ({optimalStreamSource.quality} {optimalStreamSource.video_codec || ''})</span>
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

          {/* Clean Quality & Stream Options List (No SUID or Technical Labels) */}
          <div className="space-y-3">
            <h3 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${
              darkMode ? 'text-zinc-400' : 'text-slate-600'
            }`}>
              <Film className="w-4 h-4 text-red-500" />
              <span>Available Qualities ({sortedSources.length})</span>
            </h3>

            <div className="space-y-2.5">
              {sortedSources.map((src, index) => {
                const sizeInGb = typeof src.size_gb === 'number' ? src.size_gb : parseSizeInGB(src.file_size);
                const isExceedingLimit = sizeInGb > 4.0;

                return (
                  <div
                    key={src.id || index}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition ${
                      darkMode 
                        ? 'bg-zinc-900/80 hover:bg-zinc-800/90 border-zinc-800 text-zinc-200' 
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 text-xs font-black bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl shadow-xs">
                        {src.quality || '1080p'}
                      </span>
                      <div>
                        <p className="text-xs font-extrabold">{src.file_size || `${sizeInGb.toFixed(1)} GB`}</p>
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-400">
                          {isExceedingLimit ? 'Download Only (>4GB Cutoff)' : 'High Quality Direct Stream'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isExceedingLimit ? (
                        <button
                          onClick={() => handlePlayClick(src)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold rounded-xl transition shadow-md shadow-red-600/30 flex items-center gap-1.5 active:scale-95"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Stream</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 text-[11px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl">
                          Download Only
                        </span>
                      )}
                      
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
