# OmniGenesis Sovereign Ascension Nexus — source ZIP inspection

Archive: `OmniGenesis_Sovereign_Ascension_Nexus.zip`  
Top-level application: static HTML/CSS/JavaScript, plus an optional Cloudflare Pages Function.

## Files
- `index.html`: dashboard, ten-core grid, token forge and console UI.
- `css/omni-core.css`: visual system.
- `js/omni-core.js`: Matrix state, module catalogue, canned responses, local interaction handlers.
- `js/token-engine.js`: browser token generator.
- `functions/api/token.js`: demonstration Pages Function.
- `package.json`, `wrangler.toml`, `README.md`.

## Actual behaviour observed in source
- Ten named cores are defined and initially engaged.
- The `Matrix` object is local JavaScript state.
- Load figures use `Math.random()`.
- Coherence is a heuristic derived from the number of engaged modules.
- SAIC responses are selected from hard-coded response arrays. No external LLM request is present in the inspected files.
- The optional `/api/token` handler returns a payload, and its source comment says a real production secret is not yet bound.
- Browser token signing uses random characters as the signature; this is not cryptographic JWT signing.

## v5 integration
The ten names and conceptual responsibilities are mapped to typed local modules in `ogce4.v5.omnigenesis`. Local module state, events and snapshots are operational. Remote service, Malcolm daemon, Source, ISIC, USIN and Omni-Lattice connections are not claimed because no verified endpoint contract or credentials were supplied.

## Trust boundary
The ZIP was inspected but not executed. The separate `.exe` was not executed or dynamically analysed. Source inspection does not establish binary safety.
