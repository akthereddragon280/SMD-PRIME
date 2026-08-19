import React, { useState, useEffect } from 'react';
import { X, Play, Star, Clock, Calendar, ShieldCheck, Video, Download, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getProxyStreamUrl } from '../utils/proxy';
import { triggerHaptic, useTelegramBackButton } from '../utils/telegram';
import { getExactMovieDuration } from '../utils/posters';

export default function MovieModal({ movie, onClose, onPlay, darkMode }) {
  const [downloadingQuality, setDownloadingQuality] = useState(null);
  const [sources, setSources] = useState(movie?.sources || []);

  // Bind Telegram native BackButton to close modal when active
  useTelegramBackButton(movie ? onClose : null);

  // Dynamic live query from Supabase 'movie_sources' relational table
  useEffect(() => {
    async function fetchSourcesForMovie() {
      if (!movie) return;
      const targetUid = movie.uid || movie.id;
      if (!targetUid) return;

      try {
        const { data, error } = await supabase
          .from('movie_sources')
          .select('*')
          .eq('movie_uid', targetUid);

        if (data && data.length > 0) {
          setSources(data);
        } else if (movie.sources && movie.sources.length > 0) {
          setSources(movie.sources);
        } else {
          setSources([
            { quality: '1080p', file_size: '2.4 GB', drive_file_id: movie.file_id },
            { quality: '720p', file_size: '1.2 GB', drive_file_id: movie.file_id },
            { quality: '480p', file_size: '650 MB', drive_file_id: movie.file_id }
          ]);
        }
      } catch (err) {
        console.error('Failed to query movie_sources:', err);
      }
    }

    fetchSourcesForMovie();
  }, [movie]);

  if (!movie) return null;

  const exactDuration = getExactMovieDuration(movie.title, movie.uid, movie.duration);
  const activeFileId = sources[0]?.drive_file_id || movie.file_id;
  const streamUrl = getProxyStreamUrl(activeFileId);

  const handlePlayClick = () => {
    triggerHaptic('heavy');
    onPlay({ ...movie, sources, file_id: activeFileId });
  };

  const handleDownloadClick = (source) => {
    triggerHaptic('heavy');
    const quality = source?.quality || '1080p';
    const fileId = source?.drive_file_id || movie.file_id;
    const downloadUrl = `${getProxyStreamUrl(fileId)}&download=1`;
    
    setDownloadingQuality(quality);

    // Dynamic anchor click to trigger direct file attachment download
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('download', `${movie.title || 'movie'}_${quality}.mp4`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadingQuality(null);
    }, 3500);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        
        {/* Darkened Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            triggerHaptic('light');
            onClose();
          }}
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
        />

        {/* Modal Sheet Container */}
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl transition-colors duration-300 z-10 ${
            darkMode 
              ? 'bg-slate-900 text-white border-t sm:border border-slate-800' 
              : 'bg-white text-slate-900 border-t sm:border border-slate-200'
          }`}
        >
          {/* Close Button Header */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-slate-950/70 text-white hover:bg-slate-950 backdrop-blur-md transition-all shadow-lg"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Banner Hero Image */}
          <div className="relative h-64 sm:h-72 w-full overflow-hidden bg-slate-950">
            <img
              src={movie.banner_url || movie.thumbnail_url}
              alt={movie.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover filter brightness-95"
            />
            <div className={`absolute inset-0 ${
              darkMode 
                ? 'bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent' 
                : 'bg-gradient-to-t from-white via-white/50 to-transparent'
            }`} />

            {/* Title Overlay */}
            <div className="absolute bottom-4 left-6 right-6">
              <span className="inline-block px-3 py-1 mb-2 rounded-full text-xs font-bold badge-red shadow-md">
                {movie.genre}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading text-slate-900 dark:text-white drop-shadow-md">
                {movie.title}
              </h2>
            </div>
          </div>

          {/* Details & Specs Body */}
          <div className="p-6">
            
            {/* Specs Bar */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                <Star className="w-4 h-4 fill-amber-500" />
                <span>{movie.rating} / 10 IMDb</span>
              </div>

              {/* Exact Scraped Duration Badge */}
              <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-extrabold bg-red-500/10 border border-red-500/30 px-3 py-1 rounded-lg">
                <Clock className="w-4 h-4 text-red-500" />
                <span>{exactDuration}</span>
              </div>

              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <Calendar className="w-4 h-4" />
                <span>{movie.year}</span>
              </div>
            </div>

            {/* Dynamic Multi-Quality Download Selector (720p, 1080p, etc.) */}
            <div className="mb-5">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2.5">
                <Download className="w-4 h-4 text-red-500" />
                DIRECT FILE DOWNLOADS ({sources.length} QUALITIES):
              </p>
              
              <div className="space-y-2">
                {sources.map((item, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/90 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 hover:border-red-500/30 transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{item.quality || '1080p'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono font-bold">
                            {item.file_size || '1.2 GB'}
                          </span>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 font-mono truncate max-w-[180px] sm:max-w-xs">
                          https://tgstream.smd-prime.workers.dev/?id={item.drive_file_id || movie.file_id}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDownloadClick(item)}
                      className="bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-extrabold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all"
                    >
                      {downloadingQuality === item.quality ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Story Overview */}
            <div className="mb-6">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Synopsis
              </h3>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
                {movie.description}
              </p>
            </div>

            {/* Cloudflare Direct Attachment Endpoint Info Pill */}
            <div className="mb-6 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs font-mono">
              <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400 mb-1 font-sans font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  Cloudflare Direct File Attachment Proxy
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                  DIRECT DL
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                {streamUrl}
              </p>
            </div>

            {/* Main Action Buttons */}
            <div className="pt-2">
              <button
                onClick={handlePlayClick}
                className="w-full py-3.5 px-6 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Stream Now in HD ({sources[0]?.quality || '1080p'})</span>
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
