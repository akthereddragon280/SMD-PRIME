import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Film, Star, Play, Sparkles, Filter, LayoutGrid, List, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MovieCard from './MovieCard';
import { triggerHaptic, useTelegramBackButton } from '../utils/telegram';
import { filterMoviesByMultiParam, sanitizeTitle } from '../supabaseClient';
import { generateDynamicSVGPoster } from '../utils/posters';

export default function SearchOverlay({ movies, onClose, onSelectMovie, onPlay, darkMode }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedQuality, setSelectedQuality] = useState('All');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const inputRef = useRef(null);

  // Bind Telegram BackButton & ESC key
  useTelegramBackButton(onClose);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 300ms Input Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const genres = ['All', 'Action', 'Sci-Fi', 'Drama', 'Romance', 'Comedy'];
  const qualities = ['All', '1080p', '4K', '720p', 'Tamil'];

  // Multi-Parameter Filtered Results
  const filteredMovies = React.useMemo(() => {
    let list = movies || [];

    // Clean any legacy un-sanitized titles on the fly
    list = list.map(m => ({
      ...m,
      title: sanitizeTitle(m.title)
    }));

    if (debouncedQuery.trim()) {
      list = filterMoviesByMultiParam(list, debouncedQuery);
    }

    if (selectedGenre !== 'All') {
      list = list.filter(m => {
        const g = Array.isArray(m.all_genres) ? m.all_genres : [m.genre];
        return g.some(item => item.toLowerCase() === selectedGenre.toLowerCase());
      });
    }

    if (selectedQuality !== 'All') {
      list = list.filter(m => {
        if (selectedQuality === 'Tamil') {
          const audios = (m.sources || []).flatMap(s => s.audio_languages || []).map(l => l.toLowerCase());
          return audios.includes('tam') || audios.includes('tamil') || m.title.toLowerCase().includes('tamil');
        }
        const qualitiesList = (m.sources || []).map(s => s.quality);
        return qualitiesList.includes(selectedQuality);
      });
    }

    return list;
  }, [movies, debouncedQuery, selectedGenre, selectedQuality]);

  // Lock body scroll
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

  const isFiltered = debouncedQuery.trim() || selectedGenre !== 'All' || selectedQuality !== 'All';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className={`fixed inset-0 h-[100dvh] w-[100dvw] z-50 overflow-y-auto overscroll-contain ${
          darkMode ? 'bg-[#0c0f18] text-white' : 'bg-slate-50 text-slate-900'
        } p-4 sm:p-6 flex flex-col`}
      >
        {/* Top Header & Search Input */}
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`flex-1 flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all ${
              darkMode 
                ? 'bg-zinc-900/90 border-zinc-800 focus-within:border-red-500/80 focus-within:ring-2 focus-within:ring-red-500/20 shadow-xl text-white' 
                : 'bg-white border-slate-200 focus-within:border-red-500 shadow-md text-slate-900'
            }`}>
              <Search className="w-5 h-5 text-red-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movie title, year (2026), 1080p, Tamil..."
                autoFocus
                className={`w-full bg-transparent border-none outline-none text-sm sm:text-base font-semibold ${
                  darkMode ? 'text-white placeholder:text-zinc-500' : 'text-slate-900 placeholder:text-slate-400'
                }`}
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery('');
                    setDebouncedQuery('');
                    triggerHaptic('light');
                    inputRef.current?.focus();
                  }}
                  className={`p-1.5 rounded-full transition-colors ${
                    darkMode ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              className={`px-4 py-3.5 rounded-2xl border font-bold text-xs sm:text-sm transition-all active:scale-95 ${
                darkMode 
                  ? 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:bg-zinc-800' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-xs'
              }`}
            >
              Cancel
            </button>
          </div>

          {/* Quick Filter Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1 pb-1">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider shrink-0 flex items-center gap-1 ${
              darkMode ? 'text-zinc-500' : 'text-slate-400'
            }`}>
              <Filter className="w-3.5 h-3.5 text-red-500" /> Genre:
            </span>

            {genres.map((g) => (
              <button
                key={g}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedGenre(g);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                  selectedGenre === g
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 font-extrabold'
                    : darkMode
                      ? 'bg-zinc-900/80 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 shadow-xs'
                }`}
              >
                {g}
              </button>
            ))}

            <div className={`h-4 w-[1px] mx-1 shrink-0 ${darkMode ? 'bg-zinc-800' : 'bg-slate-200'}`} />

            <span className={`text-[11px] font-extrabold uppercase tracking-wider shrink-0 ${
              darkMode ? 'text-zinc-500' : 'text-slate-400'
            }`}>
              Quality:
            </span>

            {qualities.map((q) => (
              <button
                key={q}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedQuality(q);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                  selectedQuality === q
                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-zinc-950 font-black shadow-lg'
                    : darkMode
                      ? 'bg-zinc-900/80 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 shadow-xs'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Results Header Bar with View Mode Toggle */}
        <div className={`max-w-4xl mx-auto w-full flex items-center justify-between mb-4 border-b pb-3 ${
          darkMode ? 'border-zinc-800/80' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
              darkMode ? 'text-zinc-400' : 'text-slate-600'
            }`}>
              {isFiltered ? (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-red-500" />
                  Results ({filteredMovies.length})
                </>
              ) : (
                <>
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  All Synced Library Files ({filteredMovies.length})
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isFiltered && (
              <button
                onClick={() => {
                  setQuery('');
                  setDebouncedQuery('');
                  setSelectedGenre('All');
                  setSelectedQuality('All');
                }}
                className="text-[11px] font-bold text-red-500 hover:underline mr-1"
              >
                Reset Filters
              </button>
            )}

            {/* View Mode Switcher */}
            <div className={`flex items-center p-1 rounded-xl border ${
              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-slate-200/80 border-slate-300/80'
            }`}>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setViewMode('list');
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'list' 
                    ? 'bg-red-600 text-white shadow-sm' 
                    : darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Detailed List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setViewMode('grid');
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  viewMode === 'grid' 
                    ? 'bg-red-600 text-white shadow-sm' 
                    : darkMode ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Unified Results Section */}
        <div className="max-w-4xl mx-auto w-full flex-1 pb-16">
          {filteredMovies.length > 0 ? (
            viewMode === 'list' ? (
              /* SLEEK DETAILED LIST VIEW */
              <div className="flex flex-col gap-3">
                {filteredMovies.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => {
                      triggerHaptic('medium');
                      onSelectMovie(m);
                      onClose();
                    }}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer group ${
                      darkMode 
                        ? 'bg-zinc-900/80 border-zinc-800/80 hover:border-red-500/50 hover:bg-zinc-800/80 text-white shadow-lg' 
                        : 'bg-white border-slate-200 hover:border-red-500/50 hover:bg-slate-50 text-slate-900 shadow-sm'
                    }`}
                  >
                    <img
                      src={m.thumbnail_url}
                      alt={m.title}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = generateDynamicSVGPoster(m.title, m.genre);
                      }}
                      className="w-14 h-20 sm:w-16 sm:h-24 object-cover rounded-xl border border-slate-200/40 dark:border-white/10 shrink-0 shadow-md group-hover:scale-105 transition-transform"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`font-black text-base sm:text-lg group-hover:text-red-500 transition-colors truncate ${
                          darkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {m.title}
                        </h3>
                        <span className={`px-2 py-0.5 text-[11px] font-extrabold rounded-md shrink-0 flex items-center gap-1 border ${
                          darkMode ? 'bg-zinc-800 text-amber-400 border-amber-400/20' : 'bg-amber-50 text-amber-600 border-amber-200'
                        }`}>
                          <Star className="w-3 h-3 fill-amber-400" /> {m.rating || '7.5'}
                        </span>
                      </div>

                      <p className={`text-xs line-clamp-1 mt-1 font-medium ${
                        darkMode ? 'text-zinc-400' : 'text-slate-500'
                      }`}>
                        {m.description}
                      </p>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                          darkMode ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {m.year}
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                          darkMode ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {m.genre}
                        </span>

                        {/* Quality Badges */}
                        {(m.sources || []).map((s) => (
                          <span
                            key={s.quality}
                            className="px-2 py-0.5 text-[10px] font-black bg-red-600/10 text-red-500 rounded-md border border-red-500/20"
                          >
                            {s.quality}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('heavy');
                        onPlay(m);
                        onClose();
                      }}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-600/40 shrink-0 transform group-hover:scale-110 transition-transform active:scale-95"
                      title="Play Stream"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </button>
                  </motion.div>
                ))}
              </div>
            ) : (
              /* GRID VIEW */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filteredMovies.map((movie) => (
                  <div key={movie.id} className="flex justify-center">
                    <MovieCard
                      movie={movie}
                      onSelectMovie={(m) => {
                        onClose();
                        onSelectMovie(m);
                      }}
                      onPlay={(m) => {
                        onClose();
                        onPlay(m);
                      }}
                      darkMode={darkMode}
                    />
                  </div>
                ))}
              </div>
            )
          ) : (
            /* EMPTY STATE */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className={`w-16 h-16 rounded-3xl border flex items-center justify-center mb-4 shadow-xl ${
                darkMode ? 'bg-zinc-900/80 border-zinc-800 text-zinc-600' : 'bg-white border-slate-200 text-slate-400'
              }`}>
                <Film className="w-8 h-8" />
              </div>
              <p className={`font-extrabold text-lg ${darkMode ? 'text-zinc-200' : 'text-slate-800'}`}>No movies found</p>
              <p className="text-xs mt-1 text-slate-500 dark:text-zinc-500 max-w-sm">
                Try searching for titles like "Captain Marvel", years like "2019", or qualities like "1080p".
              </p>

              <div className="flex items-center gap-2 mt-6 flex-wrap justify-center">
                {['Captain Marvel', 'Supergirl', '2026', '1080p'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      darkMode 
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-red-500/50' 
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-red-500/50 shadow-xs'
                    }`}
                  >
                    "{tag}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
