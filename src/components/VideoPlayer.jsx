import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Settings, Play, Pause, RotateCcw, RotateCw, 
  Volume2, VolumeX, Maximize, Minimize, Gauge, Sun, 
  Check, AlertCircle, Loader2, FastForward, Rewind 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getProxyStreamUrl } from '../utils/proxy';
import { triggerHaptic, useTelegramBackButton } from '../utils/telegram';

export default function VideoPlayer({ movie, movieUid: propMovieUid, onClose }) {
  const videoRef = useRef(null);

  const movieUid = propMovieUid || movie?.uid || movie?.id || 'batchmates_2026';
  const movieTitle = movie?.title || 'Movie Stream';

  const WORKER_PROXY = import.meta.env?.VITE_WORKER_PROXY_URL || 'https://tgstream.smd-prime.workers.dev/?id=';

  // Video State Management
  const [sources, setSources] = useState(movie?.sources || []);
  const [currentQuality, setCurrentQuality] = useState('');
  const [activeVideoUrl, setActiveVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // VLC Feature Controls: Brightness Slider (50% to 150%)
  const [brightness, setBrightness] = useState(100);
  const [showBrightnessMenu, setShowBrightnessMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Layout & Touch Feedback
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [touchFeedback, setTouchFeedback] = useState(null);

  const speeds = [0.5, 1.0, 1.25, 1.5, 2.0];

  // Bind Telegram native BackButton
  useTelegramBackButton(onClose);

  // 1. Fetch Quality Sources from Supabase movie_sources table
  useEffect(() => {
    async function fetchMovieSources() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('movie_sources')
          .select('*')
          .eq('movie_uid', movieUid);

        if (error) {
          console.warn('Error fetching movie_sources from Supabase:', error.message);
        }

        if (data && data.length > 0) {
          setSources(data);
          const defaultSrc = data.find(s => s.quality === '1080p') || data.find(s => s.quality === '720p') || data[0];
          setCurrentQuality(defaultSrc.quality);
          setActiveVideoUrl(getProxyStreamUrl(defaultSrc.drive_file_id));
        } else if (movie?.sources && movie.sources.length > 0) {
          setSources(movie.sources);
          const defaultSrc = movie.sources[0];
          setCurrentQuality(defaultSrc.quality || '1080p');
          setActiveVideoUrl(getProxyStreamUrl(defaultSrc.drive_file_id || movie.file_id));
        } else {
          const fallbackId = movie?.file_id || '1djKAD3UQmBPgkeBBLCrZjAW-D4Fod_Ng';
          const defaultSources = [
            { quality: '1080p', drive_file_id: fallbackId, file_size: '2.4 GB' },
            { quality: '720p', drive_file_id: fallbackId, file_size: '1.2 GB' },
            { quality: '480p', drive_file_id: fallbackId, file_size: '422 MB' }
          ];
          setSources(defaultSources);
          setCurrentQuality('1080p');
          setActiveVideoUrl(getProxyStreamUrl(fallbackId));
        }
      } catch (err) {
        console.error('Failed to fetch movie sources:', err);
      } finally {
        setLoading(false);
      }
    }

    if (movieUid) {
      fetchMovieSources();
    }
  }, [movieUid]);

  // 2. Play / Pause Handler
  const togglePlay = () => {
    triggerHaptic('light');
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  // 3. Skip ±10 Seconds (Buttons & Gesture Zones)
  const skipTime = (seconds) => {
    triggerHaptic('medium');
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setTouchFeedback(seconds > 0 ? `+${seconds}s` : `${seconds}s`);
      setTimeout(() => setTouchFeedback(null), 800);
    }
  };

  // 4. Quality Switcher (Preserves Playback Timestamp)
  const handleQualityChange = (sourceObj) => {
    triggerHaptic('medium');
    const savedTimestamp = videoRef.current?.currentTime || currentTime;

    setCurrentQuality(sourceObj.quality);
    const newUrl = getProxyStreamUrl(sourceObj.drive_file_id);
    setActiveVideoUrl(newUrl);
    setShowQualityMenu(false);

    setTouchFeedback(`Switched to ${sourceObj.quality}`);
    setTimeout(() => setTouchFeedback(null), 1200);

    // Restore exact timestamp when new quality stream loads
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = savedTimestamp;
        videoRef.current.playbackRate = playbackSpeed;
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }, 350);
  };

  // 5. Speed Switcher
  const handleSpeedChange = (speed) => {
    triggerHaptic('light');
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
    setTouchFeedback(`Speed: ${speed}x`);
    setTimeout(() => setTouchFeedback(null), 1000);
  };

  // 6. Volume Control Slider & Mute Toggle
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    triggerHaptic('light');
    if (videoRef.current) {
      const nextState = !isMuted;
      videoRef.current.muted = nextState;
      setIsMuted(nextState);
    }
  };

  // 7. Timeline Progress Scrubbing
  const handleSeekChange = (e) => {
    const seekTo = parseFloat(e.target.value);
    setCurrentTime(seekTo);
    if (videoRef.current) {
      videoRef.current.currentTime = seekTo;
    }
  };

  // Time Formatter (HH:MM:SS)
  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return '00:00';
    const mins = Math.floor(timeInSeconds / 60);
    const secs = Math.floor(timeInSeconds % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // 8. Fullscreen & Orientation Lock Toggle
  const toggleFullscreen = () => {
    triggerHaptic('medium');
    const container = document.getElementById('vlc-player-container');
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) container.requestFullscreen();
      setIsFullscreen(true);
      try {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (e) {}
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      setIsFullscreen(false);
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (e) {}
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        id="vlc-player-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 bg-slate-950 flex flex-col items-center justify-between overflow-hidden select-none"
      >
        {/* Loading Spinner Screen */}
        {loading && (
          <div className="absolute inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center text-white">
            <Loader2 className="w-10 h-10 animate-spin text-red-600 mb-3" />
            <span className="text-xs font-bold font-mono tracking-wider text-slate-300">
              Connecting to VLC Proxy Node...
            </span>
          </div>
        )}

        {/* Top Header Control Bar */}
        <div className="w-full z-30 p-3 sm:p-4 bg-gradient-to-b from-slate-950/95 via-slate-950/70 to-transparent flex items-center justify-between">
          
          {/* Back Button */}
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white font-extrabold text-xs border border-slate-700 backdrop-blur-md active:scale-95 shadow-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Close</span>
          </button>

          {/* Title Header */}
          <div className="text-center truncate px-2 max-w-[150px] sm:max-w-md">
            <h2 className="text-xs sm:text-sm font-extrabold text-white font-heading truncate">
              {movieTitle}
            </h2>
            <div className="flex items-center justify-center gap-1 text-[10px] font-mono text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="truncate">tgstream.smd-prime.workers.dev</span>
            </div>
          </div>

          {/* VLC Controls Menu Group (Speed, Quality, Brightness) */}
          <div className="flex items-center gap-2">
            
            {/* Brightness Control Toggle */}
            <div className="relative">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowBrightnessMenu(!showBrightnessMenu);
                  setShowSpeedMenu(false);
                  setShowQualityMenu(false);
                }}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-amber-400 border border-slate-700 active:scale-95"
                title="VLC Video Brightness"
              >
                <Sun className="w-4 h-4" />
              </button>

              {/* Brightness Popover Slider */}
              {showBrightnessMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-11 w-44 rounded-2xl bg-slate-900/95 border border-slate-800 p-3 z-40 shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-2">
                    <span className="flex items-center gap-1 text-amber-400">
                      <Sun className="w-3.5 h-3.5" /> Brightness
                    </span>
                    <span>{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={brightness}
                    onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                </motion.div>
              )}
            </div>

            {/* Speed Selector */}
            <div className="relative">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowBrightnessMenu(false);
                  setShowQualityMenu(false);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-extrabold border border-slate-700 flex items-center gap-1 active:scale-95"
              >
                <Gauge className="w-3.5 h-3.5 text-red-500" />
                <span>{playbackSpeed}x</span>
              </button>

              {showSpeedMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-11 w-32 rounded-2xl bg-slate-900/95 border border-slate-800 p-2 z-40 shadow-2xl backdrop-blur-xl"
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-800 mb-1">
                    Speed
                  </div>
                  {speeds.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-between transition-all ${
                        playbackSpeed === s ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{s}x</span>
                      {playbackSpeed === s && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </div>

            {/* Quality Switcher Button */}
            <div className="relative">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowQualityMenu(!showQualityMenu);
                  setShowBrightnessMenu(false);
                  setShowSpeedMenu(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-1 shadow-lg shadow-red-600/30 active:scale-95 border border-red-500/50"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{currentQuality || 'HD'}</span>
              </button>

              {showQualityMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-11 w-40 rounded-2xl bg-slate-900/95 border border-slate-800 p-2 z-40 shadow-2xl backdrop-blur-xl"
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-800 mb-1">
                    Quality
                  </div>
                  {sources.map((s) => (
                    <button
                      key={s.id || s.quality}
                      onClick={() => handleQualityChange(s)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-between transition-all ${
                        currentQuality === s.quality ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{s.quality}</span>
                      <span className="text-[10px] font-mono text-slate-400">{s.file_size || 'HD'}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </div>

          </div>
        </div>

        {/* Video Canvas Container with VLC Brightness Filter & Double-Tap Zones */}
        <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
          
          {/* Double-Tap Gesture Zones (-10s Left | +10s Right) */}
          <div className="absolute inset-0 z-10 grid grid-cols-2 pointer-events-auto">
            <div 
              onDoubleClick={() => skipTime(-10)}
              className="h-full flex items-center justify-start pl-8 active:bg-white/5 transition-colors"
            />
            <div 
              onDoubleClick={() => skipTime(10)}
              className="h-full flex items-center justify-end pr-8 active:bg-white/5 transition-colors"
            />
          </div>

          {/* Big Center Play / Pause Overlay Button */}
          <div className="absolute z-20 pointer-events-none">
            <button
              onClick={togglePlay}
              className="pointer-events-auto w-16 h-16 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center shadow-2xl backdrop-blur-md active:scale-95 transition-all"
            >
              {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
            </button>
          </div>

          {/* Gesture Toast Feedback */}
          {touchFeedback && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="absolute z-30 px-5 py-2.5 rounded-2xl bg-red-600/90 text-white font-extrabold text-sm backdrop-blur-md shadow-2xl animate-pulse"
            >
              {touchFeedback}
            </motion.div>
          )}

          {/* HTML5 Video Element with CSS Brightness Filter */}
          <div className="w-full max-w-5xl aspect-video">
            {activeVideoUrl ? (
              <video
                ref={videoRef}
                key={activeVideoUrl}
                playsInline
                crossOrigin="anonymous"
                poster={movie?.banner_url || movie?.thumbnail_url}
                onTimeUpdate={() => {
                  if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setDuration(videoRef.current.duration);
                }}
                style={{ filter: `brightness(${brightness}%)` }}
                className="w-full h-full object-contain"
              >
                <source src={activeVideoUrl} type="video/mp4" />
              </video>
            ) : (
              <div className="text-slate-400 text-xs font-medium">
                No video stream sources available.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Control Bar & Timeline Scrubbing Bar */}
        <div className="w-full z-30 p-3 sm:p-4 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent flex flex-col gap-2">
          
          {/* Progress Timeline Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono font-bold text-slate-300 min-w-[42px]">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeekChange}
              className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
            <span className="text-[11px] font-mono font-bold text-slate-400 min-w-[42px] text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* VLC Control Bar Buttons */}
          <div className="flex items-center justify-between pt-1">
            
            {/* Play, Rewind 10s, Forward 10s */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => skipTime(-10)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
                title="-10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => skipTime(10)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
                title="+10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>

            {/* Volume Control & Fullscreen Toggle */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button onClick={toggleMute} className="text-slate-300 hover:text-white">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 sm:w-24 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
                title="Fullscreen Toggle"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>

          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
