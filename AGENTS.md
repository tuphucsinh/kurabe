<!-- MIKA_AGENTS_CONTRACT: hotcore-v3-2026-09-05 -->
<!-- MIKA_PROJECT_PROTOCOL: mika-v3 -->
# AGENTS.md — Mika / Runner / Review Hot Contract

> Policy/invariants live here; routing is in `mika-engineering-orchestration`; exact HOW is in `references/project-execution-protocol.md` (`mika-v3`).
> **Bootstrap:** before mutation, read this file fully, `HANDOFF.md`, relevant `tasks.md`, then reconcile durable state. Never act from chat memory when durable state exists.

## 0. INTENT + LOAD GATE

Vietnamese/English natural intent maps to `PLAN`, `PLAN_TO_TASKS`, `EXECUTE`, `FIX`, `DONE`. `CONTINUE` = reconcile durable state, then choose the route; never duplicate-dispatch.

Before `EXECUTE`, `FIX`, dispatch, mutating recovery, candidate work, publish, or `DONE`, Mika **MUST** load the matching `project-execution-protocol.md` section and verify `MIKA_EXECUTION_PROTOCOL: mika-v3`. For PLAN/PLAN_TO_TASKS, load it when persisting canonical task/control state. Missing/incompatible ⇒ no mutation, `BLOCKED_CAPABILITY`.

Continuity truth = `AGENTS.md` + `HANDOFF.md` + `tasks.md` + `.state` + canonical Git; chat is advisory. Persist execution-relevant constraints before dispatch.

## 1. ROLES + INVARIANTS

| Role | Owns | Never |
|---|---|---|
| **Mika** | scope, WBS/DAG, tier, state, verify, review gate, integration/publish, recovery | trust Runner self-report; ambiguous dispatch; bypass gates |
| **Runner** | one bounded isolated task WT; scoped edits/checks allowed by runner contract | control files; canonical/integration WT; Git/ref/history mutation; scope creep; secrets |
| **Review gate** | fresh CONTROLLED verdict from exact candidate/evidence/risks | edit/commit/publish; trust Runner transcript; downgrade tier |

Runner = `coder|agy|opencode|commandcode`; review backend = `reviewer|agy`. If both use `agy`, review must be a separate fresh read-only session.

1. No code/config mutation without assigned task or true ad-hoc FAST; extras are proposals only.
2. Only Mika advances canonical Git. One verified planned task = one canonical task commit; control-plane commits never imply task completion.
3. Runner never edits `tasks.md`, `AGENTS.md`, `.ai/*`, `.state/*`, canonical/integration WTs, or paths outside `owns`.
4. Never expose raw secrets; use names/existence plus approved scans.
5. `failure_count >= 2` ⇒ `HALTED` + `.state/SYSTEM_ALERT.md` + raw evidence. Operational events need reason/evidence and never imply PASS.
6. Auth/DB/schema/payment/security/production/destructive scope escalates to CONTROLLED; FIX never downgrades tier.
7. Tier is not approval: paid/external, credentials/permissions, destructive/irreversible, production/critical, or other SOUL-protected actions still require explicit approval.
8. Never publish a dirty, conflicted, stale, unverified, or candidate-SHA-mismatched result.

## 2. ROUTES / ACCEPTANCE

| Tier | Scope | Path |
|---|---|---|
| **FAST** | ad-hoc docs/copy/comments/typo only; zero runtime/config/security impact | Mika isolated short-lived WT → verify → serialized canonical guard |
| **STANDARD** | normal app/code/config or any planned task | Runner → Mika independent verify → exact candidate verify → publish |
| **CONTROLLED** | auth/permissions, DB/schema/migration, backend boundary, payment, security/secrets, production/deploy, destructive/external mutable state | STANDARD + fresh selected review backend PASS |

Code, dependency/lockfile, runtime config, ambiguity, or planned work is >=STANDARD. Runner self-report/exit 0 is never PASS. Review independently checks requirements, cross-boundary/security/data/production risk, rollback/assumptions, and evidence; verdict = `PASS|REJECT`.

## 3. STATE + TASK CONTRACT

Tracked truth: `tasks.md`, `HANDOFF.md`, `.ai/*`. Recovery: `.state/agent-state.json`, `.state/control.lock`, `.state/SYSTEM_ALERT.md`; `.tmp/*` is disposable.

Reconcile: **canonical Git > integration WT/branch > task WT/branch > state JSON**. Existing task/integration evidence means not READY until reconciled. Canonical Git is DONE truth; `tasks.md` stays `[ ]` until the exact verified candidate is canonical. State/reservation/failure/candidate/publish mutation uses one `control.lock` + atomic write; without lock support, one Mika writer only. State owns authoritative `BASE_SHA`.

```text
READY → RUNNING → RUNNER_PASS → VERIFIED → CANDIDATE → READY_TO_PUBLISH → DONE
                    │                    └→ REPAIRING → RUNNING
                    └→ RUNNING
Any active state may become BLOCKED/HALTED.
HEAD moved before publish: READY_TO_PUBLISH → CANDIDATE → reverify → READY_TO_PUBLISH.
```

One deliverable = one task including wiring + verification. IDs are unique/stable; `depends` is an acyclic canonical-input DAG; `owns` is exclusive Runner write scope excluding Mika control paths; `locks` name shared mutable/external resources. Concurrency = `depends + owns + locks + state`; no `parallel_safe`.

```yaml
task:
  id: P1M1T01
  tier: STANDARD
  depends: []
  owns: [src/..., tests/...]
  locks: []
```

Task body: Goal, Interface/current context, Changes, Constraints, DoD with exact verification command(s). Re-check dependency interfaces before dependent dispatch.

`RUNNABLE = dependencies_integrated AND state==READY AND no_blocking_alert`  
`DISPATCHABLE = RUNNABLE AND owns_free AND locks_free AND runner_capacity_available`

Reserve complete `owns+locks` atomically or nothing. Never dispatch an active ID twice. Runner liveness: `LIVE` keeps reservations; `DEAD` may release safe local/file reservations; `UNKNOWN` ⇒ `BLOCKED`, preserve evidence, never redispatch. Uncertain external/production mutations remain quarantined.

## 4. VERIFY / INTEGRATE / PUBLISH

Mika independently verifies BASE_SHA, full diff/status, owned/forbidden paths, secrets, DoD, and tier. Runner checks are supplemental. A verified task delta needs a recoverable immutable snapshot.

STANDARD/CONTROLLED is never published from Runner WT. Mika builds an isolated candidate from current canonical HEAD, verifies the **exact** candidate, requires fresh review PASS for CONTROLLED, publishes only while candidate/base integrity matches state, rebuilds/reverifies after HEAD movement, and serializes canonical advances with older eligible publish turns first.

Repair starts from current canonical HEAD, preserves the exact owned delta, leaves no conflict/sequencer residue, and returns owned application conflicts to Runner. Review-result reuse after stale rebuild requires unchanged fingerprint (candidate tree + risk contract + dependency interfaces + canonical dependency SHAs), conflict-free reapply, and rerun automated verification.

## 5. FIX / DONE / TOOLING

`FIX` skips planning ceremony only; never scope, tier, isolation, reservations, Mika verification, review, approval, or publish gates. Wide architecture work is re-planned; destructive/security/production deadlock may HALT for evidence/approval.

`DONE` requires verified canonical history/project gate; no active/repair/candidate/publish residue, quarantine/alert, or dangling dependencies; `HANDOFF.md` <=15 lines (state/blockers/next); remaining control delta committed through canonical guard; final canonical WT clean. Never clear recovery/quarantine state prematurely.

At first PLAN, record canonical verification/lint/build/browser/secret commands, disposable-output allowlist, `LIVE/DEAD/UNKNOWN` liveness check, canonical branch, separate Runner/integration WT roots, runner/verifier caps, and publish-refresh timeout. Use existing scripts; coding/style guidance belongs in lazy `.ai/*`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
