// ============================================================
//  perf.js — Shared performance list renderers (toppers,
//            average, bottom, absentees).
//  Depends on: core.js (no direct deps, uses DOM only)
// ============================================================

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

