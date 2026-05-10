import { EvalStatus, Role, RoundNumber } from '@/types';

export type EvaluatorSelector = 'SELF' | 'SubLeader' | 'Leader' | 'Manager';

export interface EvaluationFlowStep {
  round: RoundNumber;
  evaluator: EvaluatorSelector;
}

export interface EvaluationNextStep {
  status: EvalStatus;
  round: RoundNumber;
  evaluator?: EvaluatorSelector;
  isFinal: boolean;
}

const EVALUATION_FLOWS: Record<Role, EvaluationFlowStep[]> = {
  Manager: [
    { round: 1, evaluator: 'SELF' },
  ],
  Leader: [
    { round: 1, evaluator: 'SELF' },
    { round: 2, evaluator: 'Manager' },
  ],
  SubLeader: [
    { round: 1, evaluator: 'SELF' },
    { round: 2, evaluator: 'Leader' },
    { round: 3, evaluator: 'Manager' },
  ],
  Employee: [
    { round: 1, evaluator: 'SubLeader' },
    { round: 2, evaluator: 'Leader' },
    { round: 3, evaluator: 'Manager' },
  ],
};

const ACTIVE_STEP_STATUSES: Record<RoundNumber, EvalStatus> = {
  1: 'Draft',
  2: 'Submitted',
  3: 'Reviewed',
};

export function getEvaluationFlow(employeeRole: Role): EvaluationFlowStep[] {
  return EVALUATION_FLOWS[employeeRole].map(step => ({ ...step }));
}

export function getMaxEvaluationRound(employeeRole: Role): RoundNumber {
  const flow = getEvaluationFlow(employeeRole);
  return flow[flow.length - 1].round;
}

export function getNextEvaluationStep(
  employeeRole: Role,
  currentRound: RoundNumber
): EvaluationNextStep {
  const flow = getEvaluationFlow(employeeRole);
  const currentIndex = flow.findIndex(step => step.round === currentRound);
  const nextStep = currentIndex >= 0 ? flow[currentIndex + 1] : undefined;

  if (!nextStep) {
    return {
      status: 'Approved',
      round: currentRound,
      isFinal: true,
    };
  }

  return {
    status: ACTIVE_STEP_STATUSES[nextStep.round],
    round: nextStep.round,
    evaluator: nextStep.evaluator,
    isFinal: false,
  };
}

export function isLeaderGradingRole(employeeRole: Role): boolean {
  return employeeRole === 'Manager' || employeeRole === 'Leader' || employeeRole === 'SubLeader';
}
