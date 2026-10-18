'use strict';
/* ════════════ Kinokompass – Werkzeuge ════════════
   Reihen/Fortsetzungen · Doppelte · Export (Tabelle/Sicherung) · automatische Wochen-Sicherung ·
   Schnellmenü (lange drücken / Rechtsklick) · Suchvorschläge · Update-Hinweis (Android). */

/* ─── Dateien speichern: Android (Dokumente/Kinokompass + Teilen), Mac-App (Dokumente/Kinokompass), Browser (Download) ─── */
const FS = () => window.Capacitor?.Plugins?.Filesystem, SHARE = () => window.Capacitor?.Plugins?.Share;
async function saveFile(name, text, mime, share = true) {
  if (FS()) {
    await FS().writeFile({ path: `Kinokompass/${name}`, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
    if (share && SHARE()) { const { uri } = await FS().getUri({ path: `Kinokompass/${name}`, directory: 'DOCUMENTS' }); await SHARE().share({ title: name, url: uri }).catch(() => { }); }
    return `Dokumente/Kinokompass/${name}`;
  }
  if (window.kinoDesktop?.saveFile) return await window.kinoDesktop.saveFile(name, text, share);
  // iPhone/Web: Datei über das Teilen-Menü weitergeben (Dateien-App, Mail, AirDrop …), sonst normaler Download
  try { const file = new File([text], name, { type: mime }); if (share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return 'geteilt'; } } catch (e) { if (e.name === 'AbortError') return 'abgebrochen'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return 'Downloads/' + name;
}

/* ─── Export ─── */
const csvCell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function ratingsCsv() {
  const head = ['Titel', 'Art', 'Jahr', 'Note', 'Bauchgefühl', 'Nochmal schauen', 'Gesehen am', 'Genres', 'TMDB-Wertung', 'Kommentar', ...DIMS.map(d => d.label)];
  const rows = Object.values(data.films).sort((a, b) => b.note - a.note || a.title.localeCompare(b.title, 'de')).map(f => [
    f.title, f.kind === 'tv' ? 'Serie' : 'Film', f.year, f.note, FEELINGS.find(x => x.key === f.feeling)?.label || '', REWATCH.find(x => x.key === f.rewatch)?.label || '',
    f.seen ? new Date(f.seen + 'T12:00').toLocaleDateString('de-DE') : '', genreNames(f.genres).join(', '), String(f.vote || '').replace('.', ','), f.comment || '',
    ...DIMS.map(d => f.dims ? LEVELS[f.dims[d.key] || 0] : '')]);
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n'); // BOM + Semikolon: Excel öffnet es auf Deutsch richtig
}
function fullBackup() {
  const all = {}; for (const p of liveProfiles()) all[p.id] = p.id === profiles.current ? data : loadData(p.id);
  return JSON.stringify({ app: 'kinokompass', v: 1, at: new Date().toISOString(), profiles: profiles.list, data: all }, null, 1);
}
function openExport() {
  const p = openPage('📤 Export & Sicherung'); p.exp = true;
  const n = Object.keys(data.films).length;
  p.body.innerHTML = `<div class="card"><h3 class="sec">📊 Als Tabelle</h3><p class="small muted">Alle ${n} Bewertungen von ${esc(curProfile().name)} mit Note, Bauchgefühl, Kommentar und Kurz-Abfrage – öffnet sich in Excel, Numbers oder Google Tabellen.</p>
      <button class="btn primary" data-tool="csv">Tabelle speichern</button></div>
    <div class="card"><h3 class="sec">🗄️ Komplette Sicherung</h3><p class="small muted">Alle Profile, Bewertungen, Merklisten und Fortschritte als Datei. Wiederherstellen unter ⚙️ → Daten → Importieren.</p>
      <button class="btn" data-tool="json">Sicherung speichern</button></div>
    ${autoBackupCard()}`;
}

/* ─── Automatische Wochen-Sicherung (Android & Mac-App) ─── */
const canAutoBackup = () => !!(FS() || window.kinoDesktop?.saveFile);
function autoBackupCard() {
  const last = +(localStorage.getItem('kino.backup.last') || 0);
  return `<div class="card"><h3 class="sec">🔄 Automatische Sicherung</h3>
    ${canAutoBackup() ? `<label class="switch-row"><input type="checkbox" data-tool="autobk" ${settings.autoBackup !== false ? 'checked' : ''}><span>Einmal pro Woche eine Sicherung in <b>Dokumente/Kinokompass</b> ablegen (die letzten 6 bleiben)</span></label>
      <p class="small muted">Letzte Sicherung: ${last ? new Date(last).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : 'noch keine'}</p><button class="btn" data-tool="backupnow">Jetzt sichern</button>`
      : '<p class="small muted">Gibt es in der Handy- und der Mac-App. Im Browser bitte „Sicherung speichern“ nutzen. Deine Daten liegen außerdem im GitHub-Sync.</p>'}</div>`;
}
async function autoBackup(force) {
  if (!canAutoBackup() || (settings.autoBackup === false && !force)) return;
  const last = +(localStorage.getItem('kino.backup.last') || 0);
  if (!force && Date.now() - last < 7 * 864e5) return;
  const name = `sicherung-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    await saveFile(name, fullBackup(), 'application/json', false);
    localStorage.setItem('kino.backup.last', String(Date.now()));
    // nur die letzten 6 behalten
    if (FS()) {
      const r = await FS().readdir({ path: 'Kinokompass', directory: 'DOCUMENTS' }).catch(() => null);
      const old = (r?.files || []).map(f => f.name || f).filter(n => /^sicherung-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().slice(0, -6);
      for (const n of old) await FS().deleteFile({ path: `Kinokompass/${n}`, directory: 'DOCUMENTS' }).catch(() => { });
    } else await window.kinoDesktop?.pruneBackups?.(6);
    if (force) toast('✓ Gesichert: Dokumente/Kinokompass/' + name);
  } catch (e) { if (force) toast('Sicherung fehlgeschlagen: ' + e.message); }
}

/* ─── Doppelte ─── */
const dupIgnored = () => { try { return JSON.parse(localStorage.getItem('kino.dupignore')) || []; } catch (_) { return []; } };
const dupId = g => g.map(f => f.key).sort().join('+');
function openDups() {
  const p = openPage('🧹 Doppelte Einträge'); p.dups = true; renderDups(p);
}
function renderDups(p) {
  const groups = findDuplicates(data.films).filter(g => !dupIgnored().includes(dupId(g)));
  p.body.innerHTML = groups.length ? `<p class="small muted">Diese Titel sehen aus wie derselbe Film (z. B. Kinofassung und Extended Cut). Tippe bei dem, den du behalten willst, auf „Behalten“ – die anderen werden gelöscht.</p>`
    + groups.map(g => `<div class="card dup">${g.map(f => `<div class="dup-row">${posterImg(f, 'w92')}<div class="dup-main"><b>${esc(f.title)}</b><span class="small muted">${esc(f.year || '')} · Note ${f.note}${f.seen ? ' · ' + new Date(f.seen + 'T12:00').toLocaleDateString('de-DE') : ''}${f.comment ? ' · 💬' : ''}${f.dims ? ' · Kurz-Abfrage' : ''}</span></div><button class="mini" data-tool="keep" data-key="${f.key}" data-group="${esc(dupId(g))}">Behalten</button></div>`).join('')}
      <button class="mini ghost" data-tool="notdup" data-group="${esc(dupId(g))}">Sind verschiedene Filme</button></div>`).join('')
    : `<div class="empty">✨ Keine doppelten Einträge gefunden.</div>`;
}

/* ─── Merkliste aufräumen (über ein halbes Jahr gemerkt) ─── */
function openStale() {
  const p = openPage('🧹 Merkliste aufräumen');
  const draw = () => {
    const list = Object.values(data.watch).filter(f => Date.now() - (f.added || f.ts) > 182 * 864e5).sort((a, b) => (a.added || a.ts) - (b.added || b.ts));
    p.body.innerHTML = list.length ? `<p class="small muted">Willst du die noch sehen?</p>` + list.map(f => `<div class="card dup-row">${posterImg(f, 'w92')}<div class="dup-main"><b>${esc(f.title)}</b><span class="small muted">gemerkt am ${new Date(f.added || f.ts).toLocaleDateString('de-DE')}</span></div>
      <button class="mini" data-tool="keepwatch" data-key="${f.key}">Ja</button><button class="mini ghost" data-tool="dropwatch" data-key="${f.key}">Nein</button></div>`).join('')
      : '<div class="empty">✨ Alles aufgeräumt.</div>';
  };
  p.draw = draw; draw();
}

/* ─── Reihen & Fortsetzungen (Details) ─── */
async function fillCollection(p) {
  const d = p.item, box = p.body.querySelector('[data-coll]'); if (!box || !d.collection) return;
  try {
    const c = await tmdb(`/collection/${d.collection.id}`);
    const parts = (c.parts || []).filter(x => x.release_date).sort((a, b) => a.release_date.localeCompare(b.release_date)).map(x => slim(x, 'movie'));
    if (parts.length < 2 || !p.body.contains(box)) return;
    remember(parts);
    const idx = parts.findIndex(x => x.key === d.key), seen = parts.map(x => !!data.films[x.key]);
    const lastSeen = seen.lastIndexOf(true), next = parts.find((x, i) => i > lastSeen && !seen[i] && x.year <= String(new Date().getFullYear()));
    const upcoming = parts.filter(x => x.year > String(new Date().getFullYear()) || (x.year === String(new Date().getFullYear()) && !x.votes));
    box.innerHTML = `<div class="coll"><div class="prog-h">📚 ${esc(c.name.replace(/ - Filmreihe| Filmreihe| Collection/i, ''))} – Teil ${idx + 1} von ${parts.length}</div>
      <div class="small muted">${seen.filter(Boolean).length} von ${parts.length} gesehen${next && next.key !== d.key ? ` · als Nächstes: <b>${esc(next.title)}</b>` : ''}${upcoming.length ? ` · ${upcoming.length} noch nicht erschienen` : ''}</div>
      <div class="hscroll">${parts.map((x, i) => `<div class="mp ${x.key === d.key ? 'cur' : ''}" data-open="${x.key}">${posterImg(data.films[x.key] || x, 'w185')}<span class="part-no">${i + 1}</span>${data.films[x.key] ? `<span class="note ${noteClass(data.films[x.key].note)} corner">${data.films[x.key].note}</span>` : ''}<div class="mp-t">${esc(x.title)}</div><div class="mp-k">${x.year || 'bald'}</div></div>`).join('')}</div></div>`;
  } catch (_) { }
}

/* ─── Schnellmenü: lange drücken (Handy) bzw. Rechtsklick (Mac) auf ein Poster/eine Karte ─── */
let lpTimer = 0, lpStart = null, lpFired = false;
// Länger drücken (0,8 s), damit es nicht aus Versehen aufgeht; ab 0,3 s gibt das Element sichtbar nach
let lpArm = 0, lpEl = null;
const lpCancel = () => { clearTimeout(lpTimer); clearTimeout(lpArm); lpEl?.classList.remove('lp-arm'); lpEl = null; lpStart = null; };
document.addEventListener('touchstart', e => {
  const t = e.target.closest('[data-open]'); if (!t || e.touches.length > 1 || e.target.closest('.qmenu')) return;
  lpStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lpFired = false; lpEl = t;
  lpArm = setTimeout(() => t.classList.add('lp-arm'), 300);
  lpTimer = setTimeout(() => { lpFired = true; t.classList.remove('lp-arm'); vib('heavy'); openQuick(t.dataset.open); }, 800);
}, { passive: true });
document.addEventListener('touchmove', e => { if (lpStart && Math.hypot(e.touches[0].clientX - lpStart.x, e.touches[0].clientY - lpStart.y) > 10) lpCancel(); }, { passive: true });
document.addEventListener('touchend', lpCancel, { passive: true });
document.addEventListener('touchcancel', lpCancel, { passive: true });
document.addEventListener('click', e => { if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('contextmenu', e => { const t = e.target.closest('[data-open]'); if (!t) return; e.preventDefault(); openQuick(t.dataset.open); });
async function openQuick(key) {
  document.querySelector('.qmenu')?.remove();
  const b = lookup(key); if (!b) return;
  const rated = data.films[key], watched = !!data.watch[key];
  const m = document.createElement('div'); m.className = 'qmenu';
  m.innerHTML = `<div class="qm-bg"></div><div class="qm-sheet"><div class="qm-head">${posterImg(b, 'w92')}<div><b>${esc(b.title)}</b><div class="small muted">${esc(metaLine(b))}${rated ? ` · Du: ${rated.note}` : ''}</div><div class="avail" data-avail="${key}"></div></div></div>
    <div class="qm-list">
      <button data-q="open">📄 Details</button>
      ${rated ? '' : `<button data-q="${watched ? 'unwatch' : 'watch'}">${watched ? '✓ Von der Merkliste nehmen' : '🔖 Merken'}</button>`}
      <button data-q="rate">${rated ? '✎ Bewertung ändern' : '⭐ Bewerten'}</button>
      <button data-q="play" hidden>▶ Schauen</button>
      <button data-q="trailer" hidden>🎞️ Trailer</button>
      <button data-q="chain">🔗 Ähnliches finden</button>
      ${frReady() && friendList().length ? '<button data-q="recommend">📨 Empfehlen</button>' : ''}
      ${rated ? '' : '<button data-q="hide">✕ Kein Interesse</button>'}
    </div></div>`;
  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add('open'));
  fillAvail(m);
  const close = () => { m.classList.remove('open'); const s = m.querySelector('.qm-sheet'); s.style.transform = ''; setTimeout(() => m.remove(), 220); };
  m.querySelector('.qm-bg').onclick = close;
  // Nach unten wischen schließt das Menü
  const sheet = m.querySelector('.qm-sheet'); let sy = null, dy = 0;
  sheet.addEventListener('touchstart', e => { sy = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (sy == null) return; dy = Math.max(0, e.touches[0].clientY - sy); if (dy > 4) { e.preventDefault(); sheet.style.transform = `translateY(${dy}px)`; } }, { passive: false });
  sheet.addEventListener('touchend', () => { sheet.style.transition = ''; if (dy > 70) { vib(); close(); } else sheet.style.transform = ''; sy = null; });
  // Trailer und „Schauen“ erst zeigen, wenn bekannt
  getAvail(key).then(av => { if (av?.mine.length) { const btn = m.querySelector('[data-q="play"]'); btn.hidden = false; btn.textContent = `▶ Bei ${av.mine[0].name} schauen`; btn.dataset.svc = av.mine[0].key; } });
  details(parseKey(key).kind, parseKey(key).id).then(d => { known.set(key, { ...b, ...d }); if (d.trailer) m.querySelector('[data-q="trailer"]').hidden = false; }).catch(() => { });
  m.querySelector('.qm-list').onclick = e => {
    const q = e.target.closest('[data-q]')?.dataset.q; if (!q) return;
    close();
    if (q === 'open') return openItem(key);
    if (q === 'watch') { setWatch(key, true); dropRec(key); toast('🔖 Gemerkt'); return refresh(); }
    if (q === 'unwatch') { setWatch(key, false); return refresh(); }
    if (q === 'rate') return openRate(key);
    if (q === 'play') return openService(key, e.target.closest('[data-q]').dataset.svc);
    if (q === 'trailer') return openTrailer(key);
    if (q === 'chain') return openChain(key);
    if (q === 'recommend') return openRecommend(key);
    if (q === 'hide') { data.hidden[key] = stamp(); save(); dropRec(key); toast('Ausgeblendet'); return refresh(); }
  };
}

/* ─── Suchvorschläge: zuletzt gesucht + gerade beliebt ─── */
const recentSearches = () => { try { return JSON.parse(localStorage.getItem('kino.searches')) || []; } catch (_) { return []; } };
function rememberSearch(q) {
  q = q.trim(); if (q.length < 2) return;
  const l = [q, ...recentSearches().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  localStorage.setItem('kino.searches', JSON.stringify(l));
}
function searchSuggestHtml() {
  const rec = recentSearches(), pop = [...known.values()].filter(m => trendKeys.has(m.key) && !isBlocked(m)).slice(0, 10);
  return (rec.length ? `<h3 class="sec">🕘 Zuletzt gesucht</h3><div class="moods">${rec.map(q => `<button class="chip" data-sq="${esc(q)}">${esc(q)}</button>`).join('')}<button class="chip ghost" data-sq="__clear">✕ leeren</button></div>` : '')
    + (pop.length ? `<h3 class="sec">🔥 Gerade beliebt</h3><div class="moods">${pop.map(m => `<button class="chip" data-open="${m.key}">${esc(m.title)}</button>`).join('')}</div>` : '');
}

/* ─── Update-Hinweis (Android) ─── */
async function checkUpdate() {
  const App = window.Capacitor?.Plugins?.App; if (!App || !isNative()) return;
  const last = +(localStorage.getItem('kino.upd.last') || 0); if (Date.now() - last < 6 * 3600e3) return;
  localStorage.setItem('kino.upd.last', String(Date.now()));
  try {
    const info = await App.getInfo(), mine = +info.build || 0;
    let rel = null;
    if (frReady()) rel = await fgh(`/repos/${fr.repo}/releases/tags/app-latest`).catch(() => null);
    if (!rel && syncReady()) rel = await gh(`/repos/Brownyay/ClaudeWorkspace/releases/tags/kinokompass-latest`).catch(() => null);
    const n = +((rel?.body || '').match(/Build (\d+)/)?.[1] || 0);
    if (n > mine) { localStorage.setItem('kino.upd.avail', JSON.stringify({ n, url: rel.html_url })); if (view === 'fuerdich' && !pages.length) render(); }
    else localStorage.removeItem('kino.upd.avail');
  } catch (_) { }
}
function updateBanner() {
  let u = null; try { u = JSON.parse(localStorage.getItem('kino.upd.avail')); } catch (_) { }
  return u ? `<a class="upd" href="${esc(u.url)}" target="_blank" rel="noopener">⬆️ <b>Neue Version verfügbar</b> (Build ${u.n}) – antippen, APK laden und drüber installieren</a>` : '';
}

/* ─── Klicks ─── */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tool],[data-sq]'); if (!t) return;
  const p = pages.at(-1);
  if (t.dataset.sq) {
    if (t.dataset.sq === '__clear') { localStorage.removeItem('kino.searches'); return showSearch(); }
    searchQ = t.dataset.sq; const inp = $('#q'); if (inp) inp.value = searchQ; return runSearch();
  }
  switch (t.dataset.tool) {
    case 'export': return openExport();
    case 'csv': { try { const where = await saveFile(`kinokompass-${curProfile().name.toLowerCase().replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, ratingsCsv(), 'text/csv'); toast('✓ Gespeichert: ' + where); } catch (err) { toast('Speichern fehlgeschlagen: ' + err.message); } return; }
    case 'json': { try { const where = await saveFile(`kinokompass-sicherung-${new Date().toISOString().slice(0, 10)}.json`, fullBackup(), 'application/json'); toast('✓ Gespeichert: ' + where); } catch (err) { toast('Speichern fehlgeschlagen: ' + err.message); } return; }
    case 'autobk': settings.autoBackup = t.checked; saveSettings(); return;
    case 'backupnow': await autoBackup(true); if (p?.exp) { closePage(); openExport(); } return;
    case 'dups': return openDups();
    case 'keep': {
      const keep = t.dataset.key, ids = t.dataset.group.split('+').filter(k => k !== keep);
      if (!confirm(`${ids.length} andere${ids.length > 1 ? '' : 'n'} Eintrag löschen und „${data.films[keep]?.title}“ behalten?`)) return;
      ids.forEach(k => { delete data.films[k]; data.tomb['films:' + k] = stamp(); }); save(); vib('success'); toast('Aufgeräumt'); return renderDups(p);
    }
    case 'notdup': { const l = dupIgnored(); l.push(t.dataset.group); localStorage.setItem('kino.dupignore', JSON.stringify(l)); return renderDups(p); }
    case 'stale': return openStale();
    case 'keepwatch': { const w = data.watch[t.dataset.key]; if (w) { w.added = Date.now(); w.ts = stamp(); save(); } return p.draw(); }
    case 'dropwatch': setWatch(t.dataset.key, false); return p.draw();
  }
});

/* ─── Start ─── */
function toolsBoot() {
  setTimeout(() => autoBackup(), 10000);
  setTimeout(() => checkUpdate(), 6000);
}

/* ─── Tastenkürzel (Mac/Browser): / = Suche, 1–6 = Tabs, n = neu mischen, Esc = zurück (app.js) ─── */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input,textarea,select')) return;
  const order = Object.keys(VIEWS);
  if (e.key === '/') { e.preventDefault(); closeAllPages(); go('suche'); setTimeout(() => $('#q')?.focus(), 60); }
  else if (/^[1-9]$/.test(e.key) && order[+e.key - 1]) { closeAllPages(); go(order[+e.key - 1]); }
  else if (e.key === 'n' && view === 'fuerdich' && !pages.length) shuffleRecs();
});
