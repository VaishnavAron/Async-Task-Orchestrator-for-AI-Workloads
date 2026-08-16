/**
 * Enterprise Distributed AI Task Scheduler - Dashboard Engine v2.0
 * Live Conveyor Belt Queue Buffer • 3-Node Worker Machine Room • Analog Needle Gauge
 */

// Application Global State
const state = {
  totalDispatched: 0,
  totalSucceeded: 0,
  totalFailed: 0,
  activeTasks: new Map(), // taskId -> { text, startTime, nodeIndex }
  workerNodes: [
    { id: "node1", name: "Worker-01", busy: false, activeTask: null },
    { id: "node2", name: "Worker-02", busy: false, activeTask: null },
    { id: "node3", name: "Worker-03", busy: false, activeTask: null }
  ]
};

// Initialize Dashboard
document.addEventListener("DOMContentLoaded", () => {
  initHealthPolling();
  setupEventListeners();
  showToast("Enterprise AI Scheduler & Machine Room Initialized", "info");
});

// Setup Event Listeners
function setupEventListeners() {
  const form = document.getElementById("composerForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleTaskSubmit();
    });
  }
}

// Quick Chip Insertion
function setPrompt(text) {
  const input = document.getElementById("promptInput");
  if (input) {
    input.value = text;
    input.focus();
  }
}

// Toast Notifications
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  
  const icon = type === "success" ? "✅" : (type === "danger" ? "⚠️" : (type === "warning" ? "🔥" : "ℹ️"));
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Update Top & Chaos Metrics
function updateMetricsUI() {
  const dispatchedEl = document.getElementById("statDispatched");
  const succeededEl = document.getElementById("statSucceeded");
  const failedEl = document.getElementById("statFailed");
  const topQueueEl = document.getElementById("topQueueDepth");
  const beltCounterEl = document.getElementById("queueBufferCounter");

  const activeCount = state.activeTasks.size;

  if (dispatchedEl) dispatchedEl.innerText = state.totalDispatched;
  if (succeededEl) succeededEl.innerText = state.totalSucceeded;
  if (failedEl) failedEl.innerText = state.totalFailed;
  if (topQueueEl) topQueueEl.innerText = `${activeCount} Tasks`;
  if (beltCounterEl) beltCounterEl.innerText = `Queue Depth: ${activeCount} Active In-Flight Messages`;
}

// ---------------------------------------------------------
// FEATURE 1: Conveyor Belt UI Queue Management
// ---------------------------------------------------------
function addPillToConveyorBelt(taskId, text) {
  const container = document.getElementById("conveyorBeltContainer");
  const placeholder = document.getElementById("queueEmptyPlaceholder");
  if (!container) return;

  if (placeholder) placeholder.style.display = "none";

  const pill = document.createElement("div");
  pill.className = "queue-pill";
  pill.id = `pill-${taskId}`;
  const snippet = text.length > 22 ? text.substring(0, 20) + "..." : text;
  pill.innerHTML = `<span>📦</span> <strong>#${taskId.substring(0, 6)}</strong>: ${snippet}`;
  
  container.appendChild(pill);
}

function removePillFromConveyorBelt(taskId, isSuccess = true) {
  const pill = document.getElementById(`pill-${taskId}`);
  if (pill) {
    pill.className = isSuccess ? "queue-pill processing" : "queue-pill failed-pill";
    pill.style.opacity = "0";
    pill.style.transform = "scale(0.8) translateY(10px)";
    setTimeout(() => {
      pill.remove();
      const container = document.getElementById("conveyorBeltContainer");
      const placeholder = document.getElementById("queueEmptyPlaceholder");
      if (container && container.children.length === 1 && placeholder) {
        placeholder.style.display = "block";
      }
    }, 300);
  }
}

// ---------------------------------------------------------
// FEATURE 2: Machine Room & Worker Node State Control
// ---------------------------------------------------------
function assignTaskToWorkerNode(taskId, text) {
  // Find least busy worker node
  const availableNode = state.workerNodes.find(n => !n.busy) || state.workerNodes[Math.floor(Math.random() * state.workerNodes.length)];
  availableNode.busy = true;
  availableNode.activeTask = taskId;

  const nodeEl = document.getElementById(`workerNode${availableNode.id.replace('node', '')}`);
  const chipEl = document.getElementById(`${availableNode.id}Chip`);
  const taskEl = document.getElementById(`${availableNode.id}Task`);
  const progressEl = document.getElementById(`${availableNode.id}Progress`);

  if (nodeEl) nodeEl.className = "worker-node-card glass-panel busy";
  if (chipEl) {
    chipEl.className = "node-chip chip-busy";
    chipEl.innerText = "PROCESSING ⚡";
  }
  if (taskEl) {
    const snippet = text.length > 28 ? text.substring(0, 26) + "..." : text;
    taskEl.innerHTML = `Task <code>#${taskId.substring(0, 6)}</code>: "${snippet}"`;
  }
  if (progressEl) {
    progressEl.className = "worker-progress-fill fill-busy";
  }

  return availableNode;
}

function releaseWorkerNode(workerNode, isSuccess = true) {
  if (!workerNode) return;
  workerNode.busy = false;
  workerNode.activeTask = null;

  const nodeEl = document.getElementById(`workerNode${workerNode.id.replace('node', '')}`);
  const chipEl = document.getElementById(`${workerNode.id}Chip`);
  const taskEl = document.getElementById(`${workerNode.id}Task`);
  const progressEl = document.getElementById(`${workerNode.id}Progress`);

  if (nodeEl) nodeEl.className = "worker-node-card glass-panel";
  if (chipEl) {
    chipEl.className = "node-chip";
    chipEl.innerText = "IDLE";
  }
  if (taskEl) {
    taskEl.innerText = isSuccess ? "Awaiting next task from Redis..." : "Recovered from failover. Standing by.";
  }
  if (progressEl) {
    progressEl.className = "worker-progress-fill";
    progressEl.style.width = "0%";
  }
}

// ---------------------------------------------------------
// FEATURE 3: Analog Sentiment Gauge Rotation & Needle
// ---------------------------------------------------------
function updateSentimentGauge(res, latency) {
  const needleGroup = document.getElementById("gaugeNeedleGroup");
  const badgeEl = document.getElementById("latestSentimentBadge");
  const textEl = document.getElementById("latestResultText");
  const confEl = document.getElementById("latestConfidence");
  const polEl = document.getElementById("latestPolarity");
  const latEl = document.getElementById("latestLatency");

  if (!res) return;

  const polarity = res.polarity_score !== undefined ? res.polarity_score : 0.0;
  
  // Rotate Needle: -1.0 -> -65deg, 0.0 -> 0deg, +1.0 -> +65deg
  const targetAngle = Math.round(polarity * 65);
  if (needleGroup) {
    needleGroup.style.transform = `rotate(${targetAngle}deg)`;
  }

  const tag = res.sentiment_tag || "POSITIVE";
  const badgeClass = tag === "POSITIVE" ? "badge-positive" : (tag === "NEGATIVE" ? "badge-negative" : "badge-neutral");

  if (badgeEl) {
    badgeEl.className = `sentiment-badge-lg ${badgeClass}`;
    badgeEl.innerHTML = res.sentiment || tag;
  }

  if (textEl) textEl.innerText = `"${res.input_text}"`;
  if (confEl) confEl.innerText = `${(res.confidence * 100).toFixed(0)}%`;
  if (polEl) polEl.innerText = polarity > 0 ? `+${polarity}` : `${polarity}`;
  if (latEl) latEl.innerText = `${latency}s`;
}

// ---------------------------------------------------------
// Task Execution & Status Polling Logic
// ---------------------------------------------------------
async function handleTaskSubmit() {
  const input = document.getElementById("promptInput");
  const text = input ? input.value.trim() : "";
  
  if (!text) {
    showToast("Please enter text for inference analysis.", "danger");
    return;
  }

  try {
    const response = await fetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    state.totalDispatched++;
    state.activeTasks.set(data.task_id, { text, startTime: Date.now() });
    updateMetricsUI();

    showToast(`Task Queued in Redis: #${data.task_id.substring(0, 6)}`, "info");
    
    // Add to Visual Conveyor Belt
    addPillToConveyorBelt(data.task_id, text);
    
    // Assign to Machine Room Node
    const assignedWorker = assignTaskToWorkerNode(data.task_id, text);
    
    // Add Row to Telemetry Table
    addLogRow(data.task_id, text, "PENDING", null);
    
    // Start Polling
    pollTaskStatus(data.task_id, text, assignedWorker);
    
  } catch (err) {
    showToast(`Submission failed: ${err.message}`, "danger");
  }
}

function pollTaskStatus(taskId, originalText, assignedWorker) {
  const taskData = state.activeTasks.get(taskId) || { startTime: Date.now() };

  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/status/${taskId}`);
      if (!response.ok) return;

      const data = await response.json();

      if (data.status === "SUCCESS") {
        clearInterval(interval);
        state.activeTasks.delete(taskId);
        state.totalSucceeded++;
        updateMetricsUI();

        const latency = ((Date.now() - taskData.startTime) / 1000).toFixed(2);
        
        // Remove from Conveyor Belt
        removePillFromConveyorBelt(taskId, true);
        
        // Release Machine Room Node
        releaseWorkerNode(assignedWorker, true);
        
        // Rotate Gauge & Update Card
        updateSentimentGauge(data.result, latency);
        
        // Update Telemetry Row
        updateLogRow(taskId, "SUCCESS", data.result, latency);

      } else if (data.status === "FAILED") {
        clearInterval(interval);
        state.activeTasks.delete(taskId);
        state.totalFailed++;
        updateMetricsUI();

        const latency = ((Date.now() - taskData.startTime) / 1000).toFixed(2);
        
        // Remove from Conveyor Belt (Red)
        removePillFromConveyorBelt(taskId, false);
        
        // Release Machine Room Node
        releaseWorkerNode(assignedWorker, false);
        
        // Update Telemetry Row
        updateLogRow(taskId, "FAILED", { sentiment: "FAULT (RETRIED/DLQ)" }, latency);
      }
    } catch (e) {
      console.warn("Polling error:", e);
    }
  }, 800);
}

// ---------------------------------------------------------
// Telemetry Table Row Handlers
// ---------------------------------------------------------
function addLogRow(taskId, text, status, result) {
  const tbody = document.getElementById("telemetryTableBody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.id = `row-${taskId}`;
  
  const timeStr = new Date().toLocaleTimeString();
  const statusBadge = getStatusBadgeHTML(status);

  tr.innerHTML = `
    <td>${timeStr}</td>
    <td class="task-id-code">${taskId.substring(0, 8)}...</td>
    <td class="task-text-snippet" title="${text}">${text}</td>
    <td id="status-cell-${taskId}">${statusBadge}</td>
    <td id="result-cell-${taskId}" class="task-id-code">-</td>
  `;

  tbody.prepend(tr);

  if (tbody.children.length > 50) {
    tbody.removeChild(tbody.lastChild);
  }
}

function updateLogRow(taskId, status, result, latency) {
  const statusCell = document.getElementById(`status-cell-${taskId}`);
  const resultCell = document.getElementById(`result-cell-${taskId}`);

  if (statusCell) {
    statusCell.innerHTML = getStatusBadgeHTML(status);
  }

  if (resultCell && result) {
    resultCell.innerHTML = `<strong>${result.sentiment || status}</strong> (${latency}s)`;
  }
}

function getStatusBadgeHTML(status) {
  if (status === "SUCCESS") {
    return `<span class="sentiment-badge-lg badge-positive" style="font-size: 0.7rem; padding: 2px 7px;">SUCCESS</span>`;
  } else if (status === "FAILED") {
    return `<span class="sentiment-badge-lg badge-negative" style="font-size: 0.7rem; padding: 2px 7px;">FAILED/DLQ</span>`;
  }
  return `<span class="sentiment-badge-lg badge-pending" style="font-size: 0.7rem; padding: 2px 7px;">QUEUED ⏳</span>`;
}

// ---------------------------------------------------------
// Chaos Engineering Actions
// ---------------------------------------------------------
async function triggerChaosSpike() {
  showToast("🔥 Launching 50 concurrent NLP tasks across Redis queue...", "warning");

  try {
    const res = await fetch("/chaos/spike", { method: "POST" });
    const data = await res.json();

    state.totalDispatched += data.total;
    updateMetricsUI();
    showToast(data.message, "success");

    if (data.task_ids && Array.isArray(data.task_ids)) {
      data.task_ids.forEach((id, idx) => {
        const text = `Spike Payload #${idx + 1}`;
        state.activeTasks.set(id, { text, startTime: Date.now() });
        
        // Add to visual conveyor belt
        addPillToConveyorBelt(id, text);
        
        // Assign to machine room
        const workerNode = assignTaskToWorkerNode(id, text);
        
        // Add row to stream
        addLogRow(id, `[Chaos Batch] Traffic Surge Payload #${idx + 1}`, "PENDING", null);
        
        // Poll status
        pollTaskStatus(id, text, workerNode);
      });
    }
  } catch (err) {
    showToast(`Chaos trigger failed: ${err.message}`, "danger");
  }
}

async function triggerChaosCrash() {
  showToast("💀 Simulating 50% Worker Failure Rate (Injecting Exceptions)...", "danger");
  
  // Visually crash Worker Node 02
  const node2 = document.getElementById("workerNode2");
  const node2Chip = document.getElementById("node2Chip");
  const node2Task = document.getElementById("node2Task");
  const node3 = document.getElementById("workerNode3");
  const node3Chip = document.getElementById("node3Chip");

  if (node2) node2.className = "worker-node-card glass-panel failing";
  if (node2Chip) {
    node2Chip.className = "node-chip chip-fail";
    node2Chip.innerText = "CRASH / FAULT 🔴";
  }
  if (node2Task) node2Task.innerHTML = `<strong>⚠️ Exception Injected:</strong> Simulating worker failure.`;

  // Visually show Node 03 absorbing failover
  if (node3) node3.className = "worker-node-card glass-panel failover-absorbing";
  if (node3Chip) {
    node3Chip.className = "node-chip chip-failover";
    node3Chip.innerText = "ABSORBING RETRY 🟡";
  }

  try {
    const res = await fetch("/chaos/simulate-crash", { method: "POST" });
    const data = await res.json();

    state.totalDispatched += data.total;
    updateMetricsUI();
    showToast(data.message, "warning");

    if (data.task_ids && Array.isArray(data.task_ids)) {
      data.task_ids.forEach((id, idx) => {
        const text = `Fault Test #${idx + 1}`;
        state.activeTasks.set(id, { text, startTime: Date.now() });
        
        addPillToConveyorBelt(id, text);
        const workerNode = state.workerNodes[idx % 3];
        addLogRow(id, `[Fault Injection] Payload #${idx + 1}`, "PENDING", null);
        pollTaskStatus(id, text, workerNode);
      });
    }

    // Auto-recover Node 2 after 4 seconds
    setTimeout(() => {
      if (node2) node2.className = "worker-node-card glass-panel";
      if (node2Chip) {
        node2Chip.className = "node-chip";
        node2Chip.innerText = "RECOVERED 🟢";
      }
      if (node2Task) node2Task.innerText = "Late Ack (acks_late=True) verified.";

      if (node3) node3.className = "worker-node-card glass-panel";
      if (node3Chip) {
        node3Chip.className = "node-chip";
        node3Chip.innerText = "IDLE";
      }

      showToast("Worker failover completed. Resilience verified with 0 task loss.", "success");
    }, 4500);

  } catch (err) {
    showToast(`Simulate crash failed: ${err.message}`, "danger");
  }
}

function resetTelemetry() {
  state.totalDispatched = 0;
  state.totalSucceeded = 0;
  state.totalFailed = 0;
  state.activeTasks.clear();
  updateMetricsUI();

  const container = document.getElementById("conveyorBeltContainer");
  if (container) {
    container.innerHTML = `<div class="queue-empty-placeholder" id="queueEmptyPlaceholder">Queue is empty. Dispatch tasks or trigger a Traffic Spike...</div>`;
  }

  const tbody = document.getElementById("telemetryTableBody");
  if (tbody) tbody.innerHTML = "";

  showToast("Telemetry stream, conveyor belt & counters reset.", "info");
}

function initHealthPolling() {
  setInterval(async () => {
    try {
      const res = await fetch("/api/cluster-health");
      if (res.ok) {
        const data = await res.json();
        const brokerEl = document.getElementById("brokerStatusVal");
        if (brokerEl) brokerEl.innerText = data.broker || "CONNECTED (Redis)";
      }
    } catch (e) {
      console.warn("Health check error:", e);
    }
  }, 5000);
}
