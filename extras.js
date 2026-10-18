'use strict';
/* ════════════ Kinokompass – Extras ════════════
   Wischen zwischen den Tabs · „Was schauen wir heute?“ · Serien-Fortschritt · IMDb/Rotten Tomatoes (OMDb)
   · Benachrichtigungen (Merkliste neu verfügbar, neue Folgen) · Einrichtung per QR-Code.
   Lädt nach app.js; Aktionen laufen über [data-xact] (eigener Klick-Verteiler unten). */

const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : '';
const epLabel = p => `S${p.s}·E${p.e}`;

/* ════════════ Wischen zwischen den Tabs ════════════ */
function switchTab(v, dir) {
  go(v); vib();
  $('#view').animate([{ transform: `translateX(${dir === 'left' ? 48 : -48}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)' });
}
function initTabSwipe() {
  const main = $('#view'), order = Object.keys(VIEWS);
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false, horiz = null;
  document.addEventListener('touchstart', e => {
    active = !pages.length && e.touches.length === 1 && !e.target.closest('.hscroll,.chips,.seg,input,textarea,select,.tabbar,.topbar,#pages');
    if (!active) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0; horiz = null;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!active) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (horiz === null && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) horiz = Math.abs(dx) > Math.abs(dy) * 1.5;
    if (horiz) { const i = order.indexOf(view), edge = (dx > 0 && i === 0) || (dx < 0 && i === order.length - 1); main.style.transform = `translateX(${dx * (edge ? 0.08 : 0.3)}px)`; }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!active) return;
    active = false; main.style.transform = '';
    if (!horiz) return;
    const i = order.indexOf(view);
    if (dx < -70 && i < order.length - 1) switchTab(order[i + 1], 'left');
    else if (dx > 70 && i > 0) switchTab(order[i - 1], 'right');
  });
}

/* ════════════ Was schauen wir heute? ════════════ */
const todayOpts = { kind: 'alle', moods: [], time: 'egal', with: [], rewatch: false };
const todaySeen = new Set();
function forYouTop() {
  if (!settings.apiKey) return '';
  return `${importQueueCard()}<button class="today-btn" data-xact="today"><span class="today-dice">🎲</span><span><b>Was schauen wir heute?</b><span class="small">Ein passender Vorschlag – bei deinen Diensten</span></span></button>${watchingRow(true)}`;
}
function openToday() { const p = openPage('Was schauen wir heute?'); p.today = true; renderToday(p); }
function renderToday(p, resultHtml) {
  const o = todayOpts;
  const others = [...liveProfiles().filter(x => x.id !== profiles.current), ...(frReady() ? friendMates() : [])];
  o.with = o.with.filter(id => others.some(x => x.id === id));
  p.body.innerHTML = `<div class="today">
    ${others.length ? `<h3 class="sec">Wer schaut mit? <span class="muted small">(Filmabend)</span></h3>
    <div class="moods"><span class="chip on me">${curProfile().emoji} ${esc(curProfile().name)}</span>${others.map(x => `<button class="chip ${o.with.includes(x.id) ? 'on' : ''}" data-xact="twith" data-v="${x.id}">${x.emoji} ${esc(x.name)}</button>`).join('')}</div>` : ''}
    <h3 class="sec">Film oder Serie?</h3>
    <div class="segtabs">${[['alle', 'Egal'], ['movie', 'Film'], ['tv', 'Serie']].map(([k, l]) => `<button class="${o.kind === k ? 'on' : ''}" data-xact="tkind" data-v="${k}">${l}</button>`).join('')}</div>
    <h3 class="sec">Worauf hast du Lust? <span class="muted small">(bis zu 2)</span></h3>
    <div class="moods">${DIMS.map(d => `<button class="chip ${o.moods.includes(d.key) ? 'on' : ''}" data-xact="tmood" data-v="${d.key}">${d.icon} ${esc(d.label)}</button>`).join('')}</div>
    ${o.kind !== 'tv' ? `<h3 class="sec">Wie viel Zeit? <span class="muted small">(bei Filmen)</span></h3>
    <div class="segtabs">${[['bett', `⏰ bis ${bedtime()}`], ['90', '≤ 1½ h'], ['120', '≤ 2 h'], ['egal', 'egal']].map(([k, l]) => `<button class="${o.time === k ? 'on' : ''}" data-xact="ttime" data-v="${k}">${l}</button>`).join('')}</div>` : ''}
    <label class="switch-row"><input type="checkbox" data-xact="trewatch" ${o.rewatch ? 'checked' : ''}><span>🔁 Auch Lieblinge, die ich nochmal schauen würde</span></label>
    <button class="btn primary wide big-btn" data-xact="tgo">🎲 ${resultHtml ? 'Anderer Vorschlag' : 'Vorschlag zeigen'}</button>
    <div id="tres">${resultHtml || ''}</div>
  </div>`;
}
async function pickToday(p) {
  const box = $('#tres', p.body); box.innerHTML = `<div class="loading-note">Suche etwas Passendes …</div>${skeleton(1)}`;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ensureRecs(); if (recState.loading) await recState.loading;
  const o = todayOpts;
  // Filmabend: Geschmack der anderen mitrechnen; was einer schon gesehen hat, fällt raus
  const mates = o.with.map(id => {
    const fm = id.startsWith('f:') ? friendMates().find(x => x.id === id) : null; // Freund statt eigenes Profil
    const d = fm ? fm.data : loadData(id), pr = fm ? { name: fm.name, emoji: fm.emoji } : profiles.list.find(x => x.id === id);
    return { p: pr, d, prof: tasteProfile(d.films), table: genreDimTable(d.films) };
  });
  // Lieblinge zum Nochmal-Schauen: Passung = eigene Note, Eigenschaften = eigene Kurz-Abfrage
  const cut = new Date(Date.now() - 182 * 864e5).toISOString().slice(0, 10), table = genreDimTable(data.films);
  const again = o.rewatch ? Object.values(data.films).filter(f => f.rewatch === 'ja' && (f.seen || '') < cut && !isBlocked(f))
    .map(f => ({ ...f, match: f.note * 10, est: f.dims || estimateDims(f.genres, table), reasons: [`du würdest ${f.kind === 'tv' ? 'sie' : 'ihn'} nochmal schauen (${f.note}/10)`], again: true })) : [];
  let list = [...(recState.list || []), ...again].filter(c => !todaySeen.has(c.key) && (o.kind === 'alle' || c.kind === o.kind) && o.moods.every(m => fitsDim(c.est, m)) && !mates.some(m => m.d.films[c.key] || m.d.hidden[c.key]));
  list = list.map(c => {
    const all = [c.match, ...mates.map(m => scoreCandidate(c, m.prof, m.table).match)];
    const together = all.length / all.reduce((a, x) => a + 1 / Math.max(1, x), 0); // harmonisches Mittel: passt allen, nicht nur einem
    return { c: mates.length ? { ...c, together: Math.round(together), each: all } : c, w: (mates.length ? together : c.match) + o.moods.reduce((a, m) => a + c.est[m] * 5, 0) };
  }).sort((a, b) => b.w - a.w).slice(0, 30);
  // Zufällig, aber gute Treffer häufiger (gewichtete Zufallsreihenfolge)
  list = list.map(x => ({ c: x.c, r: Math.pow(Math.random(), 1 / Math.pow(Math.max(1, x.w), 2)) })).sort((a, b) => b.r - a.r).map(x => x.c);
  for (const c of list) {
    const av = await getAvail(c.key);
    if (!av?.mine.length) continue;
    let d = null;
    try { d = await details(c.kind, c.id); } catch (_) { continue; }
    const maxMin = o.time === 'bett' ? minutesToBed() : +o.time;
    if (c.kind === 'movie' && o.time !== 'egal' && (!d.runtime || d.runtime > maxMin)) continue;
    todaySeen.add(c.key); known.set(c.key, { ...c, ...d });
    availCache.set(c.key, Promise.resolve(availability(d.providers)));
    if (!pages.includes(p)) return;
    renderToday(p, todayCard({ ...c, ...d }, availability(d.providers), mates));
    fillAvail(p.body); vib();
    $('#tres', p.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (pages.includes(p)) box.innerHTML = `<div class="empty">Gerade nichts Passendes bei deinen Diensten.<br>Nimm eine Laune weg, stell die Zeit auf „egal“ oder bewerte noch ein paar Titel.</div>`;
}
function todayCard(d, av, mates = []) {
  const len = d.kind === 'tv' ? `${d.seasons} Staffel${d.seasons > 1 ? 'n' : ''}${d.runtime ? ' · ~' + d.runtime + ' min/Folge' : ''}` : d.runtime ? `${Math.floor(d.runtime / 60)} h ${d.runtime % 60} min` : '';
  const showMatch = Object.keys(data.films).length >= 3;
  return `<div class="today-card">
    ${d.backdrop ? `<img class="today-bg" src="${poster(d.backdrop, 'w780')}" alt="">` : ''}
    <div class="today-main">${posterImg(d)}<div>
      <span class="kind">${d.kind === 'tv' ? 'Serie' : 'Film'}</span>
      <h2>${esc(d.title)}</h2>
      <div class="muted small">${[d.year, len, ...genreNames(d.genres).slice(0, 2)].filter(Boolean).join(' · ')}</div>
      <div class="rec-top">${d.together ? `<span class="match hi">${d.together} % passt euch</span>` : showMatch ? `<span class="match hi">${d.match} % passt</span>` : ''}<span class="tmdb">★ ${fmtNum(d.vote)}</span></div>
    </div></div>
    ${d.together ? `<div class="together">${[curProfile(), ...mates.map(m => m.p)].map((pr, i) => `<span>${pr.emoji} ${esc(pr.name)} <b>${d.each[i]} %</b>${i && Object.keys(mates[i - 1].d.films).length < 3 ? ' <span class="muted">(hat noch wenig bewertet)</span>' : ''}</span>`).join('')}</div>` : ''}
    <div class="avail">${availBadge(av)}</div>
    ${showMatch && d.reasons?.length ? `<div class="why">${esc(d.reasons.join(' · '))}</div>` : ''}
    ${d.overview ? `<p class="small">${esc(d.overview.length > 260 ? d.overview.slice(0, 257) + ' …' : d.overview)}</p>` : ''}
    <div class="d-acts">
      ${d.trailer ? `<button class="btn" data-act="trailer" data-key="${d.key}">▶ Trailer</button>` : ''}
      <button class="btn" data-act="watch" data-key="${d.key}">🔖 Merken</button>
      <button class="btn" data-open="${d.key}">Details</button>
    </div>
    ${av.mine.length ? `<button class="btn primary wide" data-act="play" data-key="${d.key}" data-svc-key="${av.mine[0].key}">▶ Bei ${esc(av.mine[0].name)} schauen</button>` : ''}
    ${d.kind === 'tv' ? `<button class="btn wide" data-xact="pstart" data-key="${d.key}">📺 Fortschritt mitzählen</button>` : ''}
  </div>`;
}

/* ════════════ Serien-Fortschritt ════════════ */
function progressBlock(d) {
  const pr = data.progress[d.key];
  if (!pr) return `<div class="prog"><div class="prog-h">📺 Schaust du die Serie?</div><p class="small muted">Dann zählt die App mit, bei welcher Folge du bist, und sagt Bescheid, wenn neue Folgen kommen.</p><button class="btn primary" data-xact="pstart" data-key="${d.key}">▶ Ich schaue sie gerade</button></div>`;
  const seasons = d.seasonList.filter(x => x.n > 0 && x.eps > 0);
  const left = episodesLeft(pr, seasons, d.aired);
  const next = advanceEpisode(pr, seasons);
  const status = left ? `${left} Folge${left > 1 ? 'n' : ''} offen` : d.nextAir ? `Alles gesehen · nächste Folge ${fmtDate(d.nextAir.date)}` : d.status === 'Ended' || d.status === 'Canceled' ? 'Komplett gesehen 🎉' : 'Alles gesehen – wartet auf neue Folgen';
  const cur = seasons.find(x => x.n === pr.s) || { eps: 0 };
  return `<div class="prog ${left ? 'open' : ''}">
    <div class="prog-h">📺 ${pr.e ? `Gesehen bis <b>Staffel ${pr.s}, Folge ${pr.e}</b>` : `Staffel ${pr.s} noch nicht angefangen`}</div>
    <div class="small ${left ? 'prog-new' : 'muted'}">${status}</div>
    ${left ? `<button class="btn primary wide" data-xact="pnext" data-key="${d.key}">✓ Folge ${next.e} (Staffel ${next.s}) gesehen</button>` : ''}
    ${planerBlock(d)}
    <div class="prog-pick">
      <label>Staffel <select class="input" data-pick="s" data-key="${d.key}">${seasons.map(x => `<option value="${x.n}" ${x.n === pr.s ? 'selected' : ''}>${x.n}</option>`).join('')}</select></label>
      <label>Folge <select class="input" data-pick="e" data-key="${d.key}">${Array.from({ length: cur.eps + 1 }, (_, i) => `<option value="${i}" ${i === pr.e ? 'selected' : ''}>${i || '–'}</option>`).join('')}</select></label>
      <button class="mini ghost" data-xact="pstop" data-key="${d.key}">Nicht mehr verfolgen</button>
    </div>
  </div>`;
}
// Momentaufnahme der Serie (für Weiterschauen-Liste und Benachrichtigungen, auch ohne neue Anfrage)
const snapOf = d => ({ seasons: d.seasonList.filter(x => x.n > 0 && x.eps > 0).map(x => ({ n: x.n, eps: x.eps })), aired: d.aired, nextAir: d.nextAir, status: d.status });
function setProgress(key, pos, d) {
  const old = data.progress[key];
  const base = baseOf(lookup(key) || d);
  data.progress[key] = { ...base, ...(old || {}), ...(d ? snapOf(d) : {}), s: pos.s, e: pos.e, ts: stamp() };
  delete data.tomb['progress:' + key];
  save(); vib();
}
function watchingRow(compact) {
  const list = Object.values(data.progress).map(p => ({ p, left: episodesLeft(p, p.seasons, p.aired) }))
    .sort((a, b) => (b.left > 0) - (a.left > 0) || b.p.ts - a.p.ts);
  if (!list.length) return '';
  if (compact && !list.some(x => x.left)) return ''; // auf „Für dich“ nur, wenn es etwas zu schauen gibt
  return `<div class="list-sec"><div class="list-head static"><span>📺 Weiterschauen</span>${list.some(x => x.left) ? `<span class="muted small">${list.filter(x => x.left).length} mit offenen Folgen</span>` : ''}</div>
    <div class="hscroll">${list.map(({ p, left }) => `<div class="mp" data-open="${p.key}">${posterImg(p, 'w185')}
      <span class="corner ep">${p.e ? epLabel(p) : 'Start'}</span>${left ? `<span class="newb">+${left}</span>` : ''}
      <div class="mp-t">${esc(p.title)}</div><div class="mp-k">${left ? `${left} offen` : p.nextAir ? 'neu ab ' + fmtDate(p.nextAir.date) : 'alles gesehen'}</div></div>`).join('')}</div></div>`;
}
// Beim Start die Serien auffrischen (neue Folgen erkennen)
async function refreshProgress() {
  if (!settings.apiKey) return;
  const keys = Object.keys(data.progress);
  await pool(keys, 4, async k => {
    try { const { id } = parseKey(k); const d = await details('tv', id); if (data.progress[k]) Object.assign(data.progress[k], snapOf(d)); } catch (_) { }
  });
  try { localStorage.setItem(dataKey(), JSON.stringify(data)); } catch (_) { } // ohne neuen Zeitstempel – nur lokale Momentaufnahme
}

/* ════════════ Details: IMDb / Rotten Tomatoes ════════════ */
function detailExtras(p) {
  const d = p.item, el = $('[data-omdb]', p.body);
  if (!el || !d.imdbId || !settings.omdbKey) return;
  omdb(d.imdbId).then(o => {
    if (!o || (!o.imdb && !o.rt) || !p.body.contains(el)) return;
    el.hidden = false;
    el.innerHTML = `<a class="omdb" href="${o.url}" target="_blank" rel="noopener"><div class="big imdb">${o.imdb ? 'IMDb ' + fmtNum(o.imdb) : '–'}</div><div class="muted small">${[o.rt ? '🍅 ' + o.rt : '', o.meta ? 'Meta ' + o.meta : ''].filter(Boolean).join(' · ') || (o.imdbVotes ? o.imdbVotes + ' Stimmen' : '')}</div></a>`;
  }).catch(e => { if (e.code === 'badkey') toast('OMDb-Schlüssel ungültig oder noch nicht aktiviert (Link in der Mail anklicken).'); });
}

/* ════════════ Benachrichtigungen ════════════ */
const ALERT_KEY = 'kino.alerts';
const alerts = (() => { const d = { on: true, base: {}, eps: {}, feed: [], last: 0, seen: 0 }; try { return { ...d, ...(JSON.parse(localStorage.getItem(ALERT_KEY)) || {}) }; } catch (_) { return d; } })();
const saveAlerts = () => { try { localStorage.setItem(ALERT_KEY, JSON.stringify(alerts)); } catch (_) { } updateBell(); };
const LN = () => window.Capacitor?.Plugins?.LocalNotifications;
const hashId = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 || 1; };
async function notifyPermission() {
  try {
    if (LN()) { const r = await LN().requestPermissions(); return r.display === 'granted'; }
    if ('Notification' in window) return (await Notification.requestPermission()) === 'granted';
  } catch (_) { }
  return false;
}
async function sendNotification(body, key, at) {
  if (!alerts.on) return;
  try {
    if (LN()) { await LN().schedule({ notifications: [{ id: hashId(body + (at || '')), title: 'Kinokompass', body, extra: { key }, ...(at ? { schedule: { at, allowWhileIdle: true } } : {}) }] }); return; }
    if (!at && typeof webNotify === 'function' && await webNotify(body)) return; // Web-App (iPhone): über den Service Worker
    if (!at && 'Notification' in window && Notification.permission === 'granted') { const n = new Notification('Kinokompass', { body, icon: 'icon.png' }); n.onclick = () => { window.focus(); if (key) openItem(key); }; }
  } catch (_) { }
}
function addAlert(msg, key) {
  alerts.feed.unshift({ msg, key, ts: Date.now() });
  alerts.feed = alerts.feed.slice(0, 40);
  sendNotification(msg, key);
}
// Prüft Merkliste und verfolgte Serien. Läuft beim Öffnen der App, höchstens alle 3 Stunden.
async function checkAlerts(force) {
  if (!settings.apiKey || (!force && Date.now() - alerts.last < 3 * 3600e3)) return;
  alerts.last = Date.now();
  for (const f of Object.values(data.watch)) {
    availCache.delete(f.key);
    const av = await getAvail(f.key); if (!av) continue;
    const now = av.mine.map(s => s.key).sort().join(',');
    const before = alerts.base[f.key];
    if (before !== undefined && !before && now) addAlert(`„${f.title}“ ist jetzt bei ${av.mine.map(s => s.name).join(' und ')} verfügbar`, f.key);
    // Abschied: war bei einem deiner Dienste, ist dort jetzt weg
    const gone = (before || '').split(',').filter(k => k && !now.split(',').includes(k));
    if (gone.length) addAlert(`👋 „${f.title}“ ist nicht mehr bei ${gone.map(k => SERVICES.find(s => s.key === k)?.name || k).join(' und ')}${now ? ' (aber noch bei ' + av.mine.map(s => s.name).join(', ') + ')' : ''}`, f.key);
    alerts.base[f.key] = now;
  }
  // dasselbe für Serien, die du gerade schaust
  for (const p of Object.values(data.progress)) {
    availCache.delete(p.key);
    const av = await getAvail(p.key); if (!av) continue;
    const now = av.mine.map(s => s.key).sort().join(','), bk = 'p:' + p.key, before = alerts.base[bk];
    const gone = (before || '').split(',').filter(k => k && !now.split(',').includes(k));
    if (gone.length) addAlert(`👋 „${p.title}“ ist nicht mehr bei ${gone.map(k => SERVICES.find(s => s.key === k)?.name || k).join(' und ')} – du bist bei Staffel ${p.s}, Folge ${p.e}`, p.key);
    alerts.base[bk] = now;
  }
  await refreshProgress();
  for (const p of Object.values(data.progress)) {
    if (!p.aired) continue;
    const cur = epLabel(p.aired), before = alerts.eps[p.key];
    if (before && before !== cur && episodesLeft(p, p.seasons, p.aired) > 0) addAlert(`Neue Folge: „${p.title}“ ${cur.replace('·', '')}`, p.key);
    alerts.eps[p.key] = cur;
    // Nächste Folge fest einplanen (Android) – kommt auch, wenn die App geschlossen ist
    if (p.nextAir?.date && LN() && alerts.on) {
      const at = new Date(p.nextAir.date + 'T18:00:00');
      if (at > new Date()) sendNotification(`Heute neu: „${p.title}“ Staffel ${p.nextAir.s}, Folge ${p.nextAir.e}`, p.key, at);
    }
  }
  saveAlerts();
}
function updateBell() {
  const b = $('.bell .badge'); if (!b) return;
  const n = typeof eingangUnread === 'function' ? eingangUnread() : alerts.feed.filter(a => a.ts > alerts.seen).length;
  b.hidden = !n; b.textContent = n > 9 ? '9+' : n;
}
function openAlerts() {
  const p = openPage('Neuigkeiten');
  alerts.seen = Date.now(); saveAlerts();
  p.body.innerHTML = (alerts.feed.length ? alerts.feed.map(a => `<div class="alert-row card" ${a.key ? `data-open="${a.key}"` : ''}><div>${esc(a.msg)}</div><div class="muted small">${new Date(a.ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</div></div>`).join('')
    : `<div class="empty">Noch keine Neuigkeiten.<br><span class="small">Hier erscheint es, wenn etwas von deiner Merkliste bei deinen Diensten auftaucht oder eine verfolgte Serie neue Folgen hat.</span></div>`)
    + `<button class="btn wide" data-xact="checknow">Jetzt prüfen</button>`;
}

/* ════════════ Einstellungen: OMDb, Benachrichtigungen, QR ════════════ */
function settingsExtras() {
  return `
    ${planerSettingsCard()}
    ${themeSettingsCard()}
    <div class="card"><h3 class="sec">👥 Freunde</h3>
      <p class="small muted">${frReady() ? `Verbunden als <b>@${esc(fr.login)}</b> mit <code>${esc(fr.repo)}</code> · ${friendList().length} Freund${friendList().length === 1 ? '' : 'e'}.` : 'Bewertungen mit Freunden teilen und euch Filme empfehlen – über einen eigenen, privaten Speicher.'}</p>
      <button class="btn" data-fr="open">${frReady() ? 'Freunde öffnen' : 'Einrichten'}</button>
    </div>
    <div class="card"><h3 class="sec">🚫 Nicht für mich</h3>
      <p class="small muted">Diese Genres tauchen nicht in Vorschlägen, Trends und „Was schauen wir heute?“ auf. In der Suche findest du sie trotzdem.</p>
      <div class="moods">${BLOCK_OPTIONS.map(o => `<button class="chip ${settings.block.includes(o.key) ? 'on block' : ''}" data-xact="block" data-v="${o.key}">${o.icon} ${esc(o.label)}${settings.block.includes(o.key) ? ' ✕' : ''}</button>`).join('')}</div>
      <h3 class="sec">📅 Erscheinungsjahr</h3>
      <div class="years"><label>von <input type="number" class="input" id="yFrom" min="1900" max="2100" placeholder="egal" value="${esc(settings.years?.from || '')}"></label><label>bis <input type="number" class="input" id="yTo" min="1900" max="2100" placeholder="egal" value="${esc(settings.years?.to || '')}"></label></div>
      <div class="moods">${[['', '', 'Alle Jahre'], ['1990', '', 'ab 1990'], ['2000', '', 'ab 2000'], ['2010', '', 'ab 2010'], [String(new Date().getFullYear() - 3), '', 'nur Neues (3 Jahre)'], ['', '1999', 'nur Klassiker (bis 1999)']].map(([f, t, l]) => `<button class="chip ${(settings.years?.from || '') === f && (settings.years?.to || '') === t ? 'on' : ''}" data-xact="years" data-v="${f}|${t}">${l}</button>`).join('')}</div>
    </div>
    <div class="card"><h3 class="sec">👥 Profile</h3>
      <p class="small muted">Aktuell: <b>${curProfile().emoji} ${esc(curProfile().name)}</b> · ${liveProfiles().length} Profil${liveProfiles().length > 1 ? 'e' : ''}. Jedes hat eigene Bewertungen und Vorschläge.</p>
      <button class="btn" data-pf="who">Profile verwalten / wechseln</button>
    </div>
    <div class="card"><h3 class="sec">📲 Einrichtung übertragen</h3>
      <p class="small muted">Alle Schlüssel und deine Dienste per QR-Code vom Mac aufs Handy übernehmen – ohne Abtippen.</p>
      <div class="row2">${settings.apiKey ? '<button class="btn" data-xact="qrshow">QR-Code zeigen</button>' : ''}<button class="btn" data-xact="qrscan">📷 QR-Code scannen</button></div>
    </div>
    <div class="card"><h3 class="sec">🔔 Benachrichtigungen</h3>
      <label class="switch-row"><input type="checkbox" id="alertsOn" ${alerts.on ? 'checked' : ''}><span>Bescheid sagen, wenn etwas von der Merkliste bei meinen Diensten auftaucht oder eine verfolgte Serie neue Folgen hat</span></label>
      <p class="small muted">Geprüft wird beim Öffnen der App (höchstens alle 3 Stunden). Bekannte Termine neuer Folgen plant das Handy fest ein – die kommen auch, wenn die App zu ist.</p>
      <div class="row2"><button class="btn" data-xact="notiftest">Test senden</button><button class="btn" data-xact="checknow">Jetzt prüfen</button></div>
    </div>
    <div class="card"><h3 class="sec">⭐ IMDb & Rotten Tomatoes</h3>
      <p class="small muted">${settings.omdbKey ? 'OMDb-Schlüssel ist eingetragen ✓ – die Werte stehen in den Details.' : 'Zusätzliche Wertungen über OMDb – braucht einen eigenen kostenlosen Schlüssel von <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener">omdbapi.com</a> (Typ „FREE“, kommt per Mail und muss dort per Link aktiviert werden).'}</p>
      ${settings.omdbKey ? `<div class="secret"><code id="omdbShow">••••••••</code><button class="mini" data-xact="omdbshow">👁 Anzeigen</button></div>` : ''}
      <input id="omdbIn" class="input" placeholder="${settings.omdbKey ? 'Neuen OMDb-Schlüssel einfügen' : 'OMDb-Schlüssel (8 Zeichen)'}" autocomplete="off" spellcheck="false">
      <button class="btn" data-xact="omdbsave">Speichern & testen</button>
    </div>`;
}
function bindSettingsExtras(p) {
  for (const id of ['yFrom', 'yTo']) $('#' + id, p.body)?.addEventListener('change', () => {
    settings.years = { from: $('#yFrom', p.body).value.trim(), to: $('#yTo', p.body).value.trim() }; saveSettings(); recState.sig = ''; trendState.sig = ''; toast('Jahresfilter gespeichert');
  });
  $('#alertsOn', p.body)?.addEventListener('change', async e => {
    alerts.on = e.target.checked; saveAlerts();
    if (alerts.on && !(await notifyPermission())) toast('Benachrichtigungen sind am Gerät nicht erlaubt – in den Systemeinstellungen freigeben.');
  });
}
async function saveOmdb(val) {
  const old = settings.omdbKey; settings.omdbKey = val.trim(); omdbCache.clear();
  try { const o = await omdb('tt0111161'); if (!o) throw new Error('keine Antwort'); saveSettings(); toast(`OMDb funktioniert ✓ (Die Verurteilten: IMDb ${fmtNum(o.imdb)})`); return true; }
  catch (e) { settings.omdbKey = old; saveSettings(); toast(e.code === 'badkey' ? 'OMDb-Schlüssel ungültig oder noch nicht aktiviert (Link in der Mail anklicken).' : 'Test fehlgeschlagen: ' + e.message); return false; }
}

/* ─── QR-Code: zeigen (Mac) und scannen (Handy) ─── */
async function qrPayload() {
  await tokenReady;
  return JSON.stringify({ kk: 1, tmdb: settings.apiKey, gh: syncCfg.token || '', omdb: settings.omdbKey || '', svc: settings.myServices, region: settings.region });
}
async function openQrShow() {
  const p = openPage('Einrichtung übertragen');
  const qr = qrcode(0, 'L'); qr.addData(await qrPayload()); qr.make();
  p.body.innerHTML = `<div class="qr-wrap">
    <p><b>So geht's:</b> Am Handy Kinokompass öffnen → ⚙️ Einstellungen → „📷 QR-Code scannen“ (oder auf dem Startbildschirm) und diesen Code abfilmen.</p>
    <div class="qr-box">${qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true })}</div>
    <p class="small warn">⚠️ Der Code enthält deine Schlüssel und deinen GitHub-Token. Nicht fotografieren oder teilen – nach dem Scannen diese Seite schließen.</p>
  </div>`;
}
async function openQrScan() {
  const p = openPage('QR-Code scannen');
  p.body.innerHTML = `<div class="qr-wrap"><p>Halte die Kamera auf den QR-Code, den Kinokompass am Mac unter ⚙️ → „QR-Code zeigen“ anzeigt.</p>
    <div class="scan"><video playsinline muted></video><div class="scan-frame"></div></div><p class="small muted" id="scanState">Kamera wird gestartet …</p></div>`;
  const video = $('video', p.body), state = $('#scanState', p.body);
  let stream = null, stop = false;
  p.onClose = () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); }
  catch (e) { state.textContent = 'Kamera nicht verfügbar oder nicht erlaubt (' + e.name + '). In den App-Einstellungen des Handys die Kamera für Kinokompass erlauben.'; return; }
  if (stop) { stream.getTracks().forEach(t => t.stop()); return; }
  video.srcObject = stream; await video.play().catch(() => { });
  state.textContent = 'Suche QR-Code …';
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (stop) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const w = 640, h = Math.round(video.videoHeight * w / video.videoWidth);
      canvas.width = w; canvas.height = h; ctx.drawImage(video, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (code?.data) {
        let cfg = null; try { cfg = JSON.parse(code.data); } catch (_) { }
        if (cfg?.kk === 1) { stop = true; stream.getTracks().forEach(t => t.stop()); vib(); state.textContent = 'Gefunden – übernehme Einstellungen …'; await applyQr(cfg); return; }
        state.textContent = 'Das ist kein Kinokompass-Code.';
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}
async function applyQr(cfg) {
  if (Array.isArray(cfg.svc) && cfg.svc.length) settings.myServices = cfg.svc.filter(k => SERVICES.some(s => s.key === k));
  if (cfg.region) settings.region = cfg.region;
  if (cfg.omdb) settings.omdbKey = cfg.omdb;
  saveSettings();
  const ok = cfg.tmdb ? await testAndSaveKey(cfg.tmdb) : false;
  if (cfg.gh) { await setToken(cfg.gh); syncNow(true); }
  closeAllPages(); render();
  toast(ok ? 'Alles übernommen ✓ – Bewertungen werden synchronisiert' : 'Übernommen, aber der TMDB-Schlüssel funktioniert nicht.');
}

/* ════════════ Klicks der Extras ════════════ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-xact]'); if (!t) return;
  const page = pages.at(-1), key = t.dataset.key, v = t.dataset.v;
  switch (t.dataset.xact) {
    case 'today': return openToday();
    case 'tkind': todayOpts.kind = v; return renderToday(page);
    case 'tmood': { const i = todayOpts.moods.indexOf(v); if (i >= 0) todayOpts.moods.splice(i, 1); else { todayOpts.moods.push(v); if (todayOpts.moods.length > 2) todayOpts.moods.shift(); } vib(); return renderToday(page); }
    case 'ttime': todayOpts.time = v; return renderToday(page);
    case 'trewatch': todayOpts.rewatch = t.checked; return;
    case 'years': { const [f, to] = v.split('|'); settings.years = { from: f, to }; saveSettings(); vib(); recState.sig = ''; trendState.sig = ''; return renderSettings(page); }
    case 'block': {
      const i = settings.block.indexOf(v); if (i >= 0) settings.block.splice(i, 1); else settings.block.push(v);
      saveSettings(); vib(); recState.sig = ''; return renderSettings(page);
    }
    case 'twith': { const i = todayOpts.with.indexOf(v); if (i >= 0) todayOpts.with.splice(i, 1); else todayOpts.with.push(v); vib(); return renderToday(page); }
    case 'tgo': return pickToday(page);
    case 'pstart': {
      const { id } = parseKey(key); let d; try { d = await details('tv', id); } catch (err) { return toast(err.message); }
      setProgress(key, { s: d.seasonList.find(x => x.n > 0)?.n || 1, e: 0 }, d);
      alerts.eps[key] = d.aired ? epLabel(d.aired) : ''; saveAlerts();
      toast('📺 Fortschritt wird mitgezählt');
      if (page?.today) return openItem(key);
      return refresh();
    }
    case 'pnext': {
      const d = page?.item; if (!d) return;
      const next = advanceEpisode(data.progress[key], d.seasonList.filter(x => x.n > 0 && x.eps > 0));
      setProgress(key, next, d); toast(`✓ Staffel ${next.s}, Folge ${next.e} gesehen`); return refresh();
    }
    case 'pstop': { const old = data.progress[key]; delete data.progress[key]; data.tomb['progress:' + key] = stamp(); save(); toast('Wird nicht mehr verfolgt', () => { data.progress[key] = { ...old, ts: stamp() }; delete data.tomb['progress:' + key]; save(); refresh(); }); return refresh(); }
    case 'alerts': return openEingang();
    case 'checknow': toast('Prüfe …'); await checkAlerts(true); toast(alerts.feed.some(a => a.ts > Date.now() - 60000) ? 'Es gibt Neuigkeiten 🔔' : 'Nichts Neues'); if (page?.eing) { page.tab = 'hinw'; renderEingang(page); } updateBell(); return;
    case 'notiftest': { if (!(await notifyPermission())) return toast('Benachrichtigungen sind nicht erlaubt – in den Systemeinstellungen freigeben.'); const was = alerts.on; alerts.on = true; await sendNotification('Test: So sieht eine Kinokompass-Nachricht aus 🎬'); alerts.on = was; return toast('Test gesendet'); }
    case 'omdbsave': { const val = $('#omdbIn')?.value || ''; if (val.trim() && await saveOmdb(val)) renderSettings(page); return; }
    case 'omdbshow': { const c = $('#omdbShow'); c.textContent = c.textContent.startsWith('•') ? settings.omdbKey : '••••••••'; return; }
    case 'qrshow': return openQrShow();
    case 'qrscan': return openQrScan();
  }
});
// Staffel/Folge direkt auswählen
document.addEventListener('change', e => {
  const sel = e.target.closest('[data-pick]'); if (!sel) return;
  const page = pages.at(-1), d = page?.item, key = sel.dataset.key; if (!d) return;
  const pr = data.progress[key] || { s: 1, e: 0 };
  const pos = sel.dataset.pick === 's' ? { s: +sel.value, e: 0 } : { s: pr.s, e: +sel.value };
  setProgress(key, pos, d); refresh();
});

/* ─── Start ─── */
function extrasBoot() {
  const top = $('.topbar');
  if (top && !$('.bell', top)) top.querySelector('[data-act="settings"]').insertAdjacentHTML('beforebegin', `<button class="iconbtn bell" data-xact="alerts" aria-label="Neuigkeiten">🔔<span class="badge" hidden></span></button>`);
  updateBell();
  initTabSwipe();
  LN()?.addListener('localNotificationActionPerformed', ev => { const k = ev.notification?.extra?.key; if (k) openItem(k); });
  setTimeout(() => checkAlerts(), 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkAlerts(); });
}
