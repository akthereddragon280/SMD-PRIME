import React from 'react';
import { X, Play, Star, Clock, Calendar, ShieldCheck, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProxyStreamUrl } from '../utils/proxy';
import { triggerHaptic, useTelegramBackButton } from '../utils/telegram';

export default function MovieModal({ movie, onClose, onPlay, darkMode }) {
  // Bind Telegram native BackButton to close modal when active
  useTelegramBackButton(movie ? onClose : null);

  if (!movie) return null;

  const streamUrl = getProxyStreamUrl(movie.file_id);
  const sources = movie.sources || [{ quality: '1080p' }, { quality: '720p' }, { quality: '480p' }];

  const handlePlayClick = () => {
    triggerHaptic('heavy');
    onPlay(movie);
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
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
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
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/60 text-white hover:bg-slate-950/80 backdrop-blur-md transition-all shadow-md"
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
                ? 'bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent' 
                : 'bg-gradient-to-t from-white via-white/40 to-transparent'
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
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                <Star className="w-4 h-4 fill-amber-500" />
                <span>{movie.rating} / 10 IMDb</span>
              </div>

              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <Clock className="w-4 h-4" />
                <span>{movie.duration}</span>
              </div>

              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <Calendar className="w-4 h-4" />
                <span>{movie.year}</span>
              </div>
            </div>

            {/* Available Quality Sources Badge Row */}
            <div className="mb-5 flex items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Video className="w-3.5 h-3.5" />
                Qualities:
              </span>
              <div className="flex items-center gap-1.5">
                {sources.map((s, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-extrabold border border-red-500/20"
                  >
                    {s.quality || '1080p'}
                  </span>
                ))}
              </div>
            </div>

            {/* Story Overview */}
            <div className="mb-6">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
                Synopsis
              </h3>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 font-medium">
                {movie.description}
              </p>
            </div>

            {/* Cloudflare Worker Proxy Endpoint info pill */}
            <div className="mb-6 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs font-mono">
              <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400 mb-1 font-sans font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                  Cloudflare Worker Stream Node
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                  PROXY READY
                </span>
              </div>
              <p className="truncate text-[11px] text-slate-600 dark:text-slate-300">
                {streamUrl}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handlePlayClick}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Stream Now in HD</span>
              </button>
            </div>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
