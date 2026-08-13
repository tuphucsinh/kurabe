# Active Tasks

> ⚠️ Phase 44 (Security Hardening) đang được TẠM HOÃN (Deferred) theo yêu cầu.
> Xem roadmap đầy đủ: `.ai/MASTER_PLAN.md` → "Next Phases (Post-Audit)"

## Phase 49: App Optimization — Gọn Nhẹ, Mượt Mà, Ổn Định

Tất cả task Phase 49 đã hoàn thành và được migrate sang MASTER_PLAN.md.

---

## Phase 50: Standalone Printable Guide Refinement 📄

Tất cả task Phase 50 đã hoàn thành và được migrate sang MASTER_PLAN.md.

---

## Phase 52: Trang Cài đặt (Settings Hub) — Phase A [DONE] ✅

Tất cả task P52T01-T04 đã hoàn thành + verify browser (chi tiết: `.ai/MASTER_PLAN.md` → Phase 52 Phase A DONE).
- P52T01: khung /settings + guard Manager + 3 tab
- P52T02: Tab Kỳ — PeriodActions + bảng danh sách kỳ (status, tiến độ, chọn kỳ)
- P52T03: Tab Nhóm & Quyền — Leader/SubLeader + cảnh báo thiếu chức vụ/chưa gán nhóm
- P52T04: Dashboard bỏ PeriodActions (chuyển hẳn sang Cài đặt)

**Còn lại (chờ anh bấm nút)**: ~~Phase B~~ / ~~Phase C~~ → **ĐÃ HOÀN THÀNH** (P52T05/P52T06, migration đã chạy, verify end-to-end PASS — chi tiết `.ai/MASTER_PLAN.md`). Phase 44 (Security) giữ DEFERRED — fake login giữ tới khi anh test xong ổn thỏa.

---

## Phase 54: Bảo mật (C2+C3) + Nhắc tồn đọng + Audit log 🔴 (CONTROLLED — auth/RLS)

- **P54T01**: requireAuth/requireManager server-side — mọi action lấy actor từ session ✅ (commit `fbd418a`)
- **P54T02**: RLS deny anon WRITE (evaluation_periods + grade_bands) + admin client ✅ (`e4bafa4`)
- **P54T03**: audit_logs + logAudit + hook 10 action ✅ (`301d055`, `5388d45`)
- **P54T04**: Tab "Nhật ký" trong Cài đặt ✅ (`469f8d0`)
- **P54T05**: Dashboard "Đánh giá tồn đọng" + fix bug stats cũ ✅ (`469f8d0`, `a539635`)

**Phase 54 DONE — Reviewer PASS (fresh, độc lập).** Chi tiết + rủi ro còn lại (Phase 44): `.ai/MASTER_PLAN.md` → Phase 54.

---

## Phase 55: Cấu hình Mục tiêu Kỳ (Manager) 🟡 (2026-08-13)

### [#P55T01] [db/migration-f-target.sql + types + actions/period.ts] Lưu mục tiêu theo kỳ

**Goal**: Mục tiêu (tỉ lệ % + mức xếp loại) lưu theo kỳ, Manager cấu hình được — thay hardcode 75%/AB.

**Depends on**: `none` — **Parallel-safe**: `no`

**New interface**: migration thêm `evaluation_periods.target_rate int default 75` + `target_grade text default 'AB'`; types + `mapPeriodFromDb` thêm 2 field; server action `savePeriodTarget(periodId, rate, grade)` — requireManager + admin client + logAudit.

### [#P55T02] [src/components/settings/TargetTab.tsx + settings/page.tsx] Tab "Mục tiêu"

**Goal**: Manager chọn kỳ → sửa % + mức xếp loại → Lưu (toast).

**Depends on**: `[#P55T01]` — **Parallel-safe**: `no`

**New interface**: `TargetTab` (useAuth allPeriods/currentPeriod) — select kỳ + input % (0-100) + select grade (S/A/AB/B/C/D) + nút Lưu; tab thứ 7 "Mục tiêu" (icon Target).

- **P55T01**: migration target_rate/target_grade (default 75/AB) + types + savePeriodTarget (requireManager, admin, logAudit) ✅
- **P55T02**: Tab "Mục tiêu" trong Cài đặt (chọn kỳ + % + grade + Lưu) ✅
- **P55T03**: Báo cáo "Mục tiêu Kỳ này" đọc động từ kỳ ✅ (verify: lưu 80/A → reports hiển thị "Đạt tỉ lệ 80%... từ A"; restore 75/AB)

**Phase 55 DONE** — verify browser PASS (Settings → Mục tiêu → Lưu → toast; Reports hiển thị đúng). Kèm P1: login ẩn "Tài khoản test" trên production (`NEXT_PUBLIC_SHOW_TEST_LOGIN=true` chỉ local). Commit `0605a3f` — đã push.

---

## Phase 56: AI cho Manager — Cảnh báo bất thường (rule-based) + khung AI 🤖 (2026-08-13)

### [#P56T01] [src/lib/anomaly.ts + src/lib/ai.ts] Detection rule-based + khung LLM

**Goal**: Phát hiện đánh giá bất thường (chênh lệch điểm giữa 2 vòng liên tiếp ≥ 20) — chính xác 100% rule-based; khung gọi LLM sẵn sàng (env `AI_API_KEY`/`AI_BASE_URL`, fail-soft, không vỡ khi thiếu key).

**Depends on**: `none` — **Parallel-safe**: `no`

**New interface**: `detectAnomalies(evaluations)` → `Anomaly[] { employeeId, name, round, prevScore, score, diff, severity }` (diff ≥30 = 'high', ≥20 = 'medium'); `callAI(prompt)` (OpenAI-compatible chat completions, timeout 20s, trả null khi lỗi/thiếu key); `isAIConfigured()`.

### [#P56T02] [src/components/dashboard/AnomalyAlertCard.tsx + dashboard] Card cảnh báo

**Goal**: Dashboard hiển thị cảnh báo đánh giá bất thường (Manager) + nút "Giải thích bằng AI" (khi chưa có key → toast "AI chưa được cấu hình").

**Depends on**: `[#P56T01]` — **Parallel-safe**: `no`

- **P56T01** ✅: `lib/anomaly.ts` (rule ≥20 medium / ≥30 high — TEST PASS tsx: high 45 + medium 22, bỏ round 0 điểm) + `lib/ai.ts` (OpenAI-compatible, env AI_API_KEY/AI_BASE_URL/AI_MODEL, timeout 20s, fail-soft null)
- **P56T02** ✅: `AnomalyAlertCard` trên Dashboard (Manager-only, EmptyState khi sạch, nút "Giải thích bằng AI" per anomaly → `actions/ai.ts` explainAnomalyAction — chưa có key → "AI chưa được cấu hình — chờ cung cấp API key") + wire dashboard. Verify browser: card hiển thị + EmptyState đúng.

**Phase 56 DONE (phần anomaly + khung AI)** — chờ anh cấp `AI_API_KEY` để bật giải thích AI + làm Tóm tắt kỳ (Phase 57).

---

## Phase 54: Bảo mật (C2+C3) + Nhắc tồn đọng + Audit log 🔴 (CONTROLLED — auth/RLS)

### [#P54T01] [src/lib/auth.ts + src/actions/*] requireAuth/requireRole — server-side authz mọi action

**Goal**: Server actions KHÔNG còn trust actorId từ client — lấy user từ session cookie `auth_session`, verify role. Đóng lỗ CRITICAL C2.

**Depends on**: `none` — **Parallel-safe**: `no`

**New interface**:
- `src/lib/auth.ts`: `getSessionUser()` (cookie → users query → User|null), `requireAuth(): Promise<AuthResult>` (`{user}` | `{error}`), `requireRole(roles: Role[])`, `requireManager()`.
- `changePassword(oldPassword, newPassword)` — BỎ param userId (lấy từ session); `saveEvaluationRound(...)` — BỎ actorId (lấy từ session + verify round.evaluator_id === session user).
- Apply: period (create/close/delete → Manager), users/teams/criteria delete → Manager, grade-bands save → Manager, resetPassword → Manager, changePassword → Auth, saveEvaluationRound → Auth + evaluator match.
- Sửa `middleware.ts`: thêm `/settings` vào protectedRoutes.

**Verify**: lint/build PASS; browser: Manager thao tác bình thường; gọi action không session → error "cần đăng nhập"; Employee gọi action Manager → error "không có quyền".

### [#P54T02] [db/migration-d-rls.sql] RLS: deny anon WRITE trên evaluation_periods + grade_bands

**Goal**: Chặn sửa/xóa kỳ + thang điểm qua REST trực tiếp (anon) — mọi ghi phải qua server actions (đã authz P54T01). Bảng còn lại (users/teams/evaluations...) giữ hiện trạng vì client còn ghi trực tiếp (ghi nhận rủi ro còn lại → Phase 44 hoàn chỉnh).

**Depends on**: `[#P54T01]` — **Parallel-safe**: `no`

**New interface**: migration SQL — `DROP POLICY` cũ, `CREATE POLICY ... FOR SELECT USING (true)` (không WITH CHECK) trên 2 bảng; chạy qua Management API; verify bằng test INSERT trái phép phải FAIL + SELECT vẫn OK + action (có authz) vẫn ghi được.

### [#P54T03] [db/migration-e-audit.sql + src/lib/audit.ts + actions] Audit log

**Goal**: Ghi nhật ký hành động quan trọng (ai, làm gì, khi nào) — truy vết.

**Depends on**: `[#P54T01]` — **Parallel-safe**: `no`

**New interface**: bảng `audit_logs (id, actor_id, actor_name, action, entity, entity_id, detail jsonb, created_at)` + RLS select-only + `logAudit(actor, action, entity, entityId, detail?)` (fire-and-forget, không làm fail action chính). Hook: create/close/delete period, deleteUser, deleteTeam, deleteCriteriaGroup/Criterion, saveGradeBands, changePassword, resetPassword.

### [#P54T04] [src/components/settings/AuditTab.tsx + settings/page.tsx] Tab "Nhật ký hoạt động"

**Goal**: Manager xem audit log (read-only) trong Cài đặt.

**Depends on**: `[#P54T03]` — **Parallel-safe**: `no`

**New interface**: `AuditTab` — bảng desc limit 50: thời gian, người thực hiện, hành động (label VN), đối tượng; thêm tab thứ 6 `audit` "Nhật ký" (icon ScrollText) — chỉ Manager.

### [#P54T05] [src/components/dashboard/PendingReviews.tsx + dashboard/page.tsx] Nhắc đánh giá tồn đọng

**Goal**: Dashboard hiển thị theo evaluator: ai còn nợ đánh giá bao nhiêu NV, vòng nào (kỳ hiện tại) — Manager nhắc đúng người.

**Depends on**: `none` — **Parallel-safe**: `no`

**New interface**: `PendingReviews` (client, nhận `evaluations` như ClientSkillGapRadar) — với mỗi evaluation: round hiện tại (currentRound) chưa Submitted → evaluator nợ; group theo evaluator name; card list + tổng; EmptyState khi hết nợ. Wire vào dashboard/page.tsx.

---

## Phase 52: Trang Cài đặt — Phase B + Phase C 🟢 (đang làm)

### [#P52T05] [db/ + src/actions/account.ts + src/components/settings/AccountTab.tsx] Tab Tài khoản — đổi mật khẩu

**Goal**: Tab "Tài khoản" trong /settings: hiển thị thông tin cá nhân + form đặt/đổi mật khẩu. KHÔNG đụng login/middleware (fake login giữ nguyên — Phase 44 mở sau).

**Depends on**: `none`

**Parallel-safe**: `no`

**New interface**:
- `db/migration-b-account.sql`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;` (chạy tay trên Supabase SQL Editor).
- `src/actions/account.ts` (server action): `changePassword(userId: string, oldPassword: string | null, newPassword: string): Promise<{success: boolean; error?: string}>` — validate newPassword ≥ 6 ký tự; user chưa có `password_hash` → set mới (bỏ qua oldPassword); đã có → `bcrypt.compare(oldPassword, hash)` sai → lỗi "Mật khẩu cũ không đúng"; hash bcrypt (rounds 10, dùng `bcryptjs` — thêm dependency `bcryptjs` + `@types/bcryptjs`); KHÔNG sửa login.
- `src/components/settings/AccountTab.tsx` (client): thông tin cá nhân từ `useAuth().user` + tên nhóm từ `useTeams(user)` (badge chức vụ màu theo role — mẫu trang /teams); form đổi mật khẩu: user chưa có mật khẩu → chỉ 2 ô (mới + xác nhận), nút "Đặt mật khẩu"; đã có → 3 ô (cũ/mới/xác nhận), nút "Đổi mật khẩu"; dùng `useToast` + `ConfirmDialog`? (không cần confirm — toast đủ); loading state nút.
- `src/app/settings/page.tsx`: thêm tab thứ 4 `account` "Tài khoản" (icon `UserCircle`) — hiện ACTIVE (chức năng hoạt động; login chưa bắt buộc dùng mật khẩu).

**Verify**: lint + build PASS; browser Manager: /settings → tab Tài khoản hiện đúng thông tin; đặt mật khẩu mới lần đầu → toast success; đổi lần 2 với sai mật khẩu cũ → toast lỗi; đúng → success. Login fake vẫn hoạt động (không bị ảnh hưởng).

### [#P52T06] [db/ + src/lib/grade-bands.ts + src/actions/grade-bands.ts + src/components/settings/GradeBandsTab.tsx + src/lib/scoring.ts + src/app/criteria/page.tsx] Tab Thang điểm xếp loại — dải điểm từ DB

**Goal**: Manager chỉnh dải điểm S/A/AB/B/C/D riêng cho Quản lý (Leader/Manager/SubLeader) và Nhân viên từ /settings; `getGradeFromScore` đọc từ DB với fallback hardcode (app KHÔNG vỡ khi bảng chưa tồn tại).

**Depends on**: `[#P52T05]` (cùng phase, thứ tự code sau B)

**Parallel-safe**: `no`

**New interface**:
- `db/migration-c-grade-bands.sql`: bảng `grade_bands (id uuid pk default gen_random_uuid(), role_group text check in ('leader','staff'), grade text, min_score int null, max_score int null, sort_order int)` + UNIQUE(role_group, grade) + seed từ hardcode hiện tại (leader: S≥170, A160-169, AB130-159, B100-129, C70-99, D≤69; staff: S≥155, A145-154, AB115-144, B90-114, C60-89, D≤59).
- `src/lib/grade-bands.ts` (module cache, sync-safe):
  - `getGradeBandsSync(): GradeBands` — cache-first, fallback hardcode `@/data/criteria` (KHÔNG throw khi chưa load/DB lỗi).
  - `loadGradeBandsFromDb(): Promise<GradeBands>` — query `grade_bands` (order sort_order), map 2 group; lỗi → fallback; set module cache.
  - `invalidateGradeBandsCache()`.
- `src/actions/grade-bands.ts`: `saveGradeBands(bands: {roleGroup, grade, minScore, maxScore}[]): Promise<{success, error?}>` — upsert từng dòng + validate không chồng lấn (client + server) + `invalidateGradeBandsCache` + `revalidatePath('/settings')` + `/criteria`.
- `src/components/settings/GradeBandsTab.tsx` (client): useEffect mount → `loadGradeBandsFromDb`; 2 cột card Quản lý/Nhân viên, mỗi grade 1 dòng: tên grade (badge màu `getGradeColor`) + input min/max (number, S bỏ max, D bỏ min — nullable); validate: min < max kế tiếp, không chồng lấn → lỗi inline; nút "Lưu thang điểm" (save-all, loading state) → toast.
- `src/lib/scoring.ts`: `getGradeFromScore` đổi từ hardcode trực tiếp → `getGradeBandsSync()` (giữ sync, call sites KHÔNG đổi).
- `src/app/criteria/page.tsx`: phần hiển thị grading (dòng 382/413) đọc `getGradeBandsSync()` thay hardcode import (client — mount useEffect load nếu cache trống, fallback OK).

**Verify**: lint + build PASS; browser Manager: tab Thang điểm hiện 2 cột giá trị hiện tại (bằng hardcode khi chưa có bảng); đổi min/max 1 grade → lưu → toast success (sau khi migration chạy); validate chồng lấn chặn lưu. Test logic: snapshot grade trước/sau đổi dải (node script) — PASS. /criteria hiển thị đồng bộ.

---
