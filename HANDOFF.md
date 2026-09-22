# HANDOFF — Kurabe project

**READ `AGENTS.md` FIRST.** It defines the Mika/Coder/Reviewer authority and operating contract (`mika-v3`).

**Phase:** P105 CLOSED; **R4 repair loop ACTIVE** — first CI run of production-smoke failed case (b).
**R4 `9ada0a6`**: smoke root cause = Next16 `loading.tsx` routes serve content via RSC flight (body keeps spinner) so raw-HTML markers never matched; added session-insert + inlined-URL preflights, auth-reject vs marker-missing split, flight-aware markers, case(e) accepts HTTP307 or flight redirect. Local: **smoke 5/5 PASS**, gates lint/typecheck/test 64/64/scan/build ALL_PASS (`.../kurabe-p105/P105M1T03/gates-r4*.log`).
**Note:** `scripts/run-with-env.mjs` forces `.env.local` over shell env (owner design) — local `npm run build` inlines PROD URL; disposable builds need `npx next build` or exported env in a worktree WITHOUT `.env.local`.
**Prior:** T01 `74b84f3`, T02 `3ec6f84`, T03 `6bbdb73` (perf PERF_CLOSED); push approved+done (`3b6d558`).
**Next:** CI run on `9ada0a6` must go green (R4 loop); then teardown disposable runtime; production writes/migrations `0/0`.
**Rules:** read tasks.md; baseline `461f895`; R1–R4 repairs recorded in state `mika_repairs`.
