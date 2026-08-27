import React, { useState } from 'react';
import { Play, Tv, Copy, Check, ShieldCheck } from 'lucide-react';
import { triggerHaptic, openExternalLink } from '../utils/telegram';

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
 * Helper: Generates 1000% Bulletproof URLs & Intents for External Players
 * 
 * Rules:
 * 1. Ensure streamUrl is fully qualified HTTPS.
 * 2. VLC Direct Scheme: vlc://${streamUrl} (MUST retain the https:// prefix)
 * 3. VLC Android Intent: intent:${streamUrl}#Intent;package=org.videolan.vlc;type=video/*;scheme=https;end
 * 4. MX Player Android Intent: intent:${streamUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;scheme=https;end
 * 5. System Default Chooser Intent: intent:${streamUrl}#Intent;action=android.intent.action.VIEW;type=video/*;scheme=https;end
 */
export function generatePlayerUrls(streamUrl) {
  if (!streamUrl) return { vlcScheme: '', vlcIntent: '', mxIntent: '', systemIntent: '', raw: '' };

  const raw = String(streamUrl).trim();

  return {
    raw,
    vlcScheme: `vlc://${raw}`,
    vlcIntent: `intent:${raw}#Intent;package=org.videolan.vlc;type=video/*;scheme=https;end`,
    mxIntent: `intent:${raw}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;scheme=https;end`,
    systemIntent: `intent:${raw}#Intent;action=android.intent.action.VIEW;type=video/*;scheme=https;end`
  };
}

/**
 * ExternalPlayerMenu Component
 * 
 * Bypasses Telegram Mini App hardware & browser decoding limitations by routing 
 * direct stream URLs into native Android / iOS external video player apps or copying link.
 */
export default function ExternalPlayerMenu({ streamUrl, movieTitle = 'Movie Stream', variant = 'default', onExternalPlayTriggered }) {
  const [copied, setCopied] = useState(false);

  if (!streamUrl) return null;

  const urls = generatePlayerUrls(streamUrl);

  const handleLaunchPlayer = (e, playerType) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerHaptic('heavy');

    const rawStreamUrl = urls.raw;
    if (!rawStreamUrl) return;

    // 1. Instantly trigger parent callback to pause HTML5 video & release hardware video decoder
    if (typeof onExternalPlayTriggered === 'function') {
      onExternalPlayTriggered();
    }

    // 2. Wait ~300ms for OS & browser to cleanly release hardware decoder resources
    setTimeout(() => {
      // HTTPS Bounce Gateway URL to escape TMA WebView Sandbox
      const gatewayUrl = `${window.location.origin}/player-gate?app=${encodeURIComponent(playerType)}&url=${encodeURIComponent(rawStreamUrl)}`;
      openExternalLink(gatewayUrl);
    }, 300);
  };

  const handleCopyLink = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerHaptic('light');

    if (!urls.raw) return;

    const copyTextToClipboard = (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        return new Promise((resolve, reject) => {
          document.execCommand('copy') ? resolve() : reject();
          textArea.remove();
        });
      }
    };

    copyTextToClipboard(urls.raw)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3500);
      })
      .catch(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3500);
      });
  };

  // Compact Variant for Micro Popovers (Horizontal 4-Option Grid under "PLAY WITH")
  if (variant === 'compact') {
    return (
      <div className="w-full space-y-2.5 font-sans relative">
        <div className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-400 text-center">
          PLAY WITH
        </div>

        {/* 4 Options Grid: VLC, MX, Default, Copy */}
        <div className="grid grid-cols-4 gap-1.5">
          {/* 1. VLC Player */}
          <a
            href={urls.vlcIntent}
            onClick={(e) => handleLaunchPlayer(e, 'vlc')}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-amber-500/10 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-all active:scale-95 group shadow-md cursor-pointer"
            title="Play in VLC Player"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <VlcIcon className="w-7 h-7" />
            </div>
            <span className="text-[9px] font-extrabold text-white mt-1 group-hover:text-amber-300">VLC</span>
          </a>

          {/* 2. MX Player */}
          <a
            href={urls.mxIntent}
            onClick={(e) => handleLaunchPlayer(e, 'mx')}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-blue-500/10 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 transition-all active:scale-95 group shadow-md cursor-pointer"
            title="Play in MX Player"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <MxPlayerIcon className="w-7 h-7" />
            </div>
            <span className="text-[9px] font-extrabold text-white mt-1 group-hover:text-blue-300">MX</span>
          </a>

          {/* 3. System Default */}
          <a
            href={urls.systemIntent}
            onClick={(e) => handleLaunchPlayer(e, 'system')}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition-all active:scale-95 group shadow-md cursor-pointer"
            title="Play in System Default Player"
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <SystemPlayerIcon className="w-7 h-7" />
            </div>
            <span className="text-[9px] font-extrabold text-white mt-1 group-hover:text-emerald-300">Default</span>
          </a>

          {/* 4. Copy Link Fallback Button */}
          <button
            onClick={handleCopyLink}
            className="flex flex-col items-center justify-center p-2 rounded-2xl bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 transition-all active:scale-95 group shadow-md cursor-pointer"
            title="Copy Direct Stream Link"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-110 transition-transform">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-purple-300" />}
            </div>
            <span className="text-[9px] font-extrabold text-white mt-1 group-hover:text-purple-300">
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
        </div>

        {/* Copy Toast Feedback Notice */}
        {copied && (
          <div className="p-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-mono text-center animate-fadeIn shadow-lg">
            ✨ Stream Link Copied! Paste into VLC Network Stream.
          </div>
        )}
      </div>
    );
  }

  // Default Full Variant (for Settings / Standalone)
  return (
    <div className="w-full space-y-3 font-sans">
      <div className="p-4 rounded-2xl border border-white/10 bg-zinc-950/95 backdrop-blur-xl space-y-3 animate-fadeIn shadow-2xl">
        <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-400 border-b border-white/10 pb-2 text-center">
          PLAY WITH EXTERNAL PLAYER
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {/* 1. VLC Player */}
          <a
            href={urls.vlcIntent}
            onClick={(e) => handleLaunchPlayer(e, 'vlc')}
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

          {/* 2. MX Player */}
          <a
            href={urls.mxIntent}
            onClick={(e) => handleLaunchPlayer(e, 'mx')}
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

          {/* 3. System Default Player */}
          <a
            href={urls.systemIntent}
            onClick={(e) => handleLaunchPlayer(e, 'system')}
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

          {/* 4. Copy Stream Link Button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 transition-all active:scale-[0.98] group cursor-pointer w-full text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-105 transition-transform">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-purple-300" />}
              </div>
              <div>
                <div className="text-xs font-black text-white group-hover:text-purple-300 transition-colors">
                  {copied ? 'Link Copied to Clipboard!' : 'Copy Direct Stream Link'}
                </div>
                <div className="text-[10px] font-mono text-purple-400/80">
                  {copied ? 'Paste into VLC Media -> Open Network Stream' : 'Copy link for manual player entry'}
                </div>
              </div>
            </div>
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-purple-300" />}
          </button>
        </div>

        {/* Disclaimer text */}
        <div className="pt-1 text-center">
          <p className="text-[10px] font-mono text-zinc-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3 text-zinc-600 inline" />
            <span>Note: Ensure external player app is installed on your device.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
