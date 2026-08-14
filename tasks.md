# KURABE QAQC — Task List (WBS)

> File làm việc cho `/do` — chỉ giữ phase ACTIVE + việc chờ. Phase đã DONE (52-59): chi tiết ở `.ai/MASTER_PLAN.md`, tóm tắt mở phiên ở `HANDOFF.md`.

## Phase 44: Security Hardening 🔴 (PARTIAL — C2+C3 xong ở Phase 54; còn C1 + refactor client writes)

### [#P44C1] Auth Fix — CÒN LẠI (defer sau UAT)
- Thêm password/PIN cho Manager login (hotfix); dài hạn migrate Supabase Auth.
- ⚠️ Nguyên tắc khôi phục (chốt 13-08): `password_hash = NULL` = chưa đặt → vẫn login mã NV (dự phòng); quên mật khẩu → reset NULL qua MCP/SQL Editor → login mã NV → đặt lại.

### [#P44C2] Refactor client writes sang server actions — CÒN LẠI
- Client vẫn anon-write `users`/`teams`/`evaluations`/`evaluation_rounds`/`evaluation_responses`/`criteria` (ghi nhận rủi ro; làm cùng C1). `audit_logs` select mở anon (đồng bộ mô hình anon-read).

---

## Pending / Next (chốt 13-08 — tối)
- **AI env lên Vercel CHƯA set**: AI_API_KEY, AI_BASE_URL, AI_MODEL=gpt-5.6-luna (production AI chưa hoạt động — local có).
- **QI Gia dụng chưa gán Leader** + 3 NV chưa gán SubLeader (lyly phát hiện — anh cập nhật khi UAT).
- **Phase 60 Cloudflare Tunnel**: chờ anh đưa `vorigin.vn` nameserver sang Cloudflare + báo Active → mới làm named tunnel + Access (fake login chưa đủ an toàn internet).
- **Phase 44 C1** (password login) + refactor client writes — defer sau UAT.
- P2 "Gợi ý khác" + Chat hỏi đáp dữ liệu — sau kỳ đầu có data thật.
- ✅ Đã xong 13-08 (chi tiết `.ai/MASTER_PLAN.md` Phase 61-63): push 66 commits · live test E2E · tối ưu UI/tốc độ · login fix · settings mở cho NV.

---

## Phase 60: Cloudflare Tunnel — kurabe local lên internet (miễn phí thay Vercel) 🟡 (2026-08-13)
### [#P60T01] [Pi5 — infra] Cài cloudflared (arm64) + verify

**Goal**: Cài binary `cloudflared` (github releases `cloudflared-linux-arm64`) vào `/usr/local/bin` — nền cho tunnel.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. Tải `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64` → `/usr/local/bin/cloudflared` (chmod +x)
2. Verify: `cloudflared --version` in đúng phiên bản (không lỗi)

**Definition of Done**: `cloudflared --version` exit 0; binary nằm `/usr/local/bin`.

**Status**: `[x]`

---

### [#P60T02] [Pi5 — test] Quick tunnel end-to-end (URL trycloudflare)

**Goal**: Test nhanh kurabe qua internet: quick tunnel → browser verify login 158 + dashboard → TẮT (URL random — không dùng lâu).

**Depends on**: `[#P60T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Chạy `cloudflared tunnel --url http://localhost:3000` (background — Hermes process, KHÔNG nohup)
2. Bắt URL `https://<random>.trycloudflare.com` từ log
3. Browser verify qua URL đó: login 158 → dashboard hiển thị (22 NV) — ghi latency (load trang ~ms)
4. Kill process tunnel (test xong)

**Constraints**: kurabe local (port 3000) đang chạy; KHÔNG để tunnel chạy quá 15 phút (URL công khai không bảo vệ); không đăng URL ra ngoài.

**Definition of Done**: browser qua trycloudflare mở được login + dashboard; tunnel đã tắt; log latency ghi vào tasks.

**Status**: `[x]`

---

### [#P60T03] [Pi5 — infra] Named tunnel + systemd (chờ anh cung cấp CF account + domain)

**Goal**: Tunnel ổn định hostname `kurabe.<domain>` + tự chạy khi boot (systemd user service `cloudflared-kurabe`).

**Depends on**: `[#P60T01]` + thông tin từ anh (tài khoản CF có domain quản lý trên CF) — **Parallel-safe**: `no`

**Concrete changes**:
1. `cloudflared tunnel login` (device flow — **anh xác nhận trên trình duyệt máy anh**)
2. `cloudflared tunnel create kurabe` → lưu credentials + tunnel ID
3. `cloudflared tunnel route dns kurabe kurabe.<domain>`
4. Tạo `~/.cloudflared/kurabe.yml` (ingress: http://localhost:3000)
5. systemd user service: `cloudflared-kurabe.service` (restart=always) + enable → chạy
6. Verify: browser qua `https://kurabe.<domain>` — login 158 → dashboard

**Constraints**: cần domain có zone trên Cloudflare (CNAME trỏ tunnel UUID); nếu anh chưa có domain → DỪNG báo anh (mua domain ~$1-10/năm — quyết định của anh).

**Definition of Done**: browser qua hostname chính thức mở được kurabe; service tự chạy sau reboot (test `systemctl --user restart` + is-active).

**Status**: `[ ]`

---

### [#P60T04] [Cloudflare dashboard] 🔒 Cloudflare Access bảo vệ hostname (BẮT BUỘC trước mở lâu dài)

**Goal**: Chặn truy cập trước khi vào app (kurabe fake login — ai có URL cũng vào được): Access policy yêu cầu đăng nhập email allowlist (free ≤50 user — giai đoạn test 5-10 user).

**Depends on**: `[#P60T03]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Bật Zero Trust (CF dashboard — free plan 50 user) → Access → Applications → add `kurabe.<domain>`
2. Policy: email allowlist (anh + chị Ly + vài user test)
3. Verify: truy cập hostname → bị chặn Access (login CF) → sau khi duyệt email → vào được kurabe

**Definition of Done**: truy cập từ email ngoài allowlist bị chặn; email trong allowlist vào được app.

**Status**: `[ ]`

---

### [#P60T05] [docs] Ghi nhận + hướng dẫn

**Goal**: MASTER_PLAN Phase 60 DONE + HANDOFF cập nhật + ghi hướng dẫn truy cập (URL, Access, backup khi Pi5 tắt).

**Depends on**: `[#P60T04]` — **Parallel-safe**: `no`

**Definition of Done**: docs cập nhật + commit.

**Status**: `[ ]`

---

## Phase 64: Trả lại đánh giá (Return/Reject) 🟡 (2026-08-14)

> Thiết kế chi tiết + quyết định: `.ai/MASTER_PLAN.md` Phase 64 (đã qua Reviewer: non-PASS → vá 3 điểm ①guard SELF/round≤1 ②RESET thay DELETE ③invalidate client).

### [#P64T01] [Supabase + src/types/database.ts + src/types/index.ts + src/lib/db/evaluations.ts] Migration `return_note` + types

**Goal**: Thêm cột `return_note` (text, nullable) vào bảng `evaluations` + đồng bộ types + map — nền cho lưu lý do trả lại.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. Chạy migration trên Supabase (MCP supabase hoặc Management API — xem skill `supabase-remote-ops`): `ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS return_note text;`
2. Verify: `SELECT column_name FROM information_schema.columns WHERE table_name='evaluations' AND column_name='return_note'` → đúng 1 row.
3. `src/types/database.ts`: thêm `return_note: string | null` vào cả `Row` / `Insert` / `Update` của bảng evaluations.
4. `src/types/index.ts`: interface `Evaluation` thêm `returnNote?: string | null`.
5. `src/lib/db/evaluations.ts` `mapEvaluationFromDb`: thêm `returnNote: db.return_note || undefined`.

**Constraints**: idempotent (`IF NOT EXISTS`); KHÔNG đụng data cũ; types + map CÙNG commit với migration (rule KNOWN_BUGS: migration cột mới → phải cập nhật generated types trong CÙNG commit); không chạy build trong lúc `npm run start` (kill PID 3000 qua `ss -tlnp` trước).

**Definition of Done**: query verify column tồn tại; `npm run lint` 0 errors; `npm run build` PASS.

**Status**: `[x]` — DONE 14-08: migration `return_note text NULL` verified qua information_schema; 3 file types/map (database.ts Row/Insert/Update, index.ts returnNote, evaluations.ts map); lint 0 errors + build PASS.

---

### [#P64T02] [src/actions/evaluation.ts + .tmp/test-return-logic.ts] `returnEvaluationRound(evaluationId, round, reason)` + `unlockRound` + clear return_note + edge tests

**Goal**: Server action trả lại đánh giá — Case A (reviewer ở currentRound > 1, evaluator ≠ SELF, round CHƯA submit → về round-1: reset round hiện tại + unlock round-1 + quay current_round) + Case B (Manager Approved → self-return về Draft); gộp chung 1 code path; clear `return_note` khi submit lại.

**Depends on**: `[#P64T01]` — **Parallel-safe**: `no`

**Concrete changes** (thứ tự bắt buộc, mỗi bước 0 rows → abort trả lỗi):
1. Tách logic thuần test được: `canReturnEvaluation(evaluation, actor, round, allUsers?)` trả `{ok, error?}` — chứa mọi guard (xem 2) — để test tsx không cần DB.
2. Guards trong action (gọi `canReturnEvaluation` trước mọi write):
   - `reason` trim rỗng → error `'Vui lòng nhập lý do trả lại.'`
   - Case A: `round <= 1` → error; flow step evaluator === `'SELF'` → error; actor !== evaluator_id của round hiện tại → error; round hiện tại ĐÃ submit (`submitted_at` không null) → error `'Vòng đánh giá đã nộp — không thể trả lại.'`
   - Case B: `round === 1` chỉ hợp lệ khi `actor === evaluation.employeeId && role === 'Manager' && evaluation.status === 'Approved'`.
3. Helper `unlockRound(evaluationId, round)`: update round → `{status: 'Draft', submitted_at: null}` VỚI điều kiện `evaluation_id + round + submitted_at is not null` → trả boolean (false = 0 rows).
4. `returnEvaluationRound` flow (sau guard):
   - Case A: (a) **RESET round hiện tại** (KHÔNG delete): `{status: 'NotStarted', scores: {}, notes: {}, comment: null, total_score: 0, grade: 'Pending', submitted_at: null}` với điều kiện `evaluation_id + round + evaluator_id + submitted_at is null` → 0 rows = abort `'Vòng đánh giá đã khóa.'`; (b) `unlockRound(round-1)` — false → abort (best-effort: rollback reset round hiện tại về snapshot trước khi reset); (c) update `evaluations`: `{current_round: round-1, status: ACTIVE_STEP_STATUSES[round-1], final_grade: null, final_score: null, return_note: reason, updated_at: now}` với điều kiện `id + current_round = round` → 0 rows = abort; (d) `logAudit(actor, 'RETURN_EVALUATION', 'evaluation', evaluationId, {round, reason})`; (e) `revalidatePath('/evaluations/' + evaluationId)` + `revalidateTag('dashboard-data', 'default')` + `revalidateTag('report-aggregation', 'default')`.
   - Case B: (a) `unlockRound(1)` với điều kiện phụ status Approved (update `evaluations` trước: `current_round: 1, status: 'Draft', final_grade: null, final_score: null, return_note: reason` với điều kiện `id + status = 'Approved'` → 0 rows abort; sau đó unlock round 1); (b) audit + revalidate như Case A (round: 1).
5. `saveEvaluationRound`: khi `isSubmit` → trong `evalUpdate` thêm `return_note: null` (clear sau khi nộp lại).
6. Edge tests (`.tmp/test-return-logic.ts`, chạy `npx tsx .tmp/test-return-logic.ts`): test `canReturnEvaluation` — round=1 non-Manager → false; round SELF → false; reviewer đã submit round mình → false; reviewer chưa submit → true; Manager Approved → true; reason rỗng → false. Tất cả PASS.

**Constraints**: KHÔNG đổi flow hiện tại (EVALUATION_FLOWS, lock logic submit); KHÔNG delete round — reset giữ row (evaluator cũ giữ nguyên — đúng người review lại); update/reset có điều kiện — 0 rows abort; KHÔNG import `next/cache` trong `src/lib/db/*` (chỉ trong actions); không commit; không sửa tasks.md.

**Definition of Done**: edge tests `.tmp/test-return-logic.ts` ALL PASS (tsx, chạy được, in rõ kết quả); `npm run lint` 0 errors; `npm run build` PASS.

**Status**: `[x]` — DONE 14-08: `src/lib/return-evaluation.ts` (canReturnEvaluation + resetRoundFields + nextStatusAfterReturn, thuần) + export ACTIVE_STEP_STATUSES + `returnEvaluationRound` (Case A reset/unlock/update có điều kiện + rollback; Case B Manager Approved; audit RETURN_EVALUATION; revalidate) + clear return_note khi submit; Mika verify bổ sung guard `round === currentRound` (chống trả lại vòng cũ) + test case 19; edge tests 20/20 PASS; lint 0 errors + build PASS.

---

### [#P64T03] [src/app/evaluations/[id]/page.tsx] UI: nút "Trả lại đánh giá" / "Trả lại báo cáo" + dialog lý do + banner + invalidate client

**Goal**: UI trả lại — Case A: nút danger trong vùng edit khi `editableRound > 1`; Case B: nút "Trả lại báo cáo" trong vùng readonly khi Manager owner Approved; ConfirmDialog + textarea lý do BẮT BUỘC; banner amber hiển thị lý do; refresh query client sau success.

**Depends on**: `[#P64T02]` — **Parallel-safe**: `no`

**Concrete changes** (trong `src/app/evaluations/[id]/page.tsx` — tham khảo reviewer: vùng edit nút hiện có ~dòng 566-583, vùng readonly lock ~584-591, pattern handleSave invalidate ~386-389):
1. Vùng edit: thêm nút **"Trả lại đánh giá"** (danger/outline, icon Undo2 hoặc tương tự) cạnh nút Nộp, chỉ render khi `access.editableRound !== null && access.editableRound > 1`.
2. Vùng readonly (khối lock/đã nộp): thêm nút **"Trả lại báo cáo"** chỉ khi `user.role === 'Manager' && evaluation.employeeId === user.id && evaluation.status === 'Approved'`.
3. ConfirmDialog variant warning + textarea lý do (state riêng): nút xác nhận disabled khi `reason.trim() === ''`; text cảnh báo rõ: *"Đánh giá sẽ quay về vòng {round-1} để chỉnh sửa. Dữ liệu vòng hiện tại sẽ bị reset."*
4. Submit: gọi server action `returnEvaluationRound` → success: toast `'Đã trả lại đánh giá.'` + `invalidateQueries(['evaluation-by-employee', ...])` + `['evaluations']` (copy chính xác pattern handleSave dòng 386-389) → fail: toast error message.
5. Banner amber (trên header/round list): khi `evaluation.returnNote` — `'⚠️ Đánh giá bị trả lại: {returnNote}'`, hiển thị cho mọi viewer có quyền xem (đặc biệt người vòng trước).

**Constraints**: dùng `useToast` + `ConfirmDialog` có sẵn — CẤM alert/confirm native (rule Phase 46); KHÔNG sửa `getEvaluationAccessState`/workflow; nút Case A KHÔNG hiện ở vòng 1 (kể cả SELF); textarea trim trước khi gửi; không commit; không sửa tasks.md.

**Definition of Done**: `npm run lint` 0 errors; `npm run build` PASS; browser verify (Chrome thật): (1) Leader mở evaluation NV ở R2 chưa chấm → thấy nút "Trả lại đánh giá"; (2) Leader mở đánh giá CHÍNH MÌNH (R1 SELF) → KHÔNG thấy nút; (3) Manager Approved → thấy "Trả lại báo cáo"; (4) dialog: nút xác nhận disabled khi lý do rỗng; (5) sau trả lại: banner hiển thị, round trước mở khóa (nháp).

**Status**: `[ ]`

---

### [#P64T04] [docs] Verify tổng (browser 2 flow E2E) + docs + commit

**Goal**: Verify end-to-end 2 flow trả lại (reviewer + manager self) trên browser thật với test data, dọn sạch, DB nguyên trạng; cập nhật docs; Mika commit từng task.

**Depends on**: `[#P64T03]` — **Parallel-safe**: `no`

**Concrete changes**:
1. **Flow 1 — reviewer trả lại**: dùng data test (đánh dấu rõ `TST%`/tên 'Test E2E' như Phase 62): SubLeader chấm NV vòng 1 → nộp → Leader (R2) bấm "Trả lại đánh giá" (kèm lý do) → verify: R1 mở khóa (badge Nháp + banner lý do), R2 reset, dashboard pending tăng; SubLeader sửa điểm → nộp lại → Leader chấm lại → nộp → Manager (R3 nếu có) → Approved.
2. **Flow 2 — Manager self-return**: Manager nộp báo cáo tự đánh giá → Approved → bấm "Trả lại báo cáo" → verify về Draft + banner → sửa → nộp lại → Approved, final_grade/score mới.
3. **Test data discipline (ENGINEERING PRACTICE 1)**: snapshot trước khi seed (mọi field liên quan), restore sau, verify ĐA CHIỀU: 22 NV / 3 nhóm / 22 evaluations / 1 Approved + pending count dashboard + reports không đổi.
4. Docs: `.ai/MASTER_PLAN.md` Phase 64 → mark DONE + kết quả thực thi; sweep `tasks.md` (xóa task `[x]`); `.ai/KNOWN_BUGS.md` thêm pitfall nếu phát hiện mới; `.ai/DECISIONS_LOG.md` #11 đã ghi (bổ sung nếu cần); `HANDOFF.md` snapshot ≤15 dòng.
5. Mika verify độc lập từng task: `git diff` + lint/build + test + commit 1 task = 1 commit (message `[#P64T0x] ...`) — push CHỈ khi anh báo.

**Constraints**: không để test data sót (verify count=0 sau dọn); build trong lúc start → kill PID 3000 chính xác trước build; không push.

**Definition of Done**: cả 2 flow browser PASS + DB nguyên trạng (22/3/22/1) + lint/build PASS + docs cập nhật + git log có 4 commits `[#P64T01..04]` (chưa push).

**Status**: `[ ]`

---
