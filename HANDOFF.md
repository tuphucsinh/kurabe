# HANDOFF — Kurabe project

**READ `AGENTS.md` FIRST.** It defines the Mika/Coder/Reviewer authority and operating contract (`mika-v3`).

**Current phase:** P105 bounded cleanup — T01 DONE, T02 DONE, T03 (perf rerun) next = last.
**P105M1T01:** `74b84f30d86cc9af28608d61f61f1668905ec0a8` — CONTROLLED review PASS/NONE, all gates rc=0 (`::add-mask::` + fail-closed `production-smoke` + R1 build-time NEXT_PUBLIC env mapping).
**P105M1T02:** `3ec6f84fa3d6aa24794e372773baaa3b9383754b` — two unreachable legacy evaluation blocks deleted (−415 lines), source-contract test added; **64/64 tests, lint/typecheck/scan/build rc=0** (`.../kurabe-p105/P105M1T02/gates-candidate-attempt3.log`); repairs: R2 `if/else` so TS sees all paths returning, R3 stale `p96t05` `.update(-1)` contract (owns amended under lock), runner exit=1 twice = transport events only.
**Residual:** production-smoke first real run = GitHub CI after push (**owner approval needed to push**); KNOWN_BUGS archived as historical index (control `4f9cf2b`).
**Next:** dispatch `P105M1T03` — rerun `tests/perf/benchmark-harness.mjs` at 5 samples/point with median+p95 + provenance (candidate SHA + timestamp), MACHINE_EXCLUSIVE during the run.
**Rules:** read tasks.md; baseline `80fb42b570f4c30408065176e91ea39235a91194`; production writes/migrations `0/0`.
