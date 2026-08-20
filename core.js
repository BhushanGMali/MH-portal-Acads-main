// ============================================================
//  PW Maharashtra Region — Faculty Performance Portal
//  core.js — API base, shared state, navigation, API helpers,
//            utilities, and auto-login.
//  Load this file FIRST (before auth/dashboard/batches/faculty/
//  students/perf).
// ============================================================

const API_BASE = 'https://script.google.com/macros/s/AKfycby_nKOz_ZGPiWMwmAYEtseq1oPydueeSOOzMseOtFIGK-cgPUPidoP_8I4dvd5AwENQ/exec';

// ── SHARED STATE ────────────────────────────────────
let user = null;
let dashData = null;
let batchesData = [];
let facultyData = [];
let studentsData = [];
let currentView = 'home';
let currentBatch = null;
let backendVersion = 'unknown'; // 'old' or 'new'

// ── THEME (dark / light) ───────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('pw_theme', theme); } catch (_) {}
}
function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('pw_theme') || 'dark'; } catch (_) {}
  applyTheme(saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── SCREEN NAVIGATION ──────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  // Reset the forgot-password step indicator when the screen reopens
  if (id === 'forgotScreen' && typeof setForgotStep === 'function') setForgotStep(1);
}

// ── HELP / USER GUIDE ──────────────────────────────
function openHelp() {
  document.getElementById('helpModal').style.display = 'flex';
  const body = document.querySelector('.modal-help .help-body');
  if (body) body.scrollTop = 0;
}
function closeHelp() {
  document.getElementById('helpModal').style.display = 'none';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const m = document.getElementById('helpModal');
    if (m && m.style.display === 'flex') closeHelp();
  }
});

// ── NAVIGATION ─────────────────────────────────────
function navigate(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.topnav-link').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-link').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById('view-' + view);
  const navEl = document.querySelector(`.topnav-link[data-view="${view}"]`);
  const mobEl = document.querySelector(`.mobile-nav-link[data-view="${view}"]`);
  if (viewEl) viewEl.classList.add('active');
  if (navEl) navEl.classList.add('active');
  if (mobEl) mobEl.classList.add('active');

  // Load data for the view (render immediately if already loaded)
  if (view === 'home') loadHome();
  if (view === 'student') loadStuView();
  if (view === 'dashboard' && !dashData) loadDashboard();
  if (view === 'batches') {
    if (batchesData.length === 0) loadBatches();
    else { populateBatchFilters(); renderBatches(batchesData); }
  }
  if (view === 'faculty') {
    if (facultyData.length === 0) loadFaculty();
    else { populateFacultyFilters(); renderFaculty(facultyData); }
  }
  if (view === 'students') {
    if (studentsData.length === 0) loadStudents();
    else { populateStudentFilters(); renderStudents(studentsData); }
  }
}

// ── DATA RELOAD ────────────────────────────────────
// Force-refetch the published CSVs and re-render the current view.
async function reloadData() {
  showLoading();
  try {
    if (typeof loadData === 'function') await loadData(true);
    if (currentView === 'home') renderHome();
    else if (currentView === 'student') loadStuView();
    else if (currentView === 'dashboard') loadDashboard();
    else if (currentView === 'batches') loadBatches();
    else if (currentView === 'faculty') loadFaculty();
    else if (currentView === 'students') loadStudents();
  } catch (e) {
    console.error('Reload error:', e);
  }
  hideLoading();
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

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

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

// ── AUTO-LOGIN ─────────────────────────────────────
// Wait for loader.js to inject all HTML partials before booting.
document.addEventListener('pw:html-ready', () => {
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