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

## Phase 64: Trả lại đánh giá (Return/Reject) [DONE] ✅ (2026-08-14)

> Đã hoàn thành + verify 2 flow E2E — chi tiết: `.ai/MASTER_PLAN.md` Phase 64. 4 commits `c663b4d..c8f981e` (chưa push).

---

## Phase 65: Live Test Toàn Diện — mọi tính năng trên org test 🟡 (2026-08-14)

> Đã duyệt 14-08 (bỏ import Excel). Feature inventory + ngoại lệ: `.ai/MASTER_PLAN.md` Phase 65. Nguyên tắc: org test RIÊNG "Test Full E2E" + TST users — KHÔNG đụng data thật; verify đa chiều sau mỗi milestone; dọn sạch + nguyên trạng 22/3/22/1 cuối.

### [#P65T01] [UI + DB] Setup org test + snapshot baseline

**Goal**: Tạo org test qua UI (test luôn form CRUD): team "Test Full E2E" + TST01 Leader / TST02 SubLeader / TST03-05 Employee (TST03-04 gán SubLeader TST02; TST05 CHƯA gán) / TST99 Manager; snapshot baseline; verify sync + scope.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes** (browser Manager 158 + DB verify — data test, không commit code):
1. Snapshot baseline DB: counts users/teams/evaluations/approved/audit + period active + ai_summaries hiện trạng (ghi vào `.tmp/p65-baseline.json`).
2. Tạo qua UI: team "Test Full E2E" → thêm TST01 (Leader, team), TST02 (SubLeader, team), TST03 + TST04 (Employee, team, subleader=TST02), TST05 (Employee, team, subleader=TRỐNG — cố ý), TST99 (Manager).
3. Verify: users count +4? (26→? — đếm đúng), team detail (Leader/SubLeader/NV), dashboard KPI 158 (nhân sự = baseline+6, Test Full E2E xuất hiện), evaluations auto-tạo đủ cho TST users (ensureEvaluationsForUsers) + round 1 evaluator đúng (TST03/04 → TST02; TST01/TST99 → SELF; TST05 → null).
4. Login từng role test: TST02 thấy đúng scope (NV của mình), TST05 (chưa gán subleader) mở đánh giá mình → trạng thái đúng.

**Constraints**: KHÔNG đụng data thật (không sửa/xóa user thật); KHÔNG test import Excel (đã bỏ); không commit.

**Definition of Done**: org test hoạt động đủ 6 users + evaluation auto + round 1 đúng evaluator; baseline lưu; counts khớp.

**Status**: `[x]` — DONE 14-08: baseline lưu `.tmp/p65-baseline.json` (22/3/22/1, audit 8, ai_summaries 0); team Test Full E2E + 6 users test (TST01 Leader, TST02 SubLeader, TST03-04 Employee gán TST02, TST05 Employee chưa gán, TST99 Manager team NULL) qua UI; evaluations auto-đủ 6; R1 evaluator verified (SELF/NULL/TST02 đúng). PITFALL: form thêm NV default team = nhóm đầu (QC Gia dụng — team THẬT!) → TST02/TST03 bị gán nhầm, đã sửa qua UI; pattern fill form: native setter + input/change event cho input/select (KHÔNG Enter trong select — submit sớm), verify team_id DB ngay sau mỗi thêm.

---

### [#P65T02] [UI + DB] CRUD nhân sự/nhóm: sửa, đổi role, gán/đổi SubLeader, chuyển team, đổi Leader, xóa

**Goal**: Test mọi thao tác quản lý nhân sự/nhóm trên data test + verify sync downstream (evaluator round 1, team leader) + audit log.

**Depends on**: `[#P65T01]` — **Parallel-safe**: `no`

**Concrete changes** (browser Manager 158, verify DB từng bước):
1. Sửa NV: đổi tên + description của TST03 → hiển thị đúng.
2. Đổi role: promote TST04 Employee→SubLeader (assertLeadershipSlot KHÔNG chặn — chỉ giới hạn Leader); demote TST02 SubLeader→Employee (verify xử lý NV đang trực thuộc TST02 — TST03/04 subleader_id thế nào; sync round 1 evaluator).
3. Gán/đổi SubLeader trực tiếp: gán TST05 → TST04; đổi TST03 từ TST02 → TST04 → **verify evaluator round 1 SYNC** (bug cũ Phase 61: upsertUser phải sync khi subleaderId đổi).
4. Teams: tạo team "Test E2E B"; chuyển TST05 sang team B (verify team_id + evaluation.team_id?); sửa tên team B; đổi Leader team A: TST01 → TST06 (tạo TST06 Leader) — verify team detail + scope (TST01 hết quyền team?).
5. Xóa NV: xóa TST04 (có evaluation + rounds) — verify app xử lý (evaluation/rounds bị xóa kèm hay báo lỗi — GHI NHẬN hành vi); xóa team B khi rỗng.
6. Verify audit log: mỗi action có entry đúng (CREATE/UPDATE/DELETE user/team + actor 158).

**Constraints**: KHÔNG đụng data thật; ghi nhận mọi hành vi lạ (bug candidate → ghi `.tmp/diary.md` + báo Mika); không commit.

**Definition of Done**: mọi thao tác CRUD chạy đúng + sync evaluator round 1 verified (query DB) + audit entries đủ + không ảnh hưởng data thật.

**Status**: `[ ]`

---

### [#P65T03] [UI + DB] Password lifecycle trên account test

**Goal**: Test đặt/đổi/reset mật khẩu trên account TEST (không đụng account thật) theo nguyên tắc Phase 44: hash NULL = chưa đặt → login mã NV.

**Depends on**: `[#P65T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. TST03 (account test) đặt mật khẩu lần đầu: Settings → Tài khoản → đặt (≥6 ký tự) → verify DB `password_hash` = bcrypt 60 ký tự.
2. Logout → login bằng mã NV + mật khẩu → vào dashboard OK (nếu app hỗ trợ password login — verify hành vi thật: nếu vẫn login mã NV thuần → ghi nhận).
3. Đổi mật khẩu: nhập sai mật khẩu cũ → bị chặn "Mật khẩu cũ không đúng"; đúng → đổi thành công → login lại bằng mật khẩu mới.
4. Manager 158 reset: /employees → Đặt lại mật khẩu TST03 → DB hash = NULL → login mã NV không cần password (lối vào dự phòng).
5. Verify audit: entries đặt/đổi/reset password.

**Constraints**: CHỈ thao tác trên TST03 (account test); cuối test hash phải về NULL (dọn — nhưng user sẽ bị xóa ở T06 nên chỉ cần không ảnh hưởng thật); không commit.

**Definition of Done**: 4 bước chạy đúng + DB hash verify từng bước + login fallback hoạt động.

**Status**: `[ ]`

---

### [#P65T04] [UI + DB] Đánh giá full flow + trả lại + AI

**Goal**: Test chuỗi đánh giá hoàn chỉnh trên data test: nháp → nộp → 3 vòng → trả lại → sửa → nộp lại → Approved; Manager self; AI features; chi tiết so sánh; grade đúng thang điểm DB.

**Depends on**: `[#P65T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. TST02 chấm TST03 ĐẦY ĐỦ các nhóm A-F → Lưu nháp → verify (scores/notes lưu) → sửa 1 điểm → Nộp → R2 tự tạo (evaluator TST01).
2. TST01 (Leader) mở R2 TST03 → chi tiết so sánh (L1 vs L2) → chấm → Nộp → R3 tự tạo (Manager 158).
3. **Trả lại**: 158 ở R3 bấm "Trả lại đánh giá" (lý do) → TST02 sửa R1 → nộp lại → TST01 chấm lại R2 → nộp → 158 chấm R3 → **Approved** (grade/score verify theo grade_bands DB).
4. TST05 (đã gán subleader T04 ở T02; nếu T04 đã xóa → gán lại TST02) chấm R1 → nộp → TST01 R2 → nộp → 158 R3 → Approved (2 evaluation Approved test).
5. Manager self: TST99 tự đánh giá → Nộp → Approved → "Trả lại báo cáo" → sửa → nộp → Approved.
6. AI: "Gợi ý nhận xét (AI)" khi chấm (TST01 R2) → text điền; "Soạn thông báo kết quả (AI)" (readonly) → draft hiện; **anomaly**: seed chênh lệch ≥20 giữa R1/R2 của 1 evaluation test → dashboard 158 hiện cảnh báo + "Giải thích bằng AI" chạy (verify content); AI summary: kiểm tra ai_summaries hiện trạng — nếu kỳ 2026 CHƯA có → tạo qua nút (ghi chú sẽ xóa ở T06); nếu ĐÃ có → KHÔNG tạo lại (tránh đụng).
7. Verify từng bước: status/current_round/final_grade DB + badge UI + pending dashboard cập nhật.

**Constraints**: AI chờ 10-45s (fail-soft — không chặn flow); anomaly seed phải RESTORE đúng (điểm gốc); KHÔNG tạo AI summary kỳ 2026 nếu đã tồn tại row (đụng data thật — kiểm tra trước); không commit.

**Definition of Done**: 2 NV test Approved + Manager self Approved + trả lại loop chạy đúng + AI 3 feature chạy (hoặc fail-soft ghi nhận) + grade/score đúng + anomaly cảnh báo đúng + chi tiết so sánh OK.

**Status**: `[ ]`

---

### [#P65T05] [UI] Dashboard + Reports + Settings + Nhật ký + Export verify

**Goal**: Verify Báo cáo + Bảng điều khiển + Cài đặt + Nhật ký hoạt động hiển thị ĐÚNG với data (thật + test) — theo từng role.

**Depends on**: `[#P65T04]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Dashboard 158: KPI nhân sự/tiến độ/đã đánh giá/chưa xong đúng (counts DB); trạng thái theo nhóm (Test Full E2E % đúng); phân bổ xếp loại (gồm test Approved); đánh giá tồn đọng (evaluator 158 còn NV chưa chấm? đúng); skill gap radar hiển thị; hoạt động gần đây (sort DESC theo thời gian + nội dung khớp audit: SUBMIT/APPROVE/RETURN...).
2. Dashboard theo role test: TST02 (thấy NV trực thuộc + self), TST01 (thấy team), TST99 (self) — counts đúng scope.
3. Reports 158: KPI tổng + Top NV (gồm test? verify logic) + mục tiêu kỳ (đọc DB) + phân bổ + AI summary (nếu row tồn tại) — số liệu khớp DB.
4. Reports Employee (TST03): redirect/chặn đúng.
5. Settings 158: tab Thang điểm (hiển thị đúng grade_bands), tab Nhóm & Quyền (3 team thật + team test đúng Leader/SubLeader), tab Nhật ký (entries T01-T04 khớp: actor, action, thời gian).
6. Export Excel (158): tải file → verify 2 sheets (Tổng hợp + Chi tiết) + đủ rows (22 + test) + không lỗi.

**Constraints**: KHÔNG sửa gì (read-only verify); số liệu đối chiếu DB query; không commit.

**Definition of Done**: mọi chỉ số dashboard/reports khớp DB; nhật ký đầy đủ đúng thứ tự; export file OK; ghi nhận mọi lệch (bug candidate).

**Status**: `[ ]`

---

### [#P65T06] [docs + DB] Dọn test data + verify nguyên trạng + docs + commit

**Goal**: Xóa sạch org test, verify DB nguyên trạng, cập nhật docs, commit (và báo cáo tổng hợp PASS/FAIL từng feature).

**Depends on**: `[#P65T05]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Dọn (Management API, thứ tự FK — pattern skill supabase-remote-ops): rounds → evaluations → audit_logs (actor TST% / Test E2E) → users (TST%) → teams (Test Full E2E / Test E2E B); xóa ai_summaries test nếu T04 tạo (chỉ row mới tạo cho kỳ 2026 — verify trước/sau).
2. Verify NGUYÊN TRẠNG đa chiều: 22 users / 3 teams / 22 evs / 1 Approved / audit count = baseline / dashboard 158 KPI về baseline (cache revalidate) / password accounts thật không đổi.
3. Docs: MASTER_PLAN Phase 65 DONE + kết quả thực thi (bảng feature → PASS/FAIL + issues); sweep tasks.md; KNOWN_BUGS thêm pitfalls/phát hiện mới; HANDOFF mới; DECISIONS_LOG nếu có quyết định mới.
4. Commit từng task theo thứ tự thực hiện (P65T01..T06 — message `[#P65T0x] ...`); bug phát hiện trong test → fix riêng `[#FIX]` (nếu anh duyệt) hoặc ghi KNOWN_BUGS.
5. Báo cáo tổng cho anh: bảng feature → PASS/FAIL + lệch phát hiện + đề xuất fix.

**Constraints**: verify count=0 test data; không để sót; push CHỈ khi anh báo.

**Definition of Done**: DB nguyên trạng + docs đầy đủ + git log sạch (commits chưa push) + báo cáo tổng.

**Status**: `[ ]`

---
