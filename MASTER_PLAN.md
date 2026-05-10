# MASTER PLAN - KURABE (Personnel Evaluation System)

## Phase 31: Database Type Refactor & Safety
Refactor database library files to remove `as any` casts, implement proper mapping between camelCase and snake_case, and ensure full type safety using Supabase generated types.

## Phase 32: Understand Anything Tool (Emulation) [DONE]
Emulated Cursor's 'Understand Anything' tool by scanning the codebase, analyzing file dependencies, identifying architectural layers, and generating a tour guide.

## Phase 33: Visibility & Authorization Refinement [DONE]
Implement strict role-based evaluation visibility, ensuring Leaders/Sub-leaders only see evaluations they are part of as employees or evaluators.

Summary: Restricted evaluation visibility to owner/evaluator access, propagated user context through evaluation hooks/pages, and implemented dynamic approval flow by role: Employee -> SubLeader/Leader/Manager, SubLeader -> Leader/Manager, Leader -> Manager.

## Phase 34: Workflow Correction [DONE]
Correct the approval workflow to match the confirmed business rule: Manager one self round; Leader self round then Manager; SubLeader self round then Leader then Manager; Employee SubLeader then Leader then Manager.

Summary: Added a shared workflow contract, corrected period initialization and submit transitions, synchronized frontend permission helpers, and updated detail/compare UI to use role-aware round count and grading.

## Current Progress
- Phase 1-30: [x] Core features, UI, Basic Supabase integration.
- Phase 31: [ ] Database Type Refactor & Safety
- Phase 32: [x] Understand Anything Tool (Emulation)
- Phase 33: [x] Visibility & Authorization Refinement
- Phase 34: [x] Workflow Correction

## Technical Stack
- Frontend: Next.js (App Router), TypeScript, Vanilla CSS.
- Backend/DB: Supabase (PostgreSQL).
- Deployment: Vercel.
