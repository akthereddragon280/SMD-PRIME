import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, Star, Crown, RefreshCcw, Zap } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';
import { addAdminUser } from '../utils/admin';

export default function DevRoleSwitcher({ currentUserRole, onRoleChanged }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOverride, setActiveOverride] = useState(() => {
    try {
      return localStorage.getItem('smd_dev_role_override') || null;
    } catch (e) {
      return null;
    }
  });

  const handleSelectRole = (roleKey) => {
    triggerHaptic('medium');
    try {
      if (roleKey === 'db') {
        localStorage.removeItem('smd_dev_role_override');
        setActiveOverride(null);
      } else {
        localStorage.setItem('smd_dev_role_override', roleKey);
        setActiveOverride(roleKey);
        if (roleKey === 'admin' || roleKey === 'super_admin') {
          addAdminUser(0);
        }
      }
    } catch (e) {}

    // Dispatch global custom events so App.jsx, Header, & Modals update at 0ms
    const targetRole = roleKey === 'db' ? null : roleKey;
    const evt1 = new CustomEvent('smd_user_role_updated', { detail: { role: targetRole, newRole: targetRole } });
    const evt2 = new CustomEvent('smd_role_policies_changed', { detail: { role: targetRole } });
    window.dispatchEvent(evt1);
    document.dispatchEvent(evt1);
    window.dispatchEvent(evt2);
    document.dispatchEvent(evt2);

    if (onRoleChanged) onRoleChanged(targetRole);
  };

  const currentEffective = (activeOverride || currentUserRole || 'normal').toLowerCase();

  return (
    <div className="fixed bottom-4 left-4 z-50 font-sans">
      {isOpen ? (
        <div className="p-3 rounded-2xl bg-zinc-950/95 border border-red-500/30 text-white shadow-2xl backdrop-blur-xl animate-fadeIn space-y-2.5 max-w-xs">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-1.5 font-black text-xs text-red-400 uppercase tracking-wider">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>Dev Role Switcher</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => handleSelectRole('normal')}
              className={`p-2 rounded-xl text-left text-xs font-bold border transition-all flex items-center gap-1.5 ${
                currentEffective === 'normal' && activeOverride
                  ? 'bg-zinc-800 text-white border-zinc-500 ring-1 ring-zinc-400'
                  : 'bg-zinc-900/60 text-zinc-400 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <span>👤 Normal</span>
            </button>

            <button
              onClick={() => handleSelectRole('vip')}
              className={`p-2 rounded-xl text-left text-xs font-bold border transition-all flex items-center gap-1.5 ${
                (currentEffective === 'vip' || currentEffective === 'premium') && activeOverride
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 ring-1 ring-amber-400'
                  : 'bg-zinc-900/60 text-zinc-400 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>⭐ VIP</span>
            </button>

            <button
              onClick={() => handleSelectRole('admin')}
              className={`p-2 rounded-xl text-left text-xs font-bold border transition-all flex items-center gap-1.5 ${
                currentEffective === 'admin' && activeOverride
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-1 ring-emerald-400'
                  : 'bg-zinc-900/60 text-zinc-400 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>🛡️ Admin</span>
            </button>

            <button
              onClick={() => handleSelectRole('super_admin')}
              className={`p-2 rounded-xl text-left text-xs font-bold border transition-all flex items-center gap-1.5 ${
                currentEffective === 'super_admin' && activeOverride
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50 ring-1 ring-yellow-400'
                  : 'bg-zinc-900/60 text-zinc-400 border-white/5 hover:bg-zinc-800'
              }`}
            >
              <Crown className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <span>👑 Owner</span>
            </button>
          </div>

          <button
            onClick={() => handleSelectRole('db')}
            className={`w-full py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all flex items-center justify-center gap-1.5 ${
              !activeOverride
                ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                : 'bg-zinc-900 text-zinc-400 border-white/10 hover:text-white'
            }`}
          >
            <RefreshCcw className="w-3 h-3 text-indigo-400" />
            <span>{activeOverride ? 'Reset to Real Supabase DB Role' : '⚡ Live DB Sync Active'}</span>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="px-3 py-1.5 rounded-full bg-zinc-950/90 border border-red-500/40 text-white text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="capitalize">{activeOverride ? `Dev: ${activeOverride}` : `Role: ${currentEffective}`}</span>
        </button>
      )}
    </div>
  );
}
