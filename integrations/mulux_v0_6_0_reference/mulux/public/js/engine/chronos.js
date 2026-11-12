// μLux — Chronos Clock. FACT: arithmetic. SSR INTERPRETATION: the year as a shared clock. BELIEF: the symbolic epoch.
import { Frac } from './mathx.js';
export const YEARS = { 'tropical (mean, J2000)': 365.24219, 'Gregorian calendar': 365.2425, Julian: 365.25, sidereal: 365.256363, anomalistic: 365.259636 };
export function tritiumRatio(days = '4500', years = '12.32') {
  const q = Frac.parse(days).div(Frac.parse(years));
  return { exact: q.toString(), decimal: q.toNumber(), repeating: q.repeating(),
    vsYears: Object.entries(YEARS).map(([name, v]) => ({ name, days: v, diffDays: q.toNumber() - v, diffMin: (q.toNumber() - v) * 1440 })) };
}
export const bce = (astro) => (astro <= 0 ? `${1 - astro} BCE` : `${astro} CE`);
export function epochs(from = 2026) {
  return [['measured ≈25,772 yr', 25772], ['traditional 25,920 = 72 × 360', 25920], ['rounded 26,000', 26000]]
    .map(([name, P]) => ({ name, period: P, astronomicalYear: from - P, label: bce(from - P), grade: 'BELIEF (chosen commemoration, not dated history)' }));
}
export const precessionPeriod = (rateArcsecPerYr = 50.29) => (360 * 3600) / rateArcsecPerYr;
export const yearsPerDegree = (period) => period / 360;
// Symbolic cadence: 72 bpm → seconds per beat (BELIEF: design rhythm only).
export const beatSeconds = (bpm = 72) => 60 / bpm;
