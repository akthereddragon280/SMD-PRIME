import React, { useState } from 'react';
import { Play, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { getCinematicPoster } from '../utils/posters';
import { triggerHaptic } from '../utils/telegram';

export default function MovieCard({ movie, onSelectMovie, onPlay, darkMode }) {
  const initialImage = getCinematicPoster(movie.title, movie.uid, movie.thumbnail_url);
  const [imgSrc, setImgSrc] = useState(initialImage);

  const handleClick = () => {
    triggerHaptic('light');
    onSelectMovie(movie);
  };

  const handlePlayDirect = (e) => {
    e.stopPropagation();
    triggerHaptic('heavy');
    onPlay(movie);
  };

  const handleImageError = () => {
    setImgSrc(getCinematicPoster(movie.title, movie.uid, null));
  };

  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={`group relative flex-none w-32 sm:w-40 cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 ${
        darkMode
          ? 'bg-slate-900 border-slate-800 shadow-md shadow-black/40'
          : 'bg-white border-slate-200/80 shadow-md shadow-slate-200/60'
      } border`}
    >
      {/* Thumbnail Aspect Ratio 2:3 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-800">
        <img
          src={imgSrc}
          alt={movie.title}
          onError={handleImageError}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Rating Floating Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-950/80 text-amber-400 text-[11px] font-bold backdrop-blur-md border border-white/10 shadow-xs">
          <Star className="w-3 h-3 fill-amber-400" />
          <span>{movie.rating || '8.8'}</span>
        </div>

        {/* Trending badge */}
        {movie.trending && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[9px] font-extrabold uppercase tracking-wider shadow-xs">
            HOT
          </div>
        )}

        {/* Hover / Tap Quick Play Overlay Button */}
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-xs">
          <button
            onClick={handlePlayDirect}
            className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transform scale-90 group-hover:scale-100 transition-transform duration-200"
            title="Play Stream"
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-2.5">
        <h3 className={`font-bold text-xs sm:text-sm line-clamp-1 ${
          darkMode ? 'text-slate-100' : 'text-slate-900'
        }`}>
          {movie.title}
        </h3>
        
        <div className="flex items-center justify-between mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <span>{movie.genre}</span>
          <span>{movie.year}</span>
        </div>
      </div>
    </motion.div>
  );
}
