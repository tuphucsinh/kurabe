# HANDOFF — Kurabe project

**READ `AGENTS.md` FIRST.** It defines the Mika/Coder/Reviewer authority and operating contract (`mika-v3`).

**Current:** P110 fix queue T01–T06 DONE_LOCAL; candidate HEAD `8fa0618`; BASE `a7dffe60b64a7091129b0056893fc4733b88cf9c`; exact closures in `tasks.md` (P110 section).
**P110 scope:** import dd/mm/yyyy day-first; result-message Approved-only + modal saving reset; compare null-vs-0; evaluation unsaved-changes guard; /teams summary projection; AuthContext bootstrap-once + identity-bound scope requests.
**Gates @ `8fa0618`:** tests 92/92 PASS, lint 0 error/60 warnings (baseline), typecheck, secret scan, diff-check, synthetic-env isolated build, fresh strict review **VERDICT: PASS** (diff `a7dffe6..8fa0618`).
**Evidence:** `/home/pi5/hermes-artifacts/kurabe-p110/` (per-task focused logs + `gates-final/`). Candidate worktree removed after build.
**Release boundary:** P110 RELEASED 2026-10-24 (owner-approved): pushed `a7dffe6..b791479`; Vercel production Ready (`kurabe-qzdmv9bv1`, aliases kurabe-tuphucsinhs-projects/lykiv.vercel.app); CI rerun success (lần đầu browser-lane flake, đã đối chiếu không phải regression). P109 C01/R01/A01 đã lên cùng đợt push.
**Open / Need approval:** push/deploy riêng; P108M2T01 trial-data disposition; browser smoke P110 (cần local stack) nếu muốn evidence bổ sung.
**Preserved:** anh-owned `.ai/DECISIONS_LOG.md` (modified, hash `f66ab7bb…`) + `TCDG2026.xls` (untracked, hash `3e3cfd7e…`) byte-identical through P110.
**P110M2T01 RELEASED 2026-10-24 (owner-approved):** push FF `40f46d2`, CI 40086230532 success 7m41s (93/93, 115 cases, smoke 5), Vercel `kurabe-crol5ycjb` READY @ 40f46d28ee, lykiv trỏ đúng, smoke 200. Stall root cause remains UNKNOWN (ngoài harness); diagnostics live sẵn sàng cho lần fail tới.
**Next:** owner decision on push P110M2T01, or separately scoped residual work (backlog §E).
