// ============================================================
//  home.js — UNIFIED HOME VIEW
//  Renders the single Home screen: filter panel, KPI cards,
//  topper/bottom students, best/bottom batches, and the
//  per-subject average graph. All data comes from published CSVs
//  via data.js (no backend data calls).
//
//  Depends on: core.js (user, showLoading, hideLoading, esc),
//              data.js (loadData, computeHome, accessibleCenters)
// ============================================================

let homeFilters = { centers: [], stream: '', batch: '', faculty: '', dateFrom: '', dateTo: '' };
let lastHomeResult = null; // last computeHome result (for table downloads)

// ── LOAD + RENDER ───────────────────────────────────
async function loadHome() {
  showLoading();
  try {
    await loadData();
    // Default center selection based on role
    if (homeFilters.centers.length === 0) {
      homeFilters.centers = accessibleCenters();
      // Faculty: auto-select their single batch/stream (if only one)
      if (user.level <= 1) {
        const batches = facultyBatches(user.email);
        const streams = facultyStreams(user.email);
        if (batches.length === 1) homeFilters.batch = batches[0];
        if (streams.length === 1) homeFilters.stream = streams[0];
      }
    }
    populateHomeFilters();
    renderHome();
  } catch (e) {
    console.error('Home error:', e);
    const el = document.getElementById('homeError');
    if (el) { el.textContent = 'Data load failed: ' + e.message; el.classList.add('show'); }
  }
  hideLoading();
}

function populateHomeFilters() {
  // Center dropdown (role-scoped)
  const centers = accessibleCenters();
  fillSelect('homeFilterCenter', centers, 'All Centers');
  const centerSel = document.getElementById('homeFilterCenter');
  // If exactly one accessible center, default to it
  if (centers.length === 1) {
    centerSel.value = centers[0];
    homeFilters.centers = centers;
  }
  // Faculty role: lock the center to their own center
  if (user.level <= 1) centerSel.disabled = true;

  // Stream/class dropdown — populated after compute (needs all streams)
  // Batch dropdown — populated after compute
  // Faculty dropdown — populated after compute
}

function renderHome() {
  const result = computeHome(homeFilters);
  lastHomeResult = result;

  // ── Filters: streams + batches + faculty (from result) ──
  fillSelect('homeFilterStream', result.filterOptions.streams, 'All Classes');
  fillSelect('homeFilterBatch', result.filterOptions.batches, 'All Batches');
  fillSelect('homeFilterFaculty', result.filterOptions.faculty, 'All Faculty');
  if (homeFilters.stream) document.getElementById('homeFilterStream').value = homeFilters.stream;
  if (homeFilters.batch) document.getElementById('homeFilterBatch').value = homeFilters.batch;
  if (homeFilters.faculty) document.getElementById('homeFilterFaculty').value = homeFilters.faculty;

  // ── KPI cards ──
  const k = result.kpis;
  document.getElementById('homeKpiCenter').textContent = k.centers.length === 1 ? k.centers[0] : (k.centers.length + ' Centers');
  document.getElementById('homeKpiBatches').textContent = k.totalBatches.toLocaleString();
  document.getElementById('homeKpiStudents').textContent = k.totalStudents.toLocaleString();
  document.getElementById('homeKpiFaculty').textContent = k.totalFaculty.toLocaleString();
  document.getElementById('homeKpiAvg').textContent = k.avgScore + '%';
  document.getElementById('homeKpiAvgStudents').textContent = (k.avgStudents || 0).toLocaleString();
  document.getElementById('homeKpiAbsent').textContent = (k.absentStudents || 0).toLocaleString();
  // Small "% of total students" hint under Average & Absent students
  const totalStu = k.totalStudents || 0;
  const pct = n => totalStu > 0 ? ((n / totalStu) * 100).toFixed(1) + '% of students' : '';
  document.getElementById('homeKpiAvgStudentsPct').textContent = pct(k.avgStudents || 0);
  document.getElementById('homeKpiAbsentPct').textContent = pct(k.absentStudents || 0);

  // ── Toppers ──
  renderStudentTable('homeTopperBody', result.toppers, parseInt(document.getElementById('topperN').value, 10) || 10);
  // ── Bottom ──
  renderStudentTable('homeBottomBody', result.bottom, parseInt(document.getElementById('bottomN').value, 10) || 10);

  // ── Best / Bottom batch ──
  renderBatchCard('homeBestBatch', result.bestBatch, true);
  renderBatchCard('homeBottomBatch', result.bottomBatch, false);

  // ── Absent students ──
  renderAbsentStudents(result.absentStudents);

  // ── Batch-wise subject average ──
  renderBatchAvgTable(result.batchSubjectAvg);

  // ── Subject graph ──
  renderSubjectGraph(result.batchSubjectGraph);

  // ── Fit each scrollable table to exactly 10 rows + header ──
  fitFixedTables();
}

// Set max-height of every .table-scroll--fixed so exactly 10 rows (+ header)
// are visible; the rest scroll vertically. Re-runs on resize so it stays
// correct when the fluid font size changes.
function fitFixedTables() {
  document.querySelectorAll('.table-scroll--fixed').forEach(wrap => {
    const head = wrap.querySelector('thead');
    const row = wrap.querySelector('tbody tr');
    if (!head || !row) return;
    const hh = head.getBoundingClientRect().height;
    const rh = row.getBoundingClientRect().height;
    wrap.style.maxHeight = (hh + rh * 10 + 2) + 'px';
  });
}
window.addEventListener('resize', () => {
  if (typeof currentView === 'undefined' || currentView === 'home') fitFixedTables();
});

function renderAbsentStudents(list) {
  const body = document.getElementById('homeAbsentBody');
  body.innerHTML = (list || []).map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(s.name || '—')}</td>
      <td>${esc(s.regno)}</td>
      <td>${esc(s.stream || '—')}</td>
      <td>${esc(s.batch || '—')}${s.batch ? `<span class="batch-center">(${esc(batchCenterName(s.batch))})</span>` : ''}</td>
      <td class="text-center"><span class="status-badge status-poor">${s.missed}</span></td>
      <td class="text-center">${attCell(s.att15, s.attOverall)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty-msg"><p>No absent students</p></td></tr>';
}

// Batch-wise subject average table (Batch | Center | Avg | Phy | Chem | Math | Zoo | Bot)
function renderBatchAvgTable(list) {
  const body = document.getElementById('homeBatchAvgBody');
  body.innerHTML = (list || []).map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(b.batch)}${b.batch ? `<span class="batch-center">(${esc(b.center)})</span>` : ''}</td>
      <td>${esc(b.center || '—')}</td>
      <td class="text-center"><span class="status-badge ${scoreBadge(b.avg)}">${b.avg}%</span></td>
      <td class="text-center">${b.physics}%</td>
      <td class="text-center">${b.chemistry}%</td>
      <td class="text-center">${b.maths}%</td>
      <td class="text-center">${b.zoology}%</td>
      <td class="text-center">${b.botany}%</td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="empty-msg"><p>No data</p></td></tr>';
}

// Which subject columns to show (Faculty → own subjects only)
function visibleSubjects() {
  if (user.level >= 2) return SUBJ_NAMES;
  const subs = facultySubjects(user.email);
  return subs.length ? subs : SUBJ_NAMES;
}

function renderStudentTable(bodyId, students, n) {
  const subs = visibleSubjects();
  // Dynamic subject header (Faculty sees only own subjects) + Batch Tests & Avg Score
  const head = document.getElementById(bodyId === 'homeTopperBody' ? 'homeTopperHead' : 'homeBottomHead');
  if (head) {
    head.innerHTML = '<tr><th style="width:40px">#</th><th>Name</th><th>Stream</th><th>Batch</th>' +
      '<th class="text-center">Tests (Taken/Total)</th>' +
      '<th class="text-center">Avg Score / %</th>' +
      '<th class="text-center">Att (15d/Overall)</th>' +
      subs.map(s => '<th class="text-center">' + SUBJ_LABELS[s] + '</th>').join('') + '</tr>';
  }
  const body = document.getElementById(bodyId);
  // Show the top/bottom N students (default 10, user-adjustable).
  const rows = (students || []).slice(0, n || 10);
  body.innerHTML = rows.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><div class="stu-name">${esc(s.name || '—')}</div><div class="stu-meta">${esc(s.regno)}</div></td>
      <td>${esc(s.stream || '—')}</td>
      <td>${esc(s.batch || '—')}${s.batch ? `<span class="batch-center">(${esc(batchCenterName(s.batch))})</span>` : ''}</td>
      <td class="text-center">${s.testCount || 0} / ${s.batchTotalTests || 0}</td>
      <td class="text-center"><span class="status-badge ${scoreBadge(s.avg)}">${s.avgUserScore || 0} / ${s.avg}%</span></td>
      <td class="text-center">${attCell(s.att15, s.attOverall)}</td>
      ${subs.map(sub => `<td class="text-center">${s[sub] > 0 ? s[sub] : '—'}</td>`).join('')}
    </tr>
  `).join('') || '<tr><td colspan="' + (7 + subs.length) + '" class="empty-msg"><p>No data</p></td></tr>';
}

// User changed the Top/Bottom N count — re-render just that table.
function onTopNChange(key) {
  const r = lastHomeResult;
  if (!r) return;
  const input = document.getElementById(key === 'topper' ? 'topperN' : 'bottomN');
  let n = parseInt(input.value, 10);
  if (isNaN(n) || n < 1) { n = 10; input.value = 10; }
  renderStudentTable(key === 'topper' ? 'homeTopperBody' : 'homeBottomBody', key === 'topper' ? r.toppers : r.bottom, n);
  fitFixedTables();
}

function renderBatchCard(id, batch, isBest) {
  const el = document.getElementById(id);
  if (!batch) { el.innerHTML = '<div class="empty-msg"><p>No data</p></div>'; return; }
  const badge = isBest ? 'status-excellent' : 'status-poor';
  const label = isBest ? 'Top Batch' : 'Bottom Batch';
  el.innerHTML = `
    <div class="batch-card-head">
      <div>
        <div class="batch-card-name">${esc(batch.batch)} <span class="batch-center">(${esc(batchCenterName(batch.batch))})</span></div>
        <div class="batch-card-label">${label}</div>
      </div>
      <span class="status-badge ${badge}">${batch.avg}%</span>
    </div>
    <div class="batch-card-students">
      ${batch.topStudents.map((s, i) => `
        <div class="batch-stu-row">
          <span class="batch-stu-rank">${i + 1}</span>
          <span class="batch-stu-name">${esc(s.name || '—')}</span>
          <span class="status-badge ${scoreBadge(s.avg)}">${s.avg}%</span>
        </div>
      `).join('') || '<div class="empty-msg"><p>No students</p></div>'}
    </div>
  `;
}

// Current chart data for home subject-graph hover tooltips
let homeChartData = null;

function renderSubjectGraph(graph) {
  const wrap = document.getElementById('homeSubjectGraph');
  if (!graph || !graph.history || !graph.history.length) {
    wrap.innerHTML = '<div class="empty-msg"><p>No data</p></div>';
    return;
  }
  const history = graph.history;
  const subs = visibleSubjects().filter(s => history.some(t => t.subjects && s in t.subjects));
  homeChartData = { history, subjects: subs };

  const W = 1000, H = 220, PL = 46, PR = 30, PT = 16, PB = 36;
  const plotW = W - PL - PR, plotH = H - PT - PB;
  const n = history.length;
  const x = i => PL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = v => PT + plotH - (v / 100) * plotH; // y-axis is 0-100%

  // One line per subject (percent of score per test)
  const lines = subs.map(s => {
    const path = history.map((t, i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(t.subjects[s] || 0).toFixed(1)).join(' ');
    const points = history.map((t, i) =>
      `<circle cx="${x(i)}" cy="${y(t.subjects[s] || 0)}" r="3.5" fill="${SUBJ_COLORS[s]}" stroke="#0b0b0f" stroke-width="1"/>`).join('');
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
      onmousemove="moveHomeTooltip(event)" onmouseover="showHomeTooltip(${i})" onmouseout="hideHomeTooltip()"/>`).join('');

  wrap.innerHTML = `
    <div class="graph-title">Subject % of score per test — <strong>${esc(graph.batch)} <span class="batch-center">(${esc(batchCenterName(graph.batch))})</span></strong> (hover a point)</div>
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
      <div class="chart-tooltip" id="homeChartTooltip"></div>
    </div>
  `;
}

function showHomeTooltip(i) {
  const d = homeChartData;
  if (!d || !d.history[i]) return;
  const t = d.history[i];
  const tooltip = document.getElementById('homeChartTooltip');
  tooltip.innerHTML =
    `<div class="tt-date">${esc(t.date)}</div>` +
    `<div class="tt-score">Score: <strong>${t.score}</strong></div>` +
    d.subjects.map(s =>
      `<div class="tt-subj"><span class="tt-dot" style="background:${SUBJ_COLORS[s]}"></span>${SUBJ_LABELS[s]}: ${t.subjects[s] || 0}%</div>`).join('');
  tooltip.style.display = 'block';
}
function moveHomeTooltip(evt) {
  const tooltip = document.getElementById('homeChartTooltip');
  const wrap = tooltip.closest('.chart-wrap');
  const rect = wrap.getBoundingClientRect();
  let left = evt.clientX - rect.left + 14;
  let top = evt.clientY - rect.top - 10;
  if (left + tooltip.offsetWidth > rect.width) left = evt.clientX - rect.left - tooltip.offsetWidth - 14;
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}
function hideHomeTooltip() {
  const tooltip = document.getElementById('homeChartTooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// ── FILTER HANDLERS ─────────────────────────────────
function onHomeCenterChange() {
  const sel = document.getElementById('homeFilterCenter');
  homeFilters.centers = sel.value ? [sel.value] : accessibleCenters();
  homeFilters.batch = '';
  homeFilters.faculty = '';
  renderHome();
}
function onHomeStreamChange() {
  homeFilters.stream = document.getElementById('homeFilterStream').value;
  homeFilters.batch = '';
  renderHome();
}
function onHomeBatchChange() {
  homeFilters.batch = document.getElementById('homeFilterBatch').value;
  renderHome();
}
function onHomeFacultyChange() {
  homeFilters.faculty = document.getElementById('homeFilterFaculty').value;
  homeFilters.batch = '';
  renderHome();
}
function onHomeDateChange() {
  homeFilters.dateFrom = document.getElementById('homeDateFrom').value;
  homeFilters.dateTo = document.getElementById('homeDateTo').value;
  renderHome();
}
function resetHomeFilters() {
  homeFilters = { centers: accessibleCenters(), stream: '', batch: '', faculty: '', dateFrom: '', dateTo: '' };
  document.getElementById('homeFilterCenter').value = '';
  document.getElementById('homeFilterStream').value = '';
  document.getElementById('homeFilterBatch').value = '';
  document.getElementById('homeFilterFaculty').value = '';
  document.getElementById('homeDateFrom').value = '';
  document.getElementById('homeDateTo').value = '';
  renderHome();
}

// ── TABLE DOWNLOADS (CSV / XLS / PDF) ───────────────
let pendingExport = null;

// Build { title, headers, rows } for a Home table from the last result.
function tableExportData(key) {
  const r = lastHomeResult;
  if (!r) return null;
  if (key === 'topper' || key === 'bottom') {
    const subs = visibleSubjects();
    const isTop = key === 'topper';
    const list = isTop ? r.toppers : r.bottom;
    const n = parseInt(document.getElementById(isTop ? 'topperN' : 'bottomN').value, 10) || 10;
    return {
      title: isTop ? 'Topper Students' : 'Bottom Performing Students',
      // Updated headers for downloads to match UI (merged + attendance columns)
      headers: ['#', 'Name', 'Reg No', 'Stream', 'Batch', 'Tests (Taken/Total)', 'Avg Score / Avg %', 'Att % (15d/Overall)', ...subs.map(s => SUBJ_LABELS[s])],
      rows: list.slice(0, n).map((s, i) => [i + 1, s.name, s.regno, s.stream, s.batch, (s.testCount || 0) + '/' + (s.batchTotalTests || 0), (s.avgUserScore || 0) + ' / ' + s.avg + '%', (s.att15 != null ? s.att15 : '—') + '/' + (s.attOverall != null ? s.attOverall + '%' : '—'), ...subs.map(sub => s[sub] || '')])
    };
  }
  if (key === 'absent') {
    return {
      title: 'Absent Students',
      headers: ['#', 'Name', 'Reg No', 'Stream', 'Batch', 'Papers Not Given', 'Att % (15d/Overall)'],
      rows: r.absentStudents.map((s, i) => [i + 1, s.name, s.regno, s.stream, s.batch, s.missed, (s.att15 != null ? s.att15 : '—') + '/' + (s.attOverall != null ? s.attOverall + '%' : '—')])
    };
  }
  if (key === 'batchAvg') {
    return {
      title: 'Batch-wise Subject Average',
      headers: ['#', 'Batch', 'Center', 'Avg Score %', 'Physics %', 'Chemistry %', 'Maths %', 'Zoology %', 'Botany %'],
      rows: r.batchSubjectAvg.map((b, i) => [i + 1, b.batch, b.center, b.avg + '%', b.physics + '%', b.chemistry + '%', b.maths + '%', b.zoology + '%', b.botany + '%'])
    };
  }
  return null;
}

function showDownloadMenu(btn, key) {
  const data = tableExportData(key);
  if (!data) return;
  pendingExport = data;
  const old = document.getElementById('downloadMenu');
  if (old) old.remove();
  const menu = document.createElement('div');
  menu.id = 'downloadMenu';
  menu.className = 'download-menu';
  menu.innerHTML =
    '<div class="download-menu-title">Download as</div>' +
    '<button type="button" onclick="doDownload(\'csv\')">CSV</button>' +
    '<button type="button" onclick="doDownload(\'xls\')">Excel (XLS)</button>' +
    '<button type="button" onclick="doDownload(\'pdf\')">PDF</button>';
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 170)) + 'px';
  setTimeout(() => document.addEventListener('click', closeDownloadMenu, { once: true }), 0);
}

function closeDownloadMenu() {
  const m = document.getElementById('downloadMenu');
  if (m) m.remove();
}

function doDownload(fmt) {
  const d = pendingExport;
  closeDownloadMenu();
  pendingExport = null;
  if (!d) return;
  const filename = d.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
  if (fmt === 'csv') downloadCSV(filename, d.headers, d.rows);
  else if (fmt === 'xls') downloadXLS(filename, d.headers, d.rows);
  else downloadPDF(filename, d.title, d.headers, d.rows);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map(r => r.map(c => {
    const s = String(c == null ? '' : c);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), filename + '.csv');
}

function downloadXLS(filename, headers, rows) {
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<head><meta charset="utf-8"></head><body><table border="1">' +
    '<tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
    '</table></body></html>';
  triggerDownload(new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' }), filename + '.xls');
}

function downloadPDF(filename, title, headers, rows) {
  const win = window.open('', '_blank');
  if (!win) { alert('Popup blocked — allow popups to download PDF.'); return; }
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
    '<style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}h2{color:#E21B38;margin:0 0 16px;font-size:20px}' +
    'table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left}' +
    'th{background:#f0f0f0;font-weight:700}</style></head><body>' +
    '<h2>' + esc(title) + '</h2>' +
    '<table><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></body></html>'
  );
  win.document.close();
  win.focus();
  win.print();
}