'use strict';
/* ════════════ Kinokompass – Personen, Ketten, Sprachsuche ════════════
   Schauspieler-/Regie-Seiten (alle Titel, was du davon kennst, was zu dir passt), „Wenn dir das gefällt …“-Ketten
   (von Empfehlung zu Empfehlung, mit Spur), Personen in der Suche, Sprachsuche (Android: Plugin, Browser: Web Speech). */

/* ─── Personen-Seite ─── */
async function openPerson(id) {
  const p = openPage('…'); p.person = id; p.tab = 'passt';
  p.body.innerHTML = skeleton(2);
  try {
    const m = await tmdb(`/person/${id}`, { append_to_response: 'combined_credits' });
    const seen = new Map();
    const credits = [...(m.combined_credits?.cast || []), ...(m.combined_credits?.crew || []).filter(c => ['Director', 'Creator', 'Writer'].includes(c.job))]
      .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
      .map(c => ({ ...slim(c, c.media_type), role: c.character || (c.job === 'Director' ? 'Regie' : c.job === 'Writer' ? 'Drehbuch' : c.job || '') }))
      .filter(c => { if (seen.has(c.key)) return false; seen.set(c.key, 1); return !(c.kind === 'tv' && /talk|show|award|oscar|golden globe/i.test(c.title)) && (c.votes >= 20 || data.films[c.key]); });
    remember(credits);
    const profile = tasteProfile(data.films), table = genreDimTable(data.films);
    p.data = { m, credits: credits.map(c => ({ ...c, ...scoreCandidate(c, profile, table) })) };
    p.title.textContent = m.name;
    renderPerson(p);
  } catch (e) { p.body.innerHTML = errorBox(e.message); }
}
function renderPerson(p) {
  const { m, credits } = p.data;
  const mine = credits.filter(c => data.films[c.key]).sort((a, b) => data.films[b.key].note - data.films[a.key].note);
  const fits = credits.filter(c => !data.films[c.key] && !data.hidden[c.key] && !isBlocked(c)).sort((a, b) => b.match - a.match);
  const all = [...credits].sort((a, b) => (b.year || '').localeCompare(a.year || ''));
  const avg = mine.length ? mine.reduce((a, c) => a + data.films[c.key].note, 0) / mine.length : 0;
  const age = m.birthday ? Math.floor((new Date(m.deathday || Date.now()) - new Date(m.birthday)) / (365.25 * 864e5)) : 0;
  const list = p.tab === 'passt' ? fits : p.tab === 'kenne' ? mine : all;
  p.body.innerHTML = `<div class="person">
    <div class="person-head">${m.profile_path ? `<img class="person-img" src="${poster(m.profile_path, 'w342')}" alt="">` : '<div class="person-img ph">👤</div>'}
      <div><h2>${esc(m.name)}</h2><div class="muted small">${esc({ Acting: 'Schauspiel', Directing: 'Regie', Writing: 'Drehbuch', Production: 'Produktion' }[m.known_for_department] || m.known_for_department || '')}${age ? ` · ${age} Jahre${m.deathday ? ' (†)' : ''}` : ''}${m.place_of_birth ? ' · ' + esc(m.place_of_birth) : ''}</div>
      <div class="stats mini-stats"><div><b>${credits.length}</b><span>Titel</span></div><div><b>${mine.length}</b><span>kennst du</span></div><div><b>${mine.length ? fmtNum(avg.toFixed(1)) : '–'}</b><span>deine Ø</span></div></div></div></div>
    ${m.biography ? `<details class="more"><summary>Über ${esc(m.name.split(' ')[0])}</summary><p class="small">${esc(m.biography.slice(0, 900))}${m.biography.length > 900 ? ' …' : ''}</p></details>` : ''}
    <div class="segtabs">${[['passt', `Passt zu dir (${fits.length})`], ['kenne', `Kennst du (${mine.length})`], ['alle', 'Alle']].map(([k, l]) => `<button class="${p.tab === k ? 'on' : ''}" data-ptab="${k}">${l}</button>`).join('')}</div>
    ${list.length ? list.slice(0, 60).map(c => `<div class="frow card" data-open="${c.key}">${posterImg(c, 'w185')}<div class="frow-main"><div class="ftitle">${esc(c.title)}</div><div class="muted small">${esc(metaLine(c))}${c.role ? ' · ' + esc(c.role) : ''}</div>
      <div class="frow-meta">${data.films[c.key] ? `<span class="note ${noteClass(data.films[c.key].note)}">Du: ${data.films[c.key].note}</span>` : Object.keys(data.films).length >= 3 ? `<span class="match ${c.match >= 75 ? 'hi' : c.match >= 55 ? 'mid' : ''}">${c.match} %</span>` : ''}<span class="tmdb">★ ${fmtNum(c.vote)}</span></div>
      ${p.tab === 'passt' ? `<div class="avail" data-avail="${c.key}"></div>` : ''}</div></div>`).join('') : '<div class="empty">Hier ist nichts.</div>'}
  </div>`;
  fillAvail(p.body);
}

/* ─── Ketten: „Wenn dir das gefällt …“ ─── */
async function openChain(key, trail = []) {
  const start = lookup(key);
  const p = openPage('🔗 Kette'); p.chain = true;
  p.body.innerHTML = skeleton(2);
  try {
    const { kind, id } = parseKey(key);
    const recs = remember((await recommendationsFor(kind, id)).filter(m => !isBlocked(m)));
    const profile = tasteProfile(data.films), table = genreDimTable(data.films);
    const list = recs.map(m => ({ ...m, ...scoreCandidate(m, profile, table) })).sort((a, b) => (!!data.films[a.key]) - (!!data.films[b.key]) || b.match - a.match);
    const path = [...trail, { key, title: start?.title || '' }];
    p.body.innerHTML = `<div class="chain">
      <div class="trail">${path.map((x, i) => `<span class="${i === path.length - 1 ? 'cur' : ''}">${esc(x.title)}</span>`).join('<span class="arrow">→</span>')}</div>
      <p class="small muted">Tippe auf „Weiter“, um von dort aus die nächste Kette zu bilden – so findest du Schritt für Schritt etwas Passendes.</p>
      ${list.length ? list.slice(0, 20).map(c => `<div class="card chain-card"><div class="frow" data-open="${c.key}">${posterImg(c, 'w185')}<div class="frow-main"><div class="ftitle">${esc(c.title)}</div><div class="muted small">${esc(metaLine(c))}</div>
        <div class="frow-meta">${data.films[c.key] ? `<span class="note ${noteClass(data.films[c.key].note)}">Du: ${data.films[c.key].note}</span>` : Object.keys(data.films).length >= 3 ? `<span class="match ${c.match >= 75 ? 'hi' : c.match >= 55 ? 'mid' : ''}">${c.match} %</span>` : ''}<span class="tmdb">★ ${fmtNum(c.vote)}</span></div>
        <div class="avail" data-avail="${c.key}"></div></div></div>
        <button class="btn wide" data-chain="${c.key}" data-trail='${esc(JSON.stringify(path.slice(-5)))}'>Weiter von hier →</button></div>`).join('') : '<div class="empty">Keine Empfehlungen gefunden.</div>'}
    </div>`;
    fillAvail(p.body);
  } catch (e) { p.body.innerHTML = errorBox(e.message); }
}

/* ─── Personen in der Suche ─── */
async function searchPeople(q) {
  try {
    const r = await tmdb('/search/person', { query: q });
    return (r.results || []).filter(x => x.popularity > 2 && x.known_for?.length).slice(0, 3)
      .map(x => ({ id: x.id, name: x.name, photo: x.profile_path || '', dept: x.known_for_department, known: x.known_for.map(k => k.title || k.name).filter(Boolean).slice(0, 3) }));
  } catch (_) { return []; }
}
const personRow = x => `<div class="frow card person-row" data-person="${x.id}">${x.photo ? `<img class="poster" src="${poster(x.photo, 'w185')}" alt="">` : '<div class="poster ph"><span>👤</span></div>'}
  <div class="frow-main"><div class="ftitle">👤 ${esc(x.name)}</div><div class="muted small">${x.dept === 'Directing' ? 'Regie' : 'Schauspiel'} · bekannt aus ${esc(x.known.join(', '))}</div><div class="small acc">Alle Filme & Serien ›</div></div></div>`;

/* ─── Sprachsuche ─── */
const SpeechP = () => window.Capacitor?.Plugins?.SpeechRecognition;
const WebSpeech = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceAvailable = () => !!(SpeechP() || (WebSpeech() && !window.kinoDesktop));
async function voiceSearch(btn) {
  const done = text => {
    btn.classList.remove('rec-on');
    if (!text) return;
    // „Zeig mir was mit Adam Sandler“ → Suche nach „Adam Sandler“; Füllwörter weg
    const q = text.replace(/^(zeig( mir)?|such(e)?|finde?|ich (will|möchte))\s+/i, '').replace(/^(was|etwas|einen?|den|die|das)\s+(film|serie)?\s*(mit|von)?\s*/i, '').replace(/^(film|serie)\s+/i, '').trim() || text;
    searchQ = q; const inp = $('#q'); if (inp) inp.value = q; runSearch();
  };
  btn.classList.add('rec-on'); vib();
  try {
    if (SpeechP()) {
      const P = SpeechP();
      const perm = await P.checkPermissions?.().catch(() => null);
      if (perm && perm.speechRecognition !== 'granted') await P.requestPermissions();
      const r = await P.start({ language: 'de-DE', maxResults: 1, partialResults: false, popup: true });
      return done(r?.matches?.[0] || '');
    }
    const R = new (WebSpeech())(); R.lang = 'de-DE'; R.interimResults = false; R.maxAlternatives = 1;
    R.onresult = e => done(e.results[0][0].transcript);
    R.onerror = e => { done(''); toast(e.error === 'not-allowed' ? 'Mikrofon nicht erlaubt' : 'Spracheingabe nicht verfügbar'); };
    R.onend = () => btn.classList.remove('rec-on');
    R.start();
  } catch (e) { done(''); toast('Spracheingabe nicht verfügbar'); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-person],[data-chain],[data-ptab],[data-voice]'); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  if (t.dataset.person) return openPerson(+t.dataset.person);
  if (t.dataset.chain) { let trail = []; try { trail = JSON.parse(t.dataset.trail || '[]'); } catch (_) { } return openChain(t.dataset.chain, trail); }
  if (t.dataset.ptab) { const p = pages.at(-1); p.tab = t.dataset.ptab; return renderPerson(p); }
  if (t.dataset.voice !== undefined) return voiceSearch(t);
}, true);
