# MASTER_PLAN — Kurabe P103: bounded HIGH remediation

## 1. Trạng thái, nguồn và giới hạn

- `PLAN_REVISION=P103-r1`; lập ngày 2026-09-14; `PLAN_STATUS=PLANNED_NOT_EXECUTED`.
- Canonical plan là **`.ai/MASTER_PLAN.md`**, không tạo thêm `master_plan.md` ở root.
- Source anchor: `ab4d6a798946ff26c565d17095685a1571688db9`, branch `main`, root `/home/pi5/projects/kurabe`.
- Evidence gốc: `/home/pi5/hermes-artifacts/kurabe-confirm-20260914T022145Z/REPORT.md`, `confirmation-result.json`, `confirmation-evidence.tar.gz` và checksum đi kèm. Không nhập private runtime/cookies/browser profile vào repo.
- VERIFIED trong disposable Next/auth/PostgREST/PostgreSQL: H1, H2 transition, H4, H5, H6 và H7 submitted-round display. H3 là **source-confirmed gap, runtime NOT RUN**; phải có red regression trước fix.
- H7 closed-period data mutation: **NOT REPRODUCED**; dữ liệu snapshot không đổi trong confirmation. Next confirmation dùng dev/webpack, chưa phải production build gate.
- DB drift: chỉ đối chiếu 11 selected function bodies, 10 khớp normalized whitespace, 1 khác comment; không phải chứng nhận toàn schema/ACL/deployment flags. Recheck catalog trước release, không test write production.
- Scope hiện tại chỉ cập nhật `.ai/MASTER_PLAN.md` và `tasks.md`. Không sửa app, migration, dependency, state, HANDOFF, protected docs; không commit/push/dispatch/deploy. `.state`/HANDOFF còn mô tả closure P102, **không chứng minh P103 DONE**.
- P103 có 13 task pending. Các trạng thái COMPLETE/PASS bên dưới mục lịch sử chỉ là lịch sử P102. Không mở lại ID cũ.
- Không kiến trúc mới, không event bus/realtime service, không policy engine/code generator, không schema/backfill lịch sử, không auth/password redesign, không audit/performance sweep rộng.

## 2. Quyết định và invariants dùng chung

### A. Current authorization không phải historical evaluator identity

1. Actor luôn lấy từ session server và đọc lại trạng thái active/role/membership khi ghi. Client IDs/role/team chỉ là input hiển thị, không cấp quyền.
2. `effectiveLeaderTeamIds = sorted(unique(active primary team ∪ active teams appointed by teams.leader_id))` cho **active user có current role Leader**. Giữ primary-team compatibility đang có; inactive team/actor không có scope. Primary A, appointed B có A+B, không có C.
3. Revoke appointment B của primary-A Leader làm mất current B authority. Nếu B vẫn là active primary team, chỉ xóa appointment **không** xóa quyền primary đã được contract cho phép; test và UI phải nói đúng, không hứa global revoke.
4. Ghi round cần đồng thời: current actor active, đúng current workflow role/relationship, đúng stored assignee, đúng round/period/status/config guard. Stored evaluator ID/role giữ attribution; **một mình nó không cấp quyền ghi**. Manager không được bypass assignee bằng payload giả.
5. Historical read tiếp tục theo quyền đọc hợp lệ của evaluation/round đã hoàn tất và snapshot identity; không biến identity đó thành quyền đọc mọi hồ sơ/kỳ. Target chỉ trả nếu current target scope hợp lệ **hoặc có ít nhất một history entry được phép**. Stale unfinished assignment ngoài current scope không cấp target/profile access. Không mở rộng nội dung history đang được phép đọc.
6. Error/không đủ scope không trả tên, mã nhân viên, role/team hay snapshot ngoài scope trong HTML/RSC/action/cache. Có thể echo ID route nhưng không được coi là quyền truy xuất. Anonymous giữ redirect; unrelated target không tồn tại và không được phép có cùng trạng thái unavailable ở UI.

### B. Một semantic multi-team xuyên DB/server/UI/cache

- Reuse `getLeaderTeamIds` (`src/lib/db/teams-admin.ts`) cho server context. SQL dùng cùng predicate A2; UI/cache nhận context server, không tự suy từ `users.team_id`.
- Selecting next Leader: nếu có appointed pointer thì chỉ chọn pointer active/Leader của active target team, **không đòi primary trùng**. Pointer invalid => fail closed, không thay bằng người bất kỳ. Nếu không có appointment, fallback chỉ khi có **đúng một** active primary-team Leader; 0 hoặc nhiều ứng viên => lỗi rõ, không chọn tùy order.
- Authorization scope và deterministic next-assignee selection dùng chung membership/appointment facts, nhưng scope không tự giao round cho mọi Leader. Current assignment vẫn là điều kiện riêng.
- Full list, summary, period list, single evaluation, history và cache phải dùng cùng effective scope. History vẫn có luật submitted/closed riêng; so parity trên cùng tập dữ liệu và projection tương đương, không ép history bằng active list.

### C. Workflow / transaction contract

| Subject role snapshot | Evaluators theo round | Aggregate status sau submit |
|---|---|---|
| Manager | SELF (1) | Approved |
| Leader | SELF (1), Manager (2) | Submitted, Approved |
| SubLeader | SELF (1), Leader (2), Manager (3) | Submitted, Reviewed, Approved |
| Employee / Worker | SubLeader (1), Leader (2), Manager (3) | Submitted, Reviewed, Approved |

- TS source `src/lib/evaluation-workflow.ts:getEvaluationFlow/getNextEvaluationStep` là business table đã chọn; SQL phải match bằng behavioral parity tests, không sinh SQL từ TS.
- Draft chỉ đổi round payload/status, **không regress aggregate**: round 1 draft => Draft; round 2 draft giữ Submitted; round 3 draft giữ Reviewed. No next assignment, no submitted timestamp, no final approval khi draft.
- Success phải xác nhận evaluation ID và aggregate status phù hợp operation; không nới thành “RPC không error là PASS”. Unknown/malformed response => outcome-unverified, readback trước retry; không auto-submit lại khi chưa biết commit outcome.

### D. Historical display

- Submitted round dùng persisted `totalScore`, `grade`, `evaluation.employeeRole` và evaluator role snapshot đúng nghĩa; **subject role**, không evaluator role, quyết định audience/scoring context.
- Criteria/labels/levels lấy immutable version theo **từng round** `criteriaConfigVersionId`; grade version provenance theo `gradeConfigVersionId`. Không dùng latest active config hay current target.role để tính lại submitted grade.
- Hai round cùng evaluation có version khác nhau phải hiện đúng label riêng từng round; key gộp theo criterion ID nhưng không lấy label của round mới ghi đè round cũ.
- Legacy null/missing version => `legacy_unknown` hoặc unavailable rõ ràng; giữ persisted score/grade, criterion ID/recorded value khi có. Không đoán nhãn từ live config, không crash, không backfill. Version query lỗi => error/retry riêng, không stale fallback.
- Draft vẫn dùng current version/rules và stale-version guard; không đổi business workflow. Closed history giữ đường read-only hiện có; không mở compare cho closed period chỉ để làm test pass.

### E. Bounded Optimality Check + PDCA

- Chọn **hai forward migrations + các patch đúng boundary**, tái dùng harness/version tables/query layer. Không chọn rewrite authorization/workflow engine: tăng phạm vi và migration risk mà không cần để đóng finding.
- H1/H2 gộp một task vì cùng save RPC; H5 migration đi trước, migration H1/H2 phải kế thừa guard mới. H7 tách server DTO khỏi UI vì có interface và test riêng. Không tách implementation khỏi matching tests.
- PLAN: freeze A–D, mỗi finding có red oracle/negative control/rollback; H3 ghi rõ mức evidence.
- DO (chưa chạy ở planning): tái hiện baseline trong fixture thật, smallest patch trong owned WT, forward migrations trên DB disposable.
- CHECK: targeted red→green + negative controls, DB before/after, browser authoritative-ready; Mika verify exact candidate, fresh CONTROLLED review, không lấy exit 0/old PASS làm verdict.
- ACT: đóng task chỉ sau canonical verified integration; lỗi thì giữ first failure, re-evaluate root cause, tối đa hai evidence-driven repairs theo mika-v3 rồi HALT. Setup/transport fail là BLOCKED_CAPABILITY/operational, không phải regression PASS. Out-of-scope giữ proposal, không tự thêm task implementation.

## 3. Fix contracts theo finding

### H4 — history target ngoài scope → P103M1T02

- **Current behavior:** Leader A+B nhận target name của Leader C ngay cả khi history rỗng; read action khác trả `[]` không bảo vệ route.
- **Intended behavior:** current scope hoặc permitted historical entry mới được nhận target; denied/nonexistent không lộ target fields, route/action cùng policy, own/Manager/current B vẫn dùng được.
- **Root cause:** `getEvaluationHistoryAdmin` map target rồi early-return `{target, entries: []}` trước per-evaluation authorization.
- **Exact files/functions:** `src/lib/db/evaluation-history-admin.ts:getEvaluationHistoryAdmin/buildHistoricalTarget`; `src/app/history/[employeeId]/page.tsx:HistoryPage`; `src/data/workflow.ts:canViewEvaluation`; `src/lib/db/teams-admin.ts:getLeaderTeamIds`; history component để render unavailable thống nhất.
- **Fix strategy:** guard target result tại server, dùng current scope + authorized entries; giữ history snapshot reads; query error fail closed. Không chỉ hide phía client hoặc thêm redirect sau khi đã serialize target.
- **DB/migration impact:** không schema/RPC mới; service-role query chỉ trả projection được phép.
- **Security impact:** đóng profile enumeration/leak; active assignee/read scope không bị đồng nhất với quyền historical read.
- **Regression tests:** no-history target C; populated but forbidden history; self/Manager/B/anonymous; unrelated SubLeader; revoked unfinished assignee; authorized historical evaluator; target missing; DB error. Kiểm cả HTML/RSC/action payload, không chỉ status HTTP.
- **Verification:** `h4-history` authenticated suite + unit permission truth table; snapshot keys không chứa target private fields khi deny.
- **Rollback/risk:** local revert scoped delta; không rollback production về leak cũ. Risk deny quá rộng historical viewer => positive snapshot-history cases bắt buộc.

### H5 — revoked Leader vẫn write/submit → P103M1T03

- **Current behavior:** Manager revoke B đã commit nhưng old authenticated Leader A vẫn draft/submit unfinished B round do stored assignment còn đó.
- **Intended behavior:** revoke có hiệu lực cho mọi write bắt đầu/authorize sau commit; deny atomic, score/comment/status/next round không đổi. Save serialize trước revoke có thể commit trước; không đảo lịch sử đã commit.
- **Root cause:** save RPC chưa revalidate current team appointment/current relationship đủ mạnh; server precheck đơn thuần không chặn race.
- **Exact files/functions:** `src/actions/evaluation.ts:saveEvaluationRound/initializeEvaluationRoundDraft/returnEvaluationRound`; `src/data/workflow.ts:canEvaluate`; active 17-argument `public.save_evaluation_round_transaction_active_only` và `public.return_evaluation_round_transaction`; read lock discipline tại `apply_personnel_transaction` trong `20260911000400_personnel_actor_guard.sql` (chỉ tham chiếu, không sửa file cũ). Initialize dùng cùng save RPC; return là sibling write boundary phải có cùng current-authority invariant, không phải finding mới đã confirmed.
- **Fix strategy:** server preflight cho lỗi rõ + authoritative guard trong RPC. Reuse personnel graph fence: acquire `LOCK TABLE public.teams, public.users, public.evaluation_rounds IN SHARE ROW EXCLUSIVE MODE` cùng thứ tự **trước** period/config/evaluation locks; read current actor/team/relationship dưới fence. Không thêm lock service hoặc advisory authority thứ hai. Kiểm các direct/legacy overload không bypass actor guard; giữ immutable attribution.
- **DB/migration impact:** forward `20260914000100_evaluation_current_authorization.sql`; replace đúng save và return overload, giữ signature/search_path/ACL/guards; không data cleanup/reassignment. Preflight unexpected body/overload/ACL => stop.
- **Security impact:** deny revoked/demoted/inactive/moved/unrelated actor; session valid không đồng nghĩa quyền B valid. Existing period serialization còn nguyên.
- **Regression tests:** old cookie after revoke, role demotion, user/team inactive, A/B/C boundaries, forged actor/assignee, current authorized B positive; race two connections save-first và revoke-first; reject không partial commit.
- **Verification:** `h5-revoke` authenticated + direct real-DB negative/race probes; real Manager action revoke và SQL readback. Lock acquisition/query timeout phải hữu hạn; deadlock/error trong normal valid race => fail.
- **Rollback/risk:** graph fence có contention; record lock wait và compare same fixture baseline, không tăng timeout để che deadlock. Pre-apply disposable rollback bằng captured function definition; production không restore vulnerable authorization, containment/forward correction cần approval.

### H1/H2 — workflow + multi-team transition → P103M2T01

- **Current behavior:** Employee/Worker R1 submit gửi Leader nhưng SQL đòi SubLeader; SubLeader B submit sang appointed Leader primary A bị primary-team guard reject. Already-assigned B write trước revoke có thể thành công.
- **Intended behavior:** table C chạy trọn vòng; appointment B hợp lệ không phụ thuộc primary A. Selection và guard thống nhất B; unrelated C vẫn reject.
- **Root cause:** SQL next-role table lệch TS và next-user primary equality đặt trước appointment validation; fallback candidate selection có thể chọn Leader không thuộc team.
- **Exact files/functions:** active save RPC; `src/lib/evaluation-workflow.ts:getNextEvaluationStep`; `src/lib/evaluator-resolver.ts:resolveEvaluatorFromDb`; `src/lib/team-validation.ts:selectValidLeader/validateLeaderAssignment`; action RPC builder là consumer, giữ interface.
- **Fix strategy:** correct next-role SQL theo next step, Leader eligibility theo A/B contract, bounded deterministic fallback. Giữ final-status, current-role, active-period, criteria/grade version, actor/assignment guards của H5.
- **DB/migration impact:** forward `20260914000200_evaluation_workflow_multiteam.sql` sau 001; patch same function body từ candidate **đã chứa 001**, không copy body cũ làm mất H5. Không sửa applied migration, không reorder lịch sử migration.
- **Security impact:** bỏ incorrect equality, không bỏ authorization; không cấp quyền cho any active Leader; no public/anon RPC grant.
- **Regression tests:** Employee/Worker đủ 3 rounds, SubLeader 3, Leader 2, Manager 1; self-submit forbidden cho individual; valid secondary; invalid/null/multiple fallback; stale config, round skip, replay, closed period, final/non-final tampering.
- **Verification:** `h1h2-workflow` authenticated suite và TS↔RPC table parity; DB readback status/next evaluator/role/round; H5 suite chạy lại sau migration 002.
- **Rollback/risk:** mixed-version app/DB compatibility matrix (old/new app × baseline/001/002 DB); chỉ hỗ trợ/release pair đã verified. Không rollback 002 theo cách gỡ 001. Không migrate persisted rounds sang flow khác.

### H3 — full read mất secondary context → P103M2T02

- **Current behavior:** source ở `fetchEvaluationsForViewerAdmin` query có `leaderTeamIds` nhưng gọi `filterEvaluationsForViewer(evaluations,user,allUsers)` bỏ tham số scope. Runtime red chưa có.
- **Intended behavior:** full/summary/by-period/by-ID trả cùng authorized IDs trên cùng filters, including secondary B; C bị deny. Pagination/limit kiểm trên cùng window, không coi projection khác là mismatch.
- **Root cause:** context đã resolve bị mất ở post-filter boundary.
- **Exact files/functions:** `src/lib/db/evaluations-admin.ts:fetchEvaluationsForViewerAdmin` và summary/single wrappers; `src/lib/db/evaluations.ts:filterEvaluationsForViewer`; `src/actions/read.ts` consumers. `canViewEvaluation` contract từ P103M1T02.
- **Fix strategy:** truyền explicit server-resolved context đến toàn bộ filter/canView path liên quan, không global allow và không infer B từ primary. Reuse same fetch context trong request, không N+1.
- **DB/migration impact:** không migration, không RLS/grant change.
- **Security impact:** restore valid B reads mà không nới C/history. Query failures không trả unfiltered raw rows.
- **Regression tests:** actor A+B chưa có assigned round vẫn nhìn B; primary-only A, unrelated C, revoked B, self/Manager/SubLeader; full/summary/single/history-appropriate projections; request scope resolution failure.
- **Verification:** baseline red fixture trước fix rồi `h3-scope` authenticated suite; không ghi H3 runtime CONFIRMED trước evidence thật.
- **Rollback/risk:** revert scoped server/filter delta; risk overbroad access hoặc pagination false positive => compare exact IDs with independent expected ACL fixtures.

### H6 — draft response mismatch → P103M2T03

- **Current behavior:** R2/R3 draft DB commit nhưng action đòi aggregate Draft, trả invalid transaction response.
- **Intended behavior:** action success khi valid draft transaction giữ đúng aggregate Submitted/Reviewed; malformed/wrong-ID/impossible status không success.
- **Root cause:** expectedStatus conflates per-round draft với aggregate evaluation lifecycle.
- **Exact files/functions:** `src/actions/evaluation.ts:saveEvaluationRound/initializeEvaluationRoundDraft/isEvaluationTransactionResult` (parser là local function trong cùng file); không thay signature SQL.
- **Fix strategy:** derive expected aggregate từ operation/validated current round-state, validate exact tuple ID/status; draft refresh đúng active row, không trigger submit audit/next round. Unknown outcome yêu cầu authoritative readback trước retry.
- **DB/migration impact:** none; giữ DB commit semantics đúng, không ép parent về Draft.
- **Security impact:** không lỏng parser/period/role/assignee checks vì muốn success.
- **Regression tests:** R1/2/3 draft với DB before/after, submit/final unchanged; wrong evaluation ID/status/malformed response negative unit probes; repeated identical draft no extra round, stale/closed/revoked deny.
- **Verification:** `h6-draft` authenticated suite; response ↔ persisted score/comment/round status/aggregate/next-assignee parity; no false failure/success.
- **Rollback/risk:** action-only scoped revert có thể tái gây false failure; không undo committed scores. Network ambiguity không tự retry submit.

### H7 — snapshot display → P103M3T01 + P103M3T02

- **Current behavior:** submitted 170/S render thành 170/D sau grade config; criterion V1→V2; current role đổi làm grade D→S dù DB snapshot giữ nguyên.
- **Intended behavior:** submitted/closed display ổn định theo D, draft current behavior giữ nguyên; no historical data mutation.
- **Root cause:** detail/compare dùng current grade bands/criteria/current target role thay snapshot reference.
- **Exact files/functions:** `src/app/evaluations/[id]/compare/ComparePageClient.tsx`; `src/app/evaluations/[id]/EvaluationPageClient.tsx`; `src/hooks/use-evaluation-page-state.ts`; `src/actions/read.ts`; `src/types/index.ts`; proposed `src/lib/db/evaluation-display-admin.ts:getEvaluationDisplayAdmin` (NEW). Existing tables `criteria_config_versions`, `criteria_group_versions`, `criterion_versions`, `criterion_level_versions`, `criterion_audience_versions`, `grade_band_versions` đủ; không tạo tables mới.
- **Fix strategy:** server-authorize evaluation trước, resolve immutable version IDs theo batch, expose additive DTO gắn evaluation/round, không API đọc version tùy ý. DTO: `{evaluationId, employeeRoleSnapshot, rounds:[{round, status, totalScore, grade, evaluatorRole, criteriaConfigVersionId, gradeConfigVersionId, snapshotState, criteriaGroups}]}`; `snapshotState=authoritative|legacy_unknown|unavailable`, không tự đánh giá grade bằng current config. UI render per-round version, không dùng hook live bands cho submitted path.
- **DB/migration impact:** read existing immutable rows, no new RPC/schema/backfill. DTO không chứa cả config mọi version hoặc raw users.
- **Security impact:** display endpoint phải enforce current/historical read policy trước cả cache hit; không cho client tự chọn version của evaluation khác. Historical attribution retained, write policy độc lập.
- **Regression tests:** real Manager saves grade/criteria V2 và changes role; rendered grade/labels unchanged trên submitted rounds, draft vẫn refresh; different versions per round; legacy null/deleted-reference fixture/error loading; closed history invariant, no active-period gate bypass.
- **Verification:** server `h7-display` authenticated suite; browser same name with stable-ready DOM assertions + screenshots before/after config/role; DB hash before/after identical cho submitted/closed rows.
- **Rollback/risk:** additive DTO compatible old caller; UI rollback không đụng data. Missing historical labels phải nói unavailable, không “fix” bằng live labels. Table reads batch theo unique versions, không per-criterion queries.

### Cache / regression / CI trực tiếp → P103M3T03, P103M4T01–T04

- **Current behavior:** query identity trong `src/hooks/use-db.ts:requesterScope/scopedKey` theo id/role/primary; không đủ appointment B change. Old CI validator nhận contradictory FAIL nếu top-level `passed:true`; chỉ harden phần cần để matrix này không giả PASS.
- **Intended behavior:** scoped reads/DTO/cache cùng A/B context; revoke phản ánh server ngay ở write transaction và client theo freshness bound. Matrix chỉ green khi tất cả required cases thật đã chạy và pass trên exact candidate.
- **Root cause:** incomplete scope fingerprint / invalidation & evidence acceptance thiếu per-case contradiction checks.
- **Exact files/functions:** `src/hooks/use-db.ts:requesterScope/invalidateRequesterQueries`; `src/contexts/AuthContext.tsx`; `src/providers/query-provider.tsx`; `src/actions/read.ts` (NEW additive `getViewerScopeAction`); `src/types/index.ts`; `scripts/verify-release.mjs:validateSuiteResult`; `tests/operations/ci-suite-manifest.mjs`; `.github/workflows/ci.yml`.
- **Fix strategy:** additive server scope DTO `{userId, role, primaryTeamId, leaderTeamIds, scopeKey}` sorted deterministic; React context không dùng key như credential. Refetch on auth/navigation/focus và tối đa 30s khi tab visible; hidden tab reconcile trước sensitive render khi quay lại. On scope change/error/logout cancel + remove old-scope families, reject old-epoch in-flight completion, include period/evaluation/version IDs trong keys. Local mutation invalidates related families; remote revoke được bound, không hứa instant push.
- **DB/migration impact:** none; không thêm scope-version table/realtime service. Current auth kiểm lại trên mọi server request và RPC.
- **Security impact:** error không giữ sensitive last-good UI; background stale response không hồi sinh revoked cache; prior-read content trong tối đa freshness window là residual UX risk, không phải quyền write.
- **Regression tests:** resident open tab revoke/grant B không đổi primary, role/current user switch, logout, period switch, query failure, delayed old request; H6 refresh; H7 config change chỉ invalidate draft/live config, snapshot display giữ đúng version. CI rejects top-level/case FAIL, missing/duplicate/skipped required IDs, mock tiers, zero cases, wrong SHA/evidence digest; legacy unrelated suites không bị đổi schema tùy tiện.
- **Verification:** `cache-confirmation`, combined `confirmation-matrix` (authenticated real Next production build + DB), existing root/release gates; fresh read-only reviewer PASS exact tree/evidence; malformed evidence negative tests.
- **Rollback/risk:** more scope fetches bounded, no polling hidden tabs; no global cache sharing. Disable/hide affected view on scope failure, không revert security gate vì stale UI. Release requires owner approval riêng.

## 4. Migration / rollout / rollback envelope

1. **Hai migrations dự kiến** (tên reserved, chưa tạo): `supabase/migrations/20260914000100_evaluation_current_authorization.sql`; `supabase/migrations/20260914000200_evaluation_workflow_multiteam.sql`. Recheck name/ledger collision trước execution; nếu collision, Mika sửa plan trước, Runner không tự đổi ID/order.
2. Dựng DB từ `db/bootstrap/manifest.json` boundary đúng + unapplied migrations; không “skip theo ngày” bằng heuristic. Test cả fresh bootstrap và baseline→001→002 upgrade, verify function overloads/signatures/ACL/search_path/guard preservation.
3. Backup/preflight manifest phải neo app SHA, full normalized function bodies (comment-aware), ACL/overloads, migration ledger/checksums và compatibility. Chỉ read-only production catalog nếu được phép; khác semantic => BLOCKED, không áp dụng mù từ confirmation cũ.
4. Rehearse old/new app × DB baseline/001/002 trong disposable; old vulnerable states là negative/control compatibility evidence, **không release-eligible chỉ vì khởi động được**. Ship final app + both migrations như matched reviewed set.
5. Trên production chưa có quyền apply/deploy/backup extraction/cutover. Release pack đề xuất write-pause window, DB first trong window rồi verified app, read-only smoke; mở write chỉ sau exact reviewed readback/owner approval. Không tách auto-deploy DB/app qua hai lane.
6. Trước có user writes: chỉ rollback matched pair đã diễn tập và không reintroduce H4/H5; nếu không có safe prior pair, giữ write paused và forward-fix. Sau user writes: không restore whole DB hay xóa rounds để rollback code. Snapshot/data preserved; mọi production action cần envelope riêng.

## 5. WBS, dependencies và concurrency

Full executable contracts ở `tasks.md`, không duplicate task bodies ở đây.

| Stage | Tasks | Deliverable |
|---|---|---|
| Fixture prerequisite | P103M1T01 | Reusable real local harness + red baseline oracles, no application changes |
| Authorization | P103M1T02 → P103M1T03 | H4 target boundary, H5 transactional current authority |
| Workflow/DB | P103M2T01 | H1/H2 + forward migration preserving H5 |
| Read/response | P103M2T02 ∥ P103M2T03 | H3 context parity / H6 draft contract, disjoint paths |
| Snapshot server | P103M3T01 | Authorized version-bound display DTO |
| Snapshot UI/cache | P103M3T02 ∥ P103M3T03 | Historical rendering / scope freshness, disjoint paths |
| End-to-end | P103M4T01 | Exact-candidate production-build authenticated matrix |
| CI | P103M4T02 | Enforced case coverage/evidence, not just metadata PASS |
| Release preparation | P103M4T03 | Matched pair, rollback rehearsal evidence, no deploy |
| Final independent review | P103M4T04 | Fresh exact-tree review and owner release gate |

- Critical dependency chain: `M1T01 → M1T02 → M1T03 → M2T01 → (M2T02 & M2T03) → M3T01 → (M3T02 & M3T03) → M4T01 → M4T02 → M4T03 → M4T04` (all IDs prefix P103). No duration estimate asserted.
- Only useful parallel groups: `{P103M2T02,P103M2T03}`, `{P103M3T02,P103M3T03}` after dependencies integrated. Maximum two Runner implementations; one heavyweight verifier/runtime at a time on this host.
- `Independent` / `Parallel-safe` in tasks are owner-requested descriptive labels, **not scheduler fields**. Actual permission remains `depends + owns + locks + live state`; no `parallel_safe` runtime flag.
- Collision hotspots deliberately serialized: active save RPC migrations 001/002; `src/actions/evaluation.ts` H5/H6; `src/actions/read.ts` H3/H7/cache; `src/data/workflow.ts` H4/H5; `src/hooks/use-db.ts` snapshot/cache. No sibling write sharing.

## 6. Verification toolbox / evidence / execution entry

- Existing root gates: `npm run test`; `npm run lint -- --no-cache`; `npm run typecheck`; `npm run build`; `node scripts/scan-source-secrets.mjs`; `git diff --check`. Run only isolated candidate, no tracked-update test modes.
- Existing wrapper: `node scripts/verify-release.mjs --suite <name> --tier authenticated --evidence "$EVIDENCE/<name>.json"`. Proposed suite names/files are **new deliverables**, not claimed available now: `h4-history`, `h5-revoke`, `h1h2-workflow`, `h3-scope`, `h6-draft`, `h7-display`, `cache-confirmation`, `confirmation-matrix`.
- P103M1T01 defines `node tests/support/confirmation-runtime.mjs --mode qualify --evidence "$EVIDENCE/qualification.json"` (NEW), local target managed per run; suites use this harness, do not require secret values in CLI/logs. `EVIDENCE` is fresh absolute task/run directory under `/home/pi5/hermes-artifacts/kurabe-p103/`.
- Fixture: Manager, Leader primary A appointed A+B, unrelated Leader C, SubLeader B, Employee B, Worker B; 2 periods for active/closed controls; criteria/grade V1/V2. Trước migration 002, fixture prerequisite cho H4/H5 có thể dùng đúng workaround đã ghi trong confirmation: tạm primary B, tạo assignment qua action/RPC, restore A trong finally rồi mới đo; ghi before/after rõ. Sau H2 fix tuyệt đối không workaround. Không tắt trigger/guard ở matrix P103; measured actions authenticated.
- Build/start isolation must account for `scripts/run-with-env.mjs` loading `.env.local` over shell env: candidate copy excludes all source `.env*` secrets; write only disposable local runtime env. Allowlist child env and loopback targets; no shared production client, mocked auth/API or external egress. Current env flags enabling transactional RPC must be explicit fixture settings.
- Evidence per case: ID/expected/actual/status, actor alias (not credentials), candidate+source SHA, DB migration/function hashes, action response, before/after SQL, HTML/RSC redacted when relevant, browser settled DOM/screenshot/console, exit/duration, first failure retained. Case count derives enumerated required IDs, not hardcoded totals.
- Preserve fixture until full matrix, then exact owned cleanup/readback; evidence+checksums retained, no private cookies/JWT/env/browser profile in downloadable pack. Boot/setup fail => BLOCKED, not assertion PASS.
- Before execution: owner authorizes implementation/security/migrations **disposable only**; reconcile current dirty docs/HEAD/state; plan publish/register under mika-v3 only with Git approval; don't infer permission from this plan. Current planning does not require or perform control-plane commit.
- Canonical root/branch above; future Runner root `/home/pi5/projects/kurabe-p103-runners`, integration root `/home/pi5/projects/kurabe-p103-integration` are **planned paths, not created**. Reuse existing project control lock, single Mika writer if unavailable; `MAX_PARALLEL_RUNNERS=2`, `MAX_CANDIDATE_VERIFIERS=1`, `PUBLISH_REFRESH_TIMEOUT=300s`.
- Liveness before reservation recovery: recorded PID + `/proc/<pid>/stat` start identity + exact task path/job handle. Match=LIVE; proven exited/mismatched process identity=DEAD; missing/unreachable/ambiguous ownership=UNKNOWN (retain reservation, never redispatch). No new daemon.
- Disposable allowlist in task/candidate: `.next/`, declared `.tmp/`, generated test outputs under artifact task root. No broad cleanup, no mutation of protected owner changes. Head movement requires rebase/rebuild/reverify/review exact candidate, never reuse stale PASS.

## 7. Planning acceptance / readiness

- Every finding maps to bounded task + positive/negative real-stack tests; H3 evidence gap and H7 limit explicit.
- All 13 tasks remain `[ ]`; no implementation COMPLETE. Per-task CONTROLLED review still required before integration; final review is cross-feature gate, not permission to skip earlier gates.
- `READY_TO_EXECUTE=NO` **operationally** until owner authorizes execution/security/isolated migration scope and dirty canonical/control-state preflight is reconciled. Design/WBS can be accepted now without production or Git approval.
- Top risks: authorization lock-order/contention; incompatible old/new app/RPC rollout; missing historical version references and asynchronous stale display. Each has a named test and rollback/containment gate above.

---

<details>
<summary>Historical P102 closure record — not current P103 status or acceptance</summary>

# MASTER_PLAN — Kurabe QAQC (historical state)

## Current status

- `PROJECT_STATE=COMPLETE`.
- Production: `LIVE`.
- Release status: `COMPLETE`.
- Current production/source SHA: `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`.
- Canonical branch: `main`; repository `HEAD` and `origin/main` match the documentation closure commit, while the deployed production/source SHA remains `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`.
- Production alias: `https://lykiv.vercel.app`; deployment state: `READY`.
- Final closure evidence: `/home/pi5/hermes-artifacts/kurabe-execution/production-release-closure-76221ca.log`.
- Worktree cleanup: `PASS`; only `/home/pi5/projects/kurabe` remains.
- `MANDATORY_OPEN_WORK=NONE`.

This document owns current outcomes, invariants, residual risk, and approval boundaries. `tasks.md` is the compact task classification ledger. Historical task contracts and detailed evidence remain in Git, `.state/agent-state.json`, and timestamped artifacts; they are not alternate execution authority.

## Architecture and business rules that matter now

- `users.team_id` is primary membership.
- `teams.leader_id` is an independent leadership assignment.
- One active Leader may lead multiple teams; a valid appointed pointer is not overwritten by primary membership.
- Server-authenticated actor scope, active role checks, and team/leadership scope are authoritative; client role/team context is not authority.
- Submitted/closed evaluation history and configuration versions remain immutable; active writes use the transactional/versioned guards.
- Sensitive reads, cache/query identity, period changes, mutation invalidation, and resident UI transitions remain viewer/scope-aware and fail closed on errors.
- Optional-password compatibility remains the current mode. Strict password go-live, bulk forced setup, and global NULL-password lockout are deferred and require a separate owner decision.

Production example retained because it validates the corrected personnel model: Nguyễn Thị Lan Nhi has primary team `QI Xe hơi` and is the appointed Leader of both `QI Xe hơi` and `QI-KIV2`.

## Completed milestones

- Auth/session/password lifecycle and byte-safe credential handling.
- Login admission/rate limiting and explicit proxy trust boundaries.
- Personnel transaction authorization, history preservation, multi-team Leader relations, and deletion graph protection.
- Evaluation transition monotonicity and exact criteria/grade configuration versioning.
- AI quota/accounting, payload governance, summary coverage persistence, and egress/response boundaries.
- Viewer-scoped cache freshness, resident period/team scope, mutation failure handling, and authenticated release matrix/CI contracts.
- Measured authenticated application performance baseline and bounded optimization.
- Release/rollback manifest, migration compatibility, backup/readback, and evidence packaging.
- Production migrations and schema compatibility: `PASS`.
- Production deployment and alias cutover: `PASS`.
- Authenticated production smoke: `PASS` — login, dashboard, normal reads, QI Xe hơi, QI-KIV2, unrelated-team denial, zero HTTP 5xx/page/visible errors.
- Temporary credential cleanup: `PASS` — sessions and active setup tokens are zero; no secret file retained.
- Registered/stale worktree cleanup: `PASS` — no noncanonical Kurabe worktree remains.

## Remaining boundaries

`MANDATORY_OPEN_WORK=NONE`.

The following are intentionally non-blocking and must not be auto-dispatched:

- `P102M2T01`: optional repository branch-protection/settings governance; `OWNER-GATED` and requires explicit approval plus fresh settings readback.
- `P96T11–P96T13`: lifecycle transition, stale/Closed proof, and exact-ID rollback; `DEFERRED / OWNER-GATED` because no lifecycle mutation was required for this release.
- Strict-password go-live and any broad credential migration: deferred by the optional-password decision.

No current state is `RUNNING`, `READY`, `BLOCKED`, or `UNKNOWN`; a future owner-approved lane must be created explicitly rather than inferred from this historical plan.

## Evidence and protection boundaries

- Release evidence: `/home/pi5/hermes-artifacts/kurabe-execution/production-release-closure-76221ca.log`.
- Worktree evidence: `/home/pi5/hermes-artifacts/kurabe-worktree-cleanup/`.
- `AGENTS.md` is protected and was not modified by this sweep.
- `docs/PRODUCTION_RUNBOOK.md` contains pre-existing owner changes and was preserved byte-for-byte by this sweep.
- No code, migration, dependency, deployment, production-data, credential, permission, or external-settings mutation is authorized by this document.

</details>
