import React from 'react';
import { Play, Info, Star, Clock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { triggerHaptic } from '../utils/telegram';

export default function HeroBanner({ movie, onPlay, onSelectMovie, darkMode }) {
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
    <div className="relative w-full overflow-hidden rounded-3xl my-4 border shadow-xl transition-all duration-300 border-slate-200/80 dark:border-slate-800">
      
      {/* Background Banner Image */}
      <div className="relative h-[360px] sm:h-[420px] w-full overflow-hidden bg-slate-900">
        <img
          src={movie.banner_url || movie.thumbnail_url}
          alt={movie.title}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-105 filter brightness-95 dark:brightness-75 transition-all duration-700"
          loading="eager"
        />

        {/* Dynamic Light/Dark Gradient Overlays for high legibility */}
        <div className={`absolute inset-0 ${
          darkMode 
            ? 'bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent' 
            : 'bg-gradient-to-t from-slate-50 via-slate-50/70 to-slate-900/20'
        }`} />
        
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/30 to-transparent dark:from-slate-950/90 dark:via-slate-950/60" />
      </div>

      {/* Featured Content Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 flex flex-col justify-end text-white dark:text-white">
        
        {/* Featured Tag */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 mb-2"
        >
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-600 text-white shadow-md shadow-red-600/30">
            <Sparkles className="w-3 h-3 fill-current" />
            FEATURED BLOCKBUSTER
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 dark:bg-slate-800/80 backdrop-blur-md border border-white/30 text-white">
            {movie.genre}
          </span>
        </motion.div>

        {/* Movie Title */}
        <motion.h1 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-2xl sm:text-4xl font-extrabold tracking-tight font-heading leading-tight drop-shadow-md text-white"
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
          <div className="flex items-center gap-1 text-amber-400 font-bold bg-slate-950/60 px-2 py-0.5 rounded-md backdrop-blur-xs">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            <span>{movie.rating}</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1 text-slate-300">
            <Clock className="w-3.5 h-3.5" />
            <span>{movie.duration}</span>
          </div>
          <span>•</span>
          <span className="text-slate-300">{movie.year}</span>
        </motion.div>

        {/* Plot Description */}
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xs sm:text-sm text-slate-200 line-clamp-2 max-w-xl mb-5 font-medium leading-relaxed drop-shadow-xs"
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
          {/* Play Stream Button */}
          <button
            onClick={handlePlayClick}
            className="flex-1 sm:flex-initial px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all duration-200"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Play Now</span>
          </button>

          {/* Details Button */}
          <button
            onClick={handleInfoClick}
            className="px-5 py-3 rounded-2xl bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-sm flex items-center justify-center gap-2 backdrop-blur-md border border-white/30 transition-all duration-200"
          >
            <Info className="w-4 h-4" />
            <span>Details</span>
          </button>
        </motion.div>

      </div>
    </div>
  );
}
