'use strict';
/* ════════════ Kinokompass – Dein Kinojahr ════════════
   Rückblick wie „Wrapped“: je Jahr (nach dem Datum „gesehen“) Anzahl, Stunden, Ø Note, strenger/milder als die Welt,
   Top 5, Lieblingsgenres und -laune, Monate, Geheimtipp, Enttäuschung. Zahlen aus yearStats() (logic.js). */

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
// Werkzeuge in „Meine“: kompaktes Raster statt vieler großer Knöpfe
function mineTools() {
  const t = [['data-ky="open"', '📊', 'Kinojahr'], ['data-cal="open"', '🗓️', 'Kalender'], ['data-game="wall"', '🖼️', 'Wand'], ['data-game="challenge"', '🏆', 'Challenge'],
    ['data-game="quiz"', '🎬', 'Quiz'], ['data-fr="open"', '👥', 'Freunde'], ['data-nf="open"', '📥', 'Import'], ['data-tool="export"', '📤', 'Export'], ['data-tool="dups"', '🧹', 'Doppelte']];
  return `<div class="tools-grid">${t.map(([a, i, l]) => `<button class="tool" ${a}><span>${i}</span>${l}</button>`).join('')}</div>`;
}
function kyYears() {
  const ys = [...new Set(Object.values(data.films).map(f => String(f.seen || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort().reverse();
  const now = String(new Date().getFullYear());
  return ys.includes(now) ? ys : [now, ...ys];
}
function openKinojahr(year) {
  const p = openPage('Dein Kinojahr'); p.ky = true;
  renderKinojahr(p, year || kyYears()[0]);
}
function renderKinojahr(p, year) {
  const st = yearStats(data.films, year), years = kyYears();
  p.year = year;
  const yearTabs = years.length > 1 ? `<div class="chips ky-years">${years.map(y => `<button class="chip ${y === year ? 'on' : ''}" data-ky="year" data-v="${y}">${y}</button>`).join('')}</div>` : '';
  if (!st.count) {
    p.body.innerHTML = `${yearTabs}<div class="empty big">Für ${year} hast du noch nichts bewertet.<br><span class="small">Tipp: Mit dem Netflix-Import bekommen deine Titel das echte Datum, an dem du sie geschaut hast.</span><br><button class="btn primary" data-nf="open">📥 Netflix-Verlauf importieren</button></div>`;
    return;
  }
  const mood = st.mood ? DIMS.find(d => d.key === st.mood) : null;
  const maxM = Math.max(...st.months, 1);
  const milder = st.vsWorld > 0.25 ? `Du bist im Schnitt <b>${fmtNum(st.vsWorld.toFixed(1))} Punkte milder</b> als die Welt.` : st.vsWorld < -0.25 ? `Du bist im Schnitt <b>${fmtNum(Math.abs(st.vsWorld).toFixed(1))} Punkte strenger</b> als die Welt.` : 'Du liegst ziemlich genau beim Weltdurchschnitt.';
  p.body.innerHTML = `${yearTabs}<div class="ky">
    <div class="ky-card ky-hero"><div class="ky-small">Dein Kinojahr</div><div class="ky-year">${year}</div>
      <div class="ky-big">${st.count}</div><div>Titel bewertet · ${st.movies} Film${st.movies === 1 ? '' : 'e'} · ${st.series} Serie${st.series === 1 ? '' : 'n'}</div></div>
    <div class="ky-card"><div class="ky-small">⏱ Vor dem Bildschirm</div><div class="ky-big" id="kyHours">…</div><div id="kyHoursTxt" class="muted small">wird berechnet</div></div>
    <div class="ky-card"><div class="ky-small">⭐ Deine Durchschnittsnote</div><div class="ky-big ${noteClass(st.avg)}">${fmtNum(st.avg.toFixed(1))}</div><div>${milder}</div></div>
    <div class="ky-card"><div class="ky-small">🏆 Deine Top ${Math.min(5, st.top.length)}</div>
      <div class="ky-top">${st.top.map((f, i) => `<div class="ky-t" data-open="${f.key}"><span class="ky-rank">${i + 1}</span>${posterImg(f, 'w185')}<span class="note ${noteClass(f.note)} corner">${f.note}</span><div class="mp-t">${esc(f.title)}</div></div>`).join('')}</div></div>
    ${st.genres.length || mood ? `<div class="ky-card"><div class="ky-small">🎭 Dein Geschmack</div>
      ${st.genres.length ? `<div class="ky-genres">${st.genres.map((g, i) => `<div><span class="ky-gn">${i + 1}.</span> ${esc(GENRES[g.g] || '?')} <span class="muted small">${g.n}×</span></div>`).join('')}</div>` : ''}
      ${mood ? `<p>Dein Jahr war vor allem: <b>${mood.icon} ${esc(mood.label)}</b></p>` : ''}</div>` : ''}
    <div class="ky-card"><div class="ky-small">📅 Übers Jahr</div>
      <div class="ky-months">${st.months.map((n, i) => `<div class="ky-m"><div class="ky-bar ${i === st.bestMonth ? 'best' : ''}" style="height:${Math.round(n / maxM * 100)}%">${n ? `<span>${n}</span>` : ''}</div><div class="ky-ml">${MONTHS[i][0]}</div></div>`).join('')}</div>
      <p>Dein stärkster Monat: <b>${MONTHS[st.bestMonth]}</b> mit ${st.months[st.bestMonth]} Titel${st.months[st.bestMonth] === 1 ? '' : 'n'}.</p></div>
    ${st.hidden ? `<div class="ky-card ky-row" data-open="${st.hidden.key}">${posterImg(st.hidden, 'w185')}<div><div class="ky-small">💎 Dein Geheimtipp</div><b>${esc(st.hidden.title)}</b><p class="small">Kaum jemand kennt ${st.hidden.kind === 'tv' ? 'sie' : 'ihn'} (${fmtVotes(st.hidden.votes)} Stimmen) – du gibst eine ${st.hidden.note}.</p></div></div>` : ''}
    ${st.flop && st.flop.note <= 5 && st.count > 2 ? `<div class="ky-card ky-row" data-open="${st.flop.key}">${posterImg(st.flop, 'w185')}<div><div class="ky-small">😖 Größte Enttäuschung</div><b>${esc(st.flop.title)}</b><p class="small">Nur ${st.flop.note} von 10${st.flop.vote ? ` – die Welt gibt ${fmtNum(st.flop.vote)}` : ''}.</p></div></div>` : ''}
    <button class="btn wide" data-ky="share">📤 Rückblick teilen</button>
  </div>`;
  kyHours(p, year);
}
// Stunden: Filme über die Laufzeit aus den Details, Serien über die Netflix-Folgenzahl bzw. den Fortschritt
async function kyHours(p, year) {
  const list = Object.values(data.films).filter(f => String(f.seen || '').startsWith(year));
  let min = 0, eps = 0;
  await pool(list, 4, async f => {
    try {
      const d = await details(f.kind || 'movie', f.id);
      if (f.kind === 'tv') { const n = f.nfEpisodes || 0; eps += n; min += n * (d.runtime || 40); }
      else min += d.runtime || 0;
    } catch (_) { }
  });
  if (!pages.includes(p) || p.year !== year) return;
  const h = Math.round(min / 60);
  $('#kyHours', p.body).textContent = `${h} h`;
  $('#kyHoursTxt', p.body).textContent = `${h >= 24 ? `Das sind ${fmtNum((h / 24).toFixed(1))} Tage am Stück. ` : ''}${eps ? `Filme und ${eps} Serienfolgen aus dem Netflix-Verlauf` : 'Laufzeit deiner Filme'}${list.some(f => f.kind === 'tv' && !f.nfEpisodes) ? ' (Serien ohne Folgenzahl nicht mitgerechnet)' : ''}.`;
  p.kyHours = h;
}
function kyShare(p) {
  const st = yearStats(data.films, p.year);
  const text = `Mein Kinojahr ${p.year} 🎬\n${st.count} Titel bewertet${p.kyHours ? `, ca. ${p.kyHours} Stunden` : ''}\nØ Note ${fmtNum(st.avg.toFixed(1))}\nTop: ${st.top.slice(0, 3).map(f => `${f.title} (${f.note})`).join(', ')}\n– Kinokompass`;
  if (navigator.share) navigator.share({ text }).catch(() => { });
  else copyText(text, 'Rückblick');
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ky]'); if (!t) return;
  const p = pages.at(-1);
  switch (t.dataset.ky) {
    case 'open': return openKinojahr();
    case 'year': return renderKinojahr(p, t.dataset.v);
    case 'share': return kyShare(p);
  }
});
