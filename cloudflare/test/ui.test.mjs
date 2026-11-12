// v8.3 client logic tests (plain-English text, adaptive hints, controls, landscape).
import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyError, friendlyChronicle, SPELL, KEYS, PATH } from '../../web/js/text.js';
import { nextHint, nearest } from '../../web/js/hints.js';
import { cameraRelativeStep, heldVector, joystickVector, planPath, approachTarget } from '../../web/js/controls.js';
import { height, groundY, scatterProps, skyState, WATER_LEVEL, pathDistance } from '../../web/js/world3d.js';
import { readFileSync } from 'node:fs';

test('every server error code has a friendly, jargon-free message', () => {
  const codes = ['unauthorized', 'resource_out_of_reach', 'insufficient_materials', 'rest_requires_nearby_camp', 'target_out_of_reach',
    'password_must_be_12_to_256_characters', 'rate_limited_try_again_later', 'insufficient mana', 'unknown research', 'invalid_rule_atom'];
  for (const c of codes) {
    const m = friendlyError(c);
    assert.ok(!m.includes('_'), c + ' → ' + m);
    assert.ok(!/hypothesis|integrity|ledger|axiom|least fixed point|μΓ|SHA/i.test(m), m);
  }
  assert.match(friendlyError('prerequisites missing: windmill, crystal_lens'), /Windmill and Crystal Lens/);
  assert.match(friendlyError('need 32 research aptitude points; gain XP or practice automation'), /32 invention points.*Automation/);
  assert.match(friendlyError('something_new'), /something new/);
});

test('chronicle lines are rewritten in plain English', () => {
  assert.equal(friendlyChronicle('Crafted healing_potion'), 'Made a healing potion');
  assert.equal(friendlyChronicle('Gathered 3 crystal'), 'Collected 3 crystal 💎');
  assert.equal(friendlyChronicle("Quest completed: The Gatherer's Path"), 'Quest complete! The Collector 🏆');
  assert.equal(friendlyChronicle('Hit Mossfang for 12'), 'Hit Mossfang for 12');
});

test('make-believe labelling is kept for magic and star stories', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /make-believe/i);
  assert.ok(Object.values(SPELL).every((s) => /pretend|make-believe|magic/i.test(s.what)));
  assert.ok(KEYS.some(([k]) => k.startsWith('W A S D')) && PATH.hybrid.name === 'Wizard-Scientist');
});

const basePlayer = () => ({ x: 2, y: 2, health: 100, max_health: 100, hunger: 0, inventory: {}, potions: 0, quests: {}, equipment: { weapon: 'traveller_blade' } });
const baseState = () => ({ tick: 0, entities: [
  { id: 'crystal-01', kind: 'resource', x: 5, y: 4, resource: 'crystal', quantity: 8 },
  { id: 'wood-01', kind: 'resource', x: 8, y: 6, resource: 'wood', quantity: 12 },
  { id: 'stone-01', kind: 'resource', x: 3, y: 8, resource: 'stone', quantity: 10 }],
  creatures: [{ id: 'w', name: 'Mossfang', x: 12, y: 8, hostile: true, alive: true }] });

test('adaptive hints follow what the player has done', () => {
  const state = baseState(), p = basePlayer(), done = new Set();
  assert.equal(nextHint({ signedIn: false, guestBlocked: true, state, player: p, done }).id, 'signup');
  assert.equal(nextHint({ signedIn: true, state, player: p, done }).id, 'move');
  done.add('moved');
  const g = nextHint({ signedIn: true, state, player: p, done });
  assert.equal(g.id, 'gather'); assert.deepEqual([g.target.x, g.target.y], [5, 4]);
  done.add('gathered'); p.inventory = { crystal: 3 };
  assert.equal(nextHint({ signedIn: true, state, player: p, done }).id, 'quest-gather');
  p.quests.gatherer_path = { accepted: true, progress: 3, claimed: false };
  assert.equal(nextHint({ signedIn: true, state, player: p, done }).id, 'potion');
  p.potions = 1; p.inventory = { crystal: 1 };
  const b = nextHint({ signedIn: true, state, player: p, done });
  assert.equal(b.id, 'build-gather'); assert.equal(b.target.label, 'wood');
  p.health = 30;
  assert.equal(nextHint({ signedIn: true, state, player: p, done }).id, 'lowhp-potion');
  p.health = 100; p.hunger = 70;
  assert.equal(nextHint({ signedIn: true, state, player: p, done }).id, 'hungry-build');
  p.hunger = 0;
  const e = nextHint({ signedIn: true, state, player: p, done, lastError: { code: 'resource_out_of_reach', at: 1000 }, now: 2000 });
  assert.equal(e.tone, 'error'); assert.match(e.text, /next to it/);
  assert.equal(nearest(state.entities, { x: 0, y: 9 }).id, 'stone-01');
});

test('camera-relative movement keeps W/A/S/D consistent at every camera angle', () => {
  for (let yaw = -7; yaw < 7; yaw += 0.13) {
    const f = cameraRelativeStep(0, 1, yaw), r = cameraRelativeStep(1, 0, yaw), b = cameraRelativeStep(0, -1, yaw);
    assert.equal(Math.abs(f.dx) + Math.abs(f.dy), 1);
    assert.equal(b.dx + f.dx, 0); assert.equal(b.dy + f.dy, 0);
    assert.equal(Math.abs(f.dx * r.dx + f.dy * r.dy), 0, 'forward ⟂ right at yaw ' + yaw);
  }
  // camera behind the player looking “north” (−z): W = up (−y), D = east (+x)
  assert.deepEqual(cameraRelativeStep(0, 1, 0), { dx: 0, dy: -1 });
  assert.deepEqual(cameraRelativeStep(1, 0, 0), { dx: 1, dy: 0 });
  assert.equal(cameraRelativeStep(0, 0, 1), null);
  // diagonals alternate between the two axes
  const a = cameraRelativeStep(1, 1, 0, false), c = cameraRelativeStep(1, 1, 0, true);
  assert.notDeepEqual(a, c);
  assert.deepEqual(heldVector(new Set(['w', 'd'])), [1, 1]);
  assert.deepEqual(heldVector(new Set(['w', 's'])), [0, 0]);
});

test('touch joystick has a dead zone and clamps the knob', () => {
  assert.deepEqual(joystickVector(3, 2, 50).right, 0);
  const v = joystickVector(0, -100, 50);
  assert.equal(v.forward, 1); assert.deepEqual(v.knob, [0, -50]);
});

test('click-to-move plans a path around shelters and stops beside targets', () => {
  const blocked = (x, y) => x === 3 && y <= 5;
  const path = planPath({ x: 2, y: 2 }, { x: 5, y: 2 }, blocked);
  let x = 2, y = 2;
  for (const s of path) { assert.equal(Math.abs(s.dx) + Math.abs(s.dy), 1); x += s.dx; y += s.dy; assert.ok(!blocked(x, y)); }
  assert.deepEqual([x, y], [5, 2]);
  assert.deepEqual(planPath({ x: 1, y: 1 }, { x: 1, y: 1 }), []);
  assert.equal(planPath({ x: 0, y: 0 }, { x: 70, y: 70 }).length, 126); // clamped to the 64×64 world
  const stand = approachTarget({ x: 2, y: 2 }, { x: 5, y: 4 }, 1);
  assert.equal(Math.abs(stand.x - 5) + Math.abs(stand.y - 4), 1);
  assert.deepEqual(approachTarget({ x: 4, y: 4 }, { x: 5, y: 4 }, 1), { x: 4, y: 4 });
});

test('3D landscape keeps every gameplay spot dry, walkable and clear of trees', () => {
  const spots = [[2, 2], [5, 4], [8, 6], [3, 8], [14, 12], [22, 18], [4, 3], [12, 8], [18, 14], [9, 18]];
  for (const [x, z] of spots) { assert.ok(height(x, z) > WATER_LEVEL + 0.2, `${x},${z}`); assert.ok(pathDistance(x, z) < 6); }
  for (let x = 0; x < 64; x += 3) for (let z = 0; z < 64; z += 3) assert.ok(groundY(x, z) >= WATER_LEVEL - 0.18 && height(x, z) < 6);
  assert.ok(height(-20, 10) < WATER_LEVEL, 'sea to the west'); assert.ok(height(90, 40) > 3, 'hills to the east');
  const props = scatterProps('Aurelia', spots.map(([x, y]) => ({ x, y })));
  assert.ok(props.length > 300);
  assert.deepEqual(props.slice(0, 5), scatterProps('Aurelia', spots.map(([x, y]) => ({ x, y }))).slice(0, 5));
  for (const p of props) for (const [x, z] of spots) assert.ok(Math.hypot(p.x - x, p.z - z) > 2.2);
  assert.equal(skyState(0).label, 'Morning'); assert.ok(skyState(0).day > 0.9); assert.ok(skyState(13).day < 0.1);
  assert.ok(skyState(0, 'mist').fog > skyState(0, 'clear').fog);
});

test('client-side rule checks match the server rules for instant friendly feedback', async () => {
  const { precheck } = await import('../../web/js/rules.js');
  const state = baseState(), p = basePlayer();
  assert.equal(precheck({ type: 'rest' }, state, p), 'rest_requires_nearby_camp');
  assert.equal(precheck({ type: 'drink_potion' }, state, p), 'no_healing_potions');
  assert.equal(precheck({ type: 'craft', recipe: 'healing_potion' }, state, p), 'insufficient_materials');
  assert.equal(precheck({ type: 'gather', target: 'crystal-01' }, state, p), 'resource_out_of_reach');
  assert.equal(precheck({ type: 'attack', target: 'w' }, state, p), 'target_out_of_reach');
  assert.equal(precheck({ type: 'quest', operation: 'claim', quest_id: 'gatherer_path' }, state, p), 'quest_objective_incomplete');
  p.inventory = { crystal: 2, wood: 2, stone: 1 }; p.x = 5; p.y = 3;
  assert.equal(precheck({ type: 'craft', recipe: 'healing_potion' }, state, p), null);
  assert.equal(precheck({ type: 'gather', target: 'crystal-01' }, state, p), null);
  assert.equal(precheck({ type: 'build', recipe: 'campfire' }, state, p), null);
  state.entities.push({ id: 's', kind: 'structure', structure: 'shelter', x: 6, y: 3 });
  assert.equal(precheck({ type: 'move', dx: 1, dy: 0 }, state, p), 'movement_blocked');
  assert.equal(precheck({ type: 'rest' }, state, p), null);
  assert.equal(precheck({ type: 'build', recipe: 'campfire' }, state, { ...p, x: 6 }), 'tile_occupied');
  assert.equal(nextHint({ signedIn: true, state, player: basePlayer(), done: new Set(), touch: true }).text.includes('joystick'), true);
});

test('server and client agree on the game rules (shared engine fixtures)', async () => {
  // Run the real JS engine and compare its verdicts with the client precheck on the same situations.
  const { precheck } = await import('../../web/js/rules.js');
  const { GameRuntime } = await import('../src/runtime.js');
  const { memoryDb } = await import('./helpers.mjs');
  const rt = new GameRuntime(memoryDb());
  const tryBoth = (action) => {
    const before = rt.load('Rules'); const p = before.state.players.kid || { x: 2, y: 2, inventory: {}, potions: 0, health: 100, max_health: 100, quests: {} };
    const local = precheck(action, before.state, p);
    let server = null; try { rt.act('Rules', 'kid', action); } catch (e) { server = e.message; }
    return [local, server];
  };
  rt.act('Rules', 'kid', { type: 'advance' });
  for (const a of [{ type: 'rest' }, { type: 'drink_potion' }, { type: 'craft', recipe: 'healing_potion' }, { type: 'gather', target: 'crystal-01' },
    { type: 'build', recipe: 'campfire' }, { type: 'attack', target: 'moss-wolf-01' }, { type: 'quest', operation: 'claim', quest_id: 'frontier_hunt' }]) {
    const [local, server] = tryBoth(a);
    assert.equal(local, server, JSON.stringify(a));
  }
});
