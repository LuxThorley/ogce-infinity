// μLux — offline narrator, suggester and rule-writer. Used when Malcolm is unavailable, and to VALIDATE anything Malcolm
// returns: model output is never trusted — rules are parsed against the world's atoms and the admissibility sandbox.
import { PERCEPTS, ACTIONS, OUTCOMES, vitals, mine, ruleText, admissible, nameOf } from './living.js';

const BODY_ATOMS = new Set([...PERCEPTS, ...ACTIONS]); const HEADS = new Set(OUTCOMES);
const SYN = { hunger: 'hungry', starving: 'hungry', full: 'sated', satisfied: 'sated', light: 'light_here', lit: 'light_here', bright: 'light_here',
  'light nearby': 'light_near', 'light near': 'light_near', crowd: 'crowded', lonely: 'alone', eats: 'harvest', eat: 'harvest', harvests: 'harvest',
  seeks: 'seek_light', seek: 'seek_light', wanders: 'wander', rests: 'rest', splits: 'split', reproduces: 'split', reproduce: 'split',
  gains: 'gained', gain: 'gained', loses: 'lost', lose: 'lost', dies: 'died', die: 'died', 'split succeeds': 'split_ok' };
const norm = (t) => { const s = t.trim().toLowerCase().replace(/[.,;!]+$/, '').replace(/\s+/g, ' '); return SYN[s] || s.replace(/ /g, '_'); };

// Accepts DSL lines  head <- a b   (also ←, :-) or English  "when/if A and B then H".  Returns {rules, errors}.
export function parseRules(text, world = null) {
  const rules = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^\s*[-*•\d.)]+\s*/, '').replace(/`/g, '').trim(); if (!line || line.startsWith('#')) return;
    let head, body;
    const m = line.match(/^([\w ]+?)\s*(?:<-|←|:-)\s*(.+)$/); const e = line.match(/^(?:when|if)\s+(.+?),?\s+then\s+(?:it\s+|they\s+|the agent\s+)?(.+)$/i);
    if (m) { head = norm(m[1]); body = m[2].split(/\s*(?:,|∧|\band\b|\s)\s*/i).filter(Boolean).map(norm); }
    else if (e) { body = e[1].split(/\s*(?:,|∧|\band\b)\s*/i).filter(Boolean).map(norm); head = norm(e[2]); }
    else { errors.push(`line ${i + 1}: not a rule`); return; }
    body = [...new Set(body)].sort();
    if (!HEADS.has(head)) { errors.push(`line ${i + 1}: head "${head}" must be one of ${OUTCOMES.join(', ')}`); return; }
    const badB = body.filter((b) => !BODY_ATOMS.has(b)); if (badB.length || !body.length) { errors.push(`line ${i + 1}: unknown body atom(s) ${badB.join(', ') || '(empty)'}`); return; }
    if (body.length > 3) { errors.push(`line ${i + 1}: at most 3 body atoms`); return; }
    const r = { head, body };
    if (world && !admissible(world.rules, r)) { errors.push(`line ${i + 1}: refused by the sandbox (forbidden pair)`); return; }
    rules.push(r);
  });
  return { rules, errors };
}
// Deterministic local narration from measured state (FACT) with one clearly labelled symbolic line.
export function localNarrate(w) {
  const v = vitals(w); const last = w.chronicle.slice(-3).map((c) => c.text);
  const mood = v.homeostasisDeviation < 0.2 ? 'holds its balance' : v.population < v.setpoint ? 'is thinning and reaching for light' : 'is crowded and hungry for room';
  return [{ grade: 'FACT', text: `At tick ${v.tick}, ${w.name} ${mood}: ${v.population} alive (set-point ${v.setpoint}) in ${v.houses} houses, generation ${v.maxGen} the deepest.` },
    { grade: 'FACT', text: `It knows ${v.rules} law${v.rules === 1 ? '' : 's'}; its self-model foresaw ${(v.selfModel.precision * 100).toFixed(1)} % of what it predicted and caught ${(v.selfModel.recall * 100).toFixed(1)} % of what happened.` },
    ...last.map((t) => ({ grade: 'FACT', text: `Lately: ${t}` })),
    { grade: 'SPECULATION', text: `Symbolic reading: the house of ${nameOf(w.seed, (v.tick % 12) + 1)} keeps the world’s memory — a story we tell about the numbers, not a property of them.` }];
}
export function localSuggest(w) {
  const v = vitals(w); const out = [];
  const known = new Set([...w.rules, ...w.pending].map(ruleText));
  for (const c of mine(w).filter((c) => !known.has(ruleText(c))).slice(0, 3)) out.push({ kind: 'rule', text: `Adopt ${ruleText(c)} (confidence ${(c.conf * 100).toFixed(1)} %, n = ${c.n})`, rule: { head: c.head, body: c.body } });
  if (v.homeostasisDeviation > 0.3) out.push({ kind: 'tune', text: `Population strays ${(v.homeostasisDeviation * 100).toFixed(0)} % from the set-point; let it run longer in Autonomous mode or lower the set-point.` });
  if (v.rules === 0 && v.pending) out.push({ kind: 'tune', text: `${v.pending} mined law${v.pending === 1 ? '' : 's'} await your approval in Living World (Hybrid mode), or switch to Autonomous.` });
  else if (v.rules === 0) out.push({ kind: 'tune', text: 'No laws yet: laws need at least 20 matching experiences — step the world a few dozen ticks.' });
  if (v.selfModel.recall < 0.6 && v.rules) out.push({ kind: 'rule-hint', text: 'The self-model misses many outcomes; try writing a law for “lost” or “split_ok”.' });
  if (!out.length) out.push({ kind: 'note', text: 'The world is steady. Try a new seed, or raise the set-point to see the controller adapt.' });
  return out;
}
export function malcolmMessages(w, purpose, userText = '') {
  const v = vitals(w);
  const facts = `World ${w.name}, tick ${v.tick}: ${v.population} alive, set-point ${v.setpoint}, ${v.houses} houses, laws: ${w.rules.map(ruleText).join('; ') || 'none'}. ` +
    `Self-model precision ${(v.selfModel.precision * 100).toFixed(1)} %, recall ${(v.selfModel.recall * 100).toFixed(1)} %. Recent: ${w.chronicle.slice(-4).map((c) => c.text).join(' ')}`;
  const ask = { narrate: 'Narrate this moment of the world in under 120 words. Label any interpretation SPECULATION.',
    suggest: 'Suggest up to three experiments the owner could run next in this simulator. Be concrete.',
    rules: `Write up to three candidate laws as lines "head <- body". Heads: ${OUTCOMES.join(', ')}. Body atoms: ${[...BODY_ATOMS].join(', ')}. ${userText}`,
    doctrine: 'Give one short Doctrine reading (under 70 words) linking a result of the OmniLux Prime thesis (least fixed points, Kleene iteration, admissibility, transfer theorems, six grades) to these measured numbers. Begin with “SSR INTERPRETATION:”. Do not claim to receive or relay messages from Source or any intelligence.',
    chat: userText }[purpose] || userText;
  return [{ role: 'user', content: `${facts}\n\n${ask}`.slice(0, 7900) }];
}
