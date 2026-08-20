// ============================================================
//  PW Maharashtra Region — Faculty Performance Portal
//  Frontend JavaScript — v2 (compatible with old + new backend)
// ============================================================

const API_BASE = 'https://script.google.com/macros/s/AKfycby_nKOz_ZGPiWMwmAYEtseq1oPydueeSOOzMseOtFIGK-cgPUPidoP_8I4dvd5AwENQ/exec';

// ── STATE ──────────────────────────────────────────
let user = null;
let dashData = null;
let batchesData = [];
let facultyData = [];
let studentsData = [];
let currentView = 'dashboard';
let currentBatch = null;
let backendVersion = 'unknown'; // 'old' or 'new'

// ── SCREEN NAVIGATION ──────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── NAVIGATION ─────────────────────────────────────
function navigate(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.topnav-link').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById('view-' + view);
  const navEl = document.querySelector(`.topnav-link[data-view="${view}"]`);
  if (viewEl) viewEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  // Load data for the view
  if (view === 'dashboard' && !dashData) loadDashboard();
  if (view === 'batches' && batchesData.length === 0) loadBatches();
  if (view === 'faculty' && facultyData.length === 0) loadFaculty();
  if (view === 'students' && studentsData.length === 0) loadStudents();
}

// ── API HELPERS ────────────────────────────────────
function apiGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return fetch(`${API_BASE}?${qs}`).then(r => r.text()).then(parseApiResponse)
    .catch(err => {
      if (err && err.message === 'HTML_RESPONSE') {
        // Retry once — Apps Script redirect usually resolves on 2nd call
        return fetch(`${API_BASE}?${qs}`).then(r => r.text()).then(parseApiResponse);
      }
      throw err;
    });
}

function apiPost(action, body) {
  return fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body })
  }).then(r => r.text()).then(parseApiResponse)
    .catch(err => {
      if (err && err.message === 'HTML_RESPONSE') {
        return fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...body })
        }).then(r => r.text()).then(parseApiResponse);
      }
      throw err;
    });
}

// Apps Script web apps sometimes return an HTML interstitial page on the
// first request (302 redirect). Retry once, and parse JSON if possible.
function parseApiResponse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    // HTML page returned — retry the same request once
    throw new Error('HTML_RESPONSE');
  }
}

function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

function showError(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.add('show'); }
function hideAlert(id) { document.getElementById(id).classList.remove('show'); }

// ── LOGIN ──────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const identifier = document.getElementById('loginId').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!identifier || !password) { showError('loginError', 'Please fill all fields'); return; }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Signing in...';
  hideAlert('loginError');

  try {
    const resp = await apiGet('login', { identifier, password });
    if (resp.success) {
      user = resp.data;
      // Backward compatibility
      if (!user.level && user.hierarchyLevel) user.level = user.hierarchyLevel;
      localStorage.setItem('pw_user', JSON.stringify(user));
      initApp();
    } else {
      showError('loginError', resp.message);
    }
  } catch (_) {
    showError('loginError', 'Connection error. Please try again.');
  }

  btn.disabled = false;
  btn.querySelector('span').textContent = 'Sign In';
}

// ── FORGOT PASSWORD ────────────────────────────────
async function handleForgot(e) {
  e.preventDefault();
  hideAlert('forgotError'); hideAlert('forgotSuccess');
  const id = document.getElementById('forgotId').value.trim();
  if (!id) { showError('forgotError', 'Enter email or PWID'); return; }

  try {
    const resp = await apiGet('forgotPassword', { identifier: id });
    if (resp.success) {
      document.getElementById('forgotSuccess').textContent = 'OTP sent to ' + resp.data.email;
      document.getElementById('forgotSuccess').classList.add('show');
      document.getElementById('otpForm').style.display = 'block';
    } else {
      showError('forgotError', resp.message);
    }
  } catch (_) { showError('forgotError', 'Connection error'); }
}

async function handleVerifyOTP(e) {
  e.preventDefault();
  hideAlert('forgotError'); hideAlert('forgotSuccess');
  const id = document.getElementById('forgotId').value.trim();
  const otp = document.getElementById('otpInput').value.trim();
  if (!otp || otp.length !== 6) { showError('forgotError', 'Enter valid 6-digit OTP'); return; }

  try {
    const resp = await apiGet('verifyOTP', { identifier: id, otp });
    if (resp.success) {
      document.getElementById('forgotSuccess').textContent = 'OTP verified! Set new password.';
      document.getElementById('forgotSuccess').classList.add('show');
      document.getElementById('otpForm').style.display = 'none';
      document.getElementById('resetForm').style.display = 'block';
    } else { showError('forgotError', resp.message); }
  } catch (_) { showError('forgotError', 'Connection error'); }
}

async function handleResetPassword(e) {
  e.preventDefault();
  hideAlert('forgotError'); hideAlert('forgotSuccess');
  const id = document.getElementById('forgotId').value.trim();
  const np = document.getElementById('newPassword').value.trim();
  const cp = document.getElementById('confirmPassword').value.trim();
  if (np.length < 4) { showError('forgotError', 'Password too short (min 4)'); return; }
  if (np !== cp) { showError('forgotError', 'Passwords do not match'); return; }

  try {
    const resp = await apiPost('resetPassword', { identifier: id, newPassword: np });
    if (resp.success) {
      document.getElementById('forgotSuccess').textContent = 'Password updated! Redirecting...';
      document.getElementById('forgotSuccess').classList.add('show');
      setTimeout(() => {
        document.getElementById('resetForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'none';
        showScreen('loginScreen');
      }, 1500);
    } else { showError('forgotError', resp.message); }
  } catch (_) { showError('forgotError', 'Connection error'); }
}

// ── SIGNUP ─────────────────────────────────────────
function openSignup() {
  showScreen('signupScreen');
  hideAlert('signupError'); hideAlert('signupSuccess');
  document.getElementById('signupForm').reset();
  document.getElementById('signupSuccess').style.display = 'none';
  loadSignupOptions();
}

async function loadSignupOptions() {
  try {
    const resp = await apiGet('getSignupOptions');
    if (resp.success) {
      // Populate centers checkboxes
      const centersBox = document.getElementById('signupCenters');
      centersBox.innerHTML = resp.data.centers.map(c =>
        '<label><input type="checkbox" value="' + esc(c) + '"> ' + esc(c) + '</label>'
      ).join('') || '<div class="signup-hint">No centers available</div>';

      // Populate roles
      const roleSel = document.getElementById('signupRole');
      roleSel.innerHTML = '<option value="">Select role...</option>' +
        resp.data.roles.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
    }
  } catch (_) {}
}

function updateRoleHint() {
  const role = document.getElementById('signupRole').value;
  const hints = {
    'Faculty': 'Approval goes to your AOM',
    'Subject Head': 'Approval goes to your AOM',
    'AOM': 'Approval goes to your CH/ACH',
    'CH/ACH': 'Approval goes to your RAOM',
    'RAOM': 'Approval goes to your RAH',
    'RAH': 'Approval goes to the Admin'
  };
  document.getElementById('roleHint').textContent = hints[role] || '';
}

async function handleSignup(e) {
  e.preventDefault();
  hideAlert('signupError'); hideAlert('signupSuccess');
  const btn = document.getElementById('signupBtn');
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value.trim();
  const role = document.getElementById('signupRole').value;

  const centers = Array.from(document.querySelectorAll('#signupCenters input:checked'))
    .map(c => c.value);
  if (!email) { showError('signupError', 'Email required'); return; }
  if (centers.length === 0) { showError('signupError', 'Select at least one center'); return; }
  if (!role) { showError('signupError', 'Select a role'); return; }
  if (password.length < 4) { showError('signupError', 'Password must be at least 4 characters'); return; }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Submitting...';

  try {
    const resp = await apiGet('signup', { email, centers: centers.join(', '), role, password });
    if (resp.success) {
      document.getElementById('signupSuccess').textContent = resp.message;
      document.getElementById('signupSuccess').classList.add('show');
      document.getElementById('signupForm').reset();
      document.getElementById('signupCenters').innerHTML = '';
      document.getElementById('signupRole').innerHTML = '<option value="">Select role...</option>';
    } else {
      showError('signupError', resp.message);
    }
  } catch (_) { showError('signupError', 'Connection error'); }

  btn.disabled = false;
  btn.querySelector('span').textContent = 'Submit for Approval';
}

// ── INIT APP ───────────────────────────────────────
function initApp() {
  if (!user.level && user.hierarchyLevel) user.level = user.hierarchyLevel;
  showScreen('appScreen');
  document.getElementById('userAvatar').textContent = user.email.charAt(0).toUpperCase();
  document.getElementById('topbarEmail').textContent = user.email;
  document.getElementById('topbarRole').textContent = user.role;
  setupCenterSwitcher();
  dashData = null;
  batchesData = [];
  facultyData = [];
  studentsData = [];
  navigate('dashboard');
}

function setupCenterSwitcher() {
  const centers = user.centers && user.centers.length ? user.centers : (user.center ? [user.center] : []);
  const switcher = document.getElementById('centerSwitcher');
  const sel = document.getElementById('centerSelect');
  if (centers.length > 1) {
    switcher.style.display = 'flex';
    sel.innerHTML = centers.map(c => '<option value="' + esc(c) + '"' + (c === user.center ? ' selected' : '') + '>' + esc(c) + '</option>').join('');
  } else {
    switcher.style.display = 'none';
  }
}

function switchCenter() {
  user.center = document.getElementById('centerSelect').value;
  localStorage.setItem('pw_user', JSON.stringify(user));
  // Reload all data for the new center
  dashData = null;
  batchesData = [];
  facultyData = [];
  studentsData = [];
  navigate('dashboard');
}

// ── DASHBOARD ──────────────────────────────────────
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

// ── BATCHES ────────────────────────────────────────
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
      <td><strong>${b.batch}</strong></td>
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
  document.getElementById('batchDetailTitle').textContent = 'Batch: ' + batch;

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

// ── FACULTY ────────────────────────────────────────
async function loadFaculty() {
  showLoading();
  try {
    if (backendVersion === 'old' && facultyData.length > 0) {
      populateFacultyFilters();
      renderFaculty(facultyData);
      hideLoading();
      return;
    }
    const resp = await apiGet('getFaculty', { email: user.email, role: user.role, level: user.level, center: user.center });
    if (resp.success && resp.data.faculty) {
      facultyData = resp.data.faculty;
      populateFacultyFilters();
      renderFaculty(facultyData);
    } else if (facultyData.length > 0) {
      populateFacultyFilters();
      renderFaculty(facultyData);
    } else {
      renderFaculty([]);
    }
  } catch (e) {
    console.error('Faculty error:', e);
    if (facultyData.length > 0) {
      renderFaculty(facultyData);
    } else {
      renderFaculty([]);
    }
  }
  hideLoading();
}

function populateFacultyFilters() {
  const centers = [...new Set(facultyData.map(f => f.center || ''))].filter(Boolean).sort();
  fillSelect('filterFacCenter', centers, 'All Centers');
}

function applyFacultyFilters() {
  const center = document.getElementById('filterFacCenter').value;
  const search = document.getElementById('filterFacSearch').value.toLowerCase();
  let filtered = facultyData;
  if (center) filtered = filtered.filter(f => f.center === center);
  if (search) filtered = filtered.filter(f => (f.email || '').toLowerCase().includes(search));
  renderFaculty(filtered);
}

function renderFaculty(list) {
  const tbody = document.getElementById('facultyTableBody');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-msg"><div class="empty-icon">&#128105;&#8205;&#127891;</div><p>No faculty found</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map((f, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${(f.email || '').split('@')[0]}</strong><br><span style="font-size:12px;color:var(--pw-text-secondary)">${f.email || ''}</span></td>
      <td style="font-size:13px">${f.center || ''}</td>
      <td><span class="role-badge">${f.role || 'Faculty'}</span></td>
      <td class="text-center"><strong>${(f.batches || []).length}</strong></td>
      <td class="text-center"><strong>${f.totalStudents || 0}</strong></td>
      <td class="text-center">${f.avgScore != null ? '<strong>' + f.avgScore + '%</strong>' : '<span style="color:var(--pw-text-muted)">—</span>'}</td>
      <td>${(f.subjects || []).map(s => '<span class="subject-tag ' + s.toLowerCase() + '">' + s + '</span>').join('')}</td>
    </tr>
  `).join('');
}

// ── STUDENTS ───────────────────────────────────────
async function loadStudents() {
  showLoading();
  try {
    const resp = await apiGet('getStudents', { email: user.email, role: user.role, level: user.level, center: user.center });
    if (resp.success && resp.data.students) {
      studentsData = resp.data.students;
      populateStudentFilters();
      renderStudents(studentsData);
    } else {
      renderStudentsEmpty('Deploy updated backend to view student data');
    }
  } catch (e) {
    console.error('Students error:', e);
    renderStudentsEmpty('Deploy updated backend to view student data');
  }
  hideLoading();
}

function renderStudentsEmpty(msg) {
  const tbody = document.getElementById('studentTableBody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="empty-msg"><p>' + msg + '</p></div></td></tr>';
}

function populateStudentFilters() {
  const batches = [...new Set(studentsData.map(s => s.batch))].sort();
  fillSelect('filterStuBatch', batches, 'All Batches');
}

function applyStudentFilters() {
  const batch = document.getElementById('filterStuBatch').value;
  const sort = document.getElementById('filterStuSort').value;
  const search = document.getElementById('filterStuSearch').value.toLowerCase();

  let filtered = studentsData;
  if (batch) filtered = filtered.filter(s => s.batch === batch);
  if (search) filtered = filtered.filter(s =>
    (s.name || '').toLowerCase().includes(search) || (s.regno || '').toLowerCase().includes(search));

  if (sort === 'score_desc') filtered.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  else if (sort === 'score_asc') filtered.sort((a, b) => (a.avgScore || 0) - (b.avgScore || 0));
  else if (sort === 'name') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  else if (sort === 'tests') filtered.sort((a, b) => b.tests - a.tests);

  renderStudents(filtered);
}

function renderStudents(list) {
  const tbody = document.getElementById('studentTableBody');
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-msg"><div class="empty-icon">&#127891;</div><p>No students found</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.name || '—'}</strong></td>
      <td style="font-size:12px;color:var(--pw-text-secondary)">${s.regno}</td>
      <td>${s.batch}</td>
      <td class="text-center">${s.tests}</td>
      <td class="text-center">${s.avgScore != null ? '<strong>' + s.avgScore + '%</strong>' : '<span style="color:var(--pw-text-muted)">No tests</span>'}</td>
      <td>${s.bestSubject && s.bestSubject !== '—' ? '<span class="subject-tag ' + s.bestSubject.toLowerCase() + '">' + s.bestSubject + '</span>' : '—'}</td>
      <td><button class="btn-sm btn-view" onclick="viewStudentDetail('${esc(s.regno)}')">View</button></td>
    </tr>
  `).join('');
}

// ── STUDENT DETAIL ─────────────────────────────────
async function viewStudentDetail(regno) {
  navigate('studentDetail');
  showLoading();
  try {
    const resp = await apiGet('getStudentDetail', { regno });
    if (resp.success) {
      renderStudentDetail(resp.data);
    } else {
      document.getElementById('studentDetailTitle').textContent = 'Student: ' + regno;
      document.getElementById('studentDetailStats').innerHTML = '<div class="empty-msg"><p>Deploy updated backend for student details</p></div>';
    }
  } catch (e) {
    console.error(e);
    document.getElementById('studentDetailTitle').textContent = 'Student: ' + regno;
    document.getElementById('studentDetailStats').innerHTML = '<div class="empty-msg"><p>Deploy updated backend for student details</p></div>';
  }
  hideLoading();
}

function renderStudentDetail(d) {
  const s = d.student;
  document.getElementById('studentDetailTitle').textContent = (s.name || s.regno) + ' — ' + s.batch;

  document.getElementById('studentDetailStats').innerHTML = `
    <div class="detail-stat"><div class="ds-value">${s.regno}</div><div class="ds-label">Registration No</div></div>
    <div class="detail-stat"><div class="ds-value">${s.batch}</div><div class="ds-label">Batch</div></div>
    <div class="detail-stat"><div class="ds-value">${s.testsTaken}</div><div class="ds-label">Tests Taken</div></div>
    <div class="detail-stat"><div class="ds-value">${s.avgScore}%</div><div class="ds-label">Avg Score</div></div>
  `;

  const subjs = ['physics','chemistry','maths','zoology','botany'];
  const labels = ['Physics','Chemistry','Maths','Zoology','Botany'];
  document.getElementById('studentSubjectBars').innerHTML = subjs.map((s2, i) => {
    const val = (s.subjectAverages && s.subjectAverages[s2]) || 0;
    return `
      <div class="sub-bar-card">
        <div class="sub-bar-label">${labels[i]}</div>
        <div class="sub-bar-value">${val > 0 ? val + '%' : '—'}</div>
        <div class="sub-bar-track"><div class="sub-bar-fill ${s2}" style="width:${val}%"></div></div>
      </div>
    `;
  }).join('');

  const tbody = document.getElementById('studentTestBody');
  const tests = d.tests || [];
  tbody.innerHTML = tests.length === 0
    ? '<tr><td colspan="10"><div class="empty-msg"><p>No test history</p></div></td></tr>'
    : tests.reverse().map(t => `
      <tr>
        <td>${t.testDate || '—'}</td>
        <td>${t.testType || '—'}</td>
        <td class="text-center">${t.physics != null ? t.physics : '—'}</td>
        <td class="text-center">${t.chemistry != null ? t.chemistry : '—'}</td>
        <td class="text-center">${t.maths != null ? t.maths : '—'}</td>
        <td class="text-center">${t.zoology != null ? t.zoology : '—'}</td>
        <td class="text-center">${t.botany != null ? t.botany : '—'}</td>
        <td class="text-center"><strong>${t.score}</strong></td>
        <td class="text-center"><strong>${t.percentage.toFixed(1)}%</strong></td>
        <td class="text-center">${t.rank || '—'}</td>
      </tr>
    `).join('');
}

// ── PERFORMANCE LIST RENDERERS ─────────────────────
function renderPerfList(containerId, students, showScore) {
  const el = document.getElementById(containerId);
  if (!students || students.length === 0) {
    el.innerHTML = '<div class="perf-empty">No data</div>';
    return;
  }
  el.innerHTML = students.map((s, i) => `
    <div class="perf-item">
      <span class="perf-rank">#${i + 1}</span>
      <span class="perf-name">${s.name || s.regno}</span>
      ${showScore ? '<span class="perf-score">' + (s.percentage != null ? (s.percentage > 1 ? s.percentage.toFixed(1) : (s.percentage * 100).toFixed(1)) + '%' : '—') + '</span>' : ''}
    </div>
  `).join('');
}

function renderAbsentList(containerId, students) {
  const el = document.getElementById(containerId);
  if (!students || students.length === 0) {
    el.innerHTML = '<div class="perf-empty">No absentees</div>';
    return;
  }
  el.innerHTML = students.map(s => `
    <div class="perf-item">
      <span class="perf-name">${s.name || s.regno}</span>
      <span class="perf-score" style="color:var(--pw-danger);font-size:12px">Absent</span>
    </div>
  `).join('');
}

// ── UTILITIES ──────────────────────────────────────
function fillSelect(id, items, defaultLabel) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const first = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(first);
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    opt.textContent = item;
    sel.appendChild(opt);
  });
}

function scoreBadge(score) {
  if (score >= 75) return 'status-excellent';
  if (score >= 60) return 'status-good';
  if (score >= 40) return 'status-average';
  return 'status-poor';
}

function scoreLabel(score) {
  if (score >= 75) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Average';
  return 'Needs Work';
}

function esc(s) { return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function togglePass(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }
}

function handleLogout() {
  user = null;
  dashData = null;
  batchesData = [];
  facultyData = [];
  studentsData = [];
  backendVersion = 'unknown';
  localStorage.removeItem('pw_user');
  document.getElementById('loginId').value = '';
  document.getElementById('loginPassword').value = '';
  showScreen('loginScreen');
}

// ── AUTO-LOGIN ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const saved = localStorage.getItem('pw_user');
  if (saved) {
    try {
      user = JSON.parse(saved);
      if (user && user.email) {
        if (!user.level && user.hierarchyLevel) user.level = user.hierarchyLevel;
        initApp(); return;
      }
    } catch (_) {}
    localStorage.removeItem('pw_user');
  }
});
