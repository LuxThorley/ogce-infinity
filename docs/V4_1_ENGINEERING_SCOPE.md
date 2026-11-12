# OGCE v4.1 engineering scope

## Eight development priorities
1. PBR material descriptors and validation (`materials.py`).
2. glTF 2.0 JSON/buffer inspection with remote URI rejection and path traversal checks (`gltf.py`).
3. Material/shader-facing data contracts (`materials.py`, `lighting.py`); shader execution is backend work.
4. Directional/environment lighting and shadow settings (`lighting.py`).
5. Seeded procedural heightfield generation (`terrain.py`).
6. Rolling frame-time percentile metrics and budget checks (`profiler.py`).
7. Undo/redo commands and serializable docking layout model (`editor_history.py`, `editor_layout.py`).
8. Platform fingerprint and required smoke-check reporting (`platform_qa.py`).

## Eight remaining commercial engineering tracks
1. Custom AAA renderer: Panda3D remains the backend. Custom renderer parity is not delivered.
2. Advanced GI/post-processing: probe interpolation and declarative postFX settings are supplied;
   production GI, SSAO/bloom/tone-map GPU passes and temporal stability need backend implementation.
3. Advanced editor: undo/redo and docking schema are supplied; full dock UI, gizmos, prefabs,
   import dialogs, autosave and usability testing remain.
4. Dedicated multiplayer: authoritative UDP prototype is supplied; production server fleet,
   encryption, identity binding, rate limiting, regional ops, DDoS resilience and load testing remain.
5. Auth/billing/licensing: PBKDF2 password and HMAC token primitives supplied; external identity,
   payment provider, entitlement ledger, compliance and operational controls remain.
6. Signed installers/updates: SHA-256 release manifest supplied; code signing, notarization,
   secure updater, rollback and protected CI key management remain.
7. OS testing: automated test suite and environment fingerprint supplied; real Windows/macOS/Linux
   test runners and device matrix are required.
8. GPU/performance/security certification: frame profiler and budget helper supplied; GPU matrix,
   performance baselines, fuzzing, penetration testing and certification are not implied.

## Acceptance criteria before commercial launch
- Integrate and visually verify all render features on a defined GPU/driver matrix.
- Complete glTF geometry, texture, animation, skinning, morph and extension support with fuzz tests.
- Integrate editor workflows end-to-end and test save/reopen/undo/redo recovery.
- Deploy authoritative servers with encrypted transport, auth, abuse controls and load/chaos tests.
- Integrate compliant billing/licensing with auditable entitlements and support processes.
- Sign installers and updates, verify signatures before installation, and test rollback.
- Pass supported OS/CPU/GPU matrix, security review, soak tests and crash recovery.
