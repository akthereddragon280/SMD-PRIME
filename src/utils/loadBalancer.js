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
 * 2. Returns a randomized worker base URL from the available nodes pool.
 * @returns {string} Optimal worker base URL
 */
export function getOptimalWorkerUrl() {
  return workers[Math.floor(Math.random() * workers.length)];
}

/**
 * Helper to generate stream URL for HTML5 video player integration
 * @param {string} fileId - Google Drive / Storage file ID
 * @returns {string} Fully routed video stream URL
 */
export function buildVideoStreamUrl(fileId) {
  const baseUrl = getOptimalWorkerUrl();
  return `${baseUrl}/?id=${encodeURIComponent(fileId)}`;
}
