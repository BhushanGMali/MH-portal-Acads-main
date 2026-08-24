// ============================================================
//  data.js — PUBLISHED-CSV DATA LAYER
//  Fetches the three published Google-Sheets CSVs directly in the
//  browser (no Apps Script backend for data), parses them, caches
//  them, and computes everything the unified Home view needs:
//  KPIs, toppers/bottom students, best/bottom batches, and the
//  per-subject average graph.
//
//  Depends on: core.js (user state)
//  Load AFTER core.js, BEFORE home.js
// ============================================================

const CSV_URLS = {
  tests:    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQS5o-ytwI__9eubWvffSsHeCLSiV6ED9kaLa5tYWuoS7CIdfdEhZxMarJVBCT66DaP5JBwuYs_A77a/pub?output=csv&gid=475005675',
  fbm:      'https://docs.google.com/spreadsheets/d/e/2PACX-1vQS5o-ytwI__9eubWvffSsHeCLSiV6ED9kaLa5tYWuoS7CIdfdEhZxMarJVBCT66DaP5JBwuYs_A77a/pub?output=csv&gid=0',
  students: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQS5o-ytwI__9eubWvffSsHeCLSiV6ED9kaLa5tYWuoS7CIdfdEhZxMarJVBCT66DaP5JBwuYs_A77a/pub?gid=93108683&single=true&output=csv',
  attendance: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQS5o-ytwI__9eubWvffSsHeCLSiV6ED9kaLa5tYWuoS7CIdfdEhZxMarJVBCT66DaP5JBwuYs_A77a/pub?gid=918061882&single=true&output=csv'
};

// Subject columns in the Test Result CSV (0-indexed)
const SUBJ_COLS = { physics: 14, chemistry: 15, maths: 16, zoology: 17, botany: 18 };
const SUBJ_NAMES = ['physics', 'chemistry', 'maths', 'zoology', 'botany'];
const SUBJ_LABELS = { physics: 'Physics', chemistry: 'Chemistry', maths: 'Maths', zoology: 'Zoology', botany: 'Botany' };

// ── STATE ────────────────────────────────────────────
let DATA = { tests: [], fbm: [], students: [], attendance: [], loaded: false, loading: false };

// ── CSV PARSER (handles quoted fields, commas, escaped quotes) ──
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip CR */ }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Convert parsed rows (first row = header) into array of objects.
function rowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => String(h).trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === '') continue; // skip blank lines
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = (r[j] !== undefined ? r[j] : '');
    out.push(obj);
  }
  return out;
}

async function fetchCSV(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('CSV fetch failed: HTTP ' + res.status);
  return rowsToObjects(parseCSV(await res.text()));
}

// Load all three CSVs once, then cache. Returns a promise.
function loadData(force) {
  if (DATA.loaded && !force) return Promise.resolve(DATA);
  if (DATA.loading) return DATA.loading;
  DATA.loading = (async () => {
    const [tests, fbm, students, attendance] = await Promise.all([
      fetchCSV(CSV_URLS.tests),
      fetchCSV(CSV_URLS.fbm),
      fetchCSV(CSV_URLS.students),
      // Attendance sheet is optional — if it fails, the portal still works
      // (attendance cells just show "—").
      fetchCSV(CSV_URLS.attendance).catch(() => [])
    ]);
    DATA.tests = tests;
    DATA.fbm = fbm;
    DATA.students = students;
    DATA.attendance = attendance;
    DATA.loaded = true;
    DATA.loading = false;
    // Invalidate derived caches so a forced reload picks up fresh data.
    _batchCenterMap = null;
    _attMap = null;
    return DATA;
  })();
  return DATA.loading;
}

// ── PARSING HELPERS ──────────────────────────────────
// markspercent arrives as "48.00%" (string with %). Return number.
function parsePct(s) {
  const n = parseFloat(String(s).replace('%', '').trim());
  return isNaN(n) ? 0 : n;
}
function parseNum(s) {
  const n = parseFloat(String(s).trim());
  return isNaN(n) ? 0 : n;
}
// _date arrives as "9 Aug, 2026". Date inputs arrive as "2026-08-09".
// Return a Date or null.
function parseTestDate(s) {
  const str = String(s).trim();
  if (!str) return null;
  // ISO "YYYY-MM-DD" (from <input type="date">)
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // "9 Aug, 2026"
  const m = str.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if (!m) return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mon = months[m[2].slice(0, 3)];
  if (mon === undefined) return null;
  return new Date(+m[3], mon, +m[1]);
}

// ── ROLE / CENTER SCOPING ────────────────────────────
// Centers the current user is allowed to see.
function accessibleCenters() {
  if (user.level >= 5) return allCenters();
  const centers = user.centers && user.centers.length ? user.centers
    : (user.center ? user.center.split(',').map(s => s.trim()).filter(Boolean) : []);
  return centers;
}

function allCenters() {
  const set = new Set();
  DATA.fbm.forEach(r => { if (r.Center) set.add(r.Center); });
  return [...set];
}

// Subjects a Faculty teaches (mapped to Test Result columns).
function facultySubjects(email) {
  const subs = new Set();
  DATA.fbm.forEach(r => {
    if (r.MailID && r.MailID.trim().toLowerCase() === String(email).toLowerCase()) {
      const s = r.Subject;
      if (SUBJ_LABELS[s.toLowerCase()]) subs.add(s.toLowerCase());
    }
  });
  return [...subs];
}

// Batches a Faculty teaches (from FBM MailID).
function facultyBatches(email) {
  const set = new Set();
  const e = String(email || '').toLowerCase();
  DATA.fbm.forEach(r => {
    if (r.MailID && r.Batch && r.MailID.trim().toLowerCase() === e) set.add(r.Batch);
  });
  return [...set];
}

// Streams a Faculty teaches — streams of students enrolled in their batches.
function facultyStreams(email) {
  const batches = new Set(facultyBatches(email));
  const streams = new Set();
  DATA.students.forEach(r => {
    if (r.batch && batches.has(r.batch) && r.class_course) streams.add(normStream(r.class_course));
  });
  return [...streams];
}

// Subjects a student studies, based on their stream.
// NEET → no Maths; JEE & Foundation → no Zoology/Botany.
function streamSubjects(stream) {
  const s = String(stream || '');
  if (s.includes('NEET')) return ['physics', 'chemistry', 'zoology', 'botany'];
  return ['physics', 'chemistry', 'maths'];
}

// Normalize a class/stream string so "12th NEET" matches "12 NEET".
function normStream(s) {
  return String(s || '').replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1').trim();
}

// Center name for a batch (from FBM). Returns '' if unknown.
// Cached map so rendering thousands of rows stays fast.
let _batchCenterMap = null;
function batchCenterName(batch) {
  if (!batch) return '';
  if (!_batchCenterMap) {
    _batchCenterMap = {};
    DATA.fbm.forEach(r => { if (r.Batch && !_batchCenterMap[r.Batch]) _batchCenterMap[r.Batch] = r.Center || ''; });
  }
  return _batchCenterMap[batch] || '';
}

// ── ATTENDANCE (regno → last-15-days % and overall %) ──
// Source: published Attendance CSV (columns: reg_no, att % in last 15 days,
// att % overall). Joined by reg_no at render time.
let _attMap = null;
function attendanceMap() {
  if (_attMap) return _attMap;
  _attMap = {};
  const rows = DATA.attendance || [];
  if (!rows.length) return _attMap;
  // Detect column keys from the header row (robust to renames/reorders).
  const keys = Object.keys(rows[0]);
  const regKey = keys.find(k => /reg/i.test(k)) || keys[0];
  const d15Key = keys.find(k => /15/.test(k)) || keys[1];
  const overallKey = keys.find(k => /overall/i.test(k)) || keys[2];
  for (const r of rows) {
    const reg = String(r[regKey] == null ? '' : r[regKey]).trim();
    if (!reg) continue;
    const raw15 = String(r[d15Key] == null ? '' : r[d15Key]).trim();
    const rawAll = String(r[overallKey] == null ? '' : r[overallKey]).trim();
    _attMap[reg] = {
      d15: raw15 === '' ? null : parseNum(raw15),
      overall: rawAll === '' ? null : parseNum(rawAll)
    };
  }
  return _attMap;
}

// Attendance for one student by regno → { d15, overall } or null.
function attendanceFor(regno) {
  return attendanceMap()[String(regno == null ? '' : regno).trim()] || null;
}

// Formatted attendance cell for tables ('—' when unknown).
function attCell(v) {
  return (v == null || isNaN(v))
    ? '<span style="color:var(--pw-text-muted)">—</span>'
    : '<span class="status-badge ' + scoreBadge(v) + '">' + v + '%</span>';
}

// ── HOME COMPUTATION ─────────────────────────────────
// filters: { centers:[], stream:'', batch:'', faculty:'', dateFrom:'', dateTo:'' }
// Returns KPIs, toppers, bottom, best/bottom batch, subject graph,
// and the filter option lists.
function computeHome(filters) {
  const centers = filters.centers && filters.centers.length ? filters.centers : allCenters();
  const centerSet = new Set(centers);

  // Faculty role (level <= 1): they may ONLY see their own batches.
  const roleBatches = (user.level <= 1) ? new Set(facultyBatches(user.email)) : null;

  // faculty (filter) → batches map from FBM.
  const facultyBatchMap = {};
  DATA.fbm.forEach(r => {
    if (r.MailID && r.Batch) {
      const key = r.MailID.trim().toLowerCase();
      if (!facultyBatchMap[key]) facultyBatchMap[key] = new Set();
      facultyBatchMap[key].add(r.Batch);
    }
  });

  // 1) batch → center mapping from FBM (ONLY for center scoping).
  //    FBM is NOT used for batch/student counts — only to know which
  //    faculty teaches which subject in which batch.
  const batchCenter = {};
  DATA.fbm.forEach(r => { if (r.Batch && !batchCenter[r.Batch]) batchCenter[r.Batch] = r.Center; });

  // 2) Accessible batches + students come from the STUDENTS sheet.
  //    Batch count and student count are driven by enrolled students.
  //    Stream + batch + faculty filters apply here too (so KPIs/absent
  //    respect them). centerBatches = center-scope only, for option lists.
  const studentBatch = {};
  const accBatches = new Set();
  const centerBatches = new Set();
  const accStudents = new Set();
  DATA.students.forEach(r => {
    const reg = r.regno, b = r.batch;
    if (!reg) return;
    studentBatch[reg] = b;
    if (b && centerSet.has(batchCenter[b])) {
      if (roleBatches && !roleBatches.has(b)) return; // faculty: own batches only
      centerBatches.add(b);
      const fb = filters.faculty ? facultyBatchMap[String(filters.faculty).toLowerCase()] : null;
      if (filters.faculty && (!fb || !fb.has(b))) return;
      if (filters.stream && normStream(r.class_course) !== filters.stream) return;
      if (filters.batch && b !== filters.batch) return;
      accBatches.add(b);
      accStudents.add(reg);
    }
  });

  // 3) Faculty in scope
  const accFaculty = new Set();
  DATA.fbm.forEach(r => {
    if (accBatches.has(r.Batch) && r.MailID) {
      const mail = r.MailID.trim();
      if (roleBatches && mail.toLowerCase() !== String(user.email).toLowerCase()) return;
      accFaculty.add(mail);
    }
  });

  // 4) Filter tests by scope + stream + batch + date range
  const dateFrom = filters.dateFrom ? parseTestDate(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? parseTestDate(filters.dateTo) : null;
  const filteredTests = [];
  const batchTestDates = {}; // To compute total tests in batch
  
  for (const t of DATA.tests) {
    if (!accStudents.has(t.reg_no)) continue;
    if (filters.stream && t.stream !== filters.stream) continue;
    if (filters.batch && t.current_batch !== filters.batch) continue;
    if (dateFrom || dateTo) {
      const d = parseTestDate(t._date);
      if (!d) continue;
      if (dateFrom && d < dateFrom) continue;
      if (dateTo && d > dateTo) continue;
    }
    filteredTests.push(t);
    
    // Add to batchTestDates
    if (t.current_batch && t._date) {
        if (!batchTestDates[t.current_batch]) {
            batchTestDates[t.current_batch] = new Set();
        }
        batchTestDates[t.current_batch].add(t._date);
    }
  }

  // 5) Per-student aggregation (avg % + latest test for subject marks + userscore)
  const stuAgg = {};
  for (const t of filteredTests) {
    const pct = parsePct(t.markspercent);
    const uScore = parseNum(t.userscore); // Added userscore logic
    if (pct <= 0) continue;
    if (!stuAgg[t.reg_no]) stuAgg[t.reg_no] = { total: 0, totalUserScore: 0, count: 0, latest: t };
    stuAgg[t.reg_no].total += pct;
    stuAgg[t.reg_no].totalUserScore += uScore;
    stuAgg[t.reg_no].count++;
    stuAgg[t.reg_no].latest = t;
  }

  const studentList = Object.keys(stuAgg).map(reg => {
    const a = stuAgg[reg];
    const lt = a.latest;
    const b = String(lt.current_batch || '').trim();
    const att = attendanceFor(reg);
    return {
      regno: reg,
      name: String(lt.student_name || '').trim(),
      stream: String(lt.stream || '').trim(),
      batch: b,
      avg: +(a.total / a.count).toFixed(1),
      avgUserScore: +(a.totalUserScore / a.count).toFixed(1), // Added avg userscore
      testCount: a.count,
      batchTotalTests: batchTestDates[b] ? batchTestDates[b].size : 0, // Added batch tests
      att15: att ? att.d15 : null,
      attOverall: att ? att.overall : null,
      physics: parseNum(lt.physics_marks),
      chemistry: parseNum(lt.chemistry_marks),
      maths: parseNum(lt.maths_marks),
      zoology: parseNum(lt.zoology_marks),
      botany: parseNum(lt.botany_marks)
    };
  });
  studentList.sort((a, b) => b.avg - a.avg);

  // 6) Per-batch aggregation
  const batchAgg = {};
  for (const t of filteredTests) {
    const pct = parsePct(t.markspercent);
    if (pct <= 0) continue;
    const b = t.current_batch;
    if (!b) continue;
    if (!batchAgg[b]) batchAgg[b] = { total: 0, count: 0 };
    batchAgg[b].total += pct;
    batchAgg[b].count++;
  }
  const batchList = Object.keys(batchAgg).map(b => ({
    batch: b,
    avg: +(batchAgg[b].total / batchAgg[b].count).toFixed(1)
  })).sort((a, b) => b.avg - a.avg);

  // Top 3 students of a given batch (by avg %)
  function topStudentsOf(batch, n) {
    return studentList.filter(s => s.batch === batch).slice(0, n);
  }

  // 7) Subject averages for a batch (default = best batch)
  function subjectAverages(batch) {
    const sums = { physics: 0, chemistry: 0, maths: 0, zoology: 0, botany: 0 };
    const counts = { physics: 0, chemistry: 0, maths: 0, zoology: 0, botany: 0 };
    for (const t of filteredTests) {
      if (t.current_batch !== batch) continue;
      for (const s of SUBJ_NAMES) {
        const v = parseNum(t[SUBJ_LABELS[s].toLowerCase() + '_marks']);
        if (v > 0) { sums[s] += v; counts[s]++; }
      }
    }
    return SUBJ_NAMES.map(s => ({
      subject: SUBJ_LABELS[s],
      avg: counts[s] > 0 ? +(sums[s] / counts[s]).toFixed(1) : 0,
      count: counts[s]
    }));
  }

  // 8) KPIs
  const totalPct = filteredTests.reduce((s, t) => s + parsePct(t.markspercent), 0);
  const scoredTests = filteredTests.filter(t => parsePct(t.markspercent) > 0).length;
  const totalStudents = accStudents.size; // already respects center/stream/batch filters
  const avgScore = scoredTests > 0 ? +(totalPct / scoredTests).toFixed(1) : 0;

  // 9) Average students — within ±5% of the overall average score
  const avgLo = avgScore - 5, avgHi = avgScore + 5;
  const avgStudents = studentList.filter(s => s.avg >= avgLo && s.avg <= avgHi).length;

  // 10) Absent students — students who gave NO test in the current scope.
  //     Blank date range → never gave a single paper (ever).
  //     Date range set → gave no paper within that range.
  //     Name/stream come from the STUDENTS sheet (student_name, class_course).
  // (We use a secondary loop for absence because we need all tests of the batch, not just those where student scored > 0)
  const batchTestDatesFull = {};
  const studentTestDates = {};
  const studentInfo = {};
  for (const s of DATA.students) {
    if (s.regno && !studentInfo[s.regno]) {
      studentInfo[s.regno] = { name: String(s.student_name || '').trim(), stream: String(s.class_course || '').trim() };
    }
  }
  for (const t of DATA.tests) {
    if (dateFrom || dateTo) {
      const d = parseTestDate(t._date);
      if (!d) continue;
      if (dateFrom && d < dateFrom) continue;
      if (dateTo && d > dateTo) continue;
    }
    const b = t.current_batch;
    if (b) { if (!batchTestDatesFull[b]) batchTestDatesFull[b] = new Set(); batchTestDatesFull[b].add(t._date); }
    if (t.reg_no) {
      if (!studentTestDates[t.reg_no]) studentTestDates[t.reg_no] = new Set();
      studentTestDates[t.reg_no].add(t._date);
    }
  }
  const absentStudents = [];
  for (const reg of accStudents) {
    const b = studentBatch[reg];
    // Only consider students whose batch actually had a test in scope
    // (avoids listing brand-new batches that never had a paper).
    const batchDates = batchTestDatesFull[b];
    if (!batchDates || batchDates.size === 0) continue;
    // Absent = gave NO test in scope.
    const stuDates = studentTestDates[reg];
    if (stuDates && stuDates.size > 0) continue;
    // Count of batch tests the student missed (they gave none, so all of them).
    let missed = 0;
    for (const d of batchDates) if (!stuDates || !stuDates.has(d)) missed++;
    const info = studentInfo[reg] || {};
    absentStudents.push({ regno: reg, name: info.name || '', stream: info.stream || '', batch: b, papers: 0, missed });
  }
  absentStudents.sort((a, b) => b.missed - a.missed || (a.batch || '').localeCompare(b.batch || ''));

  const bestBatch = batchList[0] || null;
  const bottomBatch = batchList[batchList.length - 1] || null;
  const graphBatch = filters.batch || (bestBatch ? bestBatch.batch : null);

  // Top / bottom students: full sorted lists (desc / asc by avg %).
  // The UI slices these to a user-chosen N (default 10).
  let toppers = [], bottom = [];
  if (studentList.length > 0) {
    toppers = studentList.slice();
    bottom = studentList.slice().reverse();
  }

  // 11) Batch subject-wise % per test (like the student graph)
  function batchSubjectGraphData(batch) {
    const perTest = {};
    const hasSubj = {};
    for (const t of filteredTests) {
      if (t.current_batch !== batch) continue;
      const d = t._date;
      if (!perTest[d]) perTest[d] = { scoreSum: 0, count: 0, subjPctSum: {} };
      const sc = parseNum(t.userscore);
      perTest[d].scoreSum += sc;
      if (sc > 0) {
        perTest[d].count++;
        for (const s of SUBJ_NAMES) {
          const v = parseNum(t[s + '_marks']);
          if (v > 0) { perTest[d].subjPctSum[s] = (perTest[d].subjPctSum[s] || 0) + (v / sc) * 100; hasSubj[s] = true; }
        }
      }
    }
    // Only subjects that actually appear in this batch's tests
    // (a NEET batch has no Maths, so no flat 0% line).
    const subs = SUBJ_NAMES.filter(s => hasSubj[s]);
    const dates = Object.keys(perTest).sort((a, b) => (parseTestDate(a) || 0) - (parseTestDate(b) || 0));
    return dates.map(date => {
      const d = perTest[date];
      const subjects = {};
      for (const s of subs) {
        // Average of per-student subject % (subject_marks/userscore*100)
        subjects[s] = d.count > 0 ? +((d.subjPctSum[s] || 0) / d.count).toFixed(1) : 0;
      }
      // Score shown in the tooltip = average userscore of the test
      const avgScore = d.count > 0 ? Math.round(d.scoreSum / d.count) : d.scoreSum;
      return { date, score: avgScore, subjects };
    });
  }

  // Faculty option list — scoped to the selected centers (+ role), NOT to
  // the stream/batch/faculty filters (so selecting a stream can't empty it).
  const facOptions = new Set();
  DATA.fbm.forEach(r => {
    if (!r.MailID || !r.Batch) return;
    if (!centerBatches.has(r.Batch)) return;
    facOptions.add(r.MailID.trim());
  });

  // Stream option list — scoped to the selected centers (+ role).
  const streamSet = new Set();
  for (const t of DATA.tests) {
    if (t.current_batch && centerBatches.has(t.current_batch) && t.stream) {
      streamSet.add(normStream(t.stream));
    }
  }

  // 12) Per-batch subject-wise average % (subject_marks / userscore * 100),
  //     averaged across every test in the batch. Includes overall avg + center.
  const batchSubjAgg = {};
  for (const t of filteredTests) {
    const b = t.current_batch;
    if (!b) continue;
    const score = parseNum(t.userscore);
    if (score <= 0) continue;
    if (!batchSubjAgg[b]) batchSubjAgg[b] = { sums: { physics: 0, chemistry: 0, maths: 0, zoology: 0, botany: 0 }, count: 0 };
    const agg = batchSubjAgg[b];
    agg.count++;
    for (const s of SUBJ_NAMES) {
      const m = parseNum(t[s + '_marks']);
      agg.sums[s] += (m / score) * 100;
    }
  }
  const batchSubjectAvg = Object.keys(batchSubjAgg).map(b => {
    const agg = batchSubjAgg[b];
    const subjects = {};
    for (const s of SUBJ_NAMES) subjects[s] = agg.count ? +((agg.sums[s] / agg.count)).toFixed(1) : 0;
    return {
      batch: b,
      center: batchCenterName(b),
      avg: batchAgg[b] ? +(batchAgg[b].total / batchAgg[b].count).toFixed(1) : 0,
      physics: subjects.physics, chemistry: subjects.chemistry, maths: subjects.maths,
      zoology: subjects.zoology, botany: subjects.botany
    };
  });
  batchSubjectAvg.sort((a, b) => b.avg - a.avg);

  return {
    kpis: {
      centers: centers,
      totalBatches: filters.batch ? 1 : accBatches.size,
      totalStudents: totalStudents,
      totalFaculty: accFaculty.size,
      avgScore: avgScore,
      avgStudents: avgStudents,
      absentStudents: absentStudents.length
    },
    toppers: toppers,
    bottom: bottom,
    bestBatch: bestBatch ? { ...bestBatch, topStudents: topStudentsOf(bestBatch.batch, 3) } : null,
    bottomBatch: bottomBatch ? { ...bottomBatch, topStudents: topStudentsOf(bottomBatch.batch, 3) } : null,
    subjectGraph: graphBatch ? { batch: graphBatch, subjects: subjectAverages(graphBatch) } : null,
    batchSubjectGraph: graphBatch ? { batch: graphBatch, history: batchSubjectGraphData(graphBatch) } : null,
    absentStudents: absentStudents,
    batchSubjectAvg: batchSubjectAvg,
    filterOptions: {
      centers: allCenters(),
      streams: [...streamSet].sort(),
      batches: [...accBatches].sort(),
      faculty: [...facOptions].sort()
    }
  };
}

// ── STUDENT SEARCH (separate tab) ───────────────────
// Returns full test history for a regno, with only the subjects the
// student actually studies (JEE → no Zoo/Bot, NEET → no Maths).
function getStudentDetail(regno) {
  const tests = DATA.tests.filter(t => t.reg_no === regno);
  if (tests.length === 0) return null;
  const first = tests[0];
  const stream = String(first.stream || '').trim();
  const subjects = streamSubjects(stream);
  const history = tests.map(t => {
    const row = {
      date: String(t._date || '').trim(),
      type: String(t._type || '').trim(),
      pattern: String(t._pattern || '').trim(),
      series: String(t.series || '').trim(),
      total: parseNum(t.totalmarks),
      score: parseNum(t.userscore),
      pct: parsePct(t.markspercent),
      rank: t._rank || null,
      subjects: {}
    };
    for (const s of subjects) row.subjects[s] = parseNum(t[s + '_marks']);
    return row;
  });
  history.sort((a, b) => (parseTestDate(a.date) || 0) - (parseTestDate(b.date) || 0));
  return {
    regno: regno,
    name: String(first.student_name || '').trim(),
    stream: stream,
    batch: String(first.current_batch || '').trim(),
    subjects: subjects,
    history: history
  };
}