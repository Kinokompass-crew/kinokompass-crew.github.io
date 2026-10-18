'use strict';
/* ════════════ Kinokompass – Darstellung & Gefühl ════════════
   Modi Dunkel / Hell / Kino (schwarz-gold mit Vorhang), Profilfarbe als Akzent, Startanimation, Konfetti,
   Poster-Übergang in die Details (FLIP), großer „Tipp des Tages“ auf der Startseite.
   Lädt im <head> (vor allem anderen), damit Modus und Farbe ohne Aufblitzen gesetzt sind. */

(function applyEarly() {
  try {
    const s = JSON.parse(localStorage.getItem('kino.settings')) || {}, pr = JSON.parse(localStorage.getItem('kino.profiles')) || {};
    const cur = (pr.list || []).find(p => p.id === pr.current);
    document.documentElement.dataset.theme = s.theme || 'dark';
    if (cur?.color) document.documentElement.style.setProperty('--acc', cur.color);
    if (s.splash === false) document.documentElement.classList.add('no-splash');
  } catch (_) { }
})();

const THEMES = [{ key: 'dark', label: 'Dunkel', icon: '🌙' }, { key: 'light', label: 'Hell', icon: '☀️' }, { key: 'kino', label: 'Kino', icon: '🎭' }];
const PROFILE_COLORS = ['#f5b942', '#f87171', '#fb923c', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#2dd4bf'];
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function applyTheme() {
  const r = document.documentElement;
  r.dataset.theme = settings.theme || 'dark';
  const c = curProfile()?.color;
  if (c) r.style.setProperty('--acc', c); else r.style.removeProperty('--acc');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor || '#101014');
}

/* ─── Startanimation (bzw. Vorhang im Kino-Modus) ─── */
function runSplash() {
  const sp = document.getElementById('splash');
  if (!sp) return;
  if (settings.splash === false || reducedMotion()) { sp.remove(); return; }
  if (settings.theme === 'kino') { sp.remove(); curtain(); return; }
  setTimeout(() => { sp.classList.add('gone'); setTimeout(() => sp.remove(), 500); }, 1200);
}
// Kinovorhang: geschlossen mit Titel, dann öffnet er sich zur Seite
function curtain() {
  if (reducedMotion()) return;
  document.querySelector('.curtain')?.remove();
  const c = document.createElement('div'); c.className = 'curtain';
  c.innerHTML = `<div class="cur-valance"></div><div class="cur-l"></div><div class="cur-r"></div><div class="cur-title"><img src="icon.png" alt=""><span>Kinokompass</span></div>`;
  document.body.appendChild(c);
  setTimeout(() => { c.classList.add('open'); vib('heavy'); }, 900);
  setTimeout(() => c.remove(), 2700);
}

/* ─── Konfetti ─── */
function confetti(n = 120) {
  if (reducedMotion()) return;
  const cv = document.createElement('canvas'); cv.className = 'confetti';
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d'), cols = ['#f5b942', '#f87171', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6'];
  const parts = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 18 * devicePixelRatio, vy: (-Math.random() * 16 - 6) * devicePixelRatio, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4, s: (5 + Math.random() * 6) * devicePixelRatio, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  const step = t => {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) { p.vy += .5 * devicePixelRatio; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
    if (t - t0 < 2200) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}

/* ─── Poster fliegt in die Detailseite (FLIP) ─── */
let flipSrc = null;
document.addEventListener('click', e => {
  const t = e.target.closest('[data-open]');
  const img = t && !e.target.closest('[data-act],[data-fr],[data-xact]') ? t.querySelector('img.poster') : null;
  flipSrc = img ? { rect: img.getBoundingClientRect(), src: img.currentSrc || img.src, at: Date.now() } : null;
}, true);
function flipInto(p) {
  const f = flipSrc; flipSrc = null;
  if (!f || Date.now() - f.at > 800 || reducedMotion()) return false;
  const target = p.body.querySelector('.d-head .poster'); if (!target) return false;
  const to = target.getBoundingClientRect(); if (!to.width) return false;
  const fly = document.createElement('img'); fly.src = f.src; fly.className = 'flip-poster';
  Object.assign(fly.style, { left: f.rect.left + 'px', top: f.rect.top + 'px', width: f.rect.width + 'px', height: f.rect.height + 'px' });
  document.body.appendChild(fly);
  target.style.visibility = 'hidden';
  const a = fly.animate([{ transform: 'none' }, { transform: `translate(${to.left - f.rect.left}px, ${to.top - f.rect.top}px) scale(${to.width / f.rect.width}, ${to.height / f.rect.height})` }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  a.onfinish = () => { target.style.visibility = ''; fly.remove(); };
  return true;
}

/* ─── Großer „Tipp des Tages“ oben auf der Startseite ─── */
function heroTipHtml(list) {
  const today = new Date().toISOString().slice(0, 10);
  const pool = [...list].sort((a, b) => b.match - a.match).filter(c => c.backdrop).slice(0, 12); if (!pool.length) return ''; // nach Passung, nicht nach Mischung → bleibt den ganzen Tag gleich
  let h = 0; for (const ch of today + profiles.current) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const c = pool[Math.abs(h) % pool.length];
  return `<div class="hero-tip" data-open="${c.key}">
    <img class="hero-tip-bg" src="${poster(c.backdrop, 'w1280')}" alt="">
    <div class="hero-tip-fade"></div>
    <div class="hero-tip-main"><div class="hero-tip-label">⭐ Tipp des Tages</div><h2>${esc(c.title)}</h2>
      <div class="hero-tip-meta">${Object.keys(data.films).length >= 3 ? `<span class="match hi">${c.match} %</span>` : ''}<span class="tmdb">★ ${fmtNum(c.vote)}</span><span class="muted">${esc(metaLine(c))}</span></div>
      ${c.reasons?.[0] ? `<div class="why">${esc(c.reasons[0])}</div>` : ''}
      <div class="avail" data-avail="${c.key}"></div></div></div>`;
}

/* ─── Einstellungen: Darstellung ─── */
function themeSettingsCard() {
  return `<div class="card"><h3 class="sec">🎨 Darstellung</h3>
    <div class="segtabs">${THEMES.map(t => `<button class="${(settings.theme || 'dark') === t.key ? 'on' : ''}" data-th="theme" data-v="${t.key}">${t.icon} ${t.label}</button>`).join('')}</div>
    <label class="switch-row"><input type="checkbox" data-th="splash" ${settings.splash !== false ? 'checked' : ''}><span>Startanimation (im Kino-Modus: Vorhang)</span></label>
    <label class="switch-row"><input type="checkbox" data-th="haptics" ${settings.haptics !== false ? 'checked' : ''}><span>Vibration bei Noten, Treffern & Co.</span></label>
    <p class="small muted">Die Akzentfarbe stellst du je Profil ein: Profilbild → Bearbeiten.</p></div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-th]'); if (!t) return;
  const p = pages.at(-1);
  switch (t.dataset.th) {
    case 'theme': settings.theme = t.dataset.v; saveSettings(); applyTheme(); vib(); if (settings.theme === 'kino') curtain(); return p?.settings && renderSettings(p);
    case 'splash': settings.splash = t.checked; return saveSettings();
    case 'haptics': settings.haptics = t.checked; saveSettings(); return vib('success');
  }
});
