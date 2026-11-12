// μLux — Proof Ledger worker: runs the 73 thesis checks off the main thread.
import { runDoctrineChecks } from './engine/doctrine.js';
self.onmessage = (e) => {
  const t0 = performance.now();
  const r = runDoctrineChecks({ fast: !!(e.data && e.data.fast) });
  self.postMessage({ CHECKS: r.CHECKS, nPass: r.nPass, nFail: r.nFail, nChecks: r.nChecks, ms: Math.round(performance.now() - t0) });
};
