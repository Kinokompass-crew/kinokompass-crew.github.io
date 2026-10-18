'use strict';
/* ════════════ Kinokompass – Oberfläche ════════════
   Tabs unten: Für dich · Trends · Suchen · Meine · Merkliste. Einstellungen über das Zahnrad.
   Details, Bewerten, Listen, Trailer und Einstellungen öffnen als Vollbild-Seiten (Stapel):
   zurück per Wischen nach rechts oder unten, Zurück-Pfeil, Android-Zurück-Taste oder Esc.
   Jeder Eintrag hat einen Schlüssel „m123“ (Film) bzw. „t456“ (Serie). */

/* ─── Speicher ─── */
const SET_KEY = 'kino.settings', PROF_KEY = 'kino.profiles';
const load = (k, d) => { try { return { ...d, ...(JSON.parse(localStorage.getItem(k)) || {}) }; } catch (_) { return { ...d }; } };
/* ─── Profile („Wer schaut?“) ───
   Jedes Profil hat eigene Bewertungen, Merkliste, Fortschritt (eigener Speicher und eigene Sync-Datei).
   Gemeinsam: Schlüssel, Dienste, Land. Profil „p1“ nutzt die alten Speicherorte (kino.v1, filme.json). */
const profiles = load(PROF_KEY, { list: [{ id: 'p1', name: 'Ich', emoji: '🍿', ts: 0 }], current: 'p1', ask: true });
const liveProfiles = () => profiles.list.filter(p => !p.deleted);
const curProfile = () => profiles.list.find(p => p.id === profiles.current && !p.deleted) || liveProfiles()[0];
if (!curProfile() || curProfile().id !== profiles.current) profiles.current = (curProfile() || { id: 'p1' }).id;
const dataKey = (id = profiles.current) => id === 'p1' ? 'kino.v1' : 'kino.v1.' + id;
function saveProfiles() { try { localStorage.setItem(PROF_KEY, JSON.stringify(profiles)); } catch (_) { } }
const EMPTY = () => ({ v: 1, films: {}, watch: {}, progress: {}, hidden: {}, tomb: {} });
function loadData(id) { const d = migrateData(load(dataKey(id), EMPTY())); if (!d.progress) d.progress = {}; return d; }
const settings = load(SET_KEY, { apiKey: '', region: 'DE', onlyMine: true });
if (!Array.isArray(settings.myServices)) { settings.myServices = [...DEFAULT_SERVICES]; settings.onlyMine = true; delete settings.myProviders; }
if (!Array.isArray(settings.block)) settings.block = ['anime', '16']; // Nutzerwunsch: keine Anime, keine Animationsfilme
let data = loadData(profiles.current);
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (_) { } }
function save() { try { localStorage.setItem(dataKey(), JSON.stringify(data)); } catch (_) { } syncAfterChange(); if (typeof friendsSyncSoon === 'function') friendsSyncSoon(); }
saveSettings(); saveProfiles(); try { localStorage.setItem(dataKey(), JSON.stringify(data)); } catch (_) { }
function replaceData(d) {
  const next = { v: 1, films: {}, watch: {}, progress: {}, hidden: {}, tomb: {}, ...migrateData(d) };
  if (JSON.stringify(next) === JSON.stringify(data)) return; // nichts Neues → Ansicht nicht stören
  data = next; try { localStorage.setItem(dataKey(), JSON.stringify(data)); } catch (_) { }
  if (!pages.length && view !== 'suche') render();
}

/* ─── Helfer ─── */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const genreNames = gs => (gs || []).map(g => GENRES[g]).filter(Boolean);
const LEVELS_SHORT = ['nein', 'kaum', 'etwas', 'ziemlich', 'sehr'];
const noteClass = n => n >= 8 ? 'n-top' : n >= 6 ? 'n-gut' : n >= 4 ? 'n-mid' : 'n-low';
const fmtVotes = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + ' Tsd.' : String(n);
const fmtNum = v => String(v).replace('.', ',');
const parseKey = k => ({ kind: k[0] === 't' ? 'tv' : 'movie', id: +k.slice(1) });
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
const stamp = () => Date.now();
const baseOf = m => ({ key: m.key, id: m.id, kind: m.kind || 'movie', title: m.title, year: m.year, poster: m.poster, genres: m.genres, vote: m.vote, votes: m.votes });
const known = new Map(); // alles, was gerade irgendwo angezeigt wird (für Merken/Bewerten ohne neue Anfrage)
const remember = list => { list.forEach(m => known.set(m.key, m)); return list; };
const lookup = key => known.get(key) || data.films[key] || data.watch[key];
const metaLine = f => [f.kind === 'tv' ? 'Serie' : 'Film', f.year, ...genreNames(f.genres).slice(0, 2)].filter(Boolean).join(' · ');
function posterImg(f, size) {
  return f.poster ? `<img class="poster" loading="lazy" src="${poster(f.poster, size)}" alt="">`
    : `<div class="poster ph"><span>${esc((f.title || '?').slice(0, 2))}</span></div>`;
}
function toast(msg, undo) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Rückgängig</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
  document.body.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, undo ? 4500 : 2600);
}
// Vibration: 'light' (Antippen), 'heavy', 'success', 'error' – abschaltbar in den Einstellungen
const vib = (k = 'light') => {
  if (settings.haptics === false) return;
  try {
    const H = window.Capacitor?.Plugins?.Haptics;
    if (H) { if (k === 'success' || k === 'error') H.notification({ type: k === 'success' ? 'SUCCESS' : 'ERROR' }); else H.impact({ style: k === 'heavy' ? 'HEAVY' : 'LIGHT' }); }
    else navigator.vibrate?.(k === 'success' ? [15, 50, 30] : k === 'error' ? [40, 40, 40] : k === 'heavy' ? 30 : 10);
  } catch (_) { }
};
// Mehrere Anfragen, aber höchstens n gleichzeitig
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const x = items[i++]; await fn(x); } })); }

/* ─── Verfügbarkeit bei meinen Diensten ─── */
const availCache = new Map();
function getAvail(key) {
  if (!availCache.has(key)) { const { kind, id } = parseKey(key); availCache.set(key, watchProviders(kind, id).then(availability).catch(() => null)); }
  return availCache.get(key);
}
const svcLogo = s => serviceLogo(s) ? `<img class="slogo" src="${logo(serviceLogo(s))}" alt="">` : '';
function availBadge(av) {
  if (!av) return '';
  if (av.mine.length) return `<span class="av yes">✓ ${av.mine.slice(0, 3).map(s => `${svcLogo(s)}${esc(s.name)}`).join(' · ')}</span>`;
  return `<span class="av no">✗ Nicht bei deinen Diensten${av.rent.length || av.buy.length ? ' · nur leihen/kaufen' : ''}</span>`;
}
// Platzhalter [data-avail] (Zeile) und [data-avail-dot] (Häkchen am Poster) befüllen
async function fillAvail(root) {
  const els = [...root.querySelectorAll('[data-avail]:not([data-filled]),[data-avail-dot]:not([data-filled])')];
  els.forEach(el => el.dataset.filled = '1');
  await pool(els, 6, async el => {
    const av = await getAvail(el.dataset.avail || el.dataset.availDot);
    if (el.dataset.avail) el.innerHTML = availBadge(av);
    else if (av?.mine.length) { el.classList.add('yes'); el.title = 'Bei ' + av.mine.map(s => s.name).join(', '); el.textContent = '✓'; }
  });
}

/* ─── Navigation ─── */
const VIEWS = {
  fuerdich: { label: 'Für dich', icon: '✨', render: renderForYou },
  trends: { label: 'Trends', icon: '🔥', render: renderTrends },
  suche: { label: 'Suchen', icon: '🔍', render: renderSearch },
  meine: { label: 'Meine', icon: '🎬', title: 'Meine Filme & Serien', render: renderMine },
  freunde: { label: 'Freunde', icon: '👥', render: el => renderFriendsTab(el) },
  merk: { label: 'Merkliste', icon: '🔖', render: renderWatch }
};
let view = 'fuerdich';
function go(v) { view = v; render(); window.scrollTo(0, 0); }
function render() {
  $('#title').textContent = VIEWS[view].title || VIEWS[view].label;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.go === view));
  const el = $('#view'); el.className = 'view v-' + view;
  VIEWS[view].render(el);
}
const kindSeg = (cur, attr) => `<div class="segtabs">${[['alle', 'Alle'], ['movie', 'Filme'], ['tv', 'Serien']].map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-${attr}="${k}">${l}</button>`).join('')}</div>`;

/* ════════════ Vollbild-Seiten mit Wisch-Geste ════════════ */
const pages = [];
function openPage(title, opts = {}) {
  const el = document.createElement('div'); el.className = 'page ' + (opts.cls || '') + (opts.fade ? ' fade' : '');
  el.innerHTML = `<div class="page-bar"><button class="back" aria-label="Zurück">‹</button><div class="page-title">${esc(title)}</div></div><div class="page-body"></div>`;
  $('#pages').appendChild(el);
  const p = { el, body: $('.page-body', el), title: $('.page-title', el), onClose: opts.onClose };
  pages.push(p);
  $('.back', el).onclick = () => closePage();
  attachSwipe(p);
  document.body.classList.add('noscroll');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  return p;
}
function closePage() {
  const p = pages.pop(); if (!p) return false;
  if (!p.el.classList.contains('gone-x') && !p.el.classList.contains('gone-y')) p.el.style.transform = '';
  p.el.classList.remove('in'); p.el.classList.add('out');
  setTimeout(() => p.el.remove(), 300);
  if (!pages.length) document.body.classList.remove('noscroll');
  p.onClose?.();
  return true;
}
function closeAllPages() { while (pages.length) closePage(); }
// Nach rechts wischen (überall) oder nach unten wischen (wenn ganz oben) schließt die Seite
function attachSwipe(p) {
  const el = p.el; let sx = 0, sy = 0, dx = 0, dy = 0, mode = null, t0 = 0;
  el.addEventListener('touchstart', e => {
    if (e.touches.length > 1 || e.target.closest('.hscroll,.chips,.seg,input,textarea,select,iframe,.noswipe')) { mode = 'off'; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0; mode = null; t0 = Date.now();
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (mode === 'off') return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (!mode) {
      if (dx > 14 && dx > Math.abs(dy) * 1.4) mode = 'x';
      else if (dy > 14 && dy > Math.abs(dx) * 1.4 && p.body.scrollTop <= 0) mode = 'y';
      else if (Math.abs(dx) > 14 || Math.abs(dy) > 14) { mode = 'off'; return; }
      else return;
      el.classList.add('drag');
    }
    e.preventDefault();
    el.style.transform = mode === 'x' ? `translateX(${Math.max(0, dx)}px)` : `translateY(${Math.max(0, dy)}px)`;
  }, { passive: false });
  el.addEventListener('touchend', () => {
    if (mode !== 'x' && mode !== 'y') { mode = null; return; }
    const d = mode === 'x' ? dx : dy, v = d / Math.max(1, Date.now() - t0);
    el.classList.remove('drag');
    if (d > (mode === 'x' ? 90 : 120) || (d > 40 && v > 0.6)) { el.classList.add(mode === 'x' ? 'gone-x' : 'gone-y'); el.style.transform = ''; vib(); closePage(); }
    else el.style.transform = '';
    mode = null;
  });
}

/* ════════════ Für dich (Vorschläge) ════════════ */
let recState = { sig: '', list: null, err: '', loading: null };
let recFilter = 'alle', recKind = 'alle';
const trendKeys = new Set(); // was diese Woche im Trend ist (für das 🔥-Abzeichen)
function dataSig() {
  return [Object.values(data.films).map(f => f.key + ':' + f.ts).join(','), Object.keys(data.hidden).length, Object.keys(data.watch).join(','), settings.region, settings.myServices.join('|'), (settings.block || []).join(','), JSON.stringify(settings.years || {})].join('#');
}
async function buildRecs() {
  const films = Object.values(data.films);
  const profile = tasteProfile(data.films), table = genreDimTable(data.films);
  const cands = new Map();
  const add = (m, src, tag) => {
    if (data.films[m.key] || data.hidden[m.key] || data.watch[m.key] || isBlocked(m)) return;
    let c = cands.get(m.key); if (!c) { c = { ...m, sources: [], tags: [] }; cands.set(m.key, c); }
    if (src && !c.sources.some(x => x.key === src.key)) c.sources.push(src);
    if (tag && !c.tags.some(x => x.name === tag.name)) c.tags.push(tag);
  };
  await ensureFeatures(); // Themen & Personen deiner Titel (beim ersten Mal höchstens 4 s warten)
  const jobs = [];
  smartCandidates(add, jobs);
  const safe = p => p.catch(() => []);
  const seeds = films.filter(f => f.note >= 7).sort((a, b) => b.note - a.note || b.ts - a.ts).slice(0, 10);
  const neg = films.filter(f => f.note <= 4).sort((a, b) => a.note - b.note).slice(0, 3);
  for (const f of [...seeds, ...neg]) jobs.push(safe(recommendationsFor(f.kind || 'movie', f.id)).then(l => l.forEach(m => add(m, { key: f.key, title: f.title, note: f.note }))));
  const topGenres = Object.entries(profile.genre).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => +g);
  const tvGenres = [...new Set(topGenres.map(g => TV_GENRE_OF[g]).filter(Boolean))];
  for (const g of topGenres) jobs.push(safe(discover('movie', { with_genres: g, sort_by: 'vote_average.desc', 'vote_count.gte': 1000 })).then(l => l.forEach(m => add(m))));
  for (const g of tvGenres) jobs.push(safe(discover('tv', { with_genres: g, sort_by: 'vote_average.desc', 'vote_count.gte': 400 })).then(l => l.forEach(m => add(m))));
  const ids = myServiceIds().join('|');
  if (ids) {
    const svc = { with_watch_providers: ids, with_watch_monetization_types: 'flatrate|free|ads' };
    // Vielfalt: jedes Mal andere Seiten und Sortierungen (sonst kommen immer dieselben 20 Titel)
    const rp = () => 1 + Math.floor(Math.random() * 6);
    for (const page of [1, rp(), rp()]) {
      jobs.push(safe(discover('movie', { ...svc, page, ...(topGenres.length ? { with_genres: topGenres.join('|') } : {}) })).then(l => l.forEach(m => add(m))));
      jobs.push(safe(discover('tv', { ...svc, page, ...(tvGenres.length ? { with_genres: tvGenres.join('|') } : {}) })).then(l => l.forEach(m => add(m))));
    }
    for (const sort of ['vote_average.desc', 'popularity.desc', 'primary_release_date.desc']) {
      jobs.push(safe(discover('movie', { ...svc, page: rp(), sort_by: sort, 'vote_count.gte': sort === 'primary_release_date.desc' ? 200 : 800 })).then(l => l.forEach(m => add(m))));
    }
    jobs.push(safe(discover('tv', { ...svc, page: rp(), sort_by: 'vote_average.desc', 'vote_count.gte': 300 })).then(l => l.forEach(m => add(m))));
    // ein zufälliges Jahrzehnt (im erlaubten Jahresbereich) – bringt auch ältere Perlen
    const from = Math.max(1960, +(settings.years?.from || 1960)), to = Math.min(new Date().getFullYear(), +(settings.years?.to || 9999));
    const dec = Math.floor((from + Math.random() * Math.max(1, to - from)) / 10) * 10;
    jobs.push(safe(discover('movie', { ...svc, 'primary_release_date.gte': `${dec}-01-01`, 'primary_release_date.lte': `${dec + 9}-12-31`, sort_by: 'vote_average.desc', 'vote_count.gte': 500 })).then(l => l.forEach(m => add(m))));
  }
  jobs.push(safe(trending('all', 1 + Math.floor(Math.random() * 2))).then(l => l.forEach(m => add(m))));
  await Promise.all(jobs);
  return remember([...cands.values()].map(c => smartBonus({ ...c, ...scoreCandidate(c, profile, table) })).sort((a, b) => b.match - a.match).slice(0, 300));
}
function ensureRecs() {
  const sig = dataSig();
  if (recState.sig === sig && (recState.list || recState.loading)) return;
  recCount = 40;
  recState = {
    sig, list: null, err: '', loading: buildRecs().then(l => { if (recState.sig === sig) { recState.list = l; recState.loading = null; recOrder = freshOrder(l); if (view === 'fuerdich') render(); } })
      .catch(e => { if (recState.sig === sig) { recState.err = e.message; recState.loading = null; if (view === 'fuerdich') render(); } })
  };
}
function dropRec(key) { if (recState.list) { recState.list = recState.list.filter(c => c.key !== key); recState.sig = dataSig(); } }
function renderForYou(el) {
  if (!settings.apiKey) return renderSetupKey(el);
  const n = Object.keys(data.films).length;
  ensureRecs();
  const chips = [{ key: 'alle', label: 'Alles', icon: '🎯' }, ...DIMS].map(d => `<button class="chip ${recFilter === d.key ? 'on' : ''}" data-recfilter="${d.key}">${d.icon} ${esc(d.label)}</button>`).join('');
  el.innerHTML = `
    ${updateBanner()}
    ${pwaCard()}
    <div id="heroTip"></div>
    ${forYouTop()}
    <div id="frCard">${inboxCard()}</div>
    ${calendarCard()}
    ${challengeCard()}
    ${n < 3 ? `<div class="card hint-card"><b>Je mehr du bewertest, desto besser passen die Vorschläge.</b><br>Bewerte mindestens 3 Filme oder Serien, die du kennst – am schnellsten über deinen Netflix-Verlauf.<button class="btn primary" data-nf="open">📥 Netflix-Verlauf importieren</button><button class="btn" data-go="suche">🔍 Suchen & bewerten</button></div>` : ''}
    ${trendStrip()}
    ${rewatchStrip()}
    <div class="recs-head"><h3 class="sec">✨ Für dich</h3><button class="btn shuffle" data-act="shuffle">🔀 Neu mischen</button></div>
    ${kindSeg(recKind, 'reckind')}
    <div class="chips">${chips}</div>
    <label class="switch-row"><input type="checkbox" id="onlyMine" ${settings.onlyMine ? 'checked' : ''}><span>Nur was ich bei <b>meinen Diensten</b> schauen kann</span></label>
    <div id="recs"></div>`;
  $('#onlyMine', el).addEventListener('change', e => { settings.onlyMine = e.target.checked; saveSettings(); render(); });
  const box = $('#recs', el);
  if (recState.err) { box.innerHTML = errorBox(recState.err); return; }
  if (!recState.list) { box.innerHTML = skeleton(4); return; }
  let list = recState.list.filter(c => recKind === 'alle' || c.kind === recKind);
  if (recFilter !== 'alle') list = list.filter(c => fitsDim(c.est, recFilter)).sort((a, b) => (b.match + b.est[recFilter] * 4) - (a.match + a.est[recFilter] * 4));
  if (recOrder) { const pos = new Map(recOrder.map((k, i) => [k, i])); list = [...list].sort((a, b) => (pos.get(a.key) ?? 1e9) - (pos.get(b.key) ?? 1e9)); }
  const show = l => {
    if (!l.length) { box.innerHTML = `<div class="empty">Keine passenden Vorschläge${settings.onlyMine ? ' bei deinen Diensten' : ''}.<br>${recFilter !== 'alle' ? 'Probier eine andere Kategorie' : 'Bewerte noch ein paar Titel'}${settings.onlyMine ? ' oder schalte „Nur meine Dienste“ aus' : ''}.</div>`; return; }
    recVisible = l.slice(0, recCount).map(c => c.key); markShown(recVisible.slice(0, 12));
    const ht = $('#heroTip'); if (ht && !ht.dataset.filled && recFilter === 'alle' && recKind === 'alle') { ht.dataset.filled = '1'; ht.innerHTML = heroTipHtml(l); fillAvail(ht); }
    box.innerHTML = l.slice(0, recCount).map(recCard).join('') + (l.length > recCount ? `<button class="btn wide" data-act="more">Mehr anzeigen (${l.length - recCount} weitere)</button>` : '');
    fillAvail(box);
  };
  if (settings.onlyMine) {
    box.innerHTML = skeleton(3);
    const top = list; // ganze Liste prüfen (Verfügbarkeit ist zwischengespeichert)
    Promise.all(top.map(c => getAvail(c.key))).then(avs => { if ($('#recs') === box) show(top.filter((c, i) => avs[i]?.mine.length)); });
  } else show(list);
}
// Startseite: Leiste „Gerade in Deutschland angesagt“ (nur was bei deinen Diensten läuft)
function trendStrip() {
  ensureTrends();
  const d = trendState.data; if (!d) return '';
  const seen = new Set(); const items = [];
  for (const m of [...d.all, ...d.rows.flatMap(r => r.hot)]) {
    if (seen.has(m.key) || data.films[m.key] || data.hidden[m.key] || !d.rows.some(r => r.hot.some(h => h.key === m.key))) continue;
    seen.add(m.key); items.push(m);
  }
  return items.length ? `<div class="list-sec"><button class="list-head" data-go="trends"><span>🔥 Gerade angesagt – bei dir</span><span class="muted">alle ›</span></button><div class="hscroll">${items.slice(0, 15).map(m => miniPoster(m, { fire: true })).join('')}</div></div>` : '';
}
// Startseite: Lieblinge, die du „nochmal schauen“ würdest und länger als ein halbes Jahr her sind
function rewatchStrip() {
  const cut = new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10);
  const items = Object.values(data.films).filter(f => f.rewatch === 'ja' && (f.seen || '') < cut).sort((a, b) => b.note - a.note || (a.seen || '').localeCompare(b.seen || ''));
  return items.length ? `<div class="list-sec"><button class="list-head" data-list="rewatch"><span>🔁 Mal wieder schauen?</span><span class="muted">alle ›</span></button><div class="hscroll">${items.slice(0, 15).map(f => miniPoster(f, { dot: true })).join('')}</div></div>` : '';
}
// Neu mischen: bisher Gezeigtes nach hinten, der Rest zufällig – gute Treffer bleiben wahrscheinlicher
let recOrder = null, recCount = 40, recVisible = [];
const recShown = new Set();
// Zuletzt oben Gezeigtes (letzte 3 Tage) merken → beim nächsten Öffnen rutscht es nach hinten
const shownKey = () => 'kino.shown.' + profiles.current;
const readShown = () => { try { return JSON.parse(localStorage.getItem(shownKey())) || {}; } catch (_) { return {}; } };
function markShown(keys) {
  const s = readShown(), now = Date.now();
  keys.forEach(k => { if (!s[k] || now - s[k] > 6 * 3600e3) s[k] = now; });
  for (const k in s) if (now - s[k] > 3 * 864e5) delete s[k];
  try { localStorage.setItem(shownKey(), JSON.stringify(s)); } catch (_) { }
}
// Reihenfolge: gute Passung zählt, aber mit spürbarem Zufall; kürzlich Gezeigtes nach hinten
function freshOrder(list, strong) {
  const shown = readShown(), now = Date.now();
  const score = c => {
    const recent = shown[c.key] && now - shown[c.key] < 3 * 864e5 ? (strong ? 40 : 18) : 0;
    return c.match - recent + (Math.random() - 0.5) * (strong ? 40 : 22);
  };
  return list.map(c => [c.key, score(c)]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function shuffleRecs() {
  if (!recState.list) return;
  recVisible.forEach(k => recShown.add(k)); markShown(recVisible);
  let pool = recState.list.filter(c => !recShown.has(c.key));
  if (pool.length < 20) { recShown.clear(); pool = recState.list; } // alles einmal gesehen → von vorn
  const order = freshOrder(pool, true);
  recOrder = [...order, ...recState.list.filter(c => !order.includes(c.key)).map(c => c.key)];
  recCount = 40; vib(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  if (recShown.size > recState.list.length * 0.6) { recState.sig = ''; ensureRecs(); } // Nachschub laden
}
function recCard(c) {
  const showMatch = Object.keys(data.films).length >= 3;
  return `<div class="rec card" data-open="${c.key}">
    ${posterImg(c)}
    <div class="rec-main">
      <div class="rec-top">${showMatch ? `<span class="match ${c.match >= 75 ? 'hi' : c.match >= 55 ? 'mid' : ''}">${c.match} %</span>` : ''}<span class="tmdb">★ ${fmtNum(c.vote)}</span>${trendKeys.has(c.key) ? '<span class="fire">🔥 Trend</span>' : ''}</div>
      <div class="ftitle">${esc(c.title)}</div>
      <div class="muted small">${esc(metaLine(c))}</div>
      ${showMatch && c.reasons?.length ? `<div class="why">${esc(c.reasons.join(' · '))}</div>` : ''}
      <div class="avail" data-avail="${c.key}"><span class="av wait">Verfügbarkeit …</span></div>
      <div class="rec-acts">
        <button class="mini" data-act="watch" data-key="${c.key}">🔖 Merken</button>
        <button class="mini" data-act="rate" data-key="${c.key}">✔ Gesehen</button>
        <button class="mini ghost" data-act="hide" data-key="${c.key}" aria-label="Kein Interesse" title="Kein Interesse">✕</button>
      </div>
    </div></div>`;
}
const skeleton = n => Array.from({ length: n }, () => `<div class="rec card skel"><div class="poster ph"></div><div class="rec-main"><div class="sk w60"></div><div class="sk w40"></div><div class="sk w80"></div></div></div>`).join('');
function errorBox(msg) { return `<div class="card error">⚠️ ${esc(msg)}<br><button class="btn" data-act="retry">Nochmal versuchen</button></div>`; }
function renderSetupKey(el) {
  el.innerHTML = `<div class="card setup">
    <h2>Willkommen bei Kinokompass 🎬</h2>
    <p>Für Suche, Cover, Bewertungen und Streaming-Infos nutzt die App die kostenlose Datenbank <b>TMDB</b>. Dafür brauchst du einmalig einen eigenen Schlüssel:</p>
    <ol>
      <li>Auf <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org/settings/api</a> anmelden.</li>
      <li>Dort steht dein <b>API-Schlüssel</b> (kurz) und das <b>Lesezugriffstoken</b> (lang). Einen davon kopieren.</li>
      <li>Hier einfügen. Tipp: Am Mac in Kinokompass unter ⚙️ → „Anzeigen“ findest du ihn auch.</li>
    </ol>
    <input id="keyIn" class="input" placeholder="TMDB-Schlüssel einfügen" autocomplete="off" spellcheck="false">
    <button class="btn primary" data-act="savekey">Speichern & testen</button>
    <p class="small muted">Oder alles auf einmal vom Mac übernehmen:</p>
    <button class="btn" data-xact="qrscan">📷 QR-Code vom Mac scannen</button>
  </div>`;
}
async function testAndSaveKey(val) {
  const old = settings.apiKey; settings.apiKey = val.trim();
  try { await tmdb('/configuration'); saveSettings(); toast('Schlüssel funktioniert ✓'); recState.sig = ''; loadBasics(); return true; }
  catch (e) { settings.apiKey = old; toast(e.code === 'badkey' ? 'Schlüssel ungültig – bitte prüfen.' : 'Test fehlgeschlagen: ' + e.message); return false; }
}

/* ════════════ Trends (Fokus Deutschland) ════════════
   TMDB kennt keine Länder-Charts. Darum: weltweite Wochen-Trends, aber nur, was in Deutschland verfügbar ist
   (Abo, gratis, leihen oder kaufen) → „In Deutschland im Trend“; dazu je Dienst, „Neu im Kino“ (Kinostart DE)
   und „Deutsche Produktionen“ (Herkunftsland DE, letzte 2 Jahre). Ausgeblendete Genres/Anime fallen überall raus. */
let trendKind = 'alle', trendState = { sig: '', data: null, err: '' };
const yearAgo = (n = 1) => new Date(Date.now() - n * 365 * 864e5).toISOString().slice(0, 10);
const inGermany = av => !!av && (av.mine.length + av.otherStream.length + av.rent.length + av.buy.length) > 0;
async function loadTrends() {
  const raw = remember((await Promise.all([1, 2, 3, 4].map(p => trending('all', p).catch(() => [])))).flat()).filter(m => !isBlocked(m));
  raw.forEach(m => trendKeys.add(m.key));
  const avs = new Map();
  await pool(raw, 6, async m => avs.set(m.key, await getAvail(m.key)));
  const tr = raw.filter(m => inGermany(avs.get(m.key)));
  const ok = l => remember(l).filter(m => !isBlocked(m));
  const rows = await Promise.all(SERVICES.filter(s => settings.myServices.includes(s.key)).map(async s => {
    const hot = tr.filter(m => avs.get(m.key)?.mine.some(x => x.key === s.key));
    const p = { with_watch_providers: s.ids.join('|'), with_watch_monetization_types: 'flatrate|free|ads', 'vote_count.gte': 20 };
    const [mv, tv] = await Promise.all([
      discover('movie', { ...p, 'primary_release_date.gte': yearAgo() }).catch(() => []),
      discover('tv', { ...p, 'first_air_date.gte': yearAgo() }).catch(() => [])
    ]);
    const fresh = ok([...mv, ...tv].sort((a, b) => b.popularity - a.popularity)).filter(m => !hot.some(h => h.key === m.key));
    return { service: s, hot, fresh };
  }));
  const [kino, deMv, deTv] = await Promise.all([
    nowPlayingDE().catch(() => []),
    discover('movie', { with_origin_country: 'DE', 'primary_release_date.gte': yearAgo(2), 'vote_count.gte': 10 }).catch(() => []),
    discover('tv', { with_origin_country: 'DE', 'first_air_date.gte': yearAgo(2), 'vote_count.gte': 5 }).catch(() => [])
  ]);
  return { all: tr, rows, kino: ok(kino), german: ok([...deMv, ...deTv].sort((a, b) => b.popularity - a.popularity)) };
}
function ensureTrends() {
  const sig = settings.myServices.join('|') + settings.region + (settings.block || []).join(',') + JSON.stringify(settings.years || {});
  if (trendState.sig === sig) return;
  trendState = { sig, data: null, err: '' };
  loadTrends().then(d => { if (trendState.sig === sig) { trendState.data = d; if ((view === 'trends' || view === 'fuerdich') && !pages.length) render(); } })
    .catch(e => { if (trendState.sig === sig) { trendState.err = e.message; if (view === 'trends') render(); } });
}
function renderTrends(el) {
  if (!settings.apiKey) return renderSetupKey(el);
  ensureTrends();
  el.innerHTML = `<p class="muted small intro">🇩🇪 Was gerade in Deutschland angesagt ist – und bei welchem deiner Dienste es läuft. 🔥 = diese Woche im Trend.</p>
    ${kindSeg(trendKind, 'trendkind')}<div id="trows"></div>`;
  const box = $('#trows', el);
  if (trendState.err) { box.innerHTML = errorBox(trendState.err); return; }
  if (!trendState.data) { box.innerHTML = `<div class="loading-note">Trends werden geladen und mit deinen Diensten abgeglichen …</div>` + skeleton(2); return; }
  const k = m => (trendKind === 'alle' || m.kind === trendKind) && !data.hidden[m.key];
  const row = (title, items, o = {}) => items.length ? `<div class="list-sec"><div class="list-head static"><span>${title}</span>${o.right || ''}</div><div class="hscroll">${items.map(m => miniPoster(m, { fire: trendKeys.has(m.key), dot: o.dot })).join('')}</div></div>` : '';
  const d = trendState.data;
  box.innerHTML = row('🇩🇪 In Deutschland im Trend', d.all.filter(k).slice(0, 20), { dot: true, right: '<span class="muted small">✓ = bei dir</span>' })
    + d.rows.map(r => { const hot = r.hot.filter(k); return row(`${svcLogo(r.service)} ${hot.length ? 'Im Trend auf' : 'Neu & beliebt auf'} ${esc(r.service.name)}`, [...hot, ...r.fresh.filter(k)].slice(0, 15), { right: hot.length ? `<span class="muted small">${hot.length}× 🔥</span>` : '' }); }).join('')
    + (trendKind !== 'tv' ? row('🎬 Neu im Kino', d.kino.filter(k).slice(0, 15)) : '')
    + row('🇩🇪 Deutsche Produktionen', d.german.filter(k).slice(0, 15), { dot: true });
  fillAvail(box);
}

/* ════════════ Suchen ════════════ */
let searchPpl = [], searchQ = '', searchRes = null, searchTimer = 0, searchErr = '', searchKind = 'alle', searchSeq = 0;
function renderSearch(el) {
  if (!settings.apiKey) return renderSetupKey(el);
  el.innerHTML = `<div class="searchbar"><div class="search-row"><input id="q" class="input" type="search" placeholder="Film, Serie oder Person …" value="${esc(searchQ)}" autocomplete="off" enterkeyhint="search">${voiceAvailable() ? '<button class="mic" data-voice aria-label="Sprachsuche">🎙️</button>' : ''}</div>${kindSeg(searchKind, 'searchkind')}</div><div id="sres"></div>`;
  const q = $('#q', el);
  q.addEventListener('input', () => { searchQ = q.value; clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 300); });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(); q.blur(); } });
  if (!searchQ) setTimeout(() => q.focus(), 50);
  showSearch();
}
async function runSearch() {
  const q = searchQ.trim(), seq = ++searchSeq;
  if (q.length < 2) { searchRes = null; searchErr = ''; return showSearch(); }
  $('#sres') && ($('#sres').innerHTML = skeleton(3));
  try { const [r, ppl] = await Promise.all([searchAll(q, searchKind).then(remember), searchKind === 'alle' ? searchPeople(q) : []]); if (seq === searchSeq) { searchRes = r; searchPpl = ppl; searchErr = ''; if (r.length) rememberSearch(q); } }
  catch (e) { if (seq === searchSeq) { searchErr = e.message; searchRes = null; } }
  if (seq === searchSeq) showSearch();
}
function showSearch() {
  const box = $('#sres'); if (!box) return;
  if (searchErr) { box.innerHTML = errorBox(searchErr); return; }
  if (!searchRes) {
    const recent = Object.values(data.films).sort((a, b) => b.ts - a.ts).slice(0, 6);
    box.innerHTML = searchSuggestHtml() + (recent.length ? `<h3 class="sec">Zuletzt bewertet</h3>${recent.map(f => itemRow(f)).join('')}` : `<div class="empty">Tippe einen Titel ein – z.&nbsp;B. „Fluch der Karibik“, „Breaking Bad“ oder „Haus des Geldes“.</div>`);
    return;
  }
  // Person oben, wenn der Name gut passt (z. B. „Adam Sandler“); sonst nach den ersten Treffern
  const pq = normTitle(searchQ), top = searchPpl.filter(x => normTitle(x.name).includes(pq) || pq.includes(normTitle(x.name)));
  box.innerHTML = searchRes.length || searchPpl.length ? top.map(personRow).join('') + searchRes.slice(0, 30).map((f, i) => (i === 3 ? searchPpl.filter(x => !top.includes(x)).map(personRow).join('') : '') + itemRow(f, true)).join('') : `<div class="empty">Nichts gefunden. Prüf die Schreibweise oder versuch den Originaltitel.</div>`;
  fillAvail(box);
}
function itemRow(f, live) {
  const mine = data.films[f.key];
  return `<div class="frow card" data-open="${f.key}">
    ${posterImg(mine || f, 'w185')}
    <div class="frow-main">
      <div class="ftitle">${esc(f.title)}</div>
      <div class="muted small">${esc(metaLine(f))}${f.orig ? ` · <i>${esc(f.orig)}</i>` : ''}</div>
      <div class="frow-meta">${f.votes ? `<span class="tmdb">★ ${fmtNum(f.vote)} <span class="muted">(${fmtVotes(f.votes)})</span></span>` : '<span class="muted small">noch keine Bewertungen</span>'}
        ${mine ? `<span class="note ${noteClass(mine.note)}">Du: ${mine.note}</span>` : data.watch[f.key] ? '<span class="tag">🔖 gemerkt</span>' : ''}${trendKeys.has(f.key) ? '<span class="fire">🔥</span>' : ''}</div>
      ${live ? `<div class="avail" data-avail="${f.key}"></div>` : ''}
    </div></div>`;
}

/* ════════════ Details ════════════ */
async function openItem(key) {
  const pre = lookup(key);
  const flying = !!(pre && flipSrc && Date.now() - flipSrc.at < 800 && !reducedMotion());
  const p = openPage(pre?.title || '', { cls: 'detail-page', fade: flying });
  p.key = key;
  p.body.innerHTML = `<div class="detail">${pre ? heroHtml(pre) : ''}${skeleton(1)}</div>`;
  if (flying) flipInto(p); else flipSrc = null;
  try {
    const { kind, id } = parseKey(key); const d = await details(kind, id);
    p.item = d; p.title.textContent = d.title; known.set(key, { ...pre, ...d });
    availCache.set(key, Promise.resolve(availability(d.providers)));
    if (pages.includes(p)) renderDetail(p);
  } catch (e) { p.body.innerHTML = errorBox(e.message); }
}
function heroHtml(d) {
  return `<div class="hero ${d.backdrop ? '' : 'none'}">${d.backdrop ? `<img class="backdrop" src="${poster(d.backdrop, 'w780')}" alt="">` : ''}<div class="hero-fade"></div></div>
    <div class="d-head">${posterImg(d)}<div><span class="kind">${d.kind === 'tv' ? 'Serie' : 'Film'}</span><h2>${esc(d.title)}</h2>${d.orig ? `<div class="muted small">${esc(d.orig)}</div>` : ''}</div></div>`;
}
function renderDetail(p) {
  const d = p.item, mine = data.films[d.key], watched = !!data.watch[d.key], av = availability(d.providers);
  const len = d.kind === 'tv' ? [d.seasons ? `${d.seasons} Staffel${d.seasons > 1 ? 'n' : ''}` : '', d.episodes ? d.episodes + ' Folgen' : '', d.status === 'Ended' ? 'abgeschlossen' : d.status === 'Returning Series' ? 'läuft noch' : '']
    : [d.runtime ? Math.floor(d.runtime / 60) + ' h ' + (d.runtime % 60) + ' min' : ''];
  const other = av.otherStream.length + av.rent.length + av.buy.length;
  const plist = (label, list) => list.length ? `<div class="pgroup"><div class="plabel">${label}</div><div class="plist">${list.map(x => `<span class="pitem">${x.logo ? `<img src="${logo(x.logo)}" alt="">` : ''}${esc(x.name)}</span>`).join('')}</div></div>` : '';
  p.body.innerHTML = `<div class="detail">
    ${heroHtml(d)}
    <div class="muted small meta">${[d.year, ...len, d.fsk ? 'FSK ' + d.fsk : ''].filter(Boolean).join(' · ')}<br>${esc(genreNames(d.genres).join(' · '))}</div>
    ${av.mine.length ? `<div class="where yes"><div class="where-h">✓ Kannst du schauen</div><div class="svc-list">${av.mine.map(s => `<span class="svc">${svcLogo(s)}${esc(s.name)}</span>`).join('')}</div>
      <button class="btn primary wide" data-act="play" data-key="${d.key}" data-svc-key="${av.mine[0].key}">▶ Jetzt bei ${esc(av.mine[0].name)} schauen</button></div>`
      : `<div class="where no"><div class="where-h">✗ Nicht bei deinen Diensten</div><div class="small muted">${esc(SERVICES.filter(s => settings.myServices.includes(s.key)).map(s => s.name).join(', '))}</div></div>`}
    <div class="scores">
      <div class="score"><div class="big">★ ${fmtNum(d.vote)}</div><div class="muted small">allgemein · ${fmtVotes(d.votes)} Stimmen</div></div>
      <div class="score" data-omdb hidden></div>
      ${mine ? `<div class="score"><div class="big ${noteClass(mine.note)}">${mine.note}/10</div><div class="muted small">deine Note ${FEELINGS.find(x => x.key === mine.feeling)?.icon || ''}</div></div>` : ''}
    </div>
    <div class="d-acts">
      <button class="btn primary" data-act="rate" data-key="${d.key}">${mine ? '✎ Ändern' : '⭐ Bewerten'}</button>
      ${mine ? '' : `<button class="btn ${watched ? 'on' : ''}" data-act="${watched ? 'unwatch' : 'watch'}" data-key="${d.key}">${watched ? '✓ Gemerkt' : '🔖 Merken'}</button>`}
      ${d.trailer ? `<button class="btn" data-act="trailer" data-key="${d.key}">▶ Trailer</button>` : ''}
      ${frReady() && friendList().length ? `<button class="btn" data-fr="recommend" data-key="${d.key}">📨 Empfehlen</button>` : ''}
    </div>
    ${friendNotes(d.key)}
    <div data-coll></div>
    ${d.kind === 'tv' ? progressBlock(d) : ''}
    ${mine?.dims ? `<div class="dimchips">${DIMS.filter(x => (mine.dims[x.key] || 0) >= 2).map(x => `<span class="tag">${x.icon} ${x.label}: ${LEVELS[mine.dims[x.key]]}</span>`).join('')}</div>` : ''}
    ${mine?.rewatch ? `<div class="tag rw">${REWATCH.find(x => x.key === mine.rewatch)?.icon} Nochmal schauen: ${REWATCH.find(x => x.key === mine.rewatch)?.label}</div>` : ''}
    ${mine?.comment ? `<p class="mycomment">„${esc(mine.comment)}“</p>` : ''}
    ${d.tagline ? `<p class="tagline">${esc(d.tagline)}</p>` : ''}
    ${d.overview ? `<p>${esc(d.overview)}</p>` : '<p class="muted">Keine deutsche Beschreibung vorhanden.</p>'}
    ${sleepLine(d)}
    ${d.directors.length ? `<p class="small"><b>${d.kind === 'tv' ? 'Erfunden von' : 'Regie'}:</b> ${d.directors.map(x => `<a href="#" data-person="${x.id}">${esc(x.name)}</a>`).join(', ')}</p>` : ''}
    ${d.cast.length ? `<h3 class="sec">Besetzung</h3><div class="hscroll cast">${d.cast.map(c => `<button class="castc" data-person="${c.id}">${c.photo ? `<img src="${poster(c.photo, 'w185')}" alt="" loading="lazy">` : `<span class="castph">${esc(c.name.split(' ').map(x => x[0]).join('').slice(0, 2))}</span>`}<b>${esc(c.name)}</b><span>${esc(c.role)}</span></button>`).join('')}</div>` : ''}
    <button class="btn wide ghost" data-chain="${d.key}">🔗 Wenn dir das gefällt … (Kette)</button>
    ${other ? `<details class="more"><summary>Andere Möglichkeiten (${other})</summary>${plist('Andere Abos / gratis', av.otherStream)}${plist('Leihen', av.rent)}${plist('Kaufen', av.buy)}${av.link ? `<a class="small" href="${esc(av.link)}" target="_blank" rel="noopener">Alle Angebote bei JustWatch ↗</a>` : ''}</details>` : ''}
    ${d.recs.filter(m => !isBlocked(m)).length ? `<h3 class="sec">Ähnlich</h3><div class="hscroll">${remember(d.recs).filter(m => !isBlocked(m)).slice(0, 14).map(m => miniPoster(m, { dot: true })).join('')}</div>` : ''}
    ${mine ? `<button class="btn ghost danger wide" data-act="delete" data-key="${d.key}">Bewertung löschen</button>` : ''}
    ${chatSection(d)}
    <p class="hint-swipe">Zurück: nach rechts oder unten wischen</p>
  </div>`;
  fillAvail(p.body);
  fillChat(p);
  detailExtras(p);
  fillCollection(p);
}
function miniPoster(f, o = {}) {
  const mine = data.films[f.key];
  return `<div class="mp" data-open="${f.key}">${posterImg(mine || f, 'w185')}
    ${mine ? `<span class="note ${noteClass(mine.note)} corner">${mine.note}</span>` : f.vote ? `<span class="corner tmdbc">★ ${fmtNum(f.vote)}</span>` : ''}
    ${o.fire ? '<span class="fire-b">🔥</span>' : ''}${o.dot ? `<span class="dot" data-avail-dot="${f.key}"></span>` : ''}
    <div class="mp-t">${esc(f.title)}</div><div class="mp-k">${f.kind === 'tv' ? 'Serie' : 'Film'}${f.year ? ' · ' + f.year : ''}</div></div>`;
}
// Suchseite des Dienstes öffnen (am Handy meist direkt in dessen App)
function openService(key, svcKey) {
  const b = lookup(key), s = SERVICES.find(x => x.key === svcKey);
  const url = s?.search ? s.search + encodeURIComponent(b?.title || '') : known.get(key)?.providers?.link;
  if (url) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); }
}
function openTrailer(key) {
  const d = known.get(key); if (!d?.trailer) return;
  const url = 'https://www.youtube.com/watch?v=' + d.trailer.key;
  if (isNative() || window.kinoDesktop) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); return; }
  const p = openPage('Trailer', { cls: 'trailer-page' });
  p.body.innerHTML = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(d.trailer.key)}?autoplay=1&rel=0&hl=de" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Trailer"></iframe></div>
    <h3 class="sec">${esc(d.title)}</h3><p class="small muted">${esc(d.trailer.name)}${d.trailer.de ? '' : ' (englisch – kein deutscher Trailer gefunden)'}</p>
    <a class="btn" href="${url}" target="_blank" rel="noopener">Auf YouTube öffnen ↗</a>`;
}

/* ════════════ Bewerten (zwei Schritte) ════════════ */
async function openRate(key) {
  let base = lookup(key);
  if (!base) { try { const { kind, id } = parseKey(key); base = await details(kind, id); } catch (e) { return toast(e.message); } }
  const old = data.films[key];
  const r = { item: baseOf({ ...base, key }), note: old?.note || 0, feeling: old?.feeling || '', comment: old?.comment || '', rewatch: old?.rewatch || '', dims: old?.dims ? { ...old.dims } : suggestDims(base.genres, data.films), step: 1, prefilled: !old?.dims };
  const p = openPage(old ? 'Bewertung ändern' : 'Bewerten', { cls: 'rate-page' }); p.rate = r; renderRate(p);
}
const FEEL_NOTE = { wow: 9, gut: 7, ok: 6, meh: 4, schlecht: 2 };
function renderRate(p) {
  const r = p.rate, f = r.item, was = f.kind === 'tv' ? 'die Serie' : 'der Film';
  if (r.step === 1) {
    p.body.innerHTML = `<div class="rate">
      <div class="rate-head">${posterImg(f, 'w185')}<div><div class="muted small">Schritt 1 von 2</div><h2>Wie hat dir ${was} „${esc(f.title)}“ gefallen?</h2></div></div>
      <div class="feelings">${FEELINGS.map(x => `<button class="feel ${r.feeling === x.key ? 'on' : ''}" data-feel="${x.key}"><span>${x.icon}</span>${x.label}</button>`).join('')}</div>
      <h3 class="sec">Deine Note</h3>
      <div class="notes">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button class="nbtn ${noteClass(n)} ${r.note === n ? 'on' : ''}" data-note="${n}">${n}</button>`).join('')}</div>
      <h3 class="sec">🔁 Würdest du ${f.kind === 'tv' ? 'sie' : 'ihn'} nochmal schauen?</h3>
      <div class="segtabs rewatch">${REWATCH.map(x => `<button class="${r.rewatch === x.key ? 'on' : ''}" data-rewatch="${x.key}">${x.icon} ${x.label}</button>`).join('')}</div>
      <textarea id="cmt" class="input" rows="2" maxlength="280" placeholder="Kurz in eigenen Worten (optional)">${esc(r.comment)}</textarea>
      <div class="sticky-acts"><button class="btn primary wide" data-act="rate-next" ${r.note ? '' : 'disabled'}>${r.note ? 'Weiter zur Kurz-Abfrage →' : 'Erst eine Note wählen'}</button></div>
    </div>`;
    $('#cmt', p.body).addEventListener('input', e => r.comment = e.target.value);
  } else {
    p.body.innerHTML = `<div class="rate">
      <div class="muted small">Schritt 2 von 2 · Note ${r.note}</div><h2>Kurz-Abfrage</h2>
      ${r.prefilled ? '<p class="hint">Schon anhand des Genres vorausgefüllt – tippe nur an, was nicht passt.</p>' : ''}
      ${DIMS.map(d => `<div class="dimq"><div class="dq">${d.icon} ${esc(d.q)}</div><div class="seg">${LEVELS_SHORT.map((l, i) => `<button class="${r.dims[d.key] === i ? 'on' : ''}" data-dim="${d.key}" data-val="${i}">${l}</button>`).join('')}</div></div>`).join('')}
      <div class="sticky-acts row2"><button class="btn" data-act="rate-back">← Zurück</button><button class="btn primary" data-act="rate-save">Speichern ✓</button></div>
    </div>`;
  }
}
function saveRating(p) {
  const r = p.rate, k = r.item.key;
  data.films[k] = { ...r.item, note: r.note, feeling: r.feeling, comment: r.comment.trim(), dims: r.dims, rewatch: r.rewatch, seen: data.films[k]?.seen || new Date().toISOString().slice(0, 10), ts: stamp() };
  if (data.watch[k]) { delete data.watch[k]; data.tomb['watch:' + k] = stamp(); }
  delete data.tomb['films:' + k];
  save(); vib(r.note >= 9 ? 'success' : 'light');
  closePage();
  if (r.note >= 9) confetti();
  setTimeout(checkWeekDone, 600);
  toast(`„${r.item.title}“ gespeichert – Vorschläge werden angepasst`);
  refresh();
}

/* ════════════ Meine Filme & Serien ════════════ */
let mineMode = 'listen', mineSort = 'note', mineFilter = '', mineKind = 'alle';
function renderMine(el) {
  const all = Object.values(data.films);
  if (!all.length && !Object.keys(data.progress).length) { el.innerHTML = `<div class="empty big">Noch nichts bewertet.<br><button class="btn primary" data-go="suche">🔍 Ersten Film oder Serie eintragen</button><br><button class="btn" data-nf="open">📥 Netflix-Verlauf importieren</button></div>`; return; }
  const films = all.filter(f => mineKind === 'alle' || (f.kind || 'movie') === mineKind);
  const prof = tasteProfile(data.films);
  const favG = Object.entries(prof.genre).filter(([g]) => prof.genreCount[g] >= 2).sort((a, b) => b[1] - a[1])[0];
  el.innerHTML = `
    <div class="stats">
      <div><b>${all.filter(f => f.kind !== 'tv').length} / ${all.filter(f => f.kind === 'tv').length}</b><span>Filme / Serien</span></div>
      <div><b>${fmtNum(Math.round(prof.avg * 10) / 10)}</b><span>Ø Note</span></div>
      <div><b>${favG ? esc(GENRES[favG[0]] || '–') : '–'}</b><span>Lieblingsgenre</span></div>
    </div>
    ${mineTools()}
    <div class="segtabs">${[['listen', 'Listen'], ['alle', 'Alle'], ['geschmack', 'Geschmack']].map(([k, l]) => `<button class="${mineMode === k ? 'on' : ''}" data-mine="${k}">${l}</button>`).join('')}</div>
    ${mineMode !== 'geschmack' ? kindSeg(mineKind, 'minekind') : ''}
    <div id="minebody"></div>`;
  const box = $('#minebody', el);
  if (mineMode === 'listen') {
    // Jeder Titel steht in genau EINER Kategorie (seine stärkste Eigenschaft); Lieblinge/Nochmal/Flops sind Filter-Knöpfe
    const sub = Object.fromEntries(films.map(f => [f.key, f]));
    const lists = uniqueCategoryLists(sub);
    const quick = [['top', '🏆', 'Lieblinge', films.filter(f => f.note >= 8).length], ['rewatch', '🔁', 'Nochmal', films.filter(f => f.rewatch === 'ja').length], ['flop', '👎', 'Flops', films.filter(f => f.note <= 4).length]].filter(x => x[3]);
    box.innerHTML = watchingRow()
      + (quick.length ? `<div class="quick-lists">${quick.map(([k, i, l, n]) => `<button class="ql" data-list="${k}"><span>${i}</span><b>${l}</b><span class="muted">${n}</span></button>`).join('')}</div>` : '')
      + (lists.map(l => `<div class="list-sec"><button class="list-head" data-list="${l.key}"><span>${l.icon} ${esc(l.label)} <span class="muted">${l.items.length}</span></span><span class="muted">alle ›</span></button>
      <div class="hscroll">${l.items.slice(0, 15).map(f => miniPoster(f)).join('')}</div></div>`).join('') || '<div class="empty">Hier ist noch nichts.</div>')
      + `<p class="muted small center">Jeder Titel steht nur einmal – in der Kategorie, die am stärksten auf ihn zutrifft (deine Kurz-Abfrage, sonst das Genre).</p>`;
  } else if (mineMode === 'alle') {
    const sorters = { note: (a, b) => b.note - a.note || b.ts - a.ts, neu: (a, b) => b.ts - a.ts, titel: (a, b) => a.title.localeCompare(b.title, 'de') };
    const listHtml = () => { const q = mineFilter.toLowerCase(); return films.filter(f => !q || f.title.toLowerCase().includes(q)).sort(sorters[mineSort]).map(f => itemRow(f)).join(''); };
    box.innerHTML = `<div class="tools"><input id="mf" class="input" placeholder="Filtern …" value="${esc(mineFilter)}"><select id="ms" class="input">${[['note', 'Nach Note'], ['neu', 'Zuletzt'], ['titel', 'A–Z']].map(([k, l]) => `<option value="${k}" ${mineSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div id="mlist">${listHtml()}</div>`;
    $('#mf', box).addEventListener('input', e => { mineFilter = e.target.value; $('#mlist').innerHTML = listHtml(); });
    $('#ms', box).addEventListener('change', e => { mineSort = e.target.value; render(); });
  } else {
    const dims = DIMS.map(d => ({ ...d, v: prof.dim[d.key] || 0 })).sort((a, b) => b.v - a.v);
    const genres = Object.entries(prof.genre).filter(([g]) => GENRES[g]).sort((a, b) => b[1] - a[1]);
    const bar = (label, v, extra = '') => `<div class="tbar"><span class="tl">${label}</span><span class="tt"><span class="tf ${v < 0 ? 'neg' : ''}" style="${v < 0 ? 'right:50%' : 'left:50%'};width:${Math.abs(v) * 50}%"></span></span>${extra}</div>`;
    box.innerHTML = `<div class="card"><h3 class="sec">Was dir gefällt</h3><p class="muted small">Rechts = hebt deine Note, links = senkt sie. Aus deinen Noten und der Kurz-Abfrage berechnet.</p>
      ${prof.count < 3 ? '<p class="hint">Ab 3 Bewertungen wird das aussagekräftig.</p>' : ''}
      ${dims.map(d => bar(`${d.icon} ${d.label}`, d.v)).join('')}</div>
      ${tasteExtras()}
      <div class="card"><h3 class="sec">Genres</h3>${genres.map(([g, v]) => bar(esc(GENRES[g]), v, `<span class="muted small">${prof.genreCount[g]}</span>`)).join('') || '<p class="muted">Noch keine Daten.</p>'}</div>`;
  }
}
function openList(key) {
  const films = Object.values(data.films).filter(f => mineKind === 'alle' || (f.kind || 'movie') === mineKind);
  let l;
  if (key === 'top') l = { icon: '🏆', label: 'Lieblinge (8+)', items: films.filter(f => f.note >= 8).sort((a, b) => b.note - a.note) };
  else if (key === 'rewatch') l = { icon: '🔁', label: 'Nochmal schauen', items: films.filter(f => f.rewatch === 'ja').sort((a, b) => b.note - a.note) };
  else if (key === 'flop') l = { icon: '👎', label: 'Flops (bis 4)', items: films.filter(f => f.note <= 4).sort((a, b) => a.note - b.note) };
  else l = uniqueCategoryLists(Object.fromEntries(films.map(f => [f.key, f]))).find(x => x.key === key);
  if (!l) return;
  const p = openPage(`${l.icon} ${l.label}`);
  p.body.innerHTML = l.items.map(f => itemRow(f)).join('')
    + (DIMS.some(d => d.key === key) ? `<button class="btn primary wide" data-act="reclist" data-cat="${key}">✨ Mehr davon: Vorschläge „${esc(l.label)}“</button>` : '');
}

/* ════════════ Merkliste ════════════ */
// Merkliste: Priorität (▶ Als Nächstes / ⏳ Irgendwann / 🎬 Im Kino) + Sortierung; lange Gemerktes zum Aufräumen
const PRIOS = [{ key: 'next', icon: '▶', label: 'Als Nächstes' }, { key: 'later', icon: '⏳', label: 'Irgendwann' }, { key: 'kino', icon: '🎬', label: 'Im Kino schauen' }];
let watchSort = 'prio';
function renderWatch(el) {
  const list = Object.values(data.watch);
  if (!list.length) { el.innerHTML = `<div class="empty big">Deine Merkliste ist leer.<br><span class="small">Tippe bei Vorschlägen, Trends oder in der Suche auf 🔖 Merken – oder halte ein Poster gedrückt.</span></div>`; return; }
  el.innerHTML = skeleton(Math.min(3, list.length));
  Promise.all(list.map(f => getAvail(f.key))).then(avs => {
    if (view !== 'merk') return;
    const profile = tasteProfile(data.films), table = genreDimTable(data.films), showMatch = Object.keys(data.films).length >= 3;
    const items = list.map((f, i) => ({ f, av: avs[i], sc: scoreCandidate(f, profile, table) }));
    const card = ({ f, av, sc }) => `<div class="rec card" data-open="${f.key}">${posterImg(f)}
      <div class="rec-main"><div class="rec-top">${showMatch ? `<span class="match ${sc.match >= 75 ? 'hi' : sc.match >= 55 ? 'mid' : ''}">${sc.match} %</span>` : ''}<span class="tmdb">★ ${fmtNum(f.vote)}</span></div>
        <div class="ftitle">${esc(f.title)}</div><div class="muted small">${esc(metaLine(f))} · gemerkt ${new Date(f.added || f.ts).toLocaleDateString('de-DE')}</div>
        <div class="avail">${availBadge(av)}</div>
        <div class="prio-row">${PRIOS.map(p => `<button class="prio ${(f.prio || 'later') === p.key ? 'on' : ''}" data-prio="${p.key}" data-key="${f.key}" title="${p.label}">${p.icon}</button>`).join('')}
          <button class="mini" data-act="rate" data-key="${f.key}">✔ Gesehen</button><button class="mini ghost" data-act="unwatch" data-key="${f.key}" aria-label="Entfernen">✕</button></div>
      </div></div>`;
    const avFirst = (a, b) => (b.av?.mine.length ? 1 : 0) - (a.av?.mine.length ? 1 : 0);
    const sorters = { prio: (a, b) => avFirst(a, b) || b.sc.match - a.sc.match, passung: (a, b) => b.sc.match - a.sc.match, neu: (a, b) => (b.f.added || b.f.ts) - (a.f.added || a.f.ts), alt: (a, b) => (a.f.added || a.f.ts) - (b.f.added || b.f.ts) };
    const stale = list.filter(f => Date.now() - (f.added || f.ts) > 182 * 864e5);
    let html = `<div class="segtabs">${[['prio', 'Priorität'], ['passung', 'Passung'], ['neu', 'Neueste'], ['alt', 'Älteste']].map(([k, l]) => `<button class="${watchSort === k ? 'on' : ''}" data-wsort="${k}">${l}</button>`).join('')}</div>`
      + (stale.length ? `<button class="card stale" data-tool="stale">🧹 ${stale.length} Titel stehen seit über einem halben Jahr drauf – willst du die noch sehen?</button>` : '');
    if (watchSort === 'prio') {
      for (const p of PRIOS) {
        const g = items.filter(x => (x.f.prio || 'later') === p.key).sort(sorters.prio);
        if (g.length) html += `<h3 class="sec">${p.icon} ${p.label} (${g.length})</h3>${g.map(card).join('')}`;
      }
    } else html += items.sort(sorters[watchSort]).map(card).join('');
    el.innerHTML = html;
  });
}

/* ════════════ Einstellungen ════════════ */
function openSettings() { const p = openPage('Einstellungen'); p.settings = true; renderSettings(p); }
function renderSettings(p) {
  const mine = new Set(settings.myServices);
  const tile = s => `<button class="pchk ${mine.has(s.key) ? 'on' : ''}" data-svc="${s.key}">${svcLogo(s) || '<span class="slogo ph"></span>'}<span>${esc(s.name)}</span><b>${mine.has(s.key) ? '✓' : '+'}</b></button>`;
  p.body.innerHTML = `<div class="settings">
    <div class="card"><h3 class="sec">Meine Streamingdienste</h3>
      <p class="small muted">Nur diese zählen bei „✓ Kannst du schauen“. Leihen/Kaufen und Amazon-Zusatzkanäle zählen nicht; YouTube nur, wenn es dort gratis läuft. Antippen zum Entfernen.</p>
      <div class="provgrid">${SERVICES.filter(s => mine.has(s.key)).map(tile).join('')}</div>
      <details class="more"><summary>Weitere Dienste hinzufügen</summary><div class="provgrid">${SERVICES.filter(s => !mine.has(s.key)).map(tile).join('')}</div></details>
    </div>
    ${settingsExtras()}
    <div class="card"><h3 class="sec">Filmdatenbank (TMDB)</h3>
      <p class="small muted">${settings.apiKey ? 'Schlüssel ist eingetragen ✓' : 'Noch kein Schlüssel eingetragen.'}</p>
      ${settings.apiKey ? `<div class="secret"><code id="keyShow">••••••••••••</code><button class="mini" data-act="showkey">👁 Anzeigen</button><button class="mini" data-act="copykey">Kopieren</button></div>` : ''}
      <input id="setKey" class="input" placeholder="${settings.apiKey ? 'Neuen Schlüssel einfügen' : 'TMDB-Schlüssel einfügen'}" autocomplete="off" spellcheck="false">
      <button class="btn" data-act="setkey">Speichern & testen</button>
      <label class="lbl">Land für Streaming-Angebote
        <select id="region" class="input">${[['DE', 'Deutschland'], ['AT', 'Österreich'], ['CH', 'Schweiz']].map(([k, l]) => `<option value="${k}" ${settings.region === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="card"><h3 class="sec">Geräte-Sync (GitHub)</h3>
      <p class="small muted">Bewertungen zwischen Handy, Mac und PC abgleichen (Branch „${esc(syncCfg.branch)}“). Derselbe Token wie bei Obiter geht.</p>
      <p class="small">Status: <span data-syncstate>${esc(syncLabel())}</span></p>
      ${syncCfg.token ? `<div class="secret"><code id="tokShow">••••••••••••</code><button class="mini" data-act="showtok">👁 Anzeigen</button><button class="mini" data-act="copytok">Kopieren</button></div>` : ''}
      <input id="tok" class="input" placeholder="${syncCfg.token ? 'Neuen Token einfügen' : 'GitHub-Token (github_pat_…)'}" autocomplete="off" spellcheck="false">
      <div class="row2"><button class="btn" data-act="settok">Token speichern</button><button class="btn primary" data-act="syncnow" ${syncReady() ? '' : 'disabled'}>Jetzt synchronisieren</button></div>
    </div>
    <div class="card"><h3 class="sec">Daten</h3>
      <div class="row2"><button class="btn" data-tool="export">📤 Export & Sicherung</button><label class="btn">Importieren<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
      <p class="small muted">${Object.keys(data.films).length} bewertet, ${Object.keys(data.watch).length} auf der Merkliste, ${Object.keys(data.hidden).length} ausgeblendet${Object.keys(data.hidden).length ? ` · <a href="#" data-act="unhide">zurücksetzen</a>` : ''}.</p>
    </div>
    <p class="small muted center">Film-, Serien- und Bilddaten: TMDB. Diese App nutzt die TMDB-API, ist aber weder von TMDB unterstützt noch zertifiziert. Streaming-Angaben: JustWatch. Trailer: YouTube.</p>
  </div>`;
  bindSettingsExtras(p);
  $('#region', p.body).addEventListener('change', e => { settings.region = e.target.value; saveSettings(); tmdbCache.clear(); availCache.clear(); recState.sig = ''; trendState.sig = ''; renderSettings(p); });
  $('#imp', p.body).addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const d = JSON.parse(await file.text()); if (!d.films) throw new Error('keine Kinokompass-Sicherung'); replaceData(mergeData(data, d)); save(); toast('Import zusammengeführt ✓'); renderSettings(p); }
    catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  });
}
function exportData() {
  const json = JSON.stringify(data, null, 1);
  const name = `kinokompass-${new Date().toISOString().slice(0, 10)}.json`;
  if (isNative() && navigator.share) { navigator.share({ title: name, text: json }).catch(() => { }); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function copyText(t, what) { try { await navigator.clipboard.writeText(t); toast(what + ' kopiert'); } catch (_) { toast('Kopieren nicht möglich – bitte „Anzeigen“ und abschreiben'); } }

/* ════════════ Merken ════════════ */
function setWatch(key, on) {
  const base = lookup(key); if (!base) return;
  if (on) { data.watch[key] = { ...baseOf(base), ts: stamp(), added: stamp() }; delete data.tomb['watch:' + key]; }
  else { delete data.watch[key]; data.tomb['watch:' + key] = stamp(); }
  save(); vib();
}
// Nach Änderungen: offene Detailseite und die Ansicht darunter auffrischen
function refresh() { const p = pages.at(-1); if (p?.item) renderDetail(p); if (!pages.length) render(); }

/* ════════════ Klicks (ein Verteiler für alles) ════════════ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-xact],[data-prio],[data-wsort],[data-act],[data-go],[data-open],[data-rewatch],[data-recfilter],[data-reckind],[data-trendkind],[data-searchkind],[data-minekind],[data-feel],[data-note],[data-dim],[data-mine],[data-list],[data-svc]');
  if (!t || t.dataset.xact) return; // [data-xact] → extras.js
  const page = pages.at(-1);
  if (t.dataset.go) { closeAllPages(); return go(t.dataset.go); }
  if (t.dataset.prio) { const w = data.watch[t.dataset.key]; if (w) { w.added = w.added || w.ts; w.prio = t.dataset.prio; w.ts = stamp(); save(); vib(); render(); } return; } // ts = Änderungszeit (Sync), added = gemerkt am
  if (t.dataset.wsort) { watchSort = t.dataset.wsort; return render(); }
  if (t.dataset.recfilter) { recFilter = t.dataset.recfilter; return render(); }
  if (t.dataset.reckind) { recKind = t.dataset.reckind; return render(); }
  if (t.dataset.trendkind) { trendKind = t.dataset.trendkind; return render(); }
  if (t.dataset.searchkind) { searchKind = t.dataset.searchkind; document.querySelectorAll('[data-searchkind]').forEach(b => b.classList.toggle('on', b === t)); return runSearch(); }
  if (t.dataset.minekind) { mineKind = t.dataset.minekind; return render(); }
  if (t.dataset.mine) { mineMode = t.dataset.mine; return render(); }
  if (t.dataset.list) return openList(t.dataset.list);
  if (t.dataset.svc) {
    const k = t.dataset.svc, i = settings.myServices.indexOf(k);
    if (i >= 0) settings.myServices.splice(i, 1); else settings.myServices.push(k);
    saveSettings(); vib(); recState.sig = ''; trendState.sig = ''; return renderSettings(page);
  }
  if (page?.rate) {
    const r = page.rate;
    if (t.dataset.feel) { r.feeling = t.dataset.feel; if (!r.note) r.note = FEEL_NOTE[r.feeling]; vib(); return renderRate(page); }
    if (t.dataset.note) { r.note = +t.dataset.note; vib(); return renderRate(page); }
    if (t.dataset.rewatch) { r.rewatch = r.rewatch === t.dataset.rewatch ? '' : t.dataset.rewatch; vib(); return renderRate(page); }
    if (t.dataset.dim) { r.dims[t.dataset.dim] = +t.dataset.val; t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t)); vib(); return; }
    if (t.dataset.act === 'rate-next') { r.step = 2; renderRate(page); page.body.scrollTop = 0; return; }
    if (t.dataset.act === 'rate-back') { r.step = 1; return renderRate(page); }
    if (t.dataset.act === 'rate-save') return saveRating(page);
  }
  const key = t.dataset.key;
  switch (t.dataset.act) {
    case 'rate': return openRate(key);
    case 'watch': setWatch(key, true); dropRec(key); toast('🔖 Auf die Merkliste gesetzt', () => { setWatch(key, false); refresh(); }); return refresh();
    case 'unwatch': setWatch(key, false); return refresh();
    case 'hide': {
      data.hidden[key] = stamp(); save(); dropRec(key); t.closest('.rec')?.classList.add('gone');
      toast('Ausgeblendet', () => { delete data.hidden[key]; save(); recState.sig = ''; render(); });
      setTimeout(render, 250); return;
    }
    case 'unhide': e.preventDefault(); data.hidden = {}; save(); return renderSettings(page);
    case 'delete': {
      const old = data.films[key]; delete data.films[key]; data.tomb['films:' + key] = stamp(); save();
      toast('Bewertung gelöscht', () => { data.films[key] = { ...old, ts: stamp() }; delete data.tomb['films:' + key]; save(); refresh(); });
      return refresh();
    }
    case 'trailer': return openTrailer(key);
    case 'play': return openService(key, t.dataset.svcKey);
    case 'shuffle': return shuffleRecs();
    case 'more': recCount += 20; return render();
    case 'retry': recState.sig = ''; trendState.sig = ''; tmdbCache.clear(); availCache.clear(); if (view === 'suche') return runSearch(); return render();
    case 'savekey': { const v = $('#keyIn')?.value || ''; if (v.trim() && await testAndSaveKey(v)) render(); return; }
    case 'setkey': { const v = $('#setKey')?.value || ''; if (v.trim() && await testAndSaveKey(v)) { renderSettings(page); render(); } return; }
    case 'showkey': { const c = $('#keyShow'); c.textContent = c.textContent.startsWith('•') ? settings.apiKey : '••••••••••••'; return; }
    case 'copykey': return copyText(settings.apiKey, 'TMDB-Schlüssel');
    case 'showtok': { await tokenReady; const c = $('#tokShow'); c.textContent = c.textContent.startsWith('•') ? syncCfg.token : '••••••••••••'; return; }
    case 'copytok': await tokenReady; return copyText(syncCfg.token, 'GitHub-Token');
    case 'settok': { const v = $('#tok')?.value || ''; if (!v.trim()) return; await setToken(v); toast('Token gespeichert'); renderSettings(page); syncNow(); return; }
    case 'syncnow': if (await syncNow()) toast('Synchronisiert ✓'); return;
    case 'export': return exportData();
    case 'reclist': recFilter = t.dataset.cat; closeAllPages(); return go('fuerdich');
    case 'settings': return openSettings();
  }
  if (t.dataset.open) return openItem(t.dataset.open);
});

/* ─── Start ─── */
function loadBasics() {
  if (!settings.apiKey) return;
  loadProviderLogos().then(() => { if (!pages.length) render(); }).catch(() => { });
  trending('all').then(l => { remember(l).forEach(m => trendKeys.add(m.key)); }).catch(() => { });
}
function boot() {
  $('#tabs').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button data-go="${k}"><span class="ti">${v.icon}</span><span>${v.label}</span></button>`).join('');
  if (isNative()) document.documentElement.dataset.platform = 'android';
  const App = window.Capacitor?.Plugins?.App;
  App?.addListener('backButton', () => { if (closePage()) return; if (view !== 'fuerdich') return go('fuerdich'); App.exitApp(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePage(); });
  applyTheme();
  render();
  runSplash();
  loadBasics();
  tokenReady.then(() => syncNow(true));
  extrasBoot();
  profilesBoot();
  friendsBoot();
  toolsBoot();
  pwaBoot();
}
document.addEventListener('DOMContentLoaded', boot); // alle Skripte (auch extras.js) sind dann geladen
