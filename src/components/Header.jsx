import React, { useState } from 'react';
import { Search, Film, Moon, Sun, ShieldCheck, X, ShieldAlert } from 'lucide-react';
import { triggerHaptic, getTelegramUserInfo } from '../utils/telegram';

export default function Header({ 
  onOpenSearch, 
  darkMode, 
  setDarkMode, 
  activeCategory, 
  setActiveCategory,
  onOpenAdmin,
  currentUserRole = 'normal'
}) {
  const [showProfileCard, setShowProfileCard] = useState(false);
  const telegramUser = getTelegramUserInfo();

  // ─── 100% Prop-Driven Role Tier (Single Source of Truth = DB via App.jsx) ───
  const role       = String(currentUserRole || 'normal').toLowerCase().trim();
  const isSuperAdmin = role === 'super_admin';
  const isAdmin      = role === 'admin';
  const isVip        = role === 'vip' || role === 'premium';
  const isUserAdmin  = isSuperAdmin || isAdmin;

  // ─── 4-Tier Avatar Ring Color ───
  const getRoleRingClass = () => {
    if (isSuperAdmin) return 'border-yellow-400 ring-2 ring-yellow-400/50 shadow-[0_0_14px_rgba(250,204,21,0.65)]'; // 👑 Gold
    if (isAdmin)      return 'border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.5)]'; // 🛡️ Green
    if (isVip)        return 'border-violet-400 ring-2 ring-violet-400/50 shadow-[0_0_12px_rgba(139,92,246,0.55)]'; // ⭐ Violet
    return 'border-zinc-500/60 ring-1 ring-zinc-500/20'; // 👤 Grey
  };
  const getRoleAvatarBg = () => {
    if (isSuperAdmin) return 'bg-gradient-to-tr from-yellow-600 via-amber-500 to-yellow-300';
    if (isAdmin)      return 'bg-gradient-to-tr from-emerald-700 via-teal-600 to-emerald-400';
    if (isVip)        return 'bg-gradient-to-tr from-violet-700 via-purple-500 to-violet-400';
    return 'bg-gradient-to-tr from-zinc-700 via-zinc-600 to-zinc-500';
  };
  const roleBadge = (() => {
    if (isSuperAdmin) return { emoji: '👑', label: 'Super Administrator',   color: 'text-yellow-400 font-bold' };
    if (isAdmin)      return { emoji: '🛡️', label: 'Platform Administrator', color: 'text-emerald-400 font-bold' };
    if (isVip)        return { emoji: '⭐', label: 'VIP Premium Streamer',   color: 'text-violet-400 font-bold' };
    return             { emoji: '👤', label: 'Standard Member',             color: 'text-zinc-400' };
  })();

  const handleSearchClick = () => {
    triggerHaptic('light');
    onOpenSearch();
  };

  const handleThemeToggle = () => {
    triggerHaptic('medium');
    setDarkMode(!darkMode);
  };

  const toggleProfileCard = () => {
    triggerHaptic('light');
    setShowProfileCard(!showProfileCard);
  };

  // Fallback user avatar generator if photo_url is missing
  const userPhoto = telegramUser?.photo_url;
  const userName = telegramUser?.first_name || telegramUser?.username || 'SMD Member';
  const userHandle = telegramUser?.username ? `@${telegramUser.username}` : 'Premium Cinema Member';

  return (
    <>
      <header className={`sticky top-0 z-40 w-full transition-all duration-300 ${
        darkMode 
          ? 'bg-[#090d16]/45 text-white border-white/[0.08] shadow-[0_12px_36px_rgba(0,0,0,0.6)] backdrop-blur-3xl backdrop-saturate-200 backdrop-contrast-125' 
          : 'bg-white/45 text-slate-900 border-white/40 shadow-xl shadow-slate-900/5 backdrop-blur-3xl backdrop-saturate-200'
      } border-b px-4 py-3 relative`}>
        <div className="w-full max-w-full px-2 sm:px-4 flex items-center justify-between gap-2">
          
          {/* Brand Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer group" 
            onClick={() => {
              triggerHaptic('light');
              setActiveCategory('All');
            }}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 via-red-500 to-rose-500 flex items-center justify-center text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] group-hover:scale-105 transition-transform duration-200">
              <Film className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg tracking-tight font-heading leading-none">
                  <span className={darkMode ? 'text-white' : 'text-slate-900'}>SMD</span>
                  <span className="bg-gradient-to-r from-red-600 to-rose-500 bg-clip-text text-transparent">PRIME</span>
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-md bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-xs">
                  TMA
                </span>
              </div>
              <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-400 leading-none mt-0.5 flex items-center gap-1">
                <span>Cloud Cinema</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </p>
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2">
            {/* Search Trigger */}
            <button
              onClick={handleSearchClick}
              className={`p-2.5 rounded-full transition-all duration-200 ${
                darkMode 
                  ? 'bg-white/[0.07] hover:bg-white/[0.15] text-zinc-100 border-white/10 shadow-lg backdrop-blur-xl' 
                  : 'bg-white/60 hover:bg-white/80 text-slate-800 border-slate-200/80 shadow-md backdrop-blur-xl'
              } border flex items-center justify-center active:scale-95`}
              aria-label="Search Movies"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              onClick={handleThemeToggle}
              className={`p-2.5 rounded-full transition-all duration-200 ${
                darkMode 
                  ? 'bg-white/[0.07] hover:bg-white/[0.15] text-amber-400 border-white/10 shadow-lg backdrop-blur-xl' 
                  : 'bg-white/60 hover:bg-white/80 text-amber-500 border-slate-200/80 shadow-md backdrop-blur-xl'
              } border flex items-center justify-center active:scale-95`}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Telegram User Avatar Button with Dynamic Circle Indicator (Red = Normal, Gold = VIP, Green = Admin) */}
            <div className={`flex items-center gap-2 pl-2 border-l ${darkMode ? 'border-zinc-800' : 'border-slate-200'}`}>
              <button
                onClick={(e) => {
                  if (isUserAdmin) {
                    triggerHaptic('medium');
                    onOpenAdmin();
                  } else {
                    triggerHaptic('light');
                    toggleProfileCard();
                  }
                }}
                className="flex items-center gap-2 p-1 rounded-full hover:opacity-90 active:scale-95 transition-all group relative cursor-pointer"
                title={isUserAdmin ? "Open Admin Command Center" : "View Account Profile"}
              >
                {/* Relative wrapper for crown pip */}
                <div className="relative">
                  {userPhoto ? (
                    <img 
                      src={userPhoto} 
                      alt={userName} 
                      className={`w-8 h-8 rounded-full border-2 object-cover transition-all ${getRoleRingClass()}`}
                    />
                  ) : (
                    <div className={`w-8 h-8 rounded-full text-white border-2 flex items-center justify-center text-xs font-black transition-all ${getRoleAvatarBg()} ${getRoleRingClass().split(' ').slice(1).join(' ')}`}>
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {/* 👑 Super Admin crown pip */}
                  {isSuperAdmin && (
                    <span className="absolute -top-1.5 -right-1 text-[10px] leading-none drop-shadow-sm select-none">👑</span>
                  )}
                </div>
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* User Profile Info Card Modal */}
      {showProfileCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div 
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xs rounded-3xl p-5 shadow-2xl transition-all duration-300 relative border ${
              darkMode 
                ? 'bg-[#0f1322] border-zinc-800 text-white shadow-black/80' 
                : 'bg-white border-slate-200 text-slate-900 shadow-slate-300/80'
            }`}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowProfileCard(false)}
              className={`absolute top-3.5 right-3.5 p-1.5 rounded-full transition-colors ${
                darkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Profile Content */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3">
                {userPhoto ? (
                  <img 
                    src={userPhoto} 
                    alt={userName} 
                    className="w-20 h-20 rounded-full border-4 border-red-500 object-cover shadow-xl ring-4 ring-red-500/20"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-amber-500 text-white border-4 border-red-400 flex items-center justify-center text-2xl font-black shadow-xl ring-4 ring-red-500/20">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute bottom-0 right-0 bg-emerald-500 text-white p-1 rounded-full ring-2 ring-white dark:ring-[#0f1322] shadow-md" title="Telegram Verified">
                  <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                </div>
              </div>

              <h3 className="text-lg font-black font-heading tracking-tight leading-tight">
                {userName}
              </h3>
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-0.5">
                {userHandle}
              </p>

              <div className="w-full mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800/80 flex flex-col gap-2.5 text-xs">
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900/80">
                  <span className="font-semibold text-slate-500 dark:text-zinc-400">Role</span>
                  <span className={`flex items-center gap-1 font-bold text-xs ${roleBadge.color}`}>
                    <span>{roleBadge.emoji}</span>
                    <span>{roleBadge.label}</span>
                  </span>
                </div>

                {/* Admin Panel Launcher Button - Only for authorized Admins */}
                {isAdminUser(telegramUser?.id) && (
                  <button
                    onClick={() => {
                      setShowProfileCard(false);
                      onOpenAdmin();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-extrabold flex items-center justify-center gap-2 shadow-md shadow-red-600/30 hover:opacity-95 active:scale-95 transition-all text-xs"
                  >
                    <ShieldAlert className="w-4 h-4 stroke-[2.5]" />
                    <span>Open Admin Panel</span>
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
