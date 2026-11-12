# v4.1 test status

- Python bytecode compilation: passed for OGCE package modules.
- Targeted v4.1 + v4.0 core tests: 13 passed.
- Full root pytest discovery is scoped to `tests/` to avoid collecting archived v3.1 historical tests
  as if they were current v4.1 tests.
- Panda3D graphical startup and visual rendering were not exercised in this build environment.
- Windows, Linux and macOS hardware/GPU matrix tests have not been run.
