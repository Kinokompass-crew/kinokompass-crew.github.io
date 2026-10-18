'use strict';
/* ════════════ Kinokompass – Profile („Wer schaut?“) ════════════
   Auswahl beim Start (wenn ≥ 2 Profile und „beim Start fragen“ an), Wechsel über das Profilbild oben links,
   anlegen / umbenennen / Symbol wählen / entfernen. Daten-Speicher und Sync je Profil stehen in app.js / sync.js. */

const PROFILE_EMOJIS = ['🍿', '🎬', '🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🌸', '⚡', '🎮', '👑', '🌙', '🔥', '🍕', '⭐'];
const newProfileId = () => 'p' + Date.now().toString(36);

function updateAvatar() {
  const a = $('.avatar'); if (!a) return;
  const p = curProfile();
  a.textContent = p.emoji || '🍿';
  a.title = 'Profil: ' + p.name;
  a.classList.toggle('multi', liveProfiles().length > 1);
}
// Vom Sync gerufen, wenn sich die Profil-Liste geändert hat (z. B. am Handy ein Profil angelegt)
function onProfilesChanged() { updateAvatar(); const p = pages.at(-1); if (p?.who) renderWho(p); }

function openWho(atStart) {
  if (pages.some(p => p.who)) return;
  const p = openPage('Wer schaut?', { cls: 'who-page' }); p.who = true; p.atStart = atStart; p.edit = false;
  renderWho(p);
}
function renderWho(p) {
  const list = liveProfiles();
  p.body.innerHTML = `<div class="who">
    <h2 class="center">${p.edit ? 'Profile bearbeiten' : 'Wer schaut?'}</h2>
    <div class="who-grid">
      ${list.map(x => `<button class="who-tile ${x.id === profiles.current ? 'cur' : ''}" data-pf="${p.edit ? 'edit' : 'pick'}" data-v="${x.id}">
        <span class="who-emoji">${x.emoji || '🍿'}</span><span class="who-name">${esc(x.name)}</span>${p.edit ? '<span class="who-pen">✎</span>' : ''}</button>`).join('')}
      ${list.length < 6 ? `<button class="who-tile add" data-pf="add"><span class="who-emoji">＋</span><span class="who-name">Profil hinzufügen</span></button>` : ''}
    </div>
    <div class="row2"><button class="btn ghost" data-pf="toggleEdit">${p.edit ? '✓ Fertig' : '✎ Bearbeiten'}</button></div>
    ${list.length > 1 ? `<label class="switch-row"><input type="checkbox" id="whoAsk" ${profiles.ask ? 'checked' : ''}><span>Beim Start fragen, wer schaut</span></label>` : ''}
    <p class="small muted center">Jedes Profil hat eigene Bewertungen, Merkliste, Serien-Fortschritt und Vorschläge. Schlüssel und Streamingdienste gelten für alle. Für einen gemeinsamen Abend: „🎲 Was schauen wir heute?“ → „Wer schaut mit?“.</p>
  </div>`;
  $('#whoAsk', p.body)?.addEventListener('change', e => { profiles.ask = e.target.checked; saveProfiles(); });
}
function openProfileEdit(id) {
  const isNew = !id;
  const pr = isNew ? { id: newProfileId(), name: '', emoji: PROFILE_EMOJIS[liveProfiles().length % PROFILE_EMOJIS.length] } : { ...profiles.list.find(x => x.id === id) };
  const p = openPage(isNew ? 'Neues Profil' : 'Profil bearbeiten'); p.pedit = pr; p.isNew = isNew;
  const draw = () => {
    p.body.innerHTML = `<div class="who">
      <div class="who-big">${pr.emoji}</div>
      <input id="pfName" class="input" placeholder="Name (z. B. Lena)" maxlength="20" value="${esc(pr.name)}" autocomplete="off">
      <h3 class="sec">Symbol</h3>
      <div class="emoji-grid">${PROFILE_EMOJIS.map(e => `<button class="${e === pr.emoji ? 'on' : ''}" data-pf="emoji" data-v="${e}">${e}</button>`).join('')}</div>
      <h3 class="sec">Akzentfarbe</h3>
      <div class="color-grid"><button class="${!pr.color ? 'on' : ''}" data-pf="color" data-v="" style="background:conic-gradient(#f5b942,#f87171,#38bdf8,#4ade80,#f5b942)" title="Standard"></button>${PROFILE_COLORS.map(c => `<button class="${pr.color === c ? 'on' : ''}" data-pf="color" data-v="${c}" style="background:${c}"></button>`).join('')}</div>
      <button class="btn primary wide" data-pf="save">${isNew ? 'Profil anlegen' : 'Speichern'}</button>
      ${!isNew && liveProfiles().length > 1 ? `<button class="btn ghost danger wide" data-pf="delete">Profil entfernen</button>` : ''}
    </div>`;
    $('#pfName', p.body).addEventListener('input', e => pr.name = e.target.value);
    if (isNew) setTimeout(() => $('#pfName', p.body)?.focus(), 300);
  };
  p.draw = draw; draw();
}
function switchProfile(id) {
  if (id === profiles.current) return;
  try { localStorage.setItem(dataKey(), JSON.stringify(data)); } catch (_) { }
  profiles.current = id; saveProfiles();
  data = loadData(id);
  nfQueue = readQueue();
  recState = { sig: '', list: null, err: '', loading: null };
  todaySeen.clear();
  updateAvatar(); applyTheme(); if (typeof updateBell === 'function') updateBell();
  syncNow(true);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-pf]'); if (!t) return;
  const p = pages.at(-1), v = t.dataset.v;
  switch (t.dataset.pf) {
    case 'who': return openWho(false);
    case 'pick': {
      const changed = v !== profiles.current;
      switchProfile(v); closeAllPages(); vib();
      if (changed || p?.atStart) { go(view); toast(`Hallo ${curProfile().name}! ${curProfile().emoji}`); }
      return;
    }
    case 'toggleEdit': p.edit = !p.edit; return renderWho(p);
    case 'add': return openProfileEdit(null);
    case 'edit': return openProfileEdit(v);
    case 'emoji': p.pedit.emoji = v; return p.draw();
    case 'color': p.pedit.color = v; vib(); return p.draw();
    case 'save': {
      const pr = p.pedit; pr.name = (pr.name || '').trim();
      if (!pr.name) return toast('Bitte einen Namen eingeben');
      const now = Date.now();
      const i = profiles.list.findIndex(x => x.id === pr.id);
      if (i >= 0) profiles.list[i] = { ...profiles.list[i], name: pr.name, emoji: pr.emoji, color: pr.color || '', ts: now };
      else profiles.list.push({ id: pr.id, name: pr.name, emoji: pr.emoji, color: pr.color || '', ts: now, created: now });
      saveProfiles(); updateAvatar(); applyTheme(); syncNow(true); vib();
      closePage(); const w = pages.at(-1); if (w?.who) renderWho(w);
      return toast(p.isNew ? `Profil „${pr.name}“ angelegt` : 'Gespeichert');
    }
    case 'delete': {
      const pr = p.pedit;
      if (!confirm(`Profil „${pr.name}“ entfernen? Seine Bewertungen bleiben in der Sicherung auf GitHub, werden aber nicht mehr angezeigt.`)) return;
      const i = profiles.list.findIndex(x => x.id === pr.id);
      profiles.list[i] = { ...profiles.list[i], deleted: true, ts: Date.now() };
      if (profiles.current === pr.id) switchProfile(liveProfiles()[0].id);
      saveProfiles(); updateAvatar(); syncNow(true);
      closePage(); const w = pages.at(-1); if (w?.who) renderWho(w); else render();
      return toast('Profil entfernt');
    }
  }
});

function profilesBoot() {
  const logo = $('.topbar .logo');
  if (logo && !$('.avatar')) logo.insertAdjacentHTML('afterend', `<button class="avatar" data-pf="who" aria-label="Profil wechseln"></button>`);
  if (logo) logo.remove();
  updateAvatar();
  if (liveProfiles().length > 1 && profiles.ask) openWho(true);
}
