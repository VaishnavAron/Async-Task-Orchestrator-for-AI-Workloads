/**
 * Distributed AI Task Scheduler - API Client Layer
 * Encapsulates all backend REST communication. Pure data layer with zero DOM references.
 */

const apiClient = {
  /**
   * Submit an AI sentiment analysis task to the Celery queue.
   * @param {string} text - User prompt or review text.
   * @returns {Promise<Object>} { task_id, status, timestamp }
   */
  async submitTask(text) {
    const response = await fetch('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Poll current execution status and result for a given task ID.
   * @param {string} taskId - UUID of the Celery task.
   * @returns {Promise<Object>} { task_id, status, result, timestamp }
   */
  async pollTaskStatus(taskId) {
    const response = await fetch(`/status/${taskId}`);
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Trigger a burst of 50 concurrent tasks to test queue throughput.
   * @returns {Promise<Object>} { message, task_ids, total, timestamp }
   */
  async spikeTraffic() {
    const response = await fetch('/chaos/spike', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Inject simulated node crash and exceptions (50% failure rate) to test Celery failover.
   * @returns {Promise<Object>} { message, task_ids, total, timestamp }
   */
  async simulateCrash() {
    const response = await fetch('/chaos/simulate-crash', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Dynamically scale out the cluster by launching a new Celery worker process.
   * @returns {Promise<Object>} { status, message, total_workers, worker_name }
   */
  async scaleOut() {
    const response = await fetch('/scale/up', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Fetch current queue depth.
   * @returns {Promise<Object>} { status, queue_depth }
   */
  async fetchQueueDepth() {
    const response = await fetch('/api/queue-depth');
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Fetch live cluster health telemetry.
   * @returns {Promise<Object>} { broker, worker_count, workers, pipeline_status }
   */
  async fetchClusterHealth() {
    const response = await fetch('/api/cluster-health');
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Real OS Worker Count (Ghost Busters API).
   * @returns {Promise<Object>} { status, total_workers, workers }
   */
  async fetchWorkerCount() {
    const response = await fetch('/api/worker-count');
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Hard Reset Cluster (Kills all zombie workers via WMIC and spawns 3 fresh workers).
   * @returns {Promise<Object>} { status, message, total_workers, workers }
   */
  async hardResetCluster() {
    const response = await fetch('/reset/cluster', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Selectively terminate only unmanaged ghost processes.
   * @param {Array<string>} uiWorkers - List of managed worker names/ids.
   * @returns {Promise<Object>} { status, message, killed }
   */
  async killGhosts(uiWorkers) {
    const response = await fetch('/kill-ghosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_workers: uiWorkers })
    });
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }
    return await response.json();
  }
};
