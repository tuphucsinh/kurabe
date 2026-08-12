# AGENTS.md — Standard Mika → Runner → Mika/Reviewer Workflow

> One file. Four procedures. Clear roles. Full workflow enforcement.
> Flow: **Mika** plans/controls/verifies → **Runner** implements → **Mika** verifies → **Reviewer** gates (CONTROLLED only).

## RUNNER BRIEF (read once at onboarding — ~10 seconds)

Runner (coder | agy | opencode | commandcode) — **do NOT re-read this file every turn**: each turn you receive a self-contained prompt from Mika (task + constraints + test commands already extracted).

1. Implement ONLY the assigned task — no scope creep, no self-commit.
2. **Test strategy phân loại**: pure logic (utils/functions) → TDD-first: run tests to see RED → code → audit (static + "3 most serious issues") → tests GREEN. UI/DOM/CDN → verify browser thật (không ép unit test cho DOM — xem PROJECT TOOLING "Browser verify").
3. 2-Strike: 2 failed test runs → HALT, write `.tmp/SYSTEM_ALERT.md`, report to Mika.
4. Fast-path (config/typo/trivial): report to Mika — Mika decides, runner never self-decides.
5. Follow **PROJECT TOOLING** (project test/lint commands — bottom of file).
6. NEVER edit `tasks.md` (no ticking `[x]`, no notes) — Mika ticks only after independent verification.

## ROLES (fixed — every task passes through all three)

| Role | Responsibility | Never |
|---|---|---|
| **Mika** (plan/control/verify) | Read rules + `.ai/` + `HANDOFF.md` on onboarding; `/plan` → `.ai/MASTER_PLAN.md`; `/plan2task` → WBS; pick runner from state; record BASE_SHA; verify git diff + independent tests + secret scan; `/done` closes | Trust runner self-reports; dispatch without clear WBS |
| **Runner** (coder \| agy \| opencode \| commandcode) | Implement exactly the assigned task: test strategy theo loại task (pure logic TDD / UI-DOM browser verify — xem RUNNER BRIEF item 2) → code → audit → test | Expand scope; commit; decide fast-path |
| **Reviewer** (fresh session, CONTROLLED only) | Receive package (diff + test evidence + known risks), verdict PASS / non-PASS | Edit code; receive runner transcripts |

> **CONTROLLED thực tế** (2026-08-11, anh duyệt): dự án **static nhỏ** (không auth/DB/backend/production) → Mika verify + adversarial audit (Gate 3) **đủ, Reviewer không bắt buộc**. Reviewer bắt buộc khi chạm **auth/DB/schema/backend/production**. Ghi chú này áp dụng cho mọi dự án static tương tự.

## RULES

| # | Rule | Detail | Applies to |
|---|---|---|---|
| 1 | **Firewall** | No code without an assigned task (`/do`). Default: `.md`/`.json` only. | All agents |
| 2 | **Strict Scope** | Do exactly what was asked; propose extras, don't implement them. Runner never commits. | All agents |
| 3 | **Sweep** | Phase done (100% `[x]`): compress summary → `.ai/MASTER_PLAN.md` (mark phase DONE), prune finished tasks from `tasks.md`. | Mika |
| 4 | **2-Strike** | `/do` fails tests twice → HALT, write `.tmp/SYSTEM_ALERT.md`, alert user. | Runner |
| 5 | **No Yapping** | No flattery; straight to the point. Diff/evidence for code, bullets for `.md`. | All agents |
| 6 | **Adversarial Audit** | `/do` Gate 3: Sequential Thinking, prompt *"3 most serious issues vs requirement"*. No self-review ceremony. | Runner |
| 7 | **Pushback First** | Strongest pushback (with data) BEFORE agreeing. Independent fact-check; don't anchor on user data. | Mika |
| 8 | **No Compromise** | Don't cave under pushback. Change view only on new evidence. | Mika |
| 9 | **Confidence Label** | Detailed explanations MUST carry CAO / TRUNG BÌNH / THẤP / KHÔNG BIẾT (High/Med/Low/Unknown). | All agents |

## MEMORY

| Path | Role | Git? |
|---|---|---|
| `.ai/` | Architecture, schema, decisions, conventions, master plan, known bugs | Track |
| `.tmp/` | Session ephemeral: `diary.md`, `global_context.md`, `SYSTEM_ALERT.md` | gitignore |
| `tasks.md` | WBS task list, anchor for `/do` | Track |
| `HANDOFF.md` | Session snapshot (overwrite on close) | Track |

**Rule**: any `.ai/` file over **600 lines** MUST be split (e.g. `FRONTEND_ARCH.md`, `BACKEND_ARCH.md`) and linked via Markdown.

## GIT & SECRETS
- Commits: Mika only — 1 task = 1 commit, message `[#PxTxx] <summary>`.
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
1. `.ai/MASTER_PLAN.md` empty → ask scope → break project into phases → create it.
2. Otherwise → append/update the new phase in `.ai/MASTER_PLAN.md` → hand over to `/plan2task`.
3. Never pre-create empty files; `.ai/` design docs (ARCHITECT/SCHEMA/LOGIC_FLOW) only when data exists. Use Mermaid: structure `graph TD/LR`, data `erDiagram`, flow `sequenceDiagram`.
4. Stack/architecture decisions → auto-append `.ai/DECISIONS_LOG.md`.
5. Sweep first: prune `[x]` tasks.
6. Sequential Thinking (1-2 steps) to sanity-check WBS before writing.
Stop after writing. One-line report.

### /plan2task [phase] — Mika (break into WBS)
- **Context-aware**: re-breaking an OLD phase → overwrite ONLY its `## Phase X` block; NEW phase → append at the end. NEVER delete tasks of in-progress phases.
- **Task rules**: 1 logical block = 1 task; define interface contracts (name/input/output) upfront; no personas — technical constraints only (e.g. "O(1) time", "zero-dependency").
- **Mandatory format** (ID = phase prefix + affected file):

```markdown
## Phase X: [Name]

### [#PxT01] [src/target-file.ts] `functionName(args): ReturnType`

**Goal**: 1-2 sentences — what and why.

**New interface** (if any):
~~~ts
interface Example {
  id: string;
  newField: NewType; // NEW
}
~~~

**Concrete changes** (if editing existing file):
1. Step 1 — imports/replacements
2. Step 2 — core logic
3. Step 3 — cleanup/side effects

**Constraints**:
- Technical requirements (e.g. "no UI change", "O(1) lookup")
- Backward compatibility (e.g. "keep old export if consumers exist")
- Edge cases to handle

**Status**: `[ ]`

---
```

- **Detail rules**: Goal always; interface only when created/changed (mark NEW fields); concrete steps ordered so `/do` never needs to ask; constraints = what is NOT allowed + boundaries + compatibility; data mappings (enums/34 criteria) MUST be full tables inside the task.
Stop after writing. One-line report.

### /do [Task_ID] — Runner (implement, 4 gates)
1. **SCAN**: read real environment (`package.json`, `Makefile`, `.env`). **Test strategy theo loại task**: pure logic → chạy test thấy RED (proves bug/missing code) trước khi code (TDD); UI/DOM/CDN → ghi nhận verify browser (PROJECT TOOLING "Browser verify") — không ép RED cho DOM.
2. **CODE**: runner's file tools (`patch`/`write_file`/equivalent). No rambling.
3. **AUDIT**: static analysis (project lint — see PROJECT TOOLING) + Sequential Thinking *"3 most serious issues vs requirement"*.
4. **TEST**: rerun test command (pipe `| tail -n 50`). Task UI/DOM/CDN → chạy thêm browser verify (PROJECT TOOLING) trước khi báo Mika.
   - PASS → report Mika; Mika independently verifies (git diff + rerun tests) BEFORE ticking `[x]`; phase 100% → auto-sync `.ai/MASTER_PLAN.md` + prune `[x]` tasks.
   - FAIL #1 → stop coding; web-search docs + `@systematic-debugging` before retry (max 1 retry).
   - FAIL #2 → 2-Strike HALT → `.tmp/SYSTEM_ALERT.md`.
- **Fast-path**: config/typo/trivial → report to Mika; Mika decides to skip gates 3-4.
- Runner never commits — Mika commits after verification.

### /fix [bug] — Triage (runner level 1-2, Mika level 3)
Bypass 4 gates; use Sequential Thinking + `systematic-debugging`.
- L1 (syntax): quick fix, test, report.
- L2 (architecture): report user, propose task split.
- L3 (deadlock/wide impact): `.tmp/SYSTEM_ALERT.md`, HALT → Mika (+ Reviewer khi chạm auth/DB/backend/production).
- **MANDATORY diary**: after each fix → `[FIXED][#Txx] short note` in `.tmp/diary.md`.

### /done — Mika (close session)
1. Verify invariants (git diff + tests + secret scan) → tick remaining `[x]` → Sweep.
2. Compress progress + blockers → **overwrite** `HANDOFF.md` (snapshot, not append).
3. Clear `.tmp/diary.md` + `.tmp/global_context.md`.
4. One line: *"Session sealed."*

## RUNNER DISPATCH
- **State**: current runner stored in Mika's profile (`coding_runner.txt`); user switches anytime: "đổi runner sang X". Runner ∈ {coder, agy, opencode, commandcode}.
- **Dispatch**: Mika packages a self-contained prompt (task + affected files + constraints + test commands) → `harness-run <runner> --add-dir <repo> '<prompt>'` (guard: workspace allowlist/denylist + non-git marker; auto-prints git status/diff). `coder` uses the orchestration path instead.
- **Verify invariants** (runner-independent): BASE_SHA before → git diff + status after (scope? secret leak?) → rerun tests independently → **Reviewer** (fresh) khi CONTROLLED chạm auth/DB/schema/backend/production (dự án static nhỏ: Mika verify + adversarial audit đủ — xem note ROLES) → close only on PASS.

## AUTO-BEHAVIORS
| Trigger | Behavior |
|---|---|
| New conversation opens | Read `HANDOFF.md` + `tasks.md` + `.ai/KNOWN_BUGS.md`. One-line goal report. |
| `.tmp/SYSTEM_ALERT.md` exists | Read immediately; warn user before anything else. |
| Phase 100% done | Auto-sweep → `.ai/MASTER_PLAN.md`. |

## PROJECT TOOLING (project-specific — auto-filled, not part of template)
**Auto-fill**: Mika detects the stack from root files (package.json → npm test / npm run lint; requirements.txt → pytest / ruff; go.mod → go test / gofmt; pyproject.toml → hatch/uv) and fills this table at the FIRST `/plan` — no manual step.

| Item | Project value |
|---|---|
| Test command | none yet (TDD-first will add when needed) |
| Lint/static | `npm run lint` (eslint) |
| Browser verify | `~/.hermes/workspaces/browser-verify.sh <assert.mjs> [url]` (nguồn chuẩn — copy vào `tests/` khi cần; assert mẫu `~/.hermes/workspaces/browser-assert.example.mjs`). Chrome headless dump-dom + node assert + console-error check. Dùng cho task UI/DOM/CDN. |
| Code intelligence (optional) | none |
| Build/verify | `npm run build` (next build — ~24s on Pi5, pilot 2026-08-10) |
