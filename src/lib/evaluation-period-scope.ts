export type ActivePeriodRow = {
  id: string;
  status?: string | null;
};

export type EvaluationPeriodScope =
  | {
      kind: 'ACTIVE';
      activePeriodId: string;
      selectedPeriodStatus: 'Active';
      selectionReason: 'ACTIVE_ONLY';
    }
  | {
      kind: 'NO_ACTIVE_PERIOD';
      selectionReason: 'NO_ACTIVE_PERIOD';
    }
  | {
      kind: 'MULTIPLE_ACTIVE_PERIODS';
      selectionReason: 'MULTIPLE_ACTIVE_PERIODS';
    }
  | {
      kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR';
      selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR';
    };

export function resolveEvaluationPeriodScope(rows: ActivePeriodRow[] | null | undefined): EvaluationPeriodScope {
  if (!rows) {
    return {
      kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
      selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
    };
  }

  if (rows.length === 0) {
    return {
      kind: 'NO_ACTIVE_PERIOD',
      selectionReason: 'NO_ACTIVE_PERIOD',
    };
  }

  if (rows.length > 1) {
    return {
      kind: 'MULTIPLE_ACTIVE_PERIODS',
      selectionReason: 'MULTIPLE_ACTIVE_PERIODS',
    };
  }

  const [row] = rows;
  if (!row.id || row.status?.toLowerCase() !== 'active') {
    return {
      kind: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
      selectionReason: 'ACTIVE_PERIOD_RESOLUTION_ERROR',
    };
  }

  return {
    kind: 'ACTIVE',
    activePeriodId: row.id,
    selectedPeriodStatus: 'Active',
    selectionReason: 'ACTIVE_ONLY',
  };
}
