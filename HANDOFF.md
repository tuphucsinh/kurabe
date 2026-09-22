# HANDOFF — Kurabe project

**READ `AGENTS.md` FIRST.** It defines the Mika/Coder/Reviewer authority and operating contract (`mika-v3`).

**Current phase:** P105 bounded cleanup — T01 integrated, T02 next, T03 last.
**P105M1T01 integrated candidate:** `74b84f30d86cc9af28608d61f61f1668905ec0a8` — CONTROLLED review `VERDICT=PASS / SEVERITY=NONE / FINDINGS=none` (REVIEW_EXIT=0).
**Gates on exact candidate:** npm ci / lint / typecheck / test / scan-source-secrets / build all rc=0 — `/home/pi5/hermes-artifacts/kurabe-p105/P105M1T01/gates-candidate.log`.
**T01 content:** `::add-mask::` for every disposable CI credential before `$GITHUB_ENV` (empty-value guarded); fail-closed `production-smoke` suite (5 cases, `next start`, loopback) wired after build; repair R1 maps build `NEXT_PUBLIC_*` to the disposable runtime (inlining verified in `.next/server` — legacy placeholder build would fail the smoke); new `tests/ci-export-mask.test.mjs` (4 cases PASS).
**Residual:** production-smoke's first real execution is GitHub CI after push — **push needs owner approval**; KNOWN_BUGS archived as historical index in control commit `4f9cf2b`.
**Next:** dispatch `P105M1T02` (delete the two unreachable legacy evaluation blocks in `src/actions/evaluation.ts`), then `P105M1T03` (perf rerun, 5 samples/point, median+p95).
**Rules:** read tasks.md; baseline `4f9cf2b667c92c506ca637754faeb4eaded4e826`; production writes/migrations `0/0`.
