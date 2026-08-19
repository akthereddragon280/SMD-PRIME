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

  const movieUid = propMovieUid || movie?.uid || movie?.id || 'master_2021';
  const movieTitle = movie?.title || 'Movie Stream';

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

  // 1. Fetch Dynamic Movie Quality Sources from Supabase 'movie_sources' Table
  useEffect(() => {
    async function fetchMovieSources() {
      setLoading(true);
      try {
        let availableSources = (movie?.sources && movie.sources.length > 0) ? movie.sources : [];

        const { data, error } = await supabase
          .from('movie_sources')
          .select('*')
          .eq('movie_uid', movieUid);

        if (error) {
          console.warn('Error fetching movie_sources from Supabase:', error.message);
        }

        if (data && data.length > 0) {
          availableSources = data;
        }

        if (availableSources.length > 0) {
          setSources(availableSources);
          const defaultSrc = availableSources.find(s => s.quality === '1080p') || 
                             availableSources.find(s => s.quality === '720p') || 
                             availableSources[0];
          setCurrentQuality(defaultSrc.quality || '1080p');
          setActiveVideoUrl(getProxyStreamUrl(defaultSrc.drive_file_id || movie?.file_id));
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

    fetchMovieSources();
  }, [movieUid, movie]);

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

  // 3. Skip ±10 Seconds
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

  // 4. Dynamic Live Quality Switcher (Preserves exact Playback Timestamp)
  const handleQualityChange = (sourceObj) => {
    triggerHaptic('medium');
    const savedTimestamp = videoRef.current?.currentTime || currentTime;
    const targetQuality = sourceObj.quality || 'HD';
    const driveId = sourceObj.drive_file_id || movie?.file_id;

    setCurrentQuality(targetQuality);
    const newUrl = getProxyStreamUrl(driveId);
    setActiveVideoUrl(newUrl);
    setShowQualityMenu(false);

    setTouchFeedback(`Switched to ${targetQuality}`);
    setTimeout(() => setTouchFeedback(null), 1200);

    // Restore exact timestamp when new quality stream loads
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = savedTimestamp;
        videoRef.current.playbackRate = playbackSpeed;
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }, 400);
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

  // Time Formatter (Hours & Minutes format: e.g. 2h 37m)
  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '0h 00m';
    const hours = Math.floor(timeInSeconds / 3600);
    const mins = Math.floor((timeInSeconds % 3600) / 60);
    const secs = Math.floor(timeInSeconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins < 10 ? '0' : ''}${mins}m`;
    }
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
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

            {/* Live Dynamic Quality Switcher Button */}
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
                <span>{currentQuality || '1080p'}</span>
              </button>

              {showQualityMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-11 w-44 rounded-2xl bg-slate-900/95 border border-slate-800 p-2 z-40 shadow-2xl backdrop-blur-xl"
                >
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-slate-800 mb-1 flex items-center justify-between">
                    <span>Quality ({sources.length})</span>
                    <span className="text-[9px] text-emerald-400 font-mono">LIVE</span>
                  </div>

                  {sources.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQualityChange(s)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center justify-between transition-all ${
                        currentQuality === s.quality ? 'bg-red-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{s.quality || '1080p'}</span>
                        {currentQuality === s.quality && <Check className="w-3 h-3 text-white" />}
                      </div>
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

          {/* Touch Gesture HUD Feedback */}
          {touchFeedback && (
            <div className="absolute z-30 px-4 py-2 rounded-2xl bg-slate-900/90 text-white font-extrabold text-sm border border-slate-700 shadow-2xl backdrop-blur-md animate-bounce">
              {touchFeedback}
            </div>
          )}

          {/* Main Video Element */}
          <video
            ref={videoRef}
            src={activeVideoUrl}
            autoPlay
            playsInline
            style={{ filter: `brightness(${brightness}%)` }}
            className="w-full h-full object-contain z-0"
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                videoRef.current.playbackRate = playbackSpeed;
              }
              setLoading(false);
            }}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
        </div>

        {/* Bottom Control Bar */}
        <div className="w-full z-30 p-3 sm:p-4 bg-gradient-to-t from-slate-950/95 via-slate-950/70 to-transparent flex flex-col gap-2">
          
          {/* Scrubbing Timeline Bar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] font-mono font-bold text-slate-300 min-w-[50px]">
              {formatTime(currentTime)}
            </span>

            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeekChange}
              className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-600 hover:accent-red-500"
            />

            <span className="text-[11px] font-mono font-bold text-slate-400 min-w-[50px] text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* Player Buttons Bar */}
          <div className="flex items-center justify-between pt-1">
            
            {/* Playback Controls Group */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-2 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg active:scale-95 transition-all"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              <button
                onClick={() => skipTime(-10)}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 active:scale-95"
                title="Rewind 10s"
              >
                <Rewind className="w-4 h-4" />
              </button>

              <button
                onClick={() => skipTime(10)}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 active:scale-95"
                title="Forward 10s"
              >
                <FastForward className="w-4 h-4" />
              </button>

              {/* Volume Slider & Mute Toggle */}
              <div className="flex items-center gap-2 hidden sm:flex">
                <button onClick={toggleMute} className="text-slate-400 hover:text-white">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-600"
                />
              </div>
            </div>

            {/* Right Controls Group (Fullscreen) */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 active:scale-95"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>

          </div>
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
