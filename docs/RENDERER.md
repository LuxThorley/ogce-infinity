# Renderer implementation
Panda3D provides the actual 3D window, scene graph, model loading, lighting, camera and frame loop.
Current preview uses bundled primitive assets and a basic lit scene. This is a real rendering path,
not a custom AAA renderer. Expand with glTF import, PBR shaders, shadows, post effects and profiling.


## v8.3 renderer
See `docs/CHANGELOG_V8_3.md`. The browser renderer is now `web/js/renderer3d.js` (WebGL1 modules: `gl-math.js`, `world3d.js`, `minimap.js`) with shadow maps, animated water, sky, wind-swayed forests, animated characters, picking and adaptive quality. v7.0's 2D canvas drawing lives on as the minimap and no-WebGL fallback.
