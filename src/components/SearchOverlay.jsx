import React, { useState } from 'react';
import { Search, X, Film, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MovieCard from './MovieCard';
import { triggerHaptic, useTelegramBackButton } from '../utils/telegram';

export default function SearchOverlay({ movies, onClose, onSelectMovie, onPlay, darkMode }) {
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');

  // Bind Telegram BackButton to close search overlay
  useTelegramBackButton(onClose);

  const genres = ['All', 'Action', 'Sci-Fi', 'Drama'];

  const filteredMovies = movies.filter((movie) => {
    const matchesQuery = movie.title.toLowerCase().includes(query.toLowerCase()) ||
                         movie.description.toLowerCase().includes(query.toLowerCase()) ||
                         movie.genre.toLowerCase().includes(query.toLowerCase());
    const matchesGenre = selectedGenre === 'All' || movie.genre === selectedGenre;
    return matchesQuery && matchesGenre;
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`fixed inset-0 z-50 overflow-y-auto ${
          darkMode ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
        } p-4 sm:p-6 flex flex-col`}
      >
        {/* Search Header */}
        <div className="max-w-4xl mx-auto w-full flex items-center gap-3 mb-6">
          <div className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
            darkMode 
              ? 'bg-slate-900 border-slate-800 focus-within:border-red-500' 
              : 'bg-white border-slate-200 focus-within:border-red-500 shadow-sm'
          }`}>
            <Search className="w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies, genres, actors..."
              autoFocus
              className="w-full bg-transparent border-none outline-none text-sm font-semibold placeholder:text-slate-400"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
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
            className={`p-3 rounded-2xl border font-bold text-xs ${
              darkMode 
                ? 'bg-slate-900 border-slate-800 text-slate-300' 
                : 'bg-white border-slate-200 text-slate-700 shadow-xs'
            }`}
          >
            Cancel
          </button>
        </div>

        {/* Category Filters */}
        <div className="max-w-4xl mx-auto w-full flex items-center gap-2 overflow-x-auto no-scrollbar mb-6 pb-2">
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => {
                triggerHaptic('light');
                setSelectedGenre(genre);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedGenre === genre
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : darkMode
                    ? 'bg-slate-900 text-slate-400 border border-slate-800'
                    : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>

        {/* Results Grid */}
        <div className="max-w-4xl mx-auto w-full flex-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Results ({filteredMovies.length})
            </span>
          </div>

          {filteredMovies.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-12">
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
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <Film className="w-12 h-12 stroke-1 mb-3 text-slate-300 dark:text-slate-700" />
              <p className="font-bold text-base">No movies found matching "{query}"</p>
              <p className="text-xs mt-1 text-slate-500">Try searching for "Action" or "Sci-Fi"</p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
