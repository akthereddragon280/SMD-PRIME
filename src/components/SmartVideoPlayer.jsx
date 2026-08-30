import React, { useState, useEffect, useRef } from 'react';
import { Play, Download, AlertTriangle, Film, ShieldCheck, Cpu, HardDrive, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getProxyStreamUrl } from '../utils/proxy';
import { logDownloadAnalytics } from '../supabaseClient';
import { getTelegramUserInfo } from '../utils/telegram';
import { getOptimalStreamSource, parseSizeInGB, extractQualityBase } from '../utils/streamHelpers';
import ExternalPlayerMenu from './ExternalPlayerMenu';

/**
 * SmartVideoPlayer Component
 * 
 * Features:
 * - Smart Stream Selection (Strict >4GB Cutoff)
 * - Browser HEVC Decode Error Detection & Instant H264 Fallback
 * - Sleek Obsidian Warning UX when stream exceeds 4GB
 * - Omni-Download Section (Ignores 4GB rule, maps ALL sources)
 */
export default function SmartVideoPlayer({ movie, sources = [] }) {
  const [activeSource, setActiveSource] = useState(null);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDownloading, setIsDownloading] = useState({});
  const videoRef = useRef(null);

  // Compute optimal stream source on mount or sources change
  useEffect(() => {
    const optimal = getOptimalStreamSource(sources);
    setActiveSource(optimal);
    setIsFallbackMode(false);
  }, [sources]);

  // Handle HEVC Decode Error (Black Screen Fix)
  const handleVideoError = (e) => {
    console.warn('[SmartPlayer] Native HTML5 video decode error triggered:', e);

    if (activeSource && (activeSource.video_codec === 'HEVC' || isHEVCCodec(activeSource))) {
      console.warn('[SmartPlayer] Browser does not support HEVC native decoding. Switching to H264 fallback...');
      
      // Find H264 fallback source (<= 4GB)
      const h264Fallback = sources
        .filter(s => {
          const size = typeof s.size_gb === 'number' ? s.size_gb : parseSizeInGB(s.file_size);
          const isH264 = !isHEVCCodec(s);
          return size <= 4.0 && isH264;
        })
        .sort((a, b) => (parseSizeInGB(b.file_size) - parseSizeInGB(a.file_size)))[0];

      if (h264Fallback && h264Fallback.drive_file_id !== activeSource.drive_file_id) {
        setActiveSource(h264Fallback);
        setIsFallbackMode(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.load();
            videoRef.current.play().catch(() => {});
          }
        }, 150);
      }
    }
  };

  const isHEVCCodec = (src) => {
    if (!src) return false;
    const codec = (src.video_codec || src.quality || '').toUpperCase();
    return codec.includes('HEVC') || codec.includes('X265') || codec.includes('H265');
  };

  // Helper for download trigger
  const handleDownload = (src) => {
    setIsDownloading(prev => ({ ...prev, [src.id]: true }));

    // Asynchronous non-blocking download event telemetry insert
    const tgUser = getTelegramUserInfo();
    logDownloadAnalytics(movie?.uid || movie?.id, tgUser?.id, src.quality || '1080p').catch(() => {});

    const rawUrl = getProxyStreamUrl(src.drive_file_id, movie?.title, src.quality);
    const downloadUrl = `${rawUrl}&download=1`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${movie?.title || 'movie'}_${src.quality || 'source'}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      setIsDownloading(prev => ({ ...prev, [src.id]: false }));
    }, 2000);
  };

  const playableUrl = activeSource ? getProxyStreamUrl(activeSource.drive_file_id) : '';

  return (
    <div className="w-full space-y-6 font-sans text-white">
      {/* 1. SMART PLAYER OR STREAM UNAVAILABLE CARD */}
      {activeSource ? (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl">
          {/* HEVC Fallback Notice Badge */}
          {isFallbackMode && (
            <div className="absolute top-3 left-3 z-30 flex items-center gap-2 rounded-xl bg-amber-500/20 px-3.5 py-1.5 backdrop-blur-md border border-amber-500/30 text-amber-300 text-xs font-bold font-mono">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>HEVC Unsupported: Switched to H264 Fallback</span>
            </div>
          )}

          {/* Video Stream Element */}
          <div className="relative aspect-video w-full bg-black">
            <video
              ref={videoRef}
              src={playableUrl}
              controls
              playsInline
              onError={handleVideoError}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="h-full w-full object-contain"
              poster={movie?.backdrop_url || movie?.poster_url}
            />
          </div>

          {/* Active Quality & Codec Telemetry Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-zinc-900/90 px-5 py-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-bold text-red-400 font-mono">
                <Film className="w-4 h-4 text-red-500" />
                <span>Playing: {activeSource.quality}</span>
              </span>
              <span className="rounded-md bg-white/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-300">
                {activeSource.video_codec || (isHEVCCodec(activeSource) ? 'HEVC' : 'H264')}
              </span>
              <span className="text-zinc-400 font-mono">
                {activeSource.size_gb ? `${activeSource.size_gb} GB` : activeSource.file_size}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-mono font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Proxy Active (&lt; 4.0GB Optimal)</span>
            </div>
          </div>
        </div>
      ) : (
        /* STREAM UNAVAILABLE WARNING CARD (ALL FILES > 4GB) */
        <div className="relative overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/40 via-zinc-950 to-zinc-950 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 mb-4 shadow-lg shadow-red-500/10">
            <AlertTriangle className="w-8 h-8 stroke-[2.2] animate-bounce" />
          </div>

          <h3 className="text-lg font-black text-white tracking-wide uppercase">
            Streaming Unavailable
          </h3>
          <p className="mt-2 text-sm text-zinc-300 max-w-md mx-auto leading-relaxed font-medium">
            File Size Exceeds 4GB Cutoff. Browser progressive streaming is disabled to prevent buffering deadlocks.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-zinc-900/90 border border-white/10 px-4 py-2 text-xs font-mono text-amber-400">
            <HardDrive className="w-4 h-4 text-amber-500" />
            <span>Please use the Omni-Download option below</span>
          </div>
        </div>
      )}

      {/* 1b. EXTERNAL PLAYER INTENTS (VLC, MX PLAYER, SYSTEM DEFAULT) */}
      <ExternalPlayerMenu streamUrl={playableUrl} movieTitle={movie?.title} />

      {/* 2. OMNI-DOWNLOAD SECTION (IGNORES 4GB RULE) */}
      <div className="rounded-3xl border border-white/10 bg-zinc-900/80 p-6 backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Download className="w-5 h-5 text-red-500" />
            <h4 className="text-sm font-black uppercase tracking-wider text-white">
              Omni-Download Options
            </h4>
          </div>
          <span className="text-xs font-mono text-zinc-400 font-semibold">
            {sources.length} Qualities Available
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {sources.map((src) => {
            const sizeInGb = typeof src.size_gb === 'number' ? src.size_gb : parseSizeInGB(src.file_size);
            const codec = src.video_codec || (isHEVCCodec(src) ? 'HEVC' : 'H264');
            const isDownloadingThis = isDownloading[src.id];

            return (
              <div
                key={src.id || src.drive_file_id}
                className="group relative flex items-center justify-between rounded-2xl border border-white/10 bg-zinc-950/80 p-4 transition-all duration-200 hover:border-red-500/40 hover:bg-zinc-900 shadow-md hover:shadow-red-500/5"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-white group-hover:text-red-400 transition-colors">
                      {src.quality}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-bold ${
                      codec === 'HEVC' 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    }`}>
                      {codec}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                    <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{sizeInGb ? `${sizeInGb.toFixed(1)} GB` : src.file_size}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleDownload(src)}
                  disabled={isDownloadingThis}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-600/20 transition-all hover:from-red-500 hover:to-red-600 active:scale-95 disabled:opacity-50"
                >
                  {isDownloadingThis ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{isDownloadingThis ? 'Starting...' : `Download ${src.quality}`}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
