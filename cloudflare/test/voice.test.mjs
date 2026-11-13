// Strata voice control: deterministic grammar, strict whitelist validation, and Malcolm's structured voice replies (mocked).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, validateActions, DESTRUCTIVE, ACTION_TYPES } from '../../web/js/voicegrammar.js';
import { companion, validate, _resetWindows, voiceFromModel } from '../src/malcolm.js';
import { memoryDb } from './helpers.mjs';

const CASES = [
  ['go north', [{ type: 'move', dir: 'north', steps: 1 }]], ['Hey Malcolm, walk forward three steps!', [{ type: 'move', dir: 'forward', steps: 3 }]],
  ['move left 2', [{ type: 'move', dir: 'left', steps: 2 }]], ['east', [{ type: 'move', dir: 'east', steps: 1 }]], ['run back ten squares', [{ type: 'move', dir: 'back', steps: 10 }]],
  ['go south 99', [{ type: 'move', dir: 'south', steps: 10 }]], ['collect', [{ type: 'gather' }]], ['pick up the wood', [{ type: 'gather' }]], ['attack the wolf', [{ type: 'attack' }]],
  ['rest by the fire', [{ type: 'rest' }]], ['let time pass', [{ type: 'wait' }]], ['drink a potion', [{ type: 'drink' }]],
  ['craft a healing potion', [{ type: 'craft', recipe: 'healing_potion' }]], ['make an axe', [{ type: 'craft', recipe: 'axe' }]], ['forge the crystal sword', [{ type: 'craft', recipe: 'crystal_sabre' }]],
  ['build a campfire', [{ type: 'build', recipe: 'campfire' }]], ['set up a tent', [{ type: 'build', recipe: 'shelter' }]],
  ['open the journal', [{ type: 'open', panel: 'journal' }]], ['show my inventory', [{ type: 'open', panel: 'bag' }]], ['open expedition', [{ type: 'open', panel: 'expedition' }]], ['show the codex page', [{ type: 'open', panel: 'codex' }]],
  ['close', [{ type: 'close' }]], ['adventure mode', [{ type: 'mode', mode: 'adventure' }]], ['switch to the academy mode', [{ type: 'mode', mode: 'academy' }]], ['switch to life lab', [{ type: 'mode', mode: 'lifelab' }]],
  ['reset the camera', [{ type: 'camera', op: 'reset' }]], ['zoom out', [{ type: 'camera', op: 'zoom_out' }]], ['turn camera left', [{ type: 'camera', op: 'left' }]],
  ['graphics ultra', [{ type: 'setting', name: 'quality', value: 'ultra' }]], ['set quality to low', [{ type: 'setting', name: 'quality', value: 'low' }]], ['turn the sound off', [{ type: 'setting', name: 'sound', value: 'off' }]],
  ['turn on voice replies', [{ type: 'setting', name: 'voice_replies', value: 'on' }]], ['wake word on', [{ type: 'setting', name: 'wake_word', value: 'on' }]], ['mute', [{ type: 'setting', name: 'sound', value: 'off' }]],
  ['accept bounty', [{ type: 'accept_bounty' }]], ['claim the bounty', [{ type: 'claim_bounty' }]], ['abandon my bounty', [{ type: 'abandon_bounty' }]],
  ['travel to Frostveil', [{ type: 'travel', realm: 'frostveil' }]], ['talk to Warden Ilsa', [{ type: 'talk', npc: 'ilsa' }]], ['say hello everyone', [{ type: 'say', message: 'hello everyone' }]],
  ['help', [{ type: 'help' }]], ['what can I say', [{ type: 'help' }]], ['sign out', [{ type: 'sign_out' }]], ['stop', [{ type: 'stop' }]],
  ['collect the wood and then craft a potion and then rest', [{ type: 'gather' }, { type: 'craft', recipe: 'healing_potion' }, { type: 'rest' }]],
  ['give me a wizard hat', null], ['make a scientific tool from the lever', null], ['', null], ['blorp', null], ['craft a nuclear bomb', null], ['go north and blorp', null],
];

test('voice grammar: deterministic local parser covers movement, modes, crafting, inventory, building, settings, camera and help', () => {
  for (const [said, want] of CASES) { assert.deepEqual(parseCommand(said), want, said); assert.deepEqual(parseCommand(said), parseCommand(said)); }
  for (const [said, want] of CASES) if (want) { const v = validateActions(want); assert.equal(v.rejected.length, 0, said); }
});

test('voice whitelist: unknown/malformed/hostile actions are dropped; destructive ones need confirmation', () => {
  const v = validateActions([{ type: 'move', dir: 'north', steps: 3 }, { type: 'eval', code: 'x' }, { type: 'move', dir: 'up', steps: 1 }, { type: 'move', dir: 'north', steps: 0 },
    { type: 'setting', name: '__proto__', value: 'on' }]);
  assert.deepEqual(v.actions, [{ type: 'move', dir: 'north', steps: 3 }]);
  assert.deepEqual(v.rejected, ['unknown_action', 'bad_move', 'bad_move', 'bad_setting']);
  const d = validateActions([{ type: 'craft', recipe: 'healing_potion', extra: 1 }, { type: 'abandon_bounty' }, { type: 'sign_out' }]);
  assert.deepEqual(d.actions, [{ type: 'abandon_bounty', confirm: true }, { type: 'sign_out', confirm: true }]); assert.deepEqual(d.rejected, ['bad_craft']);
  assert.equal(validateActions('rm -rf').ok, false);
  assert.equal(validateActions(Array.from({ length: 9 }, () => ({ type: 'gather' }))).actions.length, 5);
  assert.ok(validateActions([{ type: 'customise', appearance: { hat: 4, cape: 3 } }]).ok);
  assert.ok(!validateActions([{ type: 'customise', appearance: { hat: 9 } }]).ok);
  assert.ok(validateActions([{ type: 'invent', category: 'scientific', form: 'tool', principles: ['lever'], materials: { wood: 2 } }]).ok);
  assert.ok(!validateActions([{ type: 'invent', category: 'scientific', form: 'tool', principles: ['lever'], materials: { wood: 99 } }]).ok);
  assert.ok(!validateActions([{ type: 'say', message: 'x'.repeat(500) }]).ok);
  for (const t of DESTRUCTIVE) assert.ok(ACTION_TYPES.includes(t));
});

test('Malcolm voice mode: text only, structured actions validated; offline/guest falls back to the local grammar; unsafe requests do nothing', async () => {
  _resetWindows();
  assert.equal(validate({ mode: 'voice', message: 'hi', audio: 'base64...' }), 'unknown_field', 'audio is never accepted');
  const env = { OGCE_MALCOLM_ENABLED: 'yes', MALCOLM_INFINITY_BOT_TOKEN: 'tok-V' }, db = memoryDb();
  let sent;
  const live = async (u, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ text: '```json\n{"say":"Wizard hat on!","actions":[{"type":"customise","appearance":{"hat":4}},{"type":"delete_world"},{"type":"open","panel":"character"}]}\n```' }), { status: 200 }); };
  const r = await companion({ env, db, fetchImpl: live, account: 'oli', body: { mode: 'voice', message: 'give me a wizard hat and show my character' } });
  assert.equal(r.source, 'malcolm'); assert.equal(r.text, 'Wizard hat on!');
  assert.deepEqual(r.actions, [{ type: 'customise', appearance: { hat: 4 } }, { type: 'open', panel: 'character' }]); assert.deepEqual(r.rejected, ['unknown_action']);
  assert.match(sent.system, /MODE voice/); assert.equal(sent.messages.at(-1).content, 'give me a wizard hat and show my character');
  const prose = await companion({ env, db, fetchImpl: async () => new Response(JSON.stringify({ text: 'Sure! I will open it.' }), { status: 200 }), account: 'oli', body: { mode: 'voice', message: 'open the journal' } });
  assert.deepEqual(prose.actions, [{ type: 'open', panel: 'journal' }], 'unparseable model reply → local grammar');
  const guest = await companion({ env, db, account: null, body: { mode: 'voice', message: 'go north 2' } });
  assert.equal(guest.source, 'offline'); assert.deepEqual(guest.actions, [{ type: 'move', dir: 'north', steps: 2 }]);
  const unknown = await companion({ env: {}, db, account: 'oli', body: { mode: 'voice', message: 'paint the sky purple' } });
  assert.deepEqual(unknown.actions, []); assert.match(unknown.text, /simple voice commands/);
  const unsafe = await companion({ env, db, fetchImpl: live, account: 'oli', body: { mode: 'voice', message: 'I want to kill myself' } });
  assert.equal(unsafe.source, 'safety'); assert.ok(!unsafe.actions?.length);
  assert.deepEqual(voiceFromModel('{"say":"hi","actions":"nope"}', 'x').actions, []);
});
