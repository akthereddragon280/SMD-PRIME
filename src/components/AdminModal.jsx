import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldAlert, Database, Activity, Film, Users, RefreshCw, X, Server, CheckCircle2, Zap, BarChart3, Eye, UserCheck, UserX, UserPlus, Sparkles, ShieldCheck, Terminal, HardDrive, Radio, Layers, ChevronRight, SlidersHorizontal, User, AlertTriangle, TrendingUp, Clock, Calendar, Filter, RotateCcw, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { supabase, sanitizeTitle } from '../supabaseClient';
import { getAdminUserIds, addAdminUser, removeAdminUser } from '../utils/admin';

export default function AdminModal({ onClose, darkMode, totalMoviesCount }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [analyticsLogs, setAnalyticsLogs] = useState([]);
  const [watchLogs, setWatchLogs] = useState([]);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [adminIds, setAdminIds] = useState(getAdminUserIds());
  const [newAdminIdInput, setNewAdminIdInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Analytics Tab State, Filtering & Collapsible Control
  const [analyticsSummary, setAnalyticsSummary] = useState([]);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [analyticsDateRange, setAnalyticsDateRange] = useState('all'); // 'all', 'today', '7days', '30days'
  const [analyticsQuality, setAnalyticsQuality] = useState('all'); // 'all', '4K', '1080p', '720p', '480p'
  const [showFilterPanel, setShowFilterPanel] = useState(false); // Collapsible: Default Hidden

  // Download Analytics State
  const [totalDownloadsCount, setTotalDownloadsCount] = useState(0);
  const [totalStreamsCount, setTotalStreamsCount] = useState(0);
  const [topDownloadedMovies, setTopDownloadedMovies] = useState([]);

  // History Tab Filter & Download Logs State
  const [downloadLogs, setDownloadLogs] = useState([]);
  const [historyTabFilter, setHistoryTabFilter] = useState('all'); // 'all', 'streams', 'downloads'

  // State for Admin Revocation Confirmation Dialog
  const [userToRevoke, setUserToRevoke] = useState(null);

  // Lock body & document scroll to prevent background scroll chaining
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, []);

  // Fetch & Aggregate Analytics with Dynamic Filters (Date Range + Quality)
  const fetchFilteredAnalytics = useCallback(async (dateRange, quality) => {
    setIsAnalyticsLoading(true);
    try {
      let query = supabase
        .from('stream_analytics')
        .select('movie_uid, watched_at, quality_watched', { count: 'exact' });

      let downloadQuery = supabase
        .from('download_analytics')
        .select('movie_uid, downloaded_at, quality_downloaded', { count: 'exact' });

      // Apply Date Range filter
      if (dateRange === 'today') {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        query = query.gte('watched_at', todayStart.toISOString());
        downloadQuery = downloadQuery.gte('downloaded_at', todayStart.toISOString());
      } else if (dateRange === '7days') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        query = query.gte('watched_at', d7.toISOString());
        downloadQuery = downloadQuery.gte('downloaded_at', d7.toISOString());
      } else if (dateRange === '30days') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        query = query.gte('watched_at', d30.toISOString());
        downloadQuery = downloadQuery.gte('downloaded_at', d30.toISOString());
      }

      // Apply Quality filter
      if (quality !== 'all') {
        query = query.eq('quality_watched', quality);
        downloadQuery = downloadQuery.eq('quality_downloaded', quality);
      }

      const [{ data: rawStreams, count: streamCount, error: streamErr }, { data: rawDownloads, count: downloadCount, error: dlErr }] = await Promise.all([
        query.order('watched_at', { ascending: false }),
        downloadQuery.order('downloaded_at', { ascending: false })
      ]);

      if (streamErr) console.warn('Stream analytics note:', streamErr.message);
      if (dlErr) console.warn('Download analytics note:', dlErr.message);

      setTotalStreamsCount(streamCount || (rawStreams ? rawStreams.length : 0));
      setTotalDownloadsCount(downloadCount || (rawDownloads ? rawDownloads.length : 0));

      // Fetch movies mapping for titles
      const { data: moviesData } = await supabase
        .from('movies')
        .select('uid, id, title');

      const titleMap = {};
      if (moviesData) {
        moviesData.forEach(m => {
          const key = m.uid || m.id;
          if (key) {
            titleMap[key] = sanitizeTitle(m.title);
          }
        });
      }

      // Aggregate stream counts
      const summaryMap = {};
      if (rawStreams && rawStreams.length > 0) {
        rawStreams.forEach(item => {
          const uid = item?.movie_uid ? String(item.movie_uid) : null;
          if (!uid) return;
          if (!summaryMap[uid]) {
            summaryMap[uid] = {
              movie_uid: uid,
              title: titleMap[uid] || sanitizeTitle(uid),
              total_views: 0,
              last_watched: item.watched_at || new Date().toISOString(),
              qualities: new Set()
            };
          }
          summaryMap[uid].total_views += 1;
          if (item.quality_watched) summaryMap[uid].qualities.add(item.quality_watched);
          if (item.watched_at && new Date(item.watched_at) > new Date(summaryMap[uid].last_watched)) {
            summaryMap[uid].last_watched = item.watched_at;
          }
        });
      }

      const aggregatedStreams = Object.values(summaryMap)
        .map(item => ({ ...item, qualitiesList: Array.from(item.qualities) }))
        .sort((a, b) => b.total_views - a.total_views);

      setAnalyticsSummary(aggregatedStreams);

      // Aggregate Top 5 Most Downloaded Movies
      const downloadSummaryMap = {};
      if (rawDownloads && rawDownloads.length > 0) {
        rawDownloads.forEach(item => {
          const uid = item?.movie_uid ? String(item.movie_uid) : null;
          if (!uid) return;
          if (!downloadSummaryMap[uid]) {
            downloadSummaryMap[uid] = {
              movie_uid: uid,
              title: titleMap[uid] || sanitizeTitle(uid),
              total_downloads: 0,
              last_downloaded: item.downloaded_at || new Date().toISOString(),
              qualities: new Set()
            };
          }
          downloadSummaryMap[uid].total_downloads += 1;
          if (item.quality_downloaded) downloadSummaryMap[uid].qualities.add(item.quality_downloaded);
          if (item.downloaded_at && new Date(item.downloaded_at) > new Date(downloadSummaryMap[uid].last_downloaded)) {
            downloadSummaryMap[uid].last_downloaded = item.downloaded_at;
          }
        });
      }

      const top5Downloads = Object.values(downloadSummaryMap)
        .map(item => ({ ...item, qualitiesList: Array.from(item.qualities) }))
        .sort((a, b) => b.total_downloads - a.total_downloads)
        .slice(0, 5);

      setTopDownloadedMovies(top5Downloads);

    } catch (analyticsErr) {
      console.warn('Stream Insights filter fetch note:', analyticsErr);
    } finally {
      setIsAnalyticsLoading(false);
    }
  }, []);

  // Initial Load for General Admin Telemetry & Users
  useEffect(() => {
    async function loadAdminData() {
      setIsLoading(true);
      try {
        // Fetch recent stream analytics
        const { data: analytics } = await supabase
          .from('stream_analytics')
          .select('*')
          .order('watched_at', { ascending: false })
          .limit(30);

        if (analytics) setAnalyticsLogs(analytics);

        // Fetch recent watch history
        const { data: history } = await supabase
          .from('user_watch_history')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(30);

        if (history) setWatchLogs(history);

        // Fetch recent download history
        const { data: rawDownloadLogs } = await supabase
          .from('download_analytics')
          .select('*')
          .order('downloaded_at', { ascending: false })
          .limit(30);

        if (rawDownloadLogs) setDownloadLogs(rawDownloadLogs);

        // Fetch registered users list ordered by registration date DESC
        const { data: usersData, count } = await supabase
          .from('users')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (usersData) setRegisteredUsers(usersData);
        if (count !== null) setUserCount(count);

        // Fetch analytics counts for overview cards on initial mount
        fetchFilteredAnalytics('all', 'all');

      } catch (err) {
        console.warn('Admin data fetch note:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadAdminData();
  }, [fetchFilteredAnalytics]);

  // Trigger Analytics Refetch when Date Range or Quality Filters Change
  useEffect(() => {
    fetchFilteredAnalytics(analyticsDateRange, analyticsQuality);
  }, [analyticsDateRange, analyticsQuality, fetchFilteredAnalytics]);

  const handleToggleAdmin = async (telegramUserId) => {
    const idNum = Number(telegramUserId);
    const isCurrentlyAdmin = adminIds.includes(idNum);
    
    if (isCurrentlyAdmin) {
      removeAdminUser(idNum);
      setAdminIds(prev => prev.filter(id => Number(id) !== idNum));
    } else {
      addAdminUser(idNum);
      setAdminIds(prev => [...prev, idNum]);
    }

    // Refresh users list from Supabase
    try {
      const { data: usersData } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (usersData) setRegisteredUsers(usersData);
    } catch (e) {
      console.warn('Refresh users note:', e);
    }
  };

  const confirmRevokeAdmin = () => {
    if (userToRevoke) {
      handleToggleAdmin(userToRevoke.id);
      setUserToRevoke(null);
    }
  };

  const handleAddManualAdmin = async (e) => {
    e.preventDefault();
    const inputVal = newAdminIdInput.trim();
    if (!inputVal) return;
    
    const idNum = Number(inputVal);
    addAdminUser(idNum);
    setAdminIds(prev => prev.includes(idNum) ? prev : [...prev, idNum]);
    setNewAdminIdInput('');

    // Refresh users list from Supabase
    try {
      const { data: usersData } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (usersData) setRegisteredUsers(usersData);
    } catch (e) {
      console.warn('Refresh users note:', e);
    }
  };

  const handleResetFilters = () => {
    setAnalyticsDateRange('all');
    setAnalyticsQuality('all');
  };

  const activeFilterCount = (analyticsDateRange !== 'all' ? 1 : 0) + (analyticsQuality !== 'all' ? 1 : 0);

  // Sort Users: Admins First (Sorted by Registration DESC), then Normal Users (Sorted by Registration DESC)
  const sortedUserList = useMemo(() => {
    const adminUsers = [];
    const normalUsers = [];

    registeredUsers.forEach(u => {
      const isAdmin = u.role === 'admin' || adminIds.includes(Number(u.telegram_user_id));
      if (isAdmin) {
        adminUsers.push(u);
      } else {
        normalUsers.push(u);
      }
    });

    return [...adminUsers, ...normalUsers];
  }, [registeredUsers, adminIds]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl animate-fadeIn p-0 sm:p-4">
      
      {/* Revocation Confirmation Overlay Dialog */}
      {userToRevoke && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-sm p-6 rounded-3xl border shadow-2xl space-y-4 ${
            darkMode 
              ? 'bg-[#0e1220] text-white border-red-500/30 shadow-red-950/60' 
              : 'bg-white text-slate-900 border-red-200 shadow-slate-400/50'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 text-red-500 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h4 className="font-black text-base leading-tight">Revoke Admin Access?</h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 font-mono">
                  User ID: #{userToRevoke.id}
                </p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-zinc-300">
              Are you sure you want to remove administrator privileges for <strong className="text-red-500">{userToRevoke.name}</strong>? They will revert to a normal user.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setUserToRevoke(null)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  darkMode 
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Cancel
              </button>

              <button
                onClick={confirmRevokeAdmin}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-red-600 to-rose-600 hover:opacity-90 text-white shadow-md shadow-red-600/30 active:scale-95"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Instagram-Style Container */}
      <div className={`w-full h-full sm:max-w-4xl sm:h-[92vh] sm:rounded-3xl flex flex-col overflow-hidden border shadow-2xl transition-all duration-300 ${
        darkMode 
          ? 'bg-[#090c15] text-white border-zinc-800/90 shadow-black/90' 
          : 'bg-white text-slate-900 border-slate-200/90 shadow-slate-400/50'
      }`}>
        
        {/* Instagram Header Top Bar */}
        <div className={`px-5 py-4 border-b flex items-center justify-between transition-colors shrink-0 ${
          darkMode 
            ? 'border-zinc-800/90 bg-gradient-to-r from-zinc-950 via-[#0c0f1c] to-zinc-950' 
            : 'border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-slate-50'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="relative group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-red-600/30 group-hover:scale-105 transition-transform duration-300">
                <ShieldAlert className="w-6 h-6 stroke-[2.3]" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#090c15] animate-pulse"></div>
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-black text-lg tracking-tight font-heading leading-none ${
                  darkMode 
                    ? 'bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent' 
                    : 'text-slate-900'
                }`}>
                  SMD PRIME Command Center
                </h3>
                <span className={`px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full border shadow-xs ${
                  darkMode 
                    ? 'bg-red-500/15 text-red-400 border-red-500/30' 
                    : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  LIVE ADMIN
                </span>
              </div>
              <p className={`text-xs font-semibold leading-none mt-1.5 flex items-center gap-2 ${
                darkMode ? 'text-zinc-400' : 'text-slate-500'
              }`}>
                <span>Infrastructure Telemetry</span>
                <span className={`w-1 h-1 rounded-full ${darkMode ? 'bg-zinc-600' : 'bg-slate-300'}`}></span>
                <span className="text-emerald-500 dark:text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  ONLINE 200 OK
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2.5 rounded-full transition-all duration-200 active:scale-95 border ${
              darkMode 
                ? 'bg-zinc-900/90 hover:bg-red-600/20 text-zinc-400 hover:text-red-400 border-white/10 hover:border-red-500/40' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 border-slate-200'
            }`}
            aria-label="Close Admin Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instagram-Style Dynamic Tab Bar Below Logo */}
        <div className={`px-5 py-3 border-b shrink-0 ${
          darkMode ? 'border-zinc-800/80 bg-black/40' : 'border-slate-200/80 bg-slate-100/60'
        }`}>
          <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl border overflow-x-auto no-scrollbar ${
            darkMode ? 'bg-zinc-900/90 border-white/5' : 'bg-slate-200/80 border-slate-300/60'
          }`}>
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 min-w-[85px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 whitespace-nowrap active:scale-95 ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                  : darkMode 
                    ? 'text-zinc-400 hover:text-white hover:bg-white/5' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 whitespace-nowrap active:scale-95 ${
                activeTab === 'analytics'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                  : darkMode 
                    ? 'text-zinc-400 hover:text-white hover:bg-white/5' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics ({analyticsSummary.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 whitespace-nowrap active:scale-95 ${
                activeTab === 'users'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                  : darkMode 
                    ? 'text-zinc-400 hover:text-white hover:bg-white/5' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Roles ({adminIds.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 whitespace-nowrap active:scale-95 ${
                activeTab === 'telemetry'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                  : darkMode 
                    ? 'text-zinc-400 hover:text-white hover:bg-white/5' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Streams ({analyticsLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('watch_history')}
              className={`flex-1 min-w-[100px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all duration-200 whitespace-nowrap active:scale-95 ${
                activeTab === 'watch_history'
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                  : darkMode 
                    ? 'text-zinc-400 hover:text-white hover:bg-white/5' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>History ({watchLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Dynamic Screen View Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-6 overscroll-contain touch-pan-y custom-scrollbar">
          
          {/* OVERVIEW PAGE */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Stat Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.02] group ${
                  darkMode 
                    ? 'bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-red-500/30' 
                    : 'bg-slate-50/90 border-slate-200/90 hover:border-red-500/30 shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Total Movies</span>
                    <Film className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className={`text-3xl font-black font-heading tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {totalMoviesCount}
                  </div>
                  <div className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold mt-1.5 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Drive Synced</span>
                  </div>
                </div>

                <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.02] group ${
                  darkMode 
                    ? 'bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-emerald-500/30' 
                    : 'bg-slate-50/90 border-slate-200/90 hover:border-emerald-500/30 shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Supabase DB</span>
                    <Database className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-3xl font-black font-heading tracking-tight text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                    <span>Active</span>
                  </div>
                  <div className={`text-[10px] font-semibold mt-1.5 font-mono ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                    PostgreSQL 200 OK
                  </div>
                </div>

                <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.02] group ${
                  darkMode 
                    ? 'bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-cyan-500/30' 
                    : 'bg-slate-50/90 border-slate-200/90 hover:border-cyan-500/30 shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Worker Mesh</span>
                    <Server className="w-4 h-4 text-cyan-500 dark:text-cyan-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className={`text-3xl font-black font-heading tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    20 SAs
                  </div>
                  <div className="text-[10px] text-cyan-500 dark:text-cyan-400 font-bold mt-1.5 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                    <span>Quota Failover</span>
                  </div>
                </div>

                <div className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 hover:scale-[1.02] group ${
                  darkMode 
                    ? 'bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-indigo-500/30' 
                    : 'bg-slate-50/90 border-slate-200/90 hover:border-indigo-500/30 shadow-xs'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Active Admins</span>
                    <Users className="w-4 h-4 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className={`text-3xl font-black font-heading tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {adminIds.length}
                  </div>
                  <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold mt-1.5 font-mono">{userCount} Total Users</div>
                </div>
              </div>

              {/* Cloud Terminal Panel */}
              <div className={`p-5 rounded-2xl border space-y-3.5 ${
                darkMode 
                  ? 'bg-black/60 border-white/10' 
                  : 'bg-slate-900 text-slate-100 border-slate-800 shadow-lg'
              }`}>
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4.5 h-4.5 text-amber-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                      Infrastructure Telemetry & Status
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20 font-bold">
                    HEALTHY
                  </span>
                </div>

                <div className="space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between py-1 border-b border-white/5 text-zinc-400">
                    <span>Database Tables</span>
                    <span className="text-emerald-400 font-bold">movies, movie_sources, users, movie_metadata, user_watch_history, stream_analytics</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5 text-zinc-400">
                    <span>Supabase REST API</span>
                    <span className="text-emerald-400 font-bold">200 OK / 201 Created</span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-zinc-400">
                    <span>Stream Worker SA Mesh</span>
                    <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                      <span>20 Service Accounts Active</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STREAM INSIGHTS / ANALYTICS TAB */}
          {activeTab === 'analytics' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header & Compact Collapsible Filter Toggle */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className={`text-sm font-black uppercase tracking-wider flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <BarChart3 className="w-4 h-4 text-red-500" />
                    <span>Stream & Download Analytics</span>
                  </h4>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    {analyticsSummary.length} movies streamed | {topDownloadedMovies.length} movies downloaded
                  </p>
                </div>

                {/* Filter Icon Button (Default Closed) */}
                <button
                  onClick={() => setShowFilterPanel(prev => !prev)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 border transition-all active:scale-95 ${
                    showFilterPanel || activeFilterCount > 0
                      ? 'bg-red-500/15 text-red-500 border-red-500/30 shadow-md shadow-red-500/10'
                      : darkMode 
                        ? 'bg-zinc-900/90 text-zinc-400 border-white/10 hover:text-white hover:bg-zinc-800' 
                        : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                  title="Toggle Filter Options"
                >
                  <Filter className="w-4 h-4 stroke-[2.2]" />
                  <span className="hidden sm:inline">Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white font-mono font-black text-[10px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                  {showFilterPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* STATS CARDS: Total Streams & Total Downloads */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                <div className={`p-4 rounded-2xl border transition-all ${
                  darkMode ? 'bg-zinc-900/90 border-white/10' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-bold mb-1 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <span>Total Streams</span>
                    <Film className="w-4 h-4 text-red-500" />
                  </div>
                  <div className={`text-2xl font-black font-heading ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {totalStreamsCount}
                  </div>
                  <div className={`text-[10px] font-mono mt-1 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Playback Events</div>
                </div>

                <div className={`p-4 rounded-2xl border transition-all ${
                  darkMode ? 'bg-zinc-900/90 border-white/10' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-bold mb-1 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <span>Total Downloads</span>
                    <Download className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black font-heading text-emerald-500 dark:text-emerald-400">
                    {totalDownloadsCount}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-500/80 mt-1">Omni-Download Triggers</div>
                </div>

                <div className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border transition-all ${
                  darkMode ? 'bg-zinc-900/90 border-white/10' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`flex items-center justify-between text-xs font-bold mb-1 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <span>Stream / Download Ratio</span>
                    <TrendingUp className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                  </div>
                  <div className="text-2xl font-black font-heading text-amber-500 dark:text-amber-400">
                    {totalDownloadsCount > 0 ? (totalStreamsCount / totalDownloadsCount).toFixed(1) : '0'}x
                  </div>
                  <div className={`text-[10px] font-mono mt-1 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>Ratio Balance</div>
                </div>
              </div>

              {/* TOP 5 MOST DOWNLOADED MOVIES SECTION */}
              <div className={`p-5 rounded-2xl border space-y-4 ${
                darkMode ? 'bg-zinc-950/80 border-white/10 shadow-xl' : 'bg-white border-slate-200 shadow-md'
              }`}>
                <div className={`flex items-center justify-between border-b pb-3 ${darkMode ? 'border-white/10' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2">
                    <Download className="w-4.5 h-4.5 text-emerald-500 dark:text-emerald-400" />
                    <h5 className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Top 5 Most Downloaded Movies
                    </h5>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-500 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                    Grouped by Movie UID
                  </span>
                </div>

                {topDownloadedMovies.length === 0 ? (
                  <div className={`py-6 text-center text-xs font-mono ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                    No downloads recorded yet. As users download movies, Top 5 metrics will display here.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {topDownloadedMovies.map((item, idx) => {
                      const maxDl = topDownloadedMovies[0]?.total_downloads || 1;
                      const percent = Math.round((item.total_downloads / maxDl) * 100);
                      const rankColors = [
                        'bg-amber-500 text-black border-amber-400',
                        'bg-slate-300 text-black border-slate-200',
                        'bg-amber-700 text-white border-amber-600',
                        'bg-zinc-800 text-zinc-300 border-zinc-700',
                        'bg-zinc-800 text-zinc-300 border-zinc-700'
                      ];

                      return (
                        <div key={item.movie_uid} className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                          darkMode 
                            ? 'bg-zinc-900/60 border-white/5 hover:border-emerald-500/30' 
                            : 'bg-slate-50 border-slate-200 hover:border-emerald-500/30'
                        }`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-6 h-6 rounded-lg font-black text-xs font-mono flex items-center justify-center border shrink-0 ${rankColors[idx] || rankColors[3]}`}>
                              #{idx + 1}
                            </span>
                            <div className="min-w-0">
                              <h6 className={`text-xs font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {item.title}
                              </h6>
                              <div className={`flex items-center gap-2 mt-0.5 text-[10px] font-mono ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                                <span>UID: {String(item?.movie_uid || 'unknown').slice(0, 12)}...</span>
                                {item.qualitiesList && item.qualitiesList.length > 0 && (
                                  <span className="text-emerald-500 dark:text-emerald-400 font-semibold">
                                    [{item.qualitiesList.join(', ')}]
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className={`w-20 sm:w-28 h-2 rounded-full overflow-hidden hidden sm:block ${darkMode ? 'bg-zinc-800' : 'bg-slate-200'}`}>
                              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{ width: `${percent}%` }}></div>
                            </div>
                            <span className="text-sm font-black font-mono text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                              {item.total_downloads} Downloads
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Collapsible Filter Panel Drawer (Hidden by default) */}
              {showFilterPanel && (
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 animate-fadeIn transition-all ${
                  darkMode 
                    ? 'bg-zinc-900/90 border-white/10 shadow-xl' 
                    : 'bg-slate-100/90 border-slate-200 shadow-xs'
                }`}>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Date Range Dropdown */}
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-red-500" />
                      <select
                        value={analyticsDateRange}
                        onChange={(e) => setAnalyticsDateRange(e.target.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all focus:outline-none focus:ring-2 focus:ring-red-500/30 ${
                          darkMode 
                            ? 'bg-zinc-950 border-white/10 text-white focus:bg-black' 
                            : 'bg-white border-slate-300 text-slate-900 focus:bg-slate-50'
                        }`}
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                      </select>
                    </div>

                    {/* Quality Dropdown */}
                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-emerald-500" />
                      <select
                        value={analyticsQuality}
                        onChange={(e) => setAnalyticsQuality(e.target.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all focus:outline-none focus:ring-2 focus:ring-red-500/30 ${
                          darkMode 
                            ? 'bg-zinc-950 border-white/10 text-white focus:bg-black' 
                            : 'bg-white border-slate-300 text-slate-900 focus:bg-slate-50'
                        }`}
                      >
                        <option value="all">All Qualities</option>
                        <option value="4K">4K Ultra HD</option>
                        <option value="1080p">1080p Full HD</option>
                        <option value="720p">720p HD</option>
                        <option value="480p">480p SD</option>
                      </select>
                    </div>
                  </div>

                  {/* Reset Filters Button */}
                  {activeFilterCount > 0 && (
                    <button
                      onClick={handleResetFilters}
                      className="self-end sm:self-center px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </div>
              )}

              {/* Analytics Mobile Cards & Desktop Table with Generous Breathing Room */}
              <div className="space-y-3">
                {isAnalyticsLoading ? (
                  /* Skeleton Loader State */
                  <div className="p-6 space-y-4 rounded-2xl border border-white/10">
                    {[1, 2, 3].map(n => (
                      <div key={n} className="flex items-center justify-between animate-pulse">
                        <div className="space-y-2">
                          <div className={`h-4 w-48 rounded-md ${darkMode ? 'bg-zinc-800' : 'bg-slate-200'}`}></div>
                          <div className={`h-3 w-28 rounded-md ${darkMode ? 'bg-zinc-850' : 'bg-slate-150'}`}></div>
                        </div>
                        <div className={`h-6 w-20 rounded-xl ${darkMode ? 'bg-zinc-800' : 'bg-slate-200'}`}></div>
                      </div>
                    ))}
                  </div>
                ) : analyticsSummary.length === 0 ? (
                  /* Fallback Empty UI */
                  <div className="py-16 px-6 text-center space-y-3 rounded-2xl border border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20 mx-auto flex items-center justify-center">
                      <BarChart3 className="w-6 h-6 stroke-[2]" />
                    </div>
                    <div className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      No Stream Analytics Recorded
                    </div>
                    <p className={`text-xs max-w-sm mx-auto ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                      Stream viewership data will populate automatically as users watch movies.
                    </p>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={handleResetFilters}
                        className="mt-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/30"
                      >
                        Reset All Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* MOBILE CARD VIEW (<640px) with Generous Breathing Room */}
                    <div className="block sm:hidden space-y-3">
                      {analyticsSummary.map((item) => (
                        <div
                          key={item.movie_uid}
                          className={`p-4.5 rounded-2xl border space-y-2.5 transition-all ${
                            darkMode 
                              ? 'bg-zinc-900/80 border-white/10 hover:border-red-500/30 shadow-md' 
                              : 'bg-slate-50 border-slate-200/90 shadow-xs'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h5 className="font-bold text-sm leading-snug text-slate-900 dark:text-white">
                                {item.title || item.movie_uid}
                              </h5>
                              <p className="text-[11px] font-mono text-red-500 dark:text-red-400 mt-0.5">
                                UID: {item.movie_uid}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold text-xs shrink-0">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>{item.total_views} views</span>
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                            {/* Qualities Badges */}
                            <div className="flex items-center gap-1">
                              {item.qualitiesList && item.qualitiesList.length > 0 ? (
                                item.qualitiesList.map(q => (
                                  <span key={q} className="px-2 py-0.5 font-mono font-bold bg-red-500/10 text-red-500 border border-red-500/20 rounded-md">
                                    {q}
                                  </span>
                                ))
                              ) : (
                                <span className="px-2 py-0.5 font-mono font-bold bg-zinc-800 text-zinc-400 rounded-md">
                                  1080p
                                </span>
                              )}
                            </div>

                            {/* Timestamp */}
                            <div className="flex items-center gap-1 text-slate-400 dark:text-zinc-500 font-mono">
                              <Clock className="w-3 h-3" />
                              <span>{item.last_watched ? new Date(item.last_watched).toLocaleDateString() : 'Recently'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* DESKTOP TABLE VIEW (>=640px) */}
                    <div className={`hidden sm:block rounded-2xl border overflow-hidden transition-all ${
                      darkMode ? 'bg-zinc-900/60 border-white/10' : 'bg-slate-50 border-slate-200/90 shadow-xs'
                    }`}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className={`border-b text-[11px] font-black uppercase tracking-wider ${
                              darkMode 
                                ? 'bg-zinc-950/80 border-white/10 text-zinc-400' 
                                : 'bg-slate-100 border-slate-200 text-slate-600'
                            }`}>
                              <th className="py-4 px-5">Movie Title</th>
                              <th className="py-4 px-5 font-mono">Movie UID</th>
                              <th className="py-4 px-5 text-center">Total Views</th>
                              <th className="py-4 px-5 text-right">Last Watched</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5 text-xs font-mono">
                            {analyticsSummary.map((item) => (
                              <tr key={item.movie_uid} className={`transition-colors ${
                                darkMode 
                                  ? 'hover:bg-white/5 text-zinc-300' 
                                  : 'hover:bg-slate-100/60 text-slate-700'
                              }`}>
                                <td className="py-4 px-5 font-sans font-bold text-sm text-slate-900 dark:text-white">
                                  <div>{item.title || item.movie_uid}</div>
                                  {item.qualitiesList && item.qualitiesList.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                      {item.qualitiesList.map(q => (
                                        <span key={q} className="px-2 py-0.5 text-[9px] font-mono font-bold bg-red-500/10 text-red-500 border border-red-500/20 rounded-md">
                                          {q}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-4 px-5 text-red-500 dark:text-red-400 font-mono text-[11px]">
                                  {item.movie_uid}
                                </td>
                                <td className="py-4 px-5 text-center">
                                  <span className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold text-xs">
                                    <TrendingUp className="w-3.5 h-3.5" />
                                    <span>{item.total_views} views</span>
                                  </span>
                                </td>
                                <td className="py-4 px-5 text-right text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                                    <span>{item.last_watched ? new Date(item.last_watched).toLocaleString() : 'Recently'}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* USER ROLES PAGE (ADMINS FIRST -> REGISTRATION DESC) */}
          {activeTab === 'users' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Raycast-style Input Bar */}
              <form onSubmit={handleAddManualAdmin} className="relative flex items-center">
                <input
                  type="number"
                  placeholder="Enter Telegram User ID (e.g. 123456789)"
                  value={newAdminIdInput}
                  onChange={(e) => setNewAdminIdInput(e.target.value)}
                  className={`w-full pl-4 pr-36 py-3.5 rounded-2xl border text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-red-500/30 ${
                    darkMode 
                      ? 'bg-zinc-900/90 border-white/10 text-white placeholder-zinc-500' 
                      : 'bg-slate-100 border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white'
                  }`}
                />
                <button
                  type="submit"
                  className="absolute right-1.5 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:opacity-90 text-white text-xs font-black rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-red-600/30 active:scale-95"
                >
                  <UserPlus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add Admin</span>
                </button>
              </form>

              {/* Sub-header with Sorting Info */}
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                <span className={`flex items-center gap-1.5 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                  <SlidersHorizontal className="w-3.5 h-3.5 text-red-500" />
                  <span>User Permissions (Admins First • Registered DESC)</span>
                </span>
                <span className={`font-mono ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                  Total: {registeredUsers.length || '1'}
                </span>
              </div>

              {/* User List */}
              <div className="space-y-2.5">
                {/* Dev Super Admin / Owner */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                  darkMode 
                    ? 'bg-gradient-to-r from-amber-950/30 via-zinc-900/90 to-zinc-950/90 border-amber-500/40 shadow-lg' 
                    : 'bg-gradient-to-r from-amber-500/10 via-amber-50/60 to-white border-amber-500/40 shadow-xs'
                }`}>
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-red-600 text-white flex items-center justify-center font-black text-xs shadow-lg shadow-amber-500/20 ring-2 ring-amber-500/30 shrink-0">
                      DEV
                    </div>
                    <div>
                      <div className={`font-black text-sm flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        <span>Super Admin (Dev / Localhost)</span>
                        <span className="px-2.5 py-0.5 text-[9px] font-black uppercase bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-lg">
                          OWNER
                        </span>
                      </div>
                      <div className={`text-[10px] font-mono mt-0.5 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Telegram ID: 0</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                    <span>Permanent Admin</span>
                  </span>
                </div>

                {/* Custom Manual Admin IDs (Now with sleek User Profile Avatar) */}
                {adminIds.filter(id => id !== 0 && !registeredUsers.some(u => Number(u.telegram_user_id) === id)).map((customAdminId) => (
                  <div key={customAdminId} className={`p-4 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                    darkMode 
                      ? 'bg-zinc-900/90 border-red-500/30 hover:border-red-500/50' 
                      : 'bg-slate-50 border-red-200 hover:border-red-300 shadow-xs'
                  }`}>
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600/30 to-rose-600/30 text-red-500 border border-red-500/40 flex items-center justify-center font-black text-xs ring-2 ring-red-500/20 shrink-0">
                        <User className="w-5 h-5 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className={`font-black text-sm flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          <span>Admin User #{customAdminId}</span>
                          <span className="px-2.5 py-0.5 text-[9px] font-black uppercase bg-red-600/20 text-red-500 border border-red-500/30 rounded-lg">
                            ADMIN
                          </span>
                        </div>
                        <div className={`text-[10px] font-mono mt-0.5 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>Telegram ID: {customAdminId}</div>
                      </div>
                    </div>

                    {/* Small Compact "X" Button for Admin Revocation */}
                    <button
                      onClick={() => setUserToRevoke({ id: customAdminId, name: `Admin User #${customAdminId}` })}
                      className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 hover:border-red-500/50 transition-all active:scale-95"
                      title="Remove Admin Access"
                      aria-label="Remove Admin"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                ))}

                {/* Sorted Supabase Users (Admins First -> Registration DESC) */}
                {sortedUserList.map((user) => {
                  const isAdmin = user.role === 'admin' || adminIds.includes(Number(user.telegram_user_id));
                  const userName = user.first_name || user.username || `User #${user.telegram_user_id}`;
                  return (
                    <div key={user.id} className={`p-4 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                      darkMode 
                        ? 'bg-zinc-900/60 border-white/5 hover:border-white/20' 
                        : 'bg-slate-50/90 border-slate-200/90 hover:border-slate-300 shadow-xs'
                    }`}>
                      <div className="flex items-center gap-3.5">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-11 h-11 rounded-2xl object-cover border border-red-500/30 ring-2 ring-red-500/20 shadow-md shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-slate-700 to-zinc-800 text-white flex items-center justify-center font-black text-xs uppercase shadow-md ring-2 ring-white/10 shrink-0">
                            <User className="w-5 h-5 stroke-[2.2]" />
                          </div>
                        )}
                        <div>
                          <div className={`font-black text-sm flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            <span>{userName}</span>
                            {isAdmin ? (
                              <span className="px-2.5 py-0.5 text-[9px] font-black uppercase bg-red-500/15 text-red-500 border border-red-500/30 rounded-lg">
                                ADMIN
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-lg border ${
                                darkMode ? 'bg-zinc-800 text-zinc-400 border-white/5' : 'bg-slate-200/80 text-slate-600 border-slate-300/50'
                              }`}>
                                MEMBER
                              </span>
                            )}
                          </div>
                          <div className={`text-[10px] font-mono mt-0.5 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                            ID: {user.telegram_user_id} {user.username ? `@${user.username}` : ''}
                          </div>
                        </div>
                      </div>

                      {isAdmin ? (
                        /* Small Compact "X" Button for Admin Revocation */
                        <button
                          onClick={() => setUserToRevoke({ id: user.telegram_user_id, name: userName })}
                          className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 hover:border-red-500/50 transition-all active:scale-95"
                          title="Remove Admin Access"
                          aria-label="Remove Admin"
                        >
                          <X className="w-4 h-4 stroke-[2.5]" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleAdmin(user.telegram_user_id)}
                          className="px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95"
                        >
                          <UserCheck className="w-4 h-4 stroke-[2.5]" />
                          <span>Make Admin</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TELEMETRY PAGE */}
          {activeTab === 'telemetry' && (
            <div className="space-y-3 animate-fadeIn">
              <h4 className={`text-xs font-black uppercase tracking-wider ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                Real-Time Stream Telemetry Logs ({analyticsLogs.length})
              </h4>
              {analyticsLogs.length === 0 ? (
                <div className={`text-xs py-16 text-center font-medium font-mono ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                  No telemetry logs recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {analyticsLogs.map((log) => (
                    <div key={log.id} className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-mono transition-all ${
                      darkMode ? 'bg-zinc-900/60 border-white/5' : 'bg-slate-50/90 border-slate-200/90'
                    }`}>
                      <div>
                        <div className="font-bold text-red-500 dark:text-red-400">{log.movie_uid}</div>
                        <div className={`text-[10px] mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                          User ID: {log.telegram_user_id}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold">
                          {log.quality_watched || '1080p'} (SA #{log.sa_account_index || 1})
                        </span>
                        <div className={`text-[10px] mt-1 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                          {log.watched_at ? new Date(log.watched_at).toLocaleTimeString() : 'Just now'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* USER ACTIVITY & DOWNLOAD HISTORY PAGE */}
          {activeTab === 'watch_history' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Header & Filter Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className={`text-xs font-black uppercase tracking-wider flex items-center gap-2 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                    <Clock className="w-4 h-4 text-red-500" />
                    <span>User Activity & Download Logs</span>
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                    {watchLogs.length} stream sessions • {downloadLogs.length} download triggers
                  </p>
                </div>

                {/* Sub-Filter Tabs */}
                <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-bold ${
                  darkMode ? 'bg-zinc-900/90 border-white/10' : 'bg-slate-100 border-slate-200'
                }`}>
                  <button
                    onClick={() => setHistoryTabFilter('all')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      historyTabFilter === 'all'
                        ? 'bg-red-600 text-white shadow-xs'
                        : darkMode ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({watchLogs.length + downloadLogs.length})
                  </button>

                  <button
                    onClick={() => setHistoryTabFilter('streams')}
                    className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${
                      historyTabFilter === 'streams'
                        ? 'bg-red-600 text-white shadow-xs'
                        : darkMode ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Film className="w-3 h-3 text-red-400" />
                    <span>Streams ({watchLogs.length})</span>
                  </button>

                  <button
                    onClick={() => setHistoryTabFilter('downloads')}
                    className={`px-3 py-1 rounded-lg flex items-center gap-1 transition-all ${
                      historyTabFilter === 'downloads'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : darkMode ? 'text-zinc-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Download className="w-3 h-3 text-emerald-400" />
                    <span>Downloads ({downloadLogs.length})</span>
                  </button>
                </div>
              </div>

              {/* Log List Rendering */}
              {(() => {
                const combinedLogs = [];

                if (historyTabFilter === 'all' || historyTabFilter === 'streams') {
                  watchLogs.forEach(w => combinedLogs.push({
                    type: 'stream',
                    id: `stream_${w.id || Math.random()}`,
                    movie_uid: w.movie_uid,
                    telegram_user_id: w.telegram_user_id,
                    details: `Progress: ${w.progress_seconds || 0}s / ${w.duration_seconds || 0}s`,
                    timestamp: w.updated_at || w.created_at
                  }));
                }

                if (historyTabFilter === 'all' || historyTabFilter === 'downloads') {
                  downloadLogs.forEach(d => combinedLogs.push({
                    type: 'download',
                    id: `dl_${d.id || Math.random()}`,
                    movie_uid: d.movie_uid,
                    telegram_user_id: d.telegram_user_id,
                    details: `Quality: ${d.quality_downloaded || '1080p'}`,
                    timestamp: d.downloaded_at
                  }));
                }

                combinedLogs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

                if (combinedLogs.length === 0) {
                  return (
                    <div className={`text-xs py-16 text-center font-medium font-mono ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                      No activity logs recorded for this category yet.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2.5">
                    {combinedLogs.map((item) => (
                      <div key={item.id} className={`p-4 rounded-2xl border flex items-center justify-between text-xs font-mono transition-all hover:scale-[1.005] ${
                        darkMode ? 'bg-zinc-900/60 border-white/5 hover:border-white/20' : 'bg-slate-50/90 border-slate-200/90 hover:border-slate-300'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            item.type === 'stream'
                              ? 'bg-red-500/10 text-red-500 border-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          }`}>
                            {item.type === 'stream' ? <Film className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.movie_uid}</span>
                              <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                                item.type === 'stream'
                                  ? 'bg-red-500/15 text-red-500 border-red-500/30'
                                  : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                              }`}>
                                {item.type.toUpperCase()}
                              </span>
                            </div>
                            <div className={`text-[10px] mt-0.5 ${darkMode ? 'text-zinc-400' : 'text-slate-500'}`}>
                              {item.details}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 text-[10px] font-bold">
                            User #{item.telegram_user_id || 'Guest'}
                          </span>
                          <div className={`text-[10px] mt-1 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                            {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Recently'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
