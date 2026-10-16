# Kurabe — current plan and closed execution record

## P108 — 3 bộ tiêu chuẩn độc lập Leader / Staff / Worker (CURRENT PLAN, 2026-10-16)

**Status:** `PLAN_APPROVED_IN_PRINCIPLE / IMPLEMENTATION_NOT_STARTED`. **This document update:** planning only; no application code/SQL/data changed, no test evaluations deleted, no Pi5 file altered, no deployment. Owner explicitly requested this GitHub master-plan update. P108 replaces the previously discussed v1–v4 proposals as the **single current implementation plan**; historical P103–P107 sections below are preserved as provenance, not reopened.

**Reference:** source `TCDG2026.xls` attached in conversation; SHA-256 `3e3cfd7eddc18567eb3dfaaaf6586696044681fbfb337df845d043d884811743`. Physical Pi5 reference `/home/pi5/projects/kurabe/TCDG2026.xls` has **not** been verified on Pi5; verify hash before consuming. Workbook content is OOXML despite `.xls` filename extension. Source-code audit baseline: GitHub main `cb3477769b276bff2ebdcd222f183364f49042a6` (2026-10-10); live Supabase schema, migration ledger, data and deployment **not** verified in this planning update. Local evidence/extraction is a review aid, **not** a production seed approved by business.

### P108.1 — Owner decisions and scope (authoritative)

1. **Three truly independent catalogs of data, one existing system.** `leader` = Manager, Leader, SubLeader; `staff` = Employee; `worker` = Worker. Each set has its **own group/criterion/level UUIDs, criterion numbers, descriptions and points**. Never share a criterion object or level ID between sets. Reuse the **existing** evaluation engine, grade-band mechanism and **one global active immutable criteria config/version**. No three separate databases, engines, version streams, or new catalog administration framework.
2. **A code has meaning only within one set.** The business key is `(set_key, normalized_code)`; the technical key is an immutable UUID. `staff:C11` may have identical subject matter to `worker:C10`; `staff:E22` and `worker:E22` are *different criteria*, while the improvement criterion is `leader:E23 / staff:E22 / worker:E24`. Identical group codes A–F in different sets must be valid with different UUIDs. No matching by code/name/position/translation across catalogs.
3. **Source workbook, not the old shared catalog, determines new contents.** `KIV-AD-WI-007/01` Leader = **33 criteria, 6 groups, confirmed maximum 190**; `/02` Staff = **30 criteria, 6 groups, confirmed maximum 175**; `/03` Worker = **30 criteria, 6 groups; numeric levels/max still require business signoff**. Total **93 criteria, 18 groups**. Six sheets include three standard sheets and their change logs. Keep original workbook unchanged. Exclude section G (maternity/contract-suspension months) from the point-based 93 unless separately approved.
4. **Score policy unchanged by owner decision.** Keep negative *criterion-level* penalties exactly as in approved source, existing arithmetic sum, grade bands, and current SQL `total_score >= 0` / `final_score >= 0` constraints. **Do not clamp negative totals, change grade thresholds, or remove the checks in P108.** Test negative penalty choices and boundary combinations. Mathematically negative aggregate combinations can exist in the form: if reached, current DB intentionally rejects the transaction; document this existing limitation rather than silently changing policy.
5. **Two-step Manager UX:** choose Leader/Staff/Worker and add/edit/delete criterion/group → press **Save**. Save performs validation, atomic version increment and historic snapshot. **No separate draft manager, publish/approval button, future scheduling, or version management UI.** Remove the multi-audience checkbox and update-audience editing path for new data. Manager-only editing; all other roles remain read-only/authorized as before.
6. **Freeze criteria writes while a period is Active**, including direct SQL/RPC routes, not just disabled UI. Show a clear short explanation. After the Active period is closed, a Manager can save immediately; no waiting workflow. Closed periods may contain unfinished evaluations under preserved P107 policy. Do not silently reopen or erase them.
7. **Adding a Leader criterion later** changes Leader only. Staff/Worker content and UUIDs remain byte/logically identical; global criteria version still increases. Existing periods keep their pinned immutable snapshots. A prior application form should never start using the new code halfway through a period.
8. **Five-role evaluation flow and authorization do not change:** Manager SELF→Approved; Leader SELF→Manager; SubLeader SELF→Leader→Manager; Employee/Worker SubLeader→Leader→Manager. For every round select the catalog by **`evaluations.employee_role` captured for the subject**, never the currently loaded `users.role` or the grader's role. Official results remain **Approved-only**.

### P108.2 — Resolve source ambiguities **before** production import

A small signed-off source mapping sheet/manifest is sufficient; **do not build a review workflow UI**.

| Gate | Source issue | Minimum action |
|---|---|---|
| S1 (BLOCKING) | Worker sheet does not contain explicit numeric H–L score columns equivalent to Leader/Staff | Produce a precise 30-criterion × applicable-level numeric mapping; get authorized business confirmation; **no guessed Worker points or max** |
| S2 (BLOCKING if changes grading) | C14 VI/JA wording differs on 3/4/5 occurrences | Record which threshold applies to each selectable level, preserve the original and document the correction |
| S3 (BLOCKING if changes grading) | A1 attendance ranges overlap/leave unclear boundaries | Define non-overlapping inclusive/exclusive boundaries and test examples 93/95/98/99/100 |
| S4 | `-` placeholders vs legitimate zero-point choices | Placeholders are **not** selectable numeric levels unless explicitly approved; retain legitimate zero-point options. Do not turn `-` into 0 |
| S5 | A8 exceptions, optional criterion semantics, unscored G | Confirm source meaning; don't invent score or new criterion |
| S6 | Existing S/A/AB/B/C/D grade thresholds | Keep active DB grade bands; check achievable maxima per set, do not infer thresholds from Excel |

Check import manifest with exact workbook SHA, set/doc code, group UUID/code, criterion UUID/code, VI/JA label/source row, ordered choices and points, canonical level ID, default option, negative/zero handling and provenance. Import exactly **18 groups + 93 criteria** plus signed-off selectable levels; immutable historic records remain intact. The workbook's original wording is reference; any business interpretation must be an explicit erratum.

### P108.3 — Minimal technical design (no duplicated engines)

**Database:** One forward-only P108 migration (do not rewrite previously applied migrations). Add `set_key` to live `criteria_groups` and `criteria`, and to `criteria_group_versions`/`criterion_versions` as required for authoritative historical display. Keep old pre-P108 version rows readable (nullable `set_key` only for legacy); new live/snapshot entries must have a valid non-null set. Replace global `UNIQUE(code)` for both group and criterion with appropriate normalized composite uniqueness `(set_key,code)`; update snapshot `UNIQUE(version_id,code)` to per-set keys and **also update temporary tables**, validation and all readers/lookups. Preserve UUID primary keys, FK referential integrity, level/audience historic snapshots, and all old scores/responses. Enforce criterion→group **same-set ownership at DB boundary**, not only in the UI. Each new criterion has one derived audience according to `set_key`; legacy multi-audience snapshots remain historical/read-only. Do not use `encodeAudiencesToLegacy()` as Worker authority (its Worker-only case cannot be expressed faithfully as old `applies_to`).

**Existing writer/version:** Extend `validate_criteria_config(jsonb)`, `get_active_criteria_config()` and **reuse** `save_criteria_config(p_config,p_expected_version)`; keep `criteria_config_versions` **one globally active version**, version CAS, `evaluation_rounds.criteria_config_version_id`, P107 transaction validation/lock and grade config versioning wherever tests show compatibility. For a Manager write, server loads current complete config, mutates only the selected set, verifies same-set UUID/ownership, then saves the full config atomically. Verify unchanged set content + UUID/levels after each write. Stale global CAS must return a reload message, never overwrite. No additional per-set save RPC unless a test proves a mandatory safety limitation.

**Active-period race:** Gate writes at the **database transaction** boundary and verify concurrency both ways: configuration save vs `create_evaluation_period_atomic`, plus save vs a live evaluation submit. Use a deterministic compatible lock order with existing P107 locks; front-end guard is an extra UX layer, not the authority. No `TRUNCATE` / schema-wide locks as a workaround and no deadlock regressions.

**Application:** A single role→set helper in `src/lib/criteria-applicability.ts`; update `src/lib/db/criteria.ts`, `src/lib/db/criteria-admin.ts`, `src/actions/criteria.ts` and affected `src/actions/read.ts`/hooks/types so every authorizing read/write is set-scoped. In `src/hooks/use-evaluation-page-state.ts` change the active-round criteria loader from `getCriteriaForRoleAction(employee.role)` to the immutable subject `evaluation.employeeRole`; keep submitted rounds sourced from their **pinned** historical snapshot, filtered to the subject's set. Validate scores, notes, level indexes and UUIDs against the authoritative rules for **only that set**. On the Manager Criteria page show three set tabs; inside each show its own A–F groups by **group UUID**, not global group code. Remove multi-audience edit UI/action path. Preserve all five roles' transition and authorization logic.

**History/report/export:** Read pre-P108 history with legacy pinned audiences, P108 history with set ownership; never re-label old criteria with current ones. `src/lib/evaluation-result-projection.ts` currently accumulates by `group.code`: instead group by set + stable group/pinned-version identity so identically coded A–F do not mix. A single global criteria version **does not** make raw 190-point Leader and 175-point Staff scores comparable: preserve Approved-only metrics, separate role/set statistics, avoid global cross-set raw-score ranking and misleading average or percentage. Compare `gradeConfigVersionId` as well as criteria basis where a same-basis metric is claimed. Export keys include set + criterion ID/pinned version to disambiguate repeated codes; never expose raw notes/scores beyond existing viewer permissions. Avoid unrelated redesign and N+1 queries.

**Touched code (bounded):** `src/types/index.ts`, `src/types/database.ts`; `src/lib/criteria-applicability.ts`, `src/lib/db/{criteria.ts,criteria-admin.ts,evaluation-display-admin.ts}`, `src/actions/{criteria.ts,read.ts}`, `src/hooks/{use-db.ts,use-evaluation-page-state.ts}`, `src/app/criteria/page.tsx`, `src/components/modals/{CriteriaModal.tsx,CriteriaGroupModal.tsx}`, `src/lib/evaluation-result-projection.ts`, affected report/export/compare consumers. Modify `src/actions/evaluation.ts` or P107 RPC only if real integration tests prove necessary. Reconcile bootstrap schema/manifest, tests and runbook. No new criteria-set table is required for the fixed enum.

### P108.4 — PDCA execution WBS (6 groups, sequential release gates)

| WBS | Work / evidence deliverable | Gate / dependency |
|---|---|---|
| **G0 — LIVE PREFLIGHT & TEST CLEANUP** | Read-only actual Supabase project/schema/ledger, deployed app SHA/flags, period/evaluation/round/history/FK/trigger inventory. Identify **exact trial-evaluation IDs**; independent restore-test of backup/PITR, hash/counter/allowlist readback. Only after scoped owner approval to delete those exact IDs, execute atomic selective cleanup and postcheck; history immutability/FK `RESTRICT` ⇒ **STOP, no trigger bypass**. | Prerequisite for production cutover; source development can use disposable DB before live cleanup. No delete until IDs and restore evidence are known |
| **G1 — WORKBOOK SIGNOFF** | Verify Pi5 SHA, classify all 93 criteria/levels, fix S1–S6 in a signed-off manifest with bilingual row references and point bounds. | Worker point mapping + material errata approved; no guessed source values |
| **G2 — DB/CATALOG** | Implement/test additive forward migration, set ownership + composite unique, one active global version, Writer/CAS/Active guard, cloned UUIDs + snapshot. Run migration and rollback drill on disposable target. | 18/93 exact, no cross-set FK, legacy history intact, concurrent writer/period tests pass |
| **G3 — UI/EVALUATION** | Three tabs, two-step CRUD, correct role snapshot, strict per-set payload validation, no multi-audience toggles; render/hydrate/autosave/change-role behavior. | Five-role save/submit/return/approve and Manager CRUD tests pass; no cross-set leak |
| **G4 — HISTORY/REPORT/EXPORT** | Correct old/new historical display, avoid group-code mixing, role-scoped report/leaderboard, version/grade comparability, authorized export. | Golden numerical results and permission comparisons match expected values |
| **G5 — QUALIFY/RELEASE** | Same integrated candidate: tests, typecheck, lint, build, secret scan, real local DB transaction races + browser matrix, staging restored/sanitized dataset and 1500 synthetic personnel perf; backup restore/rollback drill. Separate protected production push/apply/deploy approval, controlled smoke and monitoring. | No known blocking functional/security/data issues; exact app SHA + migration fingerprints/evidence; production only after explicit release approval |

**DAG:** `G0(read-only) || G1` → `G1 signed off` → `G2 → G3 → G4 → G5`; production destructive cleanup is a separate controlled subgate after G0 exact allowlist approval, before production cutover. Keep protected write tasks serial where overlapping; avoid multiple concurrent heavy builds on Pi5. This master-plan change is **not** permission to operate Supabase production.

### P108.5 — Critical acceptance matrix (behavior + DB, not only static grep)

1. **Codes/ownership:** 3 independent UUID trees; `staff:E22` vs `worker:E22` distinct, and `leader:E23/staff:E22/worker:E24` same subject but distinct; same A–F group codes permitted in each set, same normalized code twice *within* a set rejected.
2. **Data import:** exactly 33/30/30 criteria and 6 groups per set; no invented Worker scores, no numeric `-`, VI/JA source row audit; level defaults and grade-range maxima validated.
3. **Version/CAS:** edit Leader to add another criterion; unchanged Staff+Worker checksum/UUID/levels, new global snapshot ID; stale concurrent Manager save rejects without lost update; old pinned version still displays.
4. **Active-period fence:** Manager read-only in Active; direct RPC bypass denied; race `create-period ↔ save-config` and `submit ↔ config-update` yields one consistent winner without deadlock.
5. **All role flows:** Manager 1 round, Leader 2, SubLeader 3, Employee/Worker 3; Draft/first-open autosave/submit/return/resubmit/Approved, role transfer while period exists, evaluator change, old closed history.
6. **Scores/security:** negative *level* and score zero preserved; negative total fails via existing guard; forged criterion UUID/level index/wrong set/stale version fail closed; Manager-only catalog writes, viewer read-scopes preserved.
7. **Reports/export:** group C by set never mixed; different maximums not raw-ranked globally; Approved-only, historic pinned grades/labels, legacy result states preserved, authorized CSV/XLSX unambiguous.
8. **Scale/release:** root `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, secret scan; authenticated browser/API + real DB test; 1500 synthetic roster; baseline vs candidate p95 measured under same lane (proposed no >15% degradation; investigate, not fake a PASS). Confirm zero orphan/history mutation, backup restore, migration provenance, rollback readiness and real production smoke.

### P108.6 — Fail-closed / rollback and non-goals

- **STOP** on uncertain live schema/ledger/DB identity, Worker score signoff missing, wrong 18/93 mapping, failed constraints/snapshot/history, blocked trial cleanup without approved handling, absent restore proof, unexpected global version interference, authorization/regression, Active race/deadlock, red tests, or missing exact release approval. Do not automatically turn a blocker into a guessed default.
- Migration/seed apply must be atomic on disposable/staging first. Prior to cutover, rollback transaction / tested restore is valid. **After production P108 data has been written, redeploying old app alone is NOT a safe rollback** (the old app assumes globally unique code); use assessed fix-forward or controlled PITR/restore with loss-of-new-writes analysis and owner decision. Never delete immutable history or widen privileges to force migration.
- Out of scope: 3 engines/version streams, extra `criteria_sets` manager UI, standalone draft/publish/schedule/approval workflow, global raw leaderboards, changing negative total rule/grade threshold, mass personal-data rework, unrelated security/auth/AI redesign, new performance/cache framework. Fix only directly related errors.
- **Current execution markers:** `P108_PLAN_DOCUMENTED=YES`; `P108_APP_CODE_CHANGED=NO`; `P108_DB_MIGRATION_APPLIED=NO`; `P108_TRIAL_EVALUATIONS_DELETED=NO`; `P108_PRODUCTION_DEPLOYED=NO`; `WORKBOOK_WORKER_POINTS_SIGNED_OFF=NO`; `LIVE_SUPABASE_CATALOG_VERIFIED=NO`.


## Historical P107 planning control state (2026-10-08 snapshot; not current)

- `PLAN_STATUS=P107_WBS_PREPARED`; `EXECUTION_STATUS=P106_TASKS_DONE_P107_NOT_STARTED`; `DOCUMENT_STATE=UNCOMMITTED_PLANNING_UPDATE`.
- Historical P106: M1T01 candidate `5e9bc59` (default credential policy); M1T02 candidate `8403b1f` (background scope poll no longer clears resident cache). Both are completed in `tasks.md`; this proposal neither reopens them nor certifies their deployment.
- Current request (2026-10-08): owner accepts the three recommended policies and requests one phase broken into tasks to prepare execution. `INTENT=PLAN_TO_TASKS`; `IMPLEMENTATION=NOT_STARTED`; `TASK_REGISTRATION=DEFERRED_UNTIL_REVIEW_AND_CANONICAL_COMMIT`; `COMMIT_PUSH_DEPLOY=NONE`. This turn prepares documents, not application/DB execution.
- Canonical repository: `/home/pi5/projects/kurabe`
- Branch: `main`
- Historical P104 phase baseline: `ea7b64fb0eafac1406780b0c0632757638d1f8f3`
- P104 execution baseline after control activation: `03a13da06ce549b6212bf9f32c28937e994dd048`
- P103 remains closed: **13/13 DONE**.
- CI repair task `t_7c812262` is closed at the baseline above; its remote CI result is historical, not a fresh qualification of this proposal.
- F06 is closed and must not be reopened by this phase.
- Historical P104 residuals: **none; F01–F05 and F07–F09 are closed**. New audit findings are tracked separately in P107 below; the historical closure is not blanket system acceptance.
- F09 was confirmed as a current-read authorization bug after secondary-team Leader revocation and is closed without a write-path change.
- Production deployment, production catalog reconciliation, and production DB mutation are outside this phase.

## P104 — bounded audit remediation

### Goal

Fix the remaining eight confirmed MEDIUM findings without changing the approved five-role evaluation workflow, scoring policy, passwordless compatibility, historical P103 provenance, or overall architecture.

### Execution model

- Three implementation tasks may run in parallel in isolated worktrees when ownership is non-overlapping.
- One qualification task runs only after all implementation tasks are integrated.
- Runners do **not** edit `tasks.md` or this plan; Mika owns task state, integration, and evidence.
- Keep fixes local and reuse existing primitives/DTOs. No new auth framework, cache framework, result framework, or broad rewrite.
- Ordinary test/tool/runtime blockers are self-resolved inside the owning task.
- No production writes, production migrations, or deployment in P104.

### Task groups

| Task | Scope | Findings | Dependency | Parallel-safe |
|---|---|---|---|---|
| `P104M1T01` | Scope/state correctness | F01, F05, F09 | none | yes |
| `P104M1T02` | Output/data correctness | F02, F03, F04 | none | yes |
| `P104M1T03` | Release-gate truth | F07, F08 | none | yes |
| `P104M2T01` | Consolidated qualification | all above | T01 + T02 + T03 integrated | no |

### Exit criteria

P104 closes only when:

1. F01–F05 and F07–F09 each have a focused regression proving the old failure and the corrected behavior.
2. Root tests, typecheck, lint, build, secret scan, and relevant authenticated/runtime checks pass on one frozen integrated candidate.
3. F07 ACL verification detects PUBLIC/direct/inherited effective EXECUTE correctly and binds the exact overload.
4. F08 cleanup failures affect verdict and residue is read back as zero.
5. F09 denies fresh current-read access after Leader revocation while preserving legitimate submitted/Approved historical read.
6. Production writes/migrations remain `0/0`.
7. One consolidated final review is run after candidate freeze; no per-finding review loop.
8. Canonical repository is clean and exact candidate SHA/evidence are recorded.

### Non-goals

- Do not reopen F06.
- Do not redesign the five-role workflow.
- Do not change evaluation scoring policy or grade semantics beyond fixing score `0` nullish handling.
- Do not remove existing transaction locks without separate measured concurrency evidence.
- Do not mass-delete P103 tests/docs/evidence.
- Do not deploy or mutate production as part of P104.

## Closed P103 provenance

P103 remains historical and closed. Primary evidence root:
`/home/pi5/hermes-artifacts/kurabe-p103/`

Key closure anchors:

- P103M4T01: `117215934afaaca9553815db462d2e5fb8da68e8`
- P103M4T02: `5f934b9f885f0e2ddd32f9ad5151e200891cee8f`
- P103M4T03: `9f07ce3bdb06c1b5fe9f8cb315644b1444493ac3`
- P103M4T04 control closure: `f8b60677ab3944721e864ea7ad92ef8908bc024b`

The post-closure audit confirmed F01–F08 as bounded MEDIUM findings. F09 was subsequently reproduced and confirmed separately. P104 is the first executable remediation phase for those remaining findings.

## P104 closure

- Integrated candidate: `9a8c988be603507142a4a8afe854deec108560a0`.
- All focused/root/authenticated/runtime gates passed; production writes/migrations remained `0/0`.
- Fresh independent review: AGY `gemini-3.8-flash-high`, exact candidate/tree verified, verdict `PASS`, blocking findings `NONE`.
- Remote GitHub Actions CI run `35193543798` passed on the exact integrated candidate; remote `main` matches it.
- Evidence root: `/home/pi5/hermes-artifacts/kurabe-p104/`; no P104 runtime/worktree residue remains.

## P105 — bounded cleanup (registered 2026-09-22)

### Goal
Close four verified findings from the P104-close review without changing runtime architecture: disposable CI credentials leaking clear-text into public job logs, no production-runtime smoke in CI, ~400 lines of unreachable legacy evaluation code, and a performance baseline 139 commits stale. Plan reviewed `PASS` by agy/gemini-3.1-pro-high before registration.

### Task groups
| Task | Scope | Dependency | Tier |
|---|---|---|---|
| `P105M1T01` | CI hygiene: `::add-mask::` in `exportEnv()` + 5-case production smoke after build | none | CONTROLLED |
| `P105M1T02` | Delete unreachable legacy fallbacks in `src/actions/evaluation.ts` | none | STANDARD |
| `P105M1T03` | Rerun existing perf harness, 5 samples/point, median/p95 | T01 + T02 | STANDARD |

Control-plane (Mika, separate control commit): `.ai/KNOWN_BUGS.md` re-marked as a historical index so it can no longer be read as an active residual list.

### Exit criteria
1. Public CI logs contain no disposable credential values (mask verified by source-contract test + log grep).
2. Production smoke runs fail-closed in CI after `npm run build`.
3. No sequential/legacy fallback remains in the two evaluation actions; focused/source-contract tests and all root gates pass.
4. Fresh perf report bound to the current candidate SHA with 5 samples/point; dataComplete median < 1000 ms on LAN/loopback.
5. Production writes/migrations remain `0/0`; one fresh CONTROLLED review on the `P105M1T01` candidate.

### Non-goals
- Dashboard/Reports "Approved-only" semantics: owner decision, not in P105.
- ESLint warning cleanup, Next build cache in CI, Excel/xlsx replacement: deferred/skipped.
- No new framework, workflow engine, auth framework, secret manager, or benchmark system.

## Historical / owner-gated records

- P102 production closure remains historical provenance.
- Strict-password go-live and broad credential migration remain deferred by the optional-password decision.
- `P102M2T01` repository-settings governance and `P96T11–P96T13` lifecycle/rollback work remain owner-gated and are not part of P104.

## P107 — integrity-first remediation, một phase chuẩn bị thực thi (2026-10-08)

### 1. Trạng thái, căn cứ và giới hạn

- `SOURCE_BASE_SHA=5f0c95f37ffa5155b4f7ba26e9ea6f61991925ee`; branch `main`; pre-edit Git clean. Application source không khác commit review `b26eb3b`; delta giữa hai commit chỉ là `AGENTS.md`.
- `AGENTS_TRUST=BYTE_IDENTICAL_TEMPLATE`; revision `2026-10-02-r2`; protocol `mika-v3`. Đã dùng Sequential Thinking để kiểm tra phạm vi, phân loại evidence, Optimality Check và gate của kế hoạch; chỉ lưu kết luận, không lưu suy luận nội bộ.
- Nguồn: source/migrations/tests hiện tại; audit Mika trong phiên 2026-10-08; attachment `Kurabe-review-tong-hop.md` của Claude, review tại `b26eb3b`. `P107-tasks.md` mà attachment dẫn chiếu chưa được cung cấp; không nhập hoặc giả định DAG/owns/DoD của file đó.
- `VERIFIED` = đã đối chiếu source/catalog artifact hoặc tool readback được nêu; không mặc định là production. `ASSUMED` = giả thiết thiết kế cần test. `UNKNOWN` = thiếu runtime evidence. `RISK` = hậu quả có thể xảy ra, không phải incident đã chứng minh.
- `LIVE_SYSTEM_ACCEPTANCE=UNKNOWN`; source audit cần sửa. Typecheck/lint và các period/poll contract/pure tests đã chạy trong audit trước đó là evidence bổ trợ; không phải full-suite/build/live-E2E của một candidate sửa lỗi. Lượt cập nhật kế hoạch này không chạy lại application gates.
- Scope lượt chuẩn bị: `.ai/MASTER_PLAN.md`, `tasks.md`, `HANDOFF.md`, `.ai/DECISIONS_LOG.md`, `.ai/PROJECT_TOOLING.md`. Không sửa application source/DB/flags/credentials/settings hoặc state JSON; không commit/push/deploy/implementation-dispatch. Pending WBS được lưu nhưng chưa đăng ký READY; owner approval cho policy không phải approval cho mọi protected action.

### 2. Quyết định giữ nguyên và những gì chưa được duyệt

| Chủ đề | Disposition hiện tại | Hệ quả cho P107 |
|---|---|---|
| Repository | **VERIFIED PRIVATE**: `gh repo view --json nameWithOwner,isPrivate,visibility` trả `tuphucsinh/kurabe`, `isPrivate=true`, `visibility=PRIVATE` | Việc chuyển private đã xong, không mở task chuyển lại. Private không thu hồi các bản từng clone/download; không kết luận đã lộ secret/hash/dữ liệu nhân sự. |
| Mật khẩu mặc định | **OWNER_CONFIRMED: mật khẩu mặc định = mã nhân viên; giữ như vậy** | Không ép đổi lần đầu, không cấm dùng mã nhân viên, không backfill/reset hàng loạt, không bật strict hoặc thay reset policy từ review Claude. Không ghi giá trị credential cụ thể. |
| Optional-password compatibility | Historical accepted policy còn hiệu lực nếu anh chưa đổi: NULL-hash legacy compatibility; non-NULL hash phải kiểm mật khẩu đúng | S2 không được tự chuyển thành task cấm toàn bộ NULL-hash login. Kiểm tra flags/deployed behavior; mọi thay đổi enforcement là owner gate riêng. |
| Số vòng | Manager: SELF (1); Leader: SELF → Manager (2); SubLeader: SELF → Leader → Manager (3); Employee/Worker: SubLeader → Leader → Manager (3) | Giữ `src/lib/evaluation-workflow.ts:17–46` và SQL multiteam hiện hành. Không thêm SELF cho Employee/Worker. |
| Đóng kỳ | Giữ hành vi freeze kỳ, có thể còn phiếu chưa hoàn tất; không tự đổi sang Approved-only close | L5 là trade-off/policy, không phải lỗi tự động phải sửa. Không thêm `Excluded`, tự loại người nghỉ hoặc reopen kỳ. D4 trong attachment không tạo approval. |
| Kết quả báo cáo | **OWNER_APPROVED:** kết quả chính thức chỉ từ Approved; tiến độ tính toàn roster, hiển thị approved/total và incomplete/frozen | Không latest-round fallback, không coi chưa duyệt là 0, không làm mất phiếu unfinished khi đóng kỳ. Policy authority là direct approval trong chat, không phải D2 của attachment. |
| Người xem nháp | **OWNER_APPROVED:** người đang được phân công chấm vòng đó + Manager đang active; Manager chỉ đọc nếu không phải evaluator | Subject chỉ thấy nháp của mình khi là evaluator SELF. Người chấm khác/vòng kế tiếp không thấy nội dung chưa nộp; metadata có scope riêng. Nộp rồi vẫn cần authorized read; trả lại để sửa áp lại draft policy. Server/API/export/AI cùng một rule. |
| Leader chưa chỉ định | **OWNER_APPROVED:** current appointment `teams.leader_id` là nguồn quyền Leader chấm/trả lại | Không fallback từ unique primary Leader hoặc stored stale evaluator. Absent/invalid/inactive pointer ⇒ chưa phân công/deny; Manager bổ nhiệm qua đường hiện có. Appointed multi-team không bắt buộc primary membership trùng nhóm. Read-scope hiện hữu chỉ giữ metadata/submitted history được authorize; primary membership không cấp write/draft privilege. |
| Production | Chưa có approval mới | Live catalog/private-data access, permissions/security, credential operation, migration, signup/provider settings, region, push/shared branch và deploy đều có gate đúng phạm vi. |

### 3. Sổ findings hợp nhất — không đồng nhất source risk với live exploit

Các ID `S/L/P/T` giữ nguyên từ Claude để truy vết, không phải task ID. Severity dưới đây là ưu tiên kỹ thuật đề xuất; chưa gán CRITICAL production khi chưa biết live exposure. Các finding trùng nhau được sửa chung, không cộng thành số lỗi độc lập.

#### 3.1 Bảo mật, quyền đọc và credential policy

| ID | Evidence / ưu tiên | Kết luận và xử lý |
|---|---|---|
| S1 | VERIFIED lịch sử public; VERIFIED hiện private | Đã containment bằng private. Rà phạm vi lịch sử/phơi lộ metadata có kiểm soát nếu được duyệt; chỉ rotate/revoke khi có evidence credential thật và approval, không rewrite history tự động. |
| S2–S3 | VERIFIED nhánh NULL-hash và default seed; policy giữ nguyên | Không đổi chính sách mặc định/optional theo D1 của Claude. Phân biệt seed thất bại có warning với tạo tài khoản thành công hoàn toàn; không kết luận đã chiếm tài khoản. Độ đoán được của default credential là residual risk được owner giữ nguyên. |
| S4 | VERIFIED `auth.ts:61,76–89`; UNKNOWN proxy config/runtime | Network limit cho untrusted proxy được đặt rất lớn; không đồng nghĩa account/admission limit tắt. Xác minh ingress/header provenance, NAT/shared-office behavior trước đề xuất limiter; không tin forwarded header tùy ý. |
| S5 | VERIFIED baseline grants + SELECT policies; LIVE UNKNOWN; ưu tiên High | `db/bootstrap/baseline.sql:276–308,321–446` có broad authenticated grants và SELECT USING(true). Thiếu live effective grants/RLS/signup/token evidence. Không khẳng định RLS cho phép mọi DML; TRUNCATE không được row policy bảo vệ. Map đường đọc/ghi rồi harden đúng đối tượng. |
| S6 | VERIFIED migrations không bật RLS cho version tables; LIVE UNKNOWN; ưu tiên High | `20260907000500_grade_config_version.sql:51–58`; `20260907000600_criteria_config_version.sql:49–108`. Kiểm owner/default privileges/exposed schemas/effective privileges. Không giả định mọi hosted bảng mới luôn được GRANT ALL cho anon. |
| S7 | VERIFIED source; exploit UNKNOWN; ưu tiên High | `src/lib/db/users-admin.ts:219–221` nội suy raw search vào PostgREST `.or()`. Dùng literal-safe grammar/escaping thống nhất, bound input và giữ scope; test malformed delimiters/wildcards. Chưa chứng minh hash-oracle hoặc auth bypass. |
| S8 | VERIFIED phiếu-level filter không redact round content; ưu tiên High, policy approved | `src/lib/db/evaluations.ts:12–19`; `src/data/workflow.ts:263–277`; broad round loader. Redact server-side theo approved draft matrix cho list/detail/history/display/export/AI, không chỉ component. |
| S9–S10 | SOURCE RISK; live DoS/timing chưa reproduce | Account lockout và user-lookup-before-bcrypt có thể tạo availability/enumeration trade-off. Negative/positive control với tài khoản giả và trusted/untrusted networks; không xóa account limiter hay cam kết constant-time nếu chưa đo. |
| S11 | VERIFIED browser anon client tồn tại; không tự là lộ secret | `src/lib/supabase.ts:1–7`; `src/lib/grade-bands.ts:87–100` còn default client gọi config RPC. Public anon key là cơ chế bình thường; rủi ro đến từ quyền thực tế. Blanket revoke/gỡ CSP trước serverizing consumer có thể phá app. |
| S12 | VERIFIED outside-scope existence branch; ưu tiên Medium | `src/lib/ai-context.ts:103–118` dùng all-user lookup để phân biệt khác nhóm. Đề xuất phản hồi không phân biệt tồn tại/ngoài scope; kiểm authorization và error behavior trước đổi. |
| S13 | UNKNOWN từng endpoint/payload/provider-retention | Có AI governance checks trong source, ví dụ `src/actions/ai.ts:302–304`; không báo "không có chống injection". Rà minimization/pseudonymization/egress/retention và prompt provenance theo từng caller; không gọi provider thật hoặc gửi HR data trong audit mặc định. |

#### 3.2 Số liệu, lịch sử, lifecycle và dữ liệu lớn

| ID | Evidence / ưu tiên | Kết luận và xử lý |
|---|---|---|
| L1 | VERIFIED source + synthetic behavior trong audit; High | `reports.ts:100–128,188–204`, `dashboard.ts:100–105`: fallback latest round và mẫu số toàn phiếu có thể trộn chưa hoàn tất/nháp. Tách progress khỏi result, dùng authoritative final fields; score 0 là hợp lệ, null không được giả 0. Approved-only đã được owner duyệt. |
| L2 | VERIFIED source; High | `reports.ts:31–60,151–168`; `dashboard.ts:80–128`: nhân sự active/team hiện tại làm lịch sử drift. Dùng period roster + `evaluations.team_id`/`employee_role` snapshot; không để người nghỉ biến mất khỏi kỳ cũ. |
| L3 | VERIFIED query mechanism/local cap; production impact UNKNOWN; High | `supabase/config.toml:18` max_rows=1000; `period.ts:79–94`, `users-admin.ts:193–240`, `evaluations-admin.ts:16–24,91–157` có đường đọc không complete-pagination. RPC atomic không cứu roster đầu vào thiếu. Test vượt cap + count/ID completeness, không chỉ tăng max_rows. |
| L4 | VERIFIED source; High | `reports.ts:69–88,112–119,162–183`: criterion mapping/mẫu số hiện hành không đúng snapshot/audience role. Tính max của chính criteria version/role áp dụng; chốt cách aggregate phần trăm cross-role trước viết. |
| L5 | VERIFIED hành vi close; policy preserved | `period.ts:202–229` close Active → Closed; không coi việc còn phiếu dở là bug nếu giữ freeze policy. UI phải nói rõ unfinished/frozen, kiểm immutable write rejection và report semantics; không tự thêm exclude-state. |
| L6 | VERIFIED predicate; LIVE UNKNOWN; Medium | `20260911000400_personnel_actor_guard.sql:149–166` chặn deactivate vì bất kỳ historical evaluator reference. Đề xuất cho soft-deactivate khi chỉ còn lịch sử, giữ FK/snapshot và chặn orphan active assignment; qualification race với submit/assignment. |
| L7 | VERIFIED intentional unassigned SubLeader; policy preserved | `period.ts:99–107` cho phép vòng 1 chưa có người chấm. Hiển thị rõ "chưa phân công" và giữ đường assign đúng quyền; không tự loại phiếu hoặc dùng Manager thay SubLeader. Không suy ra kẹt close theo D4 vì D4 chưa được áp dụng. |
| L8 | SOURCE DEBT; ưu tiên Low | Tag revalidation ở `period.ts:47–54` và actions cần inventory consumer/cache trước loại bỏ. `router.refresh`, client cache invalidation và provider-state refresh là các cơ chế khác nhau; không thêm broad cache để hợp thức hóa tag chết. |

#### 3.3 Hiệu năng và độ trung thực của evidence

| ID | Evidence / ưu tiên | Kết luận và xử lý |
|---|---|---|
| P1 | UNKNOWN runtime region/RTT | Thiếu `vercel.json` không chứng minh function ở Mỹ. Đo actual deployment/DB region và server→DB latency; chỉ đề xuất đổi region khi có lợi ích thật, approval riêng. Không ghi 5–10× là số đo. |
| P2 | SOURCE query waterfall; số lượt/latency chưa đo | Trace `src/actions/evaluation.ts` và RPC named args; dedupe immutable context, parallelize independent reads sau auth; giữ server validation + DB current-actor checks/locks. Không bỏ precheck hoặc đặt ≤5 query làm mục tiêu bất chấp safety. |
| P3 | VERIFIED unbounded assignment-ID filter/full round select; Medium | `evaluations-admin.ts:91–157`: gom assignment mọi kỳ vào `id.in.(...)`, full nested select. Bound theo period/scope, projection/pagination; dùng SQL join/authorized reader nếu đo cho thấy cần. HTTP414 chưa reproduce. |
| P4 | VERIFIED all-period full-evaluation fetch; Medium | `PeriodsTab.tsx:15–28`: tải mọi phiếu để đếm. Thay bằng per-period aggregate DTO được authorize; không gửi notes/scores chỉ để tính tiến độ. |
| P5 | VERIFIED broad server recompute khi đổi filter; Medium | `reports.ts:31–60`; `ReportsDataLayer.tsx:44–102`: đẩy effective authorized filter xuống reader, batch snapshot reads. Không blanket cache theo period mà thiếu viewer scope/version. |
| P6 | VERIFIED raw client payload; High boundary/Medium perf | `dashboard.ts:53–57` heavy DTO có rawEvaluations/rawCriteriaGroups. Precompute đúng summary tại server; không đưa nội dung mọi vòng xuống browser chỉ để vẽ chart. Payload MB→KB chưa được đo. |
| P7 | VERIFIED sequential seed; runtime timeout UNKNOWN | `password-seed.ts:61–93`: bcrypt/update tuần tự. Chỉ tối ưu bounded concurrency khi scale/profile chứng minh cần; giữ policy default, không ghi đè password đã đổi; xét race N10 bên dưới trước tăng concurrency. |
| P8 | REVIEW CLAIM cần catalog/EXPLAIN recheck; Low | Không xóa index trùng hoặc thêm subleader index từ mô tả đơn thuần. Kiểm constraint-backed/index identity, query plan và write cost trên fixture; migration gated, rollback/provenance rõ. |
| P9 | VERIFIED artifact limitations, không phải production forecast | Checked-in perf report: actual-local authenticated production-build lane, 32 runs, 2 samples/point và fixture hẹp. Trường candidateSha có 64 hex, không phải Git commit SHA; harness nhận giá trị từ env (`tests/perf/benchmark-harness.mjs:968`), producer/provenance phải kiểm lại trước dùng. P105 report được dẫn ở worktree cũ không còn; không trộn số P105 với report này hoặc chứng nhận current HEAD. |
| T1 | PARTIAL: CI parity gap, không phải "không có E2E" | `.github/workflows/ci.yml:68–117` có authenticated confirmation matrix và production smoke. Bổ sung effective ACL/default-privilege tests + authentic Supabase Auth/PostgREST parity nơi cần; bare PG chỉ chứng minh transaction semantics. |
| T2 | SOURCE-contract tests có giới hạn; số file/chất lượng cần recheck | Giữ test structural hữu ích, thêm behavior/negative controls tại boundary. Không xóa hàng loạt tests hoặc tạo dead compatibility code chỉ để grep PASS. |
| T3 | LIVE migration/catalog provenance UNKNOWN | Nhãn CANDIDATE trong repo không chứng minh chưa apply; đối chiếu ledger + object definition/comments/hash. Baseline schema không tự chứng minh predecessor migrations đã chạy; không regenerate production baseline mù. |
| T4 | VERIFIED transactional flag fail-closed; không tự là lỗi | Legacy reachable fallback đã loại ở P105. Verify flag/schema/overload deployed; không xóa flag hoặc tự bật runtime vì review yêu cầu. |
| T5 | Same root as S4; simplification conditional | Không đặt số dòng mục tiêu cho proxy/rate-limit. Chỉ giản lược sau trust model và admission concurrency tests đã đủ; giữ failure accounting/session cleanup. |
| T6 | REVIEW CLAIM; Low, ngoài minimal fix | Inventory tracked AI artifacts/internal docs trước cleanup; file của anh không disposable mặc định. Không xóa `.ai/*`, instruction files, tài liệu nội bộ hoặc rewrite history từ review. |

#### 3.4 Findings bổ sung của Mika

SQL citation aliases trong bảng này (đều dưới `supabase/migrations/`): `20260914000100...` = `20260914000100_evaluation_current_authorization.sql`; `20260914000200...` = `20260914000200_evaluation_workflow_multiteam.sql`; `20260907000600...` = `20260907000600_criteria_config_version.sql`. Dấu `...` chỉ viết tắt citation, không phải tên file để chạy.

| ID | Evidence / ưu tiên | Kết luận và xử lý |
|---|---|---|
| N1 | VERIFIED source; browser reproduce còn thiếu; High | `PeriodActions.tsx:43–57,73–76` chỉ router.refresh; `AuthContext.tsx:166–218,240–247` giữ period list/current object trong provider. Tạo/đóng/xóa/chuyển kỳ cần unified authenticated period refresh + server props/cookie/scoped cache đồng bộ, không F5 và không tái đưa background cache blink. |
| N2 | VERIFIED SQL predicates; DB reproduce còn thiếu; High | Return reset next round nhưng giữ version IDs (`20260914000100...:275–291`); resubmit so existing next config với effective config (`20260914000200...:655–661`). Sequence V1 submit → return → config V2 → resubmit có nguy cơ CONFLICTING_NEXT_ROUND. Fix reset/unsubmitted snapshot lifecycle atomically; không rewrite submitted/closed snapshots hoặc nới conflict guard mù. |
| N3 | VERIFIED source; High; overlaps L2/L4 | `reports.ts:31–35,69–88,112–119,151–183` đọc live criteria/team; criteria rename/delete/max change làm historical analysis đổi dù stored final fields không đổi. Shared snapshot projector phải áp dụng tới reports, dashboard, export và AI đúng phạm vi; legacy thiếu snapshot phải explicit unknown, không backfill từ current config. |
| N4 | VERIFIED differing auth predicates; Medium | Save cho unique primary-Leader fallback khi không có appointed pointer (`20260914000200...:291–314`); return chỉ explicit pointer (`20260914000100...:222–226`). Owner chọn appointment-only cho resolve/init/save/submit/return/current draft read; absent pointer deny dù chỉ có một primary Leader. Submitted historical authorization giữ riêng, không cấp write. |
| N5 | VERIFIED source; Medium | `ai.ts:226–227,247–259`: client limit/offset chưa finite-integer bound; Promise.all theo chunk; quota một lần cho chunk. Cap input/cost/concurrency và thống nhất unit quota giữa mọi caller; test negative/NaN/Infinity/large, duplicates, retry/failure, zero-score/history parity. |
| N6 | VERIFIED missing success cleanup; live growth UNKNOWN; Low | `20260914000200...:356–359,720–724` insert transition context nhưng main-success không delete; return RPC có cleanup. Cleanup mọi successful exit; failure rollback/idempotency/trigger authority phải giữ. Không purge live rows trước forensic + approval. |
| N7 | VERIFIED legacy wrapper/GRANT; reachability UNKNOWN; High latent | 16-arg SECURITY DEFINER wrapper gọi 15-arg (`20260907000600...:571–639,651–655`); later revoke thấy 15/17, chưa thấy closure cho 16. Inventory exact signatures, effective EXECUTE gồm PUBLIC/inherited, owner/trigger dependencies trước retirement. Current app dùng 17 args; chưa chứng minh UI bypass. |
| N8 | VERIFIED audit-error observability gap; Medium | `audit.ts:15–26,43–55` không kiểm Supabase returned error; catch chỉ bắt exception. Log failures có thể im lặng. Kiểm structured error, redacted diagnostic/readback và failure contract; không biến business commit thành thất bại giả hoặc tự chuyển mọi audit vào transaction. |
| N9 | Historical npm-audit warning; exact current inventory UNKNOWN | Re-run full/prod audit + lock versions/reachability trước task dependency update; không chép số CVE/count/version từ output thiếu. Security advisory có applicability thì xử lý CONTROLLED; không bulk npm audit fix hoặc đoán version mục tiêu. |
| N10 | VERIFIED source race risk; chưa concurrency reproduce; High candidate gate | Seed chọn NULL hash (`password-seed.ts:41–45`) nhưng update chỉ `id` (`:73–80`), không recheck NULL/revision. Concurrent reset/change có thể bị seed ghi đè. Add conditional compare-and-set/revision readback và race test; bảo toàn default policy, không bulk credential mutation. |

### 4. Phương án được chọn và Optimality Check

**Chọn incremental integrity-first; tái dùng stack/contract hiện có.** Năm gốc hợp nhất: (1) quyền đọc/DTO chưa khép kín theo viewer và round; (2) kết quả/lịch sử tổng hợp từ live context hoặc vòng chưa chốt; (3) lifecycle reset/period-state thiếu coherence; (4) unbounded reads/chunks cùng returned-error observability; (5) source/catalog/runtime/evidence chưa cùng identity.

1. **Exposure và quyền tối thiểu:** lấy live catalog đúng project khi được duyệt, map direct/transitive browser/server consumers. Serverize sensitive reader còn thiếu trước selective grants cutover. Kiểm functions/sequences/table/column/effective PUBLIC/inherited/default privileges riêng; RLS không thay thế GRANT hay application actor checks. Chỉ deny-by-default nơi không có consumer được phép; không blanket REVOKE toàn schema rồi hy vọng service_role cứu app.
2. **Một nguồn kết quả có thẩm quyền:** dùng projector server-side dựa vào period roster, final fields và immutable per-round snapshot/version. Reuse versioned display/admin readers; batch unique-version IDs. Dashboard/report/settings nhận DTO nhỏ; export/detail có authorized read riêng, không lấy viewport batch làm full dataset. Chỉ chuyển aggregation sang SQL khi measured scale cho thấy server projection chưa đủ, giữ cùng contract và golden tests.
3. **Complete roster trước aggregation:** stable pagination/ID manifest + expected count/uniqueness; tạo kỳ giữ TypeScript evaluator resolution và một atomic create RPC theo contract hiện hữu. Bổ sung DB-side roster/graph consistency validation dưới lock để paginated pre-read không thành race hoặc silently partial period. Không tăng max_rows như fix duy nhất, không tạo mỗi page thành một transaction kỳ riêng.
4. **Lifecycle coherence:** refresh provider period metadata sau mutation rồi invalidate đúng scoped keys/router props; giữ poll không blink. Reset/resubmit version reconcile chỉ trên round được phép mutable trong cùng RPC lock. Save/return share current actor/assignment authority; transition context được cleanup, không weaken closed-write firewall.
5. **Bounded workloads và lỗi quan sát được:** seed CAS trước concurrency, AI input/cost/concurrency bound trước provider; audit structured error được phát hiện. Tối ưu independent reads/projection sau authorization; không đổi default credentials, quota/reset policy hoặc transaction locking ngầm.
6. **Evidence đúng lane:** giữ source-contract/unit tests; thêm real DB concurrency và real Next/HTTP/browser actor matrices trên local disposable service có parity cần thiết. Không relabel mock/bare PG thành Supabase authenticated PASS.

**Rejected/conditional:** nguyên khối P107 của Claude (ép đổi/strict, Excluded, blanket DB lockdown) trái scope/policy hoặc chưa map consumers; rewrite SQL period_stats ngay đầu rủi ro schema/semantics hơn minimal projector; cache framework/PPR/new dispatcher không cần; region/index/roundtrip targets chỉ conditional theo số đo. Không hứa thời gian 1–3 tuần, payload KB hoặc speedup khi chưa có baseline đại diện.

### 5. Integration map từ proposal — task thực thi ở tasks.md

Các `P107-G*` giữ làm integration/coverage map, không phải task IDs hoặc owns. WBS duy nhất là block P107 trong `tasks.md`, với `P107M1T01–P107M1T10`; thứ tự/DAG của WBS thay thế thứ tự proposal ở bảng này. Ba policy đã chốt; runtime UNKNOWN được giữ thành lane gates, không đoán thành PASS. Không dispatch từ bảng G*.

| Nhóm | Dependency | Outcome / surfaces / verification |
|---|---|---|
| P107-G0 — preflight và contract | none | Mika read-only source/catalog/deployed SHA/flags/signup/effective ACL/regions/scale; verify approved Approved-only/draft/appointment contracts. Reconcile historical Git > docs > state trước registration. Thiếu live catalog capability thì UNKNOWN/block live cutover, không thử privileged workaround; local candidate preflight dùng exact repo/disposable baseline. |
| P107-G1 — sensitive read boundary (CONTROLLED) | G0 | S5–S8/S11/N7: `read.ts`, `users-admin.ts`, `evaluations-admin.ts`, `evaluations.ts`, `evaluation-display-admin.ts`, `workflow.ts`, criteria/grade readers và transitive callers được inventory; scoped ACL/RPC migration nếu cần. DoD: malformed-search deny/safe literal, actor/round payload redaction, browser-role deny/authorized server allow, overload effective ACL negative controls, snapshot metadata không lộ khi deny. |
| P107-G2 — complete roster và authoritative result/history (CONTROLLED) | G0, G1; approved report policy | L1–L4/P3–P6/N3: `period.ts`, existing atomic-create SQL, summary/display readers, `reports.ts`, `dashboard.ts`, `PeriodsTab.tsx`, related DTO/chart/export/AI interfaces. DoD: full roster vượt cap; golden stats/role-specific denominator; retired/transferred/history immutable; zero/null/error/legacy states; no raw round notes in summary payload. |
| P107-G3 — period/return/resubmit coherence (CONTROLLED) | G0, G1, G2 roster/snapshot interface | N1/N2/N4/N6, L5/L7: `AuthContext.tsx`, PeriodActions/Modal/Selector/hooks, evaluation actions/RPCs/guards. DoD: create→grade→save→submit→next→return→resubmit→approve→close→new period; config-change return regression; current-actor deny/revoke; duplicate retries/concurrency rollback; no-F5 period truth; closed snapshot/write firewall; no poll blink. |
| P107-G4 — compatible login/seed resilience (CONTROLLED) | G0, G1 | S2–S4/S9/S10/P7/T5/N10: `auth.ts`, `login-rate-limit.ts`, `password-seed.ts`, `users.ts`, auth/credential/seed tests. DoD: giữ đúng default/optional/non-NULL password contract; trusted/spoofed/malformed proxy controls; shared-network availability; account admission atomic; CAS seed-vs-reset conflict không overwrite hoặc claim seeded sai; warning/redacted readback. Credential/settings mutation vẫn approval riêng. |
| P107-G5 — bounded AI và audit truth (CONTROLLED) | G0, G1, G2 result/snapshot interface | S12/S13/N5/N8: AI actions/context/governance/quota callers, `audit.ts`, affected result/export interfaces. DoD: authorized minimized snapshot payload, unknown/out-of-scope non-enumerating response, cap/finite inputs/cost unit/concurrency + idempotent quota outcomes, structured audit failures visible and no committed-business retry masquerade. Provider-live/private data/cost not implied. |
| P107-G6 — đo và tối ưu có điều kiện (STANDARD; CONTROLLED nếu security/DB/config) | G1–G5 functional acceptance | P1–P9/L8/T2/N9: reuse perf harness/release wrapper, selected hot paths; baseline trước performance edit, same fixture/build/roles/regions/network. Chỉ nhận optimization có measured benefit và data/ACL/lifecycle parity. Dependency remediation theo current advisory; index/region/runtime/migration là scope amendment + gated action, không cleanup piggyback. |
| P107-G7 — exact-candidate qualification (CONTROLLED) | mọi nhóm implementation được anh duyệt đã integrated | Freeze exact candidate; focused + root + authentic local matrix + rollback/catalog/cleanup; fresh independent review đúng fingerprint. Trả findings còn lại có disposition, không đóng phase bằng case count/exit0. Push/remote CI/live apply/deploy tách owner-approved release, không tự chạy khi local PASS. |

- **Coverage bổ sung G3:** L6 soft-deactivation/history guard nằm cùng mutable actor/assignment lifecycle; integration surfaces thêm `src/actions/users.ts`, `src/lib/db/evaluations-write.ts` và personnel actor-guard SQL. Positive control: authorized active viewer vẫn thấy đúng historical evaluator attribution sau khi evaluator nghỉ việc; negative: inactive actor không được login/write, không orphan active assignment, không self-delete/erase FK. Nếu cùng file với G4, formal WBS phải serialize/assign owns không overlap.
- **Coverage bổ sung G0/G7:** T1–T4 đi qua catalog/provenance/flag inspection G0 và behavioral/CI-parity qualification G7; không tự rewrite migration history hoặc xóa flag. N9 dependency advisory được triage ngay G0; vulnerability có applicability/material exposure thì remediation CONTROLLED được ưu tiên trước chức năng/perf, không bắt chờ G6. G6 chỉ giữ phần dependency/performance chưa urgent.

**Thứ tự WBS đã chuẩn bị:** T01 preflight → T02 applicable dependencies → T03 quyền đọc + appointment → T04 compatible seed/auth → T05 roster/personnel → T06 result/history → T07 lifecycle/provider → T08 AI/audit → T09 đo perf → T10 final qualification. T02 không nâng package nếu không có advisory applicable. T09 ưu tiên đo, không tự mở owns hot-path/region/index. Cleanup thuần T6/P8/L8 ngoài minimal fix có thể để sau. Nếu preflight chứng minh live exposure, containment cần approval đúng action; urgency không là waiver. Pi5 một Runner/verifier tại một thời điểm; không tạo phase hoặc dispatcher mới.

### 6. Contracts cụ thể và acceptance matrix

#### Kết quả chính thức / tiến độ / lịch sử (Approved-only đã được owner duyệt)

- Progress: period roster/evaluation status theo snapshot và authorized scope; unfinished/frozen/unassigned nói đúng trạng thái. Result: Approved + persisted finalScore/finalGrade; final 0 giữ nguyên, absent/inconsistent result là unknown/error, không latest-round fallback.
- Phần trăm từng Approved result phải dùng max của pinned criteria version và audience/subject-role tương ứng. Không chia team mean bằng tổng max của mọi role. **Không tự đổi công thức tổng hợp/ranking cross-role:** T06 giữ thống kê cùng role/config tương thích, kèm sample/coverage; nếu các max không tương thích, trả trạng thái mixed-basis và breakdown thay vì một số sai. Mean-of-percent hoặc ranking liên chức danh là đề xuất còn owner-gated, không chặn Approved-only và immutable history fixes.
- Closed history không đổi khi rename/delete criteria, đổi grade config, chuyển team/role, deactivate user/team. Dùng snapshot ID/team/role hiện có; label/roster fields chưa đủ thì design immutable capture cho tương lai. Legacy không có snapshot không suy diễn từ current data, không broad backfill.
- Fixture vàng riêng, expected values tính độc lập bằng tool: tất cả năm role, mọi trạng thái, zero/null/missing versions, đa team, chuyển team/nghỉ việc, mixed config versions. Kiểm từng số/denominator/row ID không chỉ screenshot hoặc "top đã hiện".

| Matrix | Positive + negative controls bắt buộc | Evidence cần |
|---|---|---|
| Auth/ACL | anon, authenticated Supabase token, app session năm role; unauthorized team, missing/revoked scope; PUBLIC/inherited/direct EXECUTE; declared config consumers vẫn chạy | Real Auth/PostgREST nơi ACL/signup được test; exact catalog signatures/definitions/ACL + HTTP DTO readback; không đọc/log hashes/HR data thật |
| Draft confidentiality | current assigned evaluator/active Manager allow; Manager readonly trừ khi được phân công; SELF thấy own draft; subject/next/other evaluator deny nháp; submitted historical positive control; return làm nội dung mutable thành draft-private | Payload list/detail/history/display/export/AI và browser DOM/network; serialization redaction trước response; role/scope/appointment recheck, không role-only edit |
| Lifecycle | đủ số vòng từng role; save draft/submit/return/re-submit, V1→V2 sau return; missing/ambiguous/current revoked evaluator, response-loss retry; freeze unfinished và new period | Real actions + before/after evaluation/round/history/config graph; same-session stale-form denial và no partial writes |
| Races | create/create chỉ một Active; close/save, return/submit, version-edit/resubmit, assignment/deactivate, seed/reset; failed mutation leaves graph/credentials unchanged | Hai DB connections thật hoặc authentic action concurrency; captured winner/denial/digests, rollback/readback |
| Completeness | 0/1, local cap boundary và 1500 synthetic active users; nhiều kỳ; missing assignments; scoped counts/pagination/duplicates; roster churn lúc tạo kỳ | DB expected IDs/counts vs created IDs/counts; no truncated success, no silently missing users/rounds |
| Resident UI | create/close/select/delete-empty không F5; cookie/provider/server props cùng period; late-response/logout/revoke không old payload; unchanged poll không blink | Real browser interaction, final URL/DOM, mobile+desktop, console/network, loading/error/empty/retry states |
| Audit/AI failures | returned DB error và thrown error, invalid chunk, timeout/cancel/retry/duplicates/quota race, zero-score and immutable snapshot | Redacted structured outcomes + DB readback; provider calls/cost unit recorded only in approved live lane |

#### Loading dependency graph và performance gate

- Giữ composition/copy/assets hiện có; không redesign. `authenticated scope → shell + period/filter metadata → light counters/identity → authorized chart/detail/AI summaries`. Shell không chờ full raw dataset; heavy request chỉ sau scope/input cần thiết. Dashboard light/heavy hiện có independent requests (`DashboardDataLayer.tsx:160–165`): không serialize lại nếu không có dependency mới thật.
- Reports hiện dùng một aggregation action cho KPI/charts (`ReportsDataLayer.tsx:44–102`); ưu tiên thu nhỏ server DTO/reader trước tách thành nhiều actions. Heavy failure không làm mất shell/light; local loading/error/empty/retry đúng, score pending không giả 0.
- Milestones: shell-visible, first-light-visible, first-heavy-complete, full-complete; đo cold/warm riêng, thời gian auth/action/DB/RPC/audit/serialization/browser và request/response bytes. FCP/LCP thiếu entry phải UNKNOWN, không thay bằng DOM timing giả.
- Fixture baseline/candidate giống nhau: build production local, authentic services, synthetic dataset theo approved scale/roles/nhiều kỳ, 5 samples/point median+p95; loopback và deployment/RTT-controlled lane ghi riêng. Fixture parity + numerical row/result/ACL equality **trước** performance verdict.
- Mục tiêu proposed, không phải số đã đạt: giữ LAN/loopback dataComplete median <1000ms cho route được đo; submit p95 <800ms chỉ ở lane RTT thấp được định nghĩa; route-summary payload budget chốt theo baseline đo thật. Không áp loopback budget vào production WAN hoặc cam kết thời gian hằng số khi dữ liệu tăng.
- Tối đa hai bounded performance fixes rồi remeasure; nếu không đạt, giữ evidence + residual, không waiver/PASS giả. Chỉ đổi region/index/cache/query boundaries khi attribution cho thấy lợi ích material mà không regress correctness/security.

### 7. Verification, approval, rollback và điều kiện dừng

1. **Trước registration:** kiểm accepted AGENTS/protocol, canonical Git/docs/state drift, missing `.ai/PROJECT_TOOLING.md`, liveness/reservations, owns/locks/interfaces và approval. Hiện state còn canonical_head `d0e11f8...`/phase P105 và historical runner_liveness=LIVE trong khi active task/IDs/reservations/candidate/publish_turn/integration_claim rỗng; HANDOFF nói P106 open, ledger P106 [x]. Không lấy các trường cũ làm current process/evidence, không sửa chúng trong scope update này.
2. **Root gates trên exact candidate:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `node scripts/scan-source-secrets.mjs`; diff/scope/secret checks. Không dùng `node --test tests/` thay canonical runner. Ghi từng exit/status, errors và warnings riêng.
3. **Runtime gates:** reuse `scripts/verify-release.mjs --suite confirmation-matrix --tier authenticated`, production-smoke và relevant checked-in suites sau runtime preflight; bổ sung behavior cases trong suite manifest khi formally assigned. Không tạo test-only auth/API adapter, disable triggers, đổi guards hoặc label case không có assertion/readback.
4. **Parity gates:** Auth/PostgREST catalog privileges/default exposure giống target được duyệt; negative control cố tình mở grant/missing RLS/extra overload ở disposable DB phải làm verifier fail. Không suy ra exploit từ `auth.users > 0`; số này chỉ là tín hiệu cần điều tra.
5. **Exact provenance:** BASE/candidate Git SHA, owned tree hashes, migration/function/ACL fingerprint, evidence path/digest, fixture IDs/lane/build/versions; giữ failure đầu tiên, không trộn report cũ/current. Fresh CONTROLLED review sau automated verification; candidate/base/evidence/interface/risk đổi làm review stale.
6. **Protected gate:** quyền/security/credentials, private-data access, production catalog/flags/settings, migrations/deletes/region, paid provider traffic, shared-branch push và deploy cần explicit approval đúng action. Approval cho plan không cấp các quyền đó; source candidate và production apply là hai stage riêng.
7. **Rollback:** code candidate giữ exact task-owned patch/snapshot và base; DB preflight catalog/rows/provenance fingerprint + selective restoration script có apply→rollback→reapply proof. Grants restore từ captured ACL cho đúng objects, không GRANT ALL; credential rollback không tự restore hash cũ vì có thể phục hồi credential bị compromise. Live rollback cần approval/maintenance/identity gate, không revert mù data đã có write mới.
8. **Stop:** unexpected schema/ACL/graph shape, consumer chưa inventory, policy chưa chốt, uncertain liveness/rollback, missing credential/access approval, wrong target/fixture/candidate identity → block affected stage, không downgrade tier. Repeated quality failure theo repair budget AGENTS; transport/setup mismatch giữ riêng, không tính product PASS/strike giả.
9. **Closure:** từng accepted finding có behavior evidence hoặc owner disposition; no security/correctness unknown required by DoD; root/runtime/review trên cùng exact candidate; fixtures giữ tới full matrix xong rồi cleanup exact IDs/resources và readback zero residue. Local qualification không tự chứng nhận production rollout/domain bundle/migrations.

### 8. Open loops của kế hoạch

| State | Việc |
|---|---|
| Do now | Lưu proposal vào file này; không implement/register/reopen historical phases. |
| Do now | Ba policy report/draft/appointment đã OWNER_APPROVED; lưu WBS một phase, self-check và fresh plan review. Không hỏi lại default password/private/policy đã chốt. |
| Need approval | Canonical planning commit + atomic READY registration và bắt đầu implementation là bước kế tiếp sau chuẩn bị. Cross-role mean-of-percent/ranking mới vẫn owner-gated; không ngầm đổi scoring. |
| Need approval | Scoped live catalog/settings/private-data reads và mọi protected cutover/release; không tự nhờ anh chạy SQL khi agent có approved read path đúng target. |
| Monitor | Historical-public residual, runtime grants/RLS/signup/flags/deployed SHA/regions và fixture scale; UNKNOWN tới khi có evidence. |
| Ignore | Ép đổi mật khẩu/bulk backfill/strict theo review, tự thêm Excluded/Approved-only close, broad cleanup/framework/dispatcher; ngoài proposal được chọn. |

`PLAN_REVIEW_RECORD=/home/pi5/hermes-artifacts/kurabe-p107-plan/plan-verdict.json`; `TASKS_DEFINED=10`; `TASKS_REGISTERED=NONE`; `DISPATCHABLE=NO`; `APPLICATION_FIXES=NONE`; `PRODUCTION_WRITES_MIGRATIONS=0/0` trong lượt chuẩn bị. Review chỉ hợp lệ khi record có full-read PASS và hashes khớp các document hiện tại; absent/mismatch là UNKNOWN. Không tick DONE từ plan hoặc claim hệ thống đã an toàn/đúng/nhanh.

### 9. Một phase / readiness boundary

- WBS: `tasks.md` block P107, một milestone M1, 10 logical tasks; tất cả `[ ]`, `Status=PLANNED`, không READY. Không Kanban/service/database mới.
- Decision record: `.ai/DECISIONS_LOG.md` entry P107; tooling bindings: `.ai/PROJECT_TOOLING.md`; next-step snapshot: `HANDOFF.md`.
- `PLANNING_BASE_SHA=5f0c95f37ffa5155b4f7ba26e9ea6f61991925ee`. Đây là source baseline, không copy vào runtime state như base của task tương lai. Khi canonical planning commit được anh cho phép, reconcile state dưới lock rồi đăng ký toàn batch READY; trước mỗi dispatch, state BASE_SHA phải bằng current canonical HEAD chứa dependencies integrated.
- Lượt chuẩn bị không đổi `.state/agent-state.json`: historical P105/P106 fields được giữ nguyên; HANDOFF mới chỉ mô tả draft WBS. Giữ original uncommitted master-plan nội dung từ lượt trước; không absorb vào product commit.
- Final local qualification là mục tiêu phase; production catalog/apply/credential operations/push/CI/deploy là release gates ngoài phase, không phát sinh task live tự động. Không re-open P103–P106.
