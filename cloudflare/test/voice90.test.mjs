import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, validateActions, DESTRUCTIVE } from '../../web/js/voicegrammar.js';

const first = (t) => { const r = parseCommand(t); return (r.actions || r)[0] || null; };

test('v9.0 voice: camera refinement phrases map to rig ops', () => {
  const cases = { 'zoom out': 'zoom_out', 'zoom in': 'zoom_in', 'look from above': 'from_above', 'reset camera': 'reset', 'first person': 'first', 'third person': 'third', 'recenter camera': 'recenter' };
  for (const [say, op] of Object.entries(cases)) { const a = first(say); assert.ok(a, say); assert.equal(a.type, 'camera', say); assert.equal(a.op, op, say); }
});

test('v9.0 voice: combat, progress panel and New Genesis (destructive, needs confirmation)', () => {
  assert.deepEqual(first('heavy attack') && first('heavy attack').type, 'combat');
  assert.equal(first('dodge').op, 'dodge');
  assert.equal(first('open progress').panel, 'progress');
  assert.equal(first('show my combat skills').panel, 'combat');
  const g = first('new genesis'); assert.equal(g.type, 'new_genesis'); assert.ok(DESTRUCTIVE.has('new_genesis'));
  const v = validateActions([{ type: 'camera', op: 'from_above' }, { type: 'combat', op: 'nuke' }, { type: 'camera', op: 'x' }]);
  assert.equal(v.actions.length, 1); assert.equal(v.actions[0].op, 'from_above'); assert.equal(v.rejected.length, 2);
});
