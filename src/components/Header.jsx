import React from 'react';
import { Search, Film, Moon, Sun, User, Sparkles } from 'lucide-react';
import { triggerHaptic, getTelegramUserInfo } from '../utils/telegram';

export default function Header({ 
  onOpenSearch, 
  darkMode, 
  setDarkMode, 
  activeCategory, 
  setActiveCategory 
}) {
  const telegramUser = getTelegramUserInfo();

  const handleSearchClick = () => {
    triggerHaptic('light');
    onOpenSearch();
  };

  const handleThemeToggle = () => {
    triggerHaptic('medium');
    setDarkMode(!darkMode);
  };

  return (
    <header className={`sticky top-0 z-40 w-full transition-all duration-300 ${
      darkMode 
        ? 'bg-[#0c0f18]/80 text-white border-zinc-800/80 shadow-lg shadow-black/40' 
        : 'bg-white/80 text-slate-900 border-slate-200/80 shadow-sm shadow-slate-200/50'
    } backdrop-blur-2xl border-b px-4 py-3`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        
        {/* Brand Logo */}
        <div 
          className="flex items-center gap-2.5 cursor-pointer group" 
          onClick={() => setActiveCategory('All')}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 via-red-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30 group-hover:scale-105 transition-transform duration-200">
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
            <p className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 leading-none mt-0.5 flex items-center gap-1">
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
                ? 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border-zinc-800/80 shadow-md' 
                : 'bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 border-slate-200/80 shadow-xs'
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
                ? 'bg-zinc-900/90 hover:bg-zinc-800 text-amber-400 border-zinc-800/80 shadow-md' 
                : 'bg-slate-100/90 hover:bg-slate-200/90 text-amber-500 border-slate-200/80 shadow-xs'
            } border flex items-center justify-center active:scale-95`}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Telegram User Indicator */}
          <div className={`flex items-center gap-2 pl-2 border-l ${darkMode ? 'border-zinc-800' : 'border-slate-200'}`}>
            {telegramUser?.photo_url ? (
              <img 
                src={telegramUser.photo_url} 
                alt={telegramUser.first_name || 'User'} 
                className="w-8 h-8 rounded-full border-2 border-red-500 object-cover shadow-xs"
              />
            ) : (
              <div className={`w-8 h-8 rounded-full ${
                darkMode ? 'bg-zinc-800 text-zinc-200 border-zinc-700' : 'bg-slate-200 text-slate-700 border-slate-300'
              } border flex items-center justify-center text-xs font-bold shadow-xs`}>
                {telegramUser?.first_name ? telegramUser.first_name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
