import React from 'react';
import { Play, Tv, ExternalLink, ShieldCheck } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

/**
 * Realistic VLC Traffic Cone SVG Component
 */
export function VlcIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20.5 4L27.5 4L31 16H17L20.5 4Z" fill="#FF8800" />
      <path d="M17 16L31 16L34 26H14L17 16Z" fill="#FFFFFF" />
      <path d="M14 26L34 26L37.5 36H10.5L14 26Z" fill="#FF7700" />
      <path d="M10.5 36L37.5 36L39.5 42H8.5L10.5 36Z" fill="#FFFFFF" />
      <rect x="5" y="41" width="38" height="4" rx="2" fill="#E65100" />
    </svg>
  );
}

/**
 * Realistic MX Player SVG Component
 */
export function MxPlayerIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="url(#mx_grad)" />
      <circle cx="24" cy="24" r="14" fill="white" />
      <path d="M21 17L31 24L21 31V17Z" fill="#0066FF" />
      <defs>
        <linearGradient id="mx_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00A2FF" />
          <stop offset="1" stopColor="#0055FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Realistic System Default Player SVG Component
 */
export function SystemPlayerIcon({ className = "w-7 h-7" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="14" fill="url(#sys_grad)" />
      <rect x="8" y="10" width="32" height="22" rx="4" fill="#10B981" fillOpacity="0.3" stroke="#34D399" strokeWidth="2" />
      <path d="M21 16L30 21L21 26V16Z" fill="#34D399" />
      <path d="M16 38L24 32L32 38" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="sys_grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#065F46" />
          <stop offset="1" stopColor="#022C22" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * ExternalPlayerMenu Component
 * 
 * Bypasses Telegram Mini App hardware & browser decoding limitations by routing 
 * direct stream URLs directly into native Android / iOS external video player apps.
 */
export default function ExternalPlayerMenu({ streamUrl, movieTitle = 'Movie Stream', variant = 'default' }) {
  if (!streamUrl) return null;

  // Clean stream URL (strips quotes or whitespace)
  const cleanUrl = String(streamUrl).trim();

  // 1. VLC URL scheme & official Android intent
  const vlcUrl = cleanUrl.startsWith('vlc://') ? cleanUrl : `vlc://${cleanUrl.replace(/^vlc:\/\//i, '')}`;

  // 2. MX Player Android Intent
  const mxPlayerUrl = `intent:${cleanUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end;`;

  // 3. System Default Android Chooser Intent
  const systemDefaultUrl = `intent:${cleanUrl}#Intent;action=android.intent.action.VIEW;type=video/*;end;`;

  // Bulletproof custom scheme launcher to prevent Telegram Mini App ERR_UNKNOWN_URL_SCHEME errors
  const handleLaunchPlayer = (e, targetUrl) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerHaptic('heavy');

    if (!targetUrl) return;

    try {
      // Direct window location trigger (Android OS catches Intent directly from WebView)
      window.location.href = targetUrl;
    } catch (err) {
      // Fallback via dynamic link element click
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch (e) {}
      }, 500);
    }
  };

  // Compact Variant for Micro Popovers (Horizontal 3-Logo Layout under "PLAY WITH")
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
            onClick={(e) => handleLaunchPlayer(e, vlcUrl)}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-all active:scale-95 group shadow-lg cursor-pointer"
            title="Play in VLC Player"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <VlcIcon className="w-8 h-8" />
            </div>
            <span className="text-[10px] font-extrabold text-white mt-1 group-hover:text-amber-300">VLC</span>
          </a>

          {/* 2. MX Player */}
          <a
            href={mxPlayerUrl}
            onClick={(e) => handleLaunchPlayer(e, mxPlayerUrl)}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 transition-all active:scale-95 group shadow-lg cursor-pointer"
            title="Play in MX Player"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <MxPlayerIcon className="w-8 h-8" />
            </div>
            <span className="text-[10px] font-extrabold text-white mt-1 group-hover:text-blue-300">MX Player</span>
          </a>

          {/* 3. System Default */}
          <a
            href={systemDefaultUrl}
            onClick={(e) => handleLaunchPlayer(e, systemDefaultUrl)}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition-all active:scale-95 group shadow-lg cursor-pointer"
            title="Play in System Default Player"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <SystemPlayerIcon className="w-8 h-8" />
            </div>
            <span className="text-[10px] font-extrabold text-white mt-1 group-hover:text-emerald-300">Default</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3 font-sans">
      <div className="p-4 rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl space-y-3 animate-fadeIn shadow-2xl">
        <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-400 border-b border-white/10 pb-2 text-center">
          PLAY WITH
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {/* 1. VLC Player */}
          <a
            href={vlcUrl}
            onClick={(e) => handleLaunchPlayer(e, vlcUrl)}
            className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all active:scale-[0.98] group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <VlcIcon className="w-8 h-8 group-hover:scale-105 transition-transform" />
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
            onClick={(e) => handleLaunchPlayer(e, mxPlayerUrl)}
            className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 transition-all active:scale-[0.98] group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <MxPlayerIcon className="w-8 h-8 group-hover:scale-105 transition-transform" />
              <div>
                <div className="text-xs font-black text-white group-hover:text-blue-300 transition-colors">
                  Play in MX Player (Android)
                </div>
                <div className="text-[10px] font-mono text-blue-400/80">
                  Hardware accelerated SW/HW decoding
                </div>
              </div>
            </div>
            <Play className="w-4 h-4 text-blue-400 fill-current group-hover:translate-x-0.5 transition-transform" />
          </a>

          {/* 3. System Default Player (Android Chooser) */}
          <a
            href={systemDefaultUrl}
            onClick={(e) => handleLaunchPlayer(e, systemDefaultUrl)}
            className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-all active:scale-[0.98] group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <SystemPlayerIcon className="w-8 h-8 group-hover:scale-105 transition-transform" />
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
    </div>
  );
}
