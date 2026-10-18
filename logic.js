'use strict';
/* ════════════ Kinokompass – Logik ohne Oberfläche ════════════
   Geschmacksprofil, Vorschlags-Punkte, Listen und das Zusammenführen zweier Stände (Sync).
   Filme und Serien teilen sich alles; Schlüssel = „m123“ (Film) bzw. „t456“ (Serie), weil TMDB-IDs
   zwischen Filmen und Serien doppelt vorkommen.
   Läuft im Browser und in Node (scripts/logik-testen.mjs) – deshalb kein DOM hier. */

// Die Fragen der Kurz-Abfrage nach dem Bewerten. Werte 0 (gar nicht) bis 4 (sehr).
const DIMS = [
  { key: 'lustig', label: 'Lustig', icon: '😂', q: 'Wie lustig?' },
  { key: 'action', label: 'Actionreich', icon: '💥', q: 'Wie viel Action?' },
  { key: 'spannung', label: 'Spannend', icon: '😰', q: 'Wie spannend?' },
  { key: 'gefuehl', label: 'Emotional', icon: '😢', q: 'Wie sehr hat es dich berührt?' },
  { key: 'tiefe', label: 'Tiefgründig', icon: '🧠', q: 'Wie anspruchsvoll / zum Nachdenken?' },
  { key: 'dumm', label: 'Hirn aus', icon: '🍿', q: 'Wie dumm / trashig?' },
  { key: 'grusel', label: 'Gruselig', icon: '👻', q: 'Wie gruselig?' },
  { key: 'romantik', label: 'Romantisch', icon: '❤️', q: 'Wie romantisch?' },
  { key: 'optik', label: 'Bildgewaltig', icon: '✨', q: 'Wie stark waren Bilder & Effekte?' }
];
const DIM_KEYS = DIMS.map(d => d.key);
// „Würdest du ihn nochmal schauen?“ – eigene Liste „Nochmal schauen“
const REWATCH = [{ key: 'ja', icon: '🔁', label: 'Ja, gern' }, { key: 'vielleicht', icon: '🤔', label: 'Vielleicht' }, { key: 'nein', icon: '🙅', label: 'Nein' }];
const LEVELS = ['gar nicht', 'kaum', 'etwas', 'ziemlich', 'sehr'];

// Wie hat er dir gefallen? (Bauchgefühl zusätzlich zur Note)
const FEELINGS = [
  { key: 'wow', icon: '🤩', label: 'Genial' },
  { key: 'gut', icon: '😊', label: 'Gut' },
  { key: 'ok', icon: '🙂', label: 'Okay' },
  { key: 'meh', icon: '😕', label: 'Naja' },
  { key: 'schlecht', icon: '😖', label: 'Mies' }
];

// TMDB-Genres (IDs sind fest) mit deutschem Namen
const GENRES = {
  28: 'Action', 12: 'Abenteuer', 16: 'Animation', 35: 'Komödie', 80: 'Krimi', 99: 'Dokumentarfilm',
  18: 'Drama', 10751: 'Familie', 14: 'Fantasy', 36: 'Historie', 27: 'Horror', 10402: 'Musik',
  9648: 'Mystery', 10749: 'Liebesfilm', 878: 'Science-Fiction', 10770: 'TV-Film', 53: 'Thriller',
  10752: 'Krieg', 37: 'Western',
  // nur bei Serien
  10762: 'Kinder', 10763: 'Nachrichten', 10764: 'Reality-TV', 10766: 'Seifenoper', 10767: 'Talkshow'
};
// Serien-Genres, die bei TMDB zusammengefasst sind, auf die Film-Genres abbilden – so gilt ein Profil für beides
const TV_GENRE_MAP = { 10759: [28, 12], 10765: [878, 14], 10768: [10752, 36] };
const normGenres = ids => [...new Set((ids || []).flatMap(g => TV_GENRE_MAP[g] || [g]))];
// Umgekehrt für die Serien-Suche (discover/tv kennt nur die Serien-IDs); Genres ohne Serien-Gegenstück fallen weg
const TV_GENRE_OF = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768, 36: 10768, 16: 16, 35: 35, 80: 80, 99: 99, 18: 18, 10751: 10751, 9648: 9648, 37: 37 };
const keyOf = (kind, id) => (kind === 'tv' ? 't' : 'm') + id;
const KIND_LABEL = { movie: 'Film', tv: 'Serie' };

// Grobe Vorannahme: welches Genre bringt wie viel von welcher Eigenschaft (0–4).
// Wird durch die eigenen Antworten ersetzt, sobald genug Filme des Genres bewertet sind.
const GENRE_PRIOR = {
  28: { action: 4, spannung: 3, optik: 3, dumm: 2 },
  12: { action: 3, spannung: 2, optik: 3, lustig: 1 },
  16: { lustig: 3, gefuehl: 2, optik: 3 },
  35: { lustig: 4, dumm: 2, romantik: 1 },
  80: { spannung: 3, action: 2, tiefe: 2 },
  99: { tiefe: 4 },
  18: { gefuehl: 3, tiefe: 3 },
  10751: { lustig: 2, gefuehl: 2 },
  14: { optik: 4, action: 2, spannung: 2 },
  36: { tiefe: 3, gefuehl: 2 },
  27: { grusel: 4, spannung: 3, dumm: 1 },
  10402: { gefuehl: 3, romantik: 1 },
  9648: { spannung: 3, tiefe: 2, grusel: 1 },
  10749: { romantik: 4, gefuehl: 3 },
  878: { optik: 4, action: 2, tiefe: 2, spannung: 2 },
  10770: { dumm: 1 },
  53: { spannung: 4, action: 2 },
  10752: { action: 3, gefuehl: 3, tiefe: 2 },
  37: { action: 2, spannung: 2 },
  10762: { lustig: 2 },
  10764: { dumm: 3, lustig: 1 },
  10766: { romantik: 3, gefuehl: 2, dumm: 2 },
  10767: { lustig: 2 }
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round1 = v => Math.round(v * 10) / 10;

/* ─── Eigenschaften eines Films schätzen ───
   Aus den Genres, gewichtet mit dem, was der Nutzer bei diesen Genres selbst angegeben hat. */
function genreDimTable(films) {
  // Mittelwert der eigenen Antworten je Genre und Eigenschaft
  const sum = {}, cnt = {};
  for (const f of Object.values(films || {})) {
    if (!f.dims) continue;
    for (const g of f.genres || []) {
      sum[g] = sum[g] || {}; cnt[g] = (cnt[g] || 0) + 1;
      for (const k of DIM_KEYS) sum[g][k] = (sum[g][k] || 0) + (f.dims[k] || 0);
    }
  }
  const table = {};
  for (const g of new Set([...Object.keys(GENRE_PRIOR), ...Object.keys(sum)])) {
    const prior = GENRE_PRIOR[g] || {}, n = cnt[g] || 0, w = n / (n + 2); // ab 2 Filmen zählt die eigene Sicht zur Hälfte
    table[g] = {};
    for (const k of DIM_KEYS) table[g][k] = (1 - w) * (prior[k] || 0) + w * (n ? sum[g][k] / n : 0);
  }
  return table;
}
function estimateDims(genres, table) {
  const out = {}; const gs = (genres || []).filter(g => table[g]);
  for (const k of DIM_KEYS) {
    if (!gs.length) { out[k] = 0; continue; }
    // Maximum statt Mittelwert: eine Action-Komödie ist lustig UND actionreich
    const vals = gs.map(g => table[g][k]).sort((a, b) => b - a);
    out[k] = round1(vals[0] * 0.75 + (vals[1] ?? vals[0]) * 0.25);
  }
  return out;
}
// Vorschlag für die Kurz-Abfrage, damit man meist nur noch korrigieren muss
function suggestDims(genres, films) { const e = estimateDims(genres, genreDimTable(films)); const o = {}; for (const k of DIM_KEYS) o[k] = clamp(Math.round(e[k]), 0, 4); return o; }

/* ─── Geschmacksprofil ───
   genre: wie sehr ein Genre die Note hebt/senkt (−1…+1)
   dim:   wie sehr eine Eigenschaft gefällt (−1…+1), aus dem Zusammenhang Eigenschaft ↔ Note
   avg:   eigene Durchschnittsnote */
/* ─── Neuere Bewertungen zählen mehr ───
   Gewicht halbiert sich alle 2 Jahre (nach dem Datum „gesehen“, sonst Bewertungszeit), aber nie unter 0,25 –
   damit der Netflix-Verlauf von 2018 nicht genauso zählt wie letzte Woche. */
function recencyWeight(f, now = Date.now()) {
  const t = f.seen ? Date.parse(f.seen + 'T12:00:00') : (f.ts || now);
  const years = Math.max(0, (now - (isNaN(t) ? now : t)) / (365.25 * 864e5));
  return Math.max(0.25, Math.pow(0.5, years / 2));
}
function tasteProfile(films, now = Date.now()) {
  const list = Object.values(films || {}).filter(f => f.note);
  const ws = list.map(f => recencyWeight(f, now)), wSum = ws.reduce((a, b) => a + b, 0);
  const avg = list.length ? list.reduce((s, f, i) => s + f.note * ws[i], 0) / wSum : 6.5;
  const gSum = {}, gW = {}, gCnt = {};
  list.forEach((f, i) => { for (const g of f.genres || []) { gSum[g] = (gSum[g] || 0) + ws[i] * (f.note - avg); gW[g] = (gW[g] || 0) + ws[i]; gCnt[g] = (gCnt[g] || 0) + 1; } });
  const genre = {};
  for (const g in gSum) genre[g] = clamp(gSum[g] / (gW[g] + 1) / 2.5, -1, 1); // +1 im Nenner dämpft Einzelfilme
  const dim = {};
  const withDims = list.map((f, i) => [f, ws[i]]).filter(([f]) => f.dims);
  for (const k of DIM_KEYS) {
    if (withDims.length < 2) { dim[k] = 0; continue; }
    // gewichtete Abweichung: Filme mit viel von k, die über dem Schnitt liegen → positiv
    let num = 0, den = 0;
    for (const [f, w] of withDims) { const v = f.dims[k] || 0; num += w * v * (f.note - avg); den += w * v; }
    dim[k] = den ? clamp(num / (den + 2) / 2, -1, 1) : 0;
  }
  return { genre, dim, avg, count: list.length, genreCount: gCnt };
}

/* ─── Punkte für einen Kandidaten (0–100 „passt zu dir“) ───
   cand: { id, genres, vote, votes, popularity, sources:[{id,title,note}] } */
function scoreCandidate(cand, profile, table) {
  const reasons = [];
  let s = 0;
  // 1. Genres, die dir gefallen
  const gs = cand.genres || [];
  if (gs.length) {
    const gv = gs.map(g => profile.genre[g] || 0);
    const gScore = gv.reduce((a, b) => a + b, 0) / Math.sqrt(gs.length);
    s += gScore * 1.6;
    const best = gs.filter(g => (profile.genre[g] || 0) > 0.15).sort((a, b) => profile.genre[b] - profile.genre[a])[0];
    if (best) reasons.push(`du magst ${GENRES[best] || 'das Genre'}`);
  }
  // 2. Eigenschaften, die dir gefallen (geschätzt aus den Genres)
  const est = estimateDims(gs, table);
  let dScore = 0, topDim = null, topVal = 0;
  for (const k of DIM_KEYS) { const c = (est[k] / 4) * (profile.dim[k] || 0); dScore += c; if (c > topVal) { topVal = c; topDim = k; } }
  s += dScore * 1.4;
  if (topDim && topVal > 0.12) reasons.push(`${DIMS.find(d => d.key === topDim).label.toLowerCase()} – das magst du`);
  // 3. Empfohlen auf Basis von Filmen, die du gut fandest
  const src = (cand.sources || []).filter(x => x.note >= 7).sort((a, b) => b.note - a.note);
  if (src.length) { s += Math.min(1.2, src.reduce((a, x) => a + (x.note - 6) * 0.18, 0)); reasons.unshift(`weil du „${src[0].title}“ mit ${src[0].note} bewertet hast`); }
  const bad = (cand.sources || []).filter(x => x.note && x.note <= 4).length;
  s -= bad * 0.4;
  // 4. Allgemeine Qualität: TMDB-Schnitt, abgesichert durch die Zahl der Stimmen
  const votes = cand.votes || 0, vote = cand.vote || 0;
  const q = (votes * vote + 300 * 6.3) / (votes + 300); // Bayes-Mittel: wenige Stimmen → Richtung 6,3
  s += (q - 6.3) * 0.9;
  if (q >= 7.6) reasons.push('allgemein sehr gut bewertet');
  const match = Math.round(clamp(50 + 48 * Math.tanh(s / 3.5), 1, 99)); // weich begrenzt: Spitzenwerte bleiben unterscheidbar
  return { match, reasons: reasons.slice(0, 2), est };
}

/* ─── Listen nach Unterkategorien ───
   Eigene Filme: Kategorie gilt ab Wert 3 („ziemlich“). Sortiert nach Note. */
function categoryLists(films) {
  const list = Object.values(films || {}).filter(f => f.note);
  const out = [];
  for (const d of DIMS) {
    const items = list.filter(f => (f.dims?.[d.key] || 0) >= 3).sort((a, b) => b.note - a.note || (b.dims[d.key] - a.dims[d.key]));
    if (items.length) out.push({ ...d, items });
  }
  return out;
}
/* ─── Eine Hauptkategorie je Titel (für „Meine → Listen“, damit nichts 20× auftaucht) ───
   Stärkste Eigenschaft der eigenen Kurz-Abfrage (ab „etwas“), sonst aus den Genres geschätzt (ab 2,6). */
function primaryCategory(f, table) {
  const src = f.dims || (table ? estimateDims(f.genres, table) : null); if (!src) return null;
  const min = f.dims ? 2 : 2.6;
  let best = null, bv = 0;
  for (const k of DIM_KEYS) { const v = src[k] || 0; if (v >= min && v > bv) { bv = v; best = k; } }
  return best;
}
function uniqueCategoryLists(films) {
  const list = Object.values(films || {}).filter(f => f.note), table = genreDimTable(films);
  const groups = {};
  for (const f of list) { const k = primaryCategory(f, table) || 'sonst'; (groups[k] = groups[k] || []).push(f); }
  const out = DIMS.filter(d => groups[d.key]).map(d => ({ ...d, items: groups[d.key].sort((a, b) => b.note - a.note) }));
  if (groups.sonst) out.push({ key: 'sonst', label: 'Ohne Kategorie', icon: '📁', items: groups.sonst.sort((a, b) => b.note - a.note) });
  return out.sort((a, b) => b.items.length - a.items.length);
}

/* ─── Doppelte Einträge erkennen (z. B. Kinofassung + Extended Cut) ─── */
const dupNorm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .replace(/\b(extended|director'?s|cut|kinofassung|uncut|special|edition|remastered|ultimate|theatrical|version|4k|imax|the movie|der film)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();
function findDuplicates(films) {
  const groups = {};
  for (const f of Object.values(films || {})) { const k = (f.kind || 'movie') + '|' + dupNorm(f.title); if (dupNorm(f.title)) (groups[k] = groups[k] || []).push(f); }
  return Object.values(groups).filter(g => g.length > 1 && g.every(f => !f.year || !g[0].year || Math.abs(+f.year - +g[0].year) <= 1));
}
// Passt ein Vorschlag in eine Kategorie? (geschätzter Wert ab 2,6)
const fitsDim = (est, key) => (est?.[key] || 0) >= 2.6;

/* ─── Serien-Fortschritt ───
   p = { s, e } = zuletzt gesehene Folge (e = 0: Staffel noch nicht angefangen).
   seasons = [{ n, eps }] (Staffel 0 = Specials wird ignoriert), aired = { s, e } = zuletzt ausgestrahlte Folge. */
function advanceEpisode(p, seasons) {
  const list = (seasons || []).filter(x => x.n > 0 && x.eps > 0).sort((a, b) => a.n - b.n);
  const cur = list.find(x => x.n === p.s);
  if (cur && p.e < cur.eps) return { s: p.s, e: p.e + 1 };
  const next = list.find(x => x.n > p.s);
  return next ? { s: next.n, e: 1 } : { s: p.s, e: p.e };
}
// Wie viele schon ausgestrahlte Folgen sind noch offen?
function episodesLeft(p, seasons, aired) {
  if (!aired?.s) return 0;
  let left = 0;
  for (const x of (seasons || []).filter(x => x.n > 0)) {
    const airedHere = x.n < aired.s ? x.eps : x.n === aired.s ? aired.e : 0;
    const seenHere = x.n < p.s ? x.eps : x.n === p.s ? p.e : 0;
    left += Math.max(0, airedHere - seenHere);
  }
  return left;
}

/* ─── Netflix-Verlauf ───
   Zwei Dateiformate: „NetflixViewingHistory.csv“ (Profil → Wiedergabeaktivität → Alle herunterladen; Spalten
   Title, Date – enthält nur DIESES Profil) und „ViewingActivity.csv“ aus dem großen Datenexport (alle Profile,
   Spalte „Profile Name“ – dann wird nur das gewählte Profil genommen; Trailer/Vorschauen fallen raus). */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
// Datum in ISO (JJJJ-MM-TT): „17.10.26“, „17.10.2026“, „10/17/26“, „2026-10-17 21:13:45“
function nfDate(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  const y = v => (v.length === 2 ? '20' + v : v);
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/))) return `${y(m[3])}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) return `${y(m[3])}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}
function parseNetflix(text) {
  const rows = parseCsv(text); if (!rows.length) return { profiles: [], rows: [], format: '' };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = n => head.indexOf(n);
  if (col('profile name') >= 0) { // großer Datenexport
    const iP = col('profile name'), iT = col('title'), iS = col('start time'), iD = col('duration'), iX = col('supplemental video type');
    const dur = v => { const p = String(v || '').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : 0; };
    const out = rows.slice(1).filter(r => r[iT] && !(iX >= 0 && r[iX]) && (iD < 0 || dur(r[iD]) >= 300))
      .map(r => ({ title: r[iT].trim(), date: nfDate(r[iS]), profile: r[iP].trim() }));
    return { profiles: [...new Set(out.map(r => r.profile))], rows: out, format: 'export' };
  }
  const iT = col('title'), iD = col('date');
  if (iT < 0) return { profiles: [], rows: [], format: '' };
  return { profiles: [], rows: rows.slice(1).filter(r => r[iT]).map(r => ({ title: r[iT].trim(), date: nfDate(r[iD]), profile: '' })), format: 'profil' };
}
// Folgen zu Serien zusammenfassen: „Dark: Staffel 1: Geheimnisse“ → Serie „Dark“, Staffel 1
const NF_SEASON = /^(.+?):\s*(?:(?:Staffel|Season|Teil|Part|Volume|Vol\.|Buch|Book|Kapitel|Chapter)\s*(\d+)|(?:Miniserie|Mini-Serie|Limited Series|Limitierte Serie))\s*(?::|$)/i;
// Nachgestellte Teile wie „Season 2“, „The Twelfth Year“, „Halloween Special“ gehören nicht zum Seriennamen
const NF_SEASONISH = /^(?:(?:Staffel|Season|Teil|Part|Volume|Vol\.|Series|Buch|Book|Kapitel|Chapter|Collection)\b.*|.*\b(?:Year|Specials?)|.*\b(?:Staffel|Season)\s*\d+.*|Miniserie|Mini-Serie|Limited Series|Limitierte Serie)$/i;
const NF_EPISODE = /^(?:Episode|Folge|Ep\.?|Chapter|Kapitel)\s*\d+/i;
function nfSeriesOf(title, prefixCount) {
  const m = title.match(NF_SEASON);
  if (m) return { name: m[1].trim(), season: m[2] ? +m[2] : 1 };
  const segs = title.split(': ');
  if (segs.length < 2) return null;
  const seasonOf = list => { for (const x of list) { const n = x.match(/(?:Staffel|Season|Teil|Part|Volume)\s*(\d+)/i); if (n) return +n[1]; } return 1; };
  if (segs.length >= 3 || NF_EPISODE.test(segs.at(-1)) || prefixCount.get(segs[0]) >= 2) {
    let head = segs.length >= 3 ? segs.slice(0, -1) : segs.slice(0, 1);
    const season = seasonOf(head);
    while (head.length > 1 && NF_SEASONISH.test(head.at(-1))) head = head.slice(0, -1);
    return { name: head.join(': ').trim(), season };
  }
  return null;
}
function groupNetflix(rows, profile) {
  const list = (rows || []).filter(r => (!profile || r.profile === profile) && /^[^:\s]/.test(r.title.trim()));
  const series = new Map(), movies = new Map();
  // Titel mit „Name: …“, die mehrfach vorkommen, sind ebenfalls Serien (z. B. Shows ohne Staffelangabe)
  const prefixCount = new Map();
  list.forEach(r => {
    const m = r.title.match(NF_SEASON), i = r.title.indexOf(': ');
    if (m) prefixCount.set(m[1].trim(), (prefixCount.get(m[1].trim()) || 0) + 2); // bekannte Serie → „Name: irgendwas“ ist auch eine Folge
    else if (i > 0) { const p = r.title.slice(0, i); prefixCount.set(p, (prefixCount.get(p) || 0) + 1); }
  });
  for (const r of list) {
    const sr = nfSeriesOf(r.title, prefixCount);
    const name = sr?.name, season = sr?.season || 1;
    if (name) {
      const x = series.get(name) || { title: name, kind: 'tv', count: 0, last: '', first: r.date, seasons: {} };
      x.count++; x.seasons[season] = (x.seasons[season] || 0) + 1;
      if (r.date > x.last) x.last = r.date; if (r.date && (!x.first || r.date < x.first)) x.first = r.date;
      series.set(name, x);
    } else {
      const x = movies.get(r.title) || { title: r.title, kind: 'movie', count: 0, last: '' };
      x.count++; if (r.date > x.last) x.last = r.date;
      movies.set(r.title, x);
    }
  }
  const byLast = (a, b) => (b.last || '').localeCompare(a.last || '');
  return { movies: [...movies.values()].sort(byLast), series: [...series.values()].sort(byLast) };
}

/* ─── Kinojahr: Zahlen für ein Jahr (seen = Datum „gesehen“) ─── */
function yearStats(films, year) {
  const list = Object.values(films || {}).filter(f => f.note && String(f.seen || '').startsWith(String(year)));
  const months = Array(12).fill(0);
  list.forEach(f => { const m = +String(f.seen).slice(5, 7); if (m) months[m - 1]++; });
  const genreCnt = {}; list.forEach(f => (f.genres || []).forEach(g => genreCnt[g] = (genreCnt[g] || 0) + 1));
  const dimAvg = {}; const withDims = list.filter(f => f.dims);
  for (const k of DIM_KEYS) dimAvg[k] = withDims.length ? withDims.reduce((a, f) => a + (f.dims[k] || 0), 0) / withDims.length : 0;
  const rated = list.filter(f => f.vote);
  return {
    year, count: list.length, movies: list.filter(f => f.kind !== 'tv').length, series: list.filter(f => f.kind === 'tv').length,
    avg: list.length ? list.reduce((a, f) => a + f.note, 0) / list.length : 0,
    // positiv = du bewertest besser als der Durchschnitt bei TMDB
    vsWorld: rated.length ? rated.reduce((a, f) => a + (f.note - f.vote), 0) / rated.length : 0,
    months, bestMonth: list.length ? months.indexOf(Math.max(...months)) : -1,
    top: [...list].sort((a, b) => b.note - a.note || b.vote - a.vote).slice(0, 5),
    flop: [...list].sort((a, b) => a.note - b.note)[0] || null,
    genres: Object.entries(genreCnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, n]) => ({ g: +g, n })),
    mood: withDims.length ? DIM_KEYS.slice().sort((a, b) => dimAvg[b] - dimAvg[a])[0] : null,
    hidden: [...list].filter(f => f.votes && f.votes < 2000 && f.note >= 8).sort((a, b) => a.votes - b.votes)[0] || null // Geheimtipp
  };
}

/* ─── Themen & Personen (schlauere Vorschläge) ───
   feats = { key: { k: [[id, name]], p: [[id, name]] } } (Schlagworte bzw. Regie + Hauptrollen je Titel).
   Gewicht je Thema/Person = Σ(Note − eigener Schnitt) / (Anzahl + 1,5) / 2,5 → −1…+1; zählt erst ab 2 Titeln
   (Personen ab 2 Titeln oder einem Titel mit Note ≥ 9). */
function featureProfile(films, feats, now = Date.now()) {
  const list = Object.values(films || {}).filter(f => f.note && feats?.[f.key]);
  const all = Object.values(films || {}).filter(f => f.note);
  const avg = all.length ? all.reduce((a, f) => a + f.note, 0) / all.length : 6.5;
  const acc = (part) => {
    const sum = {}, cnt = {}, wc = {}, name = {}, best = {};
    for (const f of list) { const w = recencyWeight(f, now); for (const [id, nm] of feats[f.key][part] || []) {
      sum[id] = (sum[id] || 0) + w * (f.note - avg); wc[id] = (wc[id] || 0) + w; cnt[id] = (cnt[id] || 0) + 1; name[id] = nm; best[id] = Math.max(best[id] || 0, f.note);
    } }
    return Object.keys(sum).filter(id => cnt[id] >= 2 || (part === 'p' && best[id] >= 9))
      .map(id => ({ id: +id, name: name[id], n: cnt[id], w: clamp(sum[id] / (wc[id] + 1.5) / 2.5, -1, 1) }))
      .sort((a, b) => b.w - a.w);
  };
  return { kw: acc('k'), people: acc('p'), covered: list.length };
}

/* ─── Alte Stände (nur Filme, Schlüssel = TMDB-ID) auf „m123“ umstellen ─── */
function migrateData(d) {
  if (!d) return d;
  const out = { ...d };
  for (const part of ['films', 'watch', 'progress']) {
    const o = {};
    for (const [k, x] of Object.entries(d[part] || {})) {
      if (/^[mt]\d+$/.test(k)) { o[k] = x; continue; }
      o['m' + k] = { ...x, kind: x.kind || 'movie', key: 'm' + k };
    }
    out[part] = o;
  }
  const hid = {}; for (const [k, v] of Object.entries(d.hidden || {})) hid[/^[mt]\d+$/.test(k) ? k : 'm' + k] = v; out.hidden = hid;
  const tomb = {}; for (const [k, v] of Object.entries(d.tomb || {})) { const [p, id] = k.split(':'); tomb[p + ':' + (/^[mt]\d+$/.test(id) ? id : 'm' + id)] = v; } out.tomb = tomb;
  return out;
}

/* ─── Zwei Stände zusammenführen (Geräte-Sync) ───
   Je Film/Merklisten-Eintrag gewinnt der neuere Zeitstempel; Löschungen über tomb{"films:m123": ts}. */
function mergeData(a, b) {
  a = migrateData(a) || {}; b = migrateData(b) || {};
  const out = { v: 1, films: {}, watch: {}, progress: {}, hidden: {}, tomb: {} };
  for (const part of ['films', 'watch', 'progress', 'tomb']) {
    const all = { ...(a[part] || {}) };
    for (const [id, x] of Object.entries(b[part] || {})) {
      const y = all[id];
      const tx = typeof x === 'number' ? x : x?.ts || 0, ty = typeof y === 'number' ? y : y?.ts || 0;
      if (!y || tx > ty) all[id] = x;
    }
    out[part] = all;
  }
  out.hidden = { ...(a.hidden || {}), ...(b.hidden || {}) };
  // Löschmarken anwenden: Eintrag weg, wenn er älter als die Löschung ist
  for (const [key, ts] of Object.entries(out.tomb)) {
    const [part, id] = key.split(':');
    if (out[part]?.[id] && (out[part][id].ts || 0) <= ts) delete out[part][id];
  }
  return out;
}

const KinoLogic = { DIMS, DIM_KEYS, REWATCH, LEVELS, FEELINGS, GENRES, GENRE_PRIOR, TV_GENRE_MAP, TV_GENRE_OF, normGenres, keyOf, KIND_LABEL, migrateData, advanceEpisode, episodesLeft, parseCsv, nfDate, parseNetflix, groupNetflix, yearStats, featureProfile, recencyWeight, primaryCategory, uniqueCategoryLists, findDuplicates, dupNorm, genreDimTable, estimateDims, suggestDims, tasteProfile, scoreCandidate, categoryLists, fitsDim, mergeData, clamp };
if (typeof module !== 'undefined') module.exports = KinoLogic;
else Object.assign(globalThis, KinoLogic);
