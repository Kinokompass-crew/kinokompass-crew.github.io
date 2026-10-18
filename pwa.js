'use strict';
/* ════════════ Kinokompass – Web-App (iPhone & Browser) ════════════
   Service Worker (Offline, schneller Start), Update-Hinweis, Installationshinweis („Zum Home-Bildschirm“),
   Mitteilungen über den Service Worker. Nicht in der Android-App (Capacitor) und nicht in der Mac-App (Electron). */

const isWebApp = () => !isNative() && !window.kinoDesktop && /^https?:$/.test(location.protocol);
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /[?&]ios=1/.test(location.search); // ?ios=1 nur zum Testen
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
let swReg = null, swWaiting = null, installEvt = null;

async function pwaBoot() {
  if (!isWebApp() || !('serviceWorker' in navigator)) return;
  // Beim Entwickeln (localhost) nur mit ?sw=1, sonst sieht man Änderungen erst beim zweiten Laden
  if (/^(localhost|127\.)/.test(location.hostname) && !/[?&]sw=1/.test(location.search)) return;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    const check = w => { if (w && navigator.serviceWorker.controller) { swWaiting = w; showPwaBanner(); } };
    if (swReg.waiting) check(swReg.waiting);
    swReg.addEventListener('updatefound', () => { const w = swReg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed') check(w); }); });
    // Nur nach einem echten Update neu laden – nicht beim allerersten Besuch (da übernimmt der Service Worker einfach)
    let reloaded = false; const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    setInterval(() => swReg.update().catch(() => { }), 30 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') swReg.update().catch(() => { }); });
  } catch (_) { }
}
// Android-Chrome: eigener „Installieren“-Knopf
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'fuerdich' && !pages.length) render(); });

function showPwaBanner() { if (view === 'fuerdich' && !pages.length) render(); }
// Karte oben auf der Startseite: Update bzw. Installationshinweis
function pwaCard() {
  if (!isWebApp()) return '';
  if (swWaiting) return `<button class="upd" data-pwa="update">⬆️ <b>Neue Version verfügbar</b> – antippen zum Aktualisieren</button>`;
  if (isStandalone() || localStorage.getItem('kino.pwa.hide')) return '';
  if (installEvt) return `<div class="card pwa-hint"><b>📲 Kinokompass als App installieren</b><p class="small muted">Eigenes Symbol, Vollbild, schneller Start – auch ohne Netz.</p><div class="row2"><button class="btn primary" data-pwa="install">Installieren</button><button class="btn ghost" data-pwa="hide">Später</button></div></div>`;
  if (isIOS()) return `<div class="card pwa-hint"><b>📲 Als App auf den Home-Bildschirm</b>
    <ol class="steps small"><li>Unten in Safari auf <b>Teilen</b> tippen (Quadrat mit Pfeil ⬆️)</li><li><b>„Zum Home-Bildschirm“</b> wählen</li><li>Ab dann Kinokompass über das neue Symbol öffnen – im Vollbild, wie eine echte App.</li></ol>
    <button class="btn ghost" data-pwa="hide">Ausblenden</button></div>`;
  return '';
}
// Mitteilung über den Service Worker (iPhone ab iOS 16.4 nur als Home-Bildschirm-App)
async function webNotify(body) {
  try { if (swReg && Notification.permission === 'granted') { await swReg.showNotification('Kinokompass', { body, icon: 'icon-192.png', badge: 'icon-192.png' }); return true; } } catch (_) { }
  return false;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-pwa]'); if (!t) return;
  switch (t.dataset.pwa) {
    case 'update': swWaiting?.postMessage('skip'); return;
    case 'install': if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; if (r?.outcome === 'accepted') toast('📲 Installiert!'); render(); } return;
    case 'hide': localStorage.setItem('kino.pwa.hide', '1'); return render();
  }
});
