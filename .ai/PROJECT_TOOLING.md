# Kurabe — execution tooling bindings (P107 preparation)

Data record, not instruction authority. Created 2026-10-08 under PLAN_TO_TASKS; no runtime was started. Trusted AGENTS/protocol and current owner scope govern execution.

| Item | Binding / verification |
|---|---|
| PROJECT_ROOT | `/home/pi5/projects/kurabe` (git root verified) |
| CANONICAL_BRANCH | `main`; planning source HEAD `5f0c95f37ffa5155b4f7ba26e9ea6f61991925ee` |
| Control writer | Mika only; existing `.state/control.lock` + `fcntl.flock(LOCK_EX)`/`flock`; atomic JSON replacement under lock. No daemon/database. Never hold lock during tests/build/review. |
| Task test wrapper | `npm test` = `node scripts/run-tests.mjs`; recursively discovers `.test.mjs` and `.test.ts`. Preserve per-gate real exit status. Do not use `node --test tests/` as root gate. |
| Static gates | `npm run lint`; `npm run typecheck` (incremental false) |
| Build | `npm run build` in isolated candidate WITHOUT `.env.local`; only synthetic/disposable build env. Env wrapper intentionally prioritizes local file; do not weaken it. No build against an actively served `.next`. |
| Secret scan | `node scripts/scan-source-secrets.mjs`; scan exact newly owned paths as well; no credential values in artifacts. |
| Runtime suites | `node scripts/verify-release.mjs --suite confirmation-matrix --tier authenticated --evidence "$EVIDENCE/confirmation.json"`; `node scripts/verify-release.mjs --suite production-smoke --evidence "$EVIDENCE/smoke.json"`. Inspect tier/real/passed/cases/readback, not exit 0 only. |
| Browser | Real Chromium `/usr/bin/chromium` (binary discovered), loopback CDP on owned disposable profile; existing `tests/browser/release-matrix.mjs` + release wrapper, or declared P107 suite. DOM/network/console + screenshots 390x844 and 1440x900; no production session or test-only auth adapter. |
| Disposable stack | Reuse `.github/ci/confirmation-runtime.mjs` lifecycle; Auth/PostgREST ACL tests additionally require authentic local Supabase CLI/Auth stack. Target/versions/health/loopback binding/ownership verified before fixture writes. Bare PG proves transaction-only, not Supabase Auth parity. |
| RUNNER_WT_ROOT | Configured for P107: `/home/pi5/projects/kurabe-task-wts`; task child `<ID>`. Not created in preparation. |
| INTEGRATION_WT_ROOT | Configured separately: `/home/pi5/projects/kurabe-integration-wts`; candidate child `<ID>`. Not created in preparation. |
| Evidence | `/home/pi5/hermes-artifacts/kurabe-p107/<ID>/`; plan review under `/home/pi5/hermes-artifacts/kurabe-p107-plan/`. Redacted durable evidence, exact SHA and file digests. No runtime credentials in retained evidence. |
| Disposable allowlist | Only task-owned WT `.next/`, `node_modules/`, `.tmp/`, `tsconfig.tsbuildinfo`; exact ownership-recorded runtime processes/containers/networks/volumes, fixture IDs and mode-600 transient env/browser profile under the task artifact run root. No broad git clean, prefix deletion, canonical cleanup or removal of unknown roots. Retain failed evidence and fixture until full matrix closes. |
| Liveness | Use captured PID + `/proc/<PID>/stat` start ticks + executable/cmdline/workspace/process tree; tracked process handle where available. LIVE preserves reservations; definite missing/exited matching process ⇒ DEAD; inaccessible/mismatched/uncertain ⇒ UNKNOWN. No inference from log size or age. |
| Runner/review routing | Read live selector/model at dispatch. Writer `agy-run`; fresh read-only review `agy-readonly --strict` if selected; configured capability-gated coder fallback only per task. Neither mutates control files/refs. |
| MAX_PARALLEL_RUNNERS | 1 |
| MAX_CANDIDATE_VERIFIERS | 1; no simultaneous heavy build/DB/browser with another phase task |
| Resource guard | Before heavy work read available RAM, swap activity, existing critical processes and Pi temperature/throttling. Planning snapshot available RAM 5.0Gi; NOT future headroom proof. Proposed safe floor ≥3Gi available RAM, no current throttling; below floor serialize/defer, never stop unrelated services. |
| Exclusive-all lock | `MACHINE_EXCLUSIVE` conflicts with every active reservation; use through full owned runtime/build/benchmark lifecycle. Source tasks additionally use `KURABE_SOURCE_CONTRACT`; serial DAG prevents shared-path contention. |
| PUBLISH_REFRESH_TIMEOUT | Configured 900 seconds for bounded automatic candidate refresh; identity/review change clears turn before long work. This is a planning setting, not permission to publish. |
| Registration boundary | Current WBS is PLANNED, not READY. No state registration before owner-authorized canonical planning commit/readback + fresh plan review. Authoritative dispatch BASE_SHA lives in runtime state and is refreshed from canonical Git after dependencies integrate. |
| Final root inventory | Canonical root, registered worktrees, both configured roots, any task-declared temporary clone/runtime roots; inspect existing bytes/ownership before reuse. Remove empty owned parents only after proven cleanup. Retained evidence classified explicitly, not CLEAN. |

Local app/DB/browser qualification and production rollout are separate. Production catalog/private-data reads, grants/settings/credential operations, migrations, paid provider traffic, Git commit/push and deploy retain owner approval gates.
