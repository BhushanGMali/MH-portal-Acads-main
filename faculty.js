// ============================================================
//  faculty.js — Faculty list, filters, and rendering.
//  Depends on: core.js (apiGet, showLoading, hideLoading,
//              fillSelect, user/facultyData/backendVersion)
// ============================================================

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