# HANDOFF

## Progress
- Implemented `useDeleteUser`, `useDeleteTeam`, `useDeleteCriteriaGroup`, `useDeleteCriterion` hooks in `src/hooks/use-db.ts` to call Supabase server actions.
- Verified that delete actions are fully implemented in `employees/page.tsx`, `teams/page.tsx`, and `criteria/page.tsx`.
- All delete features include a `window.confirm` dialog.
- Found and fixed an unclosed HTML `div` tag in `src/app/criteria/page.tsx`.

## Blockers
- None.

## Next Steps
- Continue with other feature development as directed by user.
