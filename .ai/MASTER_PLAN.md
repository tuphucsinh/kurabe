# MASTER_PLAN.md

> **Canonical phase plan — Kurabe QAQC**
>
> MASTER_PLAN chỉ giữ **trạng thái, phase, scope, invariants và phase gates**.
> WBS/task chi tiết chỉ nằm ở `tasks.md`. Evidence/lịch sử chi tiết nằm ở
> `.ai/DECISIONS_LOG.md`, `.ai/KNOWN_BUGS.md`, phase plans và Git history.
>
> **Truth order:** production/runtime evidence → canonical `main` → tracked evidence → docs.
> Nếu các nguồn không khớp: **STOP**, không auto-heal và không production mutation.

## 1. Current state

- Canonical branch: `main`
- Canonical source SHA tại lúc lập plan: `c300719de60f9eb9993da896f54d20070395ae9e`
- Production: `https://lykiv.vercel.app`
- Production source linkage: VERIFIED tại repository reconciliation 2026-09-05.
- Previous branch/source split: CLOSED.
- Baseline quality: lint PASS; typecheck PASS; tests PASS `37/37`; build PASS; `git diff --check` PASS.
- `npm audit --omit=dev`: 0 production vulnerabilities tại re-audit.
- Full audit còn dev/transitive advisories: `browserslist` high, `@babel/core` low.
- Next.js source hiện tại: `16.3.2`; phải nâng sang patched `>=16.3.3`.
- Release state: **NOT RELEASE-HARDENED** vì còn P0/P1.
- Production DB catalog: **PARTIALLY UNKNOWN** cho một số RLS/grants/functions/index/runtime flag; không suy đoán từ SQL file/comment.

### Active blockers

- **P0:** NULL-password normal-login bypass.
- **P1:** framework security patch; historical snapshot mutation; evaluator NULL-safety; sensitive anon-read live state; DB reproducibility; non-atomic user/evaluation init; AI privacy/provider governance.
- **P2:** config atomicity; framework route/proxy maintenance; CSP enforcement; AI quota/truncation/disclosure; dev dependency advisories; measured UI/performance residuals.

## 2. Non-negotiable invariants

### Auth / RBAC
- Sensitive Server Action tự authorize bằng server session/role.
- Không tin actor/role/team/permission từ client.
- `supabaseAdmin` chỉ server-side.
- `password_hash = NULL` không là normal authenticated credential khi enforcement bật; compatibility mode passwordless chỉ là ngoại lệ test tạm thời, phải có flag explicit và không được coi là hardening hoàn tất.
- Reset/setup credential phải one-time, short-lived, hashed-at-rest, atomic consume/revoke.
- Credential reset phải revoke prior sessions.

### Evaluation / period
- Tối đa 1 `Active` period ở DB; app fail-closed khi zero/multiple theo đúng route contract.
- Detail/Compare dùng concrete server-resolved `period_id`; không `undefined`/localStorage/cookie làm authority.
- Closed period immutable ở app và SQL/RPC, kể cả stale tab.
- Historical evaluation/round là snapshot theo kỳ; profile hiện tại không rewrite lịch sử.
- Evaluator authorization phải NULL-safe.
- Write graph cần consistency phải atomic.
- Không đổi scoring/grade/workflow semantics trong hardening phases.

### DB / privacy
- Sensitive HR/evaluation data không anon-read nếu không có explicit business approval.
- DB object quan trọng phải có migration provenance + rollback + clean-bootstrap path.
- AI chỉ nhận minimum-necessary data; provider/retention/DPA/allowlist phải explicit.

### UX / performance
- Measure before optimize.
- Không claim performance bằng spinner/FCP.
- Không thêm cache/PPR/query split/virtualization/dependency nếu chưa có measured net benefit.
- Không regression responsive/accessibility/navigation/overflow/console/network.

## 3. Phase history — compressed

| Phase | State | Summary |
|---|---|---|
| 32–93 | DONE | Nền tảng Supabase, workflow, reporting, auth guards, AI features, responsive/loading, transaction hardening và audit trước. |
| 94 | CLOSED / absorbed | Staged-loading work hấp thụ vào Phase 95. |
| 95 | DONE | Static-first evaluation detail + authenticated responsive canary. |
| 96 | IMPLEMENTED / production-applied | Multi-period integrity, Active resolver, atomic period lifecycle/write firewall, compare optimization. |
| 96E | **PAUSED / execution-gated** | Read-only lifecycle baseline/rollback preparation đã xong; production lifecycle/rollback E2E còn pending explicit approval + maintenance/no-concurrent-write gate. |
| 97 | DONE / production deployed | Read-only closed-period history route + auth/RBAC + navigation. |
| Repository reconciliation | DONE | Hardening history đã vào canonical `main`; source-of-truth split đóng. |

### Closed findings — không reopen nếu không có regression evidence

- Detail/Compare `periodId=undefined`.
- Active resolver zero/multiple fail-closed ở source.
- Closed-period application write guard.
- Atomic period-create wiring.
- Closed-period target update guard.
- Closed-period history route/query + RBAC.
- Sensitive application writes moved server-side.
- Repository branch/source split.

### Live DB proof vẫn cần

Source/candidate không thay production catalog proof cho:
- single-Active index;
- exact evaluation RPC definitions/signatures;
- execute grants;
- exact RLS/table grants;
- anon revoke state;
- effective transactional-RPC runtime flag.

---

# 4. Phase 98 — Release Blockers & Production Truth

**State:** ACTIVE / highest priority.

**Goal:** đóng auth/framework/authorization blockers và biến production DB security state từ `UNKNOWN` thành evidence trước khi mở rộng hardening.

**Scope:**
- patch Next.js sang patched 16.3 release;
- chuẩn bị loại bỏ NULL-password normal login bằng controlled setup/reset path; trước khi UI hoàn tất, giữ temporary passwordless compatibility exception đã được anh phê duyệt;
- inventory/migrate legacy NULL-password accounts an toàn;
- read-only production catalog reconciliation;
- fix evaluator NULL authorization ở reviewed SQL/RPC;
- controlled production rollout/readback cho các blocker sau explicit approval.

**Parallelization policy:**
- `tasks.md` định nghĩa dispatch waves và exact dependencies.
- Read-only catalog và framework patch chạy độc lập.
- Sau catalog, auth candidate và evaluator-SQL candidate có thể chạy trên **separate worktrees/runners** với file ownership tách biệt.
- Production DB mutation/canary luôn **serial**, không parallel.
- Mika là người duy nhất merge/commit/tick task sau independent verification.

**Out of scope:** historical snapshot fix, broad RLS refactor, DB baseline rewrite, AI redesign, performance tuning.

**Phase gate:**
- P0 = 0 trên deployed/runtime path;
- Next patched version deployed/readback;
- production catalog evidence captured;
- NULL/wrong evaluator rejected bởi reviewed/live path;
- lint/typecheck/tests/build/diff PASS;
- auth/DB/backend/production changes có fresh Reviewer PASS.

---

# 5. Phase 99 — Data Integrity, RLS & DB Reproducibility

**State:** PLANNED.  
**Depends on:** Phase 98 DONE.

**Goal:** bảo đảm historical data bất biến, required write graph nguyên tử, sensitive reads least-privilege và DB tái tạo deterministic.

**Scope:**
- historical snapshot immutability;
- atomic user + Active evaluation + round/evaluator initialization;
- sensitive client-read inventory và serverization;
- revoke anon SELECT + least-privilege RPC grants;
- canonical current-schema baseline + ordered forward migrations;
- clean DB recreate + schema-drift gate.

**Parallelization intent:**
- historical-snapshot lane và sensitive-read inventory lane có thể khởi động độc lập sau Phase 98.
- DB migration/apply work chỉ serial tại controlled gate.
- Exact WBS chỉ băm khi Phase 99 ACTIVE.

**Phase gate:**
- no historical rewrite regression;
- no orphan/false-success write path;
- anon sensitive reads denied;
- clean DB bootstrap equivalent với expected production schema;
- DB integration/fault-injection PASS;
- fresh Reviewer PASS.

---

# 6. Phase 100 — Configuration, Framework & AI Privacy Hardening

**State:** PLANNED.  
**Depends on:** Phase 99 DONE.

**Goal:** đóng P1/P2 còn lại ngoài core DB integrity và loại silent partial/fallback/privacy behavior.

**Scope:**
- atomic/versioned criteria + audience + levels;
- atomic grade-band set, no silent production fallback;
- Next async route/proxy correctness;
- staged CSP enforcement;
- AI provider allowlist/retention/DPA/minimum context;
- atomic AI quota;
- explicit summary coverage/truncation;
- no cross-team identity disclosure;
- secret-redaction hardening;
- dev/transitive advisory cleanup hoặc time-bounded waiver.

**Parallelization intent:**
- config lane, framework/CSP lane, AI lane và dev-dependency lane tách file/state và có thể chạy nhiều runner sau prerequisite tương ứng.
- Exact WBS chỉ băm khi Phase 100 ACTIVE.

**Phase gate:**
- P1 = 0 hoặc accepted-risk record có owner/reason/expiry;
- config failure không để partial state;
- Reports runtime filter PASS;
- enforced CSP canary không break required assets;
- AI privacy/quota/coverage negative tests PASS;
- production dependency audit = 0.

---

# 7. Phase 101 — Measured Performance & UI Optimization

**State:** PLANNED.  
**Depends on:** Phase 100 DONE.

**Goal:** tối ưu tốc độ/UX bằng before-after evidence, không speculative tuning.

**Baseline routes:** dashboard, reports, evaluation detail, compare, history, settings.  
**Viewports:** `390x844`, `768x1024`, `1440x900`.

**Optimization order:**
1. duplicate/sequential server reads;
2. query scope/payload;
3. parallel independent fetches;
4. duplicate client auth/period bootstrap;
5. measured render transforms;
6. secondary lazy-load;
7. cache/prefetch only with invalidation proof.

**Parallelization intent:**
- baseline capture chạy trước.
- Sau baseline, dashboard/reports lane, evaluation/history lane và isolated UI-residual lane có thể chạy parallel nếu file ownership không overlap.
- Exact WBS chỉ băm khi Phase 101 ACTIVE.

**Phase gate:**
- before/after artifact cho mỗi retained optimization;
- no horizontal overflow;
- no first-party JS/network errors;
- no accessibility/navigation regression;
- no retained change without measured net benefit.

---

# 8. Phase 102 — Integration, CI & Production Closure

**State:** PLANNED.  
**Depends on:** Phase 101 DONE.

**Goal:** chứng minh end-to-end source/DB/browser/deployment/rollback contract và đóng release-hardening.

**Scope:**
- disposable DB integration matrix;
- browser role matrix;
- CI required checks;
- main branch protection/no-force-push + Vercel branch readback;
- controlled rollout/readback của reviewed remaining migrations;
- re-evaluate pending lifecycle/rollback E2E proof;
- final production SHA + DB ledger/catalog + docs sync.

**Parallelization intent:**
- DB integration harness là prerequisite.
- Sau harness, browser-E2E preparation và CI workflow có thể chạy parallel.
- Branch-setting/production mutation/final readback chạy serial.
- Exact WBS chỉ băm khi Phase 102 ACTIVE.

**Project release-ready gate:**
- P0 = 0;
- P1 = 0 hoặc accepted risk có owner/reason/expiry;
- production SHA VERIFIED;
- DB catalog + migration ledger VERIFIED;
- lint/typecheck/tests/build/diff PASS;
- `npm audit --omit=dev = 0`;
- DB integration PASS;
- browser role matrix PASS;
- mobile/tablet/desktop no overflow/first-party errors;
- rollback evidence đủ cho production DB mutation;
- canonical `main` là source duy nhất của production.

**Only after Phase 102 DONE:** mở feature phase mới.

---

# 9. Deferred / user-gated work

- **Phase 96E lifecycle/rollback E2E:** PAUSED; không tự production-execute. Re-evaluate ở final integration phase.
- **Cloudflare Tunnel / Access:** chỉ khi user chủ động yêu cầu và infra context phù hợp.
- **QI Gia dụng Leader / 3 NV SubLeader UAT data:** xử lý khi user tiếp tục UAT; không tự mutate org data.
- **Feature P2 như “Gợi ý khác” / mở rộng chat:** không làm trước release-hardening closure.

---

# 10. Global execution rules

- MASTER_PLAN không chứa WBS/task.
- Chỉ `/plan2task` phase ACTIVE; future phase giữ phase-level plan để tránh stale WBS.
- 1 task = 1 logical block = 1 Mika commit sau independent verify.
- Runner không commit, không sửa `tasks.md`.
- `Independent=yes` + `Parallel-safe=yes` trong `tasks.md` nghĩa là Mika có thể dispatch runner riêng/worktree riêng khi dependencies đã satisfied.
- Task đụng same file hoặc mutable production state không chạy parallel.
- Auth/DB/schema/backend/production task bắt buộc fresh Reviewer gate.
- Production DB migration/data mutation/delete cần explicit user approval.
- Force-push cấm.
- Unexpected drift/anomaly → STOP.
- Không đóng finding bằng docs/comment; cần source/runtime evidence.
- Phase 100% → Mika sweep summary vào MASTER_PLAN và prune completed tasks khỏi `tasks.md`, rồi `/plan2task` phase kế tiếp.
