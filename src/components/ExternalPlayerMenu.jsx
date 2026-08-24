import React, { useState } from 'react';
import { Play, Tv, Smartphone, ExternalLink, ShieldCheck, ChevronDown } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

/**
 * ExternalPlayerMenu Component
 * 
 * Bypasses Telegram Mini App hardware & browser decoding limitations by routing 
 * direct stream URLs directly into native Android / iOS external video player apps.
 * 
 * Options:
 * 1. VLC Player: `vlc://<streamUrl>`
 * 2. MX Player: `intent:<streamUrl>#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end;`
 * 3. System Default: `intent:<streamUrl>#Intent;action=android.intent.action.VIEW;type=video/*;end;`
 */
export default function ExternalPlayerMenu({ streamUrl, movieTitle = 'Movie Stream', variant = 'default' }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!streamUrl) return null;

  // Clean stream URL (strips quotes or whitespace)
  const cleanUrl = String(streamUrl).trim();

  // 1. VLC URL scheme (vlc://http://... or vlc://https://...)
  const vlcUrl = cleanUrl.startsWith('vlc://') ? cleanUrl : `vlc://${cleanUrl.replace(/^vlc:\/\//i, '')}`;

  // 2. MX Player Android Intent
  const mxPlayerUrl = `intent:${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end;`;

  // 3. System Default Android Chooser Intent
  const systemDefaultUrl = `intent:${cleanUrl}#Intent;action=android.intent.action.VIEW;type=video/*;end;`;

  const handlePlayerClick = (playerName) => {
    triggerHaptic('medium');
  };

  // Compact Variant for Micro Popovers (Horizontal 3-Logo Layout)
  if (variant === 'compact') {
    return (
      <div className="w-full space-y-2.5 font-sans">
        <div className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-400 text-center">
          PLAY WITH
        </div>
        <div className="grid grid-cols-3 gap-2">
          {/* 1. VLC Player */}
          <a
            href={vlcUrl}
            onClick={() => handlePlayerClick('VLC')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all active:scale-95 group shadow-lg"
            title="Play in VLC Player"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-400 text-xs shadow-inner group-hover:scale-105 transition-transform">
              VLC
            </div>
            <span className="text-[10px] font-extrabold text-white mt-1.5 group-hover:text-amber-300">VLC</span>
          </a>

          {/* 2. MX Player */}
          <a
            href={mxPlayerUrl}
            onClick={() => handlePlayerClick('MX Player')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 transition-all active:scale-95 group shadow-lg"
            title="Play in MX Player"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center font-black text-blue-400 text-xs shadow-inner group-hover:scale-105 transition-transform">
              MX
            </div>
            <span className="text-[10px] font-extrabold text-white mt-1.5 group-hover:text-blue-300">MX Player</span>
          </a>

          {/* 3. System Default */}
          <a
            href={systemDefaultUrl}
            onClick={() => handlePlayerClick('System Default')}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-all active:scale-95 group shadow-lg"
            title="Play in System Default Player"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-black text-emerald-400 text-xs shadow-inner group-hover:scale-105 transition-transform">
              SYS
            </div>
            <span className="text-[10px] font-extrabold text-white mt-1.5 group-hover:text-emerald-300">Default</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 font-sans">
      {/* Accordion / Dropdown Toggle Button */}
      <button
        onClick={() => {
          triggerHaptic('light');
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 hover:border-red-500/40 text-white shadow-xl transition-all group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500 group-hover:scale-105 transition-transform">
            <ExternalLink className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div className="text-left">
            <div className="text-xs font-black uppercase tracking-wider text-white">
              Play in External Player
            </div>
            <div className="text-[10px] font-mono text-zinc-400">
              Bypass TMA limits (VLC / MX Player)
            </div>
          </div>
        </div>

        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-red-400' : ''}`} />
      </button>

      {/* Menu Options */}
      {isOpen && (
        <div className="p-4 rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl space-y-3 animate-fadeIn shadow-2xl">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-zinc-400 border-b border-white/10 pb-2">
            Select External Player
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {/* 1. VLC Player */}
            <a
              href={vlcUrl}
              onClick={() => handlePlayerClick('VLC')}
              className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-400 text-xs">
                  VLC
                </div>
                <div>
                  <div className="text-xs font-black text-white group-hover:text-amber-300 transition-colors">
                    Play in VLC Player
                  </div>
                  <div className="text-[10px] font-mono text-amber-400/80">
                    Recommended for 4K / HEVC HDR
                  </div>
                </div>
              </div>
              <Play className="w-4 h-4 text-amber-400 fill-current group-hover:translate-x-0.5 transition-transform" />
            </a>

            {/* 2. MX Player (Android Intent) */}
            <a
              href={mxPlayerUrl}
              onClick={() => handlePlayerClick('MX Player')}
              className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center font-black text-blue-400 text-xs">
                  MX
                </div>
                <div>
                  <div className="text-xs font-black text-white group-hover:text-blue-300 transition-colors">
                    Play in MX Player (Android)
                  </div>
                  <div className="text-[10px] font-mono text-blue-400/80">
                    Hardware accelerated SW/HW decoding
                  </div>
                </div>
              </div>
              <Smartphone className="w-4 h-4 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
            </a>

            {/* 3. System Default Player (Android Chooser) */}
            <a
              href={systemDefaultUrl}
              onClick={() => handlePlayerClick('System Default')}
              className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center font-black text-emerald-400 text-xs">
                  SYS
                </div>
                <div>
                  <div className="text-xs font-black text-white group-hover:text-emerald-300 transition-colors">
                    Play in System Default Player
                  </div>
                  <div className="text-[10px] font-mono text-emerald-400/80">
                    Opens Android "Open with..." bottom sheet
                  </div>
                </div>
              </div>
              <Tv className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>

          {/* Disclaimer text */}
          <div className="pt-1 text-center">
            <p className="text-[10px] font-mono text-zinc-500 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3 text-zinc-600 inline" />
              <span>Note: Ensure the player app is installed on your device.</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
