import React from 'react';
import { Play, Info, Star, Clock, Sparkles, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { triggerHaptic } from '../utils/telegram';

export default function HeroBanner({ movie, onPlay, onSelectMovie, darkMode, streamingMode = 'both' }) {
  if (!movie) return null;

  const handlePlayClick = () => {
    triggerHaptic('heavy');
    onPlay(movie);
  };

  const handleInfoClick = () => {
    triggerHaptic('light');
    onSelectMovie(movie);
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-3xl my-4 border shadow-2xl transition-all duration-300 ${
      darkMode 
        ? 'border-zinc-800/80 shadow-black/80' 
        : 'border-slate-200/90 shadow-slate-300/60'
    }`}>
      
      {/* Background Banner Image */}
      <div className="relative h-[380px] sm:h-[430px] w-full overflow-hidden bg-slate-950">
        <img
          src={movie.banner_url || movie.thumbnail_url}
          alt={movie.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-105 filter brightness-100 dark:brightness-75 transition-all duration-700"
          loading="eager"
        />

        {/* Dynamic Light/Dark Gradient Overlays for High Legibility */}
        <div className={`absolute inset-0 ${
          darkMode 
            ? 'bg-gradient-to-t from-[#0c0f18] via-[#0c0f18]/70 via-40% to-transparent' 
            : 'bg-gradient-to-t from-slate-900/90 via-slate-900/40 via-50% to-transparent'
        }`} />
        
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/40 to-transparent" />
      </div>

      {/* Featured Content Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 flex flex-col justify-end text-white">
        
        {/* Featured Tag */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 mb-2"
        >
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/40 border border-red-400/30">
            <Sparkles className="w-3 h-3 fill-current animate-pulse" />
            FEATURED BLOCKBUSTER
          </span>
          <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur-md border border-white/30 text-white shadow-xs">
            {movie.genre}
          </span>
        </motion.div>

        {/* Movie Title */}
        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-2xl sm:text-4xl font-black tracking-tight font-heading leading-tight drop-shadow-lg text-white"
        >
          {movie.title}
        </motion.h1>

        {/* Movie Metadata */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center gap-3 my-3 text-xs sm:text-sm font-semibold text-slate-200"
        >
          <div className="flex items-center gap-1 text-amber-400 font-extrabold bg-black/60 px-2.5 py-0.5 rounded-lg backdrop-blur-md border border-white/10 shadow-xs">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            <span>{movie.rating || '8.8'}</span>
          </div>
          <span className="text-slate-400">•</span>
          <div className="flex items-center gap-1 text-slate-200 font-bold">
            <Clock className="w-3.5 h-3.5 text-red-500" />
            <span>{movie.duration}</span>
          </div>
          <span className="text-slate-400">•</span>
          <span className="text-slate-200 font-bold">{movie.year}</span>
        </motion.div>

        {/* Plot Description */}
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xs sm:text-sm text-slate-200 line-clamp-2 max-w-xl mb-5 font-medium leading-relaxed drop-shadow-sm"
        >
          {movie.description}
        </motion.p>

        {/* Action Buttons */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="flex items-center gap-3"
        >
          {/* Play Stream vs Download Button */}
          <button
            onClick={handlePlayClick}
            className={`flex-1 sm:flex-initial px-6 py-3 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl border transition-all duration-200 active:scale-95 ${
              streamingMode === 'download_only'
                ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 hover:brightness-110 text-white shadow-amber-600/40 border-amber-400/40'
                : 'bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:brightness-110 text-white shadow-red-600/40 border-red-400/40'
            }`}
          >
            {streamingMode === 'download_only' ? (
              <>
                <Download className="w-4 h-4" />
                <span>Download Only</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current ml-0.5" />
                <span>Play Now</span>
              </>
            )}
          </button>

          {/* Details Button */}
          <button
            onClick={handleInfoClick}
            className="px-5 py-3 rounded-2xl bg-white/20 hover:bg-white/30 active:scale-95 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 backdrop-blur-xl border border-white/30 shadow-lg transition-all duration-200"
          >
            <Info className="w-4 h-4" />
            <span>Details</span>
          </button>
        </motion.div>

      </div>
    </div>
  );
}
