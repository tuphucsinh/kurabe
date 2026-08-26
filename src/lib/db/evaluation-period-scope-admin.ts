import 'server-only';

import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  EvaluationPeriodScope,
  resolveEvaluationPeriodScope,
} from '@/lib/evaluation-period-scope';

export async function resolveActiveEvaluationPeriodScope(): Promise<EvaluationPeriodScope> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    return {
      kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
      selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
    };
  }

  const { data, error } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(2);

  if (error || !data) {
    return {
      kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
      selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
    };
  }

  return resolveEvaluationPeriodScope(data);
}
