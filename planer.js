'use strict';
/* ════════════ Kinokompass – Zeit planen ════════════
   Schlafenszeit-Rechner („Wenn du jetzt startest, bist du um 23:47 fertig“), Option „vor dem Schlafengehen fertig“
   in „Was schauen wir heute?“, Folgen-Planer für Serien (Folgen pro Tag ↔ fertig am …). Schlafenszeit: settings.bedtime. */

const bedtime = () => settings.bedtime || '23:30';
const hhmm = d => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
// Minuten bis zur Schlafenszeit; negativ = schon drüber (z. B. nachts um 3 bei 23:30). Ab 6 Uhr zählt die nächste Nacht.
function minutesToBed() {
  const [h, m] = bedtime().split(':').map(Number), now = new Date(), bed = new Date(now);
  bed.setHours(h, m, 0, 0);
  if (now.getHours() < 6 && h >= 12) bed.setDate(bed.getDate() - 1); // nach Mitternacht: gestrige Schlafenszeit
  return Math.round((bed - now) / 60e3);
}
// Zeile in den Details
function sleepLine(d) {
  const len = d.runtime;
  if (!len) return '';
  const end = new Date(Date.now() + len * 60e3), left = minutesToBed();
  const ok = left >= len;
  const fmtMin = n => n >= 90 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} Min.`;
  const note = left <= 0 ? ` – eigentlich ist schon Schlafenszeit (${bedtime()}) 😴` : ok ? ` – ${fmtMin(left - len)} vor deiner Schlafenszeit (${bedtime()})` : ` – ${fmtMin(len - left)} nach deiner Schlafenszeit 😴`;
  return `<div class="sleep ${ok ? 'ok' : 'late'}">⏰ ${d.kind === 'tv' ? 'Eine Folge jetzt' : 'Wenn du jetzt startest'}: fertig um <b>${hhmm(end)}</b>${note}</div>`;
}

/* ─── Folgen-Planer (in den Serien-Details unter dem Fortschritt) ─── */
function planerBlock(d) {
  const pr = data.progress[d.key];
  const seasons = d.seasonList.filter(x => x.n > 0 && x.eps > 0);
  const aired = d.aired || { s: seasons.at(-1)?.n || 1, e: seasons.at(-1)?.eps || 0 };
  const left = episodesLeft(pr || { s: seasons[0]?.n || 1, e: 0 }, seasons, aired);
  if (!left) return '';
  const per = +(settings.epsPerDay || 2), days = Math.ceil(left / per);
  const end = new Date(); end.setDate(end.getDate() + days - 1);
  const hours = Math.round(left * (d.runtime || 45) / 60);
  return `<div class="planer"><div class="prog-h">📅 Folgen-Planer</div>
    <div class="small">Noch <b>${left} Folge${left > 1 ? 'n' : ''}</b> (≈ ${hours} h). Bei</div>
    <div class="segtabs per">${[1, 2, 3, 4, 6].map(n => `<button class="${per === n ? 'on' : ''}" data-plan="${n}">${n}/Tag</button>`).join('')}</div>
    <div class="small">bist du am <b>${end.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</b> durch${days > 1 ? ` (${days} Tage)` : ' – also heute noch'}.${d.nextAir?.date ? ` Nächste neue Folge: ${new Date(d.nextAir.date + 'T12:00').toLocaleDateString('de-DE')}.` : ''}</div></div>`;
}

/* ─── Einstellungen ─── */
function planerSettingsCard() {
  return `<div class="card"><h3 class="sec">⏰ Schlafenszeit</h3>
    <p class="small muted">Für „fertig um …“ in den Details und „vor dem Schlafengehen fertig“ in „Was schauen wir heute?“.</p>
    <input type="time" class="input" id="bedIn" value="${bedtime()}" style="max-width:160px"></div>`;
}
document.addEventListener('change', e => {
  if (e.target.id === 'bedIn') { settings.bedtime = e.target.value || '23:30'; saveSettings(); toast('Schlafenszeit: ' + settings.bedtime); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-plan]'); if (!t) return;
  settings.epsPerDay = +t.dataset.plan; saveSettings(); vib();
  const p = pages.at(-1); if (p?.item) renderDetail(p);
});
