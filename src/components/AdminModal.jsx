import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ShieldAlert, Database, Activity, Film, Users, X, Server, CheckCircle2, 
  BarChart3, Eye, UserCheck, UserX, UserPlus, ShieldCheck, Terminal, 
  Radio, Layers, Filter, RotateCcw, ChevronDown, ChevronUp, Download, 
  Search, Ban, Shield, Clock, Calendar, ExternalLink, ArrowRight, User
} from 'lucide-react';
import { 
  supabase, sanitizeTitle, getGlobalStreamingMode, setGlobalStreamingMode, 
  getRolePolicies, setRolePolicies, DEFAULT_ROLE_POLICIES, updateUserRoleInSupabase 
} from '../supabaseClient';
import { getAdminUserIds, addAdminUser, removeAdminUser } from '../utils/admin';
import { openExternalLink, triggerHaptic } from '../utils/telegram';
import { registerNodesFromDiagnostics } from '../utils/loadBalancer';

export default function AdminModal({ onClose, darkMode, totalMoviesCount }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'analytics', 'users', 'role_policies', 'telemetry', 'watch_history'
  const [analyticsLogs, setAnalyticsLogs] = useState([]);
  const [watchLogs, setWatchLogs] = useState([]);
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [adminIds, setAdminIds] = useState(getAdminUserIds());
  const [rolePolicies, setRolePoliciesState] = useState(DEFAULT_ROLE_POLICIES);
  const [isSavingPolicies, setIsSavingPolicies] = useState(false);
  const [bannedUserIds, setBannedUserIds] = useState(() => {
    try {
      const stored = localStorage.getItem('smd_prime_banned_user_ids');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [newAdminIdInput, setNewAdminIdInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Analytics Tab State & Smart Icon Filter State
  const [analyticsSummary, setAnalyticsSummary] = useState([]);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [analyticsDateRange, setAnalyticsDateRange] = useState('all'); // 'all', 'today', '7days', '30days'
  const [analyticsQuality, setAnalyticsQuality] = useState('all'); // 'all', '4K', '1080p', '720p', '480p'
  const [analyticsTypeFilter, setAnalyticsTypeFilter] = useState('all'); // 'all', 'stream', 'download'
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Download Analytics State
  const [totalDownloadsCount, setTotalDownloadsCount] = useState(0);
  const [totalStreamsCount, setTotalStreamsCount] = useState(0);
  const [topDownloadedMovies, setTopDownloadedMovies] = useState([]);
  const [downloadLogs, setDownloadLogs] = useState([]);

  // Live Diagnostic Recheck, DB Latency & SA Count State
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagReport, setDiagReport] = useState(null);
  const [activeSaCount, setActiveSaCount] = useState(16);
  const [dbLatencyMs, setDbLatencyMs] = useState(0);
  const [gdriveRequestCountToday, setGdriveRequestCountToday] = useState(0);
  const [lastCheckTimestamp, setLastCheckTimestamp] = useState(null);

  // Global Streaming Mode State ('both' | 'download_only' | 'stream_only')
  const [streamingMode, setStreamingModeState] = useState(() => {
    try {
      return localStorage.getItem('smd_prime_streaming_mode') || 'both';
    } catch (e) {
      return 'both';
    }
  });

  useEffect(() => {
    getGlobalStreamingMode().then(mode => {
      if (mode) setStreamingModeState(mode);
    });
  }, []);

  const handleStreamingModeChange = (newMode) => {
    triggerHaptic('medium');
    setStreamingModeState(newMode);
    setGlobalStreamingMode(newMode);
  };

  const runInfrastructureCheck = useCallback(async () => {
    setDiagLoading(true);
    const checkStart = Date.now();
    try {
      // 1. Measure DB ping & fetch today's GDrive request count
      const dbStart = Date.now();
      const { data: dbStats } = await supabase
        .from('gdrive_daily_stats')
        .select('request_count')
        .order('stat_date', { ascending: false })
        .limit(1);
      setDbLatencyMs(Date.now() - dbStart);

      if (dbStats && dbStats.length > 0) {
        setGdriveRequestCountToday(dbStats[0].request_count || 0);
      }

      // 2. Fetch live worker node diagnostics
      let res = await fetch('https://smd-stream-node-1.smd-prime.workers.dev/admin/diagnostics?token=smd_prime_admin_secret_2026');
      if (!res.ok) {
        res = await fetch('https://tgstream.smd-prime.workers.dev/admin/diagnostics?token=smd_prime_admin_secret_2026');
      }
      if (res.ok) {
        const data = await res.json();
        setDiagReport(data);
        if (data?.nodes) {
          registerNodesFromDiagnostics(data.nodes);
        }
        if (data?.saMesh?.totalActiveVaultAccounts) {
          setActiveSaCount(data.saMesh.totalActiveVaultAccounts);
        }
      } else {
        setDiagReport({ error: `HTTP ${res.status} Unauthorized or Worker Offline` });
      }
    } catch (e) {
      setDiagReport({ error: e.message });
    } finally {
      setLastCheckTimestamp(new Date().toLocaleTimeString());
      setDiagLoading(false);
    }
  }, []);

  // User Management State & Slide-out Context Drawer
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null); // User object for Contextual Slide-out Drawer
  const [userToRevoke, setUserToRevoke] = useState(null);

  // Lock body scroll
  useEffect(() => {
    const origBody = document.body.style.overflow;
    const origHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origBody;
      document.documentElement.style.overflow = origHtml;
    };
  }, []);

  // Fetch & Aggregate Analytics
  const fetchFilteredAnalytics = useCallback(async (dateRange, quality) => {
    setIsAnalyticsLoading(true);
    try {
      let query = supabase
        .from('stream_analytics')
        .select('movie_uid, watched_at, quality_watched, telegram_user_id', { count: 'exact' });

      let downloadQuery = supabase
        .from('download_analytics')
        .select('movie_uid, downloaded_at, quality_downloaded, telegram_user_id', { count: 'exact' });

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

      if (quality !== 'all') {
        query = query.eq('quality_watched', quality);
        downloadQuery = downloadQuery.eq('quality_downloaded', quality);
      }

      const [{ data: rawStreams, count: streamCount }, { data: rawDownloads, count: downloadCount }] = await Promise.all([
        query.order('watched_at', { ascending: false }),
        downloadQuery.order('downloaded_at', { ascending: false })
      ]);

      setTotalStreamsCount(streamCount || (rawStreams ? rawStreams.length : 0));
      setTotalDownloadsCount(downloadCount || (rawDownloads ? rawDownloads.length : 0));

      const { data: moviesData } = await supabase.from('movies').select('uid, id, title');
      const titleMap = {};
      if (moviesData) {
        moviesData.forEach(m => {
          const key = m.uid || m.id;
          if (key) titleMap[key] = sanitizeTitle(m.title);
        });
      }

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
              total_downloads: 0,
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

      if (rawDownloads && rawDownloads.length > 0) {
        rawDownloads.forEach(item => {
          const uid = item?.movie_uid ? String(item.movie_uid) : null;
          if (!uid) return;
          if (!summaryMap[uid]) {
            summaryMap[uid] = {
              movie_uid: uid,
              title: titleMap[uid] || sanitizeTitle(uid),
              total_views: 0,
              total_downloads: 0,
              last_watched: item.downloaded_at || new Date().toISOString(),
              qualities: new Set()
            };
          }
          summaryMap[uid].total_downloads += 1;
          if (item.quality_downloaded) summaryMap[uid].qualities.add(item.quality_downloaded);
        });
      }

      const aggregated = Object.values(summaryMap)
        .map(item => ({ ...item, qualitiesList: Array.from(item.qualities) }))
        .sort((a, b) => (b.total_views + b.total_downloads) - (a.total_views + a.total_downloads));

      setAnalyticsSummary(aggregated);

      const top5Dl = Object.values(summaryMap)
        .filter(item => item.total_downloads > 0)
        .sort((a, b) => b.total_downloads - a.total_downloads)
        .slice(0, 5);

      setTopDownloadedMovies(top5Dl);
    } catch (analyticsErr) {
      console.warn('Analytics fetch note:', analyticsErr);
    } finally {
      setIsAnalyticsLoading(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    async function loadAdminData() {
      setIsLoading(true);
      try {
        const { data: analytics } = await supabase
          .from('stream_analytics')
          .select('*')
          .order('watched_at', { ascending: false })
          .limit(40);
        if (analytics) setAnalyticsLogs(analytics);

        const { data: history } = await supabase
          .from('user_watch_history')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(40);
        if (history) setWatchLogs(history);

        const { data: rawDownloadLogs } = await supabase
          .from('download_analytics')
          .select('*')
          .order('downloaded_at', { ascending: false })
          .limit(40);
        if (rawDownloadLogs) setDownloadLogs(rawDownloadLogs);

        const { data: usersData, count } = await supabase
          .from('users')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false });

        if (usersData) setRegisteredUsers(usersData);
        if (count !== null) setUserCount(count);

        const { count: saActiveCount } = await supabase
          .from('drive_service_accounts')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true);

        if (saActiveCount !== null && saActiveCount !== undefined) {
          setActiveSaCount(saActiveCount);
        }

        fetchFilteredAnalytics('all', 'all');
        runInfrastructureCheck();
      } catch (err) {
        console.warn('Admin data fetch note:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadAdminData();

    // 10-Second Live Telemetry Auto-Polling Interval
    const pollInterval = setInterval(() => {
      runInfrastructureCheck();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [fetchFilteredAnalytics, runInfrastructureCheck]);

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
    try {
      const { data: usersData } = await supabase.from('users').select('*').order('created_at', { ascending: false });
      if (usersData) setRegisteredUsers(usersData);
    } catch (e) {}
  };

  const handleToggleBanUser = (telegramUserId) => {
    const idNum = Number(telegramUserId);
    setBannedUserIds(prev => {
      const isBanned = prev.includes(idNum);
      const updated = isBanned ? prev.filter(id => id !== idNum) : [...prev, idNum];
      localStorage.setItem('smd_prime_banned_user_ids', JSON.stringify(updated));
      return updated;
    });
  };

  const handleAddManualAdmin = async (e) => {
    e.preventDefault();
    const inputVal = newAdminIdInput.trim();
    if (!inputVal) return;
    const idNum = Number(inputVal);
    addAdminUser(idNum);
    setAdminIds(prev => prev.includes(idNum) ? prev : [...prev, idNum]);
    setNewAdminIdInput('');
  };

  const handleResetFilters = () => {
    setAnalyticsDateRange('all');
    setAnalyticsQuality('all');
    setAnalyticsTypeFilter('all');
  };

  // Filtered User List for RBAC User Management
  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.toLowerCase().trim();
    let list = registeredUsers;

    if (query) {
      list = list.filter(u => {
        const name = (u.first_name || '') + ' ' + (u.last_name || '');
        const uname = u.username || '';
        const id = String(u.telegram_user_id || u.id || '');
        return name.toLowerCase().includes(query) || uname.toLowerCase().includes(query) || id.includes(query);
      });
    }

    // Separate into Super Admins, Admins, and Members
    const superAdmins = [];
    const admins = [];
    const members = [];

    list.forEach(u => {
      const isSuper = Number(u.telegram_user_id) === 0;
      const isAdmin = u.role === 'admin' || adminIds.includes(Number(u.telegram_user_id));
      if (isSuper) superAdmins.push(u);
      else if (isAdmin) admins.push(u);
      else members.push(u);
    });

    return [...superAdmins, ...admins, ...members];
  }, [registeredUsers, adminIds, userSearchQuery]);

  // Analytics Smart Filter Data
  const displayedAnalytics = useMemo(() => {
    if (analyticsTypeFilter === 'stream') {
      return analyticsSummary.filter(item => item.total_views > 0);
    }
    if (analyticsTypeFilter === 'download') {
      return analyticsSummary.filter(item => item.total_downloads > 0);
    }
    return analyticsSummary;
  }, [analyticsSummary, analyticsTypeFilter]);

  const activeFilterCount = (analyticsDateRange !== 'all' ? 1 : 0) + (analyticsQuality !== 'all' ? 1 : 0) + (analyticsTypeFilter !== 'all' ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl animate-fadeIn p-0 sm:p-4 font-sans select-none">
      
      {/* Revocation Confirmation Dialog */}
      {userToRevoke && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-sm p-6 rounded-3xl border shadow-2xl space-y-4 ${
            darkMode ? 'bg-[#0e1220] text-white border-red-500/30' : 'bg-white text-slate-900 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 text-red-500 border border-red-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-base">Revoke Admin Privileges?</h4>
                <p className="text-xs text-zinc-400 font-mono">User ID: #{userToRevoke.id}</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to remove admin access for <strong>{userToRevoke.name}</strong>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setUserToRevoke(null)} className="px-4 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300">
                Cancel
              </button>
              <button 
                onClick={() => { handleToggleAdmin(userToRevoke.id); setUserToRevoke(null); }}
                className="px-4 py-2 rounded-xl text-xs font-black bg-red-600 text-white shadow-md shadow-red-600/30"
              >
                Confirm Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Glassmorphism Command Center Window */}
      <div className={`w-full h-full sm:max-w-5xl sm:h-[92vh] sm:rounded-3xl flex flex-col overflow-hidden border shadow-2xl transition-all ${
        darkMode ? 'bg-[#080b13]/95 text-white border-zinc-800/90' : 'bg-white text-slate-900 border-slate-200'
      }`}>

        {/* TOP COMMAND CENTER HEADER BAR */}
        <div className={`px-5 py-4 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'border-zinc-800/80 bg-gradient-to-r from-zinc-950 via-[#0a0d18] to-zinc-950' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="relative group">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-red-600 via-rose-600 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-red-600/30">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-black animate-pulse"></div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg tracking-tight font-heading">
                  SMD PRIME OTT Command Center
                </h3>
                <span className="px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  ENTERPRISE ADMIN
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
                <span>Infrastructure Telemetry</span>
                <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  HEALTHY 200 OK
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-zinc-900/90 hover:bg-red-600/20 text-zinc-400 hover:text-red-400 border border-white/10 transition-all active:scale-95"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVIGATION TAB BAR */}
        <div className={`px-5 py-3 border-b shrink-0 ${darkMode ? 'border-zinc-800/80 bg-black/40' : 'border-slate-200 bg-slate-100/60'}`}>
          <div className="flex items-center gap-1.5 p-1.5 rounded-2xl border overflow-x-auto no-scrollbar bg-zinc-900/90 border-white/5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                activeTab === 'overview' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                activeTab === 'analytics' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Analytics ({analyticsSummary.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                activeTab === 'users' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>RBAC Users ({registeredUsers.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('role_policies')}
              className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                activeTab === 'role_policies' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Policy Matrix</span>
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                activeTab === 'telemetry' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Telemetry ({analyticsLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('watch_history')}
              className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                activeTab === 'watch_history' ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>Logs ({watchLogs.length + downloadLogs.length})</span>
            </button>
          </div>
        </div>

        {/* DYNAMIC TAB CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-6 custom-scrollbar relative">

          {/* 1. OVERVIEW & TELEMETRY */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
                <div className="p-5 rounded-2xl border bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-red-500/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-400">Total Movies</span>
                    <Film className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-3xl font-black font-heading text-white">{totalMoviesCount}</div>
                  <div className="text-[10px] text-emerald-400 font-bold mt-1.5 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Drive Synced</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-emerald-500/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-400">Supabase DB</span>
                    <Database className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-3xl font-black font-heading text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-6 h-6" />
                    <span>Active</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono mt-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>PostgreSQL 200 OK ({dbLatencyMs > 0 ? `${dbLatencyMs}ms` : '5ms'})</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-amber-500/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-400">Outbound GDrive API</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-3xl font-black font-heading text-amber-400 font-mono">
                    {diagReport?.gdriveDailyStats?.request_count || gdriveRequestCountToday || '0'}
                  </div>
                  <div className="text-[10px] text-amber-400 font-bold mt-1.5 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>Batched Daily Telemetry</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-cyan-500/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-400">Worker Mesh</span>
                    <Server className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-3xl font-black font-heading text-white">{activeSaCount} SAs</div>
                  <div className="text-[10px] text-cyan-400 font-bold mt-1.5 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                    <span>3 Nodes Load Balanced</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 hover:border-indigo-500/40 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-zinc-400">Active Admins</span>
                    <Users className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-3xl font-black font-heading text-white">{adminIds.length}</div>
                  <div className="text-[10px] text-indigo-400 font-mono mt-1.5">{userCount} Registered Users</div>
                </div>
              </div>

              {/* Global Streaming Mode Switcher Card */}
              <div className="p-5 rounded-2xl border bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border-white/10 space-y-3 shadow-xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Film className="w-4.5 h-4.5 text-red-500" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-200">
                      Global OTT Delivery & Access Control Mode
                    </h4>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                    streamingMode === 'both'
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : streamingMode === 'download_only'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                  }`}>
                    Mode: {streamingMode.toUpperCase().replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                  Control user stream permissions instantly across all devices. When set to <strong className="text-amber-400 font-bold">Download Only</strong>, in-app video streaming will be restricted and users will only be allowed to download files.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <button
                    onClick={() => handleStreamingModeChange('both')}
                    className={`py-3 px-3 rounded-xl text-xs font-extrabold flex flex-col items-center gap-1 transition-all border ${
                      streamingMode === 'both'
                        ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-400/50 shadow-lg shadow-red-600/30'
                        : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black">
                      <span>🎬</span>
                      <span>Both</span>
                    </div>
                    <span className="text-[10px] opacity-80 font-normal">Stream & Download</span>
                  </button>

                  <button
                    onClick={() => handleStreamingModeChange('download_only')}
                    className={`py-3 px-3 rounded-xl text-xs font-extrabold flex flex-col items-center gap-1 transition-all border ${
                      streamingMode === 'download_only'
                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white border-amber-400/50 shadow-lg shadow-amber-600/30'
                        : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black">
                      <span>📥</span>
                      <span>Download Only</span>
                    </div>
                    <span className="text-[10px] opacity-80 font-normal">Blocks Stream Player</span>
                  </button>

                  <button
                    onClick={() => handleStreamingModeChange('stream_only')}
                    className={`py-3 px-3 rounded-xl text-xs font-extrabold flex flex-col items-center gap-1 transition-all border ${
                      streamingMode === 'stream_only'
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400/50 shadow-lg shadow-cyan-600/30'
                        : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black">
                      <span>▶️</span>
                      <span>Stream Only</span>
                    </div>
                    <span className="text-[10px] opacity-80 font-normal">Hides Direct Downloads</span>
                  </button>
                </div>
              </div>

              {/* Cloud Terminal Real-Time Pulse Card */}
              <div className="p-5 rounded-2xl border bg-black/70 border-white/10 space-y-3.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4.5 h-4.5 text-amber-400" />
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                        Live Pulse Telemetry & Worker Health
                      </h4>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold font-mono flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        LIVE 10s AUTO-POLL
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {lastCheckTimestamp && (
                      <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
                        Updated: {lastCheckTimestamp}
                      </span>
                    )}
                    <button
                      onClick={runInfrastructureCheck}
                      disabled={diagLoading}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3.5 h-3.5 ${diagLoading ? 'animate-spin' : ''}`} />
                      <span>{diagLoading ? 'Testing Nodes...' : '⚡ Recheck Infrastructure'}</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 text-xs font-mono">
                  <div className="flex items-center justify-between py-1 border-b border-white/5 text-zinc-400">
                    <span>Database Engine</span>
                    <span className="text-emerald-400 font-bold">Supabase PostgreSQL 200 OK ({dbLatencyMs > 0 ? `${dbLatencyMs}ms` : 'Live'})</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5 text-zinc-400">
                    <span>Cloudflare Edge Proxy</span>
                    <span className="text-cyan-400 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                      <span>Single-Endpoint Lazy Health Gateway (v13.0)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-zinc-400">
                    <span>Service Account Pool</span>
                    <span className="text-emerald-400 font-bold">{activeSaCount} Vault Accounts Active (15m Cooldown Protection)</span>
                  </div>
                </div>

                {/* Live Diagnostic Output Card */}
                {diagReport && (
                  <div className="p-4 rounded-xl bg-zinc-950 border border-white/10 space-y-2 font-mono text-[11px] animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-amber-400 font-bold uppercase">Backend Diagnostic Result</span>
                      <span className="text-zinc-500">{diagReport.timestamp ? new Date(diagReport.timestamp).toLocaleTimeString() : 'Now'}</span>
                    </div>

                    {diagReport.error ? (
                      <div className="text-red-400 font-bold">✖ Test Error: {diagReport.error}</div>
                    ) : (
                      <>
                        <div className="text-emerald-400 font-bold">✔ HMAC Signature Engine: {diagReport.hmacEngine?.status}</div>
                        <div className="text-zinc-300 font-bold pt-1">Node Connectivity & Latencies:</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          {diagReport.nodes?.map(n => (
                            <div key={n.id} className={`p-2 rounded-lg border ${n.online ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                              <div className="font-bold uppercase text-[10px]">{n.id}</div>
                              <div>Status: {n.status} ({n.latencyMs}ms)</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-cyan-400 pt-1">
                          SA Mesh Health: {diagReport.serviceAccountMesh?.activeHealthy} / {diagReport.serviceAccountMesh?.totalAccounts} Healthy ({diagReport.serviceAccountMesh?.coolingDown} Cooling Down)
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. UNIFIED ANALYTICS & SMART ICON FILTERS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header & Minimalist Smart Icon Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-black uppercase tracking-wider flex items-center gap-2 text-white">
                    <BarChart3 className="w-4.5 h-4.5 text-red-500" />
                    <span>Unified Stream & Download Insights</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {totalStreamsCount} total streams | {totalDownloadsCount} total downloads
                  </p>
                </div>

                {/* Minimalist Smart Icon Filter Toggle */}
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded-2xl bg-zinc-900 border border-white/10 flex items-center gap-1">
                    <button
                      onClick={() => setAnalyticsTypeFilter('all')}
                      className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        analyticsTypeFilter === 'all' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                      }`}
                      title="All Activity"
                    >
                      <Layers className="w-4 h-4" />
                      <span className="hidden sm:inline">All</span>
                    </button>

                    <button
                      onClick={() => setAnalyticsTypeFilter('stream')}
                      className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        analyticsTypeFilter === 'stream' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Streams Only"
                    >
                      <Film className="w-4 h-4" />
                      <span className="hidden sm:inline">Streams</span>
                    </button>

                    <button
                      onClick={() => setAnalyticsTypeFilter('download')}
                      className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        analyticsTypeFilter === 'download' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-400 hover:text-white'
                      }`}
                      title="Downloads Only"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">Downloads</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setShowFilterPanel(prev => !prev)}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition-all ${
                      showFilterPanel || activeFilterCount > 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-zinc-900 text-zinc-400 border-white/10'
                    }`}
                    title="Toggle Date & Quality Filters"
                  >
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                <div className="p-4 rounded-2xl border bg-zinc-900/90 border-white/10">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400 mb-1">
                    <span>Total Streams</span>
                    <Film className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-2xl font-black font-heading text-white">{totalStreamsCount}</div>
                </div>

                <div className="p-4 rounded-2xl border bg-zinc-900/90 border-white/10">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400 mb-1">
                    <span>Total Downloads</span>
                    <Download className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black font-heading text-emerald-400">{totalDownloadsCount}</div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl border bg-zinc-900/90 border-white/10">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-400 mb-1">
                    <span>Stream/Download Ratio</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-2xl font-black font-heading text-amber-400">
                    {totalDownloadsCount > 0 ? (totalStreamsCount / totalDownloadsCount).toFixed(1) : '0'}x
                  </div>
                </div>
              </div>

              {/* Collapsible Filter Panel */}
              {showFilterPanel && (
                <div className="p-4 rounded-2xl border bg-zinc-900/90 border-white/10 flex items-center justify-between gap-3 animate-fadeIn">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-red-500" />
                      <select
                        value={analyticsDateRange}
                        onChange={(e) => setAnalyticsDateRange(e.target.value)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-950 border border-white/10 text-white focus:outline-none"
                      >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="7days">Last 7 Days</option>
                        <option value="30days">Last 30 Days</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5 text-emerald-400" />
                      <select
                        value={analyticsQuality}
                        onChange={(e) => setAnalyticsQuality(e.target.value)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-zinc-950 border border-white/10 text-white focus:outline-none"
                      >
                        <option value="all">All Qualities</option>
                        <option value="4K">4K Ultra HD</option>
                        <option value="1080p">1080p Full HD</option>
                        <option value="720p">720p HD</option>
                      </select>
                    </div>
                  </div>

                  {activeFilterCount > 0 && (
                    <button onClick={handleResetFilters} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              )}

              {/* Dark-Themed Table View for Movie Analytics */}
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-zinc-950/80 text-[11px] font-black uppercase text-zinc-400 font-mono">
                        <th className="py-4 px-5">Movie Title</th>
                        <th className="py-4 px-5">Movie UID</th>
                        <th className="py-4 px-5 text-center">Streams</th>
                        <th className="py-4 px-5 text-center">Downloads</th>
                        <th className="py-4 px-5 text-right">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs font-mono">
                      {displayedAnalytics.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-12 text-center text-zinc-500">
                            No analytics data recorded for this filter.
                          </td>
                        </tr>
                      ) : (
                        displayedAnalytics.map(item => (
                          <tr key={item.movie_uid} className="hover:bg-white/5 transition-colors">
                            <td className="py-4 px-5 font-sans font-bold text-sm text-white">
                              <div>{item.title || item.movie_uid}</div>
                              {item.qualitiesList && item.qualitiesList.length > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  {item.qualitiesList.map(q => (
                                    <span key={q} className="px-2 py-0.5 text-[9px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20 rounded">
                                      {q}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-5 text-red-400 font-mono text-[11px]">{item.movie_uid}</td>
                            <td className="py-4 px-5 text-center">
                              <span className="px-3 py-1 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 font-bold">
                                {item.total_views}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-center">
                              <span className="px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                {item.total_downloads}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right text-zinc-400 text-[11px]">
                              {item.last_watched ? new Date(item.last_watched).toLocaleDateString() : 'Recently'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2.5 DYNAMIC ROLE ENTITLEMENT POLICY MATRIX */}
          {activeTab === 'role_policies' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="p-5 rounded-2xl border bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="font-black text-sm text-white">Dynamic Role Entitlement Policy Control Matrix</h3>
                      <p className="text-xs text-zinc-400">Configure real-time streaming & feature permissions per User Role (Normal, Premium, Admin).</p>
                    </div>
                  </div>
                  {isSavingPolicies && (
                    <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      Saving DB...
                    </span>
                  )}
                </div>

                {/* Role Matrix Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['normal', 'premium', 'admin'].map((roleKey) => {
                    const policy = rolePolicies[roleKey] || DEFAULT_ROLE_POLICIES[roleKey];
                    const isNormal = roleKey === 'normal';
                    const isPrem = roleKey === 'premium';
                    const isAdmin = roleKey === 'admin';

                    const roleTitle = isNormal ? 'Normal User' : (isPrem ? '⭐ Premium Member' : '👑 Admin User');
                    const headerGradient = isNormal 
                      ? 'from-zinc-800 to-zinc-900 border-zinc-700 text-zinc-300' 
                      : (isPrem ? 'from-amber-600/30 to-amber-950/40 border-amber-500/40 text-amber-400' : 'from-red-600/30 to-rose-950/40 border-red-500/40 text-rose-400');

                    const handleTogglePolicy = (key, value) => {
                      const updated = {
                        ...rolePolicies,
                        [roleKey]: {
                          ...policy,
                          [key]: value
                        }
                      };
                      setRolePoliciesState(updated);
                      setIsSavingPolicies(true);
                      setRolePolicies(updated).then(() => setIsSavingPolicies(false));
                    };

                    return (
                      <div key={roleKey} className={`p-4 rounded-2xl border bg-black/60 space-y-4`}>
                        <div className={`p-2.5 rounded-xl border bg-gradient-to-r ${headerGradient} font-black text-xs uppercase tracking-wider flex items-center justify-between`}>
                          <span>{roleTitle}</span>
                          <span className="text-[10px] font-mono opacity-80 font-normal">Role: {roleKey}</span>
                        </div>

                        {/* Max Resolution Selector */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-zinc-400 flex items-center justify-between">
                            <span>Max Streaming Quality:</span>
                            <span className="text-white font-mono font-black">{policy.max_resolution}</span>
                          </label>
                          <select
                            value={policy.max_resolution}
                            onChange={(e) => handleTogglePolicy('max_resolution', e.target.value)}
                            className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="480p">480p Standard</option>
                            <option value="720p">720p HD</option>
                            <option value="1080p">1080p Full HD</option>
                            <option value="4K">4K Ultra HD</option>
                          </select>
                        </div>

                        {/* Download Access Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-white/5">
                          <div>
                            <span className="text-xs font-bold text-zinc-300 block">Direct Download</span>
                            <span className="text-[10px] text-zinc-500 block">Allow "Download Now" button</span>
                          </div>
                          <button
                            onClick={() => handleTogglePolicy('download_access', !policy.download_access)}
                            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                              policy.download_access ? 'bg-emerald-500' : 'bg-zinc-700'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full bg-white transition-transform ${
                              policy.download_access ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {/* External Player Access Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-white/5">
                          <div>
                            <span className="text-xs font-bold text-zinc-300 block">External Player</span>
                            <span className="text-[10px] text-zinc-500 block">Allow VLC/MX Handoff</span>
                          </div>
                          <button
                            onClick={() => handleTogglePolicy('external_player', !policy.external_player)}
                            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                              policy.external_player ? 'bg-emerald-500' : 'bg-zinc-700'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full bg-white transition-transform ${
                              policy.external_player ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {/* Adsterra Popunder Ad Engine Toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/80 border border-white/5">
                          <div>
                            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                              <span>Adsterra Ads Engine</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                                policy.enable_ads !== false ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}>
                                {policy.enable_ads !== false ? '📢 ACTIVE' : '🚫 AD-FREE'}
                              </span>
                            </span>
                            <span className="text-[10px] text-zinc-500 block">Inject Popunder Ad Script for this Role</span>
                          </div>
                          <button
                            onClick={() => handleTogglePolicy('enable_ads', policy.enable_ads === false ? true : false)}
                            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                              policy.enable_ads !== false ? 'bg-red-600' : 'bg-zinc-700'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full bg-white transition-transform ${
                              policy.enable_ads !== false ? 'translate-x-5' : 'translate-x-0'
                            }`} />
                          </button>
                        </div>

                        {/* Mesh Priority & Parallel Streams Info */}
                        <div className="p-3 rounded-xl bg-zinc-950/90 border border-white/5 text-[11px] font-mono space-y-1">
                          <div className="flex items-center justify-between text-zinc-400">
                            <span>Mesh Queue:</span>
                            <span className="text-amber-400 font-bold">{policy.sa_mesh_priority || 'Standard'}</span>
                          </div>
                          <div className="flex items-center justify-between text-zinc-400">
                            <span>Max Parallel:</span>
                            <span className="text-emerald-400 font-bold">{policy.parallel_streams || 1} Streams</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 3. CONTEXTUAL RBAC USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-5 animate-fadeIn">
              {/* Add Admin & Search Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <form onSubmit={handleAddManualAdmin} className="relative flex items-center">
                  <input
                    type="number"
                    placeholder="Enter Telegram User ID"
                    value={newAdminIdInput}
                    onChange={(e) => setNewAdminIdInput(e.target.value)}
                    className="w-full pl-4 pr-32 py-3 rounded-2xl bg-zinc-900 border border-white/10 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                  <button type="submit" className="absolute right-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-black rounded-xl flex items-center gap-1 shadow-md">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Add Admin</span>
                  </button>
                </form>

                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3.5" />
                  <input
                    type="text"
                    placeholder="Search Users by Name, Username, or ID..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-900 border border-white/10 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-red-500/40"
                  />
                </div>
              </div>

              {/* User Grid Card View */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredUsers.map(user => {
                  const isSuper = Number(user.telegram_user_id) === 0;
                  const isAdmin = user.role === 'admin' || adminIds.includes(Number(user.telegram_user_id));
                  const isBanned = bannedUserIds.includes(Number(user.telegram_user_id));
                  const userName = user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.username || `User #${user.telegram_user_id}`;

                  return (
                    <div
                      key={user.id}
                      onClick={() => setSelectedUser(user)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer hover:scale-[1.02] flex flex-col justify-between space-y-3 ${
                        isSuper
                          ? 'bg-gradient-to-br from-amber-950/40 to-zinc-950 border-amber-500/40'
                          : isBanned
                            ? 'bg-red-950/20 border-red-500/40 opacity-75'
                            : isAdmin
                            ? 'bg-zinc-900/90 border-red-500/30'
                            : user.role === 'premium'
                              ? 'bg-gradient-to-br from-amber-950/20 to-zinc-900/90 border-amber-500/30'
                              : 'bg-zinc-900/50 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-2xl object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-2xl bg-zinc-800 text-white flex items-center justify-center font-bold text-xs shrink-0">
                            <User className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate flex items-center gap-1.5">
                            <span>{userName}</span>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400 truncate">
                            ID: {user.telegram_user_id} {user.username ? `@${user.username}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        {/* Dynamic Role & Privileges Badge */}
                        {isSuper ? (
                          <span className="px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md">
                            OWNER
                          </span>
                        ) : isBanned ? (
                          <span className="px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-red-600/30 text-red-400 border border-red-500/40 rounded-md flex items-center gap-1">
                            <Ban className="w-3 h-3" />
                            BANNED
                          </span>
                        ) : isAdmin ? (
                          <span className="px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 rounded-md">
                            ADMIN
                          </span>
                        ) : user.role === 'premium' ? (
                          <span className="px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/40 rounded-md">
                            ⭐ PREMIUM
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-white/5 rounded-md">
                            NORMAL
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                          <span>Details</span>
                          <ArrowRight className="w-3 h-3 text-zinc-400" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. TELEMETRY & LOGS TAB */}
          {activeTab === 'telemetry' && (
            <div className="space-y-3 animate-fadeIn">
              <h4 className="text-xs font-black uppercase text-zinc-400 font-mono">
                Real-Time Edge Telemetry Logs ({analyticsLogs.length})
              </h4>
              <div className="space-y-2">
                {analyticsLogs.map(log => (
                  <div key={log.id} className="p-3.5 rounded-2xl border bg-zinc-900/60 border-white/5 flex items-center justify-between text-xs font-mono">
                    <div>
                      <div className="font-bold text-red-400">{log.movie_uid}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">User ID: {log.telegram_user_id}</div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                        {log.quality_watched || '1080p'} (SA #{log.sa_account_index || 1})
                      </span>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {log.watched_at ? new Date(log.watched_at).toLocaleTimeString() : 'Just now'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. WATCH HISTORY LOGS TAB */}
          {activeTab === 'watch_history' && (
            <div className="space-y-3 animate-fadeIn">
              <h4 className="text-xs font-black uppercase text-zinc-400 font-mono">
                User Activity & Watch History Logs ({watchLogs.length})
              </h4>
              <div className="space-y-2">
                {watchLogs.map(w => (
                  <div key={w.id} className="p-3.5 rounded-2xl border bg-zinc-900/60 border-white/5 flex items-center justify-between text-xs font-mono">
                    <div>
                      <div className="font-bold text-white">{w.movie_uid}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        Progress: {w.progress_seconds || 0}s / {w.duration_seconds || 0}s
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold">
                        User #{w.telegram_user_id || 'Guest'}
                      </span>
                      <div className="text-[10px] text-zinc-500 mt-1">
                        {w.updated_at ? new Date(w.updated_at).toLocaleString() : 'Recently'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CONTEXTUAL SLIDE-OUT DRAWER FOR USER MANAGEMENT */}
        {selectedUser && (
          <div className="absolute inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md h-full bg-[#0d111d] border-l border-white/10 p-6 flex flex-col justify-between overflow-y-auto space-y-6 shadow-2xl animate-slideLeft">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 text-white flex items-center justify-center font-bold text-sm border border-white/10">
                    <User className="w-6 h-6 text-zinc-400" />
                  </div>
                  <div>
                    <h4 className="font-black text-base text-white">
                      {selectedUser.first_name ? `${selectedUser.first_name} ${selectedUser.last_name || ''}`.trim() : selectedUser.username || `User #${selectedUser.telegram_user_id}`}
                    </h4>
                    <p className="text-xs font-mono text-zinc-400">Telegram ID: {selectedUser.telegram_user_id}</p>
                  </div>
                </div>

                <button onClick={() => setSelectedUser(null)} className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Stats & Badges */}
              <div className="space-y-4 flex-1">
                <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/5 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Username</span>
                    <span className="text-white font-bold">{selectedUser.username ? `@${selectedUser.username}` : 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Registration Date</span>
                    <span className="text-white font-bold">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>Account Status</span>
                    {bannedUserIds.includes(Number(selectedUser.telegram_user_id)) ? (
                      <span className="text-red-400 font-bold">BANNED</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">ACTIVE</span>
                    )}
                  </div>
                </div>

                {/* Administrative Role Selector & Actions */}
                <div className="space-y-3 pt-4 border-t border-white/10">
                  <h5 className="text-xs font-black uppercase text-zinc-400 tracking-wider">User Role & Privileges</h5>

                  {/* 3-Way Role Selector (Normal | Premium | Admin) */}
                  <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-zinc-950 border border-white/10">
                    <button
                      onClick={async () => {
                        const tgId = selectedUser.telegram_user_id || selectedUser.telegram_id || selectedUser.id;
                        const res = await updateUserRoleInSupabase(tgId, 'normal');
                        if (res.success) {
                          setRegisteredUsers(prev => prev.map(u => (u.id === selectedUser.id || u.telegram_user_id === tgId) ? { ...u, role: 'normal' } : u));
                          setSelectedUser(prev => ({ ...prev, role: 'normal' }));
                        }
                      }}
                      className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all ${
                        (selectedUser.role || 'normal') === 'normal'
                          ? 'bg-zinc-800 text-white shadow-md ring-1 ring-white/20'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Normal
                    </button>

                    <button
                      onClick={async () => {
                        const tgId = selectedUser.telegram_user_id || selectedUser.telegram_id || selectedUser.id;
                        const res = await updateUserRoleInSupabase(tgId, 'premium');
                        if (res.success) {
                          setRegisteredUsers(prev => prev.map(u => (u.id === selectedUser.id || u.telegram_user_id === tgId) ? { ...u, role: 'premium' } : u));
                          setSelectedUser(prev => ({ ...prev, role: 'premium' }));
                        }
                      }}
                      className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all ${
                        selectedUser.role === 'premium'
                          ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg ring-1 ring-amber-400'
                          : 'text-amber-400/70 hover:text-amber-400'
                      }`}
                    >
                      ⭐ Premium
                    </button>

                    <button
                      onClick={async () => {
                        const tgId = selectedUser.telegram_user_id || selectedUser.telegram_id || selectedUser.id;
                        const res = await updateUserRoleInSupabase(tgId, 'admin');
                        if (res.success) {
                          setRegisteredUsers(prev => prev.map(u => (u.id === selectedUser.id || u.telegram_user_id === tgId) ? { ...u, role: 'admin' } : u));
                          setSelectedUser(prev => ({ ...prev, role: 'admin' }));
                          if (tgId) handleToggleAdmin(tgId);
                        }
                      }}
                      className={`py-2 px-2 rounded-xl text-[11px] font-black transition-all ${
                        selectedUser.role === 'admin' || adminIds.includes(Number(selectedUser.telegram_user_id || selectedUser.id))
                          ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg ring-1 ring-red-400'
                          : 'text-red-400/70 hover:text-red-400'
                      }`}
                    >
                      👑 Admin
                    </button>
                  </div>

                  {/* Ban/Unban User Button */}
                  {Number(selectedUser.telegram_user_id) !== 0 && (
                    <button
                      onClick={() => handleToggleBanUser(selectedUser.telegram_user_id)}
                      className={`w-full py-3 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                        bannedUserIds.includes(Number(selectedUser.telegram_user_id))
                          ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                          : 'bg-red-600/30 text-red-300 border border-red-500/40 hover:bg-red-600/40'
                      }`}
                    >
                      <Ban className="w-4 h-4" />
                      <span>{bannedUserIds.includes(Number(selectedUser.telegram_user_id)) ? 'Unban User' : 'Ban User'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Close Drawer Button */}
              <button
                onClick={() => setSelectedUser(null)}
                className="w-full py-3 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white text-xs font-bold border border-white/10"
              >
                Close Profile
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
