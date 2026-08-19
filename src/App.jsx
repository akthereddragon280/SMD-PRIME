import React, { useState, useEffect } from 'react';
import { fetchMoviesFromSupabase } from './supabaseClient';
import Header from './components/Header';
import HeroBanner from './components/HeroBanner';
import MovieRow from './components/MovieRow';
import MovieModal from './components/MovieModal';
import VideoPlayer from './components/VideoPlayer';
import SearchOverlay from './components/SearchOverlay';
import { initTelegramApp, triggerHaptic } from './utils/telegram';
import { Flame, Zap, Compass, Clapperboard, Smartphone, Monitor, MoreVertical, X, Loader2, Database, Film } from 'lucide-react';

export default function App() {
  // Light mode theme by default
  const [darkMode, setDarkMode] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [activePlayingMovie, setActivePlayingMovie] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Supabase Data State (Strictly Google Drive Synced Files Only)
  const [moviesList, setMoviesList] = useState([]);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(true);
  const [isLiveDatabase, setIsLiveDatabase] = useState(false);

  // Mobile Frame constraint mode for desktop preview
  const [isMobileFrame, setIsMobileFrame] = useState(true);

  // Initialize Telegram WebApp & fetch Supabase data on mount
  useEffect(() => {
    initTelegramApp();

    async function loadDatabaseMovies() {
      setIsLoadingSupabase(true);
      const data = await fetchMoviesFromSupabase();
      if (data && data.length > 0) {
        setMoviesList(data);
        setIsLiveDatabase(true);
      } else {
        setMoviesList([]);
        setIsLiveDatabase(false);
      }
      setIsLoadingSupabase(false);
    }

    loadDatabaseMovies();
  }, []);

  // Filter movies strictly from Google Drive synced list
  const heroMovie = moviesList.length > 0 ? (moviesList.find((m) => m.isHero) || moviesList[0]) : null;
  const trendingMovies = moviesList.filter((m) => m.trending);
  const actionMovies = moviesList.filter((m) => m.genre === 'Action');
  const sciFiMovies = moviesList.filter((m) => m.genre === 'Sci-Fi');
  const dramaMovies = moviesList.filter((m) => m.genre === 'Drama');

  const categories = ['All', 'Trending', 'Action', 'Sci-Fi', 'Drama'];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-200/60 text-slate-900'
    } flex flex-col items-center justify-start`}>

      {/* Desktop/Laptop Frame View Mode Toggle Bar */}
      <div className="w-full bg-slate-900 text-white text-xs px-4 py-2 flex items-center justify-between shadow-md hidden sm:flex">
        <div className="flex items-center gap-3 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-bold">Telegram Mini App Simulator</span>
          
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 bg-emerald-500/20 text-emerald-400">
            <Database className="w-3 h-3" />
            <span>LIVE GOOGLE DRIVE SYNC ({moviesList.length} MOVIES)</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px]">View Mode:</span>
          <button
            onClick={() => {
              triggerHaptic('light');
              setIsMobileFrame(true);
            }}
            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-[11px] ${
              isMobileFrame 
                ? 'bg-red-600 text-white shadow-xs' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile TMA View</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setIsMobileFrame(false);
            }}
            className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all text-[11px] ${
              !isMobileFrame 
                ? 'bg-red-600 text-white shadow-xs' 
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Expanded View</span>
          </button>
        </div>
      </div>

      {/* Main Telegram App Container */}
      <div className={`w-full transition-all duration-300 ${
        isMobileFrame 
          ? 'max-w-[440px] sm:my-4 sm:rounded-[36px] shadow-2xl sm:border border-slate-300/80 dark:border-slate-800 overflow-hidden' 
          : 'max-w-7xl'
      } ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      } min-h-screen relative pb-20`}>

        {/* Telegram Native Top Header Simulator (Visible on Mobile Frame) */}
        {isMobileFrame && (
          <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold select-none border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-600 flex items-center justify-center font-bold text-[10px]">
                S
              </div>
              <div>
                <div className="font-extrabold text-white leading-none">SMD PRIME Bot</div>
                <div className="text-[9px] text-slate-400 leading-none mt-0.5">bot mini app</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-400">
              <MoreVertical className="w-4 h-4 cursor-pointer hover:text-white" />
              <X className="w-4 h-4 cursor-pointer hover:text-white" />
            </div>
          </div>
        )}

        {/* Sticky App Header */}
        <Header
          onOpenSearch={() => setIsSearchOpen(true)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />

        {/* Category Tab Pills */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-touch py-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveCategory(cat);
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                  activeCategory === cat
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                    : darkMode
                      ? 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      : 'bg-white text-slate-700 border border-slate-200/80 shadow-xs hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Loading Indicator for Supabase */}
        {isLoadingSupabase && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-red-600" />
            <span>Fetching Live Google Drive Files from Supabase...</span>
          </div>
        )}

        {/* Main Body Content */}
        {!isLoadingSupabase && (
          <main className="px-4">
            
            {/* Empty State if No Files Synced */}
            {moviesList.length === 0 ? (
              <div className="my-16 py-12 text-center flex flex-col items-center justify-center border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-6">
                <Film className="w-12 h-12 text-slate-400 mb-3 animate-pulse" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
                  No Google Drive Files Found
                </h3>
                <p className="text-xs text-slate-500 max-w-xs">
                  Upload video files (.mkv, .mp4) to your Google Drive folder to auto-sync movies live to the TMA dashboard.
                </p>
              </div>
            ) : (
              <>
                {/* Featured Hero Banner */}
                {heroMovie && (activeCategory === 'All' || activeCategory === 'Trending') && (
                  <HeroBanner
                    movie={heroMovie}
                    onPlay={(m) => setActivePlayingMovie(m)}
                    onSelectMovie={(m) => setSelectedMovie(m)}
                    darkMode={darkMode}
                  />
                )}

                {/* Genre Movie Rows */}
                {activeCategory === 'All' && (
                  <>
                    {trendingMovies.length > 0 && (
                      <MovieRow
                        title="Trending Now"
                        movies={trendingMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => setActivePlayingMovie(m)}
                        darkMode={darkMode}
                        icon={<Flame className="w-5 h-5 fill-red-600 text-red-600" />}
                      />
                    )}

                    {actionMovies.length > 0 && (
                      <MovieRow
                        title="Action Blockbusters"
                        movies={actionMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => setActivePlayingMovie(m)}
                        darkMode={darkMode}
                        icon={<Zap className="w-5 h-5" />}
                      />
                    )}

                    {sciFiMovies.length > 0 && (
                      <MovieRow
                        title="Sci-Fi & Cyberpunk"
                        movies={sciFiMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => setActivePlayingMovie(m)}
                        darkMode={darkMode}
                        icon={<Compass className="w-5 h-5" />}
                      />
                    )}

                    {dramaMovies.length > 0 && (
                      <MovieRow
                        title="Dramatic Classics"
                        movies={dramaMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => setActivePlayingMovie(m)}
                        darkMode={darkMode}
                        icon={<Clapperboard className="w-5 h-5" />}
                      />
                    )}

                    {/* Catch-all for movies that don't match standard category filters */}
                    <MovieRow
                      title="All Synced Library Files"
                      movies={moviesList}
                      onSelectMovie={(m) => setSelectedMovie(m)}
                      onPlay={(m) => setActivePlayingMovie(m)}
                      darkMode={darkMode}
                    />
                  </>
                )}

                {/* Filtered View for specific categories */}
                {activeCategory !== 'All' && (
                  <div className="my-6">
                    <h2 className="text-lg font-extrabold font-heading mb-3 text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{activeCategory} Movies</span>
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {moviesList
                        .filter((m) => activeCategory === 'Trending' ? m.trending : m.genre === activeCategory)
                        .map((movie) => (
                          <div key={movie.id} className="flex justify-center">
                            <MovieRow
                              movies={[movie]}
                              onSelectMovie={(m) => setSelectedMovie(m)}
                              onPlay={(m) => setActivePlayingMovie(m)}
                              darkMode={darkMode}
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}

          </main>
        )}

        {/* Footer */}
        <footer className={`mt-12 py-6 border-t text-center ${
          darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'
        }`}>
          <div className="px-4 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              <span>SMD PRIME</span>
              <span>•</span>
              <span>LIVE GOOGLE DRIVE SYNC</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Proxy Engine: <code className="text-red-500 font-mono">tgstream.smd-prime.workers.dev</code>
            </p>
          </div>
        </footer>

        {/* Details Sheet Modal */}
        {selectedMovie && (
          <MovieModal
            movie={selectedMovie}
            onClose={() => setSelectedMovie(null)}
            onPlay={(m) => {
              setSelectedMovie(null);
              setActivePlayingMovie(m);
            }}
            darkMode={darkMode}
          />
        )}

        {/* Fullscreen Video Player */}
        {activePlayingMovie && (
          <VideoPlayer
            movie={activePlayingMovie}
            onClose={() => setActivePlayingMovie(null)}
          />
        )}

        {/* Live Search Overlay */}
        {isSearchOpen && (
          <SearchOverlay
            movies={moviesList}
            onClose={() => setIsSearchOpen(false)}
            onSelectMovie={(m) => setSelectedMovie(m)}
            onPlay={(m) => setActivePlayingMovie(m)}
            darkMode={darkMode}
          />
        )}

      </div>
    </div>
  );
}
