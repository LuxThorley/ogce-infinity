// Pure input helpers: camera-relative movement, joystick maths and click-to-move path planning.

/**
 * Convert an input vector (right, forward) into one cardinal world step, relative to camera yaw.
 * Snaps to the nearest of the four directions (rotation-consistent, so W/A/S/D always stay at right angles).
 * For diagonal input, `alt` alternates between the two neighbouring directions so the explorer walks diagonally.
 */
const DIRS = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }];
export function cameraRelativeStep(right, forward, yaw, alt = false) {
  if (!right && !forward) return null;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // camera forward on the ground
  const rx = -fz, rz = fx;                          // camera right
  const wx = right * rx + forward * fx, wz = right * rz + forward * fz;
  if (Math.abs(wx) < 1e-9 && Math.abs(wz) < 1e-9) return null;
  const q = Math.atan2(wz, wx) / (Math.PI / 2);
  const diagonal = right !== 0 && forward !== 0;
  const idx = diagonal ? (alt ? Math.ceil(q) : Math.floor(q)) : Math.round(q);
  return { ...DIRS[((idx % 4) + 4) % 4] };
}

export const KEY_VECTORS = {
  w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1],
  a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
};
/** Combine currently held keys into an input vector. */
export function heldVector(held) {
  let r = 0, f = 0;
  for (const k of held) { const v = KEY_VECTORS[k]; if (v) { r += v[0]; f += v[1]; } }
  return [Math.sign(r), Math.sign(f)];
}

/** Joystick: knob offset (px) → input vector with a dead zone; also returns clamped knob position. */
export function joystickVector(dx, dy, radius, dead = 0.28) {
  const len = Math.hypot(dx, dy), k = len > radius ? radius / len : 1;
  const kx = dx * k, ky = dy * k, mag = Math.min(1, len / radius);
  if (mag < dead) return { right: 0, forward: 0, knob: [kx, ky] };
  return { right: kx / radius, forward: -ky / radius, knob: [kx, ky] };
}

/** Breadth-first path on the 64×64 world grid avoiding blocked tiles. Returns [{dx,dy},…] or null. */
export function planPath(from, to, isBlocked = () => false, size = 64, maxNodes = 4096) {
  const clamp = (v) => Math.max(0, Math.min(size - 1, Math.round(v)));
  const sx = clamp(from.x), sy = clamp(from.y), tx = clamp(to.x), ty = clamp(to.y);
  if (sx === tx && sy === ty) return [];
  const key = (x, y) => y * size + x, prev = new Map([[key(sx, sy), -1]]), q = [[sx, sy]];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < q.length && prev.size < maxNodes; i++) {
    const [x, y] = q[i];
    // prefer the axis with the larger remaining distance, so paths look natural
    const order = Math.abs(tx - x) >= Math.abs(ty - y) ? dirs : [dirs[2], dirs[3], dirs[0], dirs[1]];
    for (const [dx, dy] of order) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || prev.has(key(nx, ny))) continue;
      if (isBlocked(nx, ny) && !(nx === tx && ny === ty)) continue;
      prev.set(key(nx, ny), key(x, y));
      if (nx === tx && ny === ty) {
        const steps = []; let k = key(nx, ny);
        while (prev.get(k) !== -1) { const pk = prev.get(k); steps.push({ dx: (k % size) - (pk % size), dy: Math.floor(k / size) - Math.floor(pk / size) }); k = pk; }
        return steps.reverse();
      }
      q.push([nx, ny]);
    }
  }
  return null;
}

/** Where to stand to use something: adjacent tile (gather needs ≤1, attack ≤2). */
export function approachTarget(from, target, reach) {
  const d = Math.abs(from.x - target.x) + Math.abs(from.y - target.y);
  if (d <= reach) return { x: from.x, y: from.y };
  const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
    .filter((o) => o.x >= 0 && o.y >= 0 && o.x < 64 && o.y < 64);
  options.sort((a, b) => (Math.abs(a.x - from.x) + Math.abs(a.y - from.y)) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)));
  return options[0] || target;
}
