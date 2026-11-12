import { readFileSync } from 'node:fs';
export const FIX = JSON.parse(readFileSync(new URL('./fixtures/results.json', import.meta.url), 'utf8'));
export const E = (p) => new URL(`../public/js/engine/${p}`, import.meta.url).href;
