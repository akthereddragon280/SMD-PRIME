import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, Settings, Play, Pause, RotateCcw, RotateCw, 
  Volume2, VolumeX, Maximize, Minimize, Gauge, Sun, 
  Check, AlertCircle, FastForward, Rewind, Clock,
  Languages, Captions, ChevronRight, X, Download,
  ExternalLink, Tv
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  supabase, 
  upsertMovieDuration, 
  saveWatchProgress, 
  logStreamAnalytics, 
  formatDurationString 
} from '../supabaseClient';
import { getProxyStreamUrl, downloadMovieStream, rotateStreamUrlNode } from '../utils/proxy';
import { getOptimalWorkerUrl } from '../utils/loadBalancer';
import { triggerHaptic, useTelegramBackButton, getTelegramUserInfo } from '../utils/telegram';
import ExternalPlayerMenu from './ExternalPlayerMenu';

export default function VideoPlayer({ movie, movieUid: propMovieUid, onClose }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const playStartTimeRef = useRef(null);

  const movieUid = propMovieUid || movie?.uid || movie?.id || 'master_2021';
  const movieTitle = movie?.title || 'Movie Stream';

  // Video State Management
  const [sources, setSources] = useState(movie?.sources || []);
  const [currentQuality, setCurrentQuality] = useState('');
  const [activeVideoUrl, setActiveVideoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Playback Control States
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  /**
   * Ultra-Accurate & Bulletproof Loading Validation Engine:
   * 1. If video is PAUSED, loading spinner MUST NEVER SHOW if metadata/frame is ready.
   * 2. If video is PLAYING, loading spinner is dismissed if readyState >= 3 OR buffered time covers currentTime + 0.5s.
   * 3. Loading spinner shows ONLY during initial load, active buffer stall during playback, or node failover.
   */
  const checkAndDismissLoading = (vEl) => {
    if (!vEl) return;
    
    // If video error is active, stop loading overlay
    if (videoError) {
      setLoading(false);
      return;
    }

    const dur = vEl.duration;
    const curTime = vEl.currentTime;
    const readyState = vEl.readyState; // 0: HAVE_NOTHING, 1: HAVE_METADATA, 2: HAVE_CURRENT_DATA, 3: HAVE_FUTURE_DATA, 4: HAVE_ENOUGH_DATA

    const isDurationFetched = Boolean(dur && isFinite(dur) && dur > 0);

    // Check if current time + 0.5s is already buffered in memory
    let isBufferedAhead = false;
    if (vEl.buffered && vEl.buffered.length > 0) {
      const targetCheck = curTime + 0.5;
      for (let i = 0; i < vEl.buffered.length; i++) {
        if (vEl.buffered.start(i) <= curTime && vEl.buffered.end(i) >= targetCheck) {
          isBufferedAhead = true;
          break;
        }
      }
    }

    // Rule A: If video is PAUSED manually by user
    if (vEl.paused) {
      // If we have at least metadata/current frame (readyState >= 1 or isDurationFetched or curTime > 0), DO NOT show spinner!
      if (readyState >= 1 || isDurationFetched || curTime > 0) {
        setLoading(false);
      }
      return;
    }

    // Rule B: If video is PLAYING
    // Dismiss loading if readyState >= 3 (HAVE_FUTURE_DATA/HAVE_ENOUGH_DATA) OR isBufferedAhead OR curTime > 0.5
    if ((readyState >= 3 || isBufferedAhead || curTime >= 0.5) && isDurationFetched) {
      setLoading(false);
    } else if (readyState <= 1 && curTime === 0) {
      // Still initializing initial stream
      setLoading(true);
    }
  };
  
  // Brightness Control State
  const [brightness, setBrightness] = useState(100);

  // Graceful Handoff External Playing State
  const [isExternalPlaying, setIsExternalPlaying] = useState(false);

  const handleExternalPlayTriggered = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch (e) {}
    }
    setIsPlaying(false);
    setIsExternalPlaying(true);
    setShowExternalMenu(false);
    setShowSettingsModal(false);
  };

  const handleResumeInApp = () => {
    setIsExternalPlaying(false);
    if (videoRef.current) {
      try {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } catch (e) {}
    }
  };

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
    { id: 'en', label: 'English ESub', srclang: 'en', src: movie?.subtitles_en || `${getOptimalWorkerUrl().replace(/\/+$/, '')}/subtitles/en.vtt` },
    { id: 'ta', label: 'Tamil Subs', srclang: 'ta', src: movie?.subtitles_ta || `${getOptimalWorkerUrl().replace(/\/+$/, '')}/subtitles/ta.vtt` }
  ]);
  const [currentSubtitle, setCurrentSubtitle] = useState('off');

  // Layout, Controls Auto-Fade & Gesture Overlay
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFakeFullscreen, setIsFakeFullscreen] = useState(false);
  const [showExternalMenu, setShowExternalMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [touchFeedback, setTouchFeedback] = useState(null);
  const [gestureHUD, setGestureHUD] = useState(null); // { type: 'brightness'|'volume'|'seek', value: string|number, timeFormatted?: string }

  // Gesture Engine & Auto-Hide Refs
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
  const externalMenuTimerRef = useRef(null);

  const speeds = [0.5, 1.0, 1.25, 1.5, 2.0];

  // Bind Telegram native BackButton
  useTelegramBackButton(onClose);

  // 5-Second Auto-Hide Engine for External Player Popup
  const handleOpenExternalClick = () => {
    triggerHaptic('light');
    if (showExternalMenu) {
      setShowExternalMenu(false);
      if (externalMenuTimerRef.current) clearTimeout(externalMenuTimerRef.current);
    } else {
      setShowExternalMenu(true);
      if (externalMenuTimerRef.current) clearTimeout(externalMenuTimerRef.current);
      externalMenuTimerRef.current = setTimeout(() => {
        setShowExternalMenu(false);
      }, 5000); // 5 Seconds Auto-Hide
    }
  };

  // Controls Auto-Fade Timer (Hides control bar cleanly after 3.5 seconds of inactivity)
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    // DO NOT auto-hide while Settings Modal or Loading is active
    if (showSettingsModal || loading) return;

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSettingsModal(false);
    }, 3500);
  };

  // Freeze auto-fade timer when Settings Modal or Loading is active so duration line stays visible
  useEffect(() => {
    if (showSettingsModal || loading) {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else {
      resetControlsTimeout();
    }
  }, [showSettingsModal, loading]);

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
          
          // Extract unique audio languages available across sources (Tamil prioritized first)
          const extractedLangs = new Set();
          availableSources.forEach(s => {
            if (s.language) extractedLangs.add(s.language);
            if (Array.isArray(s.audio_languages)) {
              s.audio_languages.forEach(l => extractedLangs.add(l));
            }
          });

          if (extractedLangs.size > 0) {
            const langsList = Array.from(extractedLangs);
            langsList.sort((a, b) => {
              if (a.toLowerCase().includes('tamil')) return -1;
              if (b.toLowerCase().includes('tamil')) return 1;
              return a.localeCompare(b);
            });
            setAudioTracks(langsList);
            setCurrentAudio(langsList[0]);
          }

          const defaultSrc = availableSources.find(s => s.quality === '1080p') || 
                             availableSources.find(s => s.quality === '720p') || 
                             availableSources[0];
          setCurrentQuality(defaultSrc.quality || '1080p');
          setActiveVideoUrl(getProxyStreamUrl(defaultSrc.drive_file_id || movie?.file_id, movieTitle, defaultSrc.quality || '1080p', defaultSrc.clone_file_ids));
        } else {
          const fallbackId = movie?.file_id || '1djKAD3UQmBPgkeBBLCrZjAW-D4Fod_Ng';
          const defaultSources = [
            { quality: '1080p', drive_file_id: fallbackId, file_size: '2.4 GB' },
            { quality: '720p', drive_file_id: fallbackId, file_size: '1.2 GB' },
            { quality: '480p', drive_file_id: fallbackId, file_size: '422 MB' }
          ];
          setSources(defaultSources);
          setCurrentQuality('1080p');
          setActiveVideoUrl(getProxyStreamUrl(fallbackId, movieTitle, '1080p'));
        }
      } catch (err) {
        console.error('Failed to fetch movie sources:', err);
        setLoading(false);
      }
    }

    fetchMovieSources();
  }, [movieUid, movie]);

  // Keep Refs synchronized for unmount flush & 10s watch history debouncer
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Telemetry Engine: Log telemetry row into 'stream_analytics' on active stream trigger & quality switch
  const saCounterRef = useRef(1);
  useEffect(() => {
    if (activeVideoUrl) {
      const tgUser = getTelegramUserInfo();
      const activeSrc = sources.find(s => s.quality === currentQuality) || sources[0];
      const currentSaIndex = (activeSrc?.sa_account_index && activeSrc.sa_account_index > 1) 
        ? activeSrc.sa_account_index 
        : ((saCounterRef.current++) % 20) + 1;
      logStreamAnalytics(movieUid, tgUser?.id, currentQuality || '1080p', currentSaIndex);
    }
  }, [activeVideoUrl, movieUid, currentQuality]);

  // Continue Watching Engine: 10-Second Debounced Watch History Saver & Component Unmount Flush
  useEffect(() => {
    const tgUser = getTelegramUserInfo();

    const interval = setInterval(() => {
      if (currentTimeRef.current > 0) {
        saveWatchProgress(tgUser?.id, movieUid, currentTimeRef.current, durationRef.current);
      }
    }, 10000);

    return () => {
      clearInterval(interval);
      // Flush final playback progress on unmount with ZERO memory leaks
      if (currentTimeRef.current > 0) {
        saveWatchProgress(tgUser?.id, movieUid, currentTimeRef.current, durationRef.current);
      }
    };
  }, [movieUid]);

  // Reset play startTime ref when video url or quality changes
  useEffect(() => {
    playStartTimeRef.current = null;
    setLoading(true);
  }, [activeVideoUrl]);

  // Adaptive Stream Recovery & Instant Multi-Node Failover Engine
  const handleVideoError = (err) => {
    console.warn('[Video Engine Warning] Segment or node error encountered, rotating edge node silently:', err);
    if (retryCount < 6) {
      const nextCount = retryCount + 1;
      setRetryCount(nextCount);
      setLoading(true);
      
      const savedTime = videoRef.current ? videoRef.current.currentTime : currentTimeRef.current;
      const rotatedUrl = rotateStreamUrlNode(activeVideoUrl);
      console.log(`[Node Failover #${nextCount}] Rotating stream host to:`, rotatedUrl);
      
      setActiveVideoUrl(rotatedUrl);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
          if (savedTime > 0) videoRef.current.currentTime = savedTime;
          videoRef.current.play().catch(() => {});
        }
      }, 200);
    } else {
      console.warn('[Video Engine] All node retries exhausted.');
      setLoading(false);
      setVideoError(true);
    }
  };


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
    const newUrl = getProxyStreamUrl(driveId, movieTitle, targetQuality, sourceObj.clone_file_ids);
    setActiveVideoUrl(newUrl);

    // Telemetry log for quality switch
    const tgUser = getTelegramUserInfo();
    logStreamAnalytics(movieUid, tgUser?.id, targetQuality, sourceObj.sa_account_index || 1);

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

  // 5. Seamless Multi-Language Audio Switcher Engine (0ms Timestamp Resume)
  const handleAudioChange = (lang) => {
    triggerHaptic('medium');
    const savedTimestamp = videoRef.current?.currentTime || currentTime;
    setCurrentAudio(lang);

    // 1. Check if there is a specific stream source matching the selected language
    const matchingSource = sources.find(s => 
      s.language === lang || 
      (typeof s.quality === 'string' && s.quality.toLowerCase().includes(lang.toLowerCase())) ||
      (Array.isArray(s.audio_languages) && s.audio_languages.length === 1 && s.audio_languages[0] === lang)
    ) || sources.find(s => Array.isArray(s.audio_languages) && s.audio_languages.includes(lang)) || sources[0];

    if (matchingSource && matchingSource.drive_file_id) {
      const targetQuality = matchingSource.quality || currentQuality || '1080p';
      let newUrl = getProxyStreamUrl(matchingSource.drive_file_id, movieTitle, targetQuality, matchingSource.clone_file_ids);
      if (!newUrl.includes('&audio_lang=')) {
        newUrl += `&audio_lang=${encodeURIComponent(lang)}`;
      }
      
      setActiveVideoUrl(newUrl);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = savedTimestamp;
          videoRef.current.playbackRate = playbackSpeed;
          videoRef.current.play().catch(() => {});
          setIsPlaying(true);
        }
      }, 350);
    } else if (videoRef.current?.audioTracks && videoRef.current.audioTracks.length > 0) {
      // 2. Native HTML5 AudioTrack API fallback
      const tracks = videoRef.current.audioTracks;
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].language === lang || tracks[i].label?.toLowerCase().includes(lang.toLowerCase())) {
          tracks[i].enabled = true;
        } else {
          tracks[i].enabled = false;
        }
      }
    }

    setTouchFeedback(`Audio: ${lang}`);
    setTimeout(() => setTouchFeedback(null), 1200);
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

/**
 * Helper to sort video sources:
 * 1. Group by language: Tamil first priority, followed by Telugu, Hindi, Malayalam, Kannada, English, then others.
 * 2. Within each language group, sort by quality resolution in descending order (4K > 1080p > 720p > 480p).
 * 3. Tie-breaker: File size in descending order.
 */
function getSortedVideoSources(sourcesList = []) {
  if (!Array.isArray(sourcesList) || sourcesList.length === 0) return [];

  const getLanguagePriority = (src) => {
    const text = `${src.language || ''} ${src.audio_language || ''} ${src.quality || ''} ${src.file_name || ''} ${src.title || ''} ${Array.isArray(src.audio_languages) ? src.audio_languages.join(' ') : ''}`.toLowerCase();
    
    if (text.includes('tamil') || text.includes('tam')) return 100;
    if (text.includes('telugu') || text.includes('tel')) return 90;
    if (text.includes('hindi') || text.includes('hin')) return 80;
    if (text.includes('malayalam') || text.includes('mal')) return 70;
    if (text.includes('kannada') || text.includes('kan')) return 60;
    if (text.includes('english') || text.includes('eng')) return 50;
    return 10;
  };

  const getQualityRank = (src) => {
    const text = (src.quality || src.file_name || '').toUpperCase();
    if (text.includes('4K') || text.includes('2160P')) return 4000;
    if (text.includes('1080P')) return 3000;
    if (text.includes('720P')) return 2000;
    if (text.includes('480P')) return 1000;
    if (text.includes('360P')) return 500;
    return 1500;
  };

  const getSizeBytes = (src) => {
    if (typeof src.size_gb === 'number') return src.size_gb * 1024 * 1024 * 1024;
    const str = String(src.file_size || '').toUpperCase().trim();
    if (!str) return 0;
    const val = parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    if (str.includes('GB')) return val * 1024 * 1024 * 1024;
    if (str.includes('MB')) return val * 1024 * 1024;
    return val;
  };

  return [...sourcesList].sort((a, b) => {
    const langPriorityA = getLanguagePriority(a);
    const langPriorityB = getLanguagePriority(b);
    if (langPriorityA !== langPriorityB) {
      return langPriorityB - langPriorityA;
    }

    const qRankA = getQualityRank(a);
    const qRankB = getQualityRank(b);
    if (qRankA !== qRankB) {
      return qRankB - qRankA;
    }

    const sizeA = getSizeBytes(a);
    const sizeB = getSizeBytes(b);
    return sizeB - sizeA;
  });
}

  // 9b. TMA-Guarded Fullscreen & 90-Degree Rotated Landscape Engine
  const toggleFullscreen = async () => {
    triggerHaptic('medium');

    const isInsideTelegram = Boolean(
      (window.Telegram?.WebApp?.initData && window.Telegram.WebApp.initData.length > 0) ||
      window.Telegram?.WebApp?.initDataUnsafe?.user ||
      (window.Telegram?.WebApp && window.Telegram.WebApp.platform !== 'unknown')
    );

    // 1. Exit Fullscreen cleanly if currently active
    if (isFakeFullscreen || isFullscreen || document.fullscreenElement) {
      if (document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (e) {}
      }
      if (window.Telegram?.WebApp?.exitFullscreen) {
        try {
          window.Telegram.WebApp.exitFullscreen();
        } catch (e) {}
      }
      if (window.Telegram?.WebApp?.unlockOrientation) {
        try {
          window.Telegram.WebApp.unlockOrientation();
        } catch (e) {}
      }
      if (window.screen?.orientation?.unlock) {
        try {
          window.screen.orientation.unlock();
        } catch (e) {}
      }
      setIsFakeFullscreen(false);
      setIsFullscreen(false);
      return;
    }

    // 2. TMA-Only Guard: Triggered ONLY inside Telegram Mini App
    if (isInsideTelegram) {
      // Step A: Trigger Native Telegram Fullscreen & Expansion
      if (window.Telegram?.WebApp?.requestFullscreen) {
        try {
          window.Telegram.WebApp.requestFullscreen();
        } catch (e) {}
      }
      if (window.Telegram?.WebApp?.expand) {
        try {
          window.Telegram.WebApp.expand();
        } catch (e) {}
      }
      if (window.Telegram?.WebApp?.lockOrientation) {
        try {
          window.Telegram.WebApp.lockOrientation();
        } catch (e) {}
      }

      // Step B: Force 90-Degree Rotated Landscape View & Transposed Gesture Overlay
      setIsFakeFullscreen(true);
      setIsFullscreen(true);

      if (window.screen?.orientation?.lock) {
        await window.screen.orientation.lock('landscape').catch(() => {});
      }
      return;
    }

    // 3. Standard Browser Fullscreen (Outside Telegram Context)
    try {
      if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else if (videoRef.current?.webkitEnterFullscreen) {
        videoRef.current.webkitEnterFullscreen();
        setIsFullscreen(true);
      } else {
        setIsFakeFullscreen(true);
        setIsFullscreen(true);
      }
      
      if (window.screen?.orientation?.lock) {
        await window.screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (err) {
      setIsFakeFullscreen(true);
      setIsFullscreen(true);
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

  // Helper: Transposes touch coordinates when Fake Fullscreen 90-degree rotation is active
  const getEffectiveCoords = (clientX, clientY) => {
    if (!isFakeFullscreen) {
      return {
        x: clientX,
        y: clientY,
        screenWidth: window.innerWidth || 600,
        screenHeight: window.innerHeight || 400
      };
    }

    // 90-degree rotated Fake Fullscreen coordinate transformation:
    // Physical Top (clientY=0) -> Rotated Left (X=0)
    // Physical Bottom (clientY=h) -> Rotated Right (X=h)
    // Physical Right (clientX=w) -> Rotated Top (Y=0)
    // Physical Left (clientX=0) -> Rotated Bottom (Y=w)
    return {
      x: clientY,
      y: (window.innerWidth || 600) - clientX,
      screenWidth: window.innerHeight || 600,
      screenHeight: window.innerWidth || 400
    };
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

    const coords = getEffectiveCoords(clientX, clientY);

    let startVal = 0;
    if (zone === 'left') startVal = brightness;
    else if (zone === 'right') startVal = isMuted ? 0 : volume * 100;

    dragRef.current = {
      startX: coords.x,
      startY: coords.y,
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

    const coords = getEffectiveCoords(clientX, clientY);
    const deltaX = coords.x - d.startX;
    const deltaY = d.startY - coords.y; // UP is positive, DOWN is negative

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
      const screenWidth = coords.screenWidth;
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
      const screenHeight = coords.screenHeight;
      const deltaPercent = (deltaY / (screenHeight * 0.45)) * 100;

      if (d.zone === 'left' || (d.zone === 'center' && d.startX < coords.screenWidth / 2)) {
        const newBrightness = Math.min(150, Math.max(20, Math.round(d.startVal + deltaPercent * 1.2)));
        setBrightness(newBrightness);
        setGestureHUD({ type: 'brightness', value: newBrightness });
      } else if (d.zone === 'right' || (d.zone === 'center' && d.startX >= coords.screenWidth / 2)) {
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

  // 11. Laptop / Desktop Keyboard Media Controls Engine
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore keypresses if user is typing in an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          setShowControls(true);
          resetControlsTimeout();
          break;
        case 'ArrowLeft':
        case 'KeyJ':
          e.preventDefault();
          skipTime(-10);
          setShowControls(true);
          resetControlsTimeout();
          break;
        case 'ArrowRight':
        case 'KeyL':
          e.preventDefault();
          skipTime(10);
          setShowControls(true);
          resetControlsTimeout();
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.min(1, (videoRef.current.volume || 0) + 0.1);
            videoRef.current.volume = nextVol;
            videoRef.current.muted = false;
            setVolume(nextVol);
            setIsMuted(false);
            setGestureHUD({ type: 'volume', value: Math.round(nextVol * 100) });
            if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
            hudTimeoutRef.current = setTimeout(() => setGestureHUD(null), 800);
          }
          setShowControls(true);
          resetControlsTimeout();
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.max(0, (videoRef.current.volume || 0) - 0.1);
            videoRef.current.volume = nextVol;
            videoRef.current.muted = nextVol === 0;
            setVolume(nextVol);
            setIsMuted(nextVol === 0);
            setGestureHUD({ type: 'volume', value: Math.round(nextVol * 100) });
            if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
            hudTimeoutRef.current = setTimeout(() => setGestureHUD(null), 800);
          }
          setShowControls(true);
          resetControlsTimeout();
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
          if (isFakeFullscreen || isFullscreen) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, skipTime, toggleFullscreen, toggleMute, isFakeFullscreen, isFullscreen]);

  return (
    <AnimatePresence>
      <motion.div
        id="vlc-player-container"
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={
          isFakeFullscreen
            ? "fixed top-0 left-[100%] w-[100vh] h-[100vw] origin-top-left rotate-90 z-[99999] bg-black flex flex-col items-center justify-between overflow-hidden select-none touch-none"
            : "fixed inset-0 h-[100dvh] w-[100dvw] z-50 bg-black flex flex-col items-center justify-between overflow-hidden select-none touch-none"
        }
      >
        {/* 2026 Hyper-Premium SMD Cinematic Loader */}
        <AnimatePresence>
          {loading && !videoError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 z-15 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs transition-all duration-500 pointer-events-none"
            >
              {/* Outer Pulsing Neon Ring */}
              <div className="relative flex items-center justify-center w-24 h-24">
                <div className="absolute inset-0 rounded-full border-2 border-red-500/20 animate-ping"></div>
                <div className="absolute inset-0 rounded-full border-t-2 border-red-500 animate-spin"></div>
                <div className="absolute inset-2 rounded-full border-b-2 border-cyan-400 animate-[spin_2s_linear_infinite_reverse]"></div>
                
                {/* Center Glass Core with SMD Text */}
                <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-950/80 border border-white/10 shadow-[0_0_30px_rgba(239,68,68,0.3)] backdrop-blur-md">
                  <span className="text-lg font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-400 to-white animate-pulse">
                    SMD
                  </span>
                </div>
              </div>

              {/* Subtitle / Status Text */}
              <div className="mt-6 flex flex-col items-center space-y-1">
                <span className="text-xs font-medium tracking-[0.3em] text-zinc-400 uppercase">
                  Buffer Syncing
                </span>
                <div className="flex space-x-1.5 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0s' }}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Adaptive Stream Recovery & Minimal Notification Overlay */}
        {videoError && (
          <div className="absolute top-16 z-40 px-4 py-2.5 rounded-2xl bg-zinc-950/90 text-white border border-amber-500/40 shadow-2xl backdrop-blur-md flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-zinc-200">
              Optimizing inline stream delivery...
            </span>
            <button
              onClick={() => {
                triggerHaptic('medium');
                setVideoError(false);
                setRetryCount(0);
                setLoading(true);
                if (videoRef.current) {
                  videoRef.current.load();
                  videoRef.current.play().catch(() => {});
                }
              }}
              className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white font-extrabold text-[11px] transition active:scale-95 shadow-md"
            >
              Retry Stream
            </button>
          </div>
        )}

        {/* Top Header Control Bar (Clean & Minimalist: Back + Title + Download + Settings) */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="w-full z-40 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex items-center justify-between pointer-events-auto"
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

              {/* Action Buttons Group (Download + Master Settings) */}
              <div className="flex items-center gap-2 relative">
                <button
                  onClick={async () => {
                    triggerHaptic('heavy');
                    setDownloading(true);
                    const driveId = sources.find(s => s.quality === currentQuality)?.drive_file_id || movie?.file_id || movie?.drive_file_id;
                    await downloadMovieStream(driveId, movieTitle, currentQuality || '1080p', (percent, state) => {
                      setDownloadProgress(percent);
                      if (state === 'completed') {
                        setTimeout(() => {
                          setDownloading(false);
                          setDownloadProgress(null);
                        }, 2000);
                      }
                    });
                  }}
                  className="p-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-white border border-zinc-700/80 backdrop-blur-md active:scale-95 shadow-lg transition-all"
                  title="Download Movie Stream"
                >
                  {downloading ? (
                    <span className="text-[10px] font-mono font-bold text-emerald-400 px-1">
                      {downloadProgress !== null ? `${downloadProgress}%` : 'DL...'}
                    </span>
                  ) : (
                    <Download className="w-4.5 h-4.5" />
                  )}
                </button>

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

                {/* Premium Glassmorphism Master Settings Modal / Popover Sheet */}
                <AnimatePresence>
                  {showSettingsModal && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, y: -10 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="absolute right-0 top-12 w-72 sm:w-80 rounded-3xl bg-black/40 border border-white/20 p-3.5 sm:p-4 z-50 shadow-[0_25px_70px_rgba(0,0,0,0.6)] backdrop-blur-2xl text-white backdrop-saturate-200 ring-1 ring-white/10"
                    >
                      {/* Modal Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-2 px-1">
                        <div className="flex items-center gap-2">
                          {settingsTab !== 'main' && (
                            <button
                              onClick={() => setSettingsTab('main')}
                              className="p-1 rounded-lg hover:bg-white/15 text-zinc-300 hover:text-white transition-colors"
                            >
                              <ArrowLeft className="w-4 h-4" />
                            </button>
                          )}
                          <span className="text-xs font-black tracking-wider uppercase text-zinc-100 font-heading">
                            {settingsTab === 'main' && 'Playback Settings'}
                            {settingsTab === 'quality' && 'Video Quality'}
                            {settingsTab === 'audio' && 'Audio Language'}
                            {settingsTab === 'subtitles' && 'Subtitles'}
                            {settingsTab === 'speed' && 'Playback Speed'}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/15 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Main Settings Menu (Single Layer Clean Layout) */}
                      {settingsTab === 'main' && (
                        <div className="divide-y divide-white/[0.08]">
                          {/* Quality */}
                          <button
                            onClick={() => setSettingsTab('quality')}
                            className="w-full px-3 py-3 rounded-xl hover:bg-white/15 flex items-center justify-between transition-all group active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-red-500/20 text-red-400 group-hover:bg-red-600 group-hover:text-white transition-colors shadow-sm">
                                <Settings className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-extrabold text-zinc-100">Quality</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-300">
                              <span className="truncate max-w-[110px] text-[11px] font-mono">{currentQuality || '1080p'}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          </button>

                          {/* Audio Track */}
                          <button
                            onClick={() => setSettingsTab('audio')}
                            className="w-full px-3 py-3 rounded-xl hover:bg-white/15 flex items-center justify-between transition-all group active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 group-hover:bg-cyan-500 group-hover:text-white transition-colors shadow-sm">
                                <Languages className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-extrabold text-zinc-100">Audio Track</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-300">
                              <span className="truncate max-w-[100px] text-[11px] font-mono">{currentAudio}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          </button>

                          {/* Subtitles */}
                          <button
                            onClick={() => setSettingsTab('subtitles')}
                            className="w-full px-3 py-3 rounded-xl hover:bg-white/15 flex items-center justify-between transition-all group active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500 group-hover:text-white transition-colors shadow-sm">
                                <Captions className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-extrabold text-zinc-100">Subtitles</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-300">
                              <span className="text-[11px]">{subtitleTracks.find(s => s.id === currentSubtitle)?.label || 'Off'}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          </button>

                          {/* Speed */}
                          <button
                            onClick={() => setSettingsTab('speed')}
                            className="w-full px-3 py-3 rounded-xl hover:bg-white/15 flex items-center justify-between transition-all group active:scale-[0.99]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 group-hover:bg-amber-500 group-hover:text-white transition-colors shadow-sm">
                                <Gauge className="w-4 h-4" />
                              </div>
                              <span className="text-xs font-extrabold text-zinc-100">Speed</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-extrabold text-zinc-300">
                              <span className="text-[11px] font-mono">{playbackSpeed}x</span>
                              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                          </button>
                        </div>
                      )}

                      {/* Quality Submenu */}
                      {settingsTab === 'quality' && (
                        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                          {getSortedVideoSources(sources).map((s, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                handleQualityChange(s);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all active:scale-[0.98] ${
                                currentQuality === s.quality
                                  ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-600/30'
                                  : 'text-zinc-200 hover:bg-white/15'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span>{s.quality || '1080p'}</span>
                                {currentQuality === s.quality && <Check className="w-3.5 h-3.5" />}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Audio Submenu */}
                      {settingsTab === 'audio' && (
                        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                          {audioTracks.map((lang, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                handleAudioChange(lang);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all active:scale-[0.98] ${
                                currentAudio === lang
                                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                                  : 'text-zinc-200 hover:bg-white/15'
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
                        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                          {subtitleTracks.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => {
                                handleSubtitleChange(sub);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all active:scale-[0.98] ${
                                currentSubtitle === sub.id
                                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                                  : 'text-zinc-200 hover:bg-white/15'
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
                        <div className="flex flex-col gap-1 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                          {speeds.map((s) => (
                            <button
                              key={s}
                              onClick={() => {
                                handleSpeedChange(s);
                                setShowSettingsModal(false);
                              }}
                              className={`w-full px-3 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all active:scale-[0.98] ${
                                playbackSpeed === s
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/30'
                                  : 'text-zinc-200 hover:bg-white/15'
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
          {/* Minimalist Background-Less 2026 Gesture HUD Overlay (NO BLACK SQUARE BOX) */}
          <AnimatePresence>
            {gestureHUD && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.12 }}
                className="absolute z-40 inset-0 flex items-center justify-center pointer-events-none select-none"
              >
                <div className="flex flex-col items-center gap-1.5 drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]">
                  {gestureHUD.type === 'brightness' ? (
                    <Sun className="w-8 h-8 text-amber-400 animate-pulse drop-shadow-md" />
                  ) : gestureHUD.type === 'volume' ? (
                    gestureHUD.value === 0 ? (
                      <VolumeX className="w-8 h-8 text-red-500 drop-shadow-md" />
                    ) : (
                      <Volume2 className="w-8 h-8 text-rose-500 animate-pulse drop-shadow-md" />
                    )
                  ) : (
                    <Clock className="w-8 h-8 text-red-500 animate-pulse drop-shadow-md" />
                  )}
                  
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-[9px] font-mono font-black uppercase tracking-widest text-zinc-300 drop-shadow">
                      {gestureHUD.type === 'brightness' ? 'Brightness' : gestureHUD.type === 'volume' ? 'Volume' : 'Seek'}
                    </span>
                    
                    {gestureHUD.type === 'seek' ? (
                      <div className="flex flex-col items-center">
                        <span className="text-xl font-black text-white font-mono drop-shadow">
                          {gestureHUD.value}
                        </span>
                        <span className="text-xs font-mono font-bold text-red-400 mt-0.5 drop-shadow">
                          {gestureHUD.timeFormatted}
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-xl font-black text-white font-mono drop-shadow">
                          {gestureHUD.value}%
                        </span>
                        
                        {/* HUD Progress Bar (Clean Floating Bar) */}
                        <div className="w-28 h-1.5 bg-white/20 rounded-full overflow-hidden shadow-inner mt-0.5">
                          <div
                            className={`h-full rounded-full transition-all duration-75 ${
                              gestureHUD.type === 'brightness' ? 'bg-gradient-to-r from-amber-500 to-yellow-300' : 'bg-gradient-to-r from-red-600 to-rose-500'
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
            <div className="absolute z-30 px-5 py-2.5 rounded-full bg-[#07090e]/90 text-white font-extrabold text-xs border border-white/15 shadow-2xl backdrop-blur-md animate-bounce pointer-events-none">
              {touchFeedback}
            </div>
          )}

          {/* Main Video Element with Subtitle Tracks */}
          <video
            ref={videoRef}
            src={activeVideoUrl}
            autoPlay
            playsInline
            webkit-playsinline="true"
            preload="auto"
            crossOrigin="anonymous"
            muted={isMuted}
            style={{ filter: `brightness(${brightness}%)` }}
            className="w-full h-full object-contain z-0"
            onTimeUpdate={() => {
              if (videoRef.current) {
                setCurrentTime(videoRef.current.currentTime);
                checkAndDismissLoading(videoRef.current);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current && videoRef.current.duration) {
                const durSec = videoRef.current.duration;
                setDuration(durSec);
                durationRef.current = durSec;
                videoRef.current.playbackRate = playbackSpeed;

                // Dynamically store duration_seconds & formatted_duration in Supabase 'movie_metadata' table
                if (movieUid && durSec > 0 && isFinite(durSec)) {
                  const formatted = formatDurationString(durSec);
                  upsertMovieDuration(movieUid, durSec, formatted);
                }

                // Resume saved progress position if user was previously watching
                const savedProgress = Number(movie?.progress_seconds || 0);
                if (savedProgress > 5 && savedProgress < (durSec - 10)) {
                  videoRef.current.currentTime = savedProgress;
                  setCurrentTime(savedProgress);
                  currentTimeRef.current = savedProgress;
                }

                checkAndDismissLoading(videoRef.current);
              }
            }}
            onCanPlay={() => {
              setVideoError(false);
              if (videoRef.current) {
                checkAndDismissLoading(videoRef.current);
              }
            }}
            onPlaying={() => {
              setIsPlaying(true);
              if (!playStartTimeRef.current) {
                playStartTimeRef.current = Date.now();
              }
              // Validate after 0.5s delay to ensure smooth playback transition
              setTimeout(() => {
                if (videoRef.current) {
                  checkAndDismissLoading(videoRef.current);
                }
              }, 500);
            }}
            onWaiting={() => {
              if (videoRef.current && !videoRef.current.paused) {
                playStartTimeRef.current = null;
                setLoading(true);
              }
            }}
            onStalled={() => {
              if (videoRef.current && !videoRef.current.paused) {
                playStartTimeRef.current = null;
                setLoading(true);
              }
            }}
            onSeeking={() => {
              playStartTimeRef.current = null;
              setLoading(true);
            }}
            onSeeked={() => {
              if (videoRef.current) {
                checkAndDismissLoading(videoRef.current);
              }
            }}
            onPlay={() => {
              setIsPlaying(true);
              if (videoRef.current) {
                checkAndDismissLoading(videoRef.current);
              }
            }}
            onPause={() => {
              setIsPlaying(false);
              if (videoRef.current) {
                checkAndDismissLoading(videoRef.current);
              }
            }}
            onError={handleVideoError}
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
              className="w-full z-40 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent flex flex-col gap-2.5 pointer-events-auto select-none"
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

              {/* Player Bottom Row: Unified 1-Line Controls Toolbar (Mathematically Centered Pod & Equalized Height Buttons) */}
              <div className="relative flex items-center justify-between w-full h-9 mt-0.5">
                
                {/* Left Controls Group (Volume Slider & Mute Toggle) */}
                <div className="flex items-center gap-2 z-10">
                  <button
                    onClick={toggleMute}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    title={isMuted ? "Unmute Stream" : "Mute Stream"}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-zinc-300" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 sm:w-20 h-1 rounded-lg appearance-none cursor-pointer accent-red-600 transition-all hidden sm:block"
                    style={{
                      background: `linear-gradient(to right, #dc2626 ${volumePercent}%, #334155 ${volumePercent}%)`
                    }}
                  />
                </div>

                {/* Mathematically Centered Playback Micro Pod */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto">
                  <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#07090e]/90 backdrop-blur-2xl border border-white/15 shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
                    {/* Rewind 10s */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipTime(-10);
                      }}
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                      title="Rewind 10 Seconds"
                    >
                      <Rewind className="w-3.5 h-3.5 fill-current" />
                    </button>

                    {/* Play / Pause Micro Hero Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlay();
                      }}
                      className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white shadow-[0_0_15px_rgba(225,29,72,0.6)] flex items-center justify-center active:scale-95 transition-all relative group cursor-pointer"
                      title={isPlaying ? 'Pause Stream' : 'Play Stream'}
                    >
                      <div className="absolute -inset-0.5 rounded-full bg-red-500/30 animate-ping pointer-events-none opacity-40" />
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current relative z-10" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5 relative z-10" />
                      )}
                    </button>

                    {/* Fast Forward 10s */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        skipTime(10);
                      }}
                      className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                      title="Forward 10 Seconds"
                    >
                      <FastForward className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                </div>

                {/* Right Controls Group (Equalized Height OPEN Badge & Fullscreen) */}
                <div className="flex items-center gap-2 relative z-10">
                  {/* OPEN Launcher Button (Equalized Height h-8) */}
                  <button
                    onClick={handleOpenExternalClick}
                    className="h-8 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 active:scale-95 transition-all shadow-md backdrop-blur-md cursor-pointer flex items-center justify-center"
                    title="Open in External Player"
                  >
                    <span className="text-[11px] font-mono font-black uppercase tracking-wider text-amber-300">OPEN</span>
                  </button>

                  {/* Floating Micro External Player Menu */}
                  <AnimatePresence>
                    {showExternalMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute bottom-11 right-0 min-w-[200px] z-50 pointer-events-auto"
                      >
                        <ExternalPlayerMenu streamUrl={activeVideoUrl} movieTitle={movieTitle} variant="compact" onExternalPlayTriggered={handleExternalPlayTriggered} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Fullscreen Button (Equalized Height h-8) */}
                  <button
                    onClick={toggleFullscreen}
                    className="w-8 h-8 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 flex items-center justify-center active:scale-95 cursor-pointer"
                    title="Toggle Fullscreen"
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                  </button>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Graceful Handoff External Playing Overlay */}
        {isExternalPlaying && (
          <div className="absolute inset-0 z-45 bg-zinc-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center space-y-5 animate-fadeIn select-none">
            <div className="w-20 h-20 rounded-3xl bg-red-600/10 border border-red-500/30 flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.25)]">
              <Tv className="w-10 h-10 text-red-500 animate-pulse" />
            </div>

            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-lg font-black text-white tracking-tight font-heading">
                Playing in External Player
              </h3>
              <p className="text-xs font-mono text-zinc-400 leading-relaxed">
                Stream handed off to native app (VLC / MX Player). Hardware decoder paused in app.
              </p>
            </div>

            <button
              onClick={handleResumeInApp}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-extrabold text-xs tracking-wider uppercase shadow-xl shadow-red-600/35 active:scale-95 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Resume Playback in App</span>
            </button>
          </div>
        )}

      </motion.div>
    </AnimatePresence>
  );
}
