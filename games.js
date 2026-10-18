'use strict';
/* ════════════ Kinokompass – Poster-Wand, Wochen-Challenge, Abzeichen, Filmquiz ════════════ */

/* ─── Poster-Wand ─── */
function openWall() { const p = openPage('🖼️ Poster-Wand'); p.wall = { sort: 'note', kind: 'alle' }; renderWall(p); }
function renderWall(p) {
  const o = p.wall, sorters = { note: (a, b) => b.note - a.note || b.ts - a.ts, neu: (a, b) => (b.seen || '').localeCompare(a.seen || '') || b.ts - a.ts, jahr: (a, b) => (b.year || '').localeCompare(a.year || '') };
  const list = Object.values(data.films).filter(f => o.kind === 'alle' || (f.kind || 'movie') === o.kind).sort(sorters[o.sort]);
  p.body.innerHTML = `<div class="segtabs">${[['note', 'Beste zuerst'], ['neu', 'Zuletzt gesehen'], ['jahr', 'Erscheinungsjahr']].map(([k, l]) => `<button class="${o.sort === k ? 'on' : ''}" data-wall="sort" data-v="${k}">${l}</button>`).join('')}</div>
    ${kindSeg(o.kind, 'wallkind')}
    <div class="wall">${list.map(f => `<div class="wall-item" data-open="${f.key}">${posterImg(f, 'w342')}<span class="note ${noteClass(f.note)} corner">${f.note}</span>${f.rewatch === 'ja' ? '<span class="wall-rw">🔁</span>' : ''}</div>`).join('') || '<div class="empty">Noch nichts bewertet.</div>'}</div>`;
}

/* ─── Wochen-Challenge ─── */
function isoWeek(d = new Date()) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, '0')}`; }
function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
const CH_KEY = () => 'kino.challenge.' + profiles.current;
const chState = () => { try { return { done: {}, log: {}, ...(JSON.parse(localStorage.getItem(CH_KEY())) || {}) }; } catch (_) { return { done: {}, log: {} }; } };
const saveCh = s => localStorage.setItem(CH_KEY(), JSON.stringify(s));
function chLog(kind) { const s = chState(), w = isoWeek(); s.log[w] = s.log[w] || {}; s.log[w][kind] = (s.log[w][kind] || 0) + 1; saveCh(s); }
const quizState = () => { try { return { best: 0, week: {}, played: 0, ...(JSON.parse(localStorage.getItem('kino.quiz.' + profiles.current)) || {}) }; } catch (_) { return { best: 0, week: {}, played: 0 }; } };

function weekFilms() { const ws = weekStart().getTime(); return Object.values(data.films).filter(f => (f.ts || 0) >= ws); }
const CHALLENGES = [
  { id: 'rate3', icon: '⭐', text: 'Bewerte 3 Titel', goal: 3, val: w => w.length },
  { id: 'rate5', icon: '🌟', text: 'Bewerte 5 Titel', goal: 5, val: w => w.length },
  { id: 'series', icon: '📺', text: 'Bewerte eine Serie', goal: 1, val: w => w.filter(f => f.kind === 'tv').length },
  { id: 'old', icon: '📼', text: 'Ein Film aus der Zeit vor 1990', goal: 1, val: w => w.filter(f => f.kind !== 'tv' && f.year && +f.year < 1990).length },
  { id: 'classic', icon: '🏛️', text: 'Ein Klassiker mit ★ 8 oder mehr', goal: 1, val: w => w.filter(f => f.vote >= 8 && f.votes >= 3000).length },
  { id: 'gem', icon: '💎', text: 'Ein Geheimtipp (unter 2.000 Stimmen)', goal: 1, val: w => w.filter(f => f.votes && f.votes < 2000).length },
  { id: 'comment', icon: '✍️', text: 'Schreib zu 2 Titeln einen Kommentar', goal: 2, val: w => w.filter(f => f.comment).length },
  { id: 'rewatch', icon: '🔁', text: 'Beantworte 2× „Nochmal schauen?“', goal: 2, val: w => w.filter(f => f.rewatch).length },
  { id: 'quiz', icon: '🎬', text: 'Hol im Filmquiz mindestens 6 Punkte', goal: 6, val: () => quizState().week[isoWeek()] || 0 },
  { id: 'friend', icon: '📨', text: 'Empfiehl einem Freund etwas', goal: 1, val: () => chState().log[isoWeek()]?.recommend || 0, needs: () => frReady() },
  { id: 'chat', icon: '💬', text: 'Schreib eine Nachricht unter einen Film', goal: 1, val: () => chState().log[isoWeek()]?.chat || 0 },
  { id: 'genre', icon: '🎭', text: 'Bewerte einen Film aus einem Genre, das du selten schaust', goal: 1, val: w => { const c = {}; Object.values(data.films).forEach(f => (f.genres || []).forEach(g => c[g] = (c[g] || 0) + 1)); return w.filter(f => (f.genres || []).some(g => (c[g] || 0) <= 3)).length; } }
];
function weekChallenges() {
  const w = isoWeek(), pool = CHALLENGES.filter(c => !c.needs || c.needs());
  let h = 0; for (const ch of w + profiles.current) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const pick = [], rnd = () => { h = (h * 1103515245 + 12345) | 0; return Math.abs(h); };
  while (pick.length < 3 && pick.length < pool.length) { const c = pool[rnd() % pool.length]; if (!pick.includes(c) && !(pick.some(x => x.id.startsWith('rate')) && c.id.startsWith('rate'))) pick.push(c); }
  const wf = weekFilms();
  return pick.map(c => { const v = c.val(wf); return { ...c, cur: Math.min(v, c.goal), ok: v >= c.goal }; });
}
function checkWeekDone() {
  const list = weekChallenges(), s = chState(), w = isoWeek();
  if (list.every(c => c.ok) && !s.done[w]) { s.done[w] = Date.now(); saveCh(s); confetti(); vib('success'); toast('🏆 Wochen-Challenge geschafft!'); }
}
function challengeCard() {
  if (!settings.apiKey) return '';
  const list = weekChallenges(), n = list.filter(c => c.ok).length;
  return `<button class="ch-card" data-game="challenge"><span class="today-dice">🏆</span><span><b>Wochen-Challenge ${n}/3</b><span class="small">${list.map(c => `${c.ok ? '✅' : c.icon} ${esc(c.text)}`).join(' · ')}</span></span></button>`;
}

/* ─── Abzeichen ─── */
function badges() {
  const f = Object.values(data.films), s = chState(), q = quizState();
  const kw = k => f.filter(x => (feats[x.key]?.k || []).some(([, n]) => k.test(n))).length;
  const gem = f.filter(x => x.votes && x.votes < 2000 && x.note >= 8).length;
  const genres = new Set(f.flatMap(x => x.genres || [])).size;
  const twin = frReady() && friendList().some(x => (agreement(x).pct || 0) >= 90);
  return [
    { icon: '🎟️', name: 'Erste Schritte', desc: '10 Titel bewertet', ok: f.length >= 10 },
    { icon: '🍿', name: 'Filmfan', desc: '50 Titel bewertet', ok: f.length >= 50 },
    { icon: '🎞️', name: 'Cineast', desc: '100 Titel bewertet', ok: f.length >= 100 },
    { icon: '👑', name: 'Kino-Legende', desc: '250 Titel bewertet', ok: f.length >= 250 },
    { icon: '📺', name: 'Serienjunkie', desc: '10 Serien bewertet', ok: f.filter(x => x.kind === 'tv').length >= 10 },
    { icon: '✍️', name: 'Kritiker', desc: '10 Kommentare geschrieben', ok: f.filter(x => x.comment).length >= 10 },
    { icon: '⚖️', name: 'Gerichtsdrama-Experte', desc: '5 Gerichts- oder Anwaltsfilme', ok: kw(/court|lawyer|trial|legal/i) >= 5 },
    { icon: '💎', name: 'Geheimtipp-Jäger', desc: '5 wenig bekannte Titel mit 8+', ok: gem >= 5 },
    { icon: '🌈', name: 'Allesgucker', desc: 'Titel aus 12 Genres', ok: genres >= 12 },
    { icon: '📼', name: 'Zeitreisender', desc: '5 Filme vor 1990', ok: f.filter(x => x.kind !== 'tv' && +x.year < 1990).length >= 5 },
    { icon: '🧠', name: 'Quizmaster', desc: '9 von 10 im Filmquiz', ok: q.best >= 9 },
    { icon: '🔥', name: 'Wochen-Held', desc: '3 Wochen-Challenges geschafft', ok: Object.keys(s.done).length >= 3 },
    { icon: '🤝', name: 'Geschmacks-Zwilling', desc: '90 % einig mit einem Freund', ok: twin }
  ];
}
function openChallenge() {
  const p = openPage('🏆 Challenge & Abzeichen'); p.game = true;
  const list = weekChallenges(), s = chState(), b = badges();
  const end = new Date(weekStart()); end.setDate(end.getDate() + 6);
  p.body.innerHTML = `<div class="game">
    <div class="card"><h3 class="sec">Diese Woche <span class="muted small">bis ${end.toLocaleDateString('de-DE', { weekday: 'long' })}</span></h3>
      ${list.map(c => `<div class="ch-row ${c.ok ? 'ok' : ''}"><span class="ch-icon">${c.ok ? '✅' : c.icon}</span><div><div>${esc(c.text)}</div><div class="bar"><div class="bar-in" style="width:${Math.round(c.cur / c.goal * 100)}%"></div></div></div><span class="muted small">${c.cur}/${c.goal}</span></div>`).join('')}
      ${list.every(c => c.ok) ? '<p class="ok-note">🏆 Geschafft! Nächste Woche gibt es neue Aufgaben.</p>' : ''}
      <p class="small muted">Geschaffte Wochen: <b>${Object.keys(s.done).length}</b></p></div>
    <h3 class="sec">Abzeichen <span class="muted small">${b.filter(x => x.ok).length}/${b.length}</span></h3>
    <div class="badges">${b.map(x => `<div class="badge-tile ${x.ok ? 'ok' : ''}"><span class="badge-icon">${x.icon}</span><b>${esc(x.name)}</b><span class="small muted">${esc(x.desc)}</span></div>`).join('')}</div>
    <button class="btn primary wide" data-game="quiz">🎬 Zum Filmquiz</button></div>`;
}

/* ─── Filmquiz ─── */
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
async function buildQuiz() {
  const pages_ = shuffle([1, 2, 3, 4, 5, 6]).slice(0, 3);
  const pool = remember((await Promise.all(pages_.map(pg => discover('movie', { page: pg, 'vote_count.gte': 2500 }).catch(() => []))).then(x => x.flat()))
    .filter(m => m.backdrop && m.poster && m.year && !isBlocked(m) && /[a-zäöü]/i.test(m.title)));
  const uniq = [...new Map(pool.map(m => [m.key, m])).values()];
  if (uniq.length < 16) throw new Error('Zu wenig Filme gefunden – später nochmal versuchen.');
  const films = shuffle(uniq), qs = [], others = k => shuffle(films.filter(f => f.key !== k));
  const take = () => films.shift();
  for (let i = 0; i < 4; i++) { const f = take(); qs.push({ type: 'bild', q: 'Welcher Film ist das?', img: poster(f.backdrop, 'w780'), ans: f.title, opts: shuffle([f.title, ...others(f.key).slice(0, 3).map(x => x.title)]), key: f.key }); }
  for (let i = 0; i < 2; i++) { const f = take(), y = +f.year; const set = new Set([y]); while (set.size < 4) set.add(y + (Math.floor(Math.random() * 13) - 6)); qs.push({ type: 'jahr', q: `In welchem Jahr kam „${f.title}“ heraus?`, img: poster(f.poster, 'w342'), ans: String(y), opts: shuffle([...set].map(String)), key: f.key }); }
  for (let i = 0; i < 2; i++) { const a = take(), b = films.find(x => Math.abs(x.vote - a.vote) >= .4) || take(); films.splice(films.indexOf(b), 1); qs.push({ type: 'besser', q: 'Welcher Film ist bei TMDB besser bewertet?', pair: [a, b], ans: a.vote >= b.vote ? a.title : b.title, opts: [a.title, b.title], key: a.key, extra: `${a.title}: ★ ${fmtNum(a.vote)} · ${b.title}: ★ ${fmtNum(b.vote)}` }); }
  const castFilms = films.splice(0, 5), dets = await Promise.all(castFilms.map(f => details('movie', f.id).catch(() => null)));
  const ok = dets.filter(d => d?.cast?.length >= 2);
  for (let i = 0; i < Math.min(2, ok.length); i++) {
    const d = ok[i], star = d.cast[0].name, wrong = shuffle(ok.filter(x => x !== d).flatMap(x => x.cast.slice(0, 3).map(c => c.name)).filter(n => !d.cast.some(c => c.name === n))).slice(0, 3);
    if (wrong.length === 3) qs.push({ type: 'cast', q: `Wer spielt in „${d.title}“ mit?`, img: poster(d.poster, 'w342'), ans: star, opts: shuffle([star, ...wrong]), key: d.key });
  }
  return shuffle(qs).slice(0, 10);
}
async function openQuiz() {
  const p = openPage('🎬 Filmquiz'); p.quiz = { i: 0, score: 0, qs: null, answered: false };
  p.body.innerHTML = `<div class="loading-note">Mische die Fragen …</div>${skeleton(1)}`;
  try { p.quiz.qs = await buildQuiz(); if (pages.includes(p)) renderQuiz(p); }
  catch (e) { p.body.innerHTML = errorBox(e.message); }
}
function renderQuiz(p) {
  const z = p.quiz, q = z.qs[z.i];
  if (!q) {
    const st = quizState(), w = isoWeek(); st.played++; st.week[w] = Math.max(st.week[w] || 0, z.score); const rec = z.score > st.best; st.best = Math.max(st.best, z.score);
    localStorage.setItem('kino.quiz.' + profiles.current, JSON.stringify(st));
    if (z.score >= 8) confetti(); vib(z.score >= 6 ? 'success' : 'light');
    checkWeekDone();
    p.body.innerHTML = `<div class="quiz-end"><div class="quiz-score">${z.score}<span>/${z.qs.length}</span></div>
      <h2>${z.score >= 9 ? 'Filmgenie! 🧠' : z.score >= 7 ? 'Stark! 🎉' : z.score >= 5 ? 'Solide 👍' : 'Da geht noch was 🍿'}</h2>
      <p class="muted">${rec ? '🏆 Neuer Rekord!' : `Dein Rekord: ${st.best}/10`} · ${st.played}× gespielt</p>
      <button class="btn primary wide" data-game="quiz">Nochmal spielen</button><button class="btn wide" data-game="challenge">🏆 Challenge & Abzeichen</button></div>`;
    return;
  }
  p.body.innerHTML = `<div class="quiz">
    <div class="quiz-top"><span class="muted small">Frage ${z.i + 1}/${z.qs.length}</span><span class="quiz-pts">⭐ ${z.score}</span></div>
    <div class="bar"><div class="bar-in" style="width:${z.i / z.qs.length * 100}%"></div></div>
    ${q.type === 'besser' ? `<div class="quiz-pair">${q.pair.map(f => `<img src="${poster(f.poster, 'w342')}" alt="">`).join('')}</div>` : q.img ? `<img class="quiz-img ${q.type === 'bild' ? 'wide' : ''}" src="${q.img}" alt="">` : ''}
    <h2 class="quiz-q">${esc(q.q)}</h2>
    <div class="quiz-opts">${q.opts.map(o => `<button class="quiz-opt" data-game="answer" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <div class="quiz-after"></div></div>`;
}
function answerQuiz(p, btn) {
  const z = p.quiz, q = z.qs[z.i]; if (z.answered) return;
  z.answered = true;
  const right = btn.dataset.v === q.ans;
  if (right) { z.score++; const pts = $('.quiz-pts', p.body); if (pts) { pts.textContent = '⭐ ' + z.score; pts.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 300 }); } }
  vib(right ? 'success' : 'error');
  p.body.querySelectorAll('.quiz-opt').forEach(b => { b.disabled = true; if (b.dataset.v === q.ans) b.classList.add('right'); else if (b === btn) b.classList.add('wrong'); });
  $('.quiz-after', p.body).innerHTML = `<p class="small muted">${right ? '✅ Richtig!' : `❌ Richtig wäre: <b>${esc(q.ans)}</b>`}${q.extra ? '<br>' + esc(q.extra) : ''}</p><button class="btn primary wide" data-game="next">${z.i + 1 < z.qs.length ? 'Weiter →' : 'Ergebnis'}</button>`;
}

/* ─── Klicks ─── */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-game],[data-wall],[data-wallkind]'); if (!t) return;
  const p = pages.at(-1);
  if (t.dataset.wall) { p.wall.sort = t.dataset.v; return renderWall(p); }
  if (t.dataset.wallkind) { p.wall.kind = t.dataset.wallkind; return renderWall(p); }
  switch (t.dataset.game) {
    case 'wall': return openWall();
    case 'challenge': return openChallenge();
    case 'quiz': if (p?.quiz) closePage(); return openQuiz();
    case 'answer': return answerQuiz(p, t);
    case 'next': p.quiz.i++; p.quiz.answered = false; return renderQuiz(p);
  }
});
