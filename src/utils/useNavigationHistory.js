import { useEffect, useRef, useCallback } from 'react';
import WebApp from '@twa-dev/sdk';

/**
 * Custom hook to synchronize React view state with Browser History and Telegram WebApp BackButton.
 * Resolves mobile hardware back button and swipe-back gesture navigation issues.
 */
export function useNavigationHistory({
  selectedMovie,
  setSelectedMovie,
  activePlayingMovie,
  setActivePlayingMovie,
  isSearchOpen,
  setIsSearchOpen,
  isAdminOpen,
  setIsAdminOpen,
  refreshContinueWatching
}) {
  const isInternalBackRef = useRef(false);

  // Close the highest priority active view state
  const handleBackNavigation = useCallback(() => {
    isInternalBackRef.current = true;

    if (activePlayingMovie) {
      setActivePlayingMovie(null);
      if (typeof refreshContinueWatching === 'function') {
        refreshContinueWatching();
      }
      return true;
    }

    if (selectedMovie) {
      setSelectedMovie(null);
      return true;
    }

    if (isSearchOpen) {
      setIsSearchOpen(false);
      return true;
    }

    if (isAdminOpen) {
      setIsAdminOpen(false);
      return true;
    }

    return false;
  }, [
    activePlayingMovie,
    selectedMovie,
    isSearchOpen,
    isAdminOpen,
    setActivePlayingMovie,
    setSelectedMovie,
    setIsSearchOpen,
    setIsAdminOpen,
    refreshContinueWatching
  ]);

  // Synchronize history state and Telegram WebApp BackButton on view changes
  useEffect(() => {
    const hasActiveView = Boolean(activePlayingMovie || selectedMovie || isSearchOpen || isAdminOpen);

    // 1. Telegram WebApp Native BackButton Integration
    try {
      if (typeof window !== 'undefined' && (window.Telegram?.WebApp?.BackButton || WebApp?.BackButton)) {
        const tgBackButton = window.Telegram?.WebApp?.BackButton || WebApp.BackButton;

        if (hasActiveView) {
          tgBackButton.show();
          tgBackButton.onClick(handleBackNavigation);
        } else {
          tgBackButton.hide();
          tgBackButton.offClick(handleBackNavigation);
        }
      }
    } catch (e) {
      console.warn('Telegram BackButton sync note:', e);
    }

    // 2. Browser History PushState Management
    if (hasActiveView && !isInternalBackRef.current) {
      let viewName = 'modal';
      if (activePlayingMovie) viewName = 'player';
      else if (selectedMovie) viewName = 'details';
      else if (isSearchOpen) viewName = 'search';
      else if (isAdminOpen) viewName = 'admin';

      const currentHash = `#${viewName}`;
      if (window.location.hash !== currentHash) {
        window.history.pushState({ view: viewName, timestamp: Date.now() }, '', currentHash);
      }
    }

    isInternalBackRef.current = false;
  }, [
    activePlayingMovie,
    selectedMovie,
    isSearchOpen,
    isAdminOpen,
    handleBackNavigation
  ]);

  // Global browser popstate (hardware back button & swipe back gesture) listener
  useEffect(() => {
    const onPopState = (event) => {
      const handled = handleBackNavigation();
      if (!handled && window.location.hash) {
        // Clear hash if returning to root catalog
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch (e) {}
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [handleBackNavigation]);

  // Explicit UI close handlers (triggers browser history back to keep stack in sync)
  const closeMovieDetail = useCallback(() => {
    if (selectedMovie) {
      setSelectedMovie(null);
      if (window.location.hash) {
        window.history.back();
      }
    }
  }, [selectedMovie, setSelectedMovie]);

  const closePlayer = useCallback(() => {
    if (activePlayingMovie) {
      setActivePlayingMovie(null);
      if (typeof refreshContinueWatching === 'function') {
        refreshContinueWatching();
      }
      if (window.location.hash) {
        window.history.back();
      }
    }
  }, [activePlayingMovie, setActivePlayingMovie, refreshContinueWatching]);

  const closeSearch = useCallback(() => {
    if (isSearchOpen) {
      setIsSearchOpen(false);
      if (window.location.hash) {
        window.history.back();
      }
    }
  }, [isSearchOpen, setIsSearchOpen]);

  const closeAdmin = useCallback(() => {
    if (isAdminOpen) {
      setIsAdminOpen(false);
      if (window.location.hash) {
        window.history.back();
      }
    }
  }, [isAdminOpen, setIsAdminOpen]);

  return {
    closeMovieDetail,
    closePlayer,
    closeSearch,
    closeAdmin,
    handleBackNavigation
  };
}
