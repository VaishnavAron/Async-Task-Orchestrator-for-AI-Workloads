/**
 * Distributed AI Task Scheduler - Core Application Orchestrator
 * Memory-Safe Demo Configuration: Start 2 Nodes, Max 4 Nodes, Concurrency 3.
 */

// Application Global State (Strict 1:1 OS Worker Mapping, Defaults to 2 nodes for EC2 memory safety)
const appState = {
  totalProcessed: 0,
  pendingTaskQueue: [], // Queue of { taskId, text } awaiting an idle worker slot
  workerNodes: [
    { id: 1, name: "worker-01", role: "Primary NLP Core", busy: false, crashed: false, activeTaskId: null },
    { id: 2, name: "worker-02", role: "Inference Engine", busy: false, crashed: false, activeTaskId: null }
  ]
};

// Map of in-flight task polling intervals (taskId -> setIntervalId)
const activeTaskPollers = new Map();

// Global timer tracker for animations
window.workerTimers = window.workerTimers || [];

// Action debouncer flag
window.isActionProcessing = false;

// Persistent state cache for OS worker counts (handles Celery Windows solo-pool blocking)
let lastKnownWorkerCount = 0;
let lastKnownGhostCount = 0;

// Hard reset boot race condition retry tracking
let lastResetTime = 0;
let resetSyncRetries = 0;

// ---------------------------------------------------------
// Helper for Quick Input Insertion
// ---------------------------------------------------------
function setChip(text) {
  const input = document.getElementById('taskInput');
  if (input) {
    input.value = text;
    input.focus();
  }
}

// ---------------------------------------------------------
// Button Debounce Handler (Prevents Rapid Double-Clicks)
// ---------------------------------------------------------
function debounceAction(actionFn) {
  if (window.isActionProcessing) return;
  window.isActionProcessing = true;
  try {
    actionFn();
  } catch (e) {
    console.warn("Debounce action error:", e);
  }
  setTimeout(() => {
    window.isActionProcessing = false;
  }, 500);
}

// ---------------------------------------------------------
// Real OS Worker Observability (Permanent Ghost Banner & Heartbeat)
// ---------------------------------------------------------
async function syncWorkerCount() {
  try {
    const data = await apiClient.fetchWorkerCount();
    const osCount = data ? (data.total_workers || 0) : 0;
    const uiCount = appState.workerNodes.length;

    // Retry on boot race conditions following a hard reset
    if (lastResetTime && (Date.now() - lastResetTime < 10000) && osCount < uiCount && resetSyncRetries < 3) {
      resetSyncRetries++;
      console.log(`[DEBUG] Boot desync detected (${osCount}/${uiCount}). Retry ${resetSyncRetries}/3 in 2s...`);
      setTimeout(syncWorkerCount, 2000);
      return;
    }

    resetSyncRetries = 0;

    // Retain last known state if workers are busy compute-blocked
    if (osCount === 0 && uiCount > 0) {
      if (lastKnownWorkerCount > 0) {
        ui.updateWorkerHeader(lastKnownWorkerCount, uiCount);
        return;
      }
    }

    // Update header and permanent cluster health banner
    ui.updateWorkerHeader(osCount, uiCount);

    if (osCount > 0) {
      lastKnownWorkerCount = osCount;
      lastKnownGhostCount = Math.max(0, osCount - uiCount);
    }
  } catch (err) {
    console.warn("Worker count sync error:", err);
    if (lastKnownWorkerCount > 0) {
      ui.updateWorkerHeader(lastKnownWorkerCount, appState.workerNodes.length);
    }
  }
}

// ---------------------------------------------------------
// Defensive Real Backend Queue Depth Sync Helper
// ---------------------------------------------------------
async function syncBackendQueueDepth() {
  try {
    const data = await apiClient.fetchQueueDepth();
    const depth = Math.max(0, data.queue_depth || 0);

    const allIdle = appState.workerNodes.every(w => !w.busy && !w.crashed);

    if (depth === 0 && allIdle && appState.pendingTaskQueue.length === 0) {
      ui.updateQueueCounter(0);

      if (window.workerTimers && Array.isArray(window.workerTimers)) {
        window.workerTimers.forEach(timer => clearTimeout(timer));
        window.workerTimers = [];
      }

      appState.workerNodes.forEach(w => {
        if (!w.crashed) {
          w.busy = false;
          w.activeTaskId = null;
          ui.setWorkerIdle(w.id);
        }
      });
      console.log("[DEBUG] System fully synced. Redis empty and all workers idle.");
    } else if (depth === 0 && (!allIdle || appState.pendingTaskQueue.length > 0)) {
      ui.updateQueueCounter("0 (Finalizing... ⏳)");
      console.log("[DEBUG] Redis empty, but workers still finalizing. Waiting for completion.");
    } else {
      ui.updateQueueCounter(depth);
    }
  } catch (e) {
    console.warn("Queue depth poll failed:", e);
  }
}

// ---------------------------------------------------------
// Initialization & Refresh State Recovery
// ---------------------------------------------------------
async function initializeDashboard() {
  ui.renderWorkerCards(appState.workerNodes);
  ui.updateWorkerCount(appState.workerNodes.length);

  const taskForm = document.getElementById('taskForm');
  if (taskForm) {
    taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      debounceAction(submitTask);
    });
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      debounceAction(submitTask);
    });
  }

  const spikeBtn = document.getElementById('spikeBtn');
  if (spikeBtn) spikeBtn.addEventListener('click', () => debounceAction(spikeTraffic));

  const crashBtn = document.getElementById('crashBtn');
  if (crashBtn) crashBtn.addEventListener('click', () => debounceAction(simulateCrash));

  const scaleBtn = document.getElementById('scaleBtn');
  if (scaleBtn) scaleBtn.addEventListener('click', () => debounceAction(scaleOutWorker));

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', () => debounceAction(resetTelemetry));

  const hardResetBtn = document.getElementById('hardResetBtn');
  if (hardResetBtn) hardResetBtn.addEventListener('click', () => debounceAction(hardResetCluster));

  const bannerHardResetBtn = document.getElementById('bannerHardResetBtn');
  if (bannerHardResetBtn) bannerHardResetBtn.addEventListener('click', () => debounceAction(killGhosts));

  syncBackendQueueDepth();
  await syncWorkerCount();

  try {
    const data = await apiClient.fetchQueueDepth();
    ui.updateQueueCounter(Math.max(0, data.queue_depth || 0));
    
    if (data.active > 0) {
      const activeCount = Math.min(data.active, appState.workerNodes.length);
      for (let i = 0; i < activeCount; i++) {
        const w = appState.workerNodes[i];
        w.busy = true;
        ui.setWorkerProcessing(w.id, "active", "In-flight background NLP task...");
      }
    }
  } catch (err) {
    console.warn("Initial sync error:", err);
  }

  setInterval(syncBackendQueueDepth, 1500);
  setInterval(syncWorkerCount, 3000);
}

document.addEventListener("DOMContentLoaded", initializeDashboard);

// ---------------------------------------------------------
// Sequential Single-Task Queue Dispatcher (Crash State Isolation)
// ---------------------------------------------------------
function enqueueTask(taskId, text) {
  appState.pendingTaskQueue.push({ taskId, text });
  ui.addTelemetryDot(taskId, 'queued');
  processNextQueueTasks();
}

function processNextQueueTasks() {
  const idleWorker = appState.workerNodes.find(w => !w.busy && !w.crashed);

  if (!idleWorker) {
    console.log(`[DEBUG] No idle/healthy worker available. Standing by.`);
    return;
  }
  if (appState.pendingTaskQueue.length === 0) {
    console.log(`[DEBUG] Queue is empty. Standing by.`);
    return;
  }

  const taskItem = appState.pendingTaskQueue.shift();
  const taskId = taskItem.taskId || taskItem.id;
  console.log(`[DEBUG] Assigning task #${taskId ? taskId.substring(0, 6) : 'N/A'} to ${idleWorker.name}`);
  assignTaskToWorker(idleWorker, taskItem);
}

function assignTaskToWorker(worker, taskItem) {
  if (worker.crashed) {
    console.warn(`[DEBUG] Attempted to assign task to crashed worker ${worker.name}. Re-queueing task.`);
    appState.pendingTaskQueue.unshift(taskItem);
    return;
  }

  const taskId = taskItem.taskId || taskItem.id;
  worker.busy = true;
  worker.activeTaskId = taskId;

  ui.setWorkerProcessing(worker.id, taskId, taskItem.text);
  ui.updateTelemetryDot(taskId, 'processing');
  syncBackendQueueDepth();
  pollTask(taskId, taskItem.text, worker);
}

function completeWorkerTask(workerOrId, taskId, isSuccess, resultSentiment) {
  const worker = typeof workerOrId === 'object' ? workerOrId : appState.workerNodes.find(w => w.id === workerOrId);
  if (!worker) return;

  ui.setWorkerCompleted(worker.id, taskId, isSuccess, resultSentiment);

  const timer = setTimeout(() => {
    if (!worker.crashed) {
      worker.busy = false;
      worker.activeTaskId = null;
      ui.setWorkerIdle(worker.id);
    }

    console.log(`[DEBUG] Worker ${worker.name} cool-down finished. Calling processNextQueueTasks...`);
    processNextQueueTasks();
  }, 1500);

  window.workerTimers.push(timer);
}

// ---------------------------------------------------------
// Activity Feed Completion Guarantee & Task Poller
// ---------------------------------------------------------
function pollTask(taskId, text, worker) {
  const startTime = Date.now();

  const pollInterval = setInterval(async () => {
    try {
      const data = await apiClient.pollTaskStatus(taskId);

      if (data.status === 'SUCCESS' || data.status === 'FAILED') {
        clearInterval(pollInterval);
        activeTaskPollers.delete(taskId);

        const latency = ((Date.now() - startTime) / 1000).toFixed(2);
        const isSuccess = data.status === 'SUCCESS';

        const sentiment = data.result?.sentiment || (isSuccess ? 'SUCCESS' : 'FAILED');
        ui.updateActivityLog(taskId, data.status, sentiment);
        ui.updateTelemetryDot(taskId, isSuccess ? 'success' : 'failed');

        const workerName = (data.result && data.result.worker_id) ? data.result.worker_id : (worker ? worker.name : 'worker-01');
        if (isSuccess && data.result) {
          ui.showSentimentResult(data.result, latency, workerName, taskId);
        }

        if (worker) {
          completeWorkerTask(worker, taskId, isSuccess, sentiment);
        }

        syncBackendQueueDepth();
      }
    } catch (e) {
      console.warn("Polling retry for task:", taskId, e);
    }
  }, 600);

  activeTaskPollers.set(taskId, pollInterval);
}

// ---------------------------------------------------------
// Hard Reset Cluster (WMIC Zombie Purge & Clean 2-Worker Respawn)
// ---------------------------------------------------------
async function hardResetCluster() {
  ui.showToast('💀 Purging all ghost Celery processes... Spawning 2 clean workers.');

  try {
    const data = await apiClient.hardResetCluster();

    // Reset state to exactly 2 clean workers (EC2 Memory-Safe default)
    appState.totalProcessed = 0;
    appState.pendingTaskQueue = [];

    appState.workerNodes = [
      { id: 1, name: "worker-01", role: "Primary NLP Core", busy: false, crashed: false, activeTaskId: null },
      { id: 2, name: "worker-02", role: "Inference Engine", busy: false, crashed: false, activeTaskId: null }
    ];

    lastKnownWorkerCount = 2;
    lastKnownGhostCount = 0;
    lastResetTime = Date.now();
    resetSyncRetries = 0;

    // Re-enable scale button on reset
    const scaleBtn = document.getElementById('scaleBtn');
    if (scaleBtn) scaleBtn.disabled = false;

    ui.resetDashboard(appState.workerNodes);
    ui.showToast(data.message || '✅ Cluster purged and reset to 2 clean workers!');

    setTimeout(() => {
      syncWorkerCount();
      syncBackendQueueDepth();
    }, 2500);

  } catch (err) {
    ui.showToast(`Hard reset error: ${err.message}`);
  }
}

// ---------------------------------------------------------
// Selective Ghost Worker Purge (Preserves Queues, Logs & Scaled Cards)
// ---------------------------------------------------------
async function killGhosts() {
  const uiWorkerNames = appState.workerNodes.map(w => w.name || `worker-${w.id.toString().padStart(2, '0')}`);
  
  try {
    ui.showToast('🔍 Scanning for ghosts...');
    const result = await apiClient.killGhosts(uiWorkerNames);
    
    if (result && result.status === 'success') {
      const count = result.killed ? result.killed.length : 0;
      ui.showToast(result.message || `✅ Killed ${count} ghost worker(s).`);
      
      await syncWorkerCount();
      const data = await apiClient.fetchWorkerCount();
      const osCount = data.total_workers || 0;
      
      if (osCount < appState.workerNodes.length) {
        appState.workerNodes = appState.workerNodes.slice(0, osCount);
        ui.renderWorkerCards(appState.workerNodes);
        ui.updateWorkerHeader(osCount, appState.workerNodes.length);
      }

      // Re-enable scale button if below 4 nodes
      if (appState.workerNodes.length < 4) {
        const scaleBtn = document.getElementById('scaleBtn');
        if (scaleBtn) scaleBtn.disabled = false;
      }
    } else {
      ui.showToast(result.message || 'No ghosts detected.');
    }
  } catch (e) {
    ui.showToast(`❌ Failed to kill ghosts: ${e.message}`);
  }
}

// ---------------------------------------------------------
// Restart & Recover Crashed Worker Node
// ---------------------------------------------------------
async function restartWorker(workerId) {
  const worker = appState.workerNodes.find(w => w.id === workerId);
  if (!worker) return;

  ui.showToast(`Restarting ${worker.name}... Spawning healthy instance`);

  try {
    await apiClient.scaleOut();

    worker.crashed = false;
    worker.busy = false;
    worker.activeTaskId = null;

    ui.setWorkerIdle(worker.id);
    ui.disableRestartButton(worker.id);
    ui.showToast(`${worker.name} restarted and recovered! (IDLE)`);

    processNextQueueTasks();
    syncBackendQueueDepth();
    await syncWorkerCount();
  } catch (err) {
    ui.showToast(`Restart failed: ${err.message}`);
  }
}

// ---------------------------------------------------------
// Single Task Submission Flow
// ---------------------------------------------------------
async function submitTask() {
  const input = document.getElementById('taskInput');
  const text = input ? input.value.trim() : '';
  if (!text) {
    ui.showToast('Please enter text to analyze');
    return;
  }

  ui.updateQueueCounter(1);

  try {
    const data = await apiClient.submitTask(text);

    ui.showToast(`Task queued: #${data.task_id.substring(0, 6)}`);
    ui.addActivityLog(data.task_id, text, 'QUEUED');

    appState.totalProcessed++;
    ui.updateElement('feedCountTag', `${appState.totalProcessed} Events`);

    enqueueTask(data.task_id, text);
    syncBackendQueueDepth();

  } catch (err) {
    ui.showToast(`Submission Error: ${err.message}`);
    syncBackendQueueDepth();
  }
}

// ---------------------------------------------------------
// Dynamic Horizontal Scaling (Memory-Safe Cap: Max 4 Nodes)
// ---------------------------------------------------------
async function scaleOutWorker() {
  // Cap logic: Prevent scaling beyond 4 nodes for EC2 memory safety
  if (appState.workerNodes.length >= 4) {
    ui.showToast('⚠️ Max workers (4) reached for this demo environment.');
    const scaleBtn = document.getElementById('scaleBtn');
    if (scaleBtn) scaleBtn.disabled = true;
    return;
  }

  const nextId = appState.workerNodes.length + 1;
  const nextName = `worker-${nextId.toString().padStart(2, '0')}`;

  ui.showToast(`Scaling out: Spawning ${nextName} silently in background...`);

  try {
    const data = await apiClient.scaleOut();

    const newWorker = {
      id: nextId,
      name: nextName,
      role: nextId === 3 ? "Fault Tolerance" : (nextId === 4 ? "High-Load Buffer" : "Dynamic Scaled Node"),
      busy: false,
      crashed: false,
      activeTaskId: null
    };
    appState.workerNodes.push(newWorker);

    ui.appendWorkerCard(newWorker);
    ui.updateWorkerCount(appState.workerNodes.length);
    ui.showToast(data.message || `${nextName} scaled up silently!`);

    // Disable button visually if cap is reached
    if (appState.workerNodes.length >= 4) {
      const scaleBtn = document.getElementById('scaleBtn');
      if (scaleBtn) scaleBtn.disabled = true;
    }

    processNextQueueTasks();
    setTimeout(syncWorkerCount, 2000);

  } catch (err) {
    ui.showToast(`Scale up failed: ${err.message}`);
  }
}

// ---------------------------------------------------------
// Chaos Engineering: Traffic Spike (50 Tasks)
// ---------------------------------------------------------
async function spikeTraffic() {
  ui.showToast('🔥 Launching Traffic Spike: 50 Tasks into Redis...');
  ui.updateQueueCounter(50);

  try {
    const data = await apiClient.spikeTraffic();
    ui.showToast(data.message);

    if (data.task_ids && Array.isArray(data.task_ids)) {
      data.task_ids.forEach((id, idx) => {
        const text = `Spike Batch #${idx + 1} - Customer Feedback Review`;
        ui.addActivityLog(id, text, 'QUEUED');
        appState.totalProcessed++;
        enqueueTask(id, text);
      });

      ui.updateElement('feedCountTag', `${appState.totalProcessed} Events`);
    }

    syncBackendQueueDepth();

  } catch (err) {
    ui.showToast(`Spike failed: ${err.message}`);
    syncBackendQueueDepth();
  }
}

// ---------------------------------------------------------
// Chaos Engineering: Simulate Worker Crash & Failover
// ---------------------------------------------------------
async function simulateCrash() {
  ui.showToast('💀 Simulating worker-02 Crash & Failover... (Click ♻️ to restart)');

  const w2 = appState.workerNodes.find(w => w.id === 2);
  if (w2) {
    w2.crashed = true;
    w2.busy = true;
  }

  ui.setWorkerCrashed(2);

  appState.workerNodes.filter(w => w.id !== 2 && !w.crashed).forEach(w => {
    ui.setWorkerFailover(w.id);
  });

  ui.updateQueueCounter(10);

  try {
    const data = await apiClient.simulateCrash();

    if (data.task_ids && Array.isArray(data.task_ids)) {
      data.task_ids.forEach((id, idx) => {
        const text = idx % 2 === 0 ? `Fault Injection Test #${idx + 1}` : `Resilient Payload #${idx + 1}`;
        ui.addActivityLog(id, text, 'QUEUED');
        appState.totalProcessed++;
        enqueueTask(id, text);
      });

      ui.updateElement('feedCountTag', `${appState.totalProcessed} Events`);
    }

    setTimeout(() => {
      appState.workerNodes.filter(w => w.id !== 2 && !w.busy && !w.crashed).forEach(w => {
        ui.setWorkerIdle(w.id);
      });
      processNextQueueTasks();
    }, 6000);

    syncBackendQueueDepth();

  } catch (err) {
    ui.showToast(`Crash simulation error: ${err.message}`);
    syncBackendQueueDepth();
  }
}

// ---------------------------------------------------------
// Reset Telemetry & Logs
// ---------------------------------------------------------
function resetTelemetry() {
  activeTaskPollers.forEach(interval => clearInterval(interval));
  activeTaskPollers.clear();

  appState.totalProcessed = 0;
  appState.pendingTaskQueue = [];

  appState.workerNodes.forEach(w => {
    w.busy = false;
    w.crashed = false;
    w.activeTaskId = null;
  });

  // Re-enable scale button if below 4 nodes
  if (appState.workerNodes.length < 4) {
    const scaleBtn = document.getElementById('scaleBtn');
    if (scaleBtn) scaleBtn.disabled = false;
  }

  ui.resetDashboard(appState.workerNodes);
  syncBackendQueueDepth();
  syncWorkerCount();
}
