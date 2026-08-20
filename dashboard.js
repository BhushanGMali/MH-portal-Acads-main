// ============================================================
//  dashboard.js — Dashboard stats, top/bottom batches, and
//                 old-backend compatibility rendering.
//  Depends on: core.js (apiGet, showLoading, hideLoading, esc,
//              scoreBadge, user/dashData/batchesData/facultyData)
// ============================================================

async function loadDashboard() {
  showLoading();
  try {
    const resp = await apiGet('getDashboard', { email: user.email, role: user.role, level: user.level, center: user.center });
    if (resp.success) {
      // Detect backend version based on response structure
      if (resp.data.batches && resp.data.facultyList) {
        // OLD backend: dashboard includes batches + facultyList
        backendVersion = 'old';
        dashData = resp.data.stats || {};
        // Extract batches from dashboard response
        batchesData = resp.data.batches || [];
        facultyData = (resp.data.facultyList || []).map(f => ({
          email: f.email || '',
          center: f.center || '',
          role: f.role || 'Faculty',
          batches: [],
          subjects: [],
          totalStudents: 0,
          avgScore: null
        }));
      } else {
        // NEW backend: just stats
        backendVersion = 'new';
        dashData = resp.data;
      }
      renderDashboard();

      // If old backend, try to get batches/faculty from dashboard data
      if (backendVersion === 'old') {
        renderDashboardFromOldBackend();
      } else {
        loadBatchesForDashboard();
      }
    }
  } catch (e) { console.error('Dashboard error:', e); }
  hideLoading();
}

function renderDashboard() {
  const s = dashData.stats || dashData;
  document.getElementById('statBatches').textContent = s.totalBatches || 0;
  document.getElementById('statStudents').textContent = (s.totalStudents || 0).toLocaleString();
  document.getElementById('statFaculty').textContent = s.totalFaculty || 0;
  document.getElementById('statAvgScore').textContent = (s.avgScore != null ? s.avgScore : '—') + (s.avgScore != null ? '%' : '');
}

function renderDashboardFromOldBackend() {
  // Old backend: sort batches by studentCount (no avgScore available)
  const batches = batchesData.filter(b => b.batch);
  batches.sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0));

  // Top 5 by student count
  const topEl = document.getElementById('topBatchesList');
  topEl.innerHTML = batches.slice(0, 5).map(b => `
    <div class="dash-item" style="cursor:pointer" onclick="viewBatchDetail('${esc(b.batch)}')">
      <div>
        <div class="batch-name">${b.batch}</div>
        <div class="batch-meta">${(b.subjects || []).join(', ')}</div>
      </div>
      <span class="status-badge status-good">${b.studentCount || 0} students</span>
    </div>
  `).join('') || '<div class="empty-msg"><p>No data yet</p></div>';

  // Bottom 5
  const botEl = document.getElementById('bottomBatchesList');
  const small = [...batches].sort((a, b) => (a.studentCount || 0) - (b.studentCount || 0));
  botEl.innerHTML = small.slice(0, 5).map(b => `
    <div class="dash-item" style="cursor:pointer" onclick="viewBatchDetail('${esc(b.batch)}')">
      <div>
        <div class="batch-name">${b.batch}</div>
        <div class="batch-meta">${(b.subjects || []).join(', ')}</div>
      </div>
      <span class="status-badge status-average">${b.studentCount || 0} students</span>
    </div>
  `).join('') || '<div class="empty-msg"><p>No data yet</p></div>';
}

async function loadBatchesForDashboard() {
  try {
    const resp = await apiGet('getBatches', { email: user.email, role: user.role, level: user.level, center: user.center });
    if (resp.success && resp.data.batches) {
      batchesData = resp.data.batches;
      const scored = batchesData.filter(b => b.avgScore != null);
      scored.sort((a, b) => b.avgScore - a.avgScore);

      document.getElementById('topBatchesList').innerHTML = scored.slice(0, 5).map(b => `
        <div class="dash-item" style="cursor:pointer" onclick="viewBatchDetail('${esc(b.batch)}')">
          <div>
            <div class="batch-name">${b.batch}</div>
            <div class="batch-meta">${b.subjects.join(', ')}</div>
          </div>
          <span class="status-badge ${scoreBadge(b.avgScore)}">${b.avgScore}%</span>
        </div>
      `).join('') || '<div class="empty-msg"><p>No data yet</p></div>';

      const botEl = document.getElementById('bottomBatchesList');
      scored.reverse();
      botEl.innerHTML = scored.slice(0, 5).map(b => `
        <div class="dash-item" style="cursor:pointer" onclick="viewBatchDetail('${esc(b.batch)}')">
          <div>
            <div class="batch-name">${b.batch}</div>
            <div class="batch-meta">${b.subjects.join(', ')}</div>
          </div>
          <span class="status-badge ${scoreBadge(b.avgScore)}">${b.avgScore}%</span>
        </div>
      `).join('') || '<div class="empty-msg"><p>No data yet</p></div>';
    }
  } catch (_) {
    // Fallback to old backend data if available
    if (batchesData.length > 0) renderDashboardFromOldBackend();
  }
}