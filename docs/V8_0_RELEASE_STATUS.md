# OGCE v8.0 release validation and status

## Scope
- Full v7.7 project tree retained as the base, including browser game, account/auth foundation,
  gameplay, web renderer, deployment scripts, legacy releases and prior docs.
- Full supplied μLux v0.6.0 archive extracted under `integrations/mulux_v0_6_0_reference/mulux/`.
- Native Python μLux integration added under `ogce4/v80/` and HTTP/browser UI routes added.
- PostgreSQL schema, optional Redis pub/sub adapter and Android/iOS wrapper handoff docs included.

## Validation to be recorded by release build
- Baseline v7.7-derived test suite before modifications: 101 passed.
- v8.0: run `pytest -q`, `python -m compileall -q ogce4`, JS syntax checks, package/manifest checks.
- API integration tests cover μLux GET snapshot, POST tick and claim grading.

## Known limitations
- A full Docker build, public deployment, load test, external penetration test and independent audit
  are not run as part of local archive creation.
- PostgreSQL and Redis extension points require infrastructure and further integration work.
- Native app store packages are not included.
- The artificial-life subsystem is a simulation, not demonstrated consciousness.
