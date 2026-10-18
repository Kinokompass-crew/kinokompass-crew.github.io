'use strict';
/* ════════════ Kinokompass – Freunde ════════════
   Gemeinsamer, privater Speicher in einem eigenen GitHub-Repo (in einer Organisation, damit jeder einen eigenen
   fine-grained Token NUR für dieses Repo haben kann – kein Zugriff auf den Workspace). Aufbau im Repo (Branch main):
     mitglieder.json            { list: [{ login, name, emoji, ts }] }
     <login>/geteilt.json       was diese Person teilt: Name, Symbol, Bewertungen (Note, „nochmal schauen“, Datum …)
     <login>/empfehlungen.json  Briefkasten: { list: [{ id, from, fromName, fromEmoji, key, title, …, text, ts }] }
     <login>/reaktionen.json    Reaktionen anderer auf seine Bewertungen: { list: [{ id, from, fromName, fromEmoji, key, title, emoji, ts }] }
   Konvention: Jeder schreibt nur seine eigenen Dateien – außer in fremde Briefkästen (anhängen).
   Freunde ohne eigenen Workspace können dasselbe Repo auch als Geräte-Sync nutzen (<login>/privat/filme.json). */

const FR_KEY = 'kino.friends', FR_TOKEN = 'kino.ftoken';
const fr = (() => { const d = { repo: '', login: '', shareProfile: 'p1', members: [], data: {}, inbox: [], reactions: [], mentions: [], sentReactions: {}, seenInbox: 0, seenReact: 0, seenFeed: 0, last: 0, err: '' }; try { return { ...d, ...(JSON.parse(localStorage.getItem(FR_KEY)) || {}) }; } catch (_) { return d; } })();
let frToken = '';
const saveFr = () => { try { localStorage.setItem(FR_KEY, JSON.stringify(fr)); } catch (_) { } };
const frReady = () => !!(fr.repo && frToken && fr.login);
const frTokenReady = (async () => {
  try { frToken = SecureP() ? ((await SecureP().get({ key: FR_TOKEN }).catch(() => null))?.value || '') : (localStorage.getItem(FR_TOKEN) || ''); } catch (_) { }
})();
async function setFrToken(t) {
  frToken = t.trim();
  try { if (SecureP()) { if (frToken) await SecureP().set({ key: FR_TOKEN, value: frToken }); else await SecureP().remove({ key: FR_TOKEN }).catch(() => { }); } else localStorage.setItem(FR_TOKEN, frToken); } catch (_) { localStorage.setItem(FR_TOKEN, frToken); }
}

// „Kinokompass-crew/daten“, „https://github.com/Kinokompass-crew/daten(.git)(/tree/main)“ oder „git@github.com:…“ → „Orga/Name“
function parseRepo(v) {
  v = String(v || '').trim();
  const m = v.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#]|$)/i) || v.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : '';
}

/* ─── GitHub-Zugriff mit dem Freunde-Token ─── */
async function fgh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, { ...opts, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + frToken, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 404) return null;
  if (!r.ok) { const t = await r.text().catch(() => ''); const e = new Error(`GitHub ${r.status}: ${t.slice(0, 120)}`); e.status = r.status; throw e; }
  return r.status === 204 ? {} : r.json();
}
const frPath = p => `/repos/${fr.repo}/contents/${p}`;
async function frGet(p) { const f = await fgh(frPath(p) + '?ref=main'); return f ? { json: JSON.parse(b64dec(f.content)), sha: f.sha } : { json: null, sha: null }; }
// Datei ändern: laden → fn(alt) → schreiben; bei Konflikt (anderes Handy war schneller) neu versuchen
async function frUpdate(p, fn, msg) {
  for (let i = 0; i < 3; i++) {
    const { json, sha } = await frGet(p);
    const next = fn(json);
    if (next === undefined || JSON.stringify(next) === JSON.stringify(json)) return json;
    try { await fgh(frPath(p), { method: 'PUT', body: JSON.stringify({ message: msg || 'Kinokompass', content: b64enc(JSON.stringify(next)), branch: 'main', ...(sha ? { sha } : {}) }) }); return next; }
    catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }
  }
}

/* ─── Was ich teile: das gewählte Profil, nur Bewertungs-Kerndaten ─── */
function shareExport() {
  const pid = liveProfiles().some(p => p.id === fr.shareProfile) ? fr.shareProfile : profiles.current;
  const d = pid === profiles.current ? data : loadData(pid), p = profiles.list.find(x => x.id === pid) || curProfile();
  const films = {};
  for (const f of Object.values(d.films)) if (f.note) films[f.key] = { key: f.key, id: f.id, kind: f.kind || 'movie', title: f.title, year: f.year, poster: f.poster, genres: f.genres, vote: f.vote, votes: f.votes, note: f.note, feeling: f.feeling || '', comment: f.comment || '', dims: f.dims || null, rewatch: f.rewatch || '', seen: f.seen || '', ts: f.ts };
  const watch = {};
  for (const w of Object.values(d.watch || {})) watch[w.key] = { key: w.key, id: w.id, kind: w.kind || 'movie', title: w.title, year: w.year, poster: w.poster, genres: w.genres, vote: w.vote, votes: w.votes, ts: w.ts };
  return { login: fr.login, name: p.name, emoji: p.emoji, films, watch };
}

/* ─── Abgleich ─── */
let frSyncing = null;
function friendsSync(quiet = true) {
  if (!frReady()) return Promise.resolve(false);
  if (frSyncing) return frSyncing;
  frSyncing = (async () => {
    const mine = shareExport();
    const m = await frUpdate('mitglieder.json', j => {
      const list = [...(j?.list || [])], i = list.findIndex(x => x.login === fr.login);
      const me = { login: fr.login, name: mine.name, emoji: mine.emoji };
      if (i >= 0 && list[i].name === me.name && list[i].emoji === me.emoji) return j;
      if (i >= 0) list[i] = { ...me, ts: Date.now() }; else list.push({ ...me, ts: Date.now() });
      return { list };
    }, 'Kinokompass: Mitglied');
    fr.members = m?.list || fr.members;
    await frUpdate(`${fr.login}/geteilt.json`, j => (JSON.stringify(j?.films) === JSON.stringify(mine.films) && JSON.stringify(j?.watch) === JSON.stringify(mine.watch) && j?.name === mine.name && j?.emoji === mine.emoji) ? j : { ...mine, ts: Date.now() }, 'Kinokompass: Bewertungen geteilt');
    for (const x of fr.members.filter(x => x.login !== fr.login)) {
      try { const { json } = await frGet(`${x.login}/geteilt.json`); if (json) fr.data[x.login] = json; } catch (_) { }
    }
    const { json: inbox } = await frGet(`${fr.login}/empfehlungen.json`);
    fr.inbox = inbox?.list || [];
    const { json: react } = await frGet(`${fr.login}/reaktionen.json`);
    fr.reactions = react?.list || [];
    const { json: ment } = await frGet(`${fr.login}/erwaehnungen.json`);
    fr.mentions = ment?.list || [];
    fr.last = Date.now(); fr.err = ''; saveFr();
    updateFriendBits();
    return true;
  })().catch(e => { fr.err = e.message; saveFr(); if (!quiet) toast('Freunde-Abgleich fehlgeschlagen: ' + e.message); return false; })
    .finally(() => { frSyncing = null; });
  return frSyncing;
}
async function recommendTo(key, logins, text) {
  const b = lookup(key); if (!b) return;
  const me = shareExport();
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: fr.login, fromName: me.name, fromEmoji: me.emoji, ...baseOf(b), text: (text || '').trim().slice(0, 200), ts: Date.now() };
  for (const to of logins) await frUpdate(`${to}/empfehlungen.json`, j => ({ list: [item, ...(j?.list || [])].slice(0, 100) }), `Kinokompass: Empfehlung für ${to}`);
  chLog('recommend'); checkWeekDone();
}
// Reaktion auf die Bewertung eines Freundes (nochmal tippen = zurücknehmen)
const REACTIONS = ['👍', '❤️', '😂', '😮', '🤔'];
async function react(to, key, emoji) {
  const f = friendList().find(x => x.login === to), item = f?.films?.[key]; if (!item) return;
  const sk = to + '|' + key, prev = fr.sentReactions[sk];
  const me = shareExport();
  if (prev === emoji) delete fr.sentReactions[sk]; else fr.sentReactions[sk] = emoji;
  saveFr(); vib();
  await frUpdate(`${to}/reaktionen.json`, j => {
    const list = (j?.list || []).filter(x => !(x.from === fr.login && x.key === key));
    if (prev !== emoji) list.unshift({ id: Date.now().toString(36), from: fr.login, fromName: me.name, fromEmoji: me.emoji, key, title: item.title, emoji, ts: Date.now() });
    return { list: list.slice(0, 300) };
  }, `Kinokompass: Reaktion an ${to}`);
}
async function inboxRemove(id) {
  fr.inbox = fr.inbox.filter(x => x.id !== id); saveFr(); updateFriendBits();
  try { await frUpdate(`${fr.login}/empfehlungen.json`, j => ({ list: (j?.list || []).filter(x => x.id !== id) })); } catch (_) { }
}

/* ─── Auswertungen ─── */
const friendList = () => fr.members.filter(x => x.login !== fr.login).map(x => ({ ...x, ...(fr.data[x.login] || {}), login: x.login }));
// Einigkeit: bei gemeinsam bewerteten Titeln, 100 % = immer gleiche Note, je Punkt Abstand −10 %
function agreement(f) {
  const common = Object.values(f.films || {}).filter(x => data.films[x.key]?.note);
  if (common.length < 3) return { pct: null, n: common.length };
  const diff = common.reduce((a, x) => a + Math.abs(x.note - data.films[x.key].note), 0) / common.length;
  return { pct: Math.max(0, Math.round(100 - diff * 10)), n: common.length };
}
function friendNotes(key) {
  if (!frReady()) return '';
  const l = friendList().filter(f => f.films?.[key]);
  return l.length ? `<div class="fr-notes">👥 ${l.map(f => `<button class="fr-note-btn" data-fr="rating" data-v="${esc(f.login)}" data-key="${key}">${f.emoji || '🙂'} ${esc(f.name || f.login)} <b class="${noteClass(f.films[key].note)} note">${f.films[key].note}</b>${f.films[key].rewatch === 'ja' ? ' 🔁' : ''}${f.films[key].comment ? ' 💬' : ''} ›</button>`).join('')}</div>` : '';
}
const newInbox = () => fr.inbox.filter(x => x.ts > (fr.seenInbox || 0));
function inboxCard() {
  const n = newInbox(); if (!frReady() || !n.length) return '';
  const a = n[0];
  return `<button class="fr-card" data-fr="open"><span class="today-dice">📨</span><span><b>${esc(a.fromEmoji || '🙂')} ${esc(a.fromName || a.from)} empfiehlt dir „${esc(a.title)}“</b><span class="small">${n.length > 1 ? `und ${n.length - 1} weitere Empfehlung${n.length > 2 ? 'en' : ''}` : esc(a.text || 'Antippen zum Ansehen')}</span></span></button>`;
}
// Für den Filmabend: Freunde wie Profile behandeln
const friendMates = () => friendList().filter(f => f.films).map(f => ({ id: 'f:' + f.login, name: f.name || f.login, emoji: f.emoji || '🙂', data: { films: f.films, hidden: {}, watch: {}, progress: {} } }));
// Nach eigenen Änderungen etwas später teilen
let frSoon = 0;
function friendsSyncSoon() { if (!frReady()) return; clearTimeout(frSoon); frSoon = setTimeout(() => friendsSync(), 30000); }
function updateFriendBits() {
  updateFriendBadge(); if (typeof updateBell === 'function') updateBell();
  if (view === 'freunde' && !pages.length) render();
  const p = pages.at(-1); if (p?.fr) renderFriends(p);
  if (!pages.length && view === 'fuerdich') { const c = $('#frCard'); if (c) c.innerHTML = inboxCard(); }
}

/* ════════════ Oberfläche ════════════ */
function openFriends() { const p = openPage('👥 Freunde'); p.fr = true; renderFriends(p); if (frReady()) friendsSync(); }
function renderFriends(p) {
  if (!frReady()) return renderFriendsSetup(p);
  const inbox = fr.inbox, friends = friendList();
  fr.seenInbox = Date.now(); saveFr();
  p.body.innerHTML = `<div class="fr">
    <div class="card who-am-i">👤 Angemeldet als <b>@${esc(fr.login)}</b> – das GitHub-Konto des eingetragenen Tokens. <span class="muted">Nicht dein Konto? Abmelden und mit deinem eigenen Token neu verbinden.</span>
      <button class="btn ghost danger" data-fr="disconnect">Abmelden / Verbindung trennen</button></div>
    <p class="small muted">Du teilst das Profil <b>${esc((profiles.list.find(x => x.id === fr.shareProfile) || curProfile()).emoji)} ${esc((profiles.list.find(x => x.id === fr.shareProfile) || curProfile()).name)}</b>. ${fr.last ? 'Abgeglichen ' + new Date(fr.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}${fr.err ? ` · <span class="error">⚠️ ${esc(fr.err)}</span>` : ''}</p>
    ${inbox.length ? `<h3 class="sec">📨 Empfehlungen an dich</h3>${inbox.map(a => `<div class="card fr-rec"><div class="fr-rec-main" data-open="${a.key}">${posterImg(a, 'w92')}<div><div class="small muted">${esc(a.fromEmoji || '🙂')} ${esc(a.fromName || a.from)} · ${new Date(a.ts).toLocaleDateString('de-DE')}</div><b>${esc(a.title)}</b> <span class="muted small">${a.kind === 'tv' ? 'Serie' : 'Film'}${a.year ? ' · ' + a.year : ''}</span>${a.text ? `<div class="mycomment small">„${esc(a.text)}“</div>` : ''}<div class="avail" data-avail="${a.key}"></div></div></div>
      <div class="rec-acts">${data.films[a.key] ? `<span class="note ${noteClass(data.films[a.key].note)}">Du: ${data.films[a.key].note}</span>` : `<button class="mini" data-act="watch" data-key="${a.key}">🔖 Merken</button><button class="mini" data-act="rate" data-key="${a.key}">✔ Gesehen</button>`}<button class="mini ghost" data-fr="done" data-v="${a.id}">Erledigt</button></div></div>`).join('')}` : ''}
    <h3 class="sec">Deine Freunde</h3>
    ${friends.length ? friends.map(f => { const ag = agreement(f); return `<button class="card fr-friend" data-fr="friend" data-v="${esc(f.login)}"><span class="fr-emoji">${f.emoji || '🙂'}</span><span class="fr-fmain"><b>${esc(f.name || f.login)}</b><span class="small muted">${Object.keys(f.films || {}).length} Bewertungen${ag.pct != null ? ` · ihr seid euch zu <b>${ag.pct} %</b> einig (${ag.n} gemeinsam)` : ''}</span></span><span class="muted">›</span></button>`; }).join('')
      : `<div class="empty">Noch niemand da. Lade einen Freund ein – Anleitung unten.</div>`}
    <details class="more"><summary>➕ Freund einladen</summary>
      <ol class="steps small">
        <li>Dein Freund braucht ein kostenloses <b>GitHub-Konto</b> und schickt dir seinen Benutzernamen.</li>
        <li>Du lädst ihn in die Organisation ein: <a href="https://github.com/orgs/${esc(fr.repo.split('/')[0])}/people" target="_blank" rel="noopener">github.com/orgs/${esc(fr.repo.split('/')[0])}/people</a> → „Invite member“.</li>
        <li>Er nimmt die Einladung an und erstellt einen <b>Fine-grained Token</b>: Resource owner = <b>${esc(fr.repo.split('/')[0])}</b>, Repository = <b>${esc(fr.repo.split('/')[1])}</b>, Contents = Read and write.</li>
        <li>Du schickst ihm die <b>Kinokompass.apk</b> (z. B. per WhatsApp). In der App: ⚙️ → 👥 Freunde → Repo <code>${esc(fr.repo)}</code> + sein Token → „Verbinden“ (Haken bei „auch als Geräte-Sync“).</li>
        <li>Für Filmdaten braucht er einen eigenen kostenlosen TMDB-Schlüssel.</li>
      </ol></details>
    <div class="row2"><button class="btn" data-fr="sync">🔄 Jetzt abgleichen</button><button class="btn ghost" data-fr="setup">⚙️ Einstellungen</button></div>
  </div>`;
  fillAvail(p.body);
}
function renderFriendsSetup(p) {
  p.body.innerHTML = `<div class="fr">
    <div class="card"><h3 class="sec">👥 Mit Freunden verbinden</h3>
      <p class="small">Ihr seht gegenseitig eure Bewertungen, könnt euch Filme und Serien empfehlen und beim Filmabend gemeinsam suchen. Dafür gibt es einen <b>eigenen privaten Speicher</b> auf GitHub – getrennt von allem anderen. Jeder hat einen Schlüssel nur dafür.</p>
      <label class="lbl">Gemeinsames Repo (Organisation/Name)<input id="frRepo" class="input" placeholder="Organisation/Name" value="${esc(fr.repo || 'Kinokompass-crew/daten')}" autocomplete="off" spellcheck="false"></label>
      <label class="lbl">Dein Token für dieses Repo<input id="frTok" class="input" placeholder="${frToken ? '•••• eingetragen – neuen einfügen' : 'github_pat_…'}" autocomplete="off" spellcheck="false"></label>
      <label class="lbl">Welches Profil teilst du?<select id="frProf" class="input">${liveProfiles().map(x => `<option value="${x.id}" ${x.id === (fr.shareProfile || profiles.current) ? 'selected' : ''}>${x.emoji} ${esc(x.name)}</option>`).join('')}</select></label>
      <label class="switch-row"><input type="checkbox" id="frAsSync" ${!syncCfg.token || (syncCfg.repo !== 'ClaudeWorkspace' && syncCfg.owner + '/' + syncCfg.repo === fr.repo) ? 'checked' : ''}><span>Dieses Repo auch als <b>Geräte-Sync</b> nutzen (für Freunde ohne eigenen Workspace – nicht bei dir)</span></label>
      <p class="small error" id="frErr" hidden></p>
      <button class="btn primary wide" data-fr="connect">Verbinden</button>
      ${frReady() ? '<button class="btn ghost danger wide" data-fr="disconnect">Verbindung trennen</button>' : ''}
    </div></div>`;
}
function openFriend(login) {
  const f = friendList().find(x => x.login === login); if (!f) return;
  const p = openPage(`${f.emoji || '🙂'} ${f.name || f.login}`); p.friend = login; p.tab = 'tipps'; renderFriend(p);
}
function renderFriend(p) {
  const f = friendList().find(x => x.login === p.friend); if (!f) return;
  const all = Object.values(f.films || {});
  const tipps = all.filter(x => x.note >= 8 && !data.films[x.key] && !data.hidden[x.key] && !isBlocked(x)).sort((a, b) => b.note - a.note || (b.seen || '').localeCompare(a.seen || ''));
  const common = all.filter(x => data.films[x.key]).sort((a, b) => Math.abs(b.note - data.films[b.key].note) - Math.abs(a.note - data.films[a.key].note));
  const recent = [...all].sort((a, b) => (b.seen || '').localeCompare(a.seen || '') || b.ts - a.ts);
  const ag = agreement(f);
  const row = x => `<div class="frow card" data-open="${x.key}">${posterImg(x, 'w185')}<div class="frow-main"><div class="ftitle">${esc(x.title)}</div><div class="muted small">${esc(metaLine(x))}</div>
    <div class="frow-meta"><span class="note ${noteClass(x.note)}">${esc(f.name || f.login)}: ${x.note}</span>${x.rewatch === 'ja' ? '<span class="tag">🔁</span>' : ''}${data.films[x.key] ? `<span class="note ${noteClass(data.films[x.key].note)}">Du: ${data.films[x.key].note}</span>` : ''}</div>
    ${p.tab === 'tipps' ? `<div class="avail" data-avail="${x.key}"></div>` : ''}</div></div>`;
  const list = p.tab === 'tipps' ? tipps : p.tab === 'gemeinsam' ? common : recent;
  p.body.innerHTML = `<div class="fr">
    <div class="stats"><div><b>${all.length}</b><span>Bewertungen</span></div><div><b>${ag.pct != null ? ag.pct + ' %' : '–'}</b><span>einig</span></div><div><b>${common.length}</b><span>gemeinsam</span></div></div>
    <div class="segtabs">${[['tipps', `Tipps für dich (${tipps.length})`], ['gemeinsam', 'Gemeinsam'], ['alle', 'Alle']].map(([k, l]) => `<button class="${p.tab === k ? 'on' : ''}" data-fr="tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${p.tab === 'tipps' ? '<p class="small muted">Was ' + esc(f.name || f.login) + ' mit 8 oder besser bewertet hat und du noch nicht kennst.</p>' : p.tab === 'gemeinsam' ? '<p class="small muted">Größte Meinungsverschiedenheiten zuerst.</p>' : ''}
    ${list.length ? list.slice(0, 80).map(row).join('') : '<div class="empty">Hier ist noch nichts.</div>'}
  </div>`;
  fillAvail(p.body);
}
function openRecommend(key) {
  const friends = friendList(); if (!friends.length) return toast('Noch keine Freunde verbunden');
  const b = lookup(key);
  const p = openPage('📨 Empfehlen'); p.rec = { key, to: friends.length === 1 ? [friends[0].login] : [] };
  const draw = () => {
    p.body.innerHTML = `<div class="fr"><div class="fr-item">${posterImg(b, 'w185')}<div><b>${esc(b.title)}</b><div class="small muted">${b.kind === 'tv' ? 'Serie' : 'Film'}</div></div></div>
      <h3 class="sec">An wen?</h3><div class="moods">${friends.map(f => `<button class="chip ${p.rec.to.includes(f.login) ? 'on' : ''}" data-fr="to" data-v="${esc(f.login)}">${f.emoji || '🙂'} ${esc(f.name || f.login)}${f.films?.[key] ? ' (kennt ' + (b.kind === 'tv' ? 'sie' : 'ihn') + ')' : ''}</button>`).join('')}</div>
      <textarea id="recText" class="input" rows="2" maxlength="200" placeholder="Kurze Nachricht (optional) – z. B. „Musst du sehen!“"></textarea>
      <button class="btn primary wide" data-fr="send" ${p.rec.to.length ? '' : 'disabled'}>📨 Empfehlung senden</button></div>`;
  };
  p.draw = draw; draw();
}

/* ════════════ Freunde-Tab ════════════ */
let feedCount = 30;
const ago = ts => { const m = Math.round((Date.now() - ts) / 60e3); return m < 2 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : m < 2880 ? 'gestern' : m < 43200 ? `vor ${Math.round(m / 1440)} Tagen` : new Date(ts).toLocaleDateString('de-DE'); };
const newReactions = () => fr.reactions.filter(x => x.ts > (fr.seenReact || 0));
const newFeed = () => friendList().flatMap(f => Object.values(f.films || {}).filter(x => x.ts > (fr.seenFeed || 0) && x.ts > Date.now() - 30 * 864e5));
function updateFriendBadge() {
  const b = document.querySelector('.tabbar [data-go="freunde"]'); if (!b) return;
  const n = frReady() ? newInbox().length + newReactions().length + newFeed().length : 0;
  let badge = b.querySelector('.tab-badge');
  if (!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; b.appendChild(badge); }
  badge.hidden = !n || view === 'freunde'; badge.textContent = n > 9 ? '9+' : n;
}
function reactBar(login, key) {
  const sent = fr.sentReactions[login + '|' + key];
  return `<div class="react-bar">${REACTIONS.map(e => `<button class="react ${sent === e ? 'on' : ''}" data-fr="react" data-v="${esc(login)}" data-key="${key}" data-e="${e}">${e}</button>`).join('')}
    ${data.films[key] ? `<span class="note ${noteClass(data.films[key].note)}">Du: ${data.films[key].note}</span>` : data.watch[key] ? '<span class="tag">🔖 gemerkt</span>' : `<button class="mini" data-act="watch" data-key="${key}">🔖 Merken</button>`}</div>`;
}
function ratingBody(x) {
  const feel = FEELINGS.find(f => f.key === x.feeling), rw = REWATCH.find(r => r.key === x.rewatch);
  const dims = x.dims ? DIMS.filter(d => (x.dims[d.key] || 0) >= 3) : [];
  return `<div class="feed-score"><span class="note ${noteClass(x.note)} big-note">${x.note}</span>${feel ? `<span>${feel.icon} ${feel.label}</span>` : ''}${rw && rw.key === 'ja' ? `<span>🔁 würde nochmal schauen</span>` : ''}</div>
    ${dims.length ? `<div class="dimchips">${dims.map(d => `<span class="tag">${d.icon} ${d.label}</span>`).join('')}</div>` : ''}
    ${x.comment ? `<p class="mycomment">„${esc(x.comment)}“</p>` : ''}`;
}
function feedCard(f, x) {
  return `<div class="card feed">
    <div class="feed-head"><span class="feed-emoji">${f.emoji || '🙂'}</span><b>${esc(f.name || f.login)}</b><span class="muted small">hat bewertet · ${ago(x.ts || 0)}</span></div>
    <div class="feed-body" data-open="${x.key}">${posterImg(x, 'w185')}<div class="feed-main"><div class="ftitle">${esc(x.title)}</div><div class="muted small">${esc(metaLine(x))}</div>${ratingBody(x)}</div></div>
    ${reactBar(f.login, x.key)}</div>`;
}
function renderFriendsTab(el) {
  if (!frReady()) {
    el.innerHTML = `<div class="card setup"><h2>👥 Freunde</h2><p>Seht gegenseitig eure Bewertungen, reagiert darauf, empfehlt euch Filme und findet, was ihr beide sehen wollt.</p>
      <p class="small muted">Der gemeinsame Speicher ist schon eingerichtet: <code>Kinokompass-crew/daten</code>. Du brauchst nur noch deinen Token dafür.</p>
      <button class="btn primary" data-fr="open">Jetzt verbinden</button></div>`;
    return;
  }
  const friends = friendList(), reacts = newReactions();
  // gemeinsame Merkliste: was du und mindestens ein Freund sehen wollen
  const both = Object.values(data.watch).map(w => ({ w, who: friends.filter(f => f.watch?.[w.key]) })).filter(x => x.who.length);
  // Freunde wollen es sehen, du kennst es schon und fandest es gut → Tipp zum Empfehlen
  const tellThem = friends.flatMap(f => Object.values(f.watch || {}).filter(w => data.films[w.key]?.note >= 8).map(w => ({ f, w }))).slice(0, 10);
  const feed = friends.flatMap(f => Object.values(f.films || {}).map(x => ({ f, x }))).sort((a, b) => (b.x.ts || 0) - (a.x.ts || 0));
  el.innerHTML = `
    <div class="who-line">👤 Angemeldet als <b>@${esc(fr.login)}</b><button class="mini ghost" data-fr="disconnect">Abmelden</button></div>
    <div class="fr-strip">${friends.map(f => { const ag = agreement(f); return `<button class="fr-chip" data-fr="friend" data-v="${esc(f.login)}"><span class="fr-chip-e">${f.emoji || '🙂'}</span><span>${esc(f.name || f.login)}</span><span class="muted small">${ag.pct != null ? ag.pct + ' % einig' : Object.keys(f.films || {}).length + ' Bew.'}</span></button>`; }).join('')}
      <button class="fr-chip add" data-fr="open"><span class="fr-chip-e">＋</span><span>Einladen</span><span class="muted small">&nbsp;</span></button></div>
    ${newInbox().length ? inboxCard() : ''}
    ${reacts.length ? `<div class="card react-news"><b>💬 Reaktionen auf deine Bewertungen</b>${reacts.slice(0, 6).map(r => `<div class="small" data-open="${r.key}">${r.fromEmoji || '🙂'} ${esc(r.fromName || r.from)} ${r.emoji} deine Bewertung von <b>${esc(r.title)}</b> · ${ago(r.ts)}</div>`).join('')}</div>` : ''}
    ${both.length ? `<div class="list-sec"><div class="list-head static"><span>🎯 Wollt ihr beide sehen</span><span class="muted small">für den Filmabend</span></div><div class="hscroll">${both.map(({ w, who }) => `<div class="mp" data-open="${w.key}">${posterImg(w, 'w185')}<span class="corner tmdbc">${who.map(f => f.emoji || '🙂').join('')}</span><span class="dot" data-avail-dot="${w.key}"></span><div class="mp-t">${esc(w.title)}</div><div class="mp-k">mit ${esc(who.map(f => f.name || f.login).join(', '))}</div></div>`).join('')}</div></div>` : ''}
    ${tellThem.length ? `<div class="list-sec"><div class="list-head static"><span>💡 Kennst du schon – sag's ihnen</span></div><div class="hscroll">${tellThem.map(({ f, w }) => `<div class="mp" data-fr="recommend" data-key="${w.key}">${posterImg(w, 'w185')}<span class="note ${noteClass(data.films[w.key].note)} corner">${data.films[w.key].note}</span><div class="mp-t">${esc(w.title)}</div><div class="mp-k">${f.emoji || '🙂'} ${esc(f.name || f.login)} will ihn sehen</div></div>`).join('')}</div></div>` : ''}
    <h3 class="sec">Neu bei deinen Freunden</h3>
    ${feed.length ? feed.slice(0, feedCount).map(({ f, x }) => feedCard(f, x)).join('') + (feed.length > feedCount ? `<button class="btn wide" data-fr="feedmore">Mehr anzeigen</button>` : '')
      : `<div class="empty">${friends.length ? 'Deine Freunde haben noch nichts bewertet.' : 'Noch keine Freunde verbunden – tippe auf „＋ Einladen“.'}</div>`}`;
  fillAvail(el);
  // gesehen markieren (für die Zahl am Tab)
  fr.seenFeed = Date.now(); fr.seenReact = Date.now(); saveFr(); updateFriendBadge();
}
function openFriendRating(login, key) {
  const f = friendList().find(x => x.login === login), x = f?.films?.[key]; if (!x) return;
  const p = openPage(`${f.emoji || '🙂'} ${f.name || f.login}s Bewertung`);
  p.body.innerHTML = `<div class="fr"><div class="feed-body" data-open="${key}">${posterImg(x, 'w185')}<div class="feed-main"><div class="ftitle">${esc(x.title)}</div><div class="muted small">${esc(metaLine(x))}${x.seen ? ' · gesehen ' + new Date(x.seen + 'T12:00').toLocaleDateString('de-DE') : ''}</div>${ratingBody(x)}</div></div>
    ${x.dims ? `<h3 class="sec">Kurz-Abfrage</h3>${DIMS.map(d => `<div class="tbar"><span class="tl">${d.icon} ${d.label}</span><span class="tt abs"><span class="tf" style="left:0;width:${(x.dims[d.key] || 0) * 25}%"></span></span><span class="muted small">${LEVELS[x.dims[d.key] || 0]}</span></div>`).join('')}` : ''}
    ${reactBar(login, key)}
    ${data.films[key] ? `<p class="small muted">Du hast ${data.films[key].note}/10 gegeben${Math.abs(data.films[key].note - x.note) >= 3 ? ' – da seid ihr euch ziemlich uneinig 😄' : Math.abs(data.films[key].note - x.note) <= 1 ? ' – ihr seid euch einig 🤝' : ''}.</p>` : ''}</div>`;
}

/* ─── Klicks ─── */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-fr]'); if (!t) return;
  const p = pages.at(-1), v = t.dataset.v;
  switch (t.dataset.fr) {
    case 'open': return openFriends();
    case 'friend': return openFriend(v);
    case 'tab': p.tab = v; return renderFriend(p);
    case 'sync': toast('Gleiche ab …'); return friendsSync(false).then(ok => ok && toast('Abgeglichen ✓'));
    case 'setup': return renderFriendsSetup(p);
    case 'done': return inboxRemove(v);
    case 'react': { await react(v, t.dataset.key, t.dataset.e).catch(err => toast('Reaktion fehlgeschlagen: ' + err.message)); const bar = t.closest('.react-bar'); if (bar) bar.outerHTML = reactBar(v, t.dataset.key); return; }
    case 'rating': return openFriendRating(v, t.dataset.key);
    case 'feedmore': feedCount += 30; return render();
    case 'recommend': return openRecommend(t.dataset.key);
    case 'to': { const i = p.rec.to.indexOf(v); if (i >= 0) p.rec.to.splice(i, 1); else p.rec.to.push(v); return p.draw(); }
    case 'send': {
      t.disabled = true; t.textContent = 'Sende …';
      try { await recommendTo(p.rec.key, p.rec.to, $('#recText', p.body)?.value); vib(); closePage(); toast('📨 Empfehlung gesendet'); }
      catch (err) { toast('Senden fehlgeschlagen: ' + err.message); t.disabled = false; t.textContent = '📨 Empfehlung senden'; }
      return;
    }
    case 'connect': {
      const repo = parseRepo($('#frRepo', p.body)?.value);
      const tok = ($('#frTok', p.body)?.value || '').trim();
      const showErr = msg => { const el = $('#frErr', p.body); if (el) { el.textContent = '⚠️ ' + msg; el.hidden = false; } toast(msg); };
      if (!repo) return showErr('Repo bitte als „Organisation/Name“ (z. B. Kinokompass-crew/daten) oder als GitHub-Link eingeben');
      if (tok && !/^(github_pat_|ghp_|gho_)/.test(tok)) return showErr('Das sieht nicht nach einem GitHub-Token aus (beginnt mit „github_pat_“). Hast du vielleicht den Link ins Token-Feld eingefügt?');
      if (tok) await setFrToken(tok);
      if (!frToken) return toast('Bitte den Token einfügen');
      t.disabled = true; t.textContent = 'Prüfe …';
      try {
        const me = await fgh('/user'); if (!me?.login) throw new Error('Token ungültig');
        const r = await fgh(`/repos/${repo}`); if (!r) throw new Error('Repo nicht gefunden oder kein Zugriff – Token-Rechte prüfen');
        fr.repo = repo; fr.login = me.login; fr.shareProfile = $('#frProf', p.body)?.value || profiles.current; saveFr();
        if ($('#frAsSync', p.body)?.checked) { // Freund ohne Workspace: Geräte-Sync ins gemeinsame Repo
          const [owner, name] = repo.split('/');
          if (syncCfg.repo === 'ClaudeWorkspace' && syncCfg.token) try { localStorage.setItem('kino.sync.prev', JSON.stringify(syncCfg)); } catch (_) { } // für „Zurück auf meinen Workspace“
          Object.assign(syncCfg, { owner, repo: name, branch: 'main', path: `${me.login}/privat/filme.json` });
          await setToken(frToken); saveSyncCfg(); syncNow(true);
        }
        await friendsSync(false); toast(`Verbunden als @${me.login} ✓`); renderFriends(p);
        if (fr.members.some(m => m.login === me.login && m.name && m.name !== shareExport().name)) toast(`Hinweis: @${me.login} ist schon als „${fr.members.find(m => m.login === me.login).name}“ verbunden – benutzt hier jemand einen fremden Token?`);
      } catch (err) {
        const msg = err.status === 401 ? 'Token ungültig oder abgelaufen – bitte neu erstellen.' : err.status === 403 ? 'Token hat keine Berechtigung – Contents „Read and write“ für das Repo setzen bzw. in der Organisation freigeben.' : err.message;
        showErr('Verbinden fehlgeschlagen: ' + msg); t.disabled = false; t.textContent = 'Verbinden';
      }
      return;
    }
    case 'disconnect': {
      if (!confirm('Verbindung zu den Freunden trennen? Deine geteilten Bewertungen bleiben im gemeinsamen Repo.')) return;
      await setFrToken(''); Object.assign(fr, { repo: '', login: '', members: [], data: {}, inbox: [], reactions: [], mentions: [] }); saveFr(); updateFriendBadge();
      toast('Abgemeldet – jetzt mit deinem eigenen Token verbinden');
      if (p?.fr) return renderFriendsSetup(p); // auf der Freunde-Seite: gleich das Formular zeigen
      closeAllPages(); return openFriends(); // im Freunde-Tab: Formular öffnen
    }
  }
});

/* ─── Start ─── */
function friendsBoot() {
  frTokenReady.then(() => {
    if (!frReady()) return;
    updateFriendBadge();
    friendsSync();
    setInterval(() => { if (document.visibilityState === 'visible' || Date.now() - fr.last > 10 * 60e3) friendsSync(); }, 5 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - fr.last > 60e3) friendsSync(); });
  });
}
