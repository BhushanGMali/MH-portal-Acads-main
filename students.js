// ============================================================
//  students.js — Student list, filters, rendering, and the
//                student detail view.
//  Depends on: core.js (apiGet, showLoading, hideLoading, esc,
//              fillSelect, navigate, studentsData)
// ============================================================

async function loadStudents() {
  showLoading();
  // Kick off the published-CSV load (attendance included) in parallel; once
  // it arrives, re-render so attendance cells fill in.
  loadData().then(() => {
    if (currentView === 'students' && studentsData.length) applyStudentFilters();
  }).catch(() => {});
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
  tbody.innerHTML = '<tr><td colspan="10"><div class="empty-msg"><p>' + msg + '</p></div></td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-msg"><div class="empty-icon">&#127891;</div><p>No students found</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = list.map((s, i) => {
    const att = attendanceFor(s.regno) || {};
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.name || '—'}</strong></td>
      <td style="font-size:12px;color:var(--pw-text-secondary)">${s.regno}</td>
      <td>${s.batch} <span class="batch-center">(${esc(batchCenterName(s.batch))})</span></td>
      <td class="text-center">${s.tests}</td>
      <td class="text-center">${s.avgScore != null ? '<strong>' + s.avgScore + '%</strong>' : '<span style="color:var(--pw-text-muted)">No tests</span>'}</td>
      <td class="text-center">${attCell(att.d15)}</td>
      <td class="text-center">${attCell(att.overall)}</td>
      <td>${s.bestSubject && s.bestSubject !== '—' ? '<span class="subject-tag ' + s.bestSubject.toLowerCase() + '">' + s.bestSubject + '</span>' : '—'}</td>
      <td><button class="btn-sm btn-view" onclick="viewStudentDetail('${esc(s.regno)}')">View</button></td>
    </tr>
  `; }).join('');
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
      document.getElementById('stuDetailTitle').textContent = 'Student: ' + regno;
      document.getElementById('stuDetailStats').innerHTML = '<div class="empty-msg"><p>Deploy updated backend for student details</p></div>';
    }
  } catch (e) {
    console.error(e);
    document.getElementById('stuDetailTitle').textContent = 'Student: ' + regno;
    document.getElementById('stuDetailStats').innerHTML = '<div class="empty-msg"><p>Deploy updated backend for student details</p></div>';
  }
  hideLoading();
}

function renderStudentDetail(d) {
  const s = d.student;
  document.getElementById('stuDetailTitle').textContent = (s.name || s.regno) + ' — ' + s.batch;
  const att = attendanceFor(s.regno) || {};

  document.getElementById('stuDetailStats').innerHTML = `
    <div class="detail-stat"><div class="ds-value">${s.regno}</div><div class="ds-label">Registration No</div></div>
    <div class="detail-stat"><div class="ds-value">${s.batch}</div><div class="ds-label">Batch</div></div>
    <div class="detail-stat"><div class="ds-value">${s.testsTaken}</div><div class="ds-label">Tests Taken</div></div>
    <div class="detail-stat"><div class="ds-value">${s.avgScore}%</div><div class="ds-label">Avg Score</div></div>
    <div class="detail-stat"><div class="ds-value">${att.d15 != null ? att.d15 + '%' : '—'}</div><div class="ds-label">Att (15 days)</div></div>
    <div class="detail-stat"><div class="ds-value">${att.overall != null ? att.overall + '%' : '—'}</div><div class="ds-label">Att Overall</div></div>
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

  const tbody = document.getElementById('stuDetailTestBody');
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