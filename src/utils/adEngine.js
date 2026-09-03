/**
 * SMD PRIME — Dynamic Intentional Ad Engine (Adsterra High-ROI Popunder Controller)
 * Triggers popunder ads ONLY when a Normal user explicitly clicks 'Play Now' or 'Download Now'.
 * Search, Category Browsing, and Modal Info clicks remain 100% Ad-Free.
 */

const ADSTERRA_SCRIPT_ID = 'smd-adsterra-popunder';
const ADSTERRA_SCRIPT_SRC = 'https://pl31093200.profitableratecpmnetwork.com/8a/14/f9/8a14f9b0a67fa09950d757c351475ad8.js';
const AD_DEBOUNCE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes session cooldown

/**
 * Clean up all Adsterra script elements and popunder DOM artifacts
 */
export function clearAdEngine() {
  try {
    const existingScript = document.getElementById(ADSTERRA_SCRIPT_ID);
    if (existingScript) existingScript.remove();

    const scripts = Array.from(document.querySelectorAll('script'));
    scripts.forEach(s => {
      if (s.src && (s.src.includes('profitableratecpmnetwork') || s.src.includes('realizationnewestfangs'))) {
        s.remove();
      }
    });

    if (typeof window !== 'undefined') {
      try {
        delete window.adsterra;
        delete window._pop;
        delete window.popunder;
      } catch (e) {}
    }
  } catch (err) {
    console.warn('[AdEngine] Cleanup note:', err);
  }
}

/**
 * Synchronize AdEngine state (Ensures page loads do NOT inject global click scripts automatically)
 */
export function syncAdEngine(enableAds = false) {
  // Always clean up page-load script nodes so browsing stays 100% ad-free
  clearAdEngine();
}

/**
 * Trigger Intentional Ad on Explicit User Action ('play' or 'download')
 * @param {Object} params
 * @param {string} params.userRole - User role ('normal', 'premium', 'admin')
 * @param {boolean} params.enableAds - Policy Matrix enable_ads status for user role
 * @param {string} params.actionType - Action name ('play' | 'download')
 * @returns {boolean} Whether ad trigger was initiated
 */
export function triggerIntentionalAd({ userRole = 'normal', enableAds = true, actionType = 'play' } = {}) {
  try {
    const role = (userRole || 'normal').toLowerCase();

    // 1. ABSOLUTE HARD GUARD: Admin & Premium / VIP Roles NEVER get ads!
    const isElevatedRole = role === 'admin' || role === 'premium' || role === 'diamond' || role === 'gold';
    if (isElevatedRole || enableAds === false) {
      console.log(`🛡️ [AdEngine] Ad Trigger Guard: Blocked for role=${role}, enableAds=${enableAds}`);
      clearAdEngine();
      return false;
    }

    // 2. SESSION DEBOUNCER: Check if ad was triggered within last 5 minutes
    const now = Date.now();
    try {
      const lastTriggeredStr = sessionStorage.getItem('smd_ad_last_triggered');
      if (lastTriggeredStr) {
        const lastTriggered = Number(lastTriggeredStr);
        if (!isNaN(lastTriggered) && (now - lastTriggered) < AD_DEBOUNCE_COOLDOWN_MS) {
          const remainingSec = Math.round((AD_DEBOUNCE_COOLDOWN_MS - (now - lastTriggered)) / 1000);
          console.log(`⏱️ [AdEngine] Debounce Guard Active: Skipping ad for ${actionType} (${remainingSec}s cooldown remaining)`);
          return false;
        }
      }
    } catch (sessionErr) {}

    // 3. EXECUTE INTENTIONAL ADSTERRA TRIGGER
    console.log(`📢 [AdEngine] Executing Intentional Popunder Ad for High-Intent action="${actionType}"...`);
    
    // Save last trigger timestamp to sessionStorage
    try {
      sessionStorage.setItem('smd_ad_last_triggered', String(now));
    } catch (e) {}

    // Clean up any old script tags first
    clearAdEngine();

    // Inject Adsterra script attached to active click event
    const script = document.createElement('script');
    script.id = ADSTERRA_SCRIPT_ID;
    script.src = ADSTERRA_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    // 4. AUTOMATIC DOM CLEANUP AFTER 1500ms
    setTimeout(() => {
      clearAdEngine();
    }, 1500);

    return true;

  } catch (err) {
    console.warn('[AdEngine] Fail-safe Exception (Playback/Download proceeding smoothly):', err);
    return false;
  }
}
