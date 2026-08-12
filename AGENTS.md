# AGENTS.md — Standard Mika → Runner → Mika/Reviewer Workflow

> One file. Four procedures. Clear roles. Full workflow enforcement.
> Flow: **Mika** plans/controls/verifies → **Runner** implements → **Mika** verifies → **Reviewer** gates (CONTROLLED only).

## RUNNER BRIEF (read once at onboarding — ~10 seconds)

Runner (coder | agy | opencode | commandcode) — **do NOT re-read this file every turn**: each turn you receive a self-contained prompt from Mika (task + constraints + test commands already extracted).

1. Implement ONLY the assigned task — no scope creep, no self-commit.
2. **Test strategy by task type**: pure logic → TDD (RED → code → GREEN); UI/DOM/CDN → real browser verify (see `/do` + PROJECT TOOLING).
3. 2-Strike: 2 failed test runs → HALT, write `.tmp/SYSTEM_ALERT.md`, report to Mika.
4. Fast-path (config/typo/trivial): report to Mika — Mika decides, runner never self-decides.
5. Follow **PROJECT TOOLING** (project test/lint commands — bottom of file).
6. NEVER edit `tasks.md` (no ticking `[x]`, no notes) — Mika ticks only after independent verification.

## ROLES (fixed — every task passes through all three)

| Role | Responsibility | Never |
|---|---|---|
| **Mika** (plan/control/verify) | Read rules + `.ai/` + `HANDOFF.md` on onboarding; `/plan` → `.ai/MASTER_PLAN.md`; `/plan2task` → WBS; pick runner from state; record BASE_SHA; verify git diff + independent tests + secret scan; `/done` closes | Trust runner self-reports; dispatch without clear WBS |
| **Runner** (coder \| agy \| opencode \| commandcode) | Implement exactly the assigned task (test strategy per task type — see RUNNER BRIEF item 2) → code → audit → test | Expand scope; commit; decide fast-path |
| **Reviewer** (fresh session, CONTROLLED only) | Receive package (diff + test evidence + known risks), verdict PASS / non-PASS | Edit code; receive runner transcripts |

> **CONTROLLED thực tế** (2026-08-11, anh duyệt): dự án **static nhỏ** (không auth/DB/backend/production) → Mika verify + adversarial audit (Gate 3) **đủ, Reviewer không bắt buộc**. Reviewer bắt buộc khi chạm **auth/DB/schema/backend/production**. Áp dụng cho mọi dự án static tương tự.

## RULES

| # | Rule | Detail | Applies to |
|---|---|---|---|
| 1 | **Firewall** | No code without an assigned task (`/do`). Default: `.md`/`.json` only. | All agents |
| 2 | **Strict Scope** | Do exactly what was asked; propose extras, don't implement them. Runner never commits. | All agents |
| 3 | **Sweep** | Phase done (100% `[x]`): compress summary → `.ai/MASTER_PLAN.md` (mark phase DONE), **prune finished tasks from `tasks.md`** (summary ≤ 4 dòng + active phase). | Mika |
| 4 | **2-Strike** | `/do` fails tests twice → HALT, write `.tmp/SYSTEM_ALERT.md`, alert user. | Runner |
| 5 | **No Yapping** | No flattery; straight to the point. Diff/evidence for code, bullets for `.md`. | All agents |
| 6 | **Adversarial Audit** | `/do` Gate 3: Sequential Thinking, prompt *"3 most serious issues vs requirement"*. No self-review ceremony. | Runner |
| 7 | **Pushback First** | Strongest pushback (with data) BEFORE agreeing. Independent fact-check; don't anchor on user data. | Mika |
| 8 | **No Compromise** | Don't cave under pushback. Change view only on new evidence. | Mika |
| 9 | **Confidence Label** | Detailed explanations MUST carry **CAO / TRUNG BÌNH / THẤP / KHÔNG BIẾT** (High/Med/Low/Unknown). | All agents |
| 10 | **Reasoning Gates** | Bắt buộc: **Sequential Thinking** trước task rủi ro/phức tạp/cross-profile/hệ thống (xem `sequential-thinking-policy`); **PDCA** khi cần lặp cải tiến nhiều vòng (xem `adaptive-pdca`). Simple task → làm thẳng, không gate. | All agents |

## MEMORY

| Path | Role | Git? |
|---|---|---|
| `.ai/` | Architecture, schema, decisions, conventions, master plan, known bugs | Track |
| `.tmp/` | Session ephemeral: `diary.md`, `global_context.md`, `SYSTEM_ALERT.md` | gitignore |
| `tasks.md` | WBS task list, anchor for `/do` | Track |
| `HANDOFF.md` | Session snapshot (overwrite on close) | Track |

**Rule**: any `.ai/` file over **600 lines** MUST be split (e.g. `FRONTEND_ARCH.md`, `BACKEND_ARCH.md`) and linked via Markdown.

## GIT & SECRETS
- Commits: Mika only — 1 task = 1 commit, message `[#PxMyTzz] <summary>` (project small không milestone: `[#PxTzz]`).
- Broken change → revert to BASE_SHA, report, re-plan.
- Secrets (`.env`, keys, tokens): NEVER tracked, committed, printed, or included in runner prompts.

## TRIGGERS (user input → internal procedure)

Users give instructions in natural Vietnamese on Telegram/Desktop — **no slash commands typed by users**. `/plan /plan2task /do /fix /done` are Mika's internal procedure names only.

| User says | Mika runs |
|---|---|
| "lên kế hoạch / plan cho X" | `/plan` — phases → `.ai/MASTER_PLAN.md` |
| "băm/chia task / plan2task" | `/plan2task` — phase → WBS tasks in `tasks.md` |
| "làm task PxTxx" / "code feature X" | `/do` — dispatch runner per state |
| "fix lỗi Y" / "bug Y đang hỏng" | `/fix` — triage |
| "đóng phiên" / "tổng kết hôm nay" | `/done` — sweep + HANDOFF |
| "đổi runner sang coder\|agy\|opencode\|commandcode" | update runner state file |
| "review X" (risky task) | reviewer gate (CONTROLLED) |

## PROCEDURES

### /plan [feature|phase] — Mika (design phases & MASTER_PLAN)
1. **Grillme đầy đủ** (dự án mới): hỏi + đề xuất phương án tối ưu ★ — **8 trục** (mục đích, phong cách, techstack, database, logic, deploy, Quy mô/độ phức tạp, Loại project/ràng buộc kỹ thuật — chi tiết `project-intake-workflow`) + feature menu toàn diện (gán `MVP ★ / Phase sau / Không cần`; MoSCoW nếu menu > 8-10 mục) + security (cơ bản ở MVP, toàn diện phase cuối).
2. **MVP-first** (dự án mới): MVP đáp ứng đầy đủ tính năng cơ bản → nâng cấp dần: UI → tính năng → kỹ thuật → security. Số phase không cố định.
3. `.ai/MASTER_PLAN.md` empty → ask scope → break project into phases → create it.
4. Otherwise → append/update the new phase in `.ai/MASTER_PLAN.md` → hand over to `/plan2task`.
5. Never pre-create empty files; `.ai/` design docs (ARCHITECT/SCHEMA/LOGIC_FLOW) only when data exists. Use Mermaid: structure `graph TD/LR`, data `erDiagram`, flow `sequenceDiagram`.
6. Stack/architecture decisions → auto-append `.ai/DECISIONS_LOG.md`.
7. Sweep first (prune `[x]`) + Sequential Thinking (1-2 steps) sanity-check WBS → viết.
Stop after writing. One-line report.

### /plan2task [phase] — Mika (break into WBS)
- **Context-aware**: re-breaking an OLD phase → overwrite ONLY its `## Phase X` block; NEW phase → append at the end. NEVER delete tasks of in-progress phases.
- **Task rules**: 1 logical block = 1 task; define interface contracts (name/input/output) upfront; no personas — technical constraints only (e.g. "O(1) time", "zero-dependency").
- **Milestone** (dự án mid/large): trong Phase, nhóm task theo milestone `## Milestone M1: [Name]` (≤ ~15 task, acceptance riêng, gate riêng). Task ID = `[#PxMyTzz]` (Phase x, Milestone y, Task zz). Project small không milestone: giữ `[#PxTzz]`.
- **Task self-contained (mọi dự án)**: task "tạo module" kèm luôn wire vào entry/app; KHÔNG tạo task chạy test-tổng riêng (gộp vào gate verify Mika); task ước lượng prompt > ~1.5KB → tách nhỏ.
- **Task sửa interface/DEFAULTS/signature → PHẢI kèm cập nhật test tương ứng trong cùng task** (test cũ sẽ FAIL khi code đổi — verified P3T01 webclock 2026-08-12). Rule chung: mỗi task tạo/sửa route → viết test trong CÙNG commit → chạy full pytest ngay (pitfall 12, project-intake-workflow).
- **Mandatory format** (ID = phase prefix + affected file; 8 fields):

```markdown
## Phase X: [Name]

### [#PxMyT01] [src/target-file.ts] `functionName(args): ReturnType`

**Goal**: 1-2 sentences — what and why.

**Depends on**: `none` | `[#PxMyTzz]` — task tiên quyết (bắt buộc khai; `none` = độc lập, song song được).

**Parallel-safe**: `yes` | `no` — `yes` = không đụng file task khác, chạy đồng thời được (chỉ khi Mika tách worktree riêng); `no` = cùng file/state, bắt buộc tuần tự.

**New interface** (if any) + **Ví dụ gọi** (1-3 dòng code mẫu — model yếu bắt pattern nhanh hơn lời mô tả):
~~~ts
interface Example {
  id: string;
  newField: NewType; // NEW
}
// VD: const x = new Example({ id: "a" }); x.newField === ...
~~~

**Context hiện có** (bắt buộc, 1-3 dòng — file nào đã tồn tại, import path sẵn, điểm cần đọc lại; giúp runner không đọc cả repo):
- `js/foo.js` đã có export `bar()`; import path: `./foo.js`
- `index.html` hiện có `<script type="module" src="js/main.js">`

**Concrete changes** (if editing existing file):
1. Step 1 — imports/replacements
2. Step 2 — core logic
3. Step 3 — cleanup/side effects

**Constraints**:
- Technical requirements (e.g. "no UI change", "O(1) lookup")
- Backward compatibility (e.g. "keep old export if consumers exist")
- Edge cases to handle
- Antipattern cấm cụ thể (VD: "KHÔNG innerHTML — textContent only"; "KHÔNG tạo rAF loop riêng")

**Definition of Done** (bắt buộc, 1-3 dòng — thế nào là XONG, để runner không tự suy đoán):
- `node tests/<file>.test.mjs` exit 0 (Mika chạy độc lập)
- File nằm đúng path /home/pi5/projects/<tên>/... (không scratch)
- Không edit tasks.md, không commit

**Status**: `[ ]`

---
```

- **Detail rules**: Goal always; interface only when created/changed (mark NEW fields); concrete steps ordered so `/do` never needs to ask; constraints = what is NOT allowed + boundaries + compatibility; data mappings (enums/34 criteria) MUST be full tables inside the task.
Stop after writing. One-line report.

### /do [Task_ID] — Runner (implement, 4 gates)
1. **SCAN**: read real environment (`package.json`, `Makefile`, `.env`). **Test strategy theo loại task**: pure logic → chạy test thấy RED (proves bug/missing code) trước khi code (TDD); UI/DOM/CDN → ghi nhận verify browser (PROJECT TOOLING "Browser verify") — không ép RED cho DOM.
2. **CODE**: runner's file tools (`patch`/`write_file`/equivalent). No rambling.
3. **AUDIT**: static analysis (project lint — see PROJECT TOOLING) + Sequential Thinking *"3 most serious issues vs requirement"*.
4. **TEST**: rerun test command (pipe `| tail -n 50`). Task UI/DOM/CDN → chạy thêm `tests/browser-verify.sh` (xem PROJECT TOOLING) trước khi báo Mika.
   - PASS → report Mika; Mika independently verifies (git diff + rerun tests) BEFORE ticking `[x]`; phase 100% → auto-sync `.ai/MASTER_PLAN.md` + prune `[x]` tasks.
   - FAIL #1 → stop coding; web-search docs + `@systematic-debugging` before retry (max 1 retry).
   - FAIL #2 → 2-Strike HALT → `.tmp/SYSTEM_ALERT.md`.
- **Fast-path**: config/typo/trivial → report to Mika; Mika decides to skip gates 3-4.
- Runner never commits, never edits `tasks.md` (không tick `[x]`, không ghi chú) — Mika commits and ticks after independent verification.

### /fix [bug] — Triage (runner level 1-2, Mika level 3)
Bypass 4 gates; use Sequential Thinking + `systematic-debugging`.
- L1 (syntax): quick fix, test, report.
- L2 (architecture): report user, propose task split.
- L3 (deadlock/wide impact): `.tmp/SYSTEM_ALERT.md`, HALT → Mika (+ Reviewer khi chạm auth/DB/backend/production).
- **MANDATORY diary**: after each fix → `[FIXED][#Txx] short note` in `.tmp/diary.md`.

### /done — Mika (close session)
1. Verify invariants (git diff + tests + secret scan) → tick remaining `[x]` → Sweep.
2. Overwrite `HANDOFF.md` (snapshot ≤15 dòng: trạng thái + blockers + next; không lặp masterplan).
3. Clear `.tmp/diary.md` + `.tmp/global_context.md`.

## RUNNER DISPATCH
- **State**: current runner stored in Mika's profile (`coding_runner.txt`); user switches anytime: "đổi runner sang X". Runner ∈ {coder, agy, opencode, commandcode}.
- **Dispatch**: Mika packages a self-contained prompt (task + affected files + constraints + test commands) → **helper `dispatch-runner`** (tự cp `harness-run` sang path wrapper mới theo PID + dọn sau run — verified finanza P2M3; nếu chưa có helper: cp tay + chạy ngay cùng lệnh). Gọi: `dispatch-runner <runner> --add-dir <repo> '<prompt>'`. Chi tiết + guard rules: `mika-engineering-orchestration` references/runner-dispatch-prompt.md.
- **Prompt chuẩn hóa**: PHẢI kèm `CODE ONLY — do NOT run any command` + `write to EXACT absolute path ... — NOT scratch`; tránh emoji (security scanner chặn). Chi tiết: `mika-engineering-orchestration`.
- **Verify path sau dispatch**: kiểm tra file nằm đúng project path trước khi verify nội dung; nếu ghi scratch → copy + dọn residue.
- **Verify invariants** (runner-independent): BASE_SHA before → git diff + status after (scope? secret leak?) → rerun tests independently → **Reviewer** (fresh) khi CONTROLLED chạm auth/DB/schema/backend/production (dự án static nhỏ: Mika verify + adversarial audit đủ — xem note ROLES) → close only on PASS.

## AUTO-BEHAVIORS
| Trigger | Behavior |
|---|---|
| New conversation opens | Read `HANDOFF.md` + `tasks.md` + `.ai/KNOWN_BUGS.md`. One-line goal report. |
| `.tmp/SYSTEM_ALERT.md` exists | Read immediately; warn user before anything else. |
| Phase/milestone 100% `[x]` | **BẮT BUỘC sweep ngay** (RULE 3): ① compress summary → `.ai/MASTER_PLAN.md` (mark DONE + kết quả thực thi) ② **prune task `[x]` khỏi `tasks.md`** (giữ summary ≤ 4 dòng + phase active) ③ commit. KHÔNG đợi `/done`. |
| Task `[x]` sau verify | Tick + commit ngay (1 task = 1 commit) — không dồn. |
| Milestone gate có frontend chạy được | **BẮT BUỘC browser verify** (Chrome thật + CDP console + screenshot) ngay gate milestone — KHÔNG đợi cuối phase (bug thread-safety/CSS/JS chỉ lộ khi browser thật — verified finanza P1M3). |

## PROJECT TOOLING (project-specific — auto-filled, not part of template)
**Auto-fill**: Mika detects the stack from root files (package.json → npm test / npm run lint; requirements.txt → pytest / ruff; go.mod → go test / gofmt; pyproject.toml → hatch/uv) and fills this table at the FIRST `/plan` — no manual step.

| Item | Project value |
|---|---|
| Test command | none yet (TDD-first will add when needed) |
| Lint/static | `npm run lint` (eslint) |
| Browser verify | `tests/browser-verify.sh <assert.mjs> [url]` — chrome headless dump-dom + node assert + console-error check; assert mẫu: `tests/browser-assert.example.mjs`. Nguồn chuẩn: `~/.hermes/workspaces/browser-verify.sh` (copy vào tests/ khi cần). Dùng cho task UI/DOM/CDN. |
| Code intelligence (optional) | none |
| Build/verify | `npm run build` (next build — verified PASS 2026-08-12, ~20s on Pi5) |

## SKILL ROUTING (project-specific — auto-filled by Mika at FIRST /plan; bổ sung 2026-08-12)
**Rule**: mỗi bước chỉ 1 primary skill + tối đa 1-2 support. Xem chi tiết: `project-intake-workflow` (7 bước + bảng theo loại project).

| Bước | Skill |
|---|---|
| B2 Grillme | `project-intake-workflow` (menu chuẩn); `dec-coach` nếu so sánh phương án |
| B3 Thiết kế (có UI/UX) | `design-taste-frontend` ★ BẮT BUỘC → DESIGN_CONTRACT.md + anti-slop; `popular-web-designs` nếu 'design like X'; `architecture-diagram` nếu cần sơ đồ |
| B3 Thiết kế (python/backend/script) | `auto-builder` (plan/debug); `python-engineering-patterns` nếu SQLite/FTS5 |
| B5 Masterplan / B6 WBS | `project-planning-workflows` |
| B7 Thực thi (web/UI) | `static-landing-page-build`; `shadcn-component-system` nếu shadcn; verify = `browser-screenshot-verification` (browser thật Chrome stable) |
| B7 Thực thi (logic thuần) | `development-quality-workflows` (TDD: RED → GREEN → REFACTOR) |
| B7 Thực thi (python) | `python-test-harnesses` + `python-engineering-patterns` |
| B7 Thực thi (automation/script) | `auto-builder`; `systemd-timer-python-controller` nếu timer; `cron-cli-automation` nếu cron |
| B7 Debug | `debugging-workflows` (sau 2 fail cùng lý do) |
| B7 Route/Review | `mika-engineering-orchestration` (FAST/STANDARD/CONTROLLED) |

**Verify browser**: LUÔN dùng `/usr/bin/google-chrome-stable` (Chrome thật — CẤM Chromium Debian). Assert mẫu + helper: `~/.hermes/workspaces/browser-verify.sh` + `browser-assert.example.mjs` (copy sẵn vào tests/ bởi `new-project`).
