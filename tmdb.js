'use strict';
/* ════════════ Kinokompass – Film- und Seriendatenbank (TMDB) ════════════
   Suche (Filme + Serien, deutsche und Originaltitel), Details, Trailer, Streaming-Anbieter
   (Daten von JustWatch über TMDB), Empfehlungen, Trends. Braucht einen kostenlosen TMDB-Schlüssel.
   Kurzer API-Key (v3) → api_key-Parameter, langer Lese-Token (v4) → Bearer. Antworten werden zwischengespeichert. */

const IMG = 'https://image.tmdb.org/t/p/';
const poster = (p, size = 'w342') => p ? IMG + size + p : '';
const logo = p => p ? IMG + 'w92' + p : '';

/* ─── Streamingdienste ───
   Ein Dienst fasst mehrere TMDB-Anbieter zusammen (z. B. Netflix mit Werbung). Gezählt wird nur, was im Abo
   bzw. kostenlos läuft – Leihen/Kaufen und Amazon-„Channels“ (Zusatz-Abos) zählen nicht. */
// search = Suchseite des Dienstes (öffnet am Handy meist direkt die App)
const SERVICES = [
  { key: 'netflix', name: 'Netflix', ids: [8, 1796, 175], search: 'https://www.netflix.com/search?q=' },
  { key: 'prime', name: 'Prime Video', ids: [9, 2100, 613], search: 'https://www.amazon.de/s?i=instant-video&k=' },
  { key: 'disney', name: 'Disney+', ids: [337], search: 'https://www.disneyplus.com/search?q=' },
  { key: 'rtl', name: 'RTL+', ids: [2750], search: 'https://plus.rtl.de/suche?q=' },
  { key: 'hbo', name: 'HBO Max', ids: [1899], search: 'https://play.hbomax.com/search?q=' },
  { key: 'youtube', name: 'YouTube (gratis)', ids: [192, 235], search: 'https://www.youtube.com/results?search_query=' },
  { key: 'wow', name: 'WOW', ids: [30] },
  { key: 'joyn', name: 'Joyn', ids: [304, 421] },
  { key: 'apple', name: 'Apple TV+', ids: [350] },
  { key: 'paramount', name: 'Paramount+', ids: [531] },
  { key: 'sky', name: 'Sky Go', ids: [29] },
  { key: 'ard', name: 'ARD Mediathek', ids: [219] },
  { key: 'zdf', name: 'ZDF', ids: [537] },
  { key: 'arte', name: 'Arte', ids: [234] },
  { key: 'crunchyroll', name: 'Crunchyroll', ids: [283] },
  { key: 'mubi', name: 'MUBI', ids: [11] }
];
const DEFAULT_SERVICES = ['netflix', 'prime', 'disney', 'rtl', 'hbo', 'youtube'];
const SERVICE_OF = {}; SERVICES.forEach(s => s.ids.forEach(id => SERVICE_OF[id] = s));
const provLogo = {}; // TMDB-Anbieter-ID → Logo-Pfad (füllt sich mit jeder Antwort)
const serviceLogo = s => s.ids.map(id => provLogo[id]).find(Boolean) || '';
const myServiceIds = () => settings.myServices.flatMap(k => SERVICES.find(s => s.key === k)?.ids || []);

const tmdbCache = new Map();
async function tmdb(path, params = {}) {
  const key = (settings.apiKey || '').trim();
  if (!key) { const e = new Error('Kein TMDB-Schlüssel eingetragen.'); e.code = 'nokey'; throw e; }
  const q = new URLSearchParams({ language: 'de-DE', ...params });
  const bearer = key.length > 40; // v4-Token sind lang (JWT), v3-Keys 32 Zeichen
  if (!bearer) q.set('api_key', key);
  const url = `https://api.themoviedb.org/3${path}?${q}`;
  if (tmdbCache.has(url)) return tmdbCache.get(url);
  const p = (window.TMDB_MOCK ? window.TMDB_MOCK(path, Object.fromEntries(q)) : fetch(url, { headers: bearer ? { Authorization: 'Bearer ' + key, Accept: 'application/json' } : { Accept: 'application/json' } }).then(async r => {
    if (r.status === 401) { const e = new Error('TMDB-Schlüssel ungültig.'); e.code = 'badkey'; throw e; }
    if (!r.ok) throw new Error('TMDB antwortet mit Fehler ' + r.status);
    return r.json();
  }));
  tmdbCache.set(url, p);
  p.catch(() => tmdbCache.delete(url));
  if (tmdbCache.size > 500) tmdbCache.delete(tmdbCache.keys().next().value);
  return p;
}

// Einheitliche Kurzform für Film und Serie (aus Suche, Empfehlungen, Trends oder Details)
function slim(m, kind) {
  kind = m.media_type === 'tv' || m.media_type === 'movie' ? m.media_type : kind;
  const title = m.title || m.name || m.original_title || m.original_name || '?';
  const orig = m.original_title || m.original_name || '';
  return {
    key: keyOf(kind, m.id), id: m.id, kind,
    title, orig: orig && orig !== title ? orig : '',
    year: (m.release_date || m.first_air_date || '').slice(0, 4),
    poster: m.poster_path || '', backdrop: m.backdrop_path || '',
    genres: normGenres(m.genre_ids || (m.genres || []).map(g => g.id)),
    vote: Math.round((m.vote_average || 0) * 10) / 10, votes: m.vote_count || 0,
    popularity: m.popularity || 0, overview: m.overview || '',
    lang: m.original_language || '', countries: m.origin_country || (m.production_countries || []).map(c => c.iso_3166_1)
  };
}
const mediaOnly = l => (l || []).filter(m => m.media_type !== 'person');

/* ─── Suche: Filme und Serien parallel ───
   TMDB findet deutsche Titel, Originaltitel und Alternativtitel. Exakte Treffer und Bekanntes kommen nach oben. */
const normTitle = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
async function searchAll(query, kind = 'alle') {
  const jobs = [];
  if (kind !== 'tv') jobs.push(tmdb('/search/movie', { query, include_adult: 'false' }).then(r => r.results.map(m => slim(m, 'movie'))));
  if (kind !== 'movie') jobs.push(tmdb('/search/tv', { query, include_adult: 'false' }).then(r => r.results.map(m => slim(m, 'tv'))));
  const all = (await Promise.all(jobs)).flat();
  const q = normTitle(query);
  const rank = f => {
    const t = normTitle(f.title), o = normTitle(f.orig);
    const exact = t === q || o === q ? 3 : t.startsWith(q) || o.startsWith(q) ? 2 : t.includes(q) || o.includes(q) ? 1 : 0;
    return exact * 1000 + Math.log10(f.votes + 1) * 120 + Math.min(f.popularity, 200) * 0.5;
  };
  return all.sort((a, b) => rank(b) - rank(a));
}

// Details inkl. Streaming-Anbieter, Laufzeit/Staffeln, Regie/Besetzung, FSK, Trailer und Empfehlungen
async function details(kind, id) {
  const tv = kind === 'tv';
  const m = await tmdb(`/${kind}/${id}`, { append_to_response: `watch/providers,${tv ? 'aggregate_credits,content_ratings,external_ids' : 'credits,release_dates'},recommendations,videos`, include_video_language: 'de,en,null' });
  const base = slim(m, kind);
  const fsk = tv ? m.content_ratings?.results?.find(r => r.iso_3166_1 === 'DE')?.rating || ''
    : m.release_dates?.results?.find(r => r.iso_3166_1 === 'DE')?.release_dates?.find(d => d.certification)?.certification || '';
  const credits = tv ? m.aggregate_credits : m.credits;
  return {
    ...base,
    runtime: tv ? (m.episode_run_time?.[0] || 0) : (m.runtime || 0),
    seasons: m.number_of_seasons || 0, episodes: m.number_of_episodes || 0, status: m.status || '',
    collection: m.belongs_to_collection ? { id: m.belongs_to_collection.id, name: m.belongs_to_collection.name } : null,
    seasonList: (m.seasons || []).map(x => ({ n: x.season_number, eps: x.episode_count || 0, air: x.air_date || '' })),
    aired: m.last_episode_to_air ? { s: m.last_episode_to_air.season_number, e: m.last_episode_to_air.episode_number, date: m.last_episode_to_air.air_date || '' } : null,
    nextAir: m.next_episode_to_air ? { s: m.next_episode_to_air.season_number, e: m.next_episode_to_air.episode_number, date: m.next_episode_to_air.air_date || '' } : null,
    imdbId: (tv ? m.external_ids?.imdb_id : m.imdb_id) || '',
    tagline: m.tagline || '', fsk,
    // Deutsche Starttermine: 2/3 = Kino, 4 = digital (Streaming/Kauf), 5 = DVD/Blu-ray
    releasesDE: tv ? [] : (m.release_dates?.results?.find(r => r.iso_3166_1 === 'DE')?.release_dates || []).map(d => ({ type: d.type, date: (d.release_date || '').slice(0, 10) })),
    // Personen mit ID (für Schauspieler-Seiten); Rolle bei Serien aus aggregate_credits
    directors: (tv ? (m.created_by || []) : (credits?.crew || []).filter(c => c.job === 'Director')).slice(0, 2).map(c => ({ id: c.id, name: c.name, photo: c.profile_path || '' })),
    cast: (credits?.cast || []).slice(0, 10).map(c => ({ id: c.id, name: c.name, photo: c.profile_path || '', role: c.character || c.roles?.[0]?.character || '' })),
    providers: provFrom(m['watch/providers']),
    trailer: pickTrailer(m.videos?.results),
    recs: (m.recommendations?.results || []).map(x => slim(x, kind))
  };
}
function pickTrailer(list) {
  const yt = (list || []).filter(v => v.site === 'YouTube' && v.key);
  const score = v => (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 2 : 0) + (v.iso_639_1 === 'de' ? 3 : 0) + (v.official ? 1 : 0);
  const best = yt.sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 2 ? { key: best.key, name: best.name, de: best.iso_639_1 === 'de' } : null;
}
// Anbieter-Antwort → { flat, free, rent, buy, link } für das gewählte Land
function provFrom(r) {
  const region = r?.results?.[settings.region] || {};
  const pick = kind => (region[kind] || []).map(p => { if (p.logo_path) provLogo[p.provider_id] = p.logo_path; return { id: p.provider_id, name: p.provider_name, logo: p.logo_path }; });
  return { flat: pick('flatrate'), free: [...pick('free'), ...pick('ads')], rent: pick('rent'), buy: pick('buy'), link: region.link || '' };
}
async function watchProviders(kind, id) { return provFrom(await tmdb(`/${kind}/${id}/watch/providers`)); }

/* ─── Verfügbarkeit bei meinen Diensten ─── */
function availability(p) {
  if (!p) return null;
  const mineKeys = new Set(settings.myServices);
  const stream = [...p.flat, ...p.free];
  const mine = [], seen = new Set();
  for (const x of stream) { const s = SERVICE_OF[x.id]; if (s && mineKeys.has(s.key) && !seen.has(s.key)) { seen.add(s.key); mine.push(s); } }
  return { mine, otherStream: stream.filter(x => !mineKeys.has(SERVICE_OF[x.id]?.key)), rent: p.rent, buy: p.buy, link: p.link };
}

async function recommendationsFor(kind, id) { const r = await tmdb(`/${kind}/${id}/recommendations`); return r.results.map(m => slim(m, kind)); }
async function discover(kind, params) {
  const without = blockedGenres(kind), yr = settings.years || {}, df = kind === 'tv' ? 'first_air_date' : 'primary_release_date';
  const years = { ...(yr.from ? { [df + '.gte']: `${yr.from}-01-01` } : {}), ...(yr.to ? { [df + '.lte']: `${yr.to}-12-31` } : {}) };
  const r = await tmdb(`/discover/${kind}`, { sort_by: 'popularity.desc', 'vote_count.gte': 150, include_adult: 'false', watch_region: settings.region, ...(without.length ? { without_genres: without.join(',') } : {}), ...years, ...params });
  return r.results.map(m => slim(m, kind));
}
// Demnächst im deutschen Kino (2 Seiten)
async function upcomingDE() { const r = await Promise.all([1, 2].map(page => tmdb('/movie/upcoming', { region: 'DE', page }).catch(() => ({ results: [] })))); return r.flatMap(x => x.results).map(m => ({ ...slim(m, 'movie'), date: m.release_date || '' })); }
// Gerade im deutschen Kino
async function nowPlayingDE() { const r = await tmdb('/movie/now_playing', { region: 'DE' }); return r.results.map(m => slim(m, 'movie')); }
async function trending(kind = 'all', page = 1) { const r = await tmdb(`/trending/${kind}/week`, { page }); return mediaOnly(r.results).map(m => slim(m, kind === 'all' ? 'movie' : kind)); }
// Alle Anbieter im Land – nur um die Logos der Dienste zu kennen
async function loadProviderLogos() {
  const r = await tmdb('/watch/providers/movie', { watch_region: settings.region });
  r.results.forEach(p => { if (p.logo_path) provLogo[p.provider_id] = p.logo_path; });
}

/* ─── IMDb, Rotten Tomatoes, Metacritic über OMDb (eigener, kostenloser Schlüssel; 1000 Abfragen/Tag) ─── */
const omdbCache = new Map();
function omdb(imdbId) {
  const key = (settings.omdbKey || '').trim();
  if (!key || !imdbId) return Promise.resolve(null);
  if (!omdbCache.has(imdbId)) omdbCache.set(imdbId, fetch(`https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(key)}`)
    .then(r => r.json()).then(j => {
      if (j.Response === 'False') { if (/key/i.test(j.Error || '')) { const e = new Error('OMDb-Schlüssel ungültig oder nicht aktiviert.'); e.code = 'badkey'; throw e; } return null; }
      const rt = (j.Ratings || []).find(x => x.Source === 'Rotten Tomatoes')?.Value || '';
      const num = v => v && v !== 'N/A' ? v : '';
      return { imdb: num(j.imdbRating), imdbVotes: num(j.imdbVotes), rt, meta: num(j.Metascore), url: 'https://www.imdb.com/title/' + imdbId + '/' };
    }).catch(e => { omdbCache.delete(imdbId); if (e.code === 'badkey') throw e; return null; }));
  return omdbCache.get(imdbId);
}

/* ─── „Nicht für mich“: ausgeblendete Genres und Anime ───
   settings.block = ['anime', '16', …] (Genre-IDs als Text). Anime = Animation aus Japan. Gilt für Vorschläge,
   Trends, „Was schauen wir heute?“ und „Wie war's?“ – nicht für die Suche (da sucht man ja gezielt). */
const BLOCK_OPTIONS = [
  { key: 'anime', label: 'Anime', icon: '🇯🇵' }, { key: '16', label: 'Animation / Zeichentrick', icon: '🧸' },
  { key: '10751', label: 'Familie', icon: '👨‍👩‍👧' }, { key: '10762', label: 'Kinderserien', icon: '🧒' },
  { key: '27', label: 'Horror', icon: '👻' }, { key: '10749', label: 'Liebesfilm', icon: '❤️' },
  { key: '99', label: 'Dokumentarfilm', icon: '🎥' }, { key: '10764', label: 'Reality-TV', icon: '📺' },
  { key: '10767', label: 'Talkshow', icon: '🎙️' }, { key: '10766', label: 'Seifenoper', icon: '🧼' },
  { key: '10402', label: 'Musik', icon: '🎵' }, { key: '37', label: 'Western', icon: '🤠' }, { key: '10752', label: 'Krieg', icon: '⚔️' }
];
function blockedGenres(kind) {
  const ids = (settings.block || []).filter(k => /^\d+$/.test(k)).map(Number);
  return kind === 'tv' ? [...new Set(ids.map(g => TV_GENRE_OF[g] || ([10762, 10763, 10764, 10766, 10767].includes(g) ? g : null)).filter(Boolean))] : ids.filter(g => g < 10762 || g === 10770);
}
function isBlocked(m) {
  if (!m) return false;
  const y = +m.year, yr = settings.years || {};
  if (y && ((yr.from && y < +yr.from) || (yr.to && y > +yr.to))) return true; // Jahresfilter
  const b = settings.block || []; if (!b.length) return false;
  const gs = m.genres || [];
  if (b.includes('anime') && gs.includes(16) && (m.lang === 'ja' || (m.countries || []).includes('JP'))) return true;
  return gs.some(g => b.includes(String(g)));
}
