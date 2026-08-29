/**
 * SMD PRIME - Smart Health-Aware Edge Router & Load Balancer
 * Distributes stream requests ONLY across healthy worker nodes, automatically skipping dead/404/503 nodes.
 */

// 1. Array of 3 worker URLs
export const workers = [
  "https://smd-stream-node-1.smd-prime.workers.dev",
  "https://smd-stream-node-2.akthereddragon281.workers.dev",
  "https://smd-stream-node-3.akthereddragon282.workers.dev"
];

// Node Health Registry (Key: worker base URL -> Value: { isHealthy: boolean, lastTested: number, failureCount: number })
const nodeHealthRegistry = new Map();

/**
 * Hydrates health registry from sessionStorage on module load
 */
function hydrateHealthRegistry() {
  try {
    const raw = sessionStorage.getItem('smd_node_health');
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      Object.keys(parsed).forEach(k => {
        // Expire down status after 2 minutes (120,000 ms) to re-test recovered nodes
        if (parsed[k]?.lastTested && (now - parsed[k].lastTested < 120000)) {
          nodeHealthRegistry.set(k, parsed[k]);
        }
      });
    }
  } catch (e) {}
}

hydrateHealthRegistry();

/**
 * Persists health registry to sessionStorage
 */
function persistHealthRegistry() {
  try {
    const serialized = {};
    for (let [k, v] of nodeHealthRegistry.entries()) {
      serialized[k] = v;
    }
    sessionStorage.setItem('smd_node_health', JSON.stringify(serialized));
  } catch (e) {}
}

/**
 * Marks a worker node as DEAD / DOWN with a 2-minute penalty cooldown.
 * Triggered automatically on 404 / 503 / network errors.
 * @param {string} workerUrl - Failed worker URL or active stream URL
 */
export function markNodeAsDown(workerUrl) {
  if (!workerUrl) return;
  const match = workers.find(w => workerUrl.includes(w) || w.includes(workerUrl));
  const targetKey = match || workerUrl;
  
  console.warn(`[Load Balancer] 🚨 Marking node DOWN due to error: ${targetKey}`);
  nodeHealthRegistry.set(targetKey, {
    isHealthy: false,
    lastTested: Date.now(),
    failureCount: (nodeHealthRegistry.get(targetKey)?.failureCount || 0) + 1
  });

  persistHealthRegistry();
}

/**
 * Updates node health status explicitly from Admin Diagnostics or background probe.
 * @param {string} workerUrl - Worker URL
 * @param {boolean} isHealthy - True if node returned 200 OK
 */
export function updateNodeHealth(workerUrl, isHealthy) {
  if (!workerUrl) return;
  const match = workers.find(w => workerUrl.includes(w) || w.includes(workerUrl));
  const targetKey = match || workerUrl;

  nodeHealthRegistry.set(targetKey, {
    isHealthy: Boolean(isHealthy),
    lastTested: Date.now(),
    failureCount: isHealthy ? 0 : 1
  });

  persistHealthRegistry();
}

/**
 * Bulk updates node health from Admin Diagnostics report object.
 * @param {Array} diagNodes - Array of node status objects from /admin/diagnostics
 */
export function registerNodesFromDiagnostics(diagNodes = []) {
  if (!Array.isArray(diagNodes)) return;
  diagNodes.forEach(node => {
    if (node.id === 'NODE-1' || node.id === 'Node-1' || node.id === 'smd-stream-node-1') {
      updateNodeHealth(workers[0], node.online);
    } else if (node.id === 'NODE-2' || node.id === 'Node-2' || node.id === 'smd-stream-node-2') {
      updateNodeHealth(workers[1], node.online);
    } else if (node.id === 'NODE-3' || node.id === 'Node-3' || node.id === 'smd-stream-node-3') {
      updateNodeHealth(workers[2], node.online);
    }
  });
}

/**
 * Smart Health-Aware Node Selector:
 * ALWAYS selects from HEALTHY nodes! Bypasses 404 / 503 dead nodes instantly.
 * @returns {string} Optimal healthy worker base URL
 */
export function getOptimalWorkerUrl() {
  const now = Date.now();
  
  // Filter for healthy nodes (not marked down within last 2 mins)
  const healthyWorkers = workers.filter(w => {
    const health = nodeHealthRegistry.get(w);
    if (!health) return true; // Default to healthy if not probed yet
    if (health.isHealthy) return true;
    
    // Cooldown check: if down for > 2 mins, give it another chance to re-test
    if (now - health.lastTested > 120000) {
      return true;
    }
    return false;
  });

  if (healthyWorkers.length > 0) {
    return healthyWorkers[0];
  }

  // If ALL nodes are marked down, fallback to workers[0]
  console.warn('[Load Balancer] ⚠️ All nodes marked down, falling back to Primary Node 1');
  return workers[0];
}

/**
 * Alias for Primary Node getter (Health-aware)
 */
export function getPrimaryWorkerUrl() {
  return getOptimalWorkerUrl();
}

/**
 * Returns the NEXT healthy worker URL when current node encounters an error (403/404/500).
 * Failover Path: Automatically marks failing node DOWN and picks next healthy node.
 * @param {string} currentUrl - Current active worker URL
 * @returns {string} Next fallback healthy worker URL
 */
export function getNextWorkerUrl(currentUrl = '') {
  const currentClean = currentUrl ? workers.find(w => currentUrl.includes(w) || w.includes(currentUrl)) : '';
  
  // Immediately mark current failing URL as DOWN
  if (currentClean) {
    markNodeAsDown(currentClean);
  }

  // Pick next healthy worker
  const now = Date.now();
  const healthyWorkers = workers.filter(w => {
    if (w === currentClean) return false; // Skip current failed worker
    const health = nodeHealthRegistry.get(w);
    if (!health) return true;
    if (health.isHealthy) return true;
    if (now - health.lastTested > 120000) return true;
    return false;
  });

  if (healthyWorkers.length > 0) {
    return healthyWorkers[0];
  }

  // Fallback next sequential worker
  const currentIndex = workers.findIndex(w => currentUrl.includes(w) || w.includes(currentUrl));
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % workers.length : 1;
  return workers[nextIndex];
}

/**
 * Helper to generate stream URL for HTML5 video player integration
 * @param {string} fileId - Storage file ID
 * @returns {string} Fully routed video stream URL
 */
export function buildVideoStreamUrl(fileId) {
  const baseUrl = getOptimalWorkerUrl();
  return `${baseUrl}/?id=${encodeURIComponent(fileId)}&container=mp4&progressive=1`;
}


