# REFACTOR_PLAN — Kurabe QAQC (bước 1: phân tích, KHÔNG sửa code)

> Ngày: 2026-08-16 · Branch: `refactor/zcode` · Người phân tích: ZCode (agent) — mọi phát hiện kèm `file:dòng`, đã spot-verify trực tiếp các mục CAO.
> Ràng buộc tối ưu: **Supabase free + Vercel free** — mọi đề xuất tránh tính năng trả phí; ưu tiên **an toàn/đúng > gọn nhẹ > mượt**.

---

## 1. Tóm tắt hiện trạng

- **Kiến trúc**: Next.js 16.2.4 (App Router) + React 19.2.4 + Supabase (PostgREST) + Vercel. Auth **tự viết bằng bcrypt** (không dùng Supabase Auth): cookie `auth_session` = user.id, server actions dùng `supabaseAdmin` (service role) + `requireAuth/requireRole`; client đọc dữ liệu **trực tiếp bằng anon key** (mô hình "anon-read"), RLS SELECT `USING (true)`.
- **Quy mô**: 134 file TS/TSX trong `src/`, ~18.500 dòng. 9/13 trang là `'use client'` tận root; dashboard + reports là server component có `unstable_cache` (tag, revalidate 300s) làm đúng.
- **Dependencies chính**: `@supabase/supabase-js`, `@tanstack/react-query` v5, `framer-motion` (LazyMotion + m), `lucide-react` (import per-icon — đúng), `recharts` (đã lazy qua `next/dynamic` — đúng), `xlsx@0.18.5`, `modern-screenshot`, `bcryptjs`.
- **Điểm mạnh hiện có**: không có `any`/`@ts-ignore`; mọi action ghi đều check quyền; `USER_SELECT` loại `password_hash`; `server-only` cho supabase-admin; audit log; submit evaluation có idempotent + rollback.

---

## 2. Lỗi / nguy cơ phát hiện

### 2.1 ĐÚNG ĐẮN (bug cho kết quả sai)

| Mức | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|
| CAO | `src/lib/grade-bands.ts:31-36` + `src/lib/scoring.ts:61` + `src/actions/evaluation.ts` (submit path) | **Thang điểm server luôn là bản hardcode cũ.** `loadGradeBandsFromDb()` chỉ được gọi từ client (`GradeBandsTab.tsx:44`, `criteria/page.tsx:50`) — runtime server không bao giờ nạp `cachedBands` → `getGradeBandsSync()` phía server luôn trả `HARDCODED_BANDS`. Hệ quả: Manager chỉnh thang điểm trong Settings thì **grade lưu DB khi submit vẫn tính theo thang cũ**, lệch với grade hiển thị trên UI. *(Đã verify trực tiếp: grep toàn repo không có call server-side nào nạp cache.)* | Trong `saveEvaluationRound` gọi `await loadGradeBandsFromDb()` trước khi tính điểm (dùng `supabaseAdmin` để không phụ thuộc RLS), hoặc chuyển sang read-through cache async. |
| CAO | `src/lib/scoring.ts:66-67` | **`minScore: null` xử lý mâu thuẫn**: sort theo `minScore ?? 0` nhưng match theo `minScore ?? -Infinity`. Band có `minScore` null (validate cho phép — `grade-bands-validate.ts:26`) sẽ match **mọi điểm số** → điểm 10 có thể rơi vào hạng S. | Chuẩn hóa null một cách duy nhất (band null-min chỉ hợp lệ ở mức thấp nhất → match fallback), hoặc cấm null ở validate. Kèm test boundary. |
| VỪA | `src/lib/evaluation-workflow.ts:43-44` | `EVALUATION_FLOWS[employeeRole]` với role lạ từ DB → `undefined.map` → crash action. | `EVALUATION_FLOWS[role] ?? EVALUATION_FLOWS.Employee` + log. |
| VỪA | `src/lib/import.ts:75-78` | Excel serial date có phần thập phân (giờ local) + `Math.round` trên toàn tích → sai lệch 1 ngày; `toISOString()` cắt theo UTC (VN GMT+7 dễ lệch ngày). | `Math.floor(joinDate)` phần ngày trước khi convert, hoặc dùng `XLSX.SSF.parse_date_code`. |
| VỪA | `src/lib/evaluator-resolver.ts:55-90` vs `:129-135` | 2 hàm resolve evaluator hành vi lệch: một cái ưu tiên `teams.leader_id`, một cái chỉ scan role Leader trong team → batch tạo kỳ (`period.ts`) và tạo runtime (`evaluation.ts:91`) có thể chọn **2 evaluator khác nhau** cùng 1 vòng khi dữ liệu mâu thuẫn. | Thống nhất 1 đường resolve duy nhất. |
| VỪA | `src/app/evaluations/[id]/page.tsx:591` | Hardcode `periodName: '2026'` cho thông điệp AI — sang 2027 sai tên kỳ. | Truyền period name thật từ dữ liệu. |
| VỪA | `src/components/reports/BatchResultMessageModal.tsx:90` | `teamName: 'Nhóm QAQC'` hardcode cho mọi nhân viên (chỉ fetch users, không fetch teams) → hiển thị sai team. | Fetch teams map id→name. |
| THẤP | `src/lib/export.ts:52, 82` | `ev.finalScore \|\| ''` và `round.scores[c.id] \|\| 0`: điểm 0 hợp lệ bị thành rỗng/0 không phân biệt "không chấm". | Dùng `??`. |
| THẤP | `src/app/evaluations/[id]/page.tsx:134-140` | `setIsLoadingHistory(false)` được gọi nhưng không bao giờ `setIsLoadingHistory(true)` → spinner "Đang tải lịch sử" dead-state. | Bổ sung set true trước fetch. |

### 2.2 BẢO MẬT

| Mức | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|
| CAO | `src/actions/auth.ts:40-46` + `src/lib/auth.ts:12-21` + `src/middleware.ts:11` | **Cookie session = user.id thô, không chữ ký**. Ai biết UUID của Manager (UUID user lộ qua dữ liệu anon-read, URL, UI) → set tay cookie `auth_session=<uuid>` → mạo danh toàn quyền, bỏ qua mật khẩu. Không có revocation khi reset mật khẩu (`account.ts:109-112`). *(Đã verify trực tiếp.)* | Session token ngẫu nhiên 256-bit lưu bảng `sessions` (Supabase free), cookie chỉ chứa token; xóa session khi reset mật khẩu/logout. Giữ nguyên cookie name để ít phá UI. |
| CAO | `src/actions/auth.ts:25-33` + `src/actions/users.ts` (upsert không set `password_hash` — grep "password" không thấy) | **Login không cần mật khẩu khi `password_hash` NULL**: user mới tạo bởi Manager (hash luôn null) → đăng nhập chỉ cần mã nhân viên. Kết hợp mục trên thành chuỗi mạo danh hoàn chỉnh. *(Đã verify trực tiếp.)* | Từ chối login khi hash null; user mới tạo được cấp mật khẩu khởi tạo ngẫu nhiên (hiển thị 1 lần cho Manager) + ép đổi ở lần đăng nhập đầu (cần quyết định — xem mục 5). |
| CAO | `db/migration-j1/j2/j3` (ví dụ `migration-j2-rls-users-teams.sql:10-14`) + `src/lib/supabase.ts:5` | **RLS SELECT `USING (true)` trên toàn bộ bảng nhân sự + anon key công khai trong client bundle** (`NEXT_PUBLIC_`): bất kỳ ai cũng gọi PostgREST trực tiếp → dump toàn bộ tên/mã NV/role/team, điểm từng vòng, **nhận xét đánh giá**, audit log, tóm tắt AI. Mọi phân quyền theo role trong app (`src/lib/db/evaluations.ts:42-93`) bị bỏ qua hoàn toàn. | Đây là **quyết định thiết kế** (mô hình anon-read để client query trực tiếp). Muốn siết: chuyển reads nhạy cảm (evaluation_rounds, ai_summaries, audit_logs, cột PII của users) qua server actions + `REVOKE SELECT FROM anon`. Xem câu hỏi Q1. |
| CAO | `db/migration-j1-rls-evaluations.sql`, `j2`, `j3` | **Các migration chỉ CREATE POLICY, không `ENABLE ROW LEVEL SECURITY`** (grep toàn repo chỉ thấy ENABLE cho grade_bands/audit_logs/ai_summaries). Nếu RLS chưa bật trên bảng gốc trong DB thật thì policy là **no-op** — và comment `migration-i-password-revoke.sql:7` xác nhận "anon đang có GRANT ALL table-level" → anon có thể **ghi/xóa dữ liệu**. Trạng thái thực trên DB production: KHÔNG BIẾT (schema gốc 0 byte trong repo). | Chạy query kiểm tra trên DB thật: `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('users','teams','evaluations','evaluation_rounds','evaluation_responses','criteria','criteria_groups','criterion_levels','evaluation_periods')`. Chưa bật → migration bật RLS + `REVOKE INSERT/UPDATE/DELETE ON ... FROM anon`. |
| CAO | `src/actions/auth.ts:9-55` | **Không rate-limit/brute-force ở login** + user enumeration (2 thông báo lỗi phân biệt "mã NV không tồn tại" / "mật khẩu sai"). | Đếm thử sai theo (IP, mã NV) trong 1 bảng DB (free) — khóa tạm 15'; gộp chung 1 thông báo lỗi. |
| VỪA | `src/actions/ai.ts:57,108,177,313`, `src/actions/ai-summary.ts:31` | Action gọi LLM (đốt chi phí) không rate-limit. `src/actions/chat.ts:363-368` limit 15 lượt/2h **chỉ áp non-Manager**; check-then-insert (363 → 394) có race cho request đồng thời; `countRecent` lỗi DB trả 0 → **fail-open** (`chat.ts:81-90, 88`). | Áp limit mọi role; reserve slot (insert usage) trước khi gọi AI; lỗi DB → fail-close. |
| VỪA | Toàn bộ `src/actions/*.ts` (vd `users.ts:146,273`, `evaluation.ts:42-49`) | **Không có validation schema** (không zod): `scores: Record<string,number>` không kiểm khoảng giá trị (âm/1e9 vẫn lưu), chuỗi không giới hạn độ dài. | Thêm zod từng action (khoảng điểm theo level criteria, maxlength). |
| VỪA | `src/actions/evaluation.ts:133,305,533`; `users.ts:238,322,379`; `period.ts` (8 chỗ); `account.ts:82,115`; `ai.ts` (4 chỗ); v.v. | **Lộ message Postgres/Supabase thô ra client** (tên bảng/cột/constraint). `src/lib/errors.ts` có sẵn `DatabaseError` nhưng không nơi nào dùng. | Mapper tập trung `toClientError(err, fallbackVi)` — log full server-side, trả message Việt hóa. |
| VỪA | `src/lib/ai.ts:1` | Thiếu `import 'server-only'` (chỉ supabase-admin có) — key không lộ vào bundle nhưng thiếu guard. | Thêm 1 dòng. |
| THẤP | `next.config.ts` | Không security headers (CSP, X-Frame-Options, HSTS, Referrer-Policy). | Thêm `headers()` trong next.config. |
| THẤP | `src/actions/account.ts:8` | Min password 6 ký tự, bcrypt 10 rounds. | ≥ 8 ký tự; cost 12 (Pi5/Vercel chịu nổi). |
| THẤP | `src/actions/audit.ts:6-19` | Bất kỳ user nào cũng tự ghi audit log với `action/entity` tùy ý → ô nhiễm nhật ký. | Ép action/entity whitelist, hoặc chỉ ghi từ server code. |

**Đã kiểm tra, KHÔNG có vấn đề**: không SQL injection (không rpc/raw SQL); service key/AI key/Telegram token/webhook secret chỉ đọc `process.env` phía server, không log; check quyền đầy đủ ở mọi action ghi; `password_hash` đã REVOKE khỏi anon.

### 2.3 HIỆU NĂNG (bundle / cache / query / re-render)

| Mức | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|
| CAO | `src/lib/export.ts:1-3`, `src/lib/import.ts:1` | **`xlsx` (~140KB gzip) import tĩnh vào client bundle** của employees/reports/dashboard (qua `PeriodActions.tsx:5`, `ExportReportButton.tsx:6`, `employees/page.tsx:11`). | `const XLSX = await import('xlsx')` trong handler — chỉ load khi user bấm nút. |
| CAO | `src/components/chat/ChatWidget.tsx:8` + `src/components/layout/AppLayout.tsx:11` | **`modern-screenshot` tĩnh trong initial bundle của MỌI trang** (ChatWidget nằm trong AppLayout ở root layout), dù chỉ dùng khi user gửi screenshot (`ChatWidget.tsx:86-89`). | `await import('modern-screenshot')` trong handler; cân nhắc dynamic ChatWidget. |
| CAO | `src/hooks/use-db.ts:26-30, 80-84, 122-126` | `useUsers`/`useTeams`/`useEvaluations` **thiếu `enabled: !!user`** trong khi AuthContext load user bất đồng bộ → lần đầu (user=null) vẫn query nguyên bảng evaluations+rounds qua mạng rồi `filterEvaluationsForViewer` vứt kết quả; sau đó query lại lần nữa (double fetch). *(Đã verify: grep `enabled` chỉ có ở useUser/useTeamUsers/useTeam.)* | Thêm `enabled: !!user`; guard sớm `if (!user) return []` trong `getEvaluations`/`getUsers`. |
| CAO | `src/app/employees/page.tsx:51`, `src/app/teams/page.tsx:38`, `src/app/teams/[id]/page.tsx:75` | `useEvaluations(undefined, user)` — không truyền `periodId` → `getEvaluations()` không filter kỳ (`src/lib/db/evaluations.ts:47-50`), `select('*, evaluation_rounds(*)')` tải **toàn bộ lịch sử mọi kỳ** (điểm + notes JSON) chỉ để hiển thị trạng thái kỳ hiện tại. *(Đã verify trực tiếp.)* | Truyền `currentPeriod?.id` từ AuthContext. |
| CAO | `src/actions/users.ts:106-129` + `:329-357` | **N+1 bậc thang khi import/sửa user**: `upsertUsersAction` gọi `syncEvaluationAfterUserChange` trong loop per-user; mỗi call fetch all users + mỗi evaluation 1 query rounds + mỗi round 1 update; `logAudit` cũng 1 insert/user trong loop. Import 50 người = hàng trăm query tuần tự. | Fetch rounds bằng `evaluation_id.in.(...)` 1 lần; gom update theo evaluator rồi batch; `logAudit` nhận mảng. |
| VỪA | 9/13 `page.tsx` là `'use client'` tận root | Mất SSR/streaming, skeleton lâu trên thiết bị yếu. | Chuyển shell/danh sách sang server component, đẩy `'use client'` xuống widget. Làm trước với `/employees`, `/teams` (trang chính). Lớn — tách nhiều task. |
| VỪA | `src/lib/auth.ts:9-26` | `getSessionUser` không dedupe — gọi 2-3 lần mỗi render reports (page + action) = 2-3 query users. | Bọc `cache()` của React. |
| VỪA | `src/app/dashboard/page.tsx:26-51`, `src/app/reports/page.tsx:34-53` | Xử lý kỳ đánh giá 2-3 query tuần tự, không cache; reports await tuần tự 3 nguồn độc lập (`reports/page.tsx:59-61`). | Gom 1 query / `Promise.all` / bọc `unstable_cache` tag `periods`. |
| VỪA | `src/components/ui/ConfirmDialog.tsx:4` | Import `motion` bản đầy đủ, phá LazyMotion của toàn app (provider mount ở root layout `layout.tsx:37`) → framer-motion full vào mọi trang. | Đổi sang `m` + `LazyMotion`. |
| VỪA | `src/providers/query-provider.tsx:8-14` | `refetchOnWindowFocus` mặc định true — focus tab sau 60s refetch users/teams/evaluations (query nặng). | `refetchOnWindowFocus: false`. |
| VỪA | `src/lib/db/evaluations-write.ts:130-173` | Insert tuần tự per-user (1 evaluation + 1 round mỗi lần) — `period.ts:105-112` đã batch đúng, nên nhân rộng. | Batch insert. |
| VỪA | `src/app/dashboard/page.tsx:138-148` | Toàn bộ `rawEvaluations` (rounds, scores, notes) serialize vào RSC payload cho 3 client component. | Precompute server-side, truyền dữ liệu đã tổng hợp. |
| THẤP | `src/lib/db/evaluations.ts:50,98,128,177,220`; `src/lib/db/teams.ts:11` | `select('*')` lấy cả cột JSON nặng khi chỉ cần status; users đã có pattern `USER_SELECT` đúng. | Nhân rộng select cột cụ thể. |
| THẤP | `src/contexts/AuthContext.tsx:39-67` | 2 query tuần tự (periods → user) chặn toàn app bằng spinner full-screen; context value không memo (`:125-136`). | `Promise.all`; `useMemo` value. |

### 2.4 CHẤT LƯỢNG / CODE SMELL

| Mức | Vị trí | Vấn đề | Đề xuất |
|---|---|---|---|
| CAO | `package.json` — `xlsx@0.18.5` | Bản npm cũ SheetJS có **CVE-2023-30533 + CVE-2024-22363** (prototype pollution/ReDoS qua file Excel — input người dùng). Bản fix chỉ phát hành qua CDN SheetJS. | Nâng lên 0.20.x từ CDN `https://cdn.sheetjs.com/xlsx-0.20.x/...` (đổi source trong package.json — cần anh Sinh duyệt vì chạm dependencies), hoặc đổi exceljs. |
| VỪA | `src/app/evaluations/[id]/page.tsx` (1065 dòng) | State explosion (13 useState + 1 useReducer, `:126-158`); 7 khối UI từ-chối/loading copy-paste (`:267-411`); toast timer trùng (`:240-254`); `setTimeout` không cleanup (`:436`); ternary màu grade tay (`:769-777`) dù có `getGradeColor`. | Tách hook `useEvaluationPageState` + component `<AccessDenied>`, `<GradeBadge>`, `useAutoResetToast`. |
| VỪA | `src/lib/db/evaluations.ts:47-93` vs `:125-172` | 2 hàm copy-paste ~45 dòng; khối fetch sub-employees lặp 4 lần (`:71-79, 111-115, 150-158, 196-200`). | Tách `buildViewerFilter(user)` + `getSubLeaderViewContext(user)`. |
| VỪA | Màu grade định nghĩa 4+ nơi | `scoring.ts:6-13` (GRADE_COLORS không ai dùng), `reports.ts:131-138`, `dashboard.ts:74-81`, ternary tay ở 3 page. | 1 map + component `GradeBadge` dùng chung. |
| VỪA | `src/data/criteria.ts:1-17` vs `src/lib/grade-bands.ts:17-28` | 2 nguồn sự thật cho thang điểm — gốc của bug 2.1 mục 1. | Để fallback ở 1 nơi, đánh dấu deprecated nguồn kia. |
| VỪA | `src/actions/evaluation.ts:42-307` | `saveEvaluationRound` 265 dòng làm 5 việc; 3 khối rollback thủ công (`:277-287, 408-418, 472-519`) không check kết quả rollback; verify-retry lệch status vẫn trả `success: true` (`:248-303`). | Tách `submitAndAdvanceFlow`; rollback gom thành Postgres function (DB-side transaction). |
| VỪA | `src/actions/chat.ts:346-440` | 2 action chat trùng ~90% logic. | Tách `prepareChatContext` + `enforceChatQuota`. |
| VỪA | `src/lib/db/evaluations-write.ts:18-67` | `upsertEvaluation` + `upsertEvaluationRound` dead code (không ai gọi). | Xóa sau khi grep xác nhận lần nữa khi làm task. |
| VỪA | `src/components/reports/BatchResultMessageModal.tsx:126-180, 290-316` | Vòng `while(true)` không guard `offset === res.nextOffset` → nguy cơ treo UI; save tuần tự từng item; `window.confirm` native (`:104`) mâu thuẫn pattern ConfirmDialog. | Thêm guard + `Promise.all` chunk + dùng ConfirmDialog. |
| VỪA | `src/lib/db/evaluations.ts:257-286`, `src/lib/db/users.ts:85`, v.v. (~45 chỗ `as`) | Cast `string as Role/EvalStatus/Grade` không validate runtime — giá trị bẩn lan truyền, nổ ở xa nơi đọc. | `parseRole()/parseGrade()/parseStatus()` có fallback + log, hoặc Postgres ENUM. |
| THẤP | `src/app/employees/page.tsx:86-88` | Filter vòng lòng `status !== 'Draft' && ... (r.status as string) === 'Reviewed'` — cast bypass union. | Helper `isScoredRound(r)` đặt cạnh scoring.ts. |
| THẤP | root: `lint.txt`, `lint_output.txt`, `tsconfig.tsbuildinfo` | File rác/snapshot cũ trong repo gây nhầm lẫn. | Xóa + gitignore (khi có task dọn). |
| THẤP | 9 chỗ `eslint-disable-next-line react-hooks/set-state-in-effect` | Pattern setState-in-effect cho initial state. | Chuyển `useState(() => init)` hoặc key prop. |

---

## 3. Đề xuất refactor theo ưu tiên (an toàn/đúng > gọn nhẹ > mượt)

> Mỗi mục = 1 task nhỏ độc lập (đúng quy ước 1 task = 1 commit). Cột "chạm AT/DB/SEC" = có đụng auth/database-schema/security không (để quyết định Reviewer gate).

### Nhóm A — SỬA ĐÚNG (làm trước, rủi ro thấp)

| # | Thay đổi | File | Lợi ích | Rủi ro | AT/DB/SEC |
|---|---|---|---|---|---|
| A1 | `saveEvaluationRound` nạp thang điểm từ DB (supabaseAdmin) trước khi tính grade; kèm test so sánh band | `src/actions/evaluation.ts`, `src/lib/grade-bands.ts` | Hết lệch grade giữa UI và DB — **bug dữ liệu đang sống** | Thấp — thêm 1 query/submit | DB: không đổi schema |
| A2 | Chuẩn hóa `minScore null` trong `getGradeFromScore` + test boundary | `src/lib/scoring.ts` | Hết lỗi phân hạng sai khi band null | Thấp | Không |
| A3 | Guard role lạ trong workflow + resolver thống nhất | `src/lib/evaluation-workflow.ts`, `src/lib/evaluator-resolver.ts` | Hết crash action / lệch evaluator | Thấp | Không |
| A4 | Mapper `toClientError` tập trung, thay ~25 chỗ nối message thô | `src/lib/errors.ts` + các `src/actions/*.ts` | Không lộ schema DB ra client | Thấp, dễ verify | SEC: có (nhẹ) |
| A5 | Fix hardcode `periodName '2026'`, `teamName 'Nhóm QAQC'`, dead spinner, `||` → `??` ở export | `evaluations/[id]/page.tsx:591`, `BatchResultMessageModal.tsx:90`, `export.ts:52,82` | Dữ liệu hiển thị đúng | Rất thấp | Không |

### Nhóm B — BẢO MẬT NỀN TẢNG (sau khi có câu trả lời Q1/Q2 mục 5)

| # | Thay đổi | File | Lợi ích | Rủi ro | AT/DB/SEC |
|---|---|---|---|---|---|
| B1 | **Session thật**: bảng `sessions` (token 256-bit, user_id, expires_at), cookie chứa token, rotate khi login, xóa khi logout/reset mật khẩu | `src/actions/auth.ts`, `src/lib/auth.ts`, migration mới | Chặn mạo danh bằng UUID — lỗ hổng nặng nhất | Trung bình — phải migrate mềm (cookie cũ vẫn chấp nhận 1 phiên chuyển tiếp); **chạm auth + DB schema** | **Có (CAO)** |
| B2 | Bắt buộc mật khẩu: từ chối login khi `password_hash` null; cấp mật khẩu khởi tạo ngẫu nhiên khi tạo user (hiển thị 1 lần) | `src/actions/auth.ts`, `src/actions/users.ts` | Khít chuỗi lỗ hổng với B1 | Trung bình — ảnh hưởng flow onboard user mới | **Có** |
| B3 | Verify + bật RLS/REVOKE trên DB thật (chạy query kiểm tra trước) | migration mới | Chặn nguy cơ anon ghi/xóa (nếu RLS đang tắt) | Thấp nếu chỉ ENABLE+REVOKE (app ghi qua service role không bị ảnh hưởng) | **Có (DB)** |
| B4 | Rate-limit login (bảng `login_attempts` đếm IP+mã NV) + gộp thông báo lỗi | `src/actions/auth.ts` | Chống brute-force + user enumeration | Thấp | **Có** |
| B5 | Chat/AI: áp limit mọi role, reserve slot trước khi gọi LLM, fail-close khi lỗi DB | `src/actions/chat.ts`, `src/actions/ai.ts` | Giữ chi phí AI/LLM kiểm soát được trên free tier | Thấp | SEC: có (nhẹ) |
| B6 | `import 'server-only'` cho `src/lib/ai.ts`; security headers trong next.config; audit action whitelist | `src/lib/ai.ts`, `next.config.ts`, `src/actions/audit.ts` | Harden nhẹ, chi phí gần như 0 | Rất thấp | SEC: có (nhẹ) |

### Nhóm C — HIỆU NĂNG / CHI PHÍ (lợi lớn, ít rủi ro — làm được ngay)

| # | Thay đổi | File | Lợi ích | Rủi ro | AT/DB/SEC |
|---|---|---|---|---|---|
| C1 | `xlsx` + `modern-screenshot` chuyển sang dynamic `await import()` trong handler | `src/lib/export.ts`, `src/lib/import.ts`, `src/components/chat/ChatWidget.tsx` | Giảm mạnh initial bundle mọi trang — FCP/TTI tốt hơn, tiết kiệm bandwidth Vercel | Thấp | Không |
| C2 | Thêm `enabled: !!user` cho `useUsers/useTeams/useEvaluations` + guard sớm trong hàm db | `src/hooks/use-db.ts`, `src/lib/db/evaluations.ts` | Hết fetch cả bảng rồi vứt + double fetch — giảm tải Supabase free | Thấp | Không |
| C3 | Truyền `periodId` cho `useEvaluations` ở employees/teams | 3 page | Không tải toàn bộ lịch sử mọi kỳ — query nhẹ đi nhiều lần | Thấp (cần có currentPeriod sẵn — AuthContext đã có) | Không |
| C4 | Batch N+1 trong `syncEvaluationAfterUserChange` + import loop + `logAudit` mảng | `src/actions/users.ts` | Import Excel từ hàng trăm query → vài query | Trung bình — logic gom nhóm, cần test kỹ data | Không |
| C5 | `cache()` cho `getSessionUser`; `Promise.all` ở reports/dashboard period resolve; `refetchOnWindowFocus: false`; ConfirmDialog → `m` | `src/lib/auth.ts`, 2 page, `query-provider.tsx`, `ConfirmDialog.tsx` | Ít query trùng, ít refetch, gọn bundle | Thấp | Không |
| C6 | Nâng `xlsx` 0.18.5 → 0.20.x (CDN SheetJS) | `package.json` | Hết CVE prototype pollution qua file Excel upload | Trung bình — đổi dependency source (cần duyệt) | SEC: có |

### Nhóm D — GỌN LẠNH / DỄ BẢO TRÌ (làm dần, mỗi task nhỏ)

| # | Thay đổi | File | Lợi ích | Rủi ro | AT/DB/SEC |
|---|---|---|---|---|---|
| D1 | Gộp filter viewer + sub-employees context trong `lib/db/evaluations.ts` | `src/lib/db/evaluations.ts` | Giảm ~90 dòng trùng, tối ưu 1 chỗ | Trung bình — vùng nhạy cảm data | Không |
| D2 | `GradeBadge` + map màu grade dùng chung (bỏ 6+ định nghĩa rải rác) | component mới + 5 file | Nhất quán UI, sửa 1 chỗ | Thấp | Không |
| D3 | Tách `evaluations/[id]/page.tsx` (1065 dòng): `useEvaluationPageState`, `AccessDenied`, `HistoryList`, `ReturnDialog` | page + components mới | Dễ bảo trì trang chính nhất app | Trung bình — refactor UI lớn, cần browser verify | Không |
| D4 | Tách `chatAskAction`/`chatAskWithScreenshotAction` chung phần prepare; gộp 2 nguồn thang điểm về 1 nơi; xóa dead code `evaluations-write.ts:18-67` | `src/actions/chat.ts`, `src/data/criteria.ts`, `src/lib/db/evaluations-write.ts` | Giảm trùng lặp | Thấp | Không |
| D5 | `parseRole/parseGrade/parseStatus` thay ~45 cast `as` thô | `src/lib/db/*` | Giá trị bặn bị chặn sớm có log | Thấp | Không |
| D6 | SSR-ify `/employees`, `/teams` (shell server component, client đẩy xuống widget) | 2 page | FCP tốt hơn, đúng tinh thần App Router | Cao — đụng layout lớn, làm sau cùng | Không |
| D7 | Dọn file rác root (`lint.txt`, `lint_output.txt`) + `enabled` flag các eslint-disable | root + 7 file | Repo sạch | Rất thấp | Không |

**Thứ tự đề xuất**: A1→A5 ngay (bug đúng đắn) → C1→C3 (lợi/thưởng cao, rủi ro thấp) → B theo quyết định Q1/Q2 → C4→C6 → D từ từ.

---

## 4. Khuyến nghị KHÔNG đụng (đang làm đúng)

- `src/actions/dashboard.ts:159-163`, `src/actions/reports.ts:231-236` — `unstable_cache` + tag + revalidate 300s + `revalidateTag` sau mutation: chuẩn Next 16, giữ nguyên.
- `src/components/charts/LazySkillGapRadar.tsx` — lazy recharts đúng cách (dynamic + ssr:false + skeleton).
- `src/lib/supabase-admin.ts` — `server-only` + non-null env: đúng.
- `USER_SELECT` (`src/lib/db/users.ts:13-14`) + REVOKE `password_hash` khỏi anon: đúng, nên nhân rộng chứ không sửa.
- Submit evaluation idempotent + audit log + chuẩn hóa `submitted_at` (`src/lib/db/evaluations.ts:297-313`): giữ.
- `src/middleware.ts` matcher đã loại static/api — chi phí mỗi request không đáng kể, không cần thay đổi kiến trúc.
- Toàn bộ auth/DB schema khi chưa có quyết định ở mục 5 — đặc biệt **B1/B2/B3 chưa làm trước khi anh Sinh duyệt**.

---

## 5. Câu hỏi cần anh Sinh quyết định

1. **Q1 — mô hình anon-read**: Hiện toàn bộ dữ liệu nhân sự (tên, mã NV, điểm, nhận xét, audit, AI summary) đọc được công khai bởi bất kỳ ai có URL + anon key (RLS `USING true` + `NEXT_PUBLIC` key). Đây là lựa chọn thiết kế để client query trực tiếp. Anh có chấp nhận tiếp (nội bộ, link không công khai) hay muốn siết (chuyển reads nhạy cảm qua server actions + REVOKE anon — tốn công nhưng khóa chặt)? Nếu giữ nguyên, nhóm B chỉ cần làm B1/B2/B4.
2. **Q2 — trạng thái RLS trên DB thật**: Repo không chứa schema gốc (legacy migration 0 byte) — cần chạy 1 query kiểm tra `relrowsecurity` trên các bảng chính. Ai chạy (anh hay em xuất query để anh dán vào SQL Editor)? Kết quả quyết định B3 có urgent không.
3. **Q3 — flow user mới**: User tạo bằng Manager không có mật khẩu → hiện login chỉ cần mã NV. Muốn thế nào: (a) Manager nhập mật khẩu khởi tạo khi tạo user, (b) sinh random hiển thị 1 lần + ép đổi khi đăng nhập đầu, (c) giữ như hiện tại?
4. **Q4 — nâng xlsx**: Bản fix CVE chỉ có trên CDN SheetJS (0.20.x), không có trên npm registry. Đồng ý đổi source dependency trong package.json (vẫn là "thay vì cài mới thư viện khác")?
5. **Q5 — thông báo login**: Gộp "mã NV không tồn tại" / "mật khẩu sai" thành 1 câu chung (chống dò tên) sẽ làm UX hơi mờ hơn — anh chọn bảo mật hay giữ UX rõ ràng như hiện tại?
6. **Q6 — scope nhóm D**: D3 (tách trang đánh giá 1065 dòng) + D6 (SSR-ify employees/teams) là refactor UI lớn, cần browser verify kỹ — làm trong đợt này hay để phiên sau?

---

*Tất cả phát hiện trên được chốt từ đọc code tĩnh (không chạy app, không đụng DB production). Các mục CAO ở nhóm 2.1/2.2 đã được verify trực tiếp lại file; các mục còn lại do agent phân tích với file:dòng cụ thể — trước khi làm task nào, runner cần đọc lại vị trí đó để xác nhận còn đúng (code có thể đã đổi từ lúc phân tích).*

---

# QUYẾT ĐỊNH ĐÃ DUYỆT (16-08, anh Sinh chốt theo khuyến nghị Mika + agy Opus 4.6)

| Q | Quyết định | Hệ quả |
|---|---|---|
| Q1 | **GIỮ anon-read** (app nội bộ) — không siết reads nhạy cảm đợt này | Nhóm B chỉ làm B1/B2/B4/B5/B6; KHÔNG chuyển reads qua server actions |
| Q2 | **ĐÃ ĐÓNG** — RLS bật 13/13 bảng + 0 policy write anon (verified DB thật 16-08) | B3 thu gọn: chỉ `REVOKE INSERT/UPDATE/DELETE ... FROM anon` cho chắc (rủi ro thấp) |
| Q3 | **GIỮ luật cũ**: `password_hash` NULL = login mã NV thuần (dự phòng); KHÔNG ép đặt pass, KHÔNG cấp pass khởi tạo | B2 thu gọn: KHÔNG từ chối login hash null; chỉ bổ sung cảnh báo UX (tùy chọn) |
| Q4 | **Nâng xlsx 0.18.5 → 0.20.x từ CDN SheetJS** (fix CVE-2023-30533/CVE-2024-22363) | C6 làm, đổi source dependency trong package.json |
| Q5 | **Gộp thông báo login** thành 1 câu chung (chống dò tên user) | B4 kèm theo |
| Q6 | **D3 + D6 làm LUÔN đợt này** (không để phiên sau) | Thêm vào thứ tự thực hiện |

**Ghi chú A1 (verified 16-08)**: `grade_bands` DB hiện tại GIỐNG HỆT hardcode (`src/data/criteria.ts`) → bug chưa gây lệch dữ liệu thật, **KHÔNG cần fix data cũ** — chỉ fix code (server nạp bands từ DB) để chống bom hẹn giờ khi Manager đổi thang.

**THỨ TỰ THỰC HIỆN (đã duyệt)**:
1. **Nhóm A** (A1→A5) — bug đúng đắn, rủi ro thấp
2. **B1 session thật + B4 rate-limit/gộp lỗi + B3-dọn REVOKE + B5/B6** — chạm auth/DB → Mika verify + Reviewer gate
3. **Nhóm C** (C1→C6) — hiệu năng
4. **Nhóm D** (D1→D7 gồm D3 + D6) — gọn nhẹ/bảo trì, browser verify cho D3/D6
