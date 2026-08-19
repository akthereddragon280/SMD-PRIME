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
    <header className={`sticky top-0 z-40 w-full transition-colors duration-200 ${
      darkMode 
        ? 'bg-slate-950/90 text-white border-slate-800' 
        : 'bg-white/90 text-slate-900 border-slate-200/80'
    } backdrop-blur-md border-b px-4 py-3 shadow-xs`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveCategory('All')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-red-500 flex items-center justify-center text-white shadow-md shadow-red-500/20">
            <Film className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight font-heading text-slate-900 dark:text-white leading-none">
                SMD<span className="text-red-600">PRIME</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md badge-red shadow-xs">
                TMA
              </span>
            </div>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 leading-none mt-0.5 flex items-center gap-1">
              <span>Cloud Cinema</span>
              <span className="inline-block w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
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
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            } border flex items-center justify-center`}
            aria-label="Search Movies"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Dark / Light Mode Toggle */}
          <button
            onClick={handleThemeToggle}
            className={`p-2.5 rounded-full transition-all duration-200 ${
              darkMode 
                ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-800' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            } border flex items-center justify-center`}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Telegram User Indicator */}
          <div className={`flex items-center gap-2 pl-2 border-l ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            {telegramUser?.photo_url ? (
              <img 
                src={telegramUser.photo_url} 
                alt={telegramUser.first_name || 'User'} 
                className="w-8 h-8 rounded-full border-2 border-red-500 object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold shadow-xs">
                {telegramUser?.first_name ? telegramUser.first_name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}
