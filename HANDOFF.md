# HANDOFF — Kurabe project

**READ `AGENTS.md` FIRST.** It defines the Mika/Coder/Reviewer authority and operating contract (`mika-v3`).

**Phase:** **P106 open** — M1T01 DONE (new-user default password = employee_code, candidate `5e9bc59`, review PASS) and **M1T02 DONE** (scoped-cache blink fix: 30s scope poll no longer `clearBeforeRender`; candidate `8403b1f`, review PASS, gates 66/66). Base for both: `39a9fdf`/`e070fd9`. Push + CI + deploy pending owner approval.
**P105 fully CLOSED incl. **R4** — CI run `35688238220` on `015f8a8` = **success** (Production smoke PASS first time with R4, matrix PASS, cleanup PASS).
**R4 `9ada0a6`:** smoke root cause = Next16 `loading.tsx` routes stream content via RSC flight (body keeps spinner) so raw-HTML body markers never matched; added session-insert + inlined-URL fail-closed preflights, auth-reject vs marker-missing split, flight-aware markers, case(e) HTTP307-or-flight. Local proof: smoke **5/5 PASS**, gates ALL_PASS.
**Ops note:** `scripts/run-with-env.mjs` forces `.env.local` over shell env (owner design, do not weaken) — disposable builds must run WITHOUT `.env.local` in scope (worktree) or via `npx next build` + exported env.
**Prior:** T01 `74b84f3`, T02 `3ec6f84`, T03 `6bbdb73` (perf PERF_CLOSED, 80 runs/5 samples, median 311.8–808.8ms); base `461f895`; repairs R1–R4 in state `mika_repairs`.
**Next:** no registered task; disposable runtime torn down (`cleaned:true, residue:0`); production writes/migrations `0/0`; owner decides next phase.
**Rules:** read tasks.md; review rule + publish discipline per plan PASS (`gemini-3.1-pro-high`).
