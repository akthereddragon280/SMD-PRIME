import WebApp from '@twa-dev/sdk';

/**
 * Initialize Telegram WebApp SDK
 * Expands viewport and informs Telegram client that TMA is ready.
 */
export function initTelegramApp() {
  try {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      WebApp.ready();
      WebApp.expand();
      
      // Enable background color matching
      if (WebApp.setHeaderColor) {
        WebApp.setHeaderColor('#ffffff');
      }
      if (WebApp.setBackgroundColor) {
        WebApp.setBackgroundColor('#f8fafc');
      }
    }
  } catch (e) {
    console.warn('Telegram SDK initialization note:', e);
  }
}

/**
 * Trigger subtle haptic feedback for mobile interactions
 */
export function triggerHaptic(style = 'light') {
  try {
    if (WebApp?.HapticFeedback) {
      WebApp.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {
    // Ignore in non-telegram context
  }
}

/**
 * Setup Native Telegram Back Button listener
 * @param {Function} onClickHandler - Callback function when user taps native Telegram back button
 * @returns {Function} Cleanup function to remove listener
 */
export function useTelegramBackButton(onClickHandler) {
  try {
    if (typeof window !== 'undefined' && WebApp?.BackButton) {
      if (onClickHandler) {
        WebApp.BackButton.show();
        WebApp.BackButton.onClick(onClickHandler);

        return () => {
          WebApp.BackButton.offClick(onClickHandler);
          WebApp.BackButton.hide();
        };
      } else {
        WebApp.BackButton.hide();
      }
    }
  } catch (e) {
    console.warn('Telegram BackButton error:', e);
  }
  return () => {};
}

/**
 * Get current Telegram User Profile info if available
 */
export function getTelegramUserInfo() {
  try {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user) {
      return window.Telegram.WebApp.initDataUnsafe.user;
    }
    return WebApp?.initDataUnsafe?.user || null;
  } catch (e) {
    return null;
  }
}

/**
 * Safely open external link outside Telegram In-App Browser in default OS browser (Chrome/Safari)
 * without crashing or breaking TMA session stability.
 */
export function openExternalLink(url) {
  if (!url) return;
  try {
    if (typeof window !== 'undefined' && window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(url, { try_instant_view: false });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (e) {
    console.warn('openExternalLink note:', e);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default WebApp;
