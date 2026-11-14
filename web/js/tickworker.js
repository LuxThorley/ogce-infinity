// Background-safe ticker: timers inside a dedicated worker are not throttled like page timers in a hidden tab,
// so the soundtrack scheduler and WebSocket keepalive keep running when the tab is switched or minimised.
const timers = new Map();
self.onmessage = (e) => {
  const { op, id, ms } = e.data || {};
  if (op === 'start') { clearInterval(timers.get(id)); timers.set(id, setInterval(() => self.postMessage({ id }), Math.max(20, ms | 0))); }
  else if (op === 'stop') { clearInterval(timers.get(id)); timers.delete(id); }
};
