// ============================================================
//  loader.js — HTML PARTIAL LOADER
//  Fetches each screen partial and injects it into its matching
//  placeholder div in index.html, then fires the `pw:html-ready`
//  event so core.js can boot (auto-login).
//
//  Load this file FIRST (before core.js and the feature modules).
//  Requires serving over HTTP (fetch() fails on file://).
// ============================================================

const PW_PARTIALS = [
  { id: 'screen-login',   file: 'screen-login.html' },
  { id: 'screen-forgot',  file: 'screen-forgot.html' },
  { id: 'screen-signup',  file: 'screen-signup.html' },
  { id: 'screen-app',     file: 'screen-app.html' },
  { id: 'screen-overlay', file: 'overlay.html' }
];

async function loadPartials() {
  for (const p of PW_PARTIALS) {
    const target = document.getElementById(p.id);
    if (!target) {
      console.warn('loader: missing placeholder #' + p.id);
      continue;
    }
    try {
      const res = await fetch(p.file);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      target.innerHTML = await res.text();
    } catch (err) {
      console.error('loader: failed to load ' + p.file, err);
      target.innerHTML = '<div class="empty-msg"><p>Failed to load ' + p.file +
        '. Serve the portal over HTTP (e.g. python3 -m http.server).</p></div>';
    }
  }
  // Signal that all HTML partials are in the DOM.
  document.dispatchEvent(new CustomEvent('pw:html-ready'));
}

document.addEventListener('DOMContentLoaded', loadPartials);