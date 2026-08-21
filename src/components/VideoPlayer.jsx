import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Settings, Play, Pause, RotateCcw, RotateCw, 
  Volume2, VolumeX, Maximize, Minimize, Gauge, Sun, 
  Check, AlertCircle, Loader2, FastForward, Rewind, Clock,
  Languages, Captions, ChevronRight, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getProxyStreamUrl } from '../utils/proxy';
import { triggerHaptic, useTelegramBackButton } from '../utils/telegram';

export default function VideoPlayer({ movie, movieUid: propMovieUid, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  const movieUid = propMovieUid || movie?.uid || movie?.id || 'master_2021';
  const movieTitle = movie?.title || 'Movie Stream';

  // Video State Management
  const [sources, setSources] = useState(movie?.sources || []);
  const [currentQuality, setCurrentQuality] = useState('');
  const [activeVideoUrl, setActiveVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // Brightness Control State
  const [brightness, setBrightness] = useState(100);

  // Master Settings UI State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState('main'); // 'main' | 'quality' | 'audio' | 'subtitles' | 'speed'

  // Audio Tracks State
  const [audioTracks, setAudioTracks] = useState(
    movie?.audio_languages || ['Tamil (Org)', 'Telugu', 'Hindi', 'English']
  );
  const [currentAudio, setCurrentAudio] = useState(audioTracks[0] || 'Tamil (Org)');

  // Subtitle Tracks State
  const [subtitleTracks, setSubtitleTracks] = useState([
    { id: 'off', label: 'Off', srclang: '', src: '' },
    { id: 'en', label: 'English ESub', srclang: 'en', src: movie?.subtitles_en || 'https://tgstream.smd-prime.workers.dev/subtitles/en.vtt' },
    { id: 'ta', label: 'Tamil Subs', srclang: 'ta', src: movie?.subtitles_ta || 'https://tgstream.smd-prime.workers.dev/subtitles/ta.vtt' }
  ]);
  const [currentSubtitle, setCurrentSubtitle] = useState('off');

  // Layout, Controls Auto-Fade & Gesture Overlay
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [touchFeedback, setTouchFeedback] = useState(null);
  const [gestureHUD, setGestureHUD] = useState(null); // { type: 'brightness'|'volume'|'seek', value: string|number, timeFormatted?: string }

  // Gesture Engine Refs
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startVal: 0,
    startSeekTime: 0,
    zone: null, // 'left' | 'center' | 'right'
    direction: null, // 'horizontal' | 'vertical' | null
    isMoved: false
  });
  const hudTimeoutRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  const speeds = [0.5, 1.0, 1.25, 1.5, 2.0];

  // Bind Telegram native BackButton
  useTelegramBackButton(onClose);

  // Controls Auto-Fade Timer (Hides control bar cleanly after 3.5 seconds of inactivity)
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    // DO NOT auto-hide while Settings Modal is active
    if (showSettingsModal) return;

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSettingsModal(false);
    }, 3500);
  };

  // Freeze auto-fade timer when Settings Modal is open so user can comfortably select options
  useEffect(() => {
    if (showSettingsModal) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimeout();
    }
  }, [showSettingsModal]);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

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
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.warn('Play attempt blocked:', err);
        });
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      setIsPlaying(prev => !prev);
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

    setTouchFeedback(`Switched to ${targetQuality}`);
    setTimeout(() => setTouchFeedback(null), 1200);

    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = savedTimestamp;
        videoRef.current.playbackRate = playbackSpeed;
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }, 400);
  };

  // 5. Audio Language Switcher
  const handleAudioChange = (lang) => {
    triggerHaptic('light');
    setCurrentAudio(lang);
    setTouchFeedback(`Audio: ${lang}`);
    setTimeout(() => setTouchFeedback(null), 1000);
  };

  // 6. Subtitle Track Switcher
  const handleSubtitleChange = (subObj) => {
    triggerHaptic('light');
    setCurrentSubtitle(subObj.id);

    if (videoRef.current) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        if (subObj.id === 'off') {
          tracks[i].mode = 'disabled';
        } else if (tracks[i].language === subObj.srclang) {
          tracks[i].mode = 'showing';
        } else {
          tracks[i].mode = 'disabled';
        }
      }
    }

    setTouchFeedback(`Subtitles: ${subObj.label}`);
    setTimeout(() => setTouchFeedback(null), 1000);
  };

  // 7. Speed Switcher
  const handleSpeedChange = (speed) => {
    triggerHaptic('light');
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setTouchFeedback(`Speed: ${speed}x`);
    setTimeout(() => setTouchFeedback(null), 1000);
  };

  // 8. Volume Control Slider & Mute Toggle
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

  // 9. Timeline Progress Scrubbing
  const handleSeekChange = (e) => {
    const seekTo = parseFloat(e.target.value);
    setCurrentTime(seekTo);
    if (videoRef.current) {
      videoRef.current.currentTime = seekTo;
    }
  };

  // Time Formatter (Digital Clock format: e.g. 33:12, 1:21:00)
  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '0:00';
    const hours = Math.floor(timeInSeconds / 3600);
    const mins = Math.floor((timeInSeconds % 3600) / 60);
    const secs = Math.floor(timeInSeconds % 60);
    
    const formattedMins = String(mins).padStart(2, '0');
    const formattedSecs = String(secs).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${formattedMins}:${formattedSecs}`;
    }
    return `${mins}:${formattedSecs}`;
  };

  // 10. Robust & Refined 3-Zone Gesture Engine
  const lastTouchTimeRef = useRef(0);

  const handlePointerStart = (clientX, clientY, zone, isTouch = false) => {
    if (!isTouch && Date.now() - lastTouchTimeRef.current < 500) {
      return;
    }
    if (isTouch) {
      lastTouchTimeRef.current = Date.now();
    }

    let startVal = 0;
    if (zone === 'left') startVal = brightness;
    else if (zone === 'right') startVal = isMuted ? 0 : volume * 100;

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      startVal,
      startSeekTime: videoRef.current ? videoRef.current.currentTime : currentTime,
      zone,
      direction: null,
      isMoved: false
    };
  };

  const handlePointerMove = (clientX, clientY) => {
    const d = dragRef.current;
    if (!d.zone) return;

    const deltaX = clientX - d.startX;
    const deltaY = d.startY - clientY; // UP is positive, DOWN is negative

    if (!d.direction) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        d.isMoved = true;
        // Pause auto-fade timer during drag to prevent timeline flickering
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          d.direction = 'horizontal';
        } else {
          d.direction = 'vertical';
        }
      }
    }

    if (!d.isMoved) return;

    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);

    if (d.direction === 'horizontal') {
      // Dynamic Horizontal Scrubbing (Duration Seek)
      const screenWidth = window.innerWidth || 600;
      const seekDeltaSeconds = Math.round((deltaX / screenWidth) * 120);
      const vidDuration = videoRef.current?.duration || duration || 100;
      const targetTime = Math.max(0, Math.min(vidDuration, d.startSeekTime + seekDeltaSeconds));

      if (videoRef.current) {
        videoRef.current.currentTime = targetTime;
      }
      setCurrentTime(targetTime);

      const sign = seekDeltaSeconds >= 0 ? '+' : '';
      setGestureHUD({
        type: 'seek',
        value: `${sign}${seekDeltaSeconds}s`,
        timeFormatted: formatTime(targetTime)
      });
    } else if (d.direction === 'vertical') {
      // Vertical Drag (Left = Brightness | Right = Volume)
      const screenHeight = window.innerHeight || 400;
      const deltaPercent = (deltaY / (screenHeight * 0.45)) * 100;

      if (d.zone === 'left' || (d.zone === 'center' && d.startX < (window.innerWidth || 600) / 2)) {
        const newBrightness = Math.min(150, Math.max(20, Math.round(d.startVal + deltaPercent * 1.2)));
        setBrightness(newBrightness);
        setGestureHUD({ type: 'brightness', value: newBrightness });
      } else if (d.zone === 'right' || (d.zone === 'center' && d.startX >= (window.innerWidth || 600) / 2)) {
        const newVolPercent = Math.min(100, Math.max(0, Math.round(d.startVal + deltaPercent * 1.2)));
        const newVol = newVolPercent / 100;
        setVolume(newVol);
        if (videoRef.current) {
          videoRef.current.volume = newVol;
          videoRef.current.muted = newVol === 0;
          setIsMuted(newVol === 0);
        }
        setGestureHUD({ type: 'volume', value: newVolPercent });
      }
    }
  };

  const handlePointerEnd = (zone, isTouch = false) => {
    const d = dragRef.current;
    if (!d.zone) return;

    if (!isTouch && Date.now() - lastTouchTimeRef.current < 500) {
      dragRef.current = { startX: 0, startY: 0, startVal: 0, startSeekTime: 0, zone: null, direction: null, isMoved: false };
      return;
    }

    if (d.isMoved) {
      hudTimeoutRef.current = setTimeout(() => {
        setGestureHUD(null);
      }, 750);
      // Restart controls timer if controls are visible
      if (showControls) resetControlsTimeout();
    } else {
      // Clean Tap Handling (No Drag Movement)
      if (zone === 'center') {
        // Center Zone Tap toggles Play / Pause and ALWAYS reveals timeline & controls
        togglePlay();
        setShowControls(true);
        resetControlsTimeout();
      } else {
        // Side Touch cleanly toggles control bar & timeline visibility
        triggerHaptic('light');
        setShowControls(prev => {
          const next = !prev;
          if (next) resetControlsTimeout();
          return next;
        });
      }
    }

    dragRef.current = { startX: 0, startY: 0, startVal: 0, startSeekTime: 0, zone: null, direction: null, isMoved: false };
  };

  // 11. Fullscreen & Orientation Lock Toggle
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

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumePercent = isMuted ? 0 : Math.min(100, Math.max(0, volume * 100));

  // Lock body & document scroll when video player is active
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        id="vlc-player-container"
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 h-[100dvh] w-[100dvw] z-50 bg-black flex flex-col items-center justify-between overflow-hidden select-none touch-none"
      >
        {/* Loading Spinner Screen */}
        {loading && !videoError && (
          <div className="absolute inset-0 z-40 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center text-white">
            <Loader2 className="w-10 h-10 animate-spin text-red-600 mb-3" />
            <span className="text-xs font-bold font-mono tracking-wider text-slate-300">
              Connecting to Stream Proxy Node...
            </span>
          </div>
        )}

        {/* MKV / Decode Format Launcher Overlay */}
        {videoError && (
          <div className="absolute inset-0 z-40 bg-zinc-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="w-14 h-14 rounded-full bg-orange-600/20 border border-orange-500/40 flex items-center justify-center text-orange-500 mb-4 animate-pulse">
              <AlertCircle className="w-8 h-8" />
            </div>
            
            <h3 className="text-base font-extrabold font-heading mb-1 text-white">
              HD MKV Video Format Detected
            </h3>
            <p className="text-xs text-zinc-400 max-w-xs mb-6 leading-relaxed font-sans">
              This movie is encoded in 1080p MKV format. Webview browsers require external hardware decoding for MKV files.
            </p>

            <div className="flex flex-col gap-3 w-full max-w-xs">
              {/* VLC Player Launcher */}
              <a
                href={`vlc://${activeVideoUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs tracking-wider flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY IN VLC PLAYER</span>
              </a>

              {/* Direct Download Stream */}
              <button
                onClick={() => {
                  triggerHaptic('heavy');
                  const downloadUrl = `${activeVideoUrl}&download=1`;
                  const link = document.createElement('a');
                  link.href = downloadUrl;
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="w-full py-3 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
              >
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>DIRECT DOWNLOAD MOVIE</span>
              </button>

              {/* Retry Direct Stream */}
              <button
                onClick={() => {
                  setVideoError(false);
                  setLoading(true);
                  if (videoRef.current) {
                    videoRef.current.load();
                    videoRef.current.play().catch(() => {});
                  }
                }}
                className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>RETRY DIRECT STREAMING</span>
              </button>

              {/* Web Preview Alternative */}
              <button
                onClick={() => {
                  setVideoError(false);
                  setActiveVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
                }}
                className="w-full py-2.5 px-4 rounded-2xl bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold text-xs active:scale-95 transition-all"
              >
                PLAY WEB DEMO PREVIEW (MP4)
              </button>
            </div>
          </div>
        )}

        {/* Top Header Control Bar (Clean & Minimalist: Back + Title + Single Settings Icon) */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full z-30 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex items-center justify-between pointer-events-auto"
            >
              {/* Back Button */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white font-extrabold text-xs border border-zinc-700 backdrop-blur-md active:scale-95 shadow-lg"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Close</span>
              </button>

              {/* Title Header */}
              <div className="text-center truncate px-2 max-w-[150px] sm:max-w-md">
                <h2 className="text-xs sm:text-sm font-extrabold text-white font-heading truncate">
                  {movieTitle}
                </h2>
                <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="truncate">Ultra HD 1080p</span>
                </div>
              </div>

              {/* Single Minimalist Master Settings Gear Button */}
              <div className="relative">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowSettingsModal(!showSettingsModal);
                    setSettingsTab('main');
                  }}
                  className="p-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white border border-zinc-700/80 backdrop-blur-md active:scale-95 shadow-lg transition-all"
                  title="Playback Settings"
                >
                  <Settings className="w-4.5 h-4.5" />
                </button>

                {/* Premium Master Settings Modal / Popover Sheet */}
                <AnimatePresence>
                  {showSettingsModal && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      transition={{ duration: 0.18 }}
                      className="absolute right-0 top-12 w-72 rounded-3xl bg-zinc-950/95 border border-zinc-800/90 p-4 z-50 shadow-2xl backdrop-blur-2xl text-white"
                    >
                      {/* Modal Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-2">
                        <div className="flex items-center gap-2">
                          {settingsTab !== 'main' && (
                            <button
                              onClick={() => setSettingsTab('main')}
                              className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
                            >
                              <ArrowLeft className="w-4 h-4" />
                            </button>
                          )}
                          <span className="text-xs font-black tracking-wider uppercase text-zinc-200">
                            {settingsTab === 'main' && 'Playback Settings'}
                            {settingsTab === 'quality' && 'Video Quality'}
                            {settingsTab === 'audio' && 'Audio Language'}
                            {settingsTab === 'subtitles' && 'Subtitles'}
                            {settingsTab === 'speed' && 'Playback Speed'}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Main Settings Menu */}
                      {settingsTab === 'main' && (
                        <div className="flex flex-col gap-1">
                          {/* Quality */}
                          <button
                            onClick={() => setSettingsTab('quality')}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-zinc-900 flex items-center justify-between transition-colors group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-red-600/10 text-red-500 group-hover:bg-red-600 group-hover:text-white transition-colors">
                                <Settings className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-zinc-200">Quality</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-extrabold text-zinc-400">
                              <span>{currentQuality || '1080p'}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            </div>
                          </button>

                          {/* Audio Track */}
                          <button
                            onClick={() => setSettingsTab('audio')}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-zinc-900 flex items-center justify-between transition-colors group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                                <Languages className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-zinc-200">Audio Track</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-extrabold text-zinc-400">
                              <span className="truncate max-w-[90px]">{currentAudio}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            </div>
                          </button>

                          {/* Subtitles */}
                          <button
                            onClick={() => setSettingsTab('subtitles')}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-zinc-900 flex items-center justify-between transition-colors group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                <Captions className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-zinc-200">Subtitles</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-extrabold text-zinc-400">
                              <span>{subtitleTracks.find(s => s.id === currentSubtitle)?.label || 'Off'}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            </div>
                          </button>

                          {/* Speed */}
                          <button
                            onClick={() => setSettingsTab('speed')}
                            className="w-full px-3 py-2.5 rounded-xl hover:bg-zinc-900 flex items-center justify-between transition-colors group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                <Gauge className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-bold text-zinc-200">Speed</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs font-extrabold text-zinc-400">
                              <span>{playbackSpeed}x</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            </div>
                          </button>
                        </div>
                      )}

                      {/* Quality Submenu */}
                      {settingsTab === 'quality' && (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                          {sources.map((s, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                handleQualityChange(s);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all ${
                                currentQuality === s.quality ? 'bg-red-600 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span>{s.quality || '1080p'}</span>
                                {currentQuality === s.quality && <Check className="w-3.5 h-3.5" />}
                              </div>
                              <span className="text-[10px] font-mono text-zinc-400">{s.file_size || 'HD'}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Audio Submenu */}
                      {settingsTab === 'audio' && (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                          {audioTracks.map((lang, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                handleAudioChange(lang);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all ${
                                currentAudio === lang ? 'bg-cyan-600 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                              }`}
                            >
                              <span>{lang}</span>
                              {currentAudio === lang && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Subtitles Submenu */}
                      {settingsTab === 'subtitles' && (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                          {subtitleTracks.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => {
                                handleSubtitleChange(sub);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all ${
                                currentSubtitle === sub.id ? 'bg-emerald-600 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                              }`}
                            >
                              <span>{sub.label}</span>
                              {currentSubtitle === sub.id && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Speed Submenu */}
                      {settingsTab === 'speed' && (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                          {speeds.map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                handleSpeedChange(s);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all ${
                                playbackSpeed === s ? 'bg-amber-500 text-white' : 'text-zinc-300 hover:bg-zinc-900'
                              }`}
                            >
                              <span>{s}x</span>
                              {playbackSpeed === s && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Video Canvas Container & Zero-Flash 3-Zone Gesture Overlay */}
        <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
          
          {/* Zero-Flash 3-Zone Screen Split Touch Container */}
          <div className="absolute inset-0 z-20 grid grid-cols-10 pointer-events-auto bg-transparent">
            {/* Left Zone (~30%): Brightness Drag / Side Tap */}
            <div 
              onTouchStart={(e) => handlePointerStart(e.touches[0].clientX, e.touches[0].clientY, 'left', true)}
              onTouchMove={(e) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={() => handlePointerEnd('left', true)}
              onMouseDown={(e) => handlePointerStart(e.clientX, e.clientY, 'left', false)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={() => handlePointerEnd('left', false)}
              className="col-span-3 h-full w-full bg-transparent cursor-ns-resize"
            />

            {/* Center Zone (~40%): Center Tap (Play/Pause Only) */}
            <div 
              onTouchStart={(e) => handlePointerStart(e.touches[0].clientX, e.touches[0].clientY, 'center', true)}
              onTouchMove={(e) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={() => handlePointerEnd('center', true)}
              onMouseDown={(e) => handlePointerStart(e.clientX, e.clientY, 'center', false)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={() => handlePointerEnd('center', false)}
              className="col-span-4 h-full w-full bg-transparent cursor-pointer"
            />

            {/* Right Zone (~30%): Volume Drag / Side Tap */}
            <div 
              onTouchStart={(e) => handlePointerStart(e.touches[0].clientX, e.touches[0].clientY, 'right', true)}
              onTouchMove={(e) => handlePointerMove(e.touches[0].clientX, e.touches[0].clientY)}
              onTouchEnd={() => handlePointerEnd('right', true)}
              onMouseDown={(e) => handlePointerStart(e.clientX, e.clientY, 'right', false)}
              onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
              onMouseUp={() => handlePointerEnd('right', false)}
              className="col-span-3 h-full w-full bg-transparent cursor-ns-resize"
            />
          </div>

          {/* Minimalist Frosted-Glass VLC Gesture HUD Overlay */}
          <AnimatePresence>
            {gestureHUD && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.12 }}
                className="absolute z-40 inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-3xl bg-black/75 text-white border border-zinc-800 shadow-2xl backdrop-blur-xl min-w-[170px]">
                  {gestureHUD.type === 'brightness' ? (
                    <Sun className="w-10 h-10 text-amber-400 animate-pulse" />
                  ) : gestureHUD.type === 'volume' ? (
                    gestureHUD.value === 0 ? (
                      <VolumeX className="w-10 h-10 text-red-500" />
                    ) : (
                      <Volume2 className="w-10 h-10 text-red-500 animate-pulse" />
                    )
                  ) : (
                    <Clock className="w-10 h-10 text-red-500 animate-pulse" />
                  )}
                  
                  <div className="flex flex-col items-center gap-1.5 w-full text-center">
                    <span className="text-[11px] font-mono font-extrabold uppercase tracking-widest text-zinc-400">
                      {gestureHUD.type === 'brightness' ? 'Brightness' : gestureHUD.type === 'volume' ? 'Volume' : 'Seek'}
                    </span>
                    
                    {gestureHUD.type === 'seek' ? (
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-black text-white font-mono">
                          {gestureHUD.value}
                        </span>
                        <span className="text-xs font-mono font-bold text-red-400 mt-0.5">
                          {gestureHUD.timeFormatted}
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-2xl font-black text-white font-mono">
                          {gestureHUD.value}%
                        </span>
                        
                        {/* HUD Progress Bar */}
                        <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800 mt-1">
                          <div
                            className={`h-full rounded-full transition-all duration-75 ${
                              gestureHUD.type === 'brightness' ? 'bg-amber-400' : 'bg-red-600'
                            }`}
                            style={{
                              width: `${gestureHUD.type === 'brightness' ? Math.min(100, Math.max(0, ((gestureHUD.value - 20) / 130) * 100)) : Math.min(100, Math.max(0, gestureHUD.value))}%`
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Action Touch Feedback Pill */}
          {touchFeedback && !gestureHUD && (
            <div className="absolute z-30 px-4 py-2 rounded-2xl bg-zinc-900/90 text-white font-extrabold text-sm border border-zinc-700 shadow-2xl backdrop-blur-md animate-bounce pointer-events-none">
              {touchFeedback}
            </div>
          )}

          {/* Main Video Element with Subtitle Tracks */}
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
              if (videoRef.current && videoRef.current.duration) {
                setDuration(videoRef.current.duration);
                videoRef.current.playbackRate = playbackSpeed;
              }
              setLoading(false);
            }}
            onCanPlay={() => {
              setLoading(false);
              setVideoError(false);
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={(e) => {
              console.warn('Native browser HTML5 player cannot decode container directly:', e);
              setLoading(false);
              setVideoError(true);
            }}
            onEnded={() => setIsPlaying(false)}
          >
            {subtitleTracks.filter(s => s.id !== 'off').map((sub) => (
              <track
                key={sub.id}
                kind="subtitles"
                src={sub.src}
                srcLang={sub.srclang}
                label={sub.label}
                default={currentSubtitle === sub.id}
              />
            ))}
          </video>
        </div>

        {/* Bottom Control Bar (Auto-Fades) */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full z-30 p-3 sm:p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex flex-col gap-2 pointer-events-auto"
            >
              {/* Scrubbing Timeline Bar */}
              <div className="flex items-center gap-3 w-full">
                <span className="text-[11px] font-mono font-bold text-zinc-300 min-w-[50px]">
                  {formatTime(currentTime)}
                </span>

                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeekChange}
                  className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-red-600 hover:accent-red-500 transition-all"
                  style={{
                    background: `linear-gradient(to right, #dc2626 ${progressPercent}%, #334155 ${progressPercent}%)`
                  }}
                />

                <span className="text-[11px] font-mono font-bold text-zinc-400 min-w-[50px] text-right">
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
                    className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 active:scale-95"
                    title="Rewind 10s"
                  >
                    <Rewind className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => skipTime(10)}
                    className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 active:scale-95"
                    title="Forward 10s"
                  >
                    <FastForward className="w-4 h-4" />
                  </button>

                  {/* Volume Slider & Mute Toggle */}
                  <div className="flex items-center gap-2 hidden sm:flex">
                    <button onClick={toggleMute} className="text-zinc-400 hover:text-white">
                      {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-20 h-1 rounded-lg appearance-none cursor-pointer accent-red-600 transition-all"
                      style={{
                        background: `linear-gradient(to right, #dc2626 ${volumePercent}%, #334155 ${volumePercent}%)`
                      }}
                    />
                  </div>
                </div>

                {/* Right Controls Group (Fullscreen) */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 active:scale-95"
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </AnimatePresence>
  );
}
