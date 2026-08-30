/**
 * SMD PRIME — Dynamic Ad Engine (Adsterra Popunder Controller)
 * Dynamically injects or cleans up ad scripts based on Admin Policy Matrix settings.
 */

const ADSTERRA_SCRIPT_ID = 'smd-adsterra-popunder';
const ADSTERRA_SCRIPT_SRC = 'https://pl31093200.profitableratecpmnetwork.com/8a/14/f9/8a14f9b0a67fa09950d757c351475ad8.js';

/**
 * Synchronize Adsterra script injection based on current user role policy
 * @param {boolean} enableAds - Whether ads are enabled for the current user/role
 */
export function syncAdEngine(enableAds = false) {
  try {
    const existingScript = document.getElementById(ADSTERRA_SCRIPT_ID);

    if (enableAds) {
      if (!existingScript) {
        console.log('📢 AdEngine: Enabling Adsterra Popunder Engine for current user policy...');
        const script = document.createElement('script');
        script.id = ADSTERRA_SCRIPT_ID;
        script.src = ADSTERRA_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    } else {
      if (existingScript) {
        console.log('🚫 AdEngine: Disabling Adsterra Popunder Engine (Ad-Free Policy Active)...');
        existingScript.remove();
      }
    }
  } catch (err) {
    console.warn('AdEngine sync exception:', err);
  }
}
