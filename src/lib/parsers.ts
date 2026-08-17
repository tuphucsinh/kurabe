import { Role, Grade, EvalStatus, RoundNumber } from '@/types';

const ROLES = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'] as const;
const GRADES = ['S', 'A', 'AB', 'B', 'C', 'D', 'Pending'] as const;
const EVAL_STATUSES = ['NotStarted', 'Draft', 'Submitted', 'Reviewed', 'Approved'] as const;

function warnInvalid(kind: string, value: unknown, fallback: unknown): void {
  console.warn(`[parsers] ${kind} lạ từ dữ liệu: ${JSON.stringify(value)} — dùng fallback ${JSON.stringify(fallback)}`);
}

function isNonEmpty(value: unknown): boolean {
  return value != null && value !== '';
}

/** Ép an toàn string DB → Role; giá trị lạ → fallback + warn (chặn lan truyền data bẩn). */
export function parseRole(value: unknown, fallback: Role = 'Employee'): Role {
  if (typeof value === 'string' && (ROLES as readonly string[]).includes(value)) {
    return value as Role;
  }
  if (isNonEmpty(value)) warnInvalid('Role', value, fallback);
  return fallback;
}

/** Ép an toàn string DB → Grade; giá trị lạ → fallback + warn. */
export function parseGrade(value: unknown, fallback: Grade = 'Pending'): Grade {
  if (typeof value === 'string' && (GRADES as readonly string[]).includes(value)) {
    return value as Grade;
  }
  if (isNonEmpty(value)) warnInvalid('Grade', value, fallback);
  return fallback;
}

/** Ép an toàn string DB → EvalStatus; giá trị lạ → fallback + warn. */
export function parseEvalStatus(value: unknown, fallback: EvalStatus = 'NotStarted'): EvalStatus {
  if (typeof value === 'string' && (EVAL_STATUSES as readonly string[]).includes(value)) {
    return value as EvalStatus;
  }
  if (isNonEmpty(value)) warnInvalid('EvalStatus', value, fallback);
  return fallback;
}

/** Ép an toàn number DB → RoundNumber (1|2|3); giá trị lạ → fallback + warn. */
export function parseRoundNumber(value: unknown, fallback: RoundNumber = 1): RoundNumber {
  const n = typeof value === 'number' ? value : Number(value);
  if (n === 1 || n === 2 || n === 3) return n;
  if (isNonEmpty(value)) warnInvalid('RoundNumber', value, fallback);
  return fallback;
}
