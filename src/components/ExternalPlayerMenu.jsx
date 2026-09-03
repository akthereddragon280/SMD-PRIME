import React, { useState } from 'react';
import { Play, Tv, Copy, Check, ShieldCheck } from 'lucide-react';
import { triggerHaptic, openExternalLink, getTelegramUserInfo } from '../utils/telegram';
import { triggerIntentionalAd } from '../utils/adEngine';
import { getRolePolicies, getUserEntitlements } from '../supabaseClient';

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
export default function ExternalPlayerMenu({ streamUrl, movieTitle = 'Movie Stream', variant = 'default', onExternalPlayTriggered, userRole = 'normal', rolePolicies }) {
  const [copied, setCopied] = useState(false);
  const [policyToast, setPolicyToast] = useState(null);

  if (!streamUrl) return null;

  const urls = generatePlayerUrls(streamUrl);

  const handleLaunchPlayer = (e, playerType) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 🔐 IRON GATE: Check External Player Policy for Active User Role
    try {
      const entitlement = getUserEntitlements(userRole, rolePolicies);
      if (entitlement.external_player === false) {
        triggerHaptic('medium');
        setPolicyToast(`🔒 External Player Locked: Handoff disabled for ${userRole.toUpperCase()} tier by Admin Policy.`);
        setTimeout(() => setPolicyToast(null), 3500);
        return;
      }

      triggerIntentionalAd({
        userRole: userRole,
        enableAds: entitlement.enable_ads,
        actionType: 'play'
      });
    } catch (err) {}

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

  // Compact Variant for Micro Popovers (Horizontal 4-Option Grid under "OPEN") -> LOGO ONLY (STRICTLY NO TEXT)
  if (variant === 'compact') {
    return (
      <div className="w-full font-sans relative select-none">
        {/* 4 Options Grid: VLC, MX, System Default, Copy Link (LOGO ONLY) */}
        <div className="flex items-center justify-around gap-2 p-1.5 rounded-2xl bg-[#07090e]/95 border border-white/15 backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.9)]">
          {/* 1. VLC Player Logo */}
          <a
            href={urls.vlcIntent}
            onClick={(e) => handleLaunchPlayer(e, 'vlc')}
            className="p-2 rounded-xl hover:bg-amber-500/20 active:scale-90 transition-all cursor-pointer group"
            title="VLC Player"
          >
            <VlcIcon className="w-8 h-8 group-hover:scale-110 transition-transform drop-shadow-[0_4px_10px_rgba(255,136,0,0.5)]" />
          </a>

          {/* 2. MX Player Logo */}
          <a
            href={urls.mxIntent}
            onClick={(e) => handleLaunchPlayer(e, 'mx')}
            className="p-2 rounded-xl hover:bg-blue-500/20 active:scale-90 transition-all cursor-pointer group"
            title="MX Player"
          >
            <MxPlayerIcon className="w-8 h-8 group-hover:scale-110 transition-transform drop-shadow-[0_4px_10px_rgba(0,102,255,0.5)]" />
          </a>

          {/* 3. System Default Player Logo */}
          <a
            href={urls.systemIntent}
            onClick={(e) => handleLaunchPlayer(e, 'system')}
            className="p-2 rounded-xl hover:bg-emerald-500/20 active:scale-90 transition-all cursor-pointer group"
            title="System Default Player"
          >
            <SystemPlayerIcon className="w-8 h-8 group-hover:scale-110 transition-transform drop-shadow-[0_4px_10px_rgba(16,185,129,0.5)]" />
          </a>

          {/* 4. Copy Link Fallback Icon */}
          <button
            onClick={handleCopyLink}
            className="p-2 rounded-xl hover:bg-purple-500/20 active:scale-90 transition-all cursor-pointer group"
            title="Copy Direct Stream Link"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-110 transition-transform shadow-inner">
              {copied ? <Check className="w-5 h-5 text-emerald-400 animate-bounce" /> : <Copy className="w-4 h-4 text-purple-300" />}
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Default Full Variant (for Settings / Standalone)
  return (
    <div className="w-full space-y-3 font-sans select-none">
      <div className="p-4 rounded-3xl border border-white/10 bg-[#07090e]/95 backdrop-blur-2xl space-y-3.5 animate-fadeIn shadow-[0_20px_50px_rgba(0,0,0,0.9)]">
        <div className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-400 border-b border-white/10 pb-2.5 text-center flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>OPEN WITH EXTERNAL PLAYER</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {/* 1. VLC Player */}
          <a
            href={urls.vlcIntent}
            onClick={(e) => handleLaunchPlayer(e, 'vlc')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all active:scale-[0.98] group cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-3.5">
              <VlcIcon className="w-9 h-9 group-hover:scale-110 transition-transform drop-shadow-[0_4px_12px_rgba(255,136,0,0.5)]" />
              <div>
                <div className="text-xs font-black text-white group-hover:text-amber-300 transition-colors">
                  Play in VLC Player
                </div>
                <div className="text-[10px] font-mono text-amber-400/80 mt-0.5">
                  Recommended for 4K / HEVC HDR
                </div>
              </div>
            </div>
            <Play className="w-4 h-4 text-amber-400 fill-current group-hover:translate-x-1 transition-transform" />
          </a>

          {/* 2. MX Player */}
          <a
            href={urls.mxIntent}
            onClick={(e) => handleLaunchPlayer(e, 'mx')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 transition-all active:scale-[0.98] group cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-3.5">
              <MxPlayerIcon className="w-9 h-9 group-hover:scale-110 transition-transform drop-shadow-[0_4px_12px_rgba(0,102,255,0.5)]" />
              <div>
                <div className="text-xs font-black text-white group-hover:text-blue-300 transition-colors">
                  Play in MX Player (Android)
                </div>
                <div className="text-[10px] font-mono text-blue-400/80 mt-0.5">
                  Hardware accelerated SW/HW decoding
                </div>
              </div>
            </div>
            <Play className="w-4 h-4 text-blue-400 fill-current group-hover:translate-x-1 transition-transform" />
          </a>

          {/* 3. System Default Player */}
          <a
            href={urls.systemIntent}
            onClick={(e) => handleLaunchPlayer(e, 'system')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-all active:scale-[0.98] group cursor-pointer shadow-md"
          >
            <div className="flex items-center gap-3.5">
              <SystemPlayerIcon className="w-9 h-9 group-hover:scale-110 transition-transform drop-shadow-[0_4px_12px_rgba(16,185,129,0.5)]" />
              <div>
                <div className="text-xs font-black text-white group-hover:text-emerald-300 transition-colors">
                  Play in System Default Player
                </div>
                <div className="text-[10px] font-mono text-emerald-400/80 mt-0.5">
                  Opens Android / iOS native player chooser
                </div>
              </div>
            </div>
            <Tv className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
          </a>

          {/* 4. Copy Stream Link Button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 transition-all active:scale-[0.98] group cursor-pointer w-full text-left shadow-md"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 group-hover:scale-110 transition-transform shadow-inner">
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-purple-300" />}
              </div>
              <div>
                <div className="text-xs font-black text-white group-hover:text-purple-300 transition-colors">
                  {copied ? 'Link Copied to Clipboard!' : 'Copy Direct Stream Link'}
                </div>
                <div className="text-[10px] font-mono text-purple-400/80 mt-0.5">
                  {copied ? 'Paste into VLC Media -> Open Network Stream' : 'Copy link for manual player entry'}
                </div>
              </div>
            </div>
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-purple-300" />}
          </button>
        </div>

        {/* Disclaimer text */}
        <div className="pt-1 text-center">
          <p className="text-[10px] font-mono text-zinc-400 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-500 inline" />
            <span>Note: Ensure external player app is installed on your device.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
