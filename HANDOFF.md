# HANDOFF — Kurabe QAQC

## Trạng thái hiện tại
- Phase 95 `True static-first` đã hoàn tất; Phase 96 đang triển khai theo integrity-first WBS.
- P96T00 live preflight PASS: Active = 1, evaluations = 53, rounds = 69, duplicate/orphan = 0; catalog metadata vẫn UNKNOWN.
- P96T01 baseline PASS bằng Mika Playwright fallback: 3 cold + 3 warm mỗi viewport; median first-light→full 390 `3313/2685ms`, 768 `2898/2480ms`, 1440 `2994/2786ms`.
- P96T02 PASS local candidate: RSC/server-only Active resolver, exact periodId query/cache, fail-closed zero/multiple/error, Closed-only inline history; 28/28 tests + lint/tsc/build/browser canary PASS.
- P96T03 PASS_WITH_CONSTRAINT: candidate partial unique index + preflight/rollback; close/target Active + exactly-one affected-row guards; create DB uniqueness authority; 29/29 tests + lint/tsc/build + fresh reviewer PASS.
- Live catalog P96T03 `UNKNOWN/BLOCKED`: Management API database query và `supabase db query --linked` đều 403. Không claim live index verified.
- P96T03 candidate chưa apply; production migration/apply cần direct catalog privilege và approval riêng. Chưa deploy/push.
- P96T04 atomic lifecycle/delete và P96T05 Closed-period write firewall chưa triển khai; Phase 97 vẫn DEFERRED.
- Agy execution lane tạo candidate trong đúng scope; Mika đã sửa và verify độc lập; Reviewer `gemini-3.1-pro-high` PASS clean, HIGH confidence.
