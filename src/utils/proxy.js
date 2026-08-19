/**
 * Dynamic Proxy Stream Integration for SMD Prime Telegram Mini App
 * Worker Endpoint: https://tgstream.smd-prime.workers.dev/?id={FILE_ID}
 */

export const WORKER_BASE_URL = import.meta.env?.VITE_WORKER_PROXY_URL || 'https://tgstream.smd-prime.workers.dev/?id=';

/**
 * Returns the formatted Cloudflare Worker stream URL given a Google Drive / Telegram File ID.
 * @param {string} fileId - The file ID associated with the video content
 * @returns {string} Fully structured streaming URL
 */
export function getProxyStreamUrl(fileId) {
  if (!fileId) return '';
  if (WORKER_BASE_URL.endsWith('=')) {
    return `${WORKER_BASE_URL}${encodeURIComponent(fileId)}`;
  }
  return `${WORKER_BASE_URL}?id=${encodeURIComponent(fileId)}`;
}

/**
 * Fallback direct video stream URL for demo & browser testing verification
 */
export const DEMO_SAMPLE_STREAMS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4'
];

export function getStreamUrlWithFallback(movie) {
  if (movie?.file_id) {
    return getProxyStreamUrl(movie.file_id);
  }
  return DEMO_SAMPLE_STREAMS[0];
}
