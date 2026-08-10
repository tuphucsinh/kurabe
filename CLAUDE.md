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

```markdown
## Phase X: [Tên Phase]

### [#PxT01] [src/target-file.ts] `functionName(args): ReturnType`

**Mục tiêu**: 1-2 câu mô tả rõ task này làm gì, tại sao cần làm.

**Interface mới** (nếu tạo/thay đổi interface):
~~~ts
interface Example {
  id: string;
  newField: NewType; // MỚI
}
~~~

**Thay đổi cụ thể** (nếu sửa file có sẵn):
1. Bước cụ thể 1 — import gì, thay gì
2. Bước cụ thể 2 — logic chính
3. Bước cụ thể 3 — cleanup / side effects

**Ràng buộc**:
- Điều kiện kỹ thuật bắt buộc (VD: "Không thay đổi UI", "O(1) lookup")
- Tương thích ngược (VD: "Giữ nguyên export cũ nếu có consumer")
- Edge cases cần xử lý

**Status**: `[ ]`

---
```

**Nguyên tắc viết task chi tiết**:
- **Mục tiêu**: Luôn có. 1-2 câu, trả lời "Task này giải quyết vấn đề gì?"
- **Interface mới**: Chỉ khi task tạo/sửa interface/type. Ghi rõ field nào MỚI.
- **Thay đổi cụ thể**: Liệt kê từng bước thay đổi theo thứ tự thực hiện. Đủ chi tiết để `/do` không cần hỏi lại.
- **Ràng buộc**: Ghi rõ những gì KHÔNG ĐƯỢC làm, điều kiện biên, yêu cầu tương thích.
- **Mapping/Bảng dữ liệu**: Nếu task liên quan data mapping (VD: 34 tiêu chí, enum values) → Bắt buộc ghi bảng đầy đủ vào task.

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
| **Mở conversation mới** | Đọc `HANDOFF.md` + `tasks.md` + `.ai/KNOWN_BUGS.md`. Đọc UA layers (`.understand-anything/knowledge-graph.json` → mục `layers` + `tour`). Set context. Báo 1 dòng mục tiêu. |
| **`.tmp/SYSTEM_ALERT.md` tồn tại** | ĐỌC NGAY, cảnh báo user trước mọi thứ. |
| **Phase 100% done** | Auto-sweep → `MASTER_PLAN.md`. Chạy `npx gitnexus analyze` để re-index. |
| **Trước `/plan`** | Đọc UA layers để hiểu kiến trúc tổng thể trước khi băm task. |
| **Trước `/do` (sửa code)** | Chạy `gitnexus_impact()` trên symbol sắp sửa. Báo risk level. |
| **Trước commit** | Chạy `gitnexus_detect_changes()` để verify scope. |

---

<!-- code-intelligence:start -->
# Code Intelligence — Dual-Tool Workflow

Dự án dùng **2 tool bổ trợ** với vai trò rõ ràng:

| Tool | Vai trò | Dữ liệu |
|---|---|---|
| **Understand Anything (UA)** | 📐 Bản đồ kiến trúc (high-level) | 76 files, 7 layers, tour guide |
| **GitNexus** | 🔍 Symbol intelligence (low-level) | 709 symbols, 945 edges, 9 flows |

## AI Session Workflow

```
┌─────────────────────────────────────────┐
│          AI Session Workflow            │
├─────────────────────────────────────────┤
│                                         │
│  📐 Đầu phiên / Lập kế hoạch (/plan)   │
│  └→ Đọc UA: layers + tour guide        │
│     (kiến trúc tổng thể, file nào      │
│      thuộc layer nào, entry points)     │
│                                         │
│  🔍 Trước khi sửa code (/do)           │
│  └→ GitNexus: impact() + context()     │
│     (blast radius, callers, risk level) │
│                                         │
│  ✅ Trước khi commit                    │
│  └→ GitNexus: detect_changes()         │
│     (verify chỉ affect expected scope) │
│                                         │
│  🔄 Sau mỗi Phase hoàn thành           │
│  └→ `npx gitnexus analyze` (bắt buộc) │
│  └→ UA rebuild CHỈ KHI thay đổi        │
│     cấu trúc folder hoặc kiến trúc lớn │
│                                         │
└─────────────────────────────────────────┘
```

## Understand Anything (UA) — Architecture Map

**File**: `.understand-anything/knowledge-graph.json`

**Khi nào đọc**:
- Đầu phiên mới (mục `layers` + `tour` — ~50 dòng, tiết kiệm token)
- Trước `/plan` để hiểu file nào thuộc layer nào
- Khi onboard hoặc cần overview kiến trúc

**Khi nào rebuild**:
- Thêm/xóa/đổi tên thư mục
- Thay đổi kiến trúc lớn (VD: tách module, thêm layer mới)
- **KHÔNG cần rebuild** khi chỉ sửa logic trong file có sẵn

**7 Layers**:
1. Presentation (Pages) — `src/app/**`
2. UI Components — `src/components/**`
3. Business Logic (Actions) — `src/actions/**`
4. Data Access & Hooks — `src/hooks/**`, `src/lib/db/**`
5. Types & Definitions — `src/types/**`
6. Infrastructure & State — `src/contexts/**`, `src/lib/**`, `src/providers/**`
7. Configuration — root config files

## GitNexus — Symbol Intelligence

Indexed as **kurabe** (709 symbols, 945 relationships, 9 execution flows).

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

### Always Do

- **MUST run `gitnexus_impact()` before editing any symbol.** Report blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify scope.
- **MUST warn the user** if impact returns HIGH or CRITICAL risk.
- Use `gitnexus_context({name: "symbolName"})` for full 360° view (callers, callees, process participation).
- Use `gitnexus_impact()` for blast radius before refactoring.

### Never Do

- NEVER edit a function/class/method without first running `gitnexus_impact`.
- NEVER ignore HIGH or CRITICAL risk warnings.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename`.
- NEVER commit without `gitnexus_detect_changes()`.

### Update Triggers

| Khi nào | Hành động |
|---|---|
| Phase hoàn thành | `npx gitnexus analyze` (bắt buộc) |
| >5 commits mới kể từ lần index cuối | `npx gitnexus analyze` |
| Tool cảnh báo "index is stale" | `npx gitnexus analyze` ngay |

### Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/kurabe/context` | Codebase overview, check index freshness |
| `gitnexus://repo/kurabe/clusters` | All functional areas |
| `gitnexus://repo/kurabe/processes` | All execution flows |
| `gitnexus://repo/kurabe/process/{name}` | Step-by-step execution trace |

<!-- code-intelligence:end -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **kurabe** (696 symbols, 1380 relationships, 54 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/kurabe/context` | Codebase overview, check index freshness |
| `gitnexus://repo/kurabe/clusters` | All functional areas |
| `gitnexus://repo/kurabe/processes` | All execution flows |
| `gitnexus://repo/kurabe/process/{name}` | Step-by-step execution trace |

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
