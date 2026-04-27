# ANTIGRAVITY V3 — Lean Discipline

> 1 file. 4 lệnh. Zero role theater. Giữ 100% workflow enforcement.

## RULES

| # | Rule | Detail |
|---|---|---|
| 🔥 | **Firewall** | CẤM chèn code nếu chưa có `/do`. Mặc định chỉ `.md`/`.json`. |
| 🎯 | **Strict Scope** | Lệnh `/plan` CHỈ lập kế hoạch, KHÔNG tự thực hiện. Làm ĐÚNG yêu cầu, KHÔNG tự ý làm thêm (chỉ được đề xuất). |
| 🧹 | **Sweep** | Khi Phase xong (100% `[x]`): nén summary → `MASTER_PLAN.md`, xóa task cũ khỏi `tasks.md`. |
| ⛔ | **2-Strike** | `/do` fail test 2 lần → HALT, ghi `.tmp/SYSTEM_ALERT.md`, báo user. |
| 📐 | **No Yapping** | Diff-only cho code. Bullet-point cho `.md`. Xưng Em, gọi Anh. |
| 🧠 | **Adversarial Audit** | Gate 3 trong `/do`: Sequential Thinking với prompt *"Tìm 3 vấn đề nghiêm trọng nhất"*. Không self-review ceremony. |

## MEMORY

| Path | Vai trò | Git? |
|---|---|---|
| `.ai/` | Kiến trúc, schema, decisions, conventions, master plan, known bugs | ✅ Track |
| `.tmp/` | Session ephemeral: `diary.md`, `global_context.md` | ❌ gitignore |
| `tasks.md` | WBS task list, neo điểm cho `/do` | ✅ Track |
| `HANDOFF.md` | Session snapshot (overwrite mỗi lần đóng) | ✅ Track |

**Quy tắc**: Khi file `.ai/` nào vượt **800 dòng** → BẮT BUỘC phân mảnh (VD: `FRONTEND_ARCH.md`, `BACKEND_ARCH.md`) và dùng Markdown Link để nối.

## COMMANDS

### `/plan [feature hoặc phase]` — Thiết kế & Băm Task

**Khi nào**: Bắt đầu feature mới hoặc mở Phase mới.

**Thực thi** (tự detect context):
1. Nếu `MASTER_PLAN.md` rỗng → Hỏi ngắn gọn về scope → Băm toàn bộ dự án thành chuỗi Phase → Tạo `MASTER_PLAN.md`.
2. Nếu đã có → Đọc plan, băm Phase được yêu cầu thành WBS vào `tasks.md`.
3. Không Pre-create file trống. Các file Design trong `.ai/` (ARCHITECT, SCHEMA, LOGIC_FLOW) CHỈ ĐƯỢC TẠO khi có đầy đủ dữ liệu kiến trúc hoặc logic tương ứng.
   - Khi tạo, **[🚨]** BẮT BUỘC dùng Mermaid chuẩn:
     - Khung xương -> `graph TD`/`LR`
     - Mô hình dữ liệu -> `erDiagram`
     - Luồng logic -> `sequenceDiagram`
4. Mọi quyết định thay đổi Stack/Architect khi chốt -> auto-append vào `.ai/DECISIONS_LOG.md`.
5. **Sweep** trước khi append: dọn task `[x]` cũ.
6. **Sequential Thinking** (1-2 bước) để kiểm tra tính hợp lý của WBS trước khi ghi file.

**[🚨 Context-Aware Plan]**:
- **Băm lại Phase CŨ**: Ghi đè ĐÚNG block `## Phase X` trong `tasks.md`, bảo toàn phần còn lại.
- **Băm Phase MỚI**: Append xuống cuối `tasks.md`. TUYỆT ĐỐI KHÔNG xóa task Phase khác đang dang dở.

**Quy tắc băm Task:**
- **1 khối logic = 1 task**. Không nhồi nhiều chức năng vào 1 task.
- **Interface Contract**: ĐỊNH NGHĨA SẴN giao diện hàm (Tên, Input, Output) vào mỗi Task.
- **Cấm gán persona/cá tính** vào task. Chỉ gán ràng buộc kỹ thuật (VD: "O(1) time", "Zero-dependency").

**Format task bắt buộc** (ID có tiền tố Phase + file chịu tác động):
```
## Phase X: [Tên]
- [ ] [#PxT01] [src/api.ts] `saveUser(data: UserDTO): Promise<User>` — Mô tả ngắn
- [ ] [#PxT02] [src/db.ts] `createTable(): Migration` — Mô tả ngắn
```

**Dừng** sau khi ghi file. Báo cáo 1 dòng.

---

### `/do [Task_ID]` — Thi Công Code (4-Gate)

**Gate 1 — SCAN (TDD-First)**: Đọc môi trường thực tế (VD: `package.json`, `Makefile`, `.env`). **[🚨]** Bắt buộc chạy Test để thấy màu ĐỎ (Fail) chứng minh lỗi/chưa có code, TRƯỚC KHI sang Gate 2. Áp dụng tư duy `@test-driven-development`.
**Gate 2 — CODE**: `replace_file_content` / `write_to_file`. Không giải thích dông dài.
**Gate 3 — AUDIT**: Static Analysis + Sequential Thinking:
  - Bắt buộc chạy công cụ tĩnh: Chạy `npm run lint:audit` (hoặc tương đương) để máy tự soi lỗi format/syntax.
  - Sau khi tool máy Pass, gọi `Sequential Thinking` tìm 3 lỗi nghiêm trọng nhất về Business Logic / Edge Cases.
  - Prompt bắt buộc: *"3 vấn đề nghiêm trọng nhất của đoạn code vừa viết so với requirement?"*

> **Fast-path**: Nếu task chỉ là config/typo/trivial → skip Gate 3+4, ghi `[x]` trực tiếp.

**Gate 4 — TEST (Verification)**: Chạy Test Command đã nhắm ở Gate 1 + pipe limit (`| tail -n 50`).
  - ✅ Pass → Kích hoạt nguyên tắc `@verification-before-completion` rà soát trước khi tick `[x]` trong `tasks.md`. Nếu 100% Phase done → auto-sync `MASTER_PLAN.md` (đồng thời gỡ bỏ các task cũ đã [x] để dọn context).
  - ❌ Fail lần 1 → **[🚨 BẮT BUỘC]** Dừng gõ code. Chủ động dùng **Web Search** tìm tài liệu và gọi skill `@systematic-debugging` để truy vết lỗi TRƯỚC KHI vòng lại Gate 2 (Max 1 lần re-try).
  - ❌ Fail lần 2 → **2-Strike HALT**. Đóng gói log lỗi sang `.tmp/SYSTEM_ALERT.md`.

---

### `/fix [bug]` — Cấp Cứu

Bypass 4-Gate. Dùng `Sequential Thinking` + `systematic-debugging` skill.
- Cấp 1 (cú pháp): Fix nhanh, test, done.
- Cấp 2 (kiến trúc): Báo user, đề xuất tách task.
- Cấp 3 (deadlock): Ghi `.tmp/SYSTEM_ALERT.md`, HALT.

**[BẮT BUỘC DIARY]**: Sau mỗi `/fix` xong → ghi `[FIXED][#Txx] mô tả ngắn` vào `.tmp/diary.md`.

---

### `/done` — Đóng Phiên

1. Áp dụng `@verification-before-completion`. Nén tiến độ + blocker → **ghi đè** `HANDOFF.md` (snapshot, không append).
2. Xóa trắng `.tmp/diary.md` và `.tmp/global_context.md`.
3. Báo 1 dòng: *"Session sealed."*

---

## AUTO-BEHAVIORS (không cần lệnh)

| Trigger | Hành vi |
|---|---|
| **Mở conversation mới** | Đọc `HANDOFF.md` + `tasks.md` + `.ai/KNOWN_BUGS.md`. Set context. Báo 1 dòng mục tiêu. |
| **`.tmp/SYSTEM_ALERT.md` tồn tại** | ĐỌC NGAY, cảnh báo user trước mọi thứ. |
| **Phase 100% done** | Auto-sweep → `MASTER_PLAN.md`. |

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Kurabe** (286 symbols, 327 relationships, 0 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Kurabe/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Kurabe/clusters` | All functional areas |
| `gitnexus://repo/Kurabe/processes` | All execution flows |
| `gitnexus://repo/Kurabe/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
