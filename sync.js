'use strict';
/* ════════════ Kinokompass – Geräte-Sync über GitHub ════════════
   Wie bei Obiter: die Bewertungen liegen als JSON im privaten Workspace-Repo, aber auf einem
   eigenen Branch („kinokompass“), damit sie keinen APK-Build auslösen und die Code-Historie sauber bleibt.
   Ablauf: Remote laden → mit lokalem Stand zusammenführen (mergeData) → lokal speichern und hochladen. */

const SYNC_KEY = 'kino.sync';
const syncCfg = (() => {
  const hostedWeb = /\.github\.io$/.test(location.hostname); // veröffentlichte Web-App: kein Workspace, Sync über den Freunde-Speicher
  const d = hostedWeb ? { owner: '', repo: '', branch: 'main', path: '', token: '', last: 0 } : { owner: 'Brownyay', repo: 'ClaudeWorkspace', branch: 'kinokompass', path: 'kinokompass/filme.json', token: '', last: 0 };
  try { const s = JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; Object.keys(s).forEach(k => { if (s[k] === '' && d[k]) delete s[k]; }); return { ...d, ...s }; } catch (_) { return d; }
})();

// Token auf Android im Keystore (Plugin), sonst im normalen Speicher des Geräts
const SecureP = () => window.Capacitor?.Plugins?.SecureStoragePlugin;
let tokenSecure = false;
function saveSyncCfg() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(tokenSecure ? { ...syncCfg, token: '' } : syncCfg)); } catch (_) { } }
const tokenReady = (async () => {
  if (!SecureP()) return;
  try {
    if (syncCfg.token) { await SecureP().set({ key: 'kino.token', value: syncCfg.token }); tokenSecure = true; saveSyncCfg(); }
    else { const t = (await SecureP().get({ key: 'kino.token' }).catch(() => null))?.value; if (t) { syncCfg.token = t; tokenSecure = true; } }
  } catch (_) { }
})();
async function setToken(t) {
  syncCfg.token = t.trim();
  if (SecureP()) {
    try { if (syncCfg.token) await SecureP().set({ key: 'kino.token', value: syncCfg.token }); else await SecureP().remove({ key: 'kino.token' }).catch(() => { }); tokenSecure = !!syncCfg.token; } catch (_) { tokenSecure = false; }
  }
  saveSyncCfg();
}
const syncReady = () => !!(syncCfg.owner && syncCfg.repo && syncCfg.token);

async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com' + path, {
    ...opts,
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + syncCfg.token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
  });
  if (r.status === 404) return null;
  if (!r.ok) { const t = await r.text().catch(() => ''); const e = new Error(`GitHub ${r.status}: ${t.slice(0, 140)}`); e.status = r.status; throw e; }
  return r.status === 204 ? {} : r.json();
}
const b64enc = s => btoa(unescape(encodeURIComponent(s)));
const b64dec = s => decodeURIComponent(escape(atob(String(s).replace(/\s/g, ''))));
const repoPath = () => `/repos/${encodeURIComponent(syncCfg.owner)}/${encodeURIComponent(syncCfg.repo)}`;
async function ensureBranch() {
  if (await gh(`${repoPath()}/git/ref/heads/${syncCfg.branch}`)) return;
  const repo = await gh(repoPath());
  if (!repo) throw new Error('Repo nicht gefunden – Name oder Token-Rechte prüfen.');
  const base = await gh(`${repoPath()}/git/ref/heads/${repo.default_branch}`);
  await gh(`${repoPath()}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${syncCfg.branch}`, sha: base.object.sha }) });
}

let syncing = null, syncTimer = 0;
// Profil „p1“ = filme.json (wie bisher), weitere Profile = filme-<id>.json, Profil-Liste = profile.json
const profilePath = id => id === 'p1' ? syncCfg.path : syncCfg.path.replace(/\.json$/, `-${id}.json`);
const profilesPath = () => syncCfg.path.replace(/[^/]+$/, 'profile.json');
function mergeProfileLists(a, b) {
  const m = new Map();
  for (const p of [...(a || []), ...(b || [])]) { const o = m.get(p.id); if (!o || (p.ts || 0) > (o.ts || 0)) m.set(p.id, p); }
  return [...m.values()].sort((x, y) => (x.id === 'p1' ? -1 : y.id === 'p1' ? 1 : (x.created || 0) - (y.created || 0)));
}
// Eine Datei abgleichen: laden → zusammenführen → nur bei Unterschied hochladen (bei Konflikt neu versuchen)
async function syncFile(path, local, merge) {
  let merged = local;
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await gh(`${repoPath()}/contents/${path}?ref=${syncCfg.branch}`);
    const remote = file ? JSON.parse(b64dec(file.content)) : null;
    merged = merge(local, remote);
    const body = JSON.stringify(merged);
    if (file && body === JSON.stringify(remote)) return merged;
    try {
      await gh(`${repoPath()}/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: 'Kinokompass: Bewertungen', content: b64enc(body), branch: syncCfg.branch, ...(file ? { sha: file.sha } : {}) }) });
      return merged;
    } catch (e) { if (e.status !== 409 && e.status !== 422) throw e; } // ein anderes Gerät war schneller → neu laden
  }
  return merged;
}
function syncNow(quiet) {
  if (!syncReady()) return Promise.resolve(false);
  if (syncing) return syncing;
  setSyncState('läuft');
  syncing = (async () => {
    await tokenReady;
    await ensureBranch();
    const pl = await syncFile(profilesPath(), { list: profiles.list }, (a, b) => ({ list: mergeProfileLists(a?.list, b?.list) }));
    const before = JSON.stringify(profiles.list);
    profiles.list = pl.list;
    if (!curProfile() || curProfile().id !== profiles.current) profiles.current = (curProfile() || { id: 'p1' }).id;
    saveProfiles();
    if (before !== JSON.stringify(profiles.list) && typeof onProfilesChanged === 'function') onProfilesChanged();
    for (const p of liveProfiles()) {
      const isCur = p.id === profiles.current;
      const merged = await syncFile(profilePath(p.id), isCur ? data : loadData(p.id), mergeData);
      if (p.id === profiles.current) replaceData(merged); // (Profil könnte inzwischen gewechselt sein)
      else try { localStorage.setItem(dataKey(p.id), JSON.stringify(merged)); } catch (_) { }
    }
    syncCfg.last = Date.now(); saveSyncCfg();
    setSyncState('ok');
    return true;
  })().catch(e => { setSyncState('fehler', e.message); if (!quiet) toast('Sync fehlgeschlagen: ' + e.message); return false; })
    .finally(() => { syncing = null; });
  return syncing;
}
// 20 s nach der letzten Änderung hochladen
function syncAfterChange() { if (!syncReady()) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(true), 20000); }
let syncState = { s: '', msg: '' };
function setSyncState(s, msg = '') { syncState = { s, msg }; document.querySelectorAll('[data-syncstate]').forEach(el => el.textContent = syncLabel()); }
function syncLabel() {
  if (!syncReady()) return 'nicht eingerichtet';
  if (syncState.s === 'läuft') return 'synchronisiere …';
  if (syncState.s === 'fehler') return 'Fehler: ' + syncState.msg;
  return syncCfg.last ? 'zuletzt ' + new Date(syncCfg.last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie';
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - syncCfg.last > 60000) syncNow(true);
  if (document.visibilityState === 'hidden' && syncTimer) { clearTimeout(syncTimer); syncTimer = 0; syncNow(true); }
});
// Am Mac bleibt das Fenster oft einfach offen: beim Zurückholen ins Vordergrund und alle 2 Minuten nachsehen
window.addEventListener('focus', () => { if (Date.now() - syncCfg.last > 30000) syncNow(true); });
// Sichtbar: alle 2 Minuten. Im Hintergrund (Mac-Fenster verdeckt/minimiert, Browser-Tab): alle 10 Minuten.
// (Auf dem Handy pausiert Android die App im Hintergrund ohnehin – dort zählt der Abgleich beim Zurückkehren.)
setInterval(() => { const age = Date.now() - syncCfg.last; if (age > (document.visibilityState === 'visible' ? 110000 : 590000)) syncNow(true); }, 60000);
