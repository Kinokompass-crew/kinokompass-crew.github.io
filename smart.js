'use strict';
/* ════════════ Kinokompass – Schlauere Vorschläge: Themen & Personen ════════════
   Für bewertete Titel werden Schlagworte (TMDB-Keywords) sowie Regie/Schöpfer und die 4 Hauptrollen geladen und auf dem
   Gerät gespeichert (kino.feats, für alle Profile gemeinsam – das sind Filmdaten, keine Bewertungen).
   featureProfile() (logic.js) macht daraus Lieblingsthemen/-personen. buildRecs() holt damit zusätzliche Kandidaten
   (discover with_keywords / with_people) und gibt Treffern einen Bonus mit Begründung („Thema: Raubüberfall“, „mit …“). */

const FEAT_KEY = 'kino.feats';
let feats = (() => { try { return JSON.parse(localStorage.getItem(FEAT_KEY)) || {}; } catch (_) { return {}; } })();
let featTimer = 0;
const saveFeats = () => { clearTimeout(featTimer); featTimer = setTimeout(() => { try { localStorage.setItem(FEAT_KEY, JSON.stringify(feats)); } catch (_) { } }, 600); };

// Häufige Schlagworte auf Deutsch (der Rest bleibt englisch)
const KW_DE = {
  'heist': 'Raubüberfall', 'time travel': 'Zeitreise', 'based on novel or book': 'Romanverfilmung', 'based on true story': 'wahre Geschichte',
  'revenge': 'Rache', 'serial killer': 'Serienmörder', 'courtroom': 'Gerichtsprozess', 'police': 'Polizei', 'detective': 'Ermittler',
  'murder': 'Mord', 'friendship': 'Freundschaft', 'survival': 'Überleben', 'dystopia': 'Dystopie', 'superhero': 'Superhelden',
  'zombie': 'Zombies', 'space': 'Weltraum', 'artificial intelligence (a.i.)': 'Künstliche Intelligenz', 'conspiracy': 'Verschwörung',
  'kidnapping': 'Entführung', 'hostage': 'Geiselnahme', 'prison': 'Gefängnis', 'mafia': 'Mafia', 'drug cartel': 'Drogenkartell',
  'drug dealer': 'Drogendealer', 'spy': 'Spionage', 'assassin': 'Auftragskiller', 'hitman': 'Auftragsmörder', 'high school': 'Schule',
  'coming of age': 'Erwachsenwerden', 'sequel': 'Fortsetzung', 'remake': 'Neuverfilmung', 'world war ii': 'Zweiter Weltkrieg',
  'biography': 'Biografie', 'sports': 'Sport', 'road trip': 'Roadtrip', 'family': 'Familie', 'romantic comedy': 'romantische Komödie',
  'buddy cop': 'Polizei-Duo', 'dark comedy': 'schwarze Komödie', 'psychological thriller': 'Psychothriller', 'twist ending': 'Überraschendes Ende',
  'car chase': 'Verfolgungsjagd', 'martial arts': 'Kampfkunst', 'germany': 'Deutschland', 'berlin, germany': 'Berlin', 'military': 'Militär',
  'post-apocalyptic future': 'Endzeit', 'alien': 'Außerirdische', 'gangster': 'Gangster', 'fbi': 'FBI', 'cia': 'CIA', 'lawyer': 'Anwälte',
  'small town': 'Kleinstadt', 'true crime': 'True Crime', 'escape': 'Flucht', 'teenager': 'Teenager', 'wedding': 'Hochzeit',
  'father son relationship': 'Vater und Sohn', 'mother daughter relationship': 'Mutter und Tochter', 'violence': 'Gewalt', 'betrayal': 'Verrat',
  'corruption': 'Korruption', 'money': 'Geld', 'bank robbery': 'Banküberfall', 'investigation': 'Ermittlung', 'thriller': 'Thriller',
  'action hero': 'Actionheld', 'one-man army': 'Einzelkämpfer', 'parody': 'Parodie', 'satire': 'Satire', 'mockumentary': 'Mockumentary'
};
// Stimmungs-Schlagworte (TMDB) – zeigen, aber nicht zum Suchen neuer Titel nutzen (zu ungenau)
const KW_TONE = {
  'empathetic': 'einfühlsam', 'suspenseful': 'spannend', 'depressing': 'bedrückend', 'inspirational': 'inspirierend', 'intense': 'intensiv',
  'dramatic': 'dramatisch', 'hopeful': 'hoffnungsvoll', 'witty': 'witzig', 'comforting': 'wohltuend', 'thoughtful': 'nachdenklich',
  'admiring': 'bewundernd', 'amused': 'amüsant', 'cheerful': 'fröhlich', 'frightened': 'beängstigend', 'sad': 'traurig', 'tense': 'angespannt',
  'provocative': 'provokant', 'hilarious': 'urkomisch', 'melancholy': 'melancholisch', 'absurd': 'absurd', 'bold': 'mutig', 'mysterious': 'geheimnisvoll',
  'romantic': 'romantisch', 'exhilarated': 'mitreißend', 'excited': 'aufregend', 'familiar': 'vertraut', 'angry': 'wütend', 'antagonistic': 'feindselig',
  'complicated': 'kompliziert', 'disheartening': 'entmutigend', 'horrified': 'schockierend', 'joyous': 'freudig', 'playful': 'verspielt', 'sincere': 'aufrichtig'
};
Object.assign(KW_DE, KW_TONE, { 'courtroom drama': 'Gerichtsdrama', 'legal drama': 'Justizdrama', 'legal thriller': 'Justizthriller', 'trial': 'Prozess', 'judge': 'Richter' });
const kwName = n => KW_DE[String(n).toLowerCase()] || n;

async function fetchFeatures(key) {
  const { kind, id } = parseKey(key);
  const m = await tmdb(`/${kind}/${id}`, { append_to_response: 'keywords,credits' });
  const kws = (kind === 'tv' ? m.keywords?.results : m.keywords?.keywords) || [];
  const lead = kind === 'tv' ? (m.created_by || []) : (m.credits?.crew || []).filter(c => c.job === 'Director');
  feats[key] = { k: kws.slice(0, 25).map(k => [k.id, k.name]), p: [...lead.slice(0, 2), ...(m.credits?.cast || []).slice(0, 4)].map(x => [x.id, x.name]) };
  saveFeats();
}
// Fehlende Titel nachladen – die mit deutlichen Noten zuerst. Wartet höchstens `budget` ms, der Rest läuft weiter.
let featRun = null;
function ensureFeatures(budget = 4000) {
  if (!featRun) {
    const all = Object.values(data.films).filter(f => f.note);
    const avg = all.length ? all.reduce((a, f) => a + f.note, 0) / all.length : 6.5;
    const todo = all.filter(f => !feats[f.key]).sort((a, b) => Math.abs(b.note - avg) - Math.abs(a.note - avg)).slice(0, 300);
    if (!todo.length) return Promise.resolve();
    const before = featureProfile(data.films, feats).covered;
    featRun = pool(todo, 4, f => fetchFeatures(f.key).catch(() => { })).then(() => {
      featRun = null;
      // Viel Neues gelernt → Vorschläge einmal neu berechnen
      if (featureProfile(data.films, feats).covered - before >= 10 && !pages.length) { recState.sig = ''; if (view === 'fuerdich') render(); }
    });
  }
  return Promise.race([featRun, new Promise(r => setTimeout(r, budget))]);
}
// Zusätzliche Kandidaten über Lieblingsthemen und -personen
function smartCandidates(add, jobs) {
  const fp = featureProfile(data.films, feats);
  const kws = fp.kw.filter(x => x.w > 0.12 && !(String(x.name).toLowerCase() in KW_TONE)).slice(0, 4), ppl = fp.people.filter(x => x.w > 0.12).slice(0, 4);
  const safe = p => p.catch(() => []);
  for (const k of kws) {
    const tag = { t: 'kw', name: kwName(k.name), w: k.w };
    jobs.push(safe(discover('movie', { with_keywords: k.id, sort_by: 'vote_average.desc', 'vote_count.gte': 300 })).then(l => l.forEach(m => add(m, null, tag))));
    jobs.push(safe(discover('tv', { with_keywords: k.id, sort_by: 'vote_average.desc', 'vote_count.gte': 100 })).then(l => l.forEach(m => add(m, null, tag))));
  }
  for (const p of ppl) {
    const tag = { t: 'p', name: p.name, w: p.w };
    jobs.push(safe(discover('movie', { with_people: p.id, 'vote_count.gte': 100 })).then(l => l.forEach(m => add(m, null, tag))));
  }
  return fp;
}
// Bonus und Begründung für Treffer über Themen/Personen
function smartBonus(c) {
  if (!c.tags?.length) return c;
  const bonus = Math.min(8, c.tags.reduce((a, t) => a + t.w * 6, 0));
  const best = [...c.tags].sort((a, b) => b.w - a.w)[0];
  const why = best.t === 'kw' ? `Thema „${best.name}“ magst du` : `mit ${best.name}`;
  return { ...c, match: Math.min(99, Math.round(c.match + bonus)), reasons: [why, ...(c.reasons || [])].slice(0, 2) };
}
// „Meine → Geschmack“: Themen und Personen anzeigen
function tasteExtras() {
  const fp = featureProfile(data.films, feats), n = Object.values(data.films).filter(f => f.note).length;
  const chips = (l, cls) => l.map(x => `<span class="tag ${cls}">${esc(x.name in KW_DE ? kwName(x.name) : kwName(x.name))} <span class="muted">${x.n}×</span></span>`).join('');
  const like = fp.kw.filter(x => x.w > 0.1).slice(0, 10), dislike = fp.kw.filter(x => x.w < -0.1).slice(-6).reverse();
  const ppl = fp.people.filter(x => x.w > 0.1).slice(0, 8);
  return `<div class="card"><h3 class="sec">🧩 Deine Themen</h3>
      <p class="muted small">Aus den Schlagworten von ${fp.covered} deiner ${n} Titel gelernt${fp.covered < n ? ' – der Rest wird im Hintergrund geladen' : ''}.</p>
      ${like.length ? `<div>${chips(like, 'like')}</div>` : '<p class="muted small">Noch zu wenig Daten.</p>'}
      ${dislike.length ? `<h3 class="sec">Eher nicht</h3><div>${chips(dislike, 'dislike')}</div>` : ''}</div>
    <div class="card"><h3 class="sec">🎭 Deine Leute</h3>${ppl.length ? `<div>${ppl.map(x => `<span class="tag like">${esc(x.name)} <span class="muted">${x.n}×</span></span>`).join('')}</div><p class="muted small">Regie, Serien-Schöpfer und Hauptrollen aus deinen gut bewerteten Titeln.</p>` : '<p class="muted small">Noch zu wenig Daten.</p>'}</div>`;
}
