

const SPREADSHEET_ID = '1d_Z2ZoypN-nnD5ybHLo54JGOnjKj3PKE9ku1ztLj-UU';
const DEFAULT_PASSWORD = 'Acer@1234';
const ADMIN_EMAIL = 'ambikesh.srivastava@pw.live';

const HIERARCHY = {
  'Admin': 7, 'RAH': 6, 'RAOM': 5, 'CH/ACH': 4,
  'JEE Head': 4, 'NEET Head': 4, 'BH': 4, 'AOM': 3, 'Subject Head': 2, 'Faculty': 1
};

// Who approves a signup for each role (next level up)
const APPROVER_MAP = {
  'Faculty': 'AOM',
  'Subject Head': 'AOM',
  'AOM': 'CH/ACH',
  'CH/ACH': 'RAOM',
  'JEE Head': 'RAOM',
  'NEET Head': 'RAOM',
  'RAOM': 'RAH',
  'RAH': 'Admin'
};

// Roles allowed to sign up via the portal
const SIGNUP_ROLES = ['Faculty', 'Subject Head', 'AOM', 'CH/ACH', 'RAOM', 'RAH', 'JEE Head', 'NEET Head', 'BH'];

// ── ROUTER ────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action;
  try {
    switch (action) {
      case 'login':                return handleLogin(e);
      case 'forgotPassword':       return handleForgotPassword(e);
      case 'verifyOTP':            return handleVerifyOTP(e);
      case 'getDashboard':         return handleGetDashboard(e);
      case 'getBatches':           return handleGetBatches(e);
      case 'getBatchDetail':       return handleGetBatchDetail(e);
      case 'getFaculty':           return handleGetFaculty(e);
      case 'getStudents':          return handleGetStudents(e);
      case 'getStudentDetail':     return handleGetStudentDetail(e);
      case 'getSignupOptions':     return handleGetSignupOptions(e);
      case 'signup':               return handleSignup(e);
      case 'approveRequest':       return handleApproveRequest(e);
      case 'rejectRequest':        return handleRejectRequest(e);
      case 'getApprovalStatus':    return handleGetApprovalStatus(e);
      case 'requestCenterChange':  return handleRequestCenterChange(e);
      case 'approveCenterChange':  return handleApproveCenterChange(e);
      case 'rejectCenterChange':   return handleRejectCenterChange(e);
      default:                     return json({ success: false, message: 'Invalid action' });
    }
  } catch (err) {
    return json({ success: false, message: err.toString() });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'resetPassword': return handleResetPassword(data);
      case 'signup':        return handleSignup(data);
      default: return json({ success: false, message: 'Invalid action' });
    }
  } catch (err) {
    return json({ success: false, message: err.toString() });
  }
}

// ── AUTH: FIND USER ───────────────────────────────────────
// Login identity (email OR PWID) is resolved from the ID-Role sheet only.
// FBM is NOT used for authentication — it is only used to map a Faculty
// to their batches/subjects so they see only their own students.
function findUser(identifier) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('ID-Role');
  const data  = sheet.getDataRange().getValues();
  const q     = String(identifier || '').trim().toLowerCase();
  if (!q) return null;

  // 1) Try email in ID-Role (column A)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === q) {
      return { sheet, data, index: i, email: String(data[i][0]).trim(),
               centerRaw: String(data[i][1] || '').trim(), role: String(data[i][2]).trim(),
               pwid: String(data[i][3] || '').trim(),
               password: String(data[i][7] || '').trim(),
               otp: String(data[i][10] || '').trim(),
               otpVerified: String(data[i][11] || '').trim() };
    }
  }
  // 2) Try PWID in ID-Role (column D)
  const qUpper = String(identifier).trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]).trim().toUpperCase() === qUpper) {
      return { sheet, data, index: i, email: String(data[i][0]).trim(),
               centerRaw: String(data[i][1] || '').trim(), role: String(data[i][2]).trim(),
               pwid: String(data[i][3] || '').trim(),
               password: String(data[i][7] || '').trim(),
               otp: String(data[i][10] || '').trim(),
               otpVerified: String(data[i][11] || '').trim() };
    }
  }
  return null;
}

function getCenters(user) {
  return (user.centerRaw || '').split(',').map(s => s.trim()).filter(Boolean);
}

// ── LOGIN ─────────────────────────────────────────────────
function handleLogin(e) {
  const user = findUser(e.parameter.identifier);
  if (!user) return json({ success: false, message: 'User not found' });
  const stored = user.password || DEFAULT_PASSWORD;
  if (stored !== String(e.parameter.password).trim()) {
    return json({ success: false, message: 'Invalid password' });
  }
  const centers = getCenters(user);
  // Multi-center users (CH/ACH, AOM, JEE/NEET Head, etc.) get ALL their
  // centers selected by default. RAH/RAOM/Admin (level >= 5) see the whole
  // region regardless of this value.
  return json({ success: true, data: {
    email: user.email, role: user.role,
    center: centers.join(','), centers: centers,
    level: HIERARCHY[user.role] || 1, token: Utilities.getUuid()
  }});
}

// ── FORGOT PASSWORD ──────────────────────────────────────
function handleForgotPassword(e) {
  const user = findUser(e.parameter.identifier);
  if (!user) return json({ success: false, message: 'User not found' });
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.sheet.getRange(user.index + 1, 11).setValue(otp);
  user.sheet.getRange(user.index + 1, 12).setValue(''); // reset verified flag
  try { MailApp.sendEmail({ to: user.email,
    subject: 'PW Portal — Password Reset OTP',
    body: 'Your OTP: ' + otp + '\nValid for 10 minutes.' });
  } catch (_) {}
  return json({ success: true, message: 'OTP sent to ' + user.email, data: { email: user.email } });
}

function handleVerifyOTP(e) {
  const user = findUser(e.parameter.identifier);
  if (!user) return json({ success: false, message: 'User not found' });
  if (user.otp === String(e.parameter.otp).trim()) {
    user.sheet.getRange(user.index + 1, 12).setValue('yes'); // mark verified
    return json({ success: true, message: 'OTP verified' });
  }
  return json({ success: false, message: 'Invalid OTP' });
}

function handleResetPassword(data) {
  const user = findUser(data.identifier);
  if (!user) return json({ success: false, message: 'User not found' });
  // Password can only be changed after the OTP has been verified.
  if (user.otpVerified !== 'yes') {
    return json({ success: false, message: 'OTP not verified. Please verify OTP first.' });
  }
  const pw = String(data.newPassword).trim();
  if (pw.length < 4) return json({ success: false, message: 'Password too short' });
  user.sheet.getRange(user.index + 1, 8).setValue(pw);
  user.sheet.getRange(user.index + 1, 11).setValue(''); // clear OTP
  user.sheet.getRange(user.index + 1, 12).setValue(''); // clear verified flag
  return json({ success: true, message: 'Password updated successfully' });
}

// ── HELPERS: APPROVER + CENTERS ───────────────────────────
// Find the email of someone holding the given role (first match in
// ID-Role). Falls back to the Admin if nobody holds that role.
function findApproverEmail(approverRole) {
  if (!approverRole) return ADMIN_EMAIL;
  const idRole = getSheet('ID-Role');
  for (const r of rows(idRole)) {
    if (col(r, 2) === approverRole) {
      const candidate = col(r, 0).toLowerCase();
      if (candidate && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) return candidate;
    }
  }
  return ADMIN_EMAIL;
}

// BH approvals are CENTER-SCOPED: the request goes to a CH/ACH who holds
// one of the requested centers. If none of those centers has a CH/ACH,
// the request falls back to the Admin.
function findBHApprover(centers) {
  const idRole = getSheet('ID-Role');
  const wanted = (centers || []).map(c => String(c).toLowerCase().trim()).filter(Boolean);
  for (const r of rows(idRole)) {
    if (col(r, 2) !== 'CH/ACH') continue;
    const chCenters = col(r, 1).toLowerCase().split(',').map(s => s.trim());
    if (!wanted.some(w => chCenters.includes(w))) continue;
    const candidate = col(r, 0).toLowerCase();
    if (candidate && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidate)) return candidate;
  }
  return ADMIN_EMAIL;
}

// Valid center names = those present in the FBM sheet (column E).
function validCenters() {
  const fbm = getSheet('FBM');
  const set = {};
  rows(fbm).forEach(r => { const c = col(r, 4); if (c) set[c.toLowerCase()] = c; });
  return set;
}

// ── SIGNUP ────────────────────────────────────────────────
function handleGetSignupOptions() {
  const fbm = getSheet('FBM');
  const centers = {};
  rows(fbm).forEach(r => {
    const c = col(r, 4);
    if (c) centers[c] = true;
  });
  return json({ success: true, data: {
    roles: SIGNUP_ROLES,
    centers: Object.keys(centers).sort()
  }});
}

function handleSignup(e) {
  const email = String((e.parameter && e.parameter.email) || (e.email) || '').trim().toLowerCase();
  const pwid = String((e.parameter && e.parameter.pwid) || (e.pwid) || '').trim();
  const password = String((e.parameter && e.parameter.password) || (e.password) || '').trim();
  // `center` is the new param; `centers` is kept for the old deployed frontend.
  const centerRaw = String((e.parameter && (e.parameter.center || e.parameter.centers)) || (e.center || e.centers) || '').trim();
  const role = String((e.parameter && e.parameter.role) || (e.role) || '').trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ success: false, message: 'Valid email required' });
  if (!email.endsWith('@pw.live'))
    return json({ success: false, message: 'Only @pw.live emails can sign up' });
  if (!pwid)
    return json({ success: false, message: 'PWID required' });
  if (!password || password.length < 4)
    return json({ success: false, message: 'Password must be at least 4 characters' });
  if (!role || !SIGNUP_ROLES.includes(role))
    return json({ success: false, message: 'Invalid role selected' });
  if (!centerRaw)
    return json({ success: false, message: 'Center required' });

  // Support one or more centers (comma-separated), each must be valid.
  const vc = validCenters();
  const centers = centerRaw.split(',').map(s => s.trim()).filter(Boolean);
  for (const c of centers) {
    if (!vc[c.toLowerCase()]) return json({ success: false, message: 'Invalid center: ' + c });
  }

  // Duplicate checks (email AND PWID, both in ID-Role)
  if (findUser(email))
    return json({ success: false, message: 'This email is already registered. Please login.' });
  if (findUser(pwid))
    return json({ success: false, message: 'This PWID is already registered. Please login.' });

  // No pending approval request for the same email or PWID
  const apData = getSheet('Approvals');
  if (apData && apData.length > 1) {
    for (const r of rows(apData)) {
      const st = col(r, 6).toLowerCase();
      if (st === 'pending' &&
          (col(r, 1).toLowerCase() === email || col(r, 2).toUpperCase() === pwid.toUpperCase())) {
        return json({ success: false, message: 'A signup request for this email/PWID is already pending approval.' });
      }
    }
  }

  // Determine approver (next level up), fall back to Admin.
  // BH is special: approval goes to the CH/ACH of the selected center(s);
  // if none of those centers has a CH/ACH, it goes to the Admin.
  const approverEmail = (role === 'BH')
    ? findBHApprover(centers)
    : findApproverEmail(APPROVER_MAP[role] || 'Admin');
  const centerList = centers.join(', ');

  // Create approval request
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let apSheet = ss.getSheetByName('Approvals');
  if (!apSheet) {
    apSheet = ss.insertSheet('Approvals');
    apSheet.appendRow(['Request ID', 'Email', 'PWID', 'Center', 'Role', 'Password',
                       'Status', 'Approver Email', 'Created At', 'Processed At', 'Token']);
  }
  const requestId = 'REQ-' + Utilities.getUuid().substring(0, 6).toUpperCase();
  const token = Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  const now = new Date();
  apSheet.appendRow([requestId, email, pwid, centerList, role, password,
                     'Pending', approverEmail, now, '', token]);

  // Send email to approver with approve/reject links + reply instructions
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = baseUrl + '?action=approveRequest&token=' + token;
  const rejectUrl = baseUrl + '?action=rejectRequest&token=' + token;

  const subject = 'PW Portal ID Approval Request [' + requestId + ']';
  const body =
    'A new ' + role + ' account request is waiting for your approval.\n\n' +
    'Request ID: ' + requestId + '\n' +
    'Name/Email: ' + email + '\n' +
    'PWID: ' + pwid + '\n' +
    'Center: ' + centerList + '\n' +
    'Role: ' + role + '\n\n' +
    'Approve or reject using the buttons in the email.\n' +
    'TOKEN:' + token + '\n\n' +
    'If you do nothing, the request stays on hold.';

  // HTML version with Approve / Reject buttons
  const htmlBody =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#0A0A0B;padding:24px;color:#F5F5F7">' +
      '<div style="max-width:520px;margin:0 auto;background:#151518;border:1px solid #26262B;border-radius:14px;overflow:hidden">' +
        '<div style="background:linear-gradient(135deg,#EF4444,#B91C1C);padding:20px 24px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#fff">PW Portal — ID Approval</div>' +
          '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px">Request ' + requestId + '</div>' +
        '</div>' +
        '<div style="padding:24px">' +
          '<p style="margin:0 0 16px;font-size:14px;color:#A1A1AA">A new <b style="color:#F5F5F7">' + role + '</b> account request is waiting for your approval.</p>' +
          '<table style="width:100%;font-size:13px;color:#A1A1AA;border-collapse:collapse">' +
            '<tr><td style="padding:6px 0;color:#71717A">Email</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + email + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#71717A">PWID</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + pwid + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#71717A">Center</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + centerList + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#71717A">Role</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + role + '</td></tr>' +
          '</table>' +
          '<div style="margin-top:24px;text-align:center">' +
            '<a href="' + approveUrl + '" style="display:inline-block;background:linear-gradient(135deg,#22C55E,#15803D);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:8px;margin:0 6px">&#10003; Approve</a>' +
            '<a href="' + rejectUrl + '" style="display:inline-block;background:linear-gradient(135deg,#EF4444,#B91C1C);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:8px;margin:0 6px">&#10007; Reject</a>' +
          '</div>' +
          '<p style="margin:20px 0 0;font-size:12px;color:#71717A;text-align:center">Clicking a button records your response. The applicant is notified automatically.</p>' +
        '</div>' +
      '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({ to: approverEmail, subject: subject, body: body, htmlBody: htmlBody });
  } catch (err) {
    return json({ success: false, message: 'Failed to notify approver: ' + err });
  }

  return json({ success: true, message: 'Signup request submitted. Approval email sent to ' + approverEmail,
                data: { requestId: requestId, approverEmail: approverEmail } });
}

// ── APPROVAL HANDLERS ─────────────────────────────────────
function findRequestByToken(token) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Approvals');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const q = String(token || '').trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][10]).trim().toUpperCase() === q) {
      return { sheet, data, index: i, requestId: String(data[i][0]), email: String(data[i][1]),
               pwid: String(data[i][2]), center: String(data[i][3]), role: String(data[i][4]),
               password: String(data[i][5]), status: String(data[i][6]) };
    }
  }
  return null;
}

function handleApproveRequest(e) {
  const token = e.parameter.token;
  const result = processApproval(token, 'Approved', 'Your account has been approved. You can now login.');
  return htmlResponse(result.success, result.message);
}

function handleRejectRequest(e) {
  const token = e.parameter.token;
  const req = findRequestByToken(token);
  if (!req) return htmlResponse(false, 'Invalid token');
  if (req.status !== 'Pending') {
    return htmlResponse(false, 'Request already ' + req.status + ' (ID: ' + req.requestId + ')');
  }
  req.sheet.getRange(req.index + 1, 7).setValue('Rejected');
  req.sheet.getRange(req.index + 1, 10).setValue(new Date());
  try {
    MailApp.sendEmail({ to: req.email,
      subject: 'PW Portal — Signup Request Rejected',
      body: 'Your signup request (' + req.requestId + ') was rejected. Please contact your admin.' });
  } catch (_) {}
  return htmlResponse(true, 'Request rejected. Applicant notified.');
}

// Shared approval logic (link click + email reply both use this)
function processApproval(token, newStatus, userMessage) {
  const req = findRequestByToken(token);
  if (!req) return { success: false, message: 'Invalid token' };
  if (req.status !== 'Pending') {
    return { success: false, message: 'Request already ' + req.status + ' (ID: ' + req.requestId + ')' };
  }
  if (newStatus === 'Approved') {
    // Guard: email or PWID must not already exist in ID-Role
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const idRole = ss.getSheetByName('ID-Role');
    const existing = findUser(req.email) || (req.pwid ? findUser(req.pwid) : null);
    if (existing) {
      req.sheet.getRange(req.index + 1, 7).setValue('Duplicate');
      req.sheet.getRange(req.index + 1, 10).setValue(new Date());
      return { success: false, message: 'Email/PWID already registered. Request marked Duplicate.' };
    }
    // Create user in ID-Role sheet
    idRole.appendRow([req.email, req.center, req.role, req.pwid, '', '', '', req.password || DEFAULT_PASSWORD, '', '', '']);
    req.sheet.getRange(req.index + 1, 7).setValue('Approved');
    req.sheet.getRange(req.index + 1, 10).setValue(new Date());
    try {
      MailApp.sendEmail({ to: req.email,
        subject: 'PW Portal — Account Approved',
        body: userMessage + '\n\nEmail: ' + req.email + '\nPassword: ' + (req.password || DEFAULT_PASSWORD) +
              '\n\nPlease change your password after first login.' });
    } catch (_) {}
    return { success: true, message: 'Account approved and created! Login details sent to ' + req.email };
  }
  return { success: false, message: 'Unknown status' };
}

// ── EMAIL REPLY SCANNER (run via time trigger) ────────────
// Scans Gmail for replies containing the token + "approve"/"reject".
// Setup: Triggers → Add Trigger → checkApprovalReplies → Time-driven → Every 5 minutes
function checkApprovalReplies() {
  const threads = GmailApp.search('subject:("PW Portal ID Approval Request")', 0, 100);
  let processed = 0;
  for (const thread of threads) {
    const messages = thread.getMessages();
    const first = messages[0];
    const firstBody = first.getPlainBody() || '';
    const m = firstBody.match(/TOKEN[:：]\s*([A-Z0-9]+)/);
    if (!m) continue;
    const token = m[1];

    // Look at replies (skip the original approval email)
    for (let i = 1; i < messages.length; i++) {
      const reply = (messages[i].getPlainBody() || '').toLowerCase();
      if (reply.includes('approve') && reply.includes(token.toLowerCase())) {
        processApproval(token, 'Approved', 'Your account has been approved. You can now login.');
        processed++;
        break;
      } else if (reply.includes('reject') && reply.includes(token.toLowerCase())) {
        const req = findRequestByToken(token);
        if (req && req.status === 'Pending') {
          req.sheet.getRange(req.index + 1, 7).setValue('Rejected');
          req.sheet.getRange(req.index + 1, 10).setValue(new Date());
          MailApp.sendEmail({ to: req.email, subject: 'PW Portal — Signup Request Rejected',
            body: 'Your signup request (' + req.requestId + ') was rejected.' });
          processed++;
        }
        break;
      }
    }
  }
  Logger.log('checkApprovalReplies: processed ' + processed + ' request(s)');
  return processed;
}

// ── APPROVAL STATUS CHECK ─────────────────────────────────
function handleGetApprovalStatus(e) {
  const email = String(e.parameter.email || '').trim().toLowerCase();
  if (!email) return json({ success: false, message: 'Email required' });
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Approvals');
  if (!sheet) return json({ success: true, data: { requests: [] } });
  const data = sheet.getDataRange().getValues();
  const requests = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === email) {
      requests.push({ requestId: String(data[i][0]), center: String(data[i][3]),
                      role: String(data[i][4]), status: String(data[i][6]),
                      approver: String(data[i][7]), createdAt: String(data[i][8]) });
    }
  }
  return json({ success: true, data: { requests: requests } });
}

// ── CENTER CHANGE REQUEST ────────────────────────────────
// A logged-in user can request to change/expand their accessible center(s).
// The request goes through approval, then ID-Role column B is updated.
function handleRequestCenterChange(e) {
  const email = String(e.parameter.email || '').trim().toLowerCase();
  const newCenter = String(e.parameter.newCenter || '').trim();
  if (!email) return json({ success: false, message: 'Email required' });
  if (!newCenter) return json({ success: false, message: 'New center(s) required' });

  const user = findUser(email);
  if (!user) return json({ success: false, message: 'User not found' });

  const oldCenter = user.centerRaw;
  const newCenters = newCenter.split(',').map(s => s.trim()).filter(Boolean);
  if (newCenters.length === 0) return json({ success: false, message: 'New center(s) required' });

  // Validate against known centers
  const vc = validCenters();
  for (const c of newCenters) {
    if (!vc[c.toLowerCase()]) return json({ success: false, message: 'Invalid center: ' + c });
  }

  // No-op check: new centers same as current
  const cur = getCenters(user);
  const same = cur.length === newCenters.length &&
    newCenters.every(c => cur.some(uc => uc.toLowerCase() === c.toLowerCase()));
  if (same) return json({ success: false, message: 'New center(s) same as current — no change needed.' });

  // No pending request for this user
  const ccSheetData = getSheet('CenterChanges');
  if (ccSheetData && ccSheetData.length > 1) {
    for (const r of rows(ccSheetData)) {
      if (col(r, 4).toLowerCase() === 'pending' && col(r, 1).toLowerCase() === email) {
        return json({ success: false, message: 'You already have a pending center change request.' });
      }
    }
  }

  // Determine approver (next level up), fall back to Admin.
  // BH center-change requests also go to the CH/ACH of the new center(s).
  const approverEmail = (user.role === 'BH')
    ? findBHApprover(newCenters)
    : findApproverEmail(APPROVER_MAP[user.role] || 'Admin');

  // Create request in CenterChanges sheet
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let ccSheet = ss.getSheetByName('CenterChanges');
  if (!ccSheet) {
    ccSheet = ss.insertSheet('CenterChanges');
    ccSheet.appendRow(['Request ID', 'Email', 'Old Center', 'New Center', 'Status', 'Approver Email', 'Created At', 'Processed At', 'Token']);
  }
  const requestId = 'CC-' + Utilities.getUuid().substring(0, 6).toUpperCase();
  const token = Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  const now = new Date();
  ccSheet.appendRow([requestId, email, oldCenter, newCenters.join(', '), 'Pending', approverEmail, now, '', token]);

  // Send approval email with buttons
  const baseUrl = ScriptApp.getService().getUrl();
  const approveUrl = baseUrl + '?action=approveCenterChange&token=' + token;
  const rejectUrl = baseUrl + '?action=rejectCenterChange&token=' + token;
  const subject = 'PW Portal Center Change Request [' + requestId + ']';
  const body =
    'A center change request is waiting for your approval.\n\n' +
    'Request ID: ' + requestId + '\n' +
    'Email: ' + email + '\n' +
    'Role: ' + user.role + '\n' +
    'Old Center: ' + oldCenter + '\n' +
    'New Center: ' + newCenters.join(', ') + '\n\n' +
    'Approve or reject using the buttons in the email.\n' +
    'TOKEN:' + token;
  const htmlBody =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#0A0A0B;padding:24px;color:#F5F5F7">' +
      '<div style="max-width:520px;margin:0 auto;background:#151518;border:1px solid #26262B;border-radius:14px;overflow:hidden">' +
        '<div style="background:linear-gradient(135deg,#EF4444,#B91C1C);padding:20px 24px;text-align:center">' +
          '<div style="font-size:20px;font-weight:800;color:#fff">PW Portal — Center Change</div>' +
          '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px">Request ' + requestId + '</div>' +
        '</div>' +
        '<div style="padding:24px">' +
          '<p style="margin:0 0 16px;font-size:14px;color:#A1A1AA">A center change request is waiting for your approval.</p>' +
          '<table style="width:100%;font-size:13px;color:#A1A1AA;border-collapse:collapse">' +
            '<tr><td style="padding:6px 0;color:#71717A">Email</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + email + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#71717A">Role</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + user.role + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#71717A">Old Center</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + oldCenter + '</td></tr>' +
            '<tr><td style="padding:6px 0;color:#71717A">New Center</td><td style="padding:6px 0;color:#F5F5F7;text-align:right">' + newCenters.join(', ') + '</td></tr>' +
          '</table>' +
          '<div style="margin-top:24px;text-align:center">' +
            '<a href="' + approveUrl + '" style="display:inline-block;background:linear-gradient(135deg,#22C55E,#15803D);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:8px;margin:0 6px">&#10003; Approve</a>' +
            '<a href="' + rejectUrl + '" style="display:inline-block;background:linear-gradient(135deg,#EF4444,#B91C1C);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 32px;border-radius:8px;margin:0 6px">&#10007; Reject</a>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  try {
    MailApp.sendEmail({ to: approverEmail, subject: subject, body: body, htmlBody: htmlBody });
  } catch (err) {
    return json({ success: false, message: 'Failed to notify approver: ' + err });
  }

  return json({ success: true, message: 'Center change request submitted. Approval email sent to ' + approverEmail,
                data: { requestId: requestId, approverEmail: approverEmail } });
}

function findCenterChangeByToken(token) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('CenterChanges');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  const q = String(token || '').trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][8]).trim().toUpperCase() === q) {
      return { sheet, data, index: i, requestId: String(data[i][0]), email: String(data[i][1]),
               oldCenter: String(data[i][2]), newCenter: String(data[i][3]), status: String(data[i][4]) };
    }
  }
  return null;
}

function handleApproveCenterChange(e) {
  const req = findCenterChangeByToken(e.parameter.token);
  if (!req) return htmlResponse(false, 'Invalid token');
  if (req.status !== 'Pending') return htmlResponse(false, 'Request already ' + req.status + ' (ID: ' + req.requestId + ')');

  // Update ID-Role column B with the new center(s)
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const idRole = ss.getSheetByName('ID-Role');
  const data = idRole.getDataRange().getValues();
  const email = req.email.toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === email) {
      idRole.getRange(i + 1, 2).setValue(req.newCenter);
      break;
    }
  }
  req.sheet.getRange(req.index + 1, 5).setValue('Approved');
  req.sheet.getRange(req.index + 1, 8).setValue(new Date());
  try {
    MailApp.sendEmail({ to: req.email,
      subject: 'PW Portal — Center Change Approved',
      body: 'Your center change request (' + req.requestId + ') was approved.\n\nNew center(s): ' + req.newCenter +
            '\n\nPlease log out and log back in to see the updated access.' });
  } catch (_) {}
  return htmlResponse(true, 'Center change approved. User notified.');
}

function handleRejectCenterChange(e) {
  const req = findCenterChangeByToken(e.parameter.token);
  if (!req) return htmlResponse(false, 'Invalid token');
  if (req.status !== 'Pending') return htmlResponse(false, 'Request already ' + req.status + ' (ID: ' + req.requestId + ')');
  req.sheet.getRange(req.index + 1, 5).setValue('Rejected');
  req.sheet.getRange(req.index + 1, 8).setValue(new Date());
  try {
    MailApp.sendEmail({ to: req.email,
      subject: 'PW Portal — Center Change Rejected',
      body: 'Your center change request (' + req.requestId + ') was rejected. Please contact your admin.' });
  } catch (_) {}
  return htmlResponse(true, 'Center change rejected. User notified.');
}

// ── HELPERS ───────────────────────────────────────────────
// Returns rows of a sheet, or [] if the sheet does not exist yet.
function getSheet(name) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh) return [];
  return sh.getDataRange().getValues();
}
function rows(sheet) { return sheet.slice(1); }
function col(r, i) { return String(r[i] || '').trim(); }

// Does this row's center fall within the user's accessible centers?
function inCenters(rowCenter, centersArr) {
  const c = rowCenter;
  if (!c) return false;
  return centersArr.some(uc => c.toLowerCase() === uc.toLowerCase());
}

// ── DASHBOARD ─────────────────────────────────────────────
function handleGetDashboard(e) {
  const email  = col(e.parameter, 'email').toLowerCase();
  const level  = parseInt(e.parameter.level) || 1;
  const centerRaw = col(e.parameter, 'center');
  const centers = centerRaw ? centerRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const fbm     = getSheet('FBM');
  const stu     = getSheet('Students');
  const tests   = getSheet('Test Result');

  const filtered = rows(fbm).filter(r => {
    const subj = col(r, 1);
    if (subj === 'Cancelled') return false;
    if (level >= 5) return true;                              // Admin, RAH, RAOM — whole region
    if (level >= 2) return inCenters(col(r, 4), centers);     // CH/ACH, JEE/NEET Head, AOM, SubjHead — selected centers
    return col(r, 3).toLowerCase() === email;                 // Faculty — own only
  });

  const batchSet = new Set(filtered.map(r => col(r, 0)).filter(Boolean));
  const batchArr = [...batchSet];
  const facultySet = new Set(filtered.map(r => col(r, 3).toLowerCase()).filter(Boolean));
  const studentSet = new Set();
  rows(stu).forEach(r => { if (batchArr.includes(col(r, 4))) studentSet.add(col(r, 0)); });

  const stuLatest = {};
  rows(tests).forEach(r => {
    const reg = col(r, 0);
    if (studentSet.has(reg)) stuLatest[reg] = r;
  });
  let totalPct = 0, cnt = 0;
  Object.values(stuLatest).forEach(r => {
    const p = (parseFloat(r[13]) || 0) * 100; // markspercent stored as fraction
    if (p > 0) { totalPct += p; cnt++; }
  });

  return json({ success: true, data: {
    stats: {
      totalBatches: batchSet.size,
      totalStudents: studentSet.size,
      totalFaculty: facultySet.size,
      avgScore: cnt > 0 ? (totalPct / cnt).toFixed(1) : 0,
      totalTests: rows(tests).filter(r => studentSet.has(col(r, 0))).length
    }
  }});
}

// ── BATCHES ───────────────────────────────────────────────
function handleGetBatches(e) {
  const email  = col(e.parameter, 'email').toLowerCase();
  const level  = parseInt(e.parameter.level) || 1;
  const centerRaw = col(e.parameter, 'center');
  const centers = centerRaw ? centerRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const fbm = getSheet('FBM');
  const stu = getSheet('Students');
  const tests = getSheet('Test Result');

  const filtered = rows(fbm).filter(r => {
    const subj = col(r, 1);
    if (subj === 'Cancelled') return false;
    if (level >= 5) return true;
    if (level >= 2) return inCenters(col(r, 4), centers);
    return col(r, 3).toLowerCase() === email;
  });

  const batchMap = {};
  const fKeys = {};
  filtered.forEach(r => {
    const b = col(r, 0); if (!b) return;
    if (!batchMap[b]) { batchMap[b] = { subjects: new Set(), faculty: [] }; fKeys[b] = new Set(); }
    const subj = col(r, 1);
    if (subj) batchMap[b].subjects.add(subj);
    const fEmail = col(r, 3).toLowerCase();
    const fKey = fEmail + '|' + subj;
    if (fEmail && !fKeys[b].has(fKey)) {
      fKeys[b].add(fKey);
      batchMap[b].faculty.push({ subject: subj, email: fEmail, pwid: col(r, 2), center: col(r, 4) });
    }
  });

  const stuCount = {};
  rows(stu).forEach(r => {
    const b = col(r, 4);
    if (batchMap[b]) stuCount[b] = (stuCount[b] || 0) + 1;
  });

  const batchRegnos = {};
  rows(stu).forEach(r => {
    const b = col(r, 4);
    if (batchMap[b]) {
      if (!batchRegnos[b]) batchRegnos[b] = new Set();
      batchRegnos[b].add(col(r, 0));
    }
  });

  const batchScores = {};
  rows(tests).forEach(r => {
    const reg = col(r, 0);
    const pct = (parseFloat(r[13]) || 0) * 100; // markspercent stored as fraction
    if (pct <= 0) return;
    for (const b in batchRegnos) {
      if (batchRegnos[b].has(reg)) {
        if (!batchScores[b]) batchScores[b] = { total: 0, count: 0 };
        batchScores[b].total += pct;
        batchScores[b].count++;
      }
    }
  });

  const batches = Object.keys(batchMap).map(b => ({
    batch: b,
    subjects: [...batchMap[b].subjects],
    studentCount: stuCount[b] || 0,
    faculty: batchMap[b].faculty,
    avgScore: batchScores[b] ? +(batchScores[b].total / batchScores[b].count).toFixed(1) : null
  }));

  batches.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  return json({ success: true, data: { batches } });
}

// ── BATCH DETAIL ──────────────────────────────────────────
function handleGetBatchDetail(e) {
  const batch   = col(e.parameter, 'batch');
  const subject = col(e.parameter, 'subject');

  const stu  = getSheet('Students');
  const tests = getSheet('Test Result');

  const subCol = { Physics: 14, Chemistry: 15, Maths: 16, Zoology: 17, Botany: 18 };
  const scoreCol = subject ? (subCol[subject] !== undefined ? subCol[subject] : 13) : 13;

  const batchStudents = rows(stu).filter(r => col(r, 4) === batch)
    .map(r => ({ regno: col(r, 0), formStatus: r[1], eligibility: r[3] }));
  const regSet = new Set(batchStudents.map(s => s.regno));

  const stuTests = {};
  rows(tests).forEach(r => {
    const reg = col(r, 0);
    if (regSet.has(reg)) {
      if (!stuTests[reg]) stuTests[reg] = [];
      stuTests[reg].push(r);
    }
  });

  const performances = batchStudents.map(stu => {
    const results = stuTests[stu.regno] || [];
    if (results.length === 0) {
      return { ...stu, name: '', status: 'Absent', score: null, percentage: null, rank: null, tests: 0 };
    }
    const latest = results[results.length - 1];
    return {
      ...stu,
      name: String(latest[1] || '').trim(),
      stream: String(latest[5] || '').trim(),
      testType: String(latest[6] || '').trim(),
      status: 'Present',
      score: latest[scoreCol] || 0,
      percentage: (parseFloat(latest[13]) || 0) * 100,
      totalScore: parseFloat(latest[12]) || 0,
      rank: latest[19] || null,
      tests: results.length,
      physics: parseFloat(latest[14]) || null,
      chemistry: parseFloat(latest[15]) || null,
      maths: parseFloat(latest[16]) || null,
      zoology: parseFloat(latest[17]) || null,
      botany: parseFloat(latest[18]) || null
    };
  });

  const present = performances
    .filter(p => p.status === 'Present' && p.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage);
  const absent = performances.filter(p => p.status === 'Absent');

  const n = present.length;
  const topN = Math.max(1, Math.ceil(n * 0.2));
  const botN = Math.max(1, Math.ceil(n * 0.2));

  const avgScore = n > 0 ? +(present.reduce((s, p) => s + p.percentage, 0) / n).toFixed(1) : 0;
  const highScore = n > 0 ? present[0].percentage : 0;
  const lowScore = n > 0 ? present[n - 1].percentage : 0;

  return json({ success: true, data: {
    batch, subject,
    total: batchStudents.length,
    present: n,
    absent: absent.length,
    avgScore, highScore, lowScore,
    toppers: present.slice(0, topN),
    average: present.slice(topN, n - botN),
    bottom: present.slice(n - botN),
    absentees: absent,
    allStudents: present
  }});
}

// ── FACULTY ───────────────────────────────────────────────
function handleGetFaculty(e) {
  const email  = col(e.parameter, 'email').toLowerCase();
  const level  = parseInt(e.parameter.level) || 1;
  const centerRaw = col(e.parameter, 'center');
  const centers = centerRaw ? centerRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const fbm   = getSheet('FBM');
  const stu   = getSheet('Students');
  const tests = getSheet('Test Result');
  const roles = getSheet('ID-Role');

  const filtered = rows(fbm).filter(r => {
    if (col(r, 1) === 'Cancelled') return false;
    if (level >= 5) return true;
    if (level >= 2) return inCenters(col(r, 4), centers);
    return col(r, 3).toLowerCase() === email;
  });

  const fMap = {};
  filtered.forEach(r => {
    const fEmail = col(r, 3).toLowerCase();
    const subj = col(r, 1);
    const batch = col(r, 0);
    if (!fEmail || !batch) return;
    if (!fMap[fEmail]) fMap[fEmail] = { batches: new Set(), subjects: new Set(), center: col(r, 4) };
    fMap[fEmail].batches.add(batch);
    if (subj) fMap[fEmail].subjects.add(subj);
  });

  const roleMap = {};
  rows(roles).forEach(r => {
    const e2 = col(r, 0).toLowerCase();
    if (e2) roleMap[e2] = { role: col(r, 2), center: col(r, 1) };
  });

  const batchStu = {};
  rows(stu).forEach(r => {
    const b = col(r, 4);
    if (!batchStu[b]) batchStu[b] = new Set();
    batchStu[b].add(col(r, 0));
  });

  const stuScores = {};
  rows(tests).forEach(r => {
    const reg = col(r, 0);
    const pct = (parseFloat(r[13]) || 0) * 100; // markspercent stored as fraction
    if (pct > 0) {
      if (!stuScores[reg]) stuScores[reg] = { total: 0, count: 0 };
      stuScores[reg].total += pct;
      stuScores[reg].count++;
    }
  });

  const facultyList = Object.keys(fMap).map(fEmail => {
    const f = fMap[fEmail];
    const batchArr = [...f.batches];
    let totalStudents = 0, totalScore = 0, scoreCount = 0;

    batchArr.forEach(b => {
      const sSet = batchStu[b] || new Set();
      totalStudents += sSet.size;
      sSet.forEach(reg => {
        const sc = stuScores[reg];
        if (sc) { totalScore += sc.total / sc.count; scoreCount++; }
      });
    });

    return {
      email: fEmail,
      center: roleMap[fEmail]?.center || f.center,
      role: roleMap[fEmail]?.role || 'Faculty',
      batches: batchArr,
      subjects: [...f.subjects],
      totalStudents,
      avgScore: scoreCount > 0 ? +(totalScore / scoreCount).toFixed(1) : null
    };
  });

  facultyList.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  return json({ success: true, data: { faculty: facultyList } });
}

// ── STUDENTS ──────────────────────────────────────────────
function handleGetStudents(e) {
  const batch = col(e.parameter, 'batch');
  const level = parseInt(e.parameter.level) || 1;
  const email = col(e.parameter, 'email').toLowerCase();
  const centerRaw = col(e.parameter, 'center');
  const centers = centerRaw ? centerRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const fbm   = getSheet('FBM');
  const stu   = getSheet('Students');
  const tests = getSheet('Test Result');

  const accBatches = new Set();
  rows(fbm).forEach(r => {
    if (col(r, 1) === 'Cancelled') return;
    if (level >= 5) { accBatches.add(col(r, 0)); return; }
    if (level >= 2 && inCenters(col(r, 4), centers)) { accBatches.add(col(r, 0)); return; }
    if (col(r, 3).toLowerCase() === email) accBatches.add(col(r, 0));
  });

  const studentList = rows(stu).filter(r => {
    const b = col(r, 4);
    return batch ? b === batch : accBatches.has(b);
  }).map(r => ({ regno: col(r, 0), batch: col(r, 4), formStatus: r[1], eligibility: r[3] }));

  const regnos = new Set(studentList.map(s => s.regno));
  const stuTests = {};
  rows(tests).forEach(r => {
    const reg = col(r, 0);
    if (regnos.has(reg)) {
      if (!stuTests[reg]) stuTests[reg] = [];
      stuTests[reg].push(r);
    }
  });

  const enriched = studentList.map(stu => {
    const results = stuTests[stu.regno] || [];
    if (results.length === 0) {
      return { ...stu, name: '', tests: 0, avgScore: null, bestSubject: '—', lastDate: '' };
    }
    const latest = results[results.length - 1];
    let totalPct = 0, cnt = 0;
    results.forEach(r => { const p = (parseFloat(r[13]) || 0) * 100; if (p > 0) { totalPct += p; cnt++; } });

    const subjs = ['Physics','Chemistry','Maths','Zoology','Botany'];
    const best = [14,15,16,17,18].map((c, i) => ({ name: subjs[i], score: parseFloat(latest[c]) || 0 }))
      .filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    return {
      ...stu,
      name: String(latest[1] || '').trim(),
      stream: String(latest[5] || '').trim(),
      tests: results.length,
      avgScore: cnt > 0 ? +(totalPct / cnt).toFixed(1) : null,
      bestSubject: best.length > 0 ? best[0].name : '—',
      lastDate: String(latest[10] || '').trim()
    };
  });

  enriched.sort((a, b) => (b.avgScore || 0) - (a.avgScore || 0));
  return json({ success: true, data: { students: enriched } });
}

// ── STUDENT DETAIL ────────────────────────────────────────
function handleGetStudentDetail(e) {
  const regno = col(e.parameter, 'regno');
  const stu   = getSheet('Students');
  const tests = getSheet('Test Result');

  const stuRow = rows(stu).find(r => col(r, 0) === regno);
  if (!stuRow) return json({ success: false, message: 'Student not found' });

  const stuInfo = { regno, batch: col(stuRow, 4), formStatus: stuRow[1], eligibility: stuRow[3] };

  const results = rows(tests).filter(r => col(r, 0) === regno);
  const testHistory = results.map(r => ({
    name: String(r[1] || '').trim(),
    stream: String(r[5] || '').trim(),
    testType: String(r[6] || '').trim(),
    testDate: String(r[10] || '').trim(),
    totalMarks: parseFloat(r[11]) || 0,
    score: parseFloat(r[12]) || 0,
    percentage: (parseFloat(r[13]) || 0) * 100,
    physics: r[14] !== '' && r[14] != null ? parseFloat(r[14]) : null,
    chemistry: r[15] !== '' && r[15] != null ? parseFloat(r[15]) : null,
    maths: r[16] !== '' && r[16] != null ? parseFloat(r[16]) : null,
    zoology: r[17] !== '' && r[17] != null ? parseFloat(r[17]) : null,
    botany: r[18] !== '' && r[18] != null ? parseFloat(r[18]) : null,
    rank: r[19] || null
  }));

  let totalPct = 0, cnt = 0;
  testHistory.forEach(t => { if (t.percentage > 0) { totalPct += t.percentage; cnt++; } });

  const subAvgs = {};
  ['physics','chemistry','maths','zoology','botany'].forEach(s => {
    const vals = testHistory.map(t => t[s]).filter(v => v !== null && v > 0);
    subAvgs[s] = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
  });

  return json({ success: true, data: {
    student: { ...stuInfo, name: testHistory.length > 0 ? testHistory[0].name : '',
               testsTaken: testHistory.length, avgScore: cnt > 0 ? +(totalPct / cnt).toFixed(1) : '—',
               subjectAverages: subAvgs },
    tests: testHistory
  }});
}

// ── JSON RESPONSE ─────────────────────────────────────────
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HTML RESPONSE (for approval button clicks) ────────────
// Returns a minimal, self-closing page so the approver is NOT
// taken to the portal — just a quick confirmation.
function htmlResponse(success, message) {
  const color = success ? '#22C55E' : '#EF4444';
  const icon = success ? '&#10003;' : '&#10007;';
  const title = success ? 'Response Recorded' : 'Something Went Wrong';
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>PW Portal</title>' +
    '<style>' +
      'body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0A0A0B;color:#F5F5F7;display:flex;align-items:center;justify-content:center;min-height:100vh}' +
      '.card{background:#151518;border:1px solid #26262B;border-radius:14px;padding:40px;text-align:center;max-width:360px;box-shadow:0 12px 28px rgba(0,0,0,.6)}' +
      '.icon{font-size:48px;color:' + color + '}' +
      '.title{font-size:20px;font-weight:800;margin-top:12px}' +
      '.msg{font-size:14px;color:#A1A1AA;margin-top:8px;line-height:1.5}' +
      '.close{display:inline-block;margin-top:20px;background:linear-gradient(135deg,#EF4444,#B91C1C);color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}' +
    '</style></head><body>' +
      '<div class="card">' +
        '<div class="icon">' + icon + '</div>' +
        '<div class="title">' + title + '</div>' +
        '<div class="msg">' + message + '</div>' +
        '<button class="close" onclick="window.close()">Close</button>' +
      '</div>' +
      '<script>setTimeout(function(){try{window.close();}catch(e){}},2500);</script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}
