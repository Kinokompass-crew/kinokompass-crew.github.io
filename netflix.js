'use strict';
/* ════════════ Kinokompass – Netflix-Verlauf importieren & schnell bewerten ════════════
   Datei wählen → (Profil wählen) → Titel der Datenbank zuordnen → Auswahl prüfen → nacheinander mit einem Tipp benoten.
   Die Warteschlange liegt nur auf diesem Gerät (kino.nfqueue); fertige Bewertungen werden normal synchronisiert.
   Schnell-Bewertungen haben keine Kurz-Abfrage (dims fehlen) – die lässt sich später über „Ändern“ nachholen. */

const nfqKey = () => 'kino.nfqueue' + (profiles.current === 'p1' ? '' : '.' + profiles.current); // je Profil
const readQueue = () => { try { return JSON.parse(localStorage.getItem(nfqKey())) || []; } catch (_) { return []; } };
let nfQueue = readQueue();
function saveQueue() { nfQueue = nfQueue.filter(q => !data.films[q.key]); try { localStorage.setItem(nfqKey(), JSON.stringify(nfQueue)); } catch (_) { } }
function importQueueCard() {
  const n = nfQueue.filter(q => !data.films[q.key]).length;
  return n ? `<button class="today-btn nfq" data-nf="rate"><span class="today-dice">📥</span><span><b>Noch ${n} aus Netflix bewerten</b><span class="small">Ein Tipp pro Titel – geht schnell</span></span></button>` : '';
}

/* ─── Schritt 1: Datei ─── */
function openNetflix() { const p = openPage('Netflix-Verlauf importieren'); p.nf = {}; renderNfStart(p); }
function renderNfStart(p, err) {
  p.body.innerHTML = `<div class="nf">
    <div class="card"><h3 class="sec">So holst du deinen Verlauf</h3>
      <ol class="steps">
        <li>Am Mac im Browser <b>netflix.com</b> öffnen und <b>dein eigenes Profil</b> auswählen.</li>
        <li><a href="https://www.netflix.com/viewingactivity" target="_blank" rel="noopener">netflix.com/viewingactivity</a> öffnen (Konto → dein Profil → „Wiedergabeaktivität“).</li>
        <li>Ganz unten auf <b>„Alle herunterladen“</b> – du bekommst <code>NetflixViewingHistory.csv</code>.</li>
        <li>Die Datei hier auswählen.</li>
      </ol>
      <p class="small ok-note">✓ Diese Datei enthält nur, was in <b>deinem Profil</b> geschaut wurde – nicht die anderen Profile im Familien-Abo.</p>
      <p class="small muted">Auch möglich: <code>ViewingActivity.csv</code> aus dem großen Netflix-Datenexport. Dort stecken alle Profile – du wählst gleich deins aus, der Rest wird ignoriert. Trailer und kurzes Reinschauen (unter 5 Minuten) zählen nicht.</p>
    </div>
    ${err ? `<div class="card error">⚠️ ${esc(err)}</div>` : ''}
    <label class="btn primary wide big-btn">📄 Datei auswählen<input type="file" id="nfFile" accept=".csv,text/csv" hidden></label>
    <p class="small muted center">Die Datei bleibt auf deinem Gerät – sie wird nirgends hochgeladen. Nur die Titel werden in der Filmdatenbank gesucht.</p>
  </div>`;
  $('#nfFile', p.body).addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const parsed = parseNetflix(await f.text());
    if (!parsed.rows.length) return renderNfStart(p, 'Das sieht nicht nach einem Netflix-Verlauf aus. Erwartet wird NetflixViewingHistory.csv (Spalten „Title“ und „Date“) oder ViewingActivity.csv.');
    p.nf.parsed = parsed;
    if (parsed.profiles.length > 1) return renderNfProfiles(p);
    nfMatch(p, parsed.profiles[0] || '');
  });
}
function renderNfProfiles(p) {
  const counts = {}; p.nf.parsed.rows.forEach(r => counts[r.profile] = (counts[r.profile] || 0) + 1);
  p.body.innerHTML = `<div class="nf"><h2>Welches Profil bist du?</h2><p class="small muted">Die Datei enthält alle Profile des Abos. Übernommen wird nur das, was du hier wählst.</p>
    ${p.nf.parsed.profiles.map(n => `<button class="btn wide profile-btn" data-nf="profile" data-v="${esc(n)}">👤 ${esc(n)} <span class="muted small">${counts[n]} Einträge</span></button>`).join('')}</div>`;
}

/* ─── Schritt 2: Zuordnen ─── */
// Exakter Treffer? Erst deutscher und Originaltitel, dann der englische (Netflix-Konto auf Englisch: „The Collini Case“ = „Der Fall Collini“)
async function nfExact(title, kind, res) {
  const n = normTitle(title);
  const hit = res.find(r => r.kind === kind && (normTitle(r.title) === n || normTitle(r.orig) === n));
  if (hit) return hit;
  const en = await tmdb(`/search/${kind}`, { query: title, language: 'en-US', include_adult: 'false' }).catch(() => null);
  const e = en?.results?.find(r => normTitle(r.title || r.name) === n);
  if (!e) return null;
  return res.find(r => r.kind === kind && r.id === e.id) || slim(await tmdb(`/${kind}/${e.id}`).catch(() => e), kind);
}
async function nfMatch(p, profile) {
  const g = groupNetflix(p.nf.parsed.rows, profile);
  const all = [...g.movies, ...g.series];
  p.nf.profile = profile; p.nf.items = all;
  p.body.innerHTML = `<div class="nf"><h2>${all.length} Titel gefunden</h2><p class="muted small">${g.movies.length} Filme, ${g.series.length} Serien${profile ? ` · Profil „${esc(profile)}“` : ''}. Suche sie in der Filmdatenbank …</p>
    <div class="bar"><div class="bar-in" style="width:0%"></div></div><p class="small muted" id="nfProg">0 / ${all.length}</p></div>`;
  let done = 0;
  await pool(all, 4, async it => {
    try {
      const res = await searchAll(it.title, it.kind);
      const exact = await nfExact(it.title, it.kind, res);
      it.match = exact || res.find(r => r.kind === it.kind) || res[0] || null;
      it.sure = !!exact;
      // „Cash Queens: A Tidy Sum“ – kein Film dieses Namens, aber eine Serie „Cash Queens“? Dann ist es eine Folge.
      const i = it.title.indexOf(': ');
      if (!exact && it.kind === 'movie' && i > 0) {
        const name = it.title.slice(0, i);
        const tv = await nfExact(name, 'tv', await searchAll(name, 'tv'));
        if (tv) Object.assign(it, { kind: 'tv', title: name, match: tv, sure: true, seasons: { 1: it.count }, first: it.last });
      }
    } catch (_) { it.match = null; }
    done++;
    if (!pages.includes(p)) return;
    const bar = $('.bar-in', p.body); if (bar) bar.style.width = Math.round(done / all.length * 100) + '%';
    const pr = $('#nfProg', p.body); if (pr) pr.textContent = `${done} / ${all.length}`;
  });
  if (!pages.includes(p)) return;
  // Doppelte zusammenführen (mehrere Einzelfolgen derselben Serie)
  const byKey = new Map();
  p.nf.items = all.filter(it => {
    if (!it.match) return true;
    const o = byKey.get(it.match.key);
    if (!o) { byKey.set(it.match.key, it); return true; }
    o.count += it.count; if ((it.last || '') > (o.last || '')) o.last = it.last;
    if (it.seasons) { o.seasons = o.seasons || {}; for (const [s, n] of Object.entries(it.seasons)) o.seasons[s] = (o.seasons[s] || 0) + n; }
    return false;
  });
  p.nf.items.forEach(it => { it.on = !!(it.match && it.sure && !data.films[it.match.key]); });
  renderNfReview(p);
}
function renderNfReview(p) {
  const items = p.nf.items, found = items.filter(i => i.match), missing = items.filter(i => !i.match);
  const row = (it, i) => {
    const m = it.match, rated = data.films[m.key];
    return `<label class="nf-row ${it.on ? 'on' : ''}"><input type="checkbox" data-nfi="${i}" ${it.on ? 'checked' : ''} ${rated ? 'disabled' : ''}>
      ${posterImg(m, 'w92')}<span class="nf-main"><b>${esc(m.title)}</b> <span class="muted small">${esc(m.year)}</span>
      ${normTitle(m.title) !== normTitle(it.title) ? `<span class="small muted nf-orig">Netflix: ${esc(it.title)}</span>` : ''}
      <span class="small muted">${it.kind === 'tv' ? `${it.count} Folge${it.count > 1 ? 'n' : ''} · ` : ''}zuletzt ${it.last ? fmtDate(it.last) + ' ' + it.last.slice(0, 4) : '?'}</span>
      ${rated ? `<span class="tag">schon bewertet: ${rated.note}</span>` : !it.sure ? '<span class="tag warn-tag">unsicher – bitte prüfen</span>' : ''}</span></label>`;
  };
  const idx = it => items.indexOf(it);
  const sel = items.filter(i => i.on).length;
  const sec = (label, list) => list.length ? `<h3 class="sec">${label} (${list.length})</h3>${list.map(it => row(it, idx(it))).join('')}` : '';
  p.body.innerHTML = `<div class="nf">
    <p class="small muted">Haken = wird übernommen. Unsichere Treffer sind abgewählt – tipp sie an, wenn sie stimmen.</p>
    <div class="row2"><button class="mini" data-nf="all">Alle wählen</button><button class="mini" data-nf="none">Keine</button></div>
    ${sec('🎬 Filme', found.filter(i => i.kind === 'movie'))}
    ${sec('📺 Serien', found.filter(i => i.kind === 'tv'))}
    ${missing.length ? `<details class="more"><summary>Nicht gefunden (${missing.length})</summary><p class="small muted">${missing.map(i => esc(i.title)).join(' · ')}</p></details>` : ''}
    <label class="switch-row"><input type="checkbox" id="nfWithProg" checked><span>Serien der letzten 60 Tage unter <b>📺 Weiterschauen</b> aufnehmen (mit ungefährem Stand)</span></label>
    <div class="sticky-acts"><button class="btn primary wide" data-nf="take" ${sel ? '' : 'disabled'}>✓ ${sel} Titel übernehmen & bewerten</button></div>
  </div>`;
}
async function nfTake(p) {
  const chosen = p.nf.items.filter(i => i.on && i.match && !data.films[i.match.key]);
  const withProgress = $("#nfWithProg", p.body)?.checked;
  const have = new Set(nfQueue.map(q => q.key));
  for (const it of chosen) {
    if (have.has(it.match.key)) continue;
    nfQueue.push({ ...baseOf(it.match), seen: it.last || '', nfTitle: it.title, nfCount: it.count });
  }
  saveQueue();
  // Serien-Stand: höchste geschaute Staffel, Folge ≈ Anzahl geschauter Folgen darin
  if (withProgress) {
    const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    const recent = chosen.filter(i => i.kind === 'tv' && i.last >= cutoff && !data.progress[i.match.key]);
    p.body.innerHTML = `<div class="loading-note">Lege Serien-Fortschritt an …</div>`;
    await pool(recent, 3, async it => {
      try {
        const d = await details('tv', it.match.id);
        const s = Math.max(...Object.keys(it.seasons).map(Number));
        const eps = d.seasonList.find(x => x.n === s)?.eps || it.seasons[s];
        setProgress(it.match.key, { s, e: Math.min(it.seasons[s], eps) }, d);
        if (d.aired) alerts.eps[it.match.key] = epLabel(d.aired);
      } catch (_) { }
    });
    saveAlerts();
  }
  closePage();
  toast(`${chosen.length} Titel übernommen`);
  if (nfQueue.length) openQuickRate(); else render();
}

/* ─── Schritt 3: Schnell bewerten ─── */
function openQuickRate() { saveQueue(); const p = openPage('Schnell bewerten', { onClose: () => render() }); p.qr = { done: [] }; renderQuick(p); }
function renderQuick(p) {
  saveQueue();
  const q = nfQueue[0], total = nfQueue.length + p.qr.done.length;
  if (!q) {
    p.body.innerHTML = `<div class="empty big">🎉 Fertig!<br><span class="small">${p.qr.done.length ? `${p.qr.done.length} Titel bewertet – deine Vorschläge werden neu berechnet.` : 'Nichts mehr offen.'}<br>Die Kurz-Abfrage (lustig, spannend …) kannst du in den Details über „Ändern“ nachholen.</span><br><button class="btn primary" data-go="fuerdich">✨ Zu meinen Vorschlägen</button></div>`;
    return;
  }
  p.body.innerHTML = `<div class="quick">
    <div class="quick-top"><span class="muted small">${p.qr.done.length + 1} / ${total}</span>${p.qr.done.length ? '<button class="mini ghost" data-nf="undo">↶ Rückgängig</button>' : ''}</div>
    <div class="bar"><div class="bar-in" style="width:${Math.round(p.qr.done.length / total * 100)}%"></div></div>
    <div class="quick-card">${posterImg(q, 'w342')}
      <h2>${esc(q.title)}</h2>
      <div class="muted small">${q.kind === 'tv' ? 'Serie' : 'Film'}${q.year ? ' · ' + q.year : ''}${q.seen ? ' · auf Netflix ' + fmtDate(q.seen) + ' ' + q.seen.slice(0, 4) : ''}${q.kind === 'tv' && q.nfCount ? ` · ${q.nfCount} Folge${q.nfCount > 1 ? 'n' : ''}` : ''}</div>
    </div>
    <p class="center small muted">Wie gut war ${q.kind === 'tv' ? 'die Serie' : 'der Film'}? Ein Tipp genügt.</p>
    <div class="notes">${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `<button class="nbtn ${noteClass(n)}" data-nf="note" data-v="${n}">${n}</button>`).join('')}</div>
    <div class="row2"><button class="btn" data-nf="skip">Später</button><button class="btn ghost" data-nf="drop">Nicht gesehen / falsch</button></div>
  </div>`;
}
function quickNote(p, note) {
  const q = nfQueue.shift(); if (!q) return;
  const { seen, nfTitle, nfCount, ...base } = q;
  data.films[q.key] = { ...base, note, feeling: '', comment: '', seen: seen || new Date().toISOString().slice(0, 10), ts: stamp(), quick: true, ...(q.kind === 'tv' && nfCount ? { nfEpisodes: nfCount } : {}) };
  delete data.tomb['films:' + q.key];
  p.qr.done.push(q); save(); vib(); renderQuick(p);
}

/* ─── Klicks ─── */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-nf]'); if (!t) return;
  const p = pages.at(-1), v = t.dataset.v;
  switch (t.dataset.nf) {
    case 'open': return openNetflix();
    case 'rate': return openQuickRate();
    case 'profile': return nfMatch(p, v);
    case 'all': p.nf.items.forEach(i => { if (i.match && !data.films[i.match.key]) i.on = true; }); return renderNfReview(p);
    case 'none': p.nf.items.forEach(i => i.on = false); return renderNfReview(p);
    case 'take': return nfTake(p);
    case 'note': return quickNote(p, +v);
    case 'skip': { const q = nfQueue.shift(); if (q) nfQueue.push(q); saveQueue(); return renderQuick(p); }
    case 'drop': { nfQueue.shift(); saveQueue(); return renderQuick(p); }
    case 'undo': {
      const q = p.qr.done.pop(); if (!q) return;
      delete data.films[q.key]; data.tomb['films:' + q.key] = stamp(); save();
      nfQueue.unshift(q); saveQueue(); return renderQuick(p);
    }
  }
});
document.addEventListener('change', e => {
  const cb = e.target.closest('[data-nfi]'); if (!cb) return;
  const p = pages.at(-1); const it = p?.nf?.items?.[+cb.dataset.nfi]; if (!it) return;
  it.on = cb.checked; cb.closest('.nf-row').classList.toggle('on', it.on);
  const n = p.nf.items.filter(i => i.on).length, b = $('[data-nf="take"]', p.body);
  if (b) { b.disabled = !n; b.textContent = `✓ ${n} Titel übernehmen & bewerten`; }
});
