// ============================================================
//  student.js — STUDENT SEARCH TAB
//  Enter a reg no → full test history with subject-wise marks and
//  a per-test subject % graph. Faculty sees only their own subjects.
//  Percent per subject = subject_marks / userscore * 100.
//  JEE students don't study Zoology/Botany; NEET don't study Maths.
//
//  Depends on: core.js (user, esc, scoreBadge), data.js
// ============================================================

function loadStuView() {
  // Ensure data is loaded so search works immediately
  loadData().catch(() => {});
}

function searchStu() {
  const input = document.getElementById('studentSearchInput');
  const regno = input.value.trim();
  const err = document.getElementById('studentError');
  err.classList.remove('show');
  err.textContent = '';
  const result = document.getElementById('studentResult');
  if (!regno) { err.textContent = 'Enter a reg no'; err.classList.add('show'); return; }

  showLoading();
  loadData().then(() => {
    const detail = getStudentDetail(regno);
    hideLoading();
    if (!detail) {
      result.style.display = 'none';
      err.textContent = 'Student not found: ' + regno;
      err.classList.add('show');
      return;
    }
    result.style.display = 'block';
    renderStuDetail(detail);
  }).catch(() => { hideLoading(); err.textContent = 'Data load failed'; err.classList.add('show'); });
}

function renderStuDetail(detail) {
  // ── Student info ──
  const tests = detail.history.length;
  const avg = tests > 0 ? +(detail.history.reduce((s, t) => s + t.pct, 0) / tests).toFixed(1) : 0;
  const att = attendanceFor(detail.regno) || {};
  document.getElementById('studentDetailStats').innerHTML = `
    <div class="detail-stat"><div class="ds-value">${esc(detail.name || '—')}</div><div class="ds-label">Name</div></div>
    <div class="detail-stat"><div class="ds-value">${esc(detail.regno)}</div><div class="ds-label">Reg No</div></div>
    <div class="detail-stat"><div class="ds-value">${esc(detail.stream || '—')}</div><div class="ds-label">Stream</div></div>
    <div class="detail-stat"><div class="ds-value">${esc(detail.batch || '—')} <span class="batch-center">(${esc(batchCenterName(detail.batch))})</span></div><div class="ds-label">Batch</div></div>
    <div class="detail-stat"><div class="ds-value">${tests}</div><div class="ds-label">Tests</div></div>
    <div class="detail-stat"><div class="ds-value">${avg}%</div><div class="ds-label">Avg %</div></div>
    <div class="detail-stat"><div class="ds-value">${att.d15 != null ? att.d15 : '—'} / ${att.overall != null ? att.overall + '%' : '—'}</div><div class="ds-label">Att (15d/Overall)</div></div>
  `;

  // ── Subject % graph (per test) ──
  renderStuGraph(detail);

  // ── Test history table ──
  const subs = visibleStuSubjects(detail);
  const head = document.getElementById('studentTestHead');
  head.innerHTML = '<tr><th>Date</th><th>Type</th>' +
    subs.map(s => '<th class="text-center">' + SUBJ_LABELS[s] + '</th>').join('') +
    '<th class="text-center">Total</th><th class="text-center">Score</th><th class="text-center">%</th><th class="text-center">Rank</th></tr>';

  const body = document.getElementById('studentTestBody');
  body.innerHTML = detail.history.map(t => `
    <tr>
      <td>${esc(t.date)}</td>
      <td>${esc(t.type)}</td>
      ${subs.map(s => `<td class="text-center">${t.subjects[s] !== 0 ? t.subjects[s] : '—'}</td>`).join('')}
      <td class="text-center">${t.total}</td>
      <td class="text-center">${t.score}</td>
      <td class="text-center"><span class="status-badge ${scoreBadge(t.pct)}">${t.pct}%</span></td>
      <td class="text-center">${t.rank || '—'}</td>
    </tr>
  `).join('') || '<tr><td colspan="' + (6 + subs.length) + '" class="empty-msg"><p>No tests</p></td></tr>';
}

// Subjects to show for a student: their stream subjects, but Faculty
// only sees their own subjects.
function visibleStuSubjects(detail) {
  let subs = detail.subjects;
  if (user.level < 2) {
    const own = facultySubjects(user.email);
    if (own.length) subs = subs.filter(s => own.includes(s));
  }
  return subs;
}

// Subject colors — distinct colors so each subject line is clear
// (NEET shows exactly 4: Phy/Chem/Zoo/Bot; JEE shows 3: Phy/Chem/Maths)
const SUBJ_COLORS = { physics: '#F43F5E', chemistry: '#A78BFA', maths: '#60A5FA', zoology: '#4ADE80', botany: '#FBBF24' };

// Current chart data for hover tooltips
let stuChartData = null;

function renderStuGraph(detail) {
  const wrap = document.getElementById('studentSubjectGraph');
  const history = detail.history;
  if (!history.length) { wrap.innerHTML = '<div class="empty-msg"><p>No tests</p></div>'; return; }

  const subs = visibleStuSubjects(detail); // JEE → 3, NEET → 4, Faculty → own only
  stuChartData = { history, subjects: subs };

  // percent per subject per test = subject_marks / userscore * 100
  const pctOf = (t, s) => t.score > 0 ? +((t.subjects[s] / t.score) * 100).toFixed(1) : 0;

  const W = 1000, H = 220, PL = 46, PR = 30, PT = 16, PB = 36;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const n = history.length;
  const x = i => PL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = v => PT + plotH - (v / 100) * plotH; // y-axis is 0-100%

  // One line per subject
  const lines = subs.map(s => {
    const path = history.map((t, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(pctOf(t, s)).toFixed(1)).join(' ');
    const points = history.map((t, i) =>
      `<circle cx="${x(i)}" cy="${y(pctOf(t, s))}" r="3.5" fill="${SUBJ_COLORS[s]}" stroke="#0b0b0f" stroke-width="1"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${SUBJ_COLORS[s]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points}`;
  }).join('');

  // Y-axis gridlines (0,25,50,75,100)
  const gridlines = [0, 25, 50, 75, 100].map(v => {
    const yy = y(v);
    return `<line x1="${PL}" y1="${yy}" x2="${W - PR}" y2="${yy}" stroke="rgba(255,255,255,0.08)"/>
      <text x="${PL - 8}" y="${yy + 4}" text-anchor="end" class="chart-label">${v}</text>`;
  }).join('');

  // X-axis labels (test dates)
  const xLabels = history.map((t, i) =>
    `<text x="${x(i)}" y="${H - 18}" text-anchor="middle" class="chart-label">${esc(String(t.date).replace(/, \d{4}/, ''))}</text>`).join('');

  // Hover bands (one per test) + legend
  const bandW = n === 1 ? plotW : plotW / n;
  const bands = history.map((t, i) =>
    `<rect x="${x(i) - bandW / 2}" y="${PT}" width="${bandW}" height="${plotH}" fill="transparent"
      onmousemove="moveStuTooltip(event)" onmouseover="showStuTooltip(${i})" onmouseout="hideStuTooltip()"/>`).join('');

  wrap.innerHTML = `
    <div class="graph-title">Subject % of score per test — <strong>${esc(detail.name || detail.regno)}</strong> (hover a point)</div>
    <div class="chart-wrap">
      <svg viewBox="0 0 ${W} ${H}" class="line-chart" preserveAspectRatio="xMidYMid meet">
        ${gridlines}
        <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="rgba(255,255,255,0.15)"/>
        <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="rgba(255,255,255,0.15)"/>
        ${lines}
        ${xLabels}
        ${bands}
      </svg>
      <div class="chart-legend">
        ${subs.map(s => `<span><i class="legend-dot" style="background:${SUBJ_COLORS[s]}"></i> ${SUBJ_LABELS[s]}</span>`).join('')}
      </div>
      <div class="chart-tooltip" id="stuChartTooltip"></div>
    </div>
  `;
}

function showStuTooltip(i) {
  const d = stuChartData;
  if (!d || !d.history[i]) return;
  const t = d.history[i];
  const tooltip = document.getElementById('stuChartTooltip');
  const pctOf = (s) => t.score > 0 ? +((t.subjects[s] / t.score) * 100).toFixed(1) : 0;
  tooltip.innerHTML =
    `<div class="tt-date">${esc(t.date)}</div>` +
    `<div class="tt-score">Score: <strong>${t.score}</strong> / ${t.total} (${t.pct}%)</div>` +
    d.subjects.map(s =>
      `<div class="tt-subj"><span class="tt-dot" style="background:${SUBJ_COLORS[s]}"></span>${SUBJ_LABELS[s]}: ${t.subjects[s]} marks (${pctOf(s)}%)</div>`).join('');
  tooltip.style.display = 'block';
}
function moveStuTooltip(evt) {
  const tooltip = document.getElementById('stuChartTooltip');
  const wrap = tooltip.closest('.chart-wrap');
  const rect = wrap.getBoundingClientRect();
  let left = evt.clientX - rect.left + 14;
  let top = evt.clientY - rect.top - 10;
  if (left + tooltip.offsetWidth > rect.width) left = evt.clientX - rect.left - tooltip.offsetWidth - 14;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}
function hideStuTooltip() {
  const tooltip = document.getElementById('stuChartTooltip');
  if (tooltip) tooltip.style.display = 'none';
}