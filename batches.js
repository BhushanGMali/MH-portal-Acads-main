// ============================================================
//  batches.js — Batch list, filters, and batch detail view.
//  Depends on: core.js (apiGet, showLoading, hideLoading, esc,
//              scoreBadge, scoreLabel, fillSelect, navigate,
//              user/batchesData/currentBatch/backendVersion)
// ============================================================

async function loadBatches() {
  showLoading();
  try {
    if (backendVersion === 'old' && batchesData.length > 0) {
      // Already loaded from dashboard
      populateBatchFilters();
      renderBatches(batchesData);
      hideLoading();
      return;
    }
    const resp = await apiGet('getBatches', { email: user.email, role: user.role, level: user.level, center: user.center });
    if (resp.success && resp.data.batches) {
      batchesData = resp.data.batches;
      populateBatchFilters();
      renderBatches(batchesData);
    } else {
      // Fallback to old dashboard data
      if (batchesData.length > 0) {
        populateBatchFilters();
        renderBatches(batchesData);
      } else {
        renderBatches([]);
      }
    }
  } catch (e) {
    console.error('Batches error:', e);
    // Fallback
    if (batchesData.length > 0) {
      populateBatchFilters();
      renderBatches(batchesData);
    }
  }
  hideLoading();
}

function populateBatchFilters() {
  // BH role: no access to the faculty filter
  hideFacultyFilters();
  const subjects = [...new Set(batchesData.flatMap(b => b.subjects || []))].sort();
  const faculty = [...new Set(batchesData.flatMap(b => (b.faculty || []).map(f => f.email)))].sort();
  fillSelect('filterSubject', subjects, 'All Subjects');
  fillSelect('filterFaculty', faculty, 'All Faculty');
}

function applyBatchFilters() {
  const subject = document.getElementById('filterSubject').value;
  const faculty = document.getElementById('filterFaculty').value;
  const search = document.getElementById('filterBatchSearch').value.toLowerCase();

  let filtered = batchesData;
  if (subject) filtered = filtered.filter(b => (b.subjects || []).includes(subject));
  if (faculty) filtered = filtered.filter(b => (b.faculty || []).some(f => f.email === faculty));
  if (search) filtered = filtered.filter(b => (b.batch || '').toLowerCase().includes(search));

  renderBatches(filtered);
}

function renderBatches(batches) {
  const tbody = document.getElementById('batchTableBody');
  if (batches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-msg"><div class="empty-icon">&#128230;</div><p>No batches found</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = batches.map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${b.batch}</strong> <span class="batch-center">(${esc(batchCenterName(b.batch))})</span></td>
      <td>${(b.subjects || []).map(s => '<span class="subject-tag ' + s.toLowerCase() + '">' + s + '</span>').join('')}</td>
      <td class="text-center"><strong>${b.studentCount || 0}</strong></td>
      <td class="text-center">${(b.faculty || []).length}</td>
      <td class="text-center">${b.avgScore != null ? '<strong>' + b.avgScore + '%</strong>' : '<span style="color:var(--pw-text-muted)">—</span>'}</td>
      <td class="text-center">${b.avgScore != null ? '<span class="status-badge ' + scoreBadge(b.avgScore) + '">' + scoreLabel(b.avgScore) + '</span>' : '<span class="status-badge status-average">No Scores</span>'}</td>
      <td><button class="btn-sm btn-view" onclick="viewBatchDetail('${esc(b.batch)}')">View</button></td>
    </tr>
  `).join('');
}

// ── BATCH DETAIL ───────────────────────────────────
async function viewBatchDetail(batch) {
  currentBatch = batch;
  navigate('batchDetail');
  document.getElementById('batchDetailTitle').textContent = 'Batch: ' + batch + (batchCenterName(batch) ? ' (' + batchCenterName(batch) + ')' : '');

  // Populate subject filter from batch data
  const batchInfo = batchesData.find(b => b.batch === batch);
  const subSelect = document.getElementById('batchDetailSubject');
  subSelect.innerHTML = '<option value="">Overall</option>';
  if (batchInfo && batchInfo.subjects) {
    batchInfo.subjects.forEach(s => {
      subSelect.innerHTML += '<option value="' + s + '">' + s + '</option>';
    });
  }

  await loadBatchDetail();
}

async function loadBatchDetail() {
  const subject = document.getElementById('batchDetailSubject').value;
  showLoading();
  try {
    const params = { batch: currentBatch, email: user.email, role: user.role, level: user.level, center: user.center };
    if (subject) params.subject = subject;
    const resp = await apiGet('getBatchDetail', params);
    if (resp.success) {
      renderBatchDetail(resp.data);
      hideLoading();
      return;
    }
  } catch (e) { console.error('getBatchDetail error:', e); }

  // Fallback: render basic batch info from batchesData
  renderBatchDetailFallback();
  hideLoading();
}

function renderBatchDetailFallback() {
  const batchInfo = batchesData.find(b => b.batch === currentBatch);
  if (!batchInfo) {
    document.getElementById('batchDetailStats').innerHTML = '<div class="empty-msg"><p>Batch not found. Please deploy the updated backend.</p></div>';
    return;
  }

  document.getElementById('batchDetailStats').innerHTML = `
    <div class="detail-stat"><div class="ds-value">${batchInfo.studentCount || 0}</div><div class="ds-label">Total Students</div></div>
    <div class="detail-stat"><div class="ds-value">${(batchInfo.faculty || []).length}</div><div class="ds-label">Faculty Members</div></div>
    <div class="detail-stat"><div class="ds-value">${(batchInfo.subjects || []).join(', ')}</div><div class="ds-label">Subjects</div></div>
  `;

  document.getElementById('toppersList').innerHTML = '<div class="perf-empty">Deploy updated backend to see student details</div>';
  document.getElementById('averageList').innerHTML = '<div class="perf-empty">Deploy updated backend to see student details</div>';
  document.getElementById('bottomList').innerHTML = '<div class="perf-empty">Deploy updated backend to see student details</div>';
  document.getElementById('absentList').innerHTML = '<div class="perf-empty">Deploy updated backend to see student details</div>';
  document.getElementById('toppersCount').textContent = '0';
  document.getElementById('averageCount').textContent = '0';
  document.getElementById('bottomCount').textContent = '0';
  document.getElementById('absentCount').textContent = '0';

  document.getElementById('batchStudentBody').innerHTML = '<tr><td colspan="7"><div class="empty-msg"><p>Deploy updated backend for student-level data</p></div></td></tr>';
}

function renderBatchDetail(d) {
  document.getElementById('batchDetailStats').innerHTML = `
    <div class="detail-stat"><div class="ds-value">${d.total}</div><div class="ds-label">Total Students</div></div>
    <div class="detail-stat"><div class="ds-value" style="color:var(--pw-success)">${d.present}</div><div class="ds-label">Present</div></div>
    <div class="detail-stat"><div class="ds-value" style="color:var(--pw-danger)">${d.absent}</div><div class="ds-label">Absent</div></div>
    <div class="detail-stat"><div class="ds-value">${d.avgScore}%</div><div class="ds-label">Avg Score</div></div>
    <div class="detail-stat"><div class="ds-value">${d.highScore}%</div><div class="ds-label">Highest</div></div>
    <div class="detail-stat"><div class="ds-value">${d.lowScore}%</div><div class="ds-label">Lowest</div></div>
  `;

  renderPerfList('toppersList', d.toppers, true);
  renderPerfList('averageList', d.average, true);
  renderPerfList('bottomList', d.bottom, true);
  renderAbsentList('absentList', d.absentees);

  document.getElementById('toppersCount').textContent = d.toppers.length;
  document.getElementById('averageCount').textContent = d.average.length;
  document.getElementById('bottomCount').textContent = d.bottom.length;
  document.getElementById('absentCount').textContent = d.absentees.length;

  const tbody = document.getElementById('batchStudentBody');
  const all = d.allStudents || [];
  tbody.innerHTML = all.length === 0
    ? '<tr><td colspan="7"><div class="empty-msg"><p>No data</p></div></td></tr>'
    : all.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${s.name || s.regno}</td>
        <td style="font-size:12px;color:var(--pw-text-secondary)">${s.regno}</td>
        <td class="text-center">${s.score != null ? s.score : '—'}</td>
        <td class="text-center"><strong>${s.percentage != null ? s.percentage.toFixed(1) + '%' : '—'}</strong></td>
        <td class="text-center">${s.rank || '—'}</td>
        <td class="text-center">${s.tests}</td>
      </tr>
    `).join('');
}