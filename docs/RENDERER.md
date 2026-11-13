# Renderer implementation
Panda3D provides the actual 3D window, scene graph, model loading, lighting, camera and frame loop.
Current preview uses bundled primitive assets and a basic lit scene. This is a real rendering path,
not a custom AAA renderer. Expand with glTF import, PBR shaders, shadows, post effects and profiling.


## v8.3 renderer
See `docs/CHANGELOG_V8_3.md`. The browser renderer is now `web/js/renderer3d.js` (WebGL1 modules: `gl-math.js`, `world3d.js`, `minimap.js`) with shadow maps, animated water, sky, wind-swayed forests, animated characters, picking and adaptive quality. v7.0's 2D canvas drawing lives on as the minimap and no-WebGL fallback.


## v9.0 renderer (Strata: Lux Genesis)
`web/js/renderer3d.js` + `web/js/shaders90.js` (WebGL1, no libraries, no licensed assets).
* Tiers: Low (dpr 0.75, direct output + MSAA), Medium (dpr 1, HDR, 1 shadow cascade, detail 256 px, ~2.6k grass, height fog),
  High (dpr 1.5, 2 cascades, bloom, planar reflections, refraction, light shafts, detail 512 px, ~9k grass),
  Ultra (native dpr up to 3×, 4096 shadows, SSAO, detail 1024 px, ~27k grass). Render scale 50–100% multiplies the dpr.
  Auto-detect starts phones on Medium and never auto-raises them above High; an FPS monitor steps tiers down/up.
* Lit pass: GGX metal/roughness, hemispheric ambient, Poisson-PCF shadows, triplanar procedural detail (albedo/normal/roughness), exponential height fog.
* Post: HDR half-float target → bright pass → blur → composite (DoF, light shafts, SSAO, bloom, ACES, grading, vignette) → FXAA.
* Water: planar reflection, Fresnel, refraction from a half-res copy of the opaque scene with Beer–Lambert absorption, foam, caustics.
* Grass: instanced blades (ANGLE_instanced_arrays) with wind and LOD sink, plus tuft impostor cards in an outer ring; rebuilt every ~6 m.
* Not done: TAA (FXAA only), >2 cascades, ray-marched clouds.
