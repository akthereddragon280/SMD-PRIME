import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import MovieCard from './MovieCard';
import { triggerHaptic } from '../utils/telegram';

export default function MovieRow({ title, movies, onSelectMovie, onPlay, darkMode, icon }) {
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
            darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
          }`}>
            {movies.length}
          </span>
        </div>

        {/* Scroll Controls (Visible on tablet/desktop) */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => handleScroll('left')}
            className={`p-1.5 rounded-full border transition-all ${
              darkMode 
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800' 
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScroll('right')}
            className={`p-1.5 rounded-full border transition-all ${
              darkMode 
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800' 
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
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
