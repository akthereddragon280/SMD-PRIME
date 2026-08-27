/**
 * SMD PRIME - React Client-Side Traffic Router / Load Balancer
 * Distributes stream requests across 3 edge worker nodes for high concurrency and zero buffering.
 */

// 1. Array of 3 expected worker URLs (Placeholders)
export const workers = [
  "https://smd-stream-node-1.smd-prime.workers.dev",
  "https://smd-stream-node-2.akthereddragon281.workers.dev",
  "https://smd-stream-node-3.akthereddragon282.workers.dev"
];

/**
 * 2. Strict Failover Architecture: Always returns Primary Node 1.
 * Stops random node-switching to prevent 403 Google Drive Bot Detection.
 * @returns {string} Primary worker base URL (Node 1)
 */
export function getOptimalWorkerUrl() {
  return workers[0];
}

/**
 * Alias for Primary Node getter
 */
export function getPrimaryWorkerUrl() {
  return workers[0];
}

/**
 * 3. Returns the NEXT sequential fallback worker URL when current node encounters an error (403/500).
 * Failover Path: Node 1 -> Node 2 -> Node 3 -> Node 1
 * @param {string} currentUrl - Current active worker URL
 * @returns {string} Next fallback worker URL
 */
export function getNextWorkerUrl(currentUrl = '') {
  if (!currentUrl) return workers[0];
  const currentIndex = workers.findIndex(w => currentUrl.includes(w) || w.includes(currentUrl));
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % workers.length : 1;
  return workers[nextIndex];
}

/**
 * Helper to generate stream URL for HTML5 video player integration
 * Always starts on Primary Node 1 with forced MP4 progressive parameters.
 * @param {string} fileId - Google Drive / Storage file ID
 * @returns {string} Fully routed video stream URL
 */
export function buildVideoStreamUrl(fileId) {
  const baseUrl = getPrimaryWorkerUrl();
  return `${baseUrl}/?id=${encodeURIComponent(fileId)}&container=mp4&progressive=1`;
}


