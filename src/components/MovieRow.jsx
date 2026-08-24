import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronRight as ArrowRight } from 'lucide-react';
import MovieCard from './MovieCard';
import { triggerHaptic } from '../utils/telegram';

export default function MovieRow({ title, movies, onSelectMovie, onPlay, darkMode, icon, onViewAll }) {
  const rowRef = useRef(null);

  const handleScroll = (direction) => {
    triggerHaptic('light');
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollAmount = clientWidth * 0.75;
      rowRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (!movies || movies.length === 0) return null;

  return (
    <div className="my-6">
      {/* Category Row Header */}
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-red-600">{icon}</span>}
          <h2 className={`text-lg sm:text-xl font-extrabold font-heading tracking-tight ${
            darkMode ? 'text-slate-100' : 'text-slate-900'
          }`}>
            {title}
          </h2>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-200 text-slate-700'
          }`}>
            {movies.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Minimal View All Button */}
          {onViewAll && (
            <button
              onClick={() => {
                triggerHaptic('light');
                onViewAll();
              }}
              className={`text-xs font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-xl transition-all active:scale-95 ${
                darkMode 
                  ? 'text-red-400 hover:text-red-300 hover:bg-zinc-800/80 bg-zinc-900/60 border border-zinc-800/90' 
                  : 'text-red-600 hover:text-red-700 hover:bg-slate-100 bg-white border border-slate-200/90 shadow-xs'
              }`}
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Scroll Controls (Visible on tablet/desktop) */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => handleScroll('left')}
              className={`p-1.5 rounded-full border transition-all ${
                darkMode 
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleScroll('right')}
              className={`p-1.5 rounded-full border transition-all ${
                darkMode 
                  ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Touch Scroll Row */}
      <div
        ref={rowRef}
        className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-touch py-1 px-1 -mx-1"
      >
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            onSelectMovie={onSelectMovie}
            onPlay={onPlay}
            darkMode={darkMode}
          />
        ))}
      </div>
    </div>
  );
}
