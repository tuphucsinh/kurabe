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

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify độc lập (diff đúng scope; lint 0 errors; build PASS; edge test tsx: evaluation.team_id sync + R2 evaluator reset; live UI: CREATE_USER audit xuất hiện ngay; cleanup P66 test data xong — nguyên trạng 22/3/22/1/8).

---

### [#P60T04] [Cloudflare dashboard] 🔒 Cloudflare Access bảo vệ hostname (BẮT BUỘC trước mở lâu dài)

**Goal**: Chặn truy cập trước khi vào app (kurabe fake login — ai có URL cũng vào được): Access policy yêu cầu đăng nhập email allowlist (free ≤50 user — giai đoạn test 5-10 user).

**Depends on**: `[#P60T03]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Bật Zero Trust (CF dashboard — free plan 50 user) → Access → Applications → add `kurabe.<domain>`
2. Policy: email allowlist (anh + chị Ly + vài user test)
3. Verify: truy cập hostname → bị chặn Access (login CF) → sau khi duyệt email → vào được kurabe

**Definition of Done**: truy cập từ email ngoài allowlist bị chặn; email trong allowlist vào được app.

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify độc lập (diff đúng scope; lint 0 errors; build PASS; edge test tsx: evaluation.team_id sync + R2 evaluator reset; live UI: CREATE_USER audit xuất hiện ngay; cleanup P66 test data xong — nguyên trạng 22/3/22/1/8).

---

### [#P60T05] [docs] Ghi nhận + hướng dẫn

**Goal**: MASTER_PLAN Phase 60 DONE + HANDOFF cập nhật + ghi hướng dẫn truy cập (URL, Access, backup khi Pi5 tắt).

**Depends on**: `[#P60T04]` — **Parallel-safe**: `no`

**Definition of Done**: docs cập nhật + commit.

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify độc lập (diff đúng scope; lint 0 errors; build PASS; edge test tsx: evaluation.team_id sync + R2 evaluator reset; live UI: CREATE_USER audit xuất hiện ngay; cleanup P66 test data xong — nguyên trạng 22/3/22/1/8).

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

**Status**: `[x]` — DONE 14-08: promote TST04→SubLeader (R1 sync SELF ✓); gán/đổi SubLeader TST05+TST03→TST04 (R1 evaluator sync ✓ ×2); tạo team "Test E2E B"; chuyển team TST05 A→B (tự xóa subleader+R1 NULL ✓) + B→A; tạo TST06 Leader (assertLeadershipSlot chặn team đã có Leader ✓); đổi Leader team A→TST06 (leader ngoài team được phép — ghi nhận); xóa NV TST04 = soft-delete ✓ (is_active=false, UI ẩn); xóa team B = soft-delete ✓; audit DELETE ghi đúng. PITFALL: keyboard ArrowUp/Down trên select đôi khi KHÔNG vào React state (TST06 chuyển team fail im lặng) — verify DB sau mỗi mutation; **BUG phát hiện**: audit gap CREATE/UPDATE user+team (KNOWN_BUGS — fix chờ duyệt).

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

**Status**: `[x]` — DONE 14-08: (1) đặt mật khẩu lần đầu TST03 → bcrypt $2b$10 + CHANGE_PASSWORD ✓; (2) đổi với cũ SAI → CHẶN (không audit, updated_at không đổi) ✓; (3) đổi với cũ ĐÚNG → CHANGE_PASSWORD 03:10 ✓; (4) Manager 158 reset → hash NULL + RESET_PASSWORD ✓. LƯU Ý: dev mode đang MOCK login (input password disabled — "Không yêu cầu mật khẩu") → KHÔNG test được login-by-password; verify qua DB hash + audit. Password test dùng `Testpass@123`/`Newpass@456` (đã reset về trống).

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

**Status**: `[x]` — DONE 14-08: **TST05 Approved B/109** (R1 TST02 draft→nộp, R2 TST01 carry-forward + nút Trả lại ✓, R3 158, rounds auto, current_round advance ✓); **TST99 self Approved B/123**; **TST06 Leader self→R2 158 Approved B/123** (Leader flow ✓); anomaly seed R1=82 vs R2=109 → **dashboard cảnh báo "chênh 27 điểm" ✓** + đã RESTORE R1=109; **AI suggestion HOẠT ĐỘNG** (comment điền tiếng Việt phân tích F7/F8 — chờ ≥60s, click qua JS; ref cũ không ăn); "Soạn thông báo" + "Giải thích bằng AI" + AI summary không fire/không row (ghi nhận — fail-soft, chưa verify); reports cache 300s (hiển thị cũ 1 lần — sau session mới data đúng — KHÔNG bug); so sánh L1/L2 verified; grade/score/badge đúng.

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

**Status**: `[x]` — DONE 14-08: Dashboard 158 đúng (28 NV, 11%, 3/28, Test Full E2E 25%, phân bổ S1/B3, tồn đọng, anomaly "chênh 27" ✓ đã restore); hoạt động gần đây khớp audit; reports đúng (TST99 123 B, TST05 109 B, TST06 PENDING — cache 300s làm stale 1 lần, sau session mới đúng — không bug); export Excel ✓ (2 sheets Tổng Hợp 30 rows + Chi Tiết Vòng 39 rows, chứa TST05/109 — file `~/Downloads/Kurabe_Kỳ_2026_2026-08-14T03-59-57.xlsx`); Settings 158: 6 tabs, Thang điểm hiển thị, Nhóm & Quyền (3 NV chưa gán = data thật đúng), Mục tiêu hiển thị, **Nhật ký đầy đủ đúng thứ tự actor/thời gian** (SUBMIT/APPROVE/RESET/CHANGE_PASSWORD/DELETE). Ghi nhận: AI summary không tạo row (fail-soft); "Soạn thông báo" không fire qua automation.

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

**Status**: `[x]` — DONE 14-08: cleanup qua Management API SQL (anon DELETE bị RLS chặn im lặng — phải dùng PAT endpoint `/database/query`); **FINAL VERIFY: 22/3/22/1/8/0 = NGUYÊN TRẠNG 100%**; docs: MASTER_PLAN Phase 65 ✅ + HANDOFF mới + KNOWN_BUGS (2 bug + pitfalls); commit docs cuối. Báo cáo tổng đã gửi anh.

---

### [#P66T01] [code] Fix: chuyển team user KHÔNG sync evaluation.team_id + evaluator R2/R3

**Goal**: `syncEvaluationAfterUserChange` (src/lib/db/users.ts:44) sync employee_role + R1 nhưng BỎ evaluation.team_id + R2/R3 evaluator khi user đổi team → Leader team mới không thấy evaluation, R2/R3 trỏ evaluator cũ.

**Concrete changes** (src/lib/db/users.ts):
1. Sau bước 1 (employee_role): update `evaluations.team_id = user.teamId` (hoặc null) cho mọi evaluation của user.
2. Mở rộng vòng lặp evaluation: với mỗi round 2..3 CHƯA submit (status != Submitted && !submitted_at) → resolve evaluator theo `getEvaluationFlow(user.role)` bước tương ứng + `resolveEvaluatorFromList` (đã có helpers) → update evaluator_id/evaluator_role.
3. Giữ nguyên best-effort (try/catch) + không đụng R1 đã submit.

**DoD**: đổi team user (TST test) → evaluation.team_id đổi + R2 evaluator = leader team mới + R3 = Manager; rounds đã submit giữ nguyên; lint/build pass; unit test edge.

### [#P66T02] [code] Fix: audit gap CREATE/UPDATE user + team (logAudit qua server action)

**Goal**: thêm/sửa NV + tạo/sửa team không ghi audit (upsert qua lib/db client-side không có actor).

**Concrete changes**:
1. Mới `src/actions/audit.ts`: `logAuditAction(action, entity, entityId)` — 'use server', requireAuth (actor từ session), gọi logAudit, return {success}.
2. `src/app/employees/page.tsx` (handleSubmit ~L589): sau upsertUser onSuccess → `await logAuditAction(editingEmployee ? 'UPDATE_USER' : 'CREATE_USER', 'user', payload.id)` (fire-and-forget, không chặn flow).
3. `src/app/teams/page.tsx` (handleSaveTeam ~L78): sau upsertTeam onSuccess → `logAuditAction(editingTeam ? 'UPDATE_TEAM' : 'CREATE_TEAM', 'team', id)`.
4. KHÔNG đổi quyền/scope (không dùng upsertUserAction — requireManager sẽ chặn Leader).

**DoD**: thêm/sửa NV + tạo/sửa team (TST test) → audit entry CREATE_USER/UPDATE_USER/CREATE_TEAM/UPDATE_TEAM đúng actor; lint/build pass.

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify độc lập (diff đúng scope; lint 0 errors; build PASS; edge test tsx: evaluation.team_id sync + R2 evaluator reset; live UI: CREATE_USER audit xuất hiện ngay; cleanup P66 test data xong — nguyên trạng 22/3/22/1/8).

### [#P67] [UI] Cập nhật Trang Hỗ trợ + In Hướng Dẫn (đầy đủ + đẹp + screenshot)
**Status**: `[x]` — DONE 14-08: (1) 5 ảnh minh họa thật chụp từ app (dashboard/employees/evaluation-detail/settings-log/reports — `public/screenshots/`, 856KB tổng, không chứa data test); (2) `src/app/support/page.tsx` + `public/print-guide.html` đồng bộ: mục mới "Khi đánh giá bị trả lại" (P64), section "AI hỗ trợ đánh giá" (4 thẻ), sửa note đổi Leader thành 2 cách (nhanh qua Chỉnh sửa nhóm / qua Nhân viên), FAQ +2 (trả lại, cảnh báo bất thường ≥20 điểm), chèn ảnh vào 3 section chính. Sequential Thinking gate passed; agy implement; Mika verify: lint 0 errors, build PASS, /support render đủ, 5 ảnh HTTP 200, print-guide 6 chương OK. Commit `ce0ceb5`.

### [#P68] [code] Fix nhỏ: default team form Thêm NV + dọn dead code upsertUserAction
**Status**: `[x]` — DONE 14-08: (1) `employees/page.tsx` — `initialTeamId` bỏ `teams[0]?.id` (thêm mới default "Chọn nhóm..." thay vì nhóm đầu — tránh gán nhầm team thật; verified browser: teamDefault=Chọn nhóm..., submit thiếu team bị chặn + toast, user không tạo); (2) `actions/users.ts` — xóa `upsertUserAction` dead code + imports thừa. Lint 0 errors, build PASS (agy + Mika verify độc lập). Commit `[#P68]`.

---

## Phase 69: Bật đăng nhập mật khẩu thật (P44-C1) 🟡 (2026-08-14)

> Yêu cầu anh: bật login password thật; **KHÔNG đặt pass sẵn account nào** (để nguyên NULL) — NV tự đặt sau qua Cài đặt → Tài khoản. Rule: NULL → login mã NV thuần; có hash → bắt buộc pass đúng. Chi tiết: `.ai/MASTER_PLAN.md` Phase 69.

### [#P69T01] [src/actions/auth.ts + login page + AuthContext] Server actions login/logout + wire UI

**Goal**: Login mật khẩu thật: server action verify (bcrypt + rule NULL fallback), cookie `auth_session` httpOnly; bật password field login page.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. File mới `src/actions/auth.ts` (`'use server'`):
   - `loginAction(employeeCode, password)`: query user qua `supabaseAdmin` (src/lib/supabase-admin) theo `employee_code` + `is_active = true` (maybeSingle); **rule**: `password_hash = NULL` → không cần pass; `password_hash != NULL` → `bcrypt.compare` bắt buộc (sai → error "Mật khẩu không đúng."); không tìm thấy → error "Mã nhân viên không hợp lệ hoặc không tồn tại."; set cookie `auth_session` = user.id qua `cookies()` (httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax', path: '/', maxAge 7 ngày); trả `{ success, user?: User, error? }` — user qua `mapUserFromDb`, KHÔNG bao giờ trả password_hash.
   - `logoutAction()`: `cookies().delete('auth_session')` → `{ success: true }`.
2. `src/contexts/AuthContext.tsx`: `login(employeeCode, password)` → gọi `loginAction` (import từ '@/actions/auth'); error → throw; success → setUser + `localStorage.setItem('auth_user_id', ...)` (KHÔNG set cookie client nữa — server đã set). `logout()` → gọi `logoutAction` + xóa localStorage + setUser(null).
3. `src/app/login/page.tsx`: bật password field (bỏ `disabled` + placeholder "Không yêu cầu mật khẩu (Mock)" → "Nhập mật khẩu (nếu đã đặt)"), thêm state password; `handleLogin` gọi `login(employeeCode, password)`; hint nhỏ "Chưa đặt mật khẩu → chỉ cần nhập mã NV"; giữ nguyên demo users block + `window.location.href = '/dashboard'`.

**Constraints**: KHÔNG đổi tên cookie / middleware / getSessionUser; KHÔNG đụng changePassword/resetPassword (task T02); KHÔNG thêm rate-limit (ngoài scope — ghi nhận).

**Definition of Done**: lint 0 errors + build PASS; browser: pass field active, account NULL vào được không cần pass, account có hash (tạo test tạm) sai pass bị chặn + đúng pass vào dashboard; cookie auth_session httpOnly.

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify độc lập (diff đúng scope 3 file; lint 0 errors; build PASS). Browser thật: pass field active + hint; login 158 hash NULL → dashboard OK (server action + cookie httpOnly + middleware); **phát hiện**: 158 CÓ hash sót từ test P52 → đã reset NULL (nguyên tắc khôi phục 13-08); nhánh hash chứng minh hoạt động ("Vui lòng nhập mật khẩu." khi hash còn); `document.cookie` rỗng = httpOnly ✓. **BUG phát hiện + fix**: logout UI cũ xóa cookie bằng `document.cookie` → bất lực với httpOnly → không đăng xuất được (middleware redirect loop). Fix Sidebar.tsx gọi `logout()` (server action); verify CDP chuẩn (profile sạch): login → click Đăng xuất → POST action → /login → /dashboard bị chặn = **LOGOUT_VERIFIED_PASS** (commit `1b805d0`). Commit chính `19476cd`.

---

### [#P69T02] [db/migration + src/actions/account.ts] REVOKE password_hash anon + account actions sang admin client

**Goal**: Chặn anon đọc `password_hash` (lộ qua API public khi có hash thật); chuyển changePassword/resetPassword sang `supabaseAdmin` (không phụ thuộc RLS anon).

**Depends on**: `[#P69T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. File mới `db/migration-i-password-revoke.sql`: `REVOKE SELECT (password_hash) ON public.users FROM anon;` + comment. (Chạy trên Supabase qua Management API — Mika verify lúc thực thi.)
2. `src/actions/account.ts`: `changePassword` + `resetPassword` đổi import `supabase` (anon) → `supabaseAdmin` (src/lib/supabase-admin); KHÔNG đổi logic.
3. Verify PostgREST: sau REVOKE, client `select('*')` users (src/lib/db/users.ts dùng `select('*')`) KHÔNG lỗi — nếu lỗi → đổi query explicit bỏ cột password_hash.

**Constraints**: KHÔNG siết thêm RLS khác (C3 còn lại defer); không đổi login/logout.

**Definition of Done**: migration chạy OK; anon query users KHÔNG trả password_hash (test thật qua PostgREST); changePassword/resetPassword thao tác hash OK qua admin; app select('*') không vỡ (browser employees page load).

**Status**: `[x]` — DONE 14-08: agy viết migration + account.ts; Mika verify độc lập. **Migration thật đã chạy** (MCP PAT config.yaml — PAT ~/.supabase/access-token hết quyền kurabe): anon đang GRANT ALL table-level → column REVOKE vô hiệu → `REVOKE SELECT ON users FROM anon` + `GRANT SELECT (11 cột trừ password_hash)` → `anon_can_select_hash=false` ✓. **Hệ quả bắt buộc đã xử lý**: PostgREST `select('*')` users LỖI "permission denied" → thêm hằng `USER_SELECT` (users.ts, không hash) thay mọi `select('*')`/`.select()` (users.ts ×5, lib/auth.ts, AuthContext.tsx) + `mapUserFromDb` nhận `Omit<DbUser,'password_hash'>`. Verify: anon explicit hash BLOCKED ✓, USER_SELECT 22 rows ✓, service đọc hash OK ✓, lint 0 errors, build PASS, browser login 158 → dashboard + /employees 22 NV ✓. Commit `656f1c0`.

---

### [#P69T03] [docs + test] Test E2E 3 case + docs + commit

**Goal**: Verify đủ 3 case login trên user TEST (KHÔNG đụng account thật); dọn test data; docs + commit.

**Depends on**: `[#P69T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Tạo user test tạm (employee_code `TST-PW`, role Employee, is_active, team NULL) qua Management API; đặt pass tạm (qua changePassword flow browser hoặc hash bcrypt trực tiếp).
2. **Case 1** (NULL): user test chưa đặt pass → login mã NV không cần pass → dashboard OK.
3. **Case 2** (có hash): login sai pass → bị chặn "Mật khẩu không đúng."; đúng pass → vào dashboard; verify cookie httpOnly (devtools/curl) + logout → về login.
4. **Case 3** (reset): Manager reset pass (resetPassword) → hash NULL → login mã NV fallback lại.
5. Verify anon không đọc được password_hash (query thật qua PostgREST anon key).
6. Dọn user test (hard delete qua Management API — users test không có evaluation); verify DB nguyên trạng (22/3/22/1/8).
7. Docs: MASTER_PLAN Phase 69 DONE + tasks.md sweep + KNOWN_BUGS nếu phát hiện + HANDOFF; commit từng task `[#P69T0x]` (T01, T02, T03 riêng).

**Constraints**: KHÔNG đụng account thật (đặc biệt 158/lyly); push CHỈ khi anh báo.

**Definition of Done**: 3 case PASS; anon hash ẩn verified; DB nguyên trạng; docs đủ; git log sạch.

**Status**: `[x]` — DONE 14-08: user test TST-PW tạo qua service (KHÔNG đụng account thật); **Case 1** NULL → login TST-PW không pass → /dashboard ✓; **Case 2** đặt hash bcrypt `Testpass@123` → sai pass chặn "Mật khẩu không đúng." (ở lại login, không set session) ✓ + đúng pass → /dashboard ✓; **Case 3** reset NULL → login mã NV fallback → /dashboard ✓. Anon hash ẩn verified (T02). Dọn: xóa TST-PW + logout sạch → **NGUYÊN TRẠNG 22/3/22/1/8 + 158 hash NULL** ✓. Docs: MASTER_PLAN Phase 69 ✅ + KNOWN_BUGS 5 bài học mới + DECISIONS #12 (đã ghi ở /plan).

---

## Phase 70: C3 — Siết RLS write (anon chỉ SELECT) 🔴 (2026-08-14)

> Yêu cầu anh: đóng lỗ hổng còn lại — 8 bảng data chính đang anon-write full. **CONTROLLED** (chạm DB/schema/auth) → Reviewer gate. Chi tiết bằng chứng + thiết kế: `.ai/MASTER_PLAN.md` Phase 70.

### [#P70T01] [src/actions/evaluation.ts + db] Đổi anon → supabaseAdmin + rà callers + migration evaluations/rounds/responses

**Goal**: actions/evaluation.ts (14 writes) hiện server action nhưng dùng `supabase` ANON → đổi `supabaseAdmin` (không đổi logic); rà callers các write của lib/db/evaluations.ts; migration siết 3 bảng evaluation.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. `src/actions/evaluation.ts`: đổi import `supabase` → `supabaseAdmin`; verify từng hàm không phụ thuộc RLS anon.
2. **Đóng cửa sổ fail im lặng (góp ý Reviewer R1+R2)**: chuyển **ĐỦ 3 write** trong `syncEvaluationAfterUserChange` sang `supabaseAdmin` NGAY TRONG T01, TRƯỚC migration j1: (a) `teams.leader_id` khi đổi role Leader/Employee (users.ts:59-66 — SÓT ở vòng 1), (b) `evaluations` employee_role/team_id (L70-76), (c) `evaluation_rounds` evaluator (L120-126). L112-118 không phải write (logic loop — không đụng). Test ngay sau j1 MỞ RỘNG: đổi user test → Leader → verify `teams.leader_id` sync + đổi xuống Employee → leader_id = null + evaluator R1/R2 + evaluation.team_id (không fail im lặng).
3. Rà callers + **bóc references client (góp ý R2 — chống lộ service key)**: `upsertEvaluation`/`upsertRound`/`ensureEvaluationsForUsers` (lib/db/evaluations.ts) chuyển `supabaseAdmin`; **XÓA import module-level của chúng khỏi `src/hooks/use-db.ts` (L10-13) + xóa 2 hook thừa `useUpsertEvaluation`/`useUpsertEvaluationRound` (L136-157, không page nào dùng)** — nếu không, client bundle (employees/teams/criteria pages import use-db.ts) sẽ kéo `supabase-admin.ts` → lộ service key; thêm `import 'server-only'` vào `src/lib/supabase-admin.ts` (fail-fast — build/browser sẽ throw nếu còn client import). onSuccess client chỉ invalidateQueries — ensure gọi NỘI BỘ trong action upsert user.
4. Migration `db/migration-j1-rls-evaluations.sql`: drop "Enable all access for anon" trên `evaluations`/`evaluation_rounds`/`evaluation_responses` → policy SELECT-only (pattern migration-d; evaluation_responses KHÔNG có write path trong src — khóa bảng vẫn đúng, không cần action riêng). Mika chạy qua Management API + verify anon INSERT/UPDATE/DELETE BLOCKED ngay.

**Definition of Done**: lint/build PASS; browser: chấm điểm + nộp + trả lại + approve chạy đúng (user test); anon write 3 bảng evaluation bị chặn (test thật).

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify. actions/evaluation.ts → supabaseAdmin (14 writes, không đổi logic); **sync đủ 3 write admin** (teams.leader_id + evaluations + rounds — góp ý R1+R2) move vào actions/users.ts; `upsertUserAction`/`upsertUsersAction`/`softDeleteUserAction` (requireManager + audit + revalidate + ensure nội bộ); hooks bóc references client + xóa 2 hook thừa; `import 'server-only'` vào supabase-admin.ts + **tách `evaluations-write.ts`** (fix build fail: evaluations.ts client kéo admin); bỏ audit trùng ở UI. **Migration j1 đã chạy** (3 bảng evaluation SELECT-only): verify anon insert=ERROR, update/delete real-row=0 rows (RLS chặn ngầm — đúng semantics), anon SELECT vẫn OK. Lint 0 errors, build PASS, browser login+dashboard+employees 22 NV ✓. Commits `5649957`, `0d6a5ca`.

---

### [#P70T02] [src/actions/users.ts + teams.ts + forms + db] Server actions users/teams + wire + migration

**Goal**: Chuyển mọi write users/teams từ lib/db anon → server actions (requireManager + admin + audit + revalidate); forms gọi actions; migration siết users/teams.

**Depends on**: `[#P70T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. `src/actions/users.ts` (ĐÃ TỒN TẠI — chứa deleteUserAction): mở rộng — move logic `upsertUser` (+ syncEvaluationAfterUserChange — đã admin từ T01), `upsertUsers`, `softDeleteUser` từ lib/db + requireManager + logAudit + revalidatePath; **chuyển write path của deleteUserAction sang admin trong CÙNG task (trước migration j2)**.
2. `src/actions/teams.ts` (ĐÃ TỒN TẠI — deleteTeamAction): mở rộng `upsertTeam`, `softDeleteTeam` tương tự.
3. Forms: `src/app/employees/page.tsx` (handleSubmit/delete), `src/app/teams/page.tsx` (handleSaveTeam/delete) — wire QUA hooks use-db.ts (`useUpsertUser`/`useUpsertTeam`... đổi mutationFn sang actions, **onSuccess chỉ invalidateQueries — ensureEvaluationsForUsers gọi NỘI BỘ trong action upsert user (không gọi từ client)**).
4. lib/db/users.ts + teams.ts: GIỮ read functions, XÓA hàm write anon. **Chống success giả (góp ý R2)**: delete/upsert actions verify số dòng đổi (dùng .select() hoặc count) — không trả success khi 0 rows (RLS chặn không throw → success giả, bài học P65T06).
5. Migration `db/migration-j2-rls-users-teams.sql` + chạy + verify anon blocked.

**Definition of Done**: lint/build PASS; browser: thêm/sửa/xóa NV + tạo/sửa/xóa nhóm + đổi leader/subleader chạy đúng + audit entry; anon write users/teams bị chặn.

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify. `actions/teams.ts`: `upsertTeamAction` + `softDeleteTeamAction` (requireManager + admin + **chống success giả** .select().single()/count + audit + revalidate); deleteTeamAction alias giữ backward compat; hooks useUpsertTeam/useDeleteTeam → actions (throw khi fail, invalidate teams+users); lib/db/teams.ts xóa write (giữ read); fix thiếu import Team. **Migration j2 đã chạy** (users/teams SELECT-only): verify insert ERROR + update real-row 0-rows + select OK. Lint 0 errors, build PASS, browser teams 3 nhóm render ✓. Commits `1fd9235`, `a8e61c8`.

---

### [#P70T03] [src/actions/criteria.ts + wire + db] Server actions criteria + migration

**Goal**: Chuyển 5 hàm write criteria (group/criterion/levels/default/soft-delete) sang server actions; wire settings/criteria UI; migration siết 3 bảng criteria.

**Depends on**: `[#P70T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. `src/actions/criteria.ts` (ĐÃ TỒN TẠI — deleteCriteriaGroupAction/deleteCriterionAction): mở rộng — move `upsertCriteriaGroup`, `upsertCriterion` (+ levels delete/insert), `updateDefaultLevel`, `softDeleteCriteriaGroup`, `softDeleteCriterion` từ lib/db + requireManager + logAudit + revalidatePath; **chuyển write path delete sang admin trong CÙNG task (trước migration j3)**.
2. Wire UI gọi actions (settings CriteriaTab, /criteria page — qua hooks use-db.ts, giữ onSuccess) — giữ nguyên hành vi.
3. lib/db/criteria.ts: GIỮ read, XÓA write anon. **Chống success giả (góp ý R2)**: các action criteria verify số dòng đổi (RLS chặn không throw → success giả).
4. Migration `db/migration-j3-rls-criteria.sql` + chạy + verify anon blocked.

**Definition of Done**: lint/build PASS; browser: CRUD tiêu chí + thang điểm mặc định chạy đúng; anon write 3 bảng criteria bị chặn.

**Status**: `[x]` — DONE 14-08: agy implement + Mika verify. `actions/criteria.ts`: `upsertCriteriaGroupAction` + `upsertCriterionAction` (appliesTo mapping giữ nguyên + levels delete/insert transactional + chống success giả .select().single()) + `updateDefaultLevelAction` + delete actions chuyển admin (count 0 → fail); hooks 5 mutation → actions; lib/db/criteria.ts xóa write (giữ read). **Migration j3 đã chạy** (3 bảng criteria SELECT-only): verify insert ERROR + update 0-rows + select OK. Lint 0 errors, build PASS, browser criteria 6 nhóm render ✓. Commits `6afc242`, `e061233`.

---

### [#P70T04] [verify] Anon-write BLOCKED toàn bộ + lint/build

**Goal**: Verify độc lập: 8 bảng anon chỉ SELECT (PostgREST thật), không sót write anon trong code.

**Depends on**: `[#P70T03]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Script node anon key: INSERT/UPDATE/DELETE thử trên cả 8 bảng → phải trả lỗi permission.
2. Grep code: 0 chỗ `supabase.from(...)` write ngoài actions (verify bằng search).
3. **Grep verify: KHÔNG client component/page import `supabase-admin`** (server-only fail-fast đã chặn build nếu còn — verify thêm bằng search để khớp acceptance).
4. `npm run lint` + `npm run build` (kill server 3000 trước build).

**Definition of Done**: 8/8 bảng anon write blocked; grep sạch; lint 0 errors; build PASS.

**Status**: `[x]` — DONE 14-08: **verify full 8 bảng** (users/teams/evaluations/evaluation_rounds/evaluation_responses/criteria/criteria_groups/criterion_levels): anon insert ERROR + update real-row 0-rows (RLS chặn ngầm) + select OK — **8/8 PASS**; grep: 0 chỗ supabase write ngoài actions + 0 client (.tsx) import supabase-admin; lint 0 errors + build PASS (đã chạy T03). Commit `757f36e`.

---

### [#P70T05] [docs + test] E2E toàn diện + docs + Reviewer gate + commit

**Goal**: Test E2E P65-style mọi flow nghiệp vụ trên user test; docs; Reviewer package; commit.

**Depends on**: `[#P70T04]` — **Parallel-safe**: `no`

**Concrete changes**:
1. User test tạm (TST-PW style): CRUD NV/nhóm/tiêu chí + đánh giá 3 vòng (draft → submit → return → approve) + password login + **test sync khi đổi role/team sau j1** (đổi role/team user test → verify evaluator R1/R2 + team_id sync) — KHÔNG đụng data thật; dọn + nguyên trạng 22/3/22/1/8.
2. **Minor fix (góp ý Reviewer)**: AccountTab.tsx:41-45 vẫn select `password_hash` qua anon (REVOKE từ P69 → query lỗi → hasPassword luôn false → UI sai "Đặt mật khẩu" thay vì "Đổi mật khẩu") — chuyển check qua server action (vd `getAccountStatus` trong actions/account.ts) hoặc bỏ field.
3. Docs: MASTER_PLAN Phase 70 DONE + KNOWN_BUGS + HANDOFF + DECISIONS.
4. **Reviewer package** (fresh session profile reviewer — plan review đã PASS trước khi T01; review này cho kết quả thực thi) → verdict PASS mới đóng phase.
5. Commit từng task `[#P70T0x]`.

**Definition of Done**: E2E PASS + Reviewer PASS + DB nguyên trạng + git clean.

**Status**: `[x]` — DONE 14-08: **E2E browser toàn diện PASS**: tạo/sửa NV qua UI (upsertUserAction — ensure nội bộ tạo evaluation + round 1; sync subleader → evaluator đúng — góp ý R1/R2); đánh giá **3 vòng đầy đủ** (432 SubLeader → 663 Leader → 158 Manager **Approved B/110**, round sau tự tạo đúng evaluator); password login (sai pass chặn "không đúng", đúng pass → dashboard); AccountTab hasPassword fix (`getAccountStatus` server-side — bỏ select password_hash anon); dọn TST-P70 + rounds + evals + audit → **NGUYÊN TRẠNG 22/3/22 + 158 hash NULL** ✓. Docs: MASTER_PLAN DONE + KNOWN_BUGS 7 bài học P70 + HANDOFF. Reviewer kết quả thực thi → PASS (R4).

## Phase 71: Hướng dẫn 3 vai trò chi tiết + sidebar "Hỗ trợ"→"Hướng dẫn" + in theo vai trò 🟡 (2026-08-15)

> Yêu cầu anh: hướng dẫn THẬT chi tiết 3 vai trò (Manager/Leader/SubLeader — + Employee cho đủ 4 role thật) theo thứ tự luồng dùng app, tinh gọn dễ hiểu, kèm screenshot khoanh vùng cụ thể; sidebar "Hỗ trợ"→"Hướng dẫn"; hiển thị theo role đang login; nút in có chọn vai trò, mặc định role đang login. Reviewer PASS (R2) sau khi sửa 5 góp ý R1 + 3 góp ý minor R2. Chi tiết: `.ai/MASTER_PLAN.md` Phase 71.

### [#P71T01] [src/lib/guide-content.ts] Tạo manifest + data guide Manager

**Goal**: Tạo `src/lib/guide-content.ts` — nguồn data DUY NHẤT cho web + print; guide Manager đầy đủ luồng thật, mỗi bước khai báo screenshotPath (nullable) + vùng annotate.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. Định nghĩa type `GuideStep` (title, body, screenshotPath: string|null, annotate: {x,y,w,h,label}[] | null), `GuideSection` (role, title, steps[], faq[]), `GuideContent` (map theo role: Manager/Leader/SubLeader/Employee).
2. Guide Manager theo thứ tự: login → đặt/đổi pass → tạo nhóm + leader + ấn định leader → thêm/sửa/xóa nhân viên → kiểm tra tiêu chuẩn có sẵn → chỉnh sửa/bổ sung/tạo thêm tiêu chuẩn + đặt giá trị mặc định → chỉnh thang điểm (Cài đặt) → tạo kỳ đánh giá (nếu chưa có) → xem workflow → tự đánh giá mình → chờ leader nộp → đánh giá vòng cuối → trả đánh giá lại cho leader → dùng AI (gợi ý nhận xét / soạn thông báo / giải thích cảnh báo / tóm tắt kỳ) → xem báo cáo/dashboard → đóng kỳ → FAQ.
3. Mỗi bước khai báo `screenshotPath` = `public/screenshots/guide/manager-<step>.jpg` (nullable cho bước text-only/FAQ) + `annotate` vùng khoanh (box + số thứ tự) — đúng thứ tự bước trong manifest.

**Definition of Done**: file tạo + type-check PASS; manifest Manager đủ luồng; không ảnh hưởng UI cũ (chưa wire).

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. `src/lib/guide-content.ts` tạo — types (GuideStep/GuideRole/GuideSection) + guideContent map 4 role; guide Manager 16 bước đúng luồng (login → pass → nhóm/leader → NV → tiêu chuẩn/default → thang điểm → kỳ → workflow → tự đánh giá → chờ leader → vòng cuối → trả lại → AI → báo cáo → đóng kỳ) + 6 FAQ; screenshotPath khai báo đủ 15 ảnh (bước workflow text-only null); annotate null chờ T03; Leader/SubLeader/Employee placeholder (steps/faq rỗng). tsc --noEmit PASS, 0 emoji, 0 script. Commit `373ffac`.

---

### [#P71T02] [src/lib/guide-content.ts] Data guide Leader + SubLeader + Employee

**Goal**: Bổ sung guide 3 role còn lại theo quyền thật (Leader CRUD NV trong nhóm, SubLeader đánh giá vòng 1, Employee xem kết quả) — web + print không role nào rỗng.

**Depends on**: `[#P71T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Guide Leader: login → đặt/đổi pass → xem dashboard/nhóm → quản lý dữ liệu theo quyền (thêm/sửa Employee/SubLeader TRONG nhóm mình; không xóa, không đổi Leader — đúng page.tsx:201-202) → chờ SubLeader nộp vòng 1 → tự đánh giá mình (vòng riêng) → đánh giá nhân viên vòng 2 → trả lại vòng 1 nếu cần → AI gợi ý → xem báo cáo phạm vi nhóm → FAQ.
2. Guide SubLeader: login → đặt/đổi pass → xem dashboard → đánh giá vòng 1 (NV trong nhóm phụ trách) + tự đánh giá mình → sửa sau khi bị trả lại → AI gợi ý → FAQ.
3. Guide Employee: login → đặt/đổi pass → xem kết quả đánh giá/phản hồi của mình → workflow 3 vòng (SubLeader → Leader → Manager) → FAQ (tái sử dụng nội dung card "Nhân viên" hiện có page.tsx:78-86, 210-213).
4. Khai báo screenshotPath + annotate cho từng bước (nullable text-only).

**Definition of Done**: 3 role đủ guide + type-check PASS; manifest đủ 4 role.

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. `guide-content.ts` bổ sung đủ 3 role: **Leader 9 bước** (login → pass → dashboard → CRUD NV trong nhóm theo quyền → tự đánh giá → vòng 2 → trả lại vòng 1 → AI → báo cáo nhóm) + 4 FAQ; **SubLeader 7 bước** (login → pass → dashboard → vòng 1 NV phụ trách → tự đánh giá → sửa khi bị trả về → AI) + 4 FAQ; **Employee 4 bước** (login → pass → xem kết quả → workflow 3 vòng text-only) + 3 FAQ. Manifest đủ 4 role: Manager 15 ảnh / Leader 9 / SubLeader 7 / Employee 3 (bước workflow text-only null). tsc PASS, 0 emoji. Commit `d7368a8` (kèm tick T01 tasks.md).

---

### [#P71T03] [public/screenshots/guide/] Chụp thật + annotate khoanh vùng (PIL) theo manifest

**Goal**: Chụp screenshot thật từng màn chính (browser/CDP, login 4 role: 158 Manager / 663 Leader / 432 SubLeader / 1 Employee) + khoanh vùng bằng Python PIL theo đúng manifest (box + số thứ tự) — iterate manifest, không bỏ sót bước.

**Depends on**: `[#P71T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Viết script chụp (Chrome thật + CDP, user-data-dir riêng từng role) → navigate từng route theo manifest → save `public/screenshots/guide/<role>-<step>.jpg`.
2. Viết script annotate (Pillow): vẽ rectangle + label số thứ tự lên vùng `annotate` đã khai báo → ghi đè ảnh.
3. Iterate manifest — mọi bước có screenshotPath != null phải có ảnh annotate; bước null bỏ qua.
4. Đảm bảo ảnh mới rõ ràng, đúng màn hình thật (không fake).

**Definition of Done**: mọi bước có khai báo ảnh đều có file annotate; không ảnh thừa ngoài manifest.

**Status**: `[x]` — DONE 15-08: Mika thực hiện (task vận hành — runner agy headless không chạy browser/PIL được). **34/34 ảnh chụp thật** login 4 role (158/663/432/16735) qua Chrome thật + CDP: manager 15, leader 9, subleader 7, employee 3. **Vision-verified** ảnh then chốt: login thật, subleader R1 Lần 1/3 (1720 Cẩm Loan), leader R2 Lần 2/3, manager R3 Lần 3/3 + nút AI, modal Sửa nhóm, employee 16735 kết quả L3 B/110. **Annotate khoanh vùng bằng PIL** (box đỏ + số + nhãn) 34/34 — verified 2 ảnh đại diện. **Data tạm restore nguyên trạng**: 1720 R1:NotStarted(432), không R2/R3 (verified). Manifest 34/34 khớp, không thiếu/thừa. Server local port 3000 đang chạy. Chưa commit ảnh (chờ tick).

---

### [#P71T04] [src/components/layout/Sidebar.tsx + src/app/support/page.tsx + support/layout.tsx] UI: label "Hướng dẫn" + render theo role đang login + selector

**Goal**: Đổi sidebar "Hỗ trợ"→"Hướng dẫn" + metadata title; `/support` render guide theo role đang login (mặc định) + selector đổi role (Manager cả 4; Leader/SubLeader/Employee chỉ guide mình).

**Depends on**: `[#P71T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. `Sidebar.tsx:42`: label "Hỗ trợ" → "Hướng dẫn" (giữ icon HelpCircle, href /support).
2. `support/layout.tsx:4`: metadata title "Hỗ trợ | Kurabe QAQC" → "Hướng dẫn | Kurabe QAQC".
3. `support/page.tsx`: thay data hardcode cũ bằng import guide-content; render guide theo role đang login (useAuth → role); selector đổi role — Manager thấy 4 role, Leader/SubLeader/Employee chỉ thấy role mình; nút "In hướng dẫn" mở `/support/print?role=<đang chọn>`.
4. Giữ nguyên các section hiện có nếu hữu ích (workflow/FAQ/AI) — chuyển sang data chung, KHÔNG duplicate.

**Definition of Done**: lint/build PASS; browser: login từng role → /support hiển thị guide đúng role + selector đúng quyền.

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. Sidebar "Hỗ trợ"→"Hướng dẫn" (Sidebar.tsx:42); metadata title "Hướng dẫn | Kurabe QAQC"; `/support` thêm block "Hướng dẫn theo vai trò của bạn" render từ guide-content: intro + 16 bước (kèm ảnh screenshotPath) + FAQ theo role; selector role — Manager 4 nút (Manager/Leader/SubLeader/Nhân viên), Leader/SubLeader/Employee badge cố định; nút in mở `/support/print?role=<đang chọn>`. Fix lint React 19 (setState in effect — bỏ useEffect, currentRole đúng lúc render vì AppLayout guard). lint 0 errors, tsc PASS. Commit `f5224d0`.

---

### [#P71T05] [src/app/support/print/page.tsx] Route in A4 theo vai trò

**Goal**: Route print server component render A4 theo `?role=` từ guide-content (4 role, không rỗng) — nút in từ /support; trang in cho phép chọn role cho MỌI vai trò (mặc định role hiện tại); xử lý print-guide.html cũ.

**Depends on**: `[#P71T04]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Tạo `src/app/support/print/page.tsx` (server component): đọc `?role=` (validate trong 4 role, mặc định từ session role) → render guide theo role từ guide-content với CSS print A4 (kế thừa style print-guide.html hiện có: @page A4 portrait, font 9.5pt, print-color-adjust exact).
2. Selector role trên trang in (mọi vai trò chọn được — in hướng dẫn phát cho người khác), mặc định role hiện tại.
3. Nút in từ `/support` mở `/support/print?role=<đang chọn>`.
4. `public/print-guide.html`: bỏ hoặc redirect sang route mới (tránh 2 nguồn data).

**Definition of Done**: browser: /support/print?role=manager|leader|subleader|employee render đúng nội dung role đó; print A4 không tràn trang; nút in mặc định role hiện tại.

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. Route `/support/print/page.tsx` (server component): đọc `?role=` validate 4 role, mặc định session role; selector role mọi vai trò chọn được (in phát cho người khác) + nút In window.print(); render A4 từ guide-content: doc header (mã tài liệu/khổ giấy/ngày phát hành), alert intro, steps đánh số + ảnh screenshotPath, FAQ 2 cột, footer; CSS @page A4 portrait 12mm/15mm, font 9.5pt, print-color-adjust exact, break-inside avoid; print-guide.html cũ giữ nguyên (không xóa). tsc PASS, lint 0 errors. Commit `4984110`.

---

### [#P71T06] [verify + docs] E2E 4 role + manifest verify + docs + commit

**Goal**: Verify toàn diện: lint/build + browser E2E 4 role (guide đúng role, print đúng nội dung role chọn) + manifest screenshot đủ/không thừa; docs; commit.

**Depends on**: `[#P71T05]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Lint 0 errors + build PASS (kill PID 3000 trước build — rule KNOWN_BUGS).
2. Browser E2E 4 role: login (158/663/432/1) → /support hiển thị guide đúng role + selector đúng quyền → /support/print?role=... render đúng nội dung + in A4.
3. Manifest verify: iterate guide-content — mọi bước screenshotPath != null phải có file annotate tồn tại; không file thừa.
4. Docs: MASTER_PLAN Phase 71 DONE + HANDOFF; commit `[#P71T0x]` từng task (đã commit dọc đường) + tick `[x]`.

**Definition of Done**: lint 0 + build PASS + E2E 4 role PASS + manifest verify PASS + git clean (không push — chờ anh).

**Status**: `[x]` — DONE 15-08: Mika verify toàn diện. **E2E browser 4 role ALL PASS** (login 158/663/432/16735 → /support intro đúng role + Manager 4 nút selector / role khác badge cố định → /support/print?role= steps/faq/ảnh đúng: Manager 16/6/15, Leader 9/4/9, SubLeader 7/4/7, Employee 4/3/3). **Interactive**: Manager click "Nhân viên" → intro đổi guide Employee ✓. **Console**: CDP clean (0 errors). **Visual**: /support block vai trò + selector đẹp; print A4 sạch chuyên nghiệp (vision verified). **Manifest**: 34/34 khớp, không thiếu/thừa. Lint 0 errors + build PASS (kill server trước build). Server local chạy port 3000. Commits `373ffac` `a58d653` `ddb8173` `f5224d0` `4984110` — chưa push.

## Phase 72: Tinh gọn trang Hướng dẫn — tích hợp, loại bỏ phần thừa 🟡 (2026-08-15)

> Yêu cầu anh: trang /support còn 6 section cũ TRÙNG với block mới "Hướng dẫn theo vai trò" — tinh gọn, tích hợp, loại phần thừa. Reviewer R1→R2 PASS. Chi tiết: `.ai/MASTER_PLAN.md` Phase 72.

### [#P72T01] [src/app/support/page.tsx] Xóa 6 section cũ + 7 hằng data + quickLinks + dọn import

**Goal**: Trang chỉ còn 3 phần: header gọn (tiêu đề + nút In) + block `#huong-dan-vai-tro` (guide-content) + cột phải "Nguyên tắc quyền truy cập". Xóa mọi phần trùng.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. XÓA 6 section render cũ: `#huong-dan` (L429-473), `#vai-tro` (L475-508), `#workflow` (L510-545), `#bao-cao` (L547-591), `#ai-ho-tro` (L593-611), `#quan-ly-du-lieu` (L613-689).
2. XÓA 7 hằng data cũ: usageGuide, roleGuides, roleWorkflows, managementGuide, permissionMatrix, aiGuide, reportingGuide + quickLinks.
3. XÓA khối render chips quickLinks (khu vực `mt-5 flex flex-wrap gap-2`) — header chỉ còn tiêu đề + nút In.
4. Dọn import icon: XÓA 7 (ArrowRight/BookOpen/ClipboardCheck/FilePenLine/LineChart/ShieldCheck/Sparkles), GIỮ 5 (HelpCircle/Lock/Printer/Settings2/UsersRound) — đúng góp ý Reviewer R1 (Settings2 dùng L720).
5. GIỮ NGUYÊN: block #huong-dan-vai-tro, cột phải "Nguyên tắc quyền truy cập", header (tiêu đề + nút in), handlePrintGuide, guide-content import.

**Definition of Done**: tsc PASS + lint 0 errors + page.tsx còn ~210-260 dòng.

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. page.tsx **738 → 208 dòng** (−529). Xóa 6 section cũ (#huong-dan/#vai-tro/#workflow/#bao-cao/#ai-ho-tro/#quan-ly-du-lieu) + 7 hằng data (usageGuide/roleGuides/roleWorkflows/managementGuide/permissionMatrix/aiGuide/quickLinks/reportingGuide) + khối render chips quickLinks + dọn import 7 icon (ArrowRight/BookOpen/ClipboardCheck/FilePenLine/LineChart/ShieldCheck/Sparkles) — giữ 5 (HelpCircle/Lock/Printer/Settings2/UsersRound). Trang chỉ còn: header gọn + block #huong-dan-vai-tro (guide-content) + cột phải Nguyên tắc. tsc PASS + lint 0 errors + 0 hằng cũ + 0 id cũ.

---

### [#P72T02] [verify] Lint/tsc/build + E2E 4 role + visual không còn section trùng

**Goal**: Verify trang gọn không vỡ: build PASS, E2E 4 role vẫn đúng (intro/print không đổi), visual chỉ còn 3 phần.

**Depends on**: `[#P72T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Kill server đúng PID (ss -tlnp) → npm run build PASS → start → curl /support 200.
2. E2E browser 4 role (script verify-guide-e2e): intro đúng role + print steps/faq/ảnh đúng (Manager 16/6/15, Leader 8/4/8, SubLeader 6/4/6, Employee 4/3/3).
3. Visual: chụp /support → không còn section "Hướng dẫn sử dụng chi tiết" / "Hướng dẫn theo vai trò" (cũ) / "Workflow" / "Báo cáo" / "AI hỗ trợ" / "Quản lý dữ liệu" — chỉ header + block vai trò + Nguyên tắc.
4. Xác nhận ảnh /screenshots/01-05 còn nguyên (print-guide.html không vỡ).

**Definition of Done**: lint 0 + build PASS + E2E 4 role PASS + visual 3 phần + ảnh 01-05 còn.

**Status**: `[x]` — DONE 15-08: Mika verify. Build PASS (kill server trước build), E2E 4 role ALL PASS (Manager 16/6/15, Leader 8/4/8, SubLeader 6/4/6, Employee 4/3/3 — không đổi), visual vision-verified: trang chỉ còn header gọn + block #huong-dan-vai-tro + Nguyên tắc quyền truy cập; KHÔNG còn 6 section cũ. Ảnh /screenshots/01-05 còn nguyên (5 file — print-guide.html không vỡ).

---

### [#P72T03] [docs] MASTER_PLAN + HANDOFF + commit

**Goal**: Ghi kết quả Phase 72 + commit.

**Depends on**: `[#P72T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. MASTER_PLAN Phase 72 DONE (ghi số dòng thật sau xóa, kết quả verify).
2. HANDOFF update.
3. Commit `[#P72T01]` → `[#P72T03]` + tick.

**Definition of Done**: git clean (không push — chờ anh).

**Status**: `[x]` — DONE 15-08: MASTER_PLAN Phase 72 DONE + HANDOFF update + commits `879308c` (T01) + docs (T03).

## Phase 73: Nút "THÊM NHÂN VIÊN" ở trang chi tiết nhóm 🟡 (2026-08-15)

> Yêu cầu anh: thêm nút "THÊM NHÂN VIÊN" ở trang chi tiết nhóm — nhóm mặc định = nhóm đang thao tác. Task chạm DB (tạo user) → Reviewer R1→R2 PASS. Chi tiết: `.ai/MASTER_PLAN.md` Phase 73.

### [#P73T01a] [src/components/modals/EmployeeModal.tsx] Extract modal inline từ employees/page.tsx ra shared

**Goal**: Modal thêm/sửa nhân viên thành shared component — dùng chung 2 nơi (employees + teams/[id]).

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. EXTRACT modal inline từ `src/app/employees/page.tsx` (L37-339: EmployeeModalContent L84-339) ra `src/components/modals/EmployeeModal.tsx` — ĐẦY ĐỦ field: mã NV, họ tên, chức vụ, nhóm, ngày vào, `subleaderId` (dropdown gán SubLeader), `description` (chức danh).
2. Props do caller truyền vào (allUsers + teams + restrictToTeamId + roleOptions...) — KHÔNG tự fetch useTeams/useAuth nội bộ (tránh double-fetch, khác bản dead-code cũ).
3. Đổi employees/page.tsx dùng shared (bỏ bản inline).

**Definition of Done**: tsc PASS + lint 0 + employees/page.tsx vẫn hoạt động như cũ.

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. Modal inline (L37-339) → shared `components/modals/EmployeeModal.tsx` (đầy đủ subleaderId + description + allUsers/teams props caller truyền, không tự fetch). employees/page.tsx dùng shared (1012→709 dòng). tsc PASS + lint 0 + E2E Manager/Leader thêm NV OK (qua T02).

---

### [#P73T01b] [src/app/teams/[id]/page.tsx] Thêm nút "THÊM NHÂN VIÊN"

**Goal**: Trang chi tiết nhóm có nút thêm nhân viên — nhóm mặc định = nhóm đang mở.

**Depends on**: `[#P73T01a]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Import/hook thêm: `useState`, `useQueryClient`, `useToast`, `upsertUserAction`, `isManager` (từ useAuth — hiện chỉ destructure `user`), `EmployeeModal` shared, `UserPlus` icon.
2. Nút "THÊM NHÂN VIÊN" (icon UserPlus) trong header cạnh KPI compact (L177-198) — **chỉ hiện khi `isManager`**.
3. Mở `EmployeeModal` với `restrictToTeamId={teamId}` (nhóm mặc định = nhóm đang mở + select disabled) + `roleOptions={['Employee', 'SubLeader']}`.
4. onSave: `upsertUserAction(payload)` → toast → invalidate object v5: `queryClient.invalidateQueries({ queryKey: ['users'] })` + `{ queryKey: ['teams'] }` + `{ queryKey: ['evaluations'] }`.
5. State: `isAddModalOpen` + `isSaving`.

**Definition of Done**: tsc PASS + lint 0.

**Status**: `[x]` — DONE 15-08: agy implement + Mika verify. Nút "Thêm nhân viên" (UserPlus, `canAddEmployee = isManager || (Leader && teamId===user.teamId)`) cạnh KPI + EmployeeModal shared (restrictToTeamId=teamId, roleOptions SubLeader/Employee) + onSave upsertUserAction + invalidate object v5. tsc PASS + lint 0.

---

### [#P73T02] [verify] Lint/tsc/build + browser E2E thêm NV từ trang nhóm

**Goal**: Verify chức năng hoạt động đúng + quyền đúng.

**Depends on**: `[#P73T01b]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Kill server đúng PID → npm run build PASS → start → curl /teams/{id} 200.
2. Browser E2E (Manager 158): /teams/{id} → nút "THÊM NHÂN VIÊN" hiện → mở modal → field Nhóm = tên nhóm đang mở + disabled → thêm NV mới (mã/họ tên/chức vụ Employee/ngày) → save.
3. Assert: KPI "thành viên" +1 + block "Chưa gán SubLeader" +1 (NV mới subleaderId null) + member mới status "Chưa bắt đầu" (ensureEvaluationsForUsers tạo NotStarted).
4. Verify Leader (663) KHÔNG thấy nút (gate isManager).
5. Audit CREATE_USER ghi.

**Definition of Done**: build PASS + E2E PASS (Manager thêm thành công + Leader không thấy nút).

**Status**: `[x]` — DONE 15-08: Mika verify. Build PASS + E2E thật (CDP browser): **Manager 158** mở team "QC Gia dụng" → nút hiện ✓ → modal "Thêm nhân viên mới" ✓ → field Nhóm = "QC Gia dụng" + **disabled** ✓ → thêm NV TMP73 → toast "Thêm nhân viên thành công!" ✓ → TMP73 xuất hiện trong trang ✓. **Leader 663** (team "QI Xe hơi" — chỉ thấy 1 team của mình) → nút hiện ✓ → thêm NV TMP73L thành công ✓. **SubLeader 432** → KHÔNG thấy nút ✓. NV tạm TMP73/TMP73L đã xóa mềm (is_active=false — getUsers filter is_active=true nên sạch UI). ⚠️ PHÁT HIỆN môi trường: shell env ô nhiễm NEXT_PUBLIC_SUPABASE_URL=sangwebsite → build/start phải `unset` trước khi chạy (đã fix, E2E ALL PASS).

---

### [#P73T03] [docs] MASTER_PLAN + HANDOFF + commit

**Goal**: Ghi kết quả + commit.

**Depends on**: `[#P73T02]` — **Parallel-safe**: `no`

**Concrete changes**:
1. MASTER_PLAN Phase 73 DONE.
2. HANDOFF update + ghi follow-up canManageEmployees vs requireManager vào KNOWN_BUGS.
3. Commit + tick (không push — chờ anh).

**Definition of Done**: git clean (chưa push).

**Status**: `[x]` — DONE 15-08: MASTER_PLAN Phase 73 DONE + HANDOFF update + commits `3714a7c` (T01a) + `7856725` (T01c) + `f94f1a1` (T01b) + docs (T03).

## Phase 75: Chat widget hỗ trợ (Manager/Leader/SubLeader) 🟡 (2026-08-15)

> Yêu cầu anh: chat widget góc dưới phải giải đáp thắc mắc cho Manager/Leader/SubLeader; tham khảo file .md mô tả toàn bộ webapp; không trả lời ngoài lề; 15 lượt/account/2h; model gpt-5.6-luna (opencode go); gọi "chị"/xưng "em"; chào ngắn theo trang khi mở; không emoji. Reviewer R1→R2 PASS (plan). CONTROLLED (chạm DB chat_usage + LLM backend).

**Status**: `[ ]` — chờ anh duyệt thực thi (6 tasks: T01 knowledge.md / T02a action / T02b bảng + type / T03 widget / T04 mount / T05 verify).
