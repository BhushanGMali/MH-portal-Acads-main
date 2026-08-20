// ============================================================
//  auth.js — Login, Forgot Password, Signup, Logout, initApp,
//            and the center switcher.
//  Depends on: core.js (apiGet, apiPost, showScreen, navigate,
//              showError, hideAlert, esc, user state)
// ============================================================

// ── AUTH SCREEN ANIMATIONS ─────────────────────────
// Count-up animation for .stat-num[data-count] chips on the auth screens
function animateCounters() {
  document.querySelectorAll('.stat-num[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10) || 0;
    const dur = 1400;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-IN');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// Forgot-password step indicator (1 = email, 2 = OTP, 3 = new password)
function setForgotStep(step) {
  document.querySelectorAll('#forgotSteps .step-dot').forEach(d => {
    d.classList.toggle('active', parseInt(d.dataset.step, 10) <= step);
  });
}

// Run counter animation once the auth screens are in the DOM
// (covers both the standalone build and loader.js multi-file mode)
function bootAuthAnimations() {
  if (document.querySelector('.stat-num[data-count]')) animateCounters();
}
document.addEventListener('DOMContentLoaded', bootAuthAnimations);
document.addEventListener('pw:html-ready', bootAuthAnimations);

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
      setForgotStep(2);
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
      setForgotStep(3);
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
        setForgotStep(1);
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
      // Populate centers as a multi-select checkbox list
      const list = document.getElementById('signupCenterList');
      if (list) {
        list.innerHTML = '<label class="center-opt center-opt-all"><input type="checkbox" id="signupCenterAll" onchange="toggleAllSignupCenters(this)"> <span>Select All</span></label>' +
          resp.data.centers.map(c => '<label class="center-opt"><input type="checkbox" value="' + esc(c) + '"> <span>' + esc(c) + '</span></label>').join('');
      }

      // Populate roles
      const roleSel = document.getElementById('signupRole');
      roleSel.innerHTML = '<option value="">Select role...</option>' +
        resp.data.roles.map(r => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
    }
  } catch (_) {}
}

// ── SIGNUP CENTER MULTI-SELECT ──────────────────────
function toggleSignupCenterList() {
  const list = document.getElementById('signupCenterList');
  if (list) list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function toggleAllSignupCenters(cb) {
  document.querySelectorAll('#signupCenterList input[value]').forEach(i => i.checked = cb.checked);
  updateSignupCenterLabel();
}

function updateSignupCenterLabel() {
  const sel = [...document.querySelectorAll('#signupCenterList input[value]:checked')].map(i => i.value);
  const label = document.getElementById('signupCenterLabel');
  const total = document.querySelectorAll('#signupCenterList input[value]').length;
  if (!label) return;
  if (sel.length === 0) label.textContent = 'Select center(s)...';
  else if (sel.length === total) label.textContent = 'All Centers';
  else if (sel.length === 1) label.textContent = sel[0];
  else label.textContent = sel.length + ' centers selected';
}

function getSelectedSignupCenters() {
  return [...document.querySelectorAll('#signupCenterList input[value]:checked')].map(i => i.value);
}

function resetSignupCenters() {
  const list = document.getElementById('signupCenterList');
  if (!list) return;
  document.querySelectorAll('#signupCenterList input[value]').forEach(i => i.checked = false);
  list.style.display = 'none';
  updateSignupCenterLabel();
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
  const pwid = document.getElementById('signupPwid').value.trim();
  const center = getSelectedSignupCenters().join(',');
  const role = document.getElementById('signupRole').value;
  const password = document.getElementById('signupPassword').value.trim();

  if (!email) { showError('signupError', 'MAIL ID required'); return; }
  if (!email.endsWith('@pw.live')) { showError('signupError', 'Only @pw.live emails can sign up'); return; }
  if (!pwid) { showError('signupError', 'PWID required'); return; }
  if (!center) { showError('signupError', 'Select at least one center'); return; }
  if (!role) { showError('signupError', 'Select a role'); return; }
  if (password.length < 4) { showError('signupError', 'Password must be at least 4 characters'); return; }

  btn.disabled = true;
  btn.querySelector('span').textContent = 'Submitting...';

  try {
    // Send BOTH params for backward compatibility:
    //   center  → new backend (comma-separated centers)
    //   centers → old deployed backend (comma-separated list)
    const resp = await apiGet('signup', { email, pwid, center, centers: center, role, password });
    if (resp.success) {
      document.getElementById('signupSuccess').textContent = resp.message;
      document.getElementById('signupSuccess').classList.add('show');
      document.getElementById('signupForm').reset();
      resetSignupCenters();
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
  dashData = null;
  batchesData = [];
  facultyData = [];
  studentsData = [];
  navigate('home');
}

// ── CENTER ACCESS REQUEST ─────────────────────────
async function openCenterChange() {
  hideAlert('ccMessage');
  document.getElementById('ccMessage').classList.remove('show');
  // Pre-fill the requester's details (mail id / pw id already known)
  document.getElementById('reqEmail').value = user.email || '';
  document.getElementById('reqPwid').value = user.pwid || '';
  document.getElementById('reqRemark').value = '';
  document.getElementById('ccSubmitBtn').disabled = false;
  document.getElementById('ccSubmitBtn').textContent = 'Submit Request';
  document.getElementById('centerChangeModal').style.display = 'flex';
  // Populate center list from local data first (works offline), fall back to API.
  const localCenters = (typeof allCenters === 'function') ? allCenters() : [];
  const current = (user.center || '').split(',').map(s => s.trim()).filter(Boolean);
  if (localCenters.length) {
    document.getElementById('reqCenter').innerHTML = localCenters.map(c => {
      return '<option value="' + esc(c) + '"' + (current.includes(c) ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    return;
  }
  try {
    const resp = await apiGet('getSignupOptions');
    if (resp.success) {
      document.getElementById('reqCenter').innerHTML = resp.data.centers.map(c => {
        return '<option value="' + esc(c) + '"' + (current.includes(c) ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    }
  } catch (_) {}
}

function closeCenterChange() {
  document.getElementById('centerChangeModal').style.display = 'none';
}

async function submitCenterChange() {
  const email = document.getElementById('reqEmail').value.trim();
  const pwid = document.getElementById('reqPwid').value.trim();
  const center = document.getElementById('reqCenter').value;
  const remark = document.getElementById('reqRemark').value.trim();
  const msgEl = document.getElementById('ccMessage');
  msgEl.classList.remove('error');
  if (!center) { showError('ccMessage', 'Select a center'); msgEl.classList.add('error'); return; }
  const btn = document.getElementById('ccSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';
  try {
    const resp = await apiGet('requestCenterChange', { email, pwid, newCenter: center, remark });
    if (resp.success) {
      msgEl.textContent = resp.message;
      msgEl.classList.add('show');
      btn.textContent = 'Submitted';
    } else {
      showError('ccMessage', resp.message);
      msgEl.classList.add('error');
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  } catch (_) {
    showError('ccMessage', 'Connection error');
    msgEl.classList.add('error');
    btn.disabled = false;
    btn.textContent = 'Submit Request';
  }
}

// ── LOGOUT ─────────────────────────────────────────
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