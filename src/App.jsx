import React, { useState, useEffect } from 'react';
import { fetchMoviesFromSupabase, upsertTelegramUser, fetchContinueWatching, getCachedMovies, getGlobalStreamingMode, sortMoviesWithPosterPriority, sortMoviesByOption, getRolePolicies, getUserEntitlements, getUserRoleFromSupabase, subscribeToRealtimeRoleAndPolicy } from './supabaseClient';
import Header from './components/Header';
import HeroBanner from './components/HeroBanner';
import MovieRow from './components/MovieRow';
import MovieModal from './components/MovieModal';
import VideoPlayer from './components/VideoPlayer';
import SearchOverlay from './components/SearchOverlay';
import AdminModal from './components/AdminModal';
import PlayerGateway from './components/PlayerGateway';
import { initTelegramApp, triggerHaptic, getTelegramUserInfo } from './utils/telegram';
import { useNavigationHistory } from './utils/useNavigationHistory';
import { syncAdEngine } from './utils/adEngine';
import { getAdminUserIds, isAdminUser, isSuperAdminUser, addAdminUser, removeAdminUser } from './utils/admin';
import { Loader2, Film, History, Flame, Zap, Compass, Clapperboard, ArrowUpDown, SlidersHorizontal } from 'lucide-react';

export default function App() {
  // Check if current route is the HTTPS Bounce Gateway
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/player-gate')) {
    return <PlayerGateway />;
  }

  // Dark mode theme by default
  const [darkMode, setDarkMode] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [activePlayingMovie, setActivePlayingMovie] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  
  // Supabase Data State (Strictly Google Drive Synced Files Only)
  const [moviesList, setMoviesList] = useState([]);
  const [continueWatchingList, setContinueWatchingList] = useState([]);
  const [telegramUser, setTelegramUser] = useState(null);
  const [isLoadingSupabase, setIsLoadingSupabase] = useState(true);
  const [isLiveDatabase, setIsLiveDatabase] = useState(false);

  // Auto-detect Mobile vs Laptop/Desktop layout dynamically
  const [isMobileDevice, setIsMobileDevice] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  // Smart Scroll Auto-Hide Category Bar State
  const [showCategoryBar, setShowCategoryBar] = useState(true);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileDevice(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);

    let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const diff = currentScrollY - lastScrollY;

          if (currentScrollY > 100 && diff > 10) {
            // Scrolling Down past 100px with 10px hysteresis -> Hide
            setShowCategoryBar(false);
          } else if (diff < -10 || currentScrollY < 40) {
            // Scrolling Up by at least 10px or near page top -> Show
            setShowCategoryBar(true);
          }
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Helper to reload Continue Watching row
  const refreshContinueWatching = async (allMovies = moviesList) => {
    const tgUser = getTelegramUserInfo();
    const items = await fetchContinueWatching(tgUser?.id, allMovies);
    setContinueWatchingList(items);
  };

  // Synchronize browser history stack and Telegram WebApp native BackButton
  const {
    closeMovieDetail,
    closePlayer,
    closeSearch,
    closeAdmin
  } = useNavigationHistory({
    selectedMovie,
    setSelectedMovie,
    activePlayingMovie,
    setActivePlayingMovie,
    isSearchOpen,
    setIsSearchOpen,
    isAdminOpen,
    setIsAdminOpen,
    refreshContinueWatching
  });

  // Initialize Telegram WebApp, sync user profile, & fetch Supabase data on mount
  useEffect(() => {
    initTelegramApp();

    async function loadDatabaseAndUser() {
      // High ROI Optimization 1: Render LocalStorage Cached Movies Instantly in 0ms!
      const cached = getCachedMovies();
      if (cached && cached.length > 0) {
        setMoviesList(cached);
        setIsLiveDatabase(true);
        setIsLoadingSupabase(false);
      } else {
        setIsLoadingSupabase(true);
      }

      // High ROI Optimization 2: Non-blocking Background User Profile Upsert
      const tgUser = getTelegramUserInfo();
      if (tgUser) {
        setTelegramUser(tgUser);
        upsertTelegramUser(tgUser).catch(e => console.warn('Non-blocking user upsert note:', e));
      }

      // High ROI Optimization 3: Revalidate catalog with 4s timeout guard
      const data = await fetchMoviesFromSupabase();
      if (data && data.length > 0) {
        setMoviesList(data);
        setIsLiveDatabase(true);

        // Fetch Continue Watching history asynchronously
        fetchContinueWatching(tgUser?.id, data)
          .then(items => setContinueWatchingList(items || []))
          .catch(() => {});

        // 4. DEEP-LINKED AUTO-PLAY ROUTER: Auto-launch Video Player or Details Modal if ?movie=UID & ?play=true
        try {
          const searchParams = new URLSearchParams(window.location.search);
          const tgStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || '';

          const targetMovieUid = searchParams.get('movie') || 
                                searchParams.get('movie_id') || 
                                searchParams.get('uid') || 
                                tgStartParam.replace(/^movie_/, '');
          
          const autoPlayRequested = searchParams.get('play') === 'true' || 
                                    searchParams.get('play') === '1' || 
                                    searchParams.has('autoplay');

          if (targetMovieUid) {
            const foundMovie = data.find(m => 
              String(m.uid || '').toLowerCase() === targetMovieUid.toLowerCase() ||
              String(m.id || '').toLowerCase() === targetMovieUid.toLowerCase() ||
              String(m.title || '').toLowerCase().includes(targetMovieUid.toLowerCase())
            );

            if (foundMovie) {
              if (autoPlayRequested) {
                console.log('[Deep-Link Auto-Play] Auto-launching Video Player for:', foundMovie.title);
                setActivePlayingMovie(foundMovie);
              } else {
                console.log('[Deep-Link Router] Auto-opening Movie Details for:', foundMovie.title);
                setSelectedMovie(foundMovie);
              }
            }
          }
        } catch (deepLinkErr) {
          console.warn('[Deep-Link Router] Parameter parsing note:', deepLinkErr);
        }
      } else if (!cached || cached.length === 0) {
        setMoviesList([]);
        setIsLiveDatabase(false);
      }

      setIsLoadingSupabase(false);
    }

    loadDatabaseAndUser();
  }, []);

  // Admin Streaming Mode State ('both' | 'download_only' | 'stream_only')
  const [streamingMode, setStreamingMode] = useState(() => {
    try {
      return localStorage.getItem('smd_prime_streaming_mode') || 'both';
    } catch (e) {
      return 'both';
    }
  });

  // Listen for admin streaming mode updates live across DB and events
  useEffect(() => {
    getGlobalStreamingMode().then(mode => {
      if (mode) setStreamingMode(mode);
    });

    const handleStorageChange = (e) => {
      try {
        const mode = e?.detail || localStorage.getItem('smd_prime_streaming_mode') || 'both';
        setStreamingMode(mode);
      } catch (err) {}
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('smd_streaming_mode_changed', handleStorageChange);
    document.addEventListener('smd_streaming_mode_changed', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('smd_streaming_mode_changed', handleStorageChange);
      document.removeEventListener('smd_streaming_mode_changed', handleStorageChange);
    };
  }, []);

  // Dynamic Current User Role State ('normal' | 'vip' | 'admin' | 'super_admin')
  const [currentUserRole, setCurrentUserRole] = useState('normal');

  // Synchronize Ad Engine & User Role with dynamic Role Policies & DB
  useEffect(() => {
    const resolveUserRole = async () => {
      const tgUser = getTelegramUserInfo();
      // ═══════════════════════════════════════════════════════════════
      // 🔐 IRON GATE - DB IS THE SINGLE SOURCE OF TRUTH FOR ROLES
      // ═══════════════════════════════════════════════════════════════
      if (tgUser?.id) {
        const dbRole = await getUserRoleFromSupabase(tgUser.id);
        if (dbRole) {
          const norm = String(dbRole).toLowerCase().trim();
          // super_admin & admin: grant admin list access
          if (norm === 'super_admin' || norm === 'admin') {
            addAdminUser(tgUser.id);
            return norm; // return exact role ('super_admin' or 'admin')
          } else {
            // 🚨 DB says vip/normal → PURGE stale localStorage admin cache immediately!
            removeAdminUser(tgUser.id);
            return norm; // 'vip' | 'normal'
          }
        }
      }

      // 2. Fallback: ENV-pinned Super Admin IDs (Dev ID 0 / localhost)
      if (isSuperAdminUser(tgUser?.id)) return 'super_admin';
      if (isAdminUser(tgUser?.id))      return 'admin';

      // 3. Default
      return 'normal';
    };

    const syncAdsForCurrentUser = async () => {
      const userRole = await resolveUserRole();
      setCurrentUserRole(userRole || 'normal');

      // 🔐 IRON GATE: Auto-close admin modal IMMEDIATELY for non-admin roles!
      const isPrivilegedRole = userRole === 'admin' || userRole === 'super_admin';
      if (!isPrivilegedRole && isAdminOpen) {
        setIsAdminOpen(false);
      }

      const policies = await getRolePolicies();
      const entitlements = getUserEntitlements(userRole, policies);

      // HARD GUARD: Admin/Super Admin never sees ads!
      const shouldEnable = isPrivilegedRole ? false : (entitlements.enable_ads !== false);
      syncAdEngine(shouldEnable);
    };

    syncAdsForCurrentUser();

    const handleSync = (e) => {
      const updatedRole = e?.detail?.role || e?.detail?.newRole;
      if (updatedRole) {
        const normRole = String(updatedRole).toLowerCase().trim();
        setCurrentUserRole(normRole);
        // 🔐 Close admin panel if role downgraded to vip/normal
        if (normRole !== 'admin' && normRole !== 'super_admin') {
          setIsAdminOpen(false);
        }
      }
      syncAdsForCurrentUser();
    };

    const currentTgUser = getTelegramUserInfo();
    const unsubscribeRealtime = subscribeToRealtimeRoleAndPolicy(
      currentTgUser?.id,
      (newRole) => {
        if (newRole) {
          const norm = String(newRole).toLowerCase().trim();
          setCurrentUserRole(norm);
          if (norm !== 'admin' && norm !== 'super_admin') setIsAdminOpen(false);
        }
        syncAdsForCurrentUser();
      },
      () => syncAdsForCurrentUser()
    );

    window.addEventListener('smd_role_policies_changed', handleSync);
    document.addEventListener('smd_role_policies_changed', handleSync);
    window.addEventListener('smd_user_role_updated', handleSync);
    document.addEventListener('smd_user_role_updated', handleSync);
    window.addEventListener('smd_user_role_changed', handleSync);
    document.addEventListener('smd_user_role_updated', handleSync);
    document.addEventListener('smd_user_role_changed', handleSync);

    return () => {
      if (unsubscribeRealtime) unsubscribeRealtime();
      window.removeEventListener('smd_role_policies_changed', handleSync);
      document.removeEventListener('smd_role_policies_changed', handleSync);
      window.removeEventListener('smd_user_role_updated', handleSync);
      window.removeEventListener('smd_user_role_changed', handleSync);
      document.removeEventListener('smd_user_role_updated', handleSync);
      document.removeEventListener('smd_user_role_changed', handleSync);
    };
  }, [isAdminOpen]);

  // Sort By state for catalog movies ('default' | 'year_desc' | 'year_asc' | 'rating_desc' | 'rating_asc' | 'title_asc' | 'title_desc' | 'quality_4k' | 'tamil_first' | 'sources_desc')
  const [sortByOption, setSortByOption] = useState(() => {
    try {
      return localStorage.getItem('smd_sort_by_option') || 'default';
    } catch (e) {
      return 'default';
    }
  });

  const handleSortChange = (newSort) => {
    triggerHaptic('medium');
    setSortByOption(newSort);
    try {
      localStorage.setItem('smd_sort_by_option', newSort);
    } catch (e) {}
  };

  // Filter & sort movies strictly from Google Drive synced list
  const sortedMoviesList = React.useMemo(() => {
    return sortMoviesByOption(moviesList, sortByOption);
  }, [moviesList, sortByOption]);

  const heroMovie = sortedMoviesList.length > 0 ? (sortedMoviesList.find((m) => m.isHero) || sortedMoviesList[0]) : null;
  const trendingMovies = sortedMoviesList.filter((m) => m.trending || Number(m.rating) >= 7.5);
  const actionMovies = sortedMoviesList.filter((m) => /action/i.test(m.genre || ''));
  const sciFiMovies = sortedMoviesList.filter((m) => /sci/i.test(m.genre || ''));
  const dramaMovies = sortedMoviesList.filter((m) => /drama/i.test(m.genre || ''));

  const categories = ['All', 'Trending', 'Action', 'Sci-Fi', 'Drama', 'Thriller', 'Comedy'];

  // Dynamic Live Category File Counts Calculation Engine
  const categoryCounts = React.useMemo(() => {
    const counts = {};
    counts['All'] = sortedMoviesList.length;
    counts['Trending'] = trendingMovies.length;
    counts['Action'] = actionMovies.length;
    counts['Sci-Fi'] = sciFiMovies.length;
    counts['Drama'] = dramaMovies.length;
    counts['Thriller'] = sortedMoviesList.filter((m) => /thriller/i.test(m.genre || '')).length;
    counts['Comedy'] = sortedMoviesList.filter((m) => /comedy/i.test(m.genre || '')).length;
    return counts;
  }, [sortedMoviesList, trendingMovies, actionMovies, sciFiMovies, dramaMovies]);

  // Localhost Dev Mock User Switcher Engine
  const [activeDevUser, setActiveDevUser] = useState(() => {
    try {
      const stored = localStorage.getItem('smd_dev_mock_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  });

  const devMockUsers = [
    { id: 6619130727, username: 'GTM_RX_1', first_name: 'Gowtham $X', role: 'super_admin', label: '👑 Gowtham (Super Admin)' },
    { id: 6846236707, username: 'SMDOwner', first_name: 'SPARROW™', role: 'vip', label: '⭐ Sparrow (VIP)' },
    { id: 885675538,  username: 'SMDxTG', first_name: 'SMDxTG', role: 'admin', label: '🛡️ SMDxTG (Admin)' },
    { id: 5718648078, username: 'JalebiBae', first_name: 'Mobius', role: 'normal', label: '👤 Mobius (Normal)' }
  ];

  const switchDevUser = async (user) => {
    try {
      // ⚡ Fetch live avatar_url & role directly from Supabase DB
      let realAvatar = '';
      let realRole = user.role;

      const { data: dbUser } = await supabase
        .from('users')
        .select('avatar_url, role, username, first_name')
        .eq('telegram_user_id', user.id)
        .maybeSingle();

      if (dbUser) {
        if (dbUser.avatar_url) realAvatar = dbUser.avatar_url;
        if (dbUser.role) realRole = dbUser.role.toLowerCase();
      }

      const mockObj = { 
        id: user.id, 
        telegram_id: user.id,
        username: dbUser?.username || user.username, 
        first_name: dbUser?.first_name || user.first_name, 
        photo_url: realAvatar,
        avatar_url: realAvatar 
      };

      localStorage.setItem('smd_dev_mock_user', JSON.stringify(mockObj));
      setActiveDevUser(mockObj);
      setCurrentUserRole(realRole);

      const evt = new CustomEvent('smd_user_role_changed', { detail: { role: realRole } });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
      triggerHaptic('medium');
    } catch (e) {
      console.warn('switchDevUser note:', e);
    }
  };

  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className={`min-h-screen transition-colors duration-500 relative flex flex-col items-stretch justify-start w-full ${
      darkMode 
        ? 'bg-[#0c0f18] text-zinc-100' 
        : 'bg-gradient-to-br from-slate-100 via-rose-50/20 via-50% to-indigo-50/30 text-slate-900'
    }`}>

      {/* 🧪 LOCALHOST DEV ROLE TESTING TOOLBAR */}
      {isLocalhost && (
        <div className="z-50 bg-yellow-500/10 border-b border-yellow-500/30 px-3 py-1.5 backdrop-blur-md flex items-center justify-between text-[11px] gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 font-bold text-yellow-400 shrink-0">
            <span>🧪 DEV ROLE TESTER:</span>
            <span className="font-mono bg-yellow-400/20 px-1.5 py-0.5 rounded text-yellow-300 uppercase font-black">
              Current: {currentUserRole}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {devMockUsers.map(u => (
              <button
                key={u.id}
                onClick={() => switchDevUser(u)}
                className={`px-2 py-0.5 rounded-full font-bold transition-all text-[10px] active:scale-95 ${
                  (activeDevUser?.id === u.id || (currentUserRole === u.role && !activeDevUser))
                    ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/30 font-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Ambient Radial Background Light Blobs for Modern Depth */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className={`absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20 ${
          darkMode ? 'bg-red-900' : 'bg-red-400'
        }`} />
        <div className={`absolute top-1/3 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20 ${
          darkMode ? 'bg-indigo-900' : 'bg-sky-400'
        }`} />
      </div>

      {/* Main Application Responsive Container */}
      <div className={`w-full transition-all duration-300 relative z-10 ${
        isMobileDevice 
          ? 'max-w-md mx-auto min-h-screen relative' 
          : 'w-full min-h-screen px-4 sm:px-8'
      } ${
        darkMode 
          ? 'bg-[#0c0f18] text-zinc-100' 
          : 'bg-white text-slate-900'
      } relative pb-20`}>

        {/* Sticky App Header */}
        <Header
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenAdmin={() => setIsAdminOpen(true)}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          currentUserRole={currentUserRole}
        />

        {/* Category Tab Pills (Zero-Glitch Dissolve Bar with Live File Counts) */}
        <div className="sticky top-[61px] z-30 pointer-events-none overflow-hidden">
          <div className={`w-full px-4 py-2 transition-all duration-200 ease-out transform origin-top ${
            showCategoryBar
              ? 'opacity-100 scale-100 pointer-events-auto border-b'
              : 'opacity-0 scale-95 pointer-events-none border-b-0'
          } ${
            darkMode 
              ? 'bg-[#0c0f18]/85 backdrop-blur-3xl backdrop-saturate-200 border-white/[0.08] shadow-lg shadow-black/40' 
              : 'bg-white/85 backdrop-blur-3xl backdrop-saturate-200 border-slate-200/80 shadow-md'
          }`}>
            <div className="flex items-center justify-between gap-2 py-0.5">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-touch flex-1">
                {categories.map((cat) => {
                  const count = categoryCounts[cat] ?? 0;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveCategory(cat);
                      }}
                      className={`px-3.5 py-1.5 rounded-2xl text-xs font-extrabold transition-all whitespace-nowrap active:scale-95 flex items-center gap-1.5 ${
                        activeCategory === cat
                          ? 'bg-gradient-to-r from-red-600 via-red-500 to-rose-600 text-white shadow-lg shadow-red-600/35 border border-red-400/40 transform scale-[1.02]'
                          : darkMode
                            ? 'bg-zinc-900/90 text-zinc-300 border border-zinc-800/90 hover:bg-zinc-800/80 backdrop-blur-md'
                            : 'bg-white/90 text-slate-700 border border-slate-200/90 shadow-xs hover:bg-slate-100/90 backdrop-blur-md'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`px-1.5 py-0.2 text-[10px] font-mono rounded-full font-black ${
                        activeCategory === cat
                          ? 'bg-black/25 text-white'
                          : darkMode
                            ? 'bg-zinc-800 text-zinc-400'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* ⚡ High-ROI Sort By Dropdown Selector */}
              <div className="shrink-0 flex items-center gap-1.5 pl-2 border-l border-white/10">
                <div className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl border text-xs font-bold transition-all ${
                  darkMode 
                    ? 'bg-zinc-900/90 border-zinc-800 text-zinc-200 hover:border-zinc-700' 
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs'
                }`}>
                  <ArrowUpDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <select
                    value={sortByOption}
                    onChange={(e) => handleSortChange(e.target.value)}
                    className="bg-transparent border-none outline-none font-extrabold text-[11px] cursor-pointer appearance-none pr-4 text-inherit"
                    aria-label="Sort Movies By"
                  >
                    <option value="default" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>✨ Default</option>
                    <option value="year_desc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>📅 Release Year (Newest)</option>
                    <option value="year_asc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>📅 Release Year (Oldest)</option>
                    <option value="rating_desc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>⭐ IMDb Rating (Highest)</option>
                    <option value="rating_asc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>⭐ IMDb Rating (Lowest)</option>
                    <option value="title_asc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>🔤 Title (A to Z)</option>
                    <option value="title_desc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>🔤 Title (Z to A)</option>
                    <option value="quality_4k" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>💎 4K Ultra HD First</option>
                    <option value="tamil_first" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>🎬 Tamil Audio First</option>
                    <option value="sources_desc" className={darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-slate-900'}>⚡ Most Sources</option>
                  </select>
                  <span className="absolute right-2 pointer-events-none text-[9px]">▼</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Indicator for Supabase */}
        {isLoadingSupabase && (
          <div className="flex items-center justify-center gap-2.5 py-12 text-xs font-extrabold text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-red-600" />
            <span>Fetching Live SMD Media Library...</span>
          </div>
        )}

        {/* Main Body Content */}
        {!isLoadingSupabase && (
          <main className="px-4">
            
            {/* Empty State if No Files Synced */}
            {moviesList.length === 0 ? (
              <div className={`my-16 py-12 text-center flex flex-col items-center justify-center border border-dashed rounded-3xl p-6 ${
                darkMode ? 'border-zinc-800 bg-zinc-900/40' : 'border-slate-300 bg-slate-50/50'
              }`}>
                <Film className="w-12 h-12 text-red-600 mb-3 animate-pulse" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">
                  No Movies Found in Library
                </h3>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed font-medium">
                  No active streams available in the cloud library. Please check back soon for new movie additions.
                </p>
              </div>
            ) : (
              <>
                {/* Featured Hero Banner */}
                {heroMovie && (activeCategory === 'All' || activeCategory === 'Trending') && (
                  <HeroBanner
                    movie={heroMovie}
                    onPlay={(m) => {
                      if (streamingMode === 'download_only') {
                        setSelectedMovie(m);
                      } else {
                        setActivePlayingMovie(m);
                      }
                    }}
                    onSelectMovie={(m) => setSelectedMovie(m)}
                    darkMode={darkMode}
                    streamingMode={streamingMode}
                  />
                )}

                {/* Continue Watching Row */}
                {continueWatchingList.length > 0 && (activeCategory === 'All' || activeCategory === 'Trending') && (
                  <MovieRow
                    title="Continue Watching"
                    movies={continueWatchingList}
                    onSelectMovie={(m) => setSelectedMovie(m)}
                    onPlay={(m) => {
                      if (streamingMode === 'download_only') {
                        setSelectedMovie(m);
                      } else {
                        setActivePlayingMovie(m);
                      }
                    }}
                    darkMode={darkMode}
                    icon={<History className="w-5 h-5 text-red-600 animate-pulse" />}
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
                        onPlay={(m) => {
                          if (streamingMode === 'download_only') {
                            setSelectedMovie(m);
                          } else {
                            setActivePlayingMovie(m);
                          }
                        }}
                        darkMode={darkMode}
                        onViewAll={() => setActiveCategory('Trending')}
                        icon={<Flame className="w-5 h-5 fill-red-600 text-red-600 animate-pulse" />}
                      />
                    )}

                    {actionMovies.length > 0 && (
                      <MovieRow
                        title="Action Blockbusters"
                        movies={actionMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => {
                          if (streamingMode === 'download_only') {
                            setSelectedMovie(m);
                          } else {
                            setActivePlayingMovie(m);
                          }
                        }}
                        darkMode={darkMode}
                        onViewAll={() => setActiveCategory('Action')}
                        icon={<Zap className="w-5 h-5 text-amber-500" />}
                      />
                    )}

                    {sciFiMovies.length > 0 && (
                      <MovieRow
                        title="Sci-Fi & Cyberpunk"
                        movies={sciFiMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => {
                          if (streamingMode === 'download_only') {
                            setSelectedMovie(m);
                          } else {
                            setActivePlayingMovie(m);
                          }
                        }}
                        darkMode={darkMode}
                        onViewAll={() => setActiveCategory('Sci-Fi')}
                        icon={<Compass className="w-5 h-5 text-cyan-400" />}
                      />
                    )}

                    {dramaMovies.length > 0 && (
                      <MovieRow
                        title="Dramatic Classics"
                        movies={dramaMovies}
                        onSelectMovie={(m) => setSelectedMovie(m)}
                        onPlay={(m) => {
                          if (streamingMode === 'download_only') {
                            setSelectedMovie(m);
                          } else {
                            setActivePlayingMovie(m);
                          }
                        }}
                        darkMode={darkMode}
                        onViewAll={() => setActiveCategory('Drama')}
                        icon={<Clapperboard className="w-5 h-5 text-emerald-400" />}
                      />
                    )}

                    {/* Catch-all for movies in synced library */}
                    <MovieRow
                      title="All Synced Library Files"
                      movies={sortedMoviesList}
                      onSelectMovie={(m) => setSelectedMovie(m)}
                      onPlay={(m) => {
                        if (streamingMode === 'download_only') {
                          setSelectedMovie(m);
                        } else {
                          setActivePlayingMovie(m);
                        }
                      }}
                      darkMode={darkMode}
                      onViewAll={() => setIsSearchOpen(true)}
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
                      {sortedMoviesList
                        .filter((m) => activeCategory === 'Trending' ? m.trending : m.genre === activeCategory)
                        .map((movie) => (
                          <div key={movie.id} className="flex justify-center">
                            <MovieRow
                              movies={[movie]}
                              onSelectMovie={(m) => setSelectedMovie(m)}
                              onPlay={(m) => {
                                if (streamingMode === 'download_only') {
                                  setSelectedMovie(m);
                                } else {
                                  setActivePlayingMovie(m);
                                }
                              }}
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
          darkMode ? 'border-zinc-800/80 text-zinc-500' : 'border-slate-200/80 text-slate-400'
        }`}>
          <div className="px-4 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span className="text-red-600">SMD PRIME</span>
              <span>•</span>
              <span>PREMIUM CLOUD CINEMA</span>
            </div>
            <p className="text-[10px] font-medium text-slate-400">
              Ultra High Definition Direct Streaming
            </p>
          </div>
        </footer>

      </div>

      {/* Details Sheet Modal (Rendered at Root Level for True Viewport Anchoring) */}
      {selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={closeMovieDetail}
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
          onClose={closePlayer}
        />
      )}

      {/* Live Search Overlay */}
      {isSearchOpen && (
        <SearchOverlay
          movies={moviesList}
          onClose={closeSearch}
          onSelectMovie={(m) => {
            setIsSearchOpen(false);
            setSelectedMovie(m);
          }}
          onPlay={(m) => {
            setIsSearchOpen(false);
            if (streamingMode === 'download_only') {
              setSelectedMovie(m);
            } else {
              setActivePlayingMovie(m);
            }
          }}
          streamingMode={streamingMode}
          darkMode={darkMode}
        />
      )}

      {/* Admin Command Center Modal */}
      {isAdminOpen && (
        <AdminModal
          onClose={closeAdmin}
          darkMode={darkMode}
          totalMoviesCount={moviesList.length}
        />
      )}

    </div>
  );
}
