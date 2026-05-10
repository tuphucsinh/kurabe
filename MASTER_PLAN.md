# MASTER PLAN - KURABE (Personnel Evaluation System)

## Phase 31: Database Type Refactor & Safety
Refactor database library files to remove `as any` casts, implement proper mapping between camelCase and snake_case, and ensure full type safety using Supabase generated types.

## Phase 32: Understand Anything Tool (Emulation) [DONE]
Emulated Cursor's 'Understand Anything' tool by scanning the codebase, analyzing file dependencies, identifying architectural layers, and generating a tour guide.

## Phase 33: Visibility & Authorization Refinement
Implement strict role-based evaluation visibility, ensuring Leaders/Sub-leaders only see evaluations they are part of as employees or evaluators.

## Current Progress
- Phase 1-30: [x] Core features, UI, Basic Supabase integration.
- Phase 31: [ ] Database Type Refactor & Safety
- Phase 32: [x] Understand Anything Tool (Emulation)
- Phase 33: [ ] Visibility & Authorization Refinement

## Technical Stack
- Frontend: Next.js (App Router), TypeScript, Vanilla CSS.
- Backend/DB: Supabase (PostgreSQL).
- Deployment: Vercel.
