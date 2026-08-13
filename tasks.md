# KURABE QAQC — Task List (WBS)

> File làm việc cho `/do` — chỉ giữ phase ACTIVE + việc chờ. Phase đã DONE (52-59): chi tiết ở `.ai/MASTER_PLAN.md`, tóm tắt mở phiên ở `HANDOFF.md`.

## Phase 44: Security Hardening 🔴 (PARTIAL — C2+C3 xong ở Phase 54; còn C1 + refactor client writes)

### [#P44C1] Auth Fix — CÒN LẠI (defer sau UAT)
- Thêm password/PIN cho Manager login (hotfix); dài hạn migrate Supabase Auth.
- ⚠️ Nguyên tắc khôi phục (chốt 13-08): `password_hash = NULL` = chưa đặt → vẫn login mã NV (dự phòng); quên mật khẩu → reset NULL qua MCP/SQL Editor → login mã NV → đặt lại.

### [#P44C2] Refactor client writes sang server actions — CÒN LẠI
- Client vẫn anon-write `users`/`teams`/`evaluations`/`evaluation_rounds`/`evaluation_responses`/`criteria` (ghi nhận rủi ro; làm cùng C1). `audit_logs` select mở anon (đồng bộ mô hình anon-read).

---

## Pending / Next (chốt 13-08)
- Chờ anh báo **PUSH** (local ahead; kèm 3 AI env lên Vercel: AI_API_KEY, AI_BASE_URL, AI_MODEL=gpt-5.6-luna).
- **QI Gia dụng chưa gán Leader** (lyly phát hiện — anh cập nhật khi UAT).
- P2 "Gợi ý khác" + Chat hỏi đáp dữ liệu — sau kỳ đầu có data thật.

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

## Phase 61: SubLeader đa dạng + gán NV theo SubLeader 🔴 (CONTROLLED — schema + workflow) (2026-08-13)

### [#P61T01] [db/migration-h-subleader.sql + src/types/*] users + subleader_id + description

**Goal**: Thêm 2 cột vào `users`: `subleader_id` (uuid NULL, FK users) + `description` (text NULL — chức danh: Tổ trưởng/Trưởng ca...); đồng bộ types database + `User` (index.ts) + mapUserFromDb.

**Depends on**: `none` — **Parallel-safe**: `no`

**Concrete changes**:
1. Migration SQL (đặt tên `db/migration-h-subleader.sql`): `ALTER TABLE users ADD COLUMN IF NOT EXISTS subleader_id uuid REFERENCES users(id), ADD COLUMN IF NOT EXISTS description text;` — chạy qua Supabase Management API (verify HTTP 201 + cột tồn tại)
2. `src/types/database.ts`: users Row/Insert/Update + `subleader_id: string | null` + `description: string | null`
3. `src/types/index.ts` `User`: + `subleaderId?: string | null` + `description?: string | null`
4. `src/lib/db/users.ts` `mapUserFromDb`: map 2 cột mới

**Definition of Done**: migration chạy xong (cột tồn tại — query verify); build PASS (types khớp).

**Status**: `[ ]`

---

### [#P61T02] [DB — backfill] Gán subleader_id cho NV hiện có + description mẫu

**Goal**: NV hiện có gán `subleader_id` = SubLeader của team mình (1 subleader/team hiện tại — lấy user role SubLeader theo team; team không có → NULL); subleader hiện có gán `description` mẫu "Tổ trưởng".

**Depends on**: `[#P61T01]` — **Parallel-safe**: `no`

**Concrete changes** (SQL qua Management API — 1 script):
1. `UPDATE users SET subleader_id = (SELECT id FROM users s WHERE s.role='SubLeader' AND s.team_id = users.team_id LIMIT 1) WHERE role='Employee'`
2. `UPDATE users SET description = 'Tổ trưởng' WHERE role='SubLeader' AND (description IS NULL OR description='')`
3. Verify: đếm NV có subleader_id vs tổng Employee (theo team) — mỗi team đúng subleader; không subleader → NULL (ghi danh sách team thiếu)

**Constraints**: KHÔNG đụng Leader/Manager/SubLeader rows (chỉ Employee nhận subleader_id); rollback = ghi lại giá trị cũ trước khi chạy (snapshot JSON trước).

**Definition of Done**: query verify số liệu đúng (vd QC Gia dụng 15 NV → subleader_id = SubLeader team đó); snapshot trước đã lưu.

**Status**: `[ ]`

---

### [#P61T03] [src/data/workflow.ts + chỗ khởi tạo round 1] Vòng 1 theo subleader được gán

**Goal**: Round 1 của NV chỉ do **subleader được gán** đánh giá (bỏ "mọi SubLeader cùng team").

**Depends on**: `[#P61T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. `src/data/workflow.ts` `matchesEvaluatorSelector`: nhánh `SubLeader` → `evaluator.id === target.subleaderId` (target: User | Evaluation — Evaluation cần expose subleaderId qua employee — kiểm tra: nếu target là Evaluation, lấy qua employeeId → user; nếu target.subleaderId undefined → return false)
2. Tìm chỗ KHỞI TẠO round 1 (search `evaluator_id` khi tạo round — actions/evaluation.ts hoặc lib/db/evaluations.ts): gán `evaluator_id = employee.subleaderId` (thay vì subleader team). Nếu chưa có subleaderId → round 1 không khởi tạo/đánh dấu chưa gán (theo quyết định: chặn tới khi gán)
3. `src/lib/db/evaluations.ts` filter `filterEvaluationsForViewer` (dòng ~65, ~120): kiểm tra nhánh SubLeader — đảm bảo SubLeader chỉ thấy evaluation của NV MÌNH được gán (subleaderId)

**Definition of Done**: unit test logic qua tsx (NV gán subleader A → A match, B không match); build PASS.

**Status**: `[ ]`

---

### [#P61T04] [src/components/settings/TeamsRolesTab.tsx] Hiển thị nhiều SubLeader/team + cảnh báo thiếu gán

**Goal**: Teams tab hiển thị DANH SÁCH SubLeader của team (bỏ giới hạn 1) + cảnh báo NV chưa gán SubLeader.

**Depends on**: `[#P61T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. TeamsRolesTab: thay "1 SubLeader" → list SubLeader (users role SubLeader theo team) — hiển thị tên + description
2. Alert: đếm NV (role Employee, team active) có `subleaderId == null` → cảnh báo "X NV chưa gán SubLeader" (kèm tên team)

**Definition of Done**: browser verify tab hiển thị đủ SubLeader + alert đúng số NV thiếu gán (hiện tại sau backfill: team không có subleader → NV thiếu).

**Status**: `[ ]`

---

### [#P61T05] [src/app/employees/page.tsx + components] Form NV: chọn SubLeader + chức danh

**Goal**: Thêm/sửa NV: dropdown chọn SubLeader (chỉ SubLeader cùng team của NV) + ô nhập description (chức danh); table hiển thị cột SubLeader + chức danh.

**Depends on**: `[#P61T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Form thêm/sửa NV: select "SubLeader" (options = users role SubLeader, team = team NV đang chọn — tự lọc; disable khi chưa chọn team) + input "Chức danh" (description)
2. Table NV: cột "SubLeader" (tên subleader hoặc badge "Chưa gán" — đỏ) + cột "Chức danh"
3. Lưu: gửi subleaderId + description qua server action (users.ts — tìm action create/updateUser — thêm 2 field)

**Definition of Done**: browser verify: tạo/sửa NV gán subleader + chức danh → lưu → table hiển thị đúng; DB đúng.

**Status**: `[ ]`

---

### [#P61T06] [src/app/teams/[id]/page.tsx] Team detail: SubLeaders + NV theo SubLeader

**Goal**: Trang chi tiết nhóm hiển thị danh sách SubLeader + nhóm NV theo từng SubLeader (hiện chỉ Leader).

**Depends on**: `[#P61T01]` — **Parallel-safe**: `no`

**Concrete changes**:
1. Header: hiển thị SubLeader list (tên + description badge)
2. Bảng thành viên: thêm cột/chip "SubLeader" (tên subleader của NV); NV chưa gán → badge "Chưa gán"

**Definition of Done**: browser verify team detail QC Gia dụng hiển thị SubLeader + từng NV gắn đúng.

**Status**: `[ ]`

---

### [#P61T07] [verify + docs] Verify toàn diện + Reviewer + docs

**Goal**: build/lint PASS + browser full flow (NV mới gán SubLeader → round 1 đúng người; backfill đúng) + Reviewer (CONTROLLED — schema/workflow) + MASTER_PLAN/tasks/HANDOFF.

**Depends on**: `[#P61T01..T06]` — **Parallel-safe**: `no`

**Definition of Done**: Reviewer PASS; docs cập nhật; commit.

**Status**: `[ ]`
