'use strict';
/* ════════════ Kinokompass – Kalender „Was kommt?“ ════════════
   Termine der nächsten 120 Tage, nach Datum gruppiert:
   - neue Folgen deiner Serien (Fortschritt, Merkliste, gut bewertete Serien) – aus next_episode_to_air
   - Kino- und Digitalstart von Filmen auf deiner Merkliste (deutsche Termine)
   - „Demnächst im Kino – passt zu dir“ (kommende Kinofilme DE mit ≥ 65 % Passung)
   „📅 Eintragen“: am Handy über Google Kalender, am Mac/im Browser als .ics-Datei (Apple Kalender, Outlook …). */

let calState = { sig: '', events: null, loading: null };
const isoDay = (d = new Date()) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDay(d); };

async function loadCalendar() {
  const today = isoDay(), until = addDays(today, 120), ev = [];
  const push = (date, item, label, why, type) => { if (date && date >= today && date <= until) ev.push({ date, key: item.key, title: item.title, poster: item.poster, kind: item.kind, label, why, type }); };
  // Serien: im Fortschritt, gemerkt oder mit ≥ 7 bewertet
  const series = new Map();
  Object.values(data.progress).forEach(p => series.set(p.key, 'du schaust sie gerade'));
  Object.values(data.watch).filter(w => w.kind === 'tv').forEach(w => { if (!series.has(w.key)) series.set(w.key, 'auf deiner Merkliste'); });
  Object.values(data.films).filter(f => f.kind === 'tv' && f.note >= 7).forEach(f => { if (!series.has(f.key)) series.set(f.key, `du gibst ihr ${f.note}/10`); });
  await pool([...series.keys()], 4, async key => {
    try {
      const d = await details('tv', parseKey(key).id);
      if (d.nextAir?.date) push(d.nextAir.date, d, d.nextAir.e === 1 ? `Neue Staffel ${d.nextAir.s} startet` : `Neue Folge · Staffel ${d.nextAir.s}, Folge ${d.nextAir.e}`, series.get(key), 'tv');
    } catch (_) { }
  });
  // Filme auf der Merkliste: Kino- und Digitalstart in Deutschland
  await pool(Object.values(data.watch).filter(w => w.kind !== 'tv'), 4, async w => {
    try {
      const d = await details('movie', w.id);
      const first = types => d.releasesDE.filter(r => types.includes(r.type)).map(r => r.date).sort()[0];
      push(first([2, 3]), d, '🎬 Kinostart', 'auf deiner Merkliste', 'kino');
      push(first([4]), d, '📺 Digital (Streaming/Kauf)', 'auf deiner Merkliste', 'digital');
    } catch (_) { }
  });
  // Demnächst im Kino, das zu dir passt
  try {
    const profile = tasteProfile(data.films), table = genreDimTable(data.films);
    const up = remember((await upcomingDE()).filter(m => !isBlocked(m) && !data.films[m.key] && !data.hidden[m.key] && !data.watch[m.key]));
    for (const m of up) {
      const sc = scoreCandidate(m, profile, table);
      if (Object.keys(data.films).length >= 3 && sc.match < 65) continue;
      push(m.date, m, '🎬 Kinostart', Object.keys(data.films).length >= 3 ? `passt zu dir: ${sc.match} %` : 'demnächst im Kino', 'tipp');
    }
  } catch (_) { }
  const seen = new Set();
  return ev.filter(e => { const k = e.key + e.date + e.type; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'tipp') - (b.type === 'tipp'));
}
function ensureCalendar() {
  const sig = dataSig() + isoDay();
  if (calState.sig === sig && (calState.events || calState.loading)) return calState.loading || Promise.resolve(calState.events);
  calState = { sig, events: null, loading: null };
  calState.loading = loadCalendar().then(e => { if (calState.sig === sig) { calState.events = e; calState.loading = null; } return e; });
  return calState.loading;
}
const dayLabel = iso => { const t = isoDay(); return iso === t ? 'Heute' : iso === addDays(t, 1) ? 'Morgen' : new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); };

function openCalendar() {
  const p = openPage('🗓️ Kalender'); p.cal = true;
  p.body.innerHTML = `<div class="loading-note">Sammle Termine deiner Serien, deiner Merkliste und kommender Kinofilme …</div>${skeleton(2)}`;
  ensureCalendar().then(() => { if (pages.includes(p)) renderCalendar(p); });
}
function renderCalendar(p) {
  const ev = calState.events || [];
  const filt = p.filter || 'alle';
  const list = ev.filter(e => filt === 'alle' || (filt === 'mine' ? e.type !== 'tipp' : e.type === 'tipp'));
  const groups = [];
  for (const e of list) { const g = groups.at(-1); if (g && g.date === e.date) g.items.push(e); else groups.push({ date: e.date, items: [e] }); }
  p.body.innerHTML = `<div class="segtabs">${[['alle', 'Alles'], ['mine', 'Meine Serien & Merkliste'], ['tipp', 'Kino-Tipps']].map(([k, l]) => `<button class="${filt === k ? 'on' : ''}" data-cal="filter" data-v="${k}">${l}</button>`).join('')}</div>
    ${groups.length ? groups.map(g => `<div class="cal-day"><div class="cal-date">${esc(dayLabel(g.date))}</div>
      ${g.items.map(e => `<div class="cal-ev card" data-open="${e.key}">${posterImg(e, 'w92')}
        <div class="cal-main"><b>${esc(e.title)}</b><span class="small">${esc(e.label)}</span><span class="small muted">${esc(e.why)}</span></div>
        <button class="mini" data-cal="add" data-key="${e.key}" data-date="${e.date}" data-label="${esc(e.label)}" aria-label="In den Kalender eintragen">📅</button></div>`).join('')}</div>`).join('')
      : `<div class="empty">Keine Termine in den nächsten 4 Monaten.<br><span class="small">Hier erscheinen neue Folgen deiner Serien, Starts von Filmen auf deiner Merkliste und Kino-Tipps, die zu dir passen.</span></div>`}
    <p class="small muted center">Neue Folgen deiner Serien meldet die App auch als Benachrichtigung (🔔).</p>`;
}
// Termin in den eigenen Kalender übernehmen
function addToCalendar(title, label, date) {
  const d = date.replace(/-/g, ''), d2 = addDays(date, 1).replace(/-/g, '');
  const text = `${title} – ${label}`;
  if (isNative()) {
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(text)}&dates=${d}/${d2}&details=${encodeURIComponent('Aus Kinokompass')}`;
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click(); return;
  }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kinokompass//DE', 'BEGIN:VEVENT', `UID:${d}-${Math.random().toString(36).slice(2)}@kinokompass`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${text.replace(/[,;]/g, ' ')}`, 'DESCRIPTION:Aus Kinokompass', 'BEGIN:VALARM', 'TRIGGER:-PT6H', 'ACTION:DISPLAY', `DESCRIPTION:${text.replace(/[,;]/g, ' ')}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `${title.replace(/[^\wäöüÄÖÜß -]+/g, '')}.ics`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('Kalender-Datei gespeichert – öffnen, um den Termin einzutragen');
}
// Startseite: Hinweis auf Termine der nächsten 7 Tage
function calendarCard() {
  ensureCalendar().then(() => { const el = $('#calCard'); if (el && !el.dataset.filled) { el.dataset.filled = '1'; el.innerHTML = calendarCardInner(); } });
  return `<div id="calCard">${calState.events ? calendarCardInner() : ''}</div>`;
}
function calendarCardInner() {
  const week = addDays(isoDay(), 7), soon = (calState.events || []).filter(e => e.date <= week && e.type !== 'tipp');
  if (!soon.length) return '';
  const eps = soon.filter(e => e.type === 'tv').length, mov = soon.length - eps;
  return `<button class="cal-card" data-cal="open"><span class="today-dice">🗓️</span><span><b>Diese Woche</b><span class="small">${[eps ? `${eps} neue Folge${eps > 1 ? 'n' : ''}/Staffel${eps > 1 ? 'n' : ''}` : '', mov ? `${mov} Filmstart${mov > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}: ${esc(soon.slice(0, 2).map(e => e.title).join(', '))}${soon.length > 2 ? ' …' : ''}</span></span></button>`;
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-cal]'); if (!t) return;
  e.stopPropagation();
  const p = pages.at(-1);
  switch (t.dataset.cal) {
    case 'open': return openCalendar();
    case 'filter': p.filter = t.dataset.v; return renderCalendar(p);
    case 'add': { const it = lookup(t.dataset.key) || {}; return addToCalendar(it.title || '', t.dataset.label, t.dataset.date); }
  }
}, true);
