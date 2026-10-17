# Kurabe — current plan and closed execution record

## P108 — 3 bộ tiêu chuẩn độc lập Leader / Staff / Worker (CURRENT PLAN, revised 2026-10-17)

**Status:** `PLANNED / IMPLEMENTATION_NOT_STARTED / NOT_REGISTERED`. This is the single canonical P108 plan. It supersedes the 2026-10-16 P108 text (Git `bd89e183238a91d6948dc027629cba5d1657546e`) after two review rounds (Mika + ChatGPT, 2026-10-17). Executable WBS: `tasks.md` § P108 (all `PLANNED`). This update is planning only: no application code, SQL, data, production, deletion or deployment change. P103–P107 below remain provenance and are not reopened.

**Sources:** workbook `/home/pi5/projects/kurabe/TCDG2026.xls` (anh-owned, untracked, never modified), SHA-256 `3e3cfd7eddc18567eb3dfaaaf6586696044681fbfb337df845d043d884811743`, verified on Pi5 2026-10-17; content is OOXML despite the `.xls` extension. Source baseline `bd89e183`. Live Supabase schema, catalog, PostgreSQL version and data remain `UNKNOWN` until P108M1T01.

### P108.1 Decisions

**Decided by owner:**

1. Three data-independent sets: `leader` = Manager, Leader, SubLeader (33 criteria, 6 groups); `staff` = Employee (30, 6); `worker` = Worker (30, 6). Total 93 criteria / 18 groups. Each set has its own group, criterion and level UUIDs, codes, wording and points. Never match criteria across sets by code, name, position or translation.
2. Code = group letter + Vietnamese column-A number of the workbook. Leader: `A1–A8, B9–B10, C11–C15, D16–D21, E22–E28, F29–F33`. Staff and Worker: `A1–A8, B9–B10, C11–C15, D16–D20, E21–E25, F26–F30`. A code is unique only inside its set (example: the improvement criterion is `leader:E23`, `staff:E22`, `worker:E24`). Section G (maternity / contract-suspension months) is not a scored criterion.
3. One evaluation engine and one global immutable criteria version stream. Reuse P99 `validate_criteria_config` / `get_active_criteria_config` / `save_criteria_config` with CAS. The P107 evaluation writer and guards stay unchanged unless a real test proves an incompatibility. No three engines, no per-set version streams, no draft/publish/approval/scheduling, no new framework or admin tables.
4. `/criteria`: three set tabs; each tab shows only that set's groups (A–F), keyed by UUID. Flow: choose set → add/edit/delete → Save. One effective Save = one version; a Save with unchanged content creates no version. The multi-audience checkbox and audience-update path are removed. Manager-only writes.
5. Criteria writes are rejected while any evaluation period is `active`. SQL is the authority; the UI shows the same rule.
6. Unchanged: negative criterion-level points, arithmetic total, grade bands and thresholds, `total_score >= 0` / `final_score >= 0` checks, the five-role workflow, Approved-only official results, P107 lifecycle (close freezes unfinished work; there is no reopen).
7. Every read, write, score and display path uses the set of the subject role snapshot `evaluations.employee_role`, never the current `users.role` or the grader's role.

**Open — not authorized by this plan:**

- **D1:** trial-evaluation disposition before cutover (task P108M2T01). No existing path deletes evaluations safely (see P108.2). The owner chooses: keep them frozen in a closed period, or approve a dedicated purge RPC that uses an explicit, audited transition context. Disabling triggers or deleting immutable history is not allowed.
- **D2:** cross-set raw-score KPIs (overall average, Top 5, team average). Recommendation: per-set average and per-set Top 5. Current behaviour stays until approved.
- **D3:** comparability when grade versions differ inside one report. Recommendation: flag/note only, no hidden policy change.
- **G1 business sign-off** (task P108M1T02): Worker numeric points and maximum (the Worker sheet has no numeric columns or total row; values are derivable from the group headers and penalty text for 28/30 criteria); Worker criterion 8 "Không có" points; per-criterion meaning of `-` for criteria 4–8 and 15 in all sets (criterion 15 has no "0 proposals" option, yet its `-` columns carry 0 in the Leader/Staff totals); A1 boundaries (VI "Trên" vs JA "以上", overlapping "Dưới 95%" / "Dưới 93%"); C14 (VI "4+/3" vs JA "5+/4"); Staff JA numbering lag; the number of selectable levels per criterion; the default level; the effective date (change log: 2026/10/01) and which period first uses it. Proposal: Vietnamese revision 07 is authoritative (the Leader Japanese header reads `Lbh: 06`). No guessed points are imported.

### P108.2 Verified facts that drive the design

| Area | Fact | Evidence |
|---|---|---|
| Uniqueness | Global `UNIQUE(code)` on live groups/criteria also counts inactive rows; save never deletes, it deactivates and upserts; version tables have `UNIQUE(version_id, code)`; the save RPC temp tables have `code UNIQUE` | `db/bootstrap/baseline.sql:213-214`; `supabase/migrations/20260907000600_criteria_config_version.sql:68,82,413,416,469-495` |
| Writer | The P107 writer is catalog-agnostic: every persisted save must carry the active criteria version; scores are validated by criterion UUID | `supabase/migrations/20261008000300_p107_lifecycle_coherence.sql:494-513`; `src/lib/evaluation-round-validation.ts:114-142,273-277` |
| Scoring readers | Readers filter by audience; they keep working when audience = set | `src/lib/db/criteria-admin.ts:42-46`; `src/lib/db/criteria.ts:115-122` |
| History | Display returns every group of the pinned version (no role filter); one empty group makes the whole version `unavailable`; the loader reads five tables without pagination under `max_rows = 1000`, so a truncated read can leave a criterion with fewer levels that still looks authoritative | `src/lib/db/evaluation-display-admin.ts:86-89,98-108,157-175,255-257`; `supabase/config.toml:18` |
| Reports | Criteria breakdown is keyed by `group.code`; snapshot lookup uses `configKey` = criteria version id; average, Top 5 and team average use raw scores across roles | `src/lib/evaluation-result-projection.ts:224,237,317,323,329-347,389-404` |
| Other consumers | Radar keyed by group id with set-duplicated labels; AI uses the live catalog for historical Approved rounds and selects the period by name; compare filters by current `users.role`; heatmap hardcodes A–F names and keys by code; criteria page and modal key by code and list every group | `src/actions/dashboard.ts:310-311`; `src/actions/ai.ts:95-104,121,293`; `src/app/evaluations/[id]/compare/ComparePageClient.tsx:190-193`; `src/components/reports/CriteriaHeatmap.tsx:26-27,66-74`; `src/app/criteria/page.tsx:157-171,338`; `src/components/modals/CriteriaModal.tsx:44-46,168`; `src/hooks/use-evaluation-page-state.ts:345,349` |
| Version churn | The checksum hashes the payload including the previous version metadata, so every Save creates a version | `20260907000600_criteria_config_version.sql:462-464`; `src/actions/criteria.ts:61-68` |
| Lifecycle | At most one active period; close only moves `active → closed`; create always inserts `active`; no reopen path | `db/bootstrap/baseline.sql:255`; `src/actions/period.ts:240-248`; `20261008000200_p107_roster_personnel.sql:237-248` |
| Deletion | Round DELETE is blocked unless a `save_rpc`/`return_rpc` transition context exists; history labels are FK `RESTRICT` + immutable trigger (no writer found in repo); period delete only for an exactly empty closed period | `20260911000300_evaluation_transition_guard.sql:281-289,303-306`; `20261008000200_p107_roster_personnel.sql:1143,1180`; `20260826010000_p96t04_atomic_period_lifecycle.sql:250-290` |
| Workbook | 33/30/30 criteria, 6 groups each; Leader maximum 190 (row 51), Staff 175 (row 48); Worker sheet has no numeric columns or total; criterion 15 F/G = `-` with 0 in the totals; Leader JA `Lbh: 06` vs VI `Lbh: 07`; change log effective date 2026/10/01 | Leader rows 5–52 (G2/S2, H51), Staff rows 5–49 (H48), Worker rows 5–49, change-log sheets row 9 |

### P108.3 Target architecture

```text
criteria_groups(set_key) ──┐ composite FK criteria(group_id,set_key) → criteria_groups(id,set_key)
criteria(set_key) ─────────┘ criterion_audiences: exactly one row, derived from set_key
        │ save_criteria_config = the only writer (CAS, Active lock, canonical checksum)
        ▼
criteria_config_versions (one active, global) + *_versions(set_key; NULL = legacy snapshot)
        │ get_active_criteria_config (adds set_key, otherwise unchanged)
        ▼
scoring readers + P107 writer (unchanged)    history/report readers: subject-role filter, set-aware keys
```

- **Data:** `set_key text CHECK (set_key IN ('leader','staff','worker'))`, nullable, on `criteria_groups` and `criteria`. `UNIQUE(id, set_key)` on groups plus composite FK `criteria(group_id, set_key) → criteria_groups(id, set_key)`: a criterion cannot belong to a group of another set. Active-only unique `(COALESCE(set_key,'~legacy'), upper(btrim(code))) WHERE is_active` on each table replaces the dropped global `UNIQUE(code)`. Legacy rows keep `set_key = NULL` and are never deleted; legacy active duplicates stay rejected; re-creating a deleted code is allowed. Version tables get nullable `set_key` with `UNIQUE(version_id, code) WHERE set_key IS NULL` and `UNIQUE(version_id, set_key, code) WHERE set_key IS NOT NULL`.
- **Writer:** `save_criteria_config` takes `LOCK TABLE evaluation_periods IN SHARE MODE` first, then the existing advisory lock, then rejects if any period is `active`. It must run under READ COMMITTED (the PostgREST default; asserted). CAS is unchanged. The payload must give `set_key` for every group and criterion; criterion set = group set; an existing UUID cannot change set; audiences are derived server-side (`leader→management`, `staff→employee`, `worker→worker`) and client audiences are ignored; codes are unique per set; empty groups are allowed. The checksum is computed from the normalized temp-table content; identical content returns the current version without creating one.
- **Readers:** scoring readers stay audience-based. One role→set helper lives in `src/lib/criteria-applicability.ts`. History and display use one rule for legacy and P108 versions: keep criteria whose roles include the evaluation's role snapshot, drop empty groups. The snapshot loader reads per version with bounded pagination and exact counts; any incomplete read makes that version `unavailable`, never partially authoritative.
- **Reports:** keep `configKey = versionId` for the snapshot lookup. The criteria-breakdown key becomes `setKey:code` (legacy `NULL` keeps the old `code` key and numbers), with labels taken from the snapshot. Radar is per set. Counts, progress, Approved count and grade distribution aggregate across sets. Raw average, Top 5 and team average stay unchanged until D2.
- **Future change:** adding or editing a Leader criterion is data only through `/criteria`; no SQL, migration or code change; Staff/Worker UUIDs and content stay byte-identical; a new global version is created.

### P108.4 Migration contract

One forward migration plus one tested rollback artifact. Applied migrations are never edited.

1. **Preflight (fail closed):** required tables and functions exist with their P99/P107 provenance comments; exactly one constraint matches each legacy unique definition (`criteria_code_key`, `criteria_groups_code_key`, and the two auto-named `UNIQUE(version_id, code)` constraints, located by definition, not by assumed name); no duplicate normalized active codes; P107 writer present.
2. **DDL:** add the columns, `UNIQUE(id, set_key)`, the composite FK and the replacement unique indexes, then drop the four legacy unique constraints, all in the same transaction.
3. **Functions:** replace `validate_criteria_config`, `get_active_criteria_config` and `save_criteria_config`. Diff each body against `20260907000600_criteria_config_version.sql`; only the intended deltas are allowed. Grants unchanged.
4. **No `CHECK … NOT VALID`:** PostgreSQL still checks it on every new INSERT/UPDATE, so it adds risk without benefit. Enforcement lives in the single writer, the composite FK and the unique indexes, proven by tests.

**Compatibility window:** after the migration the currently deployed app can still read (extra JSON keys are ignored; version readers select explicit columns), but its criteria saves are rejected because its payload has no `set_key`. This is accepted inside the maintenance window: with no active period there are no evaluation writes. It must be proven in P108M1T10 by running the deployed-SHA app read smoke against a migrated, not-yet-imported disposable database.

**Rollback artifact `db/rollback-p108-criteria-sets.sql`:**

- **(a) revert-import:** guarded so it runs only when the latest version is the import version, no round pins it, no later version exists and no period was created after the import. It reactivates the previous version's live projection and the active pointer.
- **(b) schema rollback:** restores the previous function bodies, drops the new indexes, FK and columns, and recreates the global `UNIQUE(code)`. Guard: no active P108 rows.

Qualified on a disposable DB in the order apply → import → (a) → (b) → reapply.

### P108.5 Release, cutover and rollback

**Preconditions:**

- P108M1T10 PASS on the exact candidate, including a fresh independent review;
- G1 signed manifest (SHA recorded);
- D1 executed, or explicitly re-decided by the owner;
- backup and restore proof;
- no `active` period;
- an agreed maintenance window.

Every production step needs its own explicit owner approval.

**Steps:**

1. **Backup:** `supabase db dump` (roles / schema / data) through the pooler with a `pg_dump` matching the server major version. Files mode 600 with SHA-256, kept under `/home/pi5/hermes-artifacts/kurabe-p108/backup/`.
2. **Restore proof:** restore into an owned, loopback-only disposable local Supabase stack at the production major version with `ON_ERROR_STOP`. Row counts, ordered md5 of key tables, migration ledger, function md5s and `get_active_criteria_config()` must equal the production readback taken in the same window. A successful dump alone is not proof. Destroy the stack and read back zero residue. Dumps contain personnel data: restricted path, owner-approved retention and deletion.
3. **Migration:** apply by name in one transaction, record the ledger row, read back object and function fingerprints.
4. **App:** push; verify the Vercel production deployment SHA, the `lykiv.vercel.app` alias and a smoke on the still-legacy catalog.
5. **Import:** call `save_criteria_config` with the signed-manifest payload and the expected version. Read back 6/6/6 groups, 33/30/30 criteria, per-set canonical hash = manifest, exactly one audience per criterion, new version active.
6. **Smoke:** read-only checks as Manager, Leader, Staff and Worker. The owner creates the next period when ready.

**Rollback by stage:**

| Stage | Allowed action |
|---|---|
| Before migration | Nothing to roll back |
| After migration, before import | Schema rollback (b); redeploy the previous app if needed (the new app also renders the legacy catalog) |
| After import, before any business data (no newer version, no new period, no round pinned to the import version, no catalog edit) | Revert-import (a), then optionally (b) |
| After any P108 business data | No revert and no old-app redeploy (the old app cannot render a three-set catalog). Freeze criteria edits and fix forward under control. Restoring the backup is only for catastrophic corruption, with a loss analysis of data written since the backup (sessions, audit, personnel, evaluations) and an owner decision |

### P108.6 Acceptance gates

Behavioural tests only, kept to what protects correctness, integrity or access:

- **Schema/RPC (disposable PostgreSQL, real RPCs):**
  - unique: same code in different sets accepted; duplicate inside a set rejected (case/space normalized); duplicate active legacy `NULL` codes rejected; re-created deleted code accepted;
  - set integrity: cross-set group link rejected; a UUID cannot move to another set; exactly one audience per criterion, equal to its set;
  - legacy versions still readable;
  - P107 save/submit/return work on a three-set catalog;
  - CAS: two concurrent Managers → exactly one `STALE`;
  - an unchanged Save creates no version;
  - adding a Leader criterion leaves the Staff/Worker canonical hash and UUIDs unchanged.
- **Concurrency on two real connections:** waits proven via `pg_locks`, bounded timeout, no deadlock. Cases: create period ↔ save; close period ↔ save; evaluation writer ↔ save; direct RPC while active is rejected.
- **Import:** exactly 18 groups / 93 criteria from the manifest; an unsigned manifest is refused outside disposable targets; readback hashes match.
- **History:**
  - pagination beyond 1,000 rows across at least 3 versions;
  - a simulated truncated read yields `unavailable`;
  - empty group handled;
  - legacy and P108 rounds display only the subject's set.
- **App and browser** (real local Supabase stack, synthetic fixtures):
  - `/criteria`: three tabs with UUID keys; the Active lock blocks both UI and SQL;
  - all five roles run Draft → Submit → Return → Resubmit → Approved across the three sets;
  - a role change mid-period keeps the snapshot set;
  - compare page; history before and after P108.
- **Reports, AI, export:**
  - golden numbers; no group mixing across sets; legacy numbers unchanged;
  - radar per set;
  - AI prompt uses the pinned snapshot and a period id (prompt-builder test, no paid provider call);
  - export columns per set.
- **Release gates:** `npm test`, `npm run lint`, `npm run typecheck`, isolated `npm run build`, secret scan; catalog-size smoke with the existing performance harness; old-app read smoke against the migrated database.

### P108.7 Non-goals and markers

**Out of scope:** KPI policy change before D2; grade-band or threshold changes; per-set versions; draft/publish; mass personnel rework; 1,500-roster or production-data staging tests; unrelated refactors or new frameworks. Fix only directly related defects.

**Markers:** `P108_PLAN_TASKED=YES`; `P108_TASKS_REGISTERED=NO`; `P108_APP_CODE_CHANGED=NO`; `P108_DB_MIGRATION_APPLIED=NO`; `P108_TRIAL_EVALUATIONS_DELETED=NO`; `P108_PRODUCTION_DEPLOYED=NO`; `WORKBOOK_SIGNED_OFF=NO`; `LIVE_SUPABASE_VERIFIED=NO`.

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
