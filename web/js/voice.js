// Strata voice control (Web Speech API, £0). Push-to-talk (hold V or the 🎙️ button), optional wake word ("Malcolm …"),
// live captions, a typed-command fallback, confirmation for destructive actions and optional spoken replies.
// While you're talking with an NPC, what you say goes to that character instead (say “command …” to give a game command).
// NPCs answer through speechSynthesis with their own browser voice, pitch and rate (no paid voices), always with captions.
// Audio never leaves the browser's speech service and is never recorded or stored by the game; only the transcript text is used.
import { parseCommand, validateActions, VOICE_HELP } from './voicegrammar.js';

const $ = (id) => document.getElementById(id);
/** Backoff for restarting wake-word recognition after it ends (pure; unit-tested): 0.4 s, 0.8 s, 1.6 s … capped at 8 s. */
export function restartDelay(n) { return Math.min(8000, 400 * Math.pow(2, Math.max(0, Math.min(5, n | 0)))); }
export function initVoice(ctx) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(SR), synth = window.speechSynthesis;
  let rec = null, listening = false, restarts = 0, lastErr = null, ptt = false, wake = ctx.store.get('wake', false), speakOn = ctx.store.get('speak', false), last = null, pendingConfirm = null;
  const cap = $('captions'), capText = $('caption-text'), btn = $('voicebtn');
  $('voice-help').innerHTML = VOICE_HELP.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  if (!supported) { btn.title = 'Voice isn’t supported in this browser; type a command instead (press /)'; $('voice-support').textContent = 'Speech recognition is not available in this browser, so use the typed command box (press / ). Everything voice can do works there too.'; }

  function caption(text, kind = 'heard') { cap.classList.remove('hidden'); cap.dataset.kind = kind; capText.textContent = text; clearTimeout(caption.t); if (kind !== 'live') caption.t = setTimeout(() => { if (!listening) cap.classList.add('hidden'); }, 5000); }
  function speak(text) { if (!speakOn || !synth || !text) return; try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-GB'; u.rate = 1.02; synth.speak(u); } catch { /* ignore */ } }
  function reply(text) { caption(text, 'reply'); speak(text); ctx.announce?.(text); }
  // ---- NPC voices: distinct browser voice, pitch and rate per character ----
  let npcVoiceOn = ctx.store.get('npcvoice', true);
  const FEMALE = /female|woman|samantha|victoria|karen|moira|tessa|fiona|serena|kate|susan|zira|hazel|libby|sonia|mia|emma|amy|catherine|martha/i;
  const MALE = /\bmale|\bman\b|daniel|alex|fred|george|arthur|oliver|ryan|thomas|david|mark|james|guy|rishi|aaron/i;
  const hash = (t) => { let h = 2166136261; for (const ch of t) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  function pickVoice(id, profile) {
    const all = synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
    if (!all.length) return null;
    const local = all.filter((v) => v.lang.replace('_', '-').toLowerCase() === (profile.lang || 'en-GB').toLowerCase());
    const pool0 = local.length ? local : all;
    const g = profile.gender === 'f' ? pool0.filter((v) => FEMALE.test(v.name)) : profile.gender === 'm' ? pool0.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name)) : pool0;
    const pool = g.length ? g : pool0;
    return pool[hash(id) % pool.length];
  }
  function speakAs(id, profile, name, text) {
    caption(`🎭 ${name}: ${text}`, 'reply'); ctx.announce?.(`${name} says: ${text}`);
    if (!npcVoiceOn || !synth || !text) return;
    try { synth.cancel(); const u = new SpeechSynthesisUtterance(text); const v = pickVoice(id, profile || {}); if (v) u.voice = v; u.lang = v?.lang || profile?.lang || 'en-GB'; u.pitch = Math.max(0.1, Math.min(2, profile?.pitch ?? 1)); u.rate = Math.max(0.5, Math.min(1.5, profile?.rate ?? 1)); synth.speak(u); } catch { /* ignore */ }
  }

  function start(mode) {
    if (!supported) { openTyped(); return; }
    if (listening) return;
    rec = new SR(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = mode === 'wake'; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      restarts = 0; let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += t; else interim += t; }
      if (interim) caption(`🎙️ ${interim}`, 'live');
      if (final) {
        if (mode === 'wake') { const m = final.trim().match(/^(?:hey |ok |okay )?(malcolm|strata)[,.!\s]*(.*)$/i); if (m && m[2]) handle(m[2]); else if (m) caption('🎙️ Yes? Say a command.', 'live'); }
        else handle(final);
      }
    };
    rec.onerror = (e) => { lastErr = e.error; if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { reply('Microphone permission was refused. You can type commands instead (press /).'); wake = false; ctx.store.set('wake', false); syncUi(); } listening = false; btn.classList.remove('on'); };
    // Auto-restart: browsers end recognition after silence, on tab switches ('aborted'), or on network/audio glitches.
    // Wake-word mode restarts with backoff; push-to-talk restarts while the key/button is still held.
    rec.onend = () => {
      listening = false; btn.classList.remove('on');
      if (lastErr === 'not-allowed' || lastErr === 'service-not-allowed') return;
      const delay = restartDelay(restarts++); lastErr = null;
      if (ptt && mode === 'ptt') setTimeout(() => ptt && start('ptt'), 150);
      else if (wake && !ptt) setTimeout(() => wake && start('wake'), delay);
    };
    try { rec.start(); listening = true; btn.classList.add('on'); caption(mode === 'wake' ? '🎙️ Listening for “Malcolm …”' : '🎙️ Listening…', 'live'); } catch { listening = false; }
  }
  function stop() { try { rec?.stop(); } catch { /* ignore */ } }
  // Coming back to the tab (or the window regaining focus) re-arms wake-word listening if the browser stopped it.
  const rearm = () => { if (document.visibilityState === 'visible' && wake && !ptt && !listening && supported) { restarts = 0; start('wake'); } };
  document.addEventListener('visibilitychange', rearm); window.addEventListener('focus', rearm); window.addEventListener('pageshow', rearm);

  async function handle(text) {
    text = String(text || '').trim(); if (!text) return;
    caption(`“${text}”`, 'heard');
    if (pendingConfirm) { const yes = /^(yes|yeah|yep|confirm|do it|sure|ok|okay)\b/i.test(text); const p = pendingConfirm; pendingConfirm = null; $('vconfirm').classList.add('hidden'); if (yes) await run([p], true); else reply('Cancelled.'); return; }
    if (ctx.inConversation?.()) {
      const esc = text.match(/^(?:command|malcolm)[,.:\s]+(.+)$/i);
      if (/^(stop talking|end (the )?conversation|leave (the )?conversation|close (the )?chat|exit)\b/i.test(text)) { ctx.endConversation(); reply('Conversation ended.'); return; }
      if (!esc) { await ctx.converse(text); return; }
      text = esc[1];
    }
    let actions = parseCommand(text), via = 'local', say = '';
    if (!actions) {
      try { const d = await ctx.api('POST', `/api/v90/malcolm${ctx.isGuest() ? `?player=${encodeURIComponent(ctx.playerId())}` : ''}`, { mode: 'voice', message: text.slice(0, 600) }); actions = d.actions || []; say = d.text; via = d.source; }
      catch { actions = []; say = 'I couldn’t reach Malcolm. Try a simple command like “open journal”.'; }
    }
    const v = validateActions(actions);
    if (!v.actions.length) { reply(say || 'Sorry, I didn’t understand that. Say “help” for ideas.'); return; }
    last = v.actions; await run(v.actions); if (say && via !== 'local') reply(say);
  }
  async function run(actions, confirmed = false) {
    for (const a of actions) {
      if (a.type === 'repeat') { if (last) await run(last.filter((x) => x.type !== 'repeat')); continue; }
      if (a.type === 'stop') { stop(); reply('Stopped.'); continue; }
      if (a.type === 'help') { $('help').classList.remove('hidden'); reply('Here are some things you can say.'); continue; }
      if (a.type === 'setting' && a.name === 'voice_replies') { speakOn = a.value === 'on'; ctx.store.set('speak', speakOn); syncUi(); reply(`Spoken replies ${a.value}.`); continue; }
      if (a.type === 'setting' && a.name === 'wake_word') { setWake(a.value === 'on'); continue; }
      if (a.confirm && !confirmed) { askConfirm(a); return; }
      try { const msg = await ctx.execute(a); if (msg) reply(msg); } catch (e) { reply(ctx.friendly(e.message || 'That didn’t work.')); }
    }
  }
  const CONFIRM_TEXT = { abandon_bounty: 'drop your current bounty', sign_out: 'sign out', reset_settings: 'reset all settings', new_genesis: 'begin New Genesis (realm progress restarts; your Codex carries over)' };
  function askConfirm(a) {
    pendingConfirm = a; $('vconfirm-text').textContent = `Are you sure you want to ${CONFIRM_TEXT[a.type] || a.type}? Say “yes” or press Confirm.`; $('vconfirm').classList.remove('hidden'); speak($('vconfirm-text').textContent); $('vconfirm-yes').focus();
  }
  $('vconfirm-yes').onclick = () => { const p = pendingConfirm; pendingConfirm = null; $('vconfirm').classList.add('hidden'); if (p) run([p], true); };
  $('vconfirm-no').onclick = () => { pendingConfirm = null; $('vconfirm').classList.add('hidden'); reply('Cancelled.'); };

  // typed fallback (always available; essential where speech is unsupported)
  function openTyped() { $('cmdbox').classList.remove('hidden'); $('cmdinput').focus(); }
  $('cmdbox').onsubmit = (e) => { e.preventDefault(); const t = $('cmdinput').value; $('cmdinput').value = ''; $('cmdbox').classList.add('hidden'); handle(t); };
  $('cmdinput').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('cmdbox').classList.add('hidden'); e.stopPropagation(); } });

  // push-to-talk button: press and hold (pointer or keyboard), or click to toggle
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); ptt = true; if (!supported) return openTyped(); if (wake) stop(); start('ptt'); });
  const release = () => { if (!ptt) return; ptt = false; setTimeout(stop, 250); };
  btn.addEventListener('pointerup', release); btn.addEventListener('pointerleave', release);
  btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); listening ? stop() : start('ptt'); } });
  function setWake(on) { wake = on && supported; ctx.store.set('wake', wake); syncUi(); if (wake) { start('wake'); reply('Wake word on. Say “Malcolm” then your command.'); } else { stop(); reply('Wake word off.'); } }
  function syncUi() { $('opt-wake').checked = wake; $('opt-speak').checked = speakOn; $('opt-wake').disabled = !supported; }
  const onv = $('opt-npcvoice'); if (onv) { onv.checked = npcVoiceOn; onv.onchange = () => { npcVoiceOn = onv.checked; ctx.store.set('npcvoice', npcVoiceOn); if (!npcVoiceOn) synth?.cancel(); }; }
  $('opt-wake').onchange = () => setWake($('opt-wake').checked); $('opt-speak').onchange = () => { speakOn = $('opt-speak').checked; ctx.store.set('speak', speakOn); };
  syncUi(); if (wake) setTimeout(() => start('wake'), 1200);

  return {
    supported, handle, run, speakAs, listen() { if (!supported) { openTyped(); return; } listening ? stop() : start('ptt'); }, get listening() { return listening; },
    keyDown(e) { if (e.key === 'v' && !e.repeat && !ptt) { ptt = true; if (!supported) { openTyped(); return true; } if (wake) stop(); start('ptt'); return true; } if (e.key === '/') { e.preventDefault(); openTyped(); return true; } return false; },
    keyUp(e) { if (e.key === 'v') { release(); return true; } return false; },
  };
}
