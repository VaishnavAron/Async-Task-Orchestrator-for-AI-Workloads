/**
 * Distributed AI Task Scheduler - UI Rendering Layer
 * Handles all DOM manipulation, animations, badges, cards, restart buttons, and activity logs.
 */

window.workerTimers = window.workerTimers || [];

const ui = {
  /**
   * Helper to quickly update an element's text/html and optional class name.
   */
  updateElement(id, content, className = null) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (content !== undefined && content !== null) {
      if (typeof content === 'string' && (content.startsWith('<') || content.includes('<code>'))) {
        el.innerHTML = content;
      } else {
        el.innerText = content;
      }
    }
    if (className !== null) {
      el.className = className;
    }
    return el;
  },

  /**
   * Display toast notification.
   */
  showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  },

  /**
   * Update header queue depth directly from backend Redis telemetry without frontend math.
   */
  updateQueueCounter(depth) {
    const count = (depth !== undefined && depth !== null) ? depth : 0;
    this.updateElement('topQueueCounter', `${count} Tasks`);
  },

  /**
   * Update Permanent Cluster Health & Ghost Observability Deck (Never display: none).
   */
  updateClusterHealthBanner(osCount, uiCount) {
    const banner = document.getElementById('ghostWarning');
    const textElem = document.getElementById('ghostCountDetails');
    const resetBtn = document.getElementById('bannerHardResetBtn');
    if (!banner || !textElem) return;

    banner.style.display = 'flex';

    if (osCount > uiCount) {
      // RED STATE: Permanent ghost warning
      const ghostCount = osCount - uiCount;
      banner.style.background = '#fee2e2';
      banner.style.border = '1px solid #ef4444';
      banner.style.color = '#991b1b';
      textElem.innerHTML = `
        ⚠️ <strong>Ghost Workers Detected!</strong> 
        ${osCount} Total Workers running on OS | ${uiCount} Managed | ${ghostCount} Ghost processes detected.
      `;
      if (resetBtn) resetBtn.style.display = 'inline-block';
    } else if (osCount === uiCount && osCount > 0) {
      // GREEN STATE: 100% Fully synced
      banner.style.background = '#f0fdf4';
      banner.style.border = '1px solid #86efac';
      banner.style.color = '#166534';
      textElem.innerHTML = `
        🟢 <strong>Cluster 100% Synced:</strong> 
        ${osCount} OS Worker Processes mapped 1:1 to active UI nodes.
      `;
      if (resetBtn) resetBtn.style.display = 'none';
    } else {
      // YELLOW STATE: Starting or desync
      banner.style.background = '#fefce8';
      banner.style.border = '1px solid #fde047';
      banner.style.color = '#854d0e';
      textElem.innerHTML = `
        🟡 <strong>Polling OS Cluster Telemetry...</strong> 
        ${osCount} workers detected on OS | ${uiCount} UI cards.
      `;
      if (resetBtn) resetBtn.style.display = 'none';
    }
  },

  updateWorkerHeader(osCount, uiCount) {
    const headerElement = document.getElementById('topWorkerCount');
    const clusterSubtag = document.getElementById('clusterSubtag');
    const capHint = (uiCount >= 4) ? ' (Max)' : '';
    if (clusterSubtag) clusterSubtag.innerText = `${uiCount} Active Nodes${capHint}`;

    if (headerElement) {
      const ghostCount = osCount - uiCount;
      if (ghostCount > 0) {
        // 🔴 CRITICAL STATE: Ghosts detected!
        headerElement.innerHTML = `
          <span style="color: #ef4444; font-weight: 700;">
            ⚠️ ${osCount} Total Workers | ${uiCount} Managed | ${ghostCount} Ghosts!
          </span>
        `;
      } else if (osCount === uiCount && osCount > 0) {
        // 🟢 PERFECT STATE: Fully synced
        headerElement.innerHTML = `
          <span style="color: #10b981; font-weight: 600;">
            🟢 ${osCount} Workers${capHint} (Synced)
          </span>
        `;
      } else {
        // 🟡 DEGRADED STATE: OS shows 0 or mismatch
        headerElement.innerHTML = `
          <span style="color: #f59e0b; font-weight: 600;">
            🟡 ${osCount} Online${capHint} | ${uiCount} Cards (Desync)
          </span>
        `;
      }
    }

    // Update permanent banner simultaneously
    this.updateClusterHealthBanner(osCount, uiCount);
  },

  updateWorkerCount(uiCount, osCount = null) {
    if (osCount !== null && osCount !== undefined) {
      this.updateWorkerHeader(osCount, uiCount);
    } else {
      this.updateElement('clusterSubtag', `${uiCount} Active Nodes`);
      this.updateElement('topWorkerCount', `🟢 ${uiCount} Workers (Synced)`);
      this.updateClusterHealthBanner(uiCount, uiCount);
    }
  },

  /**
   * Render the full list of worker node cards inside Column 2 with interactive restart buttons.
   */
  renderWorkerCards(workerNodes) {
    const container = document.getElementById('workerCardsContainer');
    if (!container) return;

    container.innerHTML = '';
    workerNodes.forEach(worker => {
      const card = document.createElement('div');
      card.className = 'worker-node-item';
      card.id = `nodeCard${worker.id}`;

      card.innerHTML = `
        <div class="worker-head">
          <span class="worker-name">
            <span class="status-dot" id="nodeDot${worker.id}"></span>
            <span>${worker.name} (${worker.role})</span>
          </span>
          <div class="worker-controls-right">
            <span class="badge badge-success" id="nodeBadge${worker.id}">IDLE</span>
            <button class="btn-restart-worker" id="restartBtn${worker.id}" onclick="restartWorker(${worker.id})" title="Worker is healthy" disabled>♻️</button>
          </div>
        </div>
        <div class="worker-task-desc" id="nodeDesc${worker.id}">Awaiting tasks from Redis queue...</div>
        <div class="worker-bar-track">
          <div class="worker-bar-fill" id="nodeBar${worker.id}"></div>
        </div>
      `;
      container.appendChild(card);
    });
  },

  /**
   * Dynamically append a newly scaled worker node card with smooth 200ms fade-in.
   */
  appendWorkerCard(worker) {
    const container = document.getElementById('workerCardsContainer');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'worker-node-item';
    card.id = `nodeCard${worker.id}`;
    card.style.opacity = '0';

    card.innerHTML = `
      <div class="worker-head">
        <span class="worker-name">
          <span class="status-dot" id="nodeDot${worker.id}"></span>
          <span>${worker.name} (${worker.role})</span>
        </span>
        <div class="worker-controls-right">
          <span class="badge badge-success" id="nodeBadge${worker.id}">IDLE</span>
          <button class="btn-restart-worker" id="restartBtn${worker.id}" onclick="restartWorker(${worker.id})" title="Worker is healthy" disabled>♻️</button>
        </div>
      </div>
      <div class="worker-task-desc" id="nodeDesc${worker.id}">Newly provisioned node. Standing by.</div>
      <div class="worker-bar-track">
        <div class="worker-bar-fill" id="nodeBar${worker.id}"></div>
      </div>
    `;

    container.appendChild(card);
    setTimeout(() => {
      card.style.opacity = '1';
    }, 50);
  },

  /**
   * Set worker node to PROCESSING state with animated progress bar.
   */
  setWorkerProcessing(workerId, taskId, text) {
    this.updateElement(`nodeCard${workerId}`, null, 'worker-node-item is-busy');
    this.updateElement(`nodeDot${workerId}`, null, 'status-dot dot-busy');
    this.updateElement(`nodeBadge${workerId}`, 'PROCESSING', 'badge badge-info');
    
    const snippet = text.length > 24 ? text.substring(0, 22) + '...' : text;
    this.updateElement(`nodeDesc${workerId}`, `#${taskId.substring(0, 6)}: "${snippet}"`);

    const bar = document.getElementById(`nodeBar${workerId}`);
    if (bar) {
      bar.className = 'worker-bar-fill';
      bar.style.width = '0%';
      void bar.offsetWidth; // Trigger reflow
      bar.className = 'worker-bar-fill fill-active';
    }

    const rBtn = document.getElementById(`restartBtn${workerId}`);
    if (rBtn) {
      rBtn.disabled = true;
      rBtn.className = 'btn-restart-worker';
      rBtn.title = 'Worker is actively processing';
    }
  },

  /**
   * Set worker node to SUCCESS or FAILED completion state.
   */
  setWorkerCompleted(workerId, taskId, isSuccess, resultSentiment) {
    const bar = document.getElementById(`nodeBar${workerId}`);
    if (bar) {
      bar.className = 'worker-bar-fill';
      bar.style.width = '100%';
    }

    if (isSuccess) {
      this.updateElement(`nodeCard${workerId}`, null, 'worker-node-item is-success-finish');
      this.updateElement(`nodeDot${workerId}`, null, 'status-dot');
      this.updateElement(`nodeBadge${workerId}`, 'SUCCESS ✅', 'badge badge-success');
      this.updateElement(`nodeDesc${workerId}`, `#${taskId.substring(0, 6)} Finished: ${resultSentiment}`);
    } else {
      this.updateElement(`nodeCard${workerId}`, null, 'worker-node-item is-crashed');
      this.updateElement(`nodeDot${workerId}`, null, 'status-dot dot-danger');
      this.updateElement(`nodeBadge${workerId}`, 'FAILED ❌', 'badge badge-danger');
      this.updateElement(`nodeDesc${workerId}`, `#${taskId.substring(0, 6)}: Auto-Requeued (acks_late)`);
    }
  },

  /**
   * Return worker node back to IDLE state.
   */
  setWorkerIdle(workerId, workerNodes = null) {
    // Check if the worker is crashed
    const nodes = workerNodes || (typeof appState !== 'undefined' ? appState.workerNodes : null);
    const worker = nodes?.find(w => w.id === workerId);
    
    // If crashed, DO NOT overwrite the crash state
    if (worker && worker.crashed) {
      console.log(`[DEBUG] Worker ${workerId} is currently crashed. setWorkerIdle blocked.`);
      return;
    }

    this.updateElement(`nodeCard${workerId}`, null, 'worker-node-item');
    this.updateElement(`nodeDot${workerId}`, null, 'status-dot');
    this.updateElement(`nodeBadge${workerId}`, 'IDLE', 'badge badge-success');
    this.updateElement(`nodeDesc${workerId}`, 'Awaiting tasks from Redis queue...');
    
    const bar = document.getElementById(`nodeBar${workerId}`);
    if (bar) {
      bar.className = 'worker-bar-fill';
      bar.style.width = '0%';
    }

    const rBtn = document.getElementById(`restartBtn${workerId}`);
    if (rBtn) {
      rBtn.disabled = true;
      rBtn.className = 'btn-restart-worker';
      rBtn.title = 'Worker is healthy';
      rBtn.style.pointerEvents = 'none';
      rBtn.style.opacity = '0.35';
    }
  },

  /**
   * Explicitly disable restart button when a node is restored.
   */
  disableRestartButton(workerId) {
    const rBtn = document.getElementById(`restartBtn${workerId}`);
    if (rBtn) {
      rBtn.disabled = true;
      rBtn.className = 'btn-restart-worker';
      rBtn.title = 'Worker is healthy';
      rBtn.style.pointerEvents = 'none';
      rBtn.style.opacity = '0.35';
    }
  },

  /**
   * Force reset all worker cards to IDLE instantly the moment Redis hits 0.
   */
  forceResetAllWorkers(workerNodes) {
    if (window.workerTimers && Array.isArray(window.workerTimers)) {
      window.workerTimers.forEach(timer => clearTimeout(timer));
      window.workerTimers = [];
    }

    if (workerNodes && Array.isArray(workerNodes)) {
      workerNodes.forEach(w => {
        // If worker was not manually crashed, reset to idle
        if (!w.crashed) {
          w.busy = false;
          w.activeTaskId = null;
          this.setWorkerIdle(w.id);
        }
      });
    }
  },

  /**
   * Set worker into CRASHED state during chaos test & activate restart button.
   */
  setWorkerCrashed(workerId) {
    this.updateElement(`nodeCard${workerId}`, null, 'worker-node-item is-crashed');
    this.updateElement(`nodeDot${workerId}`, null, 'status-dot dot-danger');
    this.updateElement(`nodeBadge${workerId}`, 'CRASHED 💀', 'badge badge-danger');
    this.updateElement(`nodeDesc${workerId}`, 'Worker crashed! Click ♻️ Restart to recover.');

    const bar = document.getElementById(`nodeBar${workerId}`);
    if (bar) {
      bar.className = 'worker-bar-fill';
      bar.style.width = '0%';
    }

    const rBtn = document.getElementById(`restartBtn${workerId}`);
    if (rBtn) {
      rBtn.disabled = false;
      rBtn.className = 'btn-restart-worker can-restart';
      rBtn.title = 'Click to restart & recover this crashed worker node';
      rBtn.style.pointerEvents = 'auto';
      rBtn.style.opacity = '1';
      console.log(`[DEBUG] Restart button force-enabled for worker ${workerId}`);
    }
  },

  /**
   * Set absorbing worker nodes to FAILOVER state.
   */
  setWorkerFailover(workerId) {
    this.updateElement(`nodeCard${workerId}`, null, 'worker-node-item is-failover');
    this.updateElement(`nodeBadge${workerId}`, 'FAILOVER', 'badge badge-warning');
  },

  /**
   * Update the latest inference result card with polarity score and confidence bar.
   */
  showSentimentResult(result, latency, workerName, taskId) {
    if (!result) return;

    this.updateElement('lastTaskId', `#${taskId.substring(0, 6)}`);

    const tag = result.sentiment_tag || 'POSITIVE';
    const badgeClass = tag === 'POSITIVE' ? 'badge badge-success' : (tag === 'NEGATIVE' ? 'badge badge-danger' : 'badge badge-warning');
    this.updateElement('resultSentimentBadge', result.sentiment || tag, badgeClass);

    const confPercent = Math.round((result.confidence || 0.8) * 100);
    this.updateElement('resultConfidenceText', `Confidence: ${confPercent}%`);

    const confBar = document.getElementById('confidenceBarFill');
    if (confBar) {
      confBar.style.width = `${confPercent}%`;
      confBar.style.background = tag === 'POSITIVE' ? '#10b981' : (tag === 'NEGATIVE' ? '#ef4444' : '#f59e0b');
    }

    this.updateElement('resultInputPreview', `"${result.input_text}"`);
    
    const pol = result.polarity_score !== undefined ? (result.polarity_score > 0 ? `+${result.polarity_score}` : `${result.polarity_score}`) : '+0.0';
    this.updateElement('resultPolarityVal', pol);
    this.updateElement('resultLatencyVal', `${latency}s`);
    this.updateElement('resultWorkerNodeVal', workerName || 'worker-01');
  },

  /**
   * Add a new row to the scrollable activity feed table.
   */
  addActivityLog(taskId, text, status) {
    const tbody = document.getElementById('feedTableBody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.id = `feed-row-${taskId}`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    tr.innerHTML = `
      <td>${time}</td>
      <td><code>#${taskId.substring(0, 6)}</code></td>
      <td class="feed-text-col" title="${text}">${text}</td>
      <td id="feed-status-${taskId}"><span class="badge badge-neutral">QUEUED</span></td>
    `;

    tbody.prepend(tr);

    if (tbody.children.length > 50) {
      tbody.removeChild(tbody.lastChild);
    }
  },

  /**
   * Update status badge for a specific row in the activity feed.
   */
  updateActivityLog(taskId, status, result) {
    const cell = document.getElementById(`feed-status-${taskId}`);
    if (!cell) return;

    if (status === 'SUCCESS') {
      const sentimentStr = typeof result === 'string' ? result : (result && result.sentiment ? result.sentiment : 'SUCCESS');
      let badgeHtml = '<span class="badge badge-success">POS 😊</span>';
      if (sentimentStr.includes('NEGATIVE')) {
        badgeHtml = '<span class="badge badge-danger">NEG 😞</span>';
      } else if (sentimentStr.includes('NEUTRAL')) {
        badgeHtml = '<span class="badge badge-warning">NEU 😐</span>';
      }
      cell.innerHTML = badgeHtml;
    } else {
      cell.innerHTML = '<span class="badge badge-danger">FAIL ⚠️</span>';
    }
  },

  /**
   * Dynamic Real-Time Telemetry Heatmap (GitHub-Style Dots)
   */
  telemetryDots: [],
  MAX_TELEMETRY_DOTS: 200,

  addTelemetryDot(taskId, status) {
    const existing = this.telemetryDots.find(d => d.id === taskId);
    if (existing) {
      existing.status = status;
    } else {
      this.telemetryDots.push({ id: taskId, status });
    }
    if (this.telemetryDots.length > this.MAX_TELEMETRY_DOTS) {
      this.telemetryDots = this.telemetryDots.slice(-this.MAX_TELEMETRY_DOTS);
    }
    this.renderHeatmap();
  },

  updateTelemetryDot(taskId, status) {
    this.addTelemetryDot(taskId, status);
  },

  renderHeatmap() {
    const grid = document.getElementById('heatmapGrid');
    if (!grid) return;
    grid.innerHTML = '';
    this.telemetryDots.forEach(dot => {
      const el = document.createElement('div');
      el.className = `hdot hdot-${dot.status.toLowerCase()}`;
      el.title = `#${dot.id ? dot.id.substring(0, 6) : 'task'}: ${dot.status.toUpperCase()}`;
      grid.appendChild(el);
    });
    const stats = document.getElementById('heatmapStats');
    if (stats) stats.textContent = `${this.telemetryDots.length} tasks`;
  },

  clearHeatmapDots() {
    this.telemetryDots = [];
    this.renderHeatmap();
  },

  /**
   * Reset all dashboard UI elements to fresh state.
   */
  resetDashboard(workerNodes) {
    this.updateQueueCounter(0);
    this.updateWorkerCount(workerNodes.length);
    this.forceResetAllWorkers(workerNodes);
    
    // FIX 2: Re-render the container to remove stale cards (Worker-04, Worker-05)
    this.renderWorkerCards(workerNodes);
    
    // FIX 4: Clear heatmap telemetry
    this.clearHeatmapDots();

    const tbody = document.getElementById('feedTableBody');
    if (tbody) tbody.innerHTML = '';
    
    this.updateElement('feedCountTag', '0 Events');
    this.showToast('Queue & Activity Feed Reset');
  }
};
