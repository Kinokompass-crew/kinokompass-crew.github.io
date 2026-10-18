'use strict';
/* ════════════ Kinokompass – Chat unter Filmen & Eingang ════════════
   Unterhaltung je Titel. Mit Freunden verbunden: im gemeinsamen Repo (chat/<key>.json), sonst nur auf diesem Gerät
   (kino.chat – z. B. zwischen „Ich“ und „Finn“). @Erwähnungen: Freunde per @login oder @name → <login>/erwaehnungen.json,
   Profile auf diesem Gerät per @name → kino.mentions.<profilId>. Spoiler-Nachrichten sind verdeckt, bis man den Titel
   selbst bewertet hat oder sie antippt.
   📬 Eingang (Glocke oben): Nachrichten (Erwähnungen), Empfehlungen, Reaktionen, Hinweise – alles an einem Ort. */

const localChat = () => { try { return JSON.parse(localStorage.getItem('kino.chat')) || {}; } catch (_) { return {}; } };
const mentionKey = pid => 'kino.mentions.' + pid;
const readMentions = pid => { try { return JSON.parse(localStorage.getItem(mentionKey(pid))) || []; } catch (_) { return []; } };
const remoteChat = () => frReady();
const me = () => ({ from: remoteChat() ? fr.login : 'local:' + profiles.current, name: curProfile().name, emoji: curProfile().emoji, pid: profiles.current });

// Wer lässt sich erwähnen? Freunde (login + Name) und Profile auf diesem Gerät
function mentionTargets() {
  const t = [];
  if (remoteChat()) for (const m of fr.members) t.push({ handle: m.login.toLowerCase(), alt: (m.name || '').toLowerCase().replace(/\s+/g, ''), label: `${m.emoji || '🙂'} ${m.name || m.login}`, login: m.login });
  for (const p of liveProfiles()) if (!t.some(x => x.alt === p.name.toLowerCase().replace(/\s+/g, ''))) t.push({ handle: p.name.toLowerCase().replace(/\s+/g, ''), alt: '', label: `${p.emoji} ${p.name}`, pid: p.id });
  return t;
}
const findMentions = text => { const tg = mentionTargets(); return [...new Set((text.match(/@([\wäöüß.-]+)/gi) || []).map(x => x.slice(1).toLowerCase()))].map(h => tg.find(t => t.handle === h || t.alt === h)).filter(Boolean); };
const mentionHtml = text => esc(text).replace(/@([\wäöüß.-]+)/gi, '<b class="mention">@$1</b>');

async function loadChat(key) {
  if (!remoteChat()) return localChat()[key] || [];
  try { const { json } = await frGet(`chat/${key}.json`); return json?.list || []; } catch (_) { return []; }
}
async function sendChat(key, text, spoiler) {
  const b = lookup(key), m = me();
  const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), from: m.from, name: m.name, emoji: m.emoji, text: text.trim().slice(0, 500), spoiler: !!spoiler, ts: Date.now() };
  if (remoteChat()) await frUpdate(`chat/${key}.json`, j => ({ title: b?.title || '', list: [...(j?.list || []), msg].slice(-200) }), 'Kinokompass: Chat');
  else { const all = localChat(); all[key] = [...(all[key] || []), msg].slice(-200); localStorage.setItem('kino.chat', JSON.stringify(all)); }
  chLog('chat'); setTimeout(checkWeekDone, 300);
  // Erwähnungen zustellen
  const note = { id: msg.id, from: m.from, fromName: m.name, fromEmoji: m.emoji, key, title: b?.title || '', poster: b?.poster || '', kind: b?.kind || 'movie', text: msg.text, spoiler: msg.spoiler, ts: msg.ts };
  for (const t of findMentions(text)) {
    if (t.login && t.login !== fr.login) await frUpdate(`${t.login}/erwaehnungen.json`, j => ({ list: [note, ...(j?.list || [])].slice(0, 200) }), `Kinokompass: Erwähnung für ${t.login}`).catch(() => { });
    else if (t.pid && t.pid !== profiles.current) { const l = readMentions(t.pid); l.unshift(note); localStorage.setItem(mentionKey(t.pid), JSON.stringify(l.slice(0, 200))); }
  }
  return msg;
}

/* ─── Bereich in den Details ─── */
function chatSection(d) {
  return `<div class="chat" data-chatbox="${d.key}"><h3 class="sec">💬 Unterhaltung ${remoteChat() ? '' : '<span class="muted small">(nur auf diesem Gerät)</span>'}</h3>
    <div class="chat-list"><div class="loading-note">lädt …</div></div>
    <div class="chat-input"><textarea class="input" rows="1" maxlength="500" placeholder="Schreib was … (@name erwähnt jemanden)" data-chatin="${d.key}"></textarea>
      <div class="chat-sugg"></div>
      <div class="chat-acts"><label class="switch-row"><input type="checkbox" class="chat-spoiler"><span>⚠️ Spoiler</span></label><button class="btn primary" data-chatsend="${d.key}">Senden</button></div></div></div>`;
}
async function fillChat(p) {
  const box = p.body.querySelector('[data-chatbox] .chat-list'); if (!box) return;
  const key = p.item.key, list = await loadChat(key);
  if (!p.body.contains(box)) return;
  const mine = me().from, rated = !!data.films[key];
  box.innerHTML = list.length ? list.map(m => `<div class="msg ${m.from === mine ? 'own' : ''}"><div class="msg-head">${m.emoji || '🙂'} <b>${esc(m.name || m.from)}</b> <span class="muted small">${ago(m.ts)}</span></div>
      <div class="msg-text ${m.spoiler && !rated && m.from !== mine ? 'spoiler' : ''}" title="${m.spoiler ? 'Spoiler – antippen zum Aufdecken' : ''}">${mentionHtml(m.text)}</div></div>`).join('')
    : `<div class="small muted">Noch keine Nachrichten. Schreib als Erste${remoteChat() ? ' – deine Freunde sehen es hier' : ''}!</div>`;
  p.chatCount = list.length;
}
// @-Vorschläge beim Tippen
document.addEventListener('input', e => {
  const ta = e.target.closest('[data-chatin]'); if (!ta) return;
  ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
  const sugg = ta.parentElement.querySelector('.chat-sugg');
  const m = ta.value.slice(0, ta.selectionStart).match(/@([\wäöüß.-]*)$/i);
  if (!m) { sugg.innerHTML = ''; return; }
  const q = m[1].toLowerCase();
  sugg.innerHTML = mentionTargets().filter(t => t.handle.startsWith(q) || t.alt.startsWith(q)).slice(0, 6).map(t => `<button class="chip" data-mention="${esc(t.handle)}">${esc(t.label)} <span class="muted">@${esc(t.handle)}</span></button>`).join('');
});
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-mention],[data-chatsend],.msg-text.spoiler,[data-eing]'); if (!t) return;
  if (t.matches('.msg-text.spoiler')) { t.classList.remove('spoiler'); return; }
  if (t.dataset.mention) {
    const ta = t.closest('.chat-input').querySelector('textarea'), pos = ta.selectionStart;
    const before = ta.value.slice(0, pos).replace(/@([\wäöüß.-]*)$/i, '@' + t.dataset.mention + ' ');
    ta.value = before + ta.value.slice(pos); ta.focus(); ta.selectionStart = ta.selectionEnd = before.length;
    t.parentElement.innerHTML = ''; return;
  }
  if (t.dataset.chatsend) {
    const box = t.closest('.chat-input'), ta = box.querySelector('textarea'), text = ta.value.trim(); if (!text) return;
    t.disabled = true;
    try { const n = findMentions(text).length; await sendChat(t.dataset.chatsend, text, box.querySelector('.chat-spoiler').checked); ta.value = ''; ta.style.height = ''; vib('success'); if (n) toast(`📬 ${n} Person${n > 1 ? 'en' : ''} benachrichtigt`); const p = pages.at(-1); if (p?.item) fillChat(p); }
    catch (err) { toast('Senden fehlgeschlagen: ' + err.message); }
    t.disabled = false; return;
  }
  if (t.dataset.eing) { const p = pages.at(-1); p.tab = t.dataset.eing; return renderEingang(p); }
});
// Offene Unterhaltung alle 20 s auffrischen
setInterval(() => { const p = pages.at(-1); if (p?.item && document.visibilityState === 'visible' && remoteChat() && !p.body.querySelector('[data-chatin]:focus')) fillChat(p); }, 20000);

/* ─── 📬 Eingang ─── */
const myMentions = () => [...(remoteChat() ? fr.mentions || [] : []), ...readMentions(profiles.current)].sort((a, b) => b.ts - a.ts);
const eingSeenKey = () => 'kino.eingseen.' + profiles.current;
const eingSeen = () => +(localStorage.getItem(eingSeenKey()) || 0);
function eingangUnread() {
  const s = eingSeen();
  return myMentions().filter(x => x.ts > s).length + (alerts.feed || []).filter(a => a.ts > (alerts.seen || 0)).length + (frReady() ? newInbox().length + newReactions().length : 0);
}
function openEingang() { const p = openPage('📬 Eingang'); p.eing = true; p.tab = myMentions().some(x => x.ts > eingSeen()) || !alerts.feed?.length ? 'nachr' : 'hinw'; renderEingang(p); }
function renderEingang(p) {
  const ment = myMentions(), recs = frReady() ? fr.inbox : [], reacts = frReady() ? fr.reactions : [], hints = alerts.feed || [];
  const tabs = [['nachr', `💬 Nachrichten (${ment.length})`], ['empf', `📨 Empfehlungen (${recs.length})`], ['reak', `❤️ Reaktionen (${reacts.length})`], ['hinw', `🔔 Hinweise (${hints.length})`]];
  const seen = eingSeen();
  const card = (x, body) => `<div class="card eing ${x.ts > seen ? 'new' : ''}" data-open="${x.key}">${x.poster ? posterImg(x, 'w92') : ''}<div class="eing-main">${body}<div class="muted small">${ago(x.ts)}</div></div></div>`;
  const content = {
    nachr: ment.map(x => card(x, `<div>${esc(x.fromEmoji || '🙂')} <b>${esc(x.fromName || x.from)}</b> hat dich bei <b>${esc(x.title)}</b> erwähnt:</div><div class="msg-text ${x.spoiler && !data.films[x.key] ? 'spoiler' : ''}">${mentionHtml(x.text)}</div>`)).join(''),
    empf: recs.map(x => card(x, `<div>${esc(x.fromEmoji || '🙂')} <b>${esc(x.fromName || x.from)}</b> empfiehlt dir <b>${esc(x.title)}</b></div>${x.text ? `<div class="msg-text">„${esc(x.text)}“</div>` : ''}`)).join(''),
    reak: reacts.map(x => card(x, `<div>${esc(x.fromEmoji || '🙂')} <b>${esc(x.fromName || x.from)}</b> ${x.emoji} deine Bewertung von <b>${esc(x.title)}</b></div>`)).join(''),
    hinw: hints.map(a => `<div class="card eing ${a.ts > (alerts.seen || 0) ? 'new' : ''}" ${a.key ? `data-open="${a.key}"` : ''}><div class="eing-main"><div>${esc(a.msg)}</div><div class="muted small">${ago(a.ts)}</div></div></div>`).join('') + `<button class="btn wide" data-xact="checknow">Jetzt prüfen</button>`
  }[p.tab];
  p.body.innerHTML = `<div class="chips eing-tabs">${tabs.map(([k, l]) => `<button class="chip ${p.tab === k ? 'on' : ''}" data-eing="${k}">${l}</button>`).join('')}</div>
    ${content || `<div class="empty">Hier ist noch nichts.${p.tab === 'nachr' ? '<br><span class="small">Wenn dich jemand im Chat unter einem Film mit @ erwähnt, landet es hier.</span>' : ''}</div>`}`;
  // gelesen
  localStorage.setItem(eingSeenKey(), String(Date.now())); alerts.seen = Date.now(); fr.seenInbox = Date.now(); fr.seenReact = Date.now(); saveFr(); saveAlerts(); updateFriendBadge?.();
}
