import React, { useState, useEffect } from 'react';
import { Play, Star, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { getCinematicPoster } from '../utils/posters';
import { triggerHaptic } from '../utils/telegram';

export default function MovieCard({ movie, onSelectMovie, onPlay, darkMode }) {
  const initialImage = getCinematicPoster(movie.title, movie.uid, movie.thumbnail_url);
  const [imgSrc, setImgSrc] = useState(initialImage);

  const [streamingMode, setStreamingMode] = useState(() => {
    try {
      return localStorage.getItem('smd_prime_streaming_mode') || 'both';
    } catch (e) {
      return 'both';
    }
  });

  useEffect(() => {
    const handleModeChange = (e) => {
      try {
        const mode = e?.detail || localStorage.getItem('smd_prime_streaming_mode') || 'both';
        setStreamingMode(mode);
      } catch (err) {}
    };
    window.addEventListener('storage', handleModeChange);
    window.addEventListener('smd_streaming_mode_changed', handleModeChange);
    document.addEventListener('smd_streaming_mode_changed', handleModeChange);
    return () => {
      window.removeEventListener('storage', handleModeChange);
      window.removeEventListener('smd_streaming_mode_changed', handleModeChange);
      document.removeEventListener('smd_streaming_mode_changed', handleModeChange);
    };
  }, []);

  const handleClick = () => {
    triggerHaptic('light');
    onSelectMovie(movie);
  };

  const handlePlayDirect = (e) => {
    e.stopPropagation();
    triggerHaptic('heavy');
    if (streamingMode === 'download_only') {
      onSelectMovie(movie);
    } else {
      onPlay(movie);
    }
  };

  const handleImageError = () => {
    setImgSrc(getCinematicPoster(movie.title, movie.uid, null));
  };

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={handleClick}
      className={`group relative flex-none w-32 sm:w-40 cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 ${
        darkMode
          ? 'bg-zinc-900/80 border-zinc-800/80 shadow-lg shadow-black/50 hover:shadow-red-950/40 hover:border-zinc-700'
          : 'bg-white/95 border-slate-200/90 shadow-md shadow-slate-200/60 hover:shadow-xl hover:shadow-slate-300/60 hover:border-slate-300'
      } border`}
    >
      {/* Thumbnail Aspect Ratio 2:3 */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
        <img
          src={imgSrc}
          alt={movie.title}
          onError={handleImageError}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Rating Floating Glass Badge */}
        <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black backdrop-blur-md border shadow-xs ${
          darkMode 
            ? 'bg-zinc-950/80 text-amber-400 border-white/10' 
            : 'bg-white/90 text-amber-500 border-slate-200/80'
        }`}>
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span>{movie.rating || '8.8'}</span>
        </div>

        {/* Hot / Trending badge */}
        {movie.trending && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-600 to-rose-600 text-white text-[9px] font-black uppercase tracking-wider shadow-md shadow-red-600/30">
            HOT
          </div>
        )}

        {/* Continue Watching Progress Bar Overlay */}
        {movie.progress_seconds > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950/60 z-10">
            <div 
              className="h-full bg-gradient-to-r from-red-600 to-rose-500 rounded-r-full shadow-[0_0_8px_rgba(239,68,68,0.8)]"
              style={{
                width: `${movie.duration_seconds > 0 
                  ? Math.min(100, Math.max(5, (movie.progress_seconds / movie.duration_seconds) * 100)) 
                  : 30}%`
              }}
            />
          </div>
        )}

        {/* Hover / Tap Quick Play Overlay Button */}
        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-xs">
          {streamingMode === 'download_only' ? (
            <button
              onClick={handlePlayDirect}
              className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-600 to-orange-500 hover:from-amber-500 hover:to-orange-400 text-white flex items-center justify-center shadow-xl shadow-amber-600/50 transform scale-90 group-hover:scale-100 transition-transform duration-200"
              title="Download Now"
            >
              <Download className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handlePlayDirect}
              className="w-11 h-11 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white flex items-center justify-center shadow-xl shadow-red-600/50 transform scale-90 group-hover:scale-100 transition-transform duration-200"
              title="Play Stream"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          )}
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-2.5">
        <h3 className={`font-extrabold text-xs sm:text-sm line-clamp-1 ${
          darkMode ? 'text-zinc-100' : 'text-slate-900'
        }`}>
          {movie.title}
        </h3>
        
        <div className="flex items-center justify-between mt-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
          <span>{movie.genre}</span>
          <span className="font-mono text-[10px]">{movie.year}</span>
        </div>
      </div>
    </motion.div>
  );
}
