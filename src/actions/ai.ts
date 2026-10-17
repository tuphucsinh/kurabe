'use server';

import { requireManager } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';
import { buildResultPrompt } from '@/lib/ai-prompts';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { getDashboardData } from '@/actions/dashboard';
import { getPeriodSummary } from '@/actions/ai-summary';
import { toClientError } from '@/lib/errors';
import { checkAndRecordAiUsage } from '@/lib/ai-limit';
import { assertEvaluationPeriodActiveForEvaluation } from '@/lib/db/evaluation-period-write-guard';
import { detectPromptInjection, boundAIText, boundAITextWithMeta, parseAiChunkBounds, parseAiProviderTimeout, runBoundedConcurrency, runProviderCallBounded, MAX_AI_PROMPT_CHARS, MAX_AI_CHUNK_CONCURRENCY, type AIPayloadCoverage } from '@/lib/ai-governance';
import type {
  CriteriaSnapshot,
  groupsForVersion as GroupsForVersionFn,
  filterGroupsForDisplay as FilterGroupsForDisplayFn,
} from '@/lib/db/evaluation-display-admin';
import type { Evaluation, EvaluationRound, CriteriaGroup, Criterion } from '@/types';

let displayAdminModule: {
  loadCriteriaSnapshots: typeof import('@/lib/db/evaluation-display-admin').loadCriteriaSnapshots;
  groupsForVersion: typeof import('@/lib/db/evaluation-display-admin').groupsForVersion;
  filterGroupsForDisplay: typeof import('@/lib/db/evaluation-display-admin').filterGroupsForDisplay;
} | null = null;

async function getDisplayAdmin() {
  if (!displayAdminModule) {
    displayAdminModule = await import('@/lib/db/evaluation-display-admin');
  }
  return displayAdminModule;
}

const AI_NOT_CONFIGURED = 'AI chưa được cấu hình — chờ cung cấp API key.';

/** P107M1T08: single non-enumerating response for an invalid batch request. */
const AI_CHUNK_INVALID_REQUEST = 'Yêu cầu không hợp lệ.';

/**
 * P107M1T08: single response for both out-of-scope and not-found targets so a
 * caller cannot use response differences to enumerate what exists.
 */
const AI_TARGET_NOT_FOUND = 'Không tìm thấy dữ liệu đánh giá hợp lệ.';

function aiError(): { error: string } {
  return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
}

/**
 * Builds criteriaDetail and notesSummary from either a pinned snapshot (P108)
 * or the live criteria catalog (legacy). Non-exported helper so tests can bind it
 * via loader transform while keeping every export in this 'use server' module an async function.
 */
function buildEvaluationCriteriaDetail(
  evaluation: Pick<Evaluation, 'employeeRole'>,
  round: Pick<EvaluationRound, 'criteriaConfigVersionId' | 'scores' | 'selectedLevelIndexes' | 'notes'>,
  snapshot: CriteriaSnapshot | null,
  liveCriteriaGroups: CriteriaGroup[] | null,
  helpers?: {
    groupsForVersion?: typeof GroupsForVersionFn;
    filterGroupsForDisplay?: typeof FilterGroupsForDisplayFn;
  },
  options?: { formatNotesWithCriterionName?: boolean }
): {
  ok: boolean;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string }[];
  notesSummary: string;
  allCriteria: Criterion[];
  error?: string;
} {
  const lastScores = round.scores || {};
  let allCriteria: Criterion[];
  let criteriaMap: Map<string, Criterion>;

  if (round.criteriaConfigVersionId) {
    if (!snapshot || snapshot.unavailable.has(round.criteriaConfigVersionId)) {
      return { ok: false, criteriaDetail: [], notesSummary: '', allCriteria: [], error: AI_TARGET_NOT_FOUND };
    }
    const gfv = helpers?.groupsForVersion ?? displayAdminModule?.groupsForVersion;
    const fgfd = helpers?.filterGroupsForDisplay ?? displayAdminModule?.filterGroupsForDisplay;
    if (!gfv || !fgfd) {
      return { ok: false, criteriaDetail: [], notesSummary: '', allCriteria: [], error: AI_TARGET_NOT_FOUND };
    }
    const versionGroups = gfv(round.criteriaConfigVersionId, snapshot);
    if (versionGroups.length === 0) {
      return { ok: false, criteriaDetail: [], notesSummary: '', allCriteria: [], error: AI_TARGET_NOT_FOUND };
    }
    const filteredGroups = fgfd(versionGroups, evaluation.employeeRole);
    allCriteria = filteredGroups.flatMap((g) => g.criteria);
    criteriaMap = new Map(allCriteria.map((c) => [c.id, c]));
  } else {
    // Legacy evaluation: use live catalog
    const liveGroups = liveCriteriaGroups || [];
    allCriteria = liveGroups.flatMap((g) => g.criteria);
    criteriaMap = new Map(allCriteria.map((c) => [c.id, c]));
  }

  const criteriaDetail = allCriteria
    .filter((c) => lastScores[c.id] !== undefined)
    .map((c) => {
      const levelIdx = round.selectedLevelIndexes?.[c.id] ?? 0;
      const level = c.levels?.[levelIdx];
      return {
        code: c.code,
        name: c.name,
        points: Number(lastScores[c.id]) || 0,
        levelLabel: level?.label || '',
      };
    });

  const notesSummary = Object.entries(round.notes || {})
    .filter(([k, v]) => Boolean(v && v.trim() && (round.criteriaConfigVersionId ? criteriaMap.has(k) : true)))
    .slice(0, 3)
    .map(([k, v]) => {
      const c = criteriaMap.get(k);
      if (options?.formatNotesWithCriterionName) {
        return `${c?.code || ''} ${c?.name || ''}: ${boundAIText(v, 200)}`;
      }
      return `${c?.code || ''}: ${boundAIText(v, 200)}`;
    })
    .filter(Boolean)
    .join(' | ');

  return { ok: true, criteriaDetail, notesSummary, allCriteria };
}

/**
 * Giải thích một cảnh báo đánh giá bất thường bằng AI (Manager-only).
 * Chưa cấu hình AI_API_KEY → trả thông báo (fail-soft, không lỗi).
 * Dữ liệu gửi LLM: ẩn danh hóa (tên thật → 'Nhân viên'), chỉ số liệu cần thiết.
 */
export async function explainAnomalyAction(input: {
  evaluationId: string;
  name: string;
  round: number;
  prevScore: number;
  score: number;
}): Promise<{ explanation?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };

  if (!isAIConfigured()) {
    return { error: 'AI chưa được cấu hình — chờ cung cấp API key.' };
  }

  const prompt = `Dữ liệu đánh giá QAQC:
- Nhân viên (mã số ${input.evaluationId.slice(0, 8)}): vòng ${input.round - 1} đạt ${input.prevScore} điểm, vòng ${input.round} đạt ${input.score} điểm (chênh lệch ${Math.abs(input.score - input.prevScore)} điểm).
- Hãy đưa ra 3 khả năng có thể giải thích sự chênh lệch này (thiên kiến, thay đổi năng lực, lỗi nhập liệu...) và 1 gợi ý hành động cho quản lý. Ngắn gọn, tối đa 120 từ, tiếng Việt.`;

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'explainAnomaly');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  const explanation = await callAI(prompt, { maxTokens: 250 });
  if (!explanation) {
    return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
  }
  return { explanation };
}

export async function draftResultMessageAction(input: {
  periodId: string;
  employeeCode: string;
  name: string;
  role: string;
  totalScore: number;
  grade: string;
  criteriaDetail: { code: string; name: string; points: number; levelLabel: string }[];
  previousComments: string[];
  notesSummary: string;
  summaryNotes: string;
  periodName: string;
}): Promise<{ message?: string; payloadCoverage?: AIPayloadCoverage; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  // Governance: detect prompt-injection in client-supplied HR text fields.
  // notesSummary and summaryNotes are evaluator notes — advisory, not trusted.
  if (
    detectPromptInjection(input.notesSummary) ||
    detectPromptInjection(input.summaryNotes) ||
    detectPromptInjection(input.periodName)
  ) {
    return { error: 'Dữ liệu đầu vào không hợp lệ.' };
  }

  // Resolve the target and all score/criteria fields from the requester-visible DB
  // scope. Client values remain only a selector and are never placed in the prompt.
  // P108M1T09A: period is selected ONLY by periodId; missing/empty/non-string or not found => AI_TARGET_NOT_FOUND
  if (typeof input.periodId !== 'string' || !input.periodId.trim()) {
    return { error: AI_TARGET_NOT_FOUND };
  }

  const { data: visiblePeriods } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, name, year')
    .order('year', { ascending: false });

  const periodsList = visiblePeriods || [];
  const period = periodsList.find((candidate) => candidate.id === input.periodId);
  if (!period) {
    return { error: AI_TARGET_NOT_FOUND };
  }

  const [evaluations, users] = await Promise.all([
    getEvaluationsByPeriodAdmin(period.id, auth.user),
    getUsersAdmin(auth.user),
  ]);
  const employee = users.find((candidate) => candidate.employeeCode === input.employeeCode);
  // P107M1T08: same Approved-only server-side projection as the batch path — a
  // Draft/Submitted evaluation's comment/notes must NEVER reach the provider
  // prompt. Out-of-scope / not-found / not-Approved share one safe response.
  const evaluation = employee
    ? evaluations.find((candidate) => candidate.employeeId === employee.id && candidate.status === 'Approved')
    : undefined;
  if (!employee || !evaluation) return { error: AI_TARGET_NOT_FOUND };

  const rounds = evaluation.rounds || [];
  const lastRound =
    [...rounds].sort((a, b) => b.round - a.round).find((round) => (round.totalScore || 0) > 0) ||
    rounds[rounds.length - 1];
  if (!lastRound) return { error: AI_TARGET_NOT_FOUND };

  let criteriaSnapshot: CriteriaSnapshot | null = null;
  let liveCriteriaGroups: CriteriaGroup[] | null = null;
  let displayAdmin: {
    groupsForVersion: typeof GroupsForVersionFn;
    filterGroupsForDisplay: typeof FilterGroupsForDisplayFn;
  } | undefined = undefined;

  if (lastRound.criteriaConfigVersionId) {
    const admin = await getDisplayAdmin();
    displayAdmin = admin;
    criteriaSnapshot = await admin.loadCriteriaSnapshots([lastRound.criteriaConfigVersionId]);
    if (criteriaSnapshot.unavailable.has(lastRound.criteriaConfigVersionId)) {
      return { error: AI_TARGET_NOT_FOUND };
    }
  } else {
    liveCriteriaGroups = await getAllCriteriaGroups();
  }

  const criteriaContext = buildEvaluationCriteriaDetail(
    evaluation,
    lastRound,
    criteriaSnapshot,
    liveCriteriaGroups,
    displayAdmin
  );
  if (!criteriaContext.ok) {
    return { error: AI_TARGET_NOT_FOUND };
  }
  const { criteriaDetail, notesSummary } = criteriaContext;

  const previousComments = rounds
    .filter((round) => round.round < (lastRound.round ?? 0))
    .map((round) => boundAIText(round.comment, 500))
    .filter(Boolean);

  const summaryNotes = boundAIText(lastRound.comment, 500) || previousComments.join(' | ');
  if (detectPromptInjection(notesSummary) || detectPromptInjection(summaryNotes)) {
    return { error: 'Ghi chú đánh giá chứa nội dung không hợp lệ.' };
  }

  const prompt = buildResultPrompt({
    employeeCode: employee.employeeCode || '',
    name: employee.name || '',
    role: evaluation.employeeRole || employee.role || '',
    totalScore: evaluation.finalScore ?? lastRound.totalScore ?? 0,
    grade: evaluation.finalGrade ?? lastRound.grade ?? '',
    criteriaDetail,
    previousComments,
    notesSummary,
    summaryNotes,
    periodName: `${period.name} (${period.year})`,
  });
  const bounded = boundAITextWithMeta(prompt, MAX_AI_PROMPT_CHARS, 'characters');
  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'draftResultMessage');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  const message = await callAI(bounded.text, { maxTokens: 800, temperature: 0.7 });
  if (!message) return aiError();
  return { message, payloadCoverage: bounded.coverageMeta };
}

/**
 * Lưu thông báo kết quả vào evaluation (Manager-only).
 */
export async function saveResultMessageAction(input: {
  evaluationId: string;
  message: string;
}): Promise<{ ok?: boolean; auditRecorded?: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };

  // P96T05: Closed-period write firewall — guard evaluation period before write
  const periodGuard = await assertEvaluationPeriodActiveForEvaluation(input.evaluationId);
  if (!periodGuard.success) {
    return { error: periodGuard.error };
  }

  try {
    const { error } = await supabaseAdmin
      .from('evaluations')
      .update({ result_message: input.message })
      .eq('id', input.evaluationId);

    if (error) {
      return { error: toClientError(error, 'Lỗi cập nhật thông báo kết quả. Vui lòng thử lại.') };
    }

    revalidatePath(`/evaluations/${input.evaluationId}`);
    revalidatePath('/dashboard');

    // P107M1T08: the business mutation above already committed. The audit write
    // is reported separately (auditRecorded) and MUST NOT turn this into a
    // retry-able business failure, and MUST NOT trigger a silent re-run of the
    // update. logAudit never throws and emits its own redacted diagnostics.
    const audit = await logAudit(
      auth.user,
      'SAVE_RESULT_MESSAGE',
      'evaluation',
      input.evaluationId,
      { messageLength: input.message?.length || 0 }
    );

    return { ok: true, auditRecorded: audit.ok };
  } catch (err: unknown) {
    return { error: toClientError(err, 'Lỗi không xác định khi lưu thông báo kết quả.') };
  }
}

export type AIChunkItemOutcome =
  | 'ok'
  | 'provider-failure'
  | 'governance-reject'
  /** P107M1T08: the provider call outlived the bounded wall-clock budget. */
  | 'timeout'
  /** P107M1T08: the caller canceled the request before usable output. */
  | 'canceled'
  | 'error';

export interface GenerateResultChunkItem {
  evaluationId: string;
  message?: string;
  ok: boolean;
  error?: string;
  /** P107M1T08: machine-readable terminal outcome for this row. */
  outcome: AIChunkItemOutcome;
  /** Coverage metadata for this row's payload — present when ok=true. */
  payloadCoverage?: AIPayloadCoverage;
}

/**
 * P107M1T08: per-chunk cost record. The quota unit stays 1 reserved chunk
 * request (unchanged billing unit); provider calls are recorded separately so a
 * future per-item unit change can be gated explicitly (amendment + approval).
 */
export interface GenerateResultChunkCost {
  chunkRequests: number;
  providerCalls: number;
  usableOutputs: number;
}

/**
 * Sinh thông báo kết quả hàng loạt theo từng chunk (Manager-only).
 * P107M1T08: validates offset/limit BEFORE any work, caps provider concurrency
 * to MAX_AI_CHUNK_CONCURRENCY, and returns the same non-enumerating response for
 * an invalid request. Only Approved evaluations ever enter the prompt.
 */
export async function generateResultMessagesChunkAction(input: {
  periodId: string;
  offset: number;
  limit?: number;
  /**
   * P107M1T08: optional provider wall-clock budget in ms. Clamped server-side to
   * [1, MAX_AI_CHUNK_PROVIDER_TIMEOUT_MS] — a caller may only SHORTEN its own
   * budget, never widen the bound. Used by programmatic callers deterministically;
   * the browser client never sends it.
   */
  timeoutMs?: number;
  /**
   * P107M1T08: optional cancellation signal for programmatic/server-side callers.
   * When it aborts, in-flight and pending provider calls yield the distinct
   * 'canceled' terminal outcome. Never sent by the browser client.
   */
  signal?: AbortSignal;
}): Promise<{
  items?: GenerateResultChunkItem[];
  nextOffset?: number;
  done?: boolean;
  total?: number;
  cost?: GenerateResultChunkCost;
  error?: string;
}> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };

  // Reject NaN / ±Infinity / fraction / negative / over-cap / non-integer
  // offset+limit BEFORE any DB read, quota reservation, or provider call.
  const bounds = parseAiChunkBounds({ offset: input.offset, limit: input.limit });
  if (!bounds.ok) return { error: AI_CHUNK_INVALID_REQUEST };
  const { offset, limit } = bounds;

  try {
    const [evaluations, users] = await Promise.all([
      getEvaluationsByPeriodAdmin(input.periodId, auth.user),
      getUsersAdmin(auth.user),
    ]);

    const { data: periodData } = await supabaseAdmin
      .from('evaluation_periods')
      .select('id, name, year')
      .eq('id', input.periodId)
      .maybeSingle();

    const periodName = periodData ? `${periodData.name} (${periodData.year})` : 'Kỳ đánh giá';

    // Chỉ xử lý evaluations đã Approved
    const approvedEvals = evaluations.filter((e) => e.status === 'Approved');
    const totalApproved = approvedEvals.length;
    const chunk = approvedEvals.slice(offset, offset + limit);
    if (chunk.length === 0) {
      return {
        items: [],
        nextOffset: offset,
        done: true,
        total: totalApproved,
        cost: { chunkRequests: 0, providerCalls: 0, usableOutputs: 0 },
      };
    }

    const chunkChosenRounds = new Map<string, Evaluation['rounds'][number]>();
    for (const ev of chunk) {
      const rounds = ev.rounds || [];
      const chosen =
        [...rounds].sort((a, b) => b.round - a.round).find((r) => (r.totalScore || 0) > 0) ||
        rounds[rounds.length - 1];
      if (chosen) {
        chunkChosenRounds.set(ev.id, chosen);
      }
    }

    const distinctVersionIds = [
      ...new Set(
        [...chunkChosenRounds.values()]
          .map((r) => r.criteriaConfigVersionId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ];

    const needsLive = chunk.some((ev) => {
      const r = chunkChosenRounds.get(ev.id);
      return !r?.criteriaConfigVersionId;
    });

    const displayAdmin = distinctVersionIds.length > 0 ? await getDisplayAdmin() : null;

    const [criteriaSnapshot, liveCriteriaGroups] = await Promise.all([
      distinctVersionIds.length > 0 && displayAdmin
        ? displayAdmin.loadCriteriaSnapshots(distinctVersionIds)
        : Promise.resolve({ groups: new Map(), unavailable: new Set<string>() }),
      needsLive ? getAllCriteriaGroups() : Promise.resolve([]),
    ]);

    const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'generateResultMessagesChunk');
    if (!aiQuota.allowed) return { error: aiQuota.error };

    const userMap = new Map(users.map((u) => [u.id, u]));

    // P107M1T08: record per-chunk/per-item cost without changing the quota unit.
    let providerCalls = 0;
    let usableOutputs = 0;

    // P107M1T08: bounded provider wall-clock budget (clamped — a caller can only
    // shorten its own budget). Distinct terminal outcomes for timeout/cancel.
    const providerTimeoutMs = parseAiProviderTimeout(input.timeoutMs);

    // Bound active provider work to MAX_AI_CHUNK_CONCURRENCY at any moment.
    const items: GenerateResultChunkItem[] = await runBoundedConcurrency(
      chunk,
      MAX_AI_CHUNK_CONCURRENCY,
      async (ev): Promise<GenerateResultChunkItem> => {
        try {
          // Server-resolved employee data: use DB record, not client-provided fields.
          const employee = userMap.get(ev.employeeId);
          const rounds = ev.rounds || [];
          const lastRound = chunkChosenRounds.get(ev.id);
          if (!lastRound) {
            return {
              evaluationId: ev.id,
              ok: false,
              outcome: 'error',
              error: AI_TARGET_NOT_FOUND,
            };
          }

          const criteriaContext = buildEvaluationCriteriaDetail(
            ev,
            lastRound,
            criteriaSnapshot,
            liveCriteriaGroups,
            displayAdmin ?? undefined,
            { formatNotesWithCriterionName: true }
          );

          if (!criteriaContext.ok) {
            return {
              evaluationId: ev.id,
              ok: false,
              outcome: 'error',
              error: criteriaContext.error || AI_TARGET_NOT_FOUND,
            };
          }

          const { criteriaDetail, notesSummary: rawNotesSummary } = criteriaContext;

          const previousComments = rounds
            .filter((r) => r.round < (lastRound?.round ?? 0))
            .map((r) => boundAIText(r.comment, 500))
            .filter(Boolean);

          const rawSummaryNotes =
            boundAIText(lastRound?.comment, 500) ||
            rounds.map((r) => boundAIText(r.comment, 300)).filter(Boolean).join(' | ');

          // Governance: fail-closed on injection in evaluator notes (server-side data).
          if (detectPromptInjection(rawNotesSummary) || detectPromptInjection(rawSummaryNotes)) {
            return { evaluationId: ev.id, ok: false, outcome: 'governance-reject', error: 'Ghi chú đánh giá chứa nội dung không hợp lệ.' };
          }

          const totalScore = ev.finalScore ?? lastRound?.totalScore ?? 0;
          const grade = ev.finalGrade ?? lastRound?.grade ?? '';

          const prompt = buildResultPrompt({
            // Use server-resolved employee data — ignore client-provided name/role.
            employeeCode: employee?.employeeCode || '',
            name: employee?.name || '',
            role: ev.employeeRole || employee?.role || '',
            totalScore,
            grade,
            criteriaDetail,
            previousComments,
            notesSummary: rawNotesSummary,
            summaryNotes: rawSummaryNotes,
            periodName,
          });

          // Bound the prompt BEFORE the provider call (size bound, not quota).
          const bounded = boundAITextWithMeta(prompt, MAX_AI_PROMPT_CHARS, 'characters');

          // P107M1T08: run the provider call under a bounded wall-clock timeout
          // with an optional cancellation signal, so a timeout / cancellation is
          // a DISTINCT terminal outcome (never a generic provider failure).
          const call = await runProviderCallBounded(
            (signal) => {
              providerCalls += 1;
              const providerOpts = { maxTokens: 800, temperature: 0.7, signal };
              return callAI(bounded.text, providerOpts);
            },
            { timeoutMs: providerTimeoutMs, signal: input.signal }
          );

          if (call.status === 'timeout') {
            return { evaluationId: ev.id, ok: false, outcome: 'timeout', error: 'AI hết thời gian phản hồi' };
          }
          if (call.status === 'canceled') {
            return { evaluationId: ev.id, ok: false, outcome: 'canceled', error: 'Yêu cầu soạn thông báo đã bị hủy' };
          }

          const message = call.value;
          if (message) {
            usableOutputs += 1;
            return { evaluationId: ev.id, message, ok: true, outcome: 'ok', payloadCoverage: bounded.coverageMeta };
          } else {
            return { evaluationId: ev.id, ok: false, error: 'AI không phản hồi', outcome: 'provider-failure' };
          }
        } catch (err) {
          return {
            evaluationId: ev.id,
            ok: false,
            outcome: 'error',
            error: toClientError(err, 'Lỗi tạo thông báo'),
          };
        }
      }
    );

    const nextOffset = offset + chunk.length;
    const done = nextOffset >= totalApproved;

    return {
      items,
      nextOffset,
      done,
      total: totalApproved,
      cost: { chunkRequests: 1, providerCalls, usableOutputs },
    };
  } catch (err: unknown) {
    return {
      error: toClientError(err, 'Lỗi xử lý tạo thông báo hàng loạt. Vui lòng thử lại.'),
    };
  }
}

/**
 * Soạn biên bản kết thúc kỳ đánh giá bằng AI (Manager-only).
 * Fetch: getDashboardData + detectAnomalies + getPeriodSummary + period info.
 * ẨN DANH HÓA: strip tên thật khỏi recentActivities và anomalies (chỉ giữ mã NV).
 */
export async function generatePeriodMinutesAction(input: {
  periodId: string;
}): Promise<{
  minutes?: string;
  periodName?: string;
  payloadCoverage?: AIPayloadCoverage;
  sourceSummaryCoverage?: AIPayloadCoverage;
  error?: string;
}> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!isAIConfigured()) return { error: AI_NOT_CONFIGURED };
  if (!input.periodId) return { error: 'Thiếu thông tin kỳ đánh giá.' };

  try {
    const [d, periodSummaryRes, users, periodRes] = await Promise.all([
      getDashboardData(input.periodId),
      getPeriodSummary(input.periodId),
      getUsersAdmin(auth.user),
      supabaseAdmin
        .from('evaluation_periods')
        .select('id, name, year, status')
        .eq('id', input.periodId)
        .maybeSingle(),
    ]);

    const periodData = periodRes.data;
    const periodName = periodData ? `${periodData.name} (${periodData.year})` : 'Kỳ đánh giá';

    if (!d) {
      return { error: 'Không tìm thấy dữ liệu đánh giá cho kỳ này.' };
    }

    const codeById = new Map(users.map((u) => [u.id, u.employeeCode || `NV-${u.id.slice(0, 6)}`]));
    // Anomalies are computed server-side (rule-based) and shipped as a minimized
    // DTO — no raw round payload is read here. Re-map to employee codes for the
    // anonymized minutes text (names never leave the server).
    const anomalies = (d.anomalies || []).map((anomaly) => ({
      ...anomaly,
      name: codeById.get(anomaly.employeeId) || anomaly.employeeId,
    }));

    // Ẩn danh hóa: Chỉ giữ mã NV, strip toàn bộ tên người
    const anomalyText = anomalies.length
      ? anomalies
          .slice(0, 5)
          .map(
            (a) =>
              `- Mã NV ${a.name}: Vòng ${a.prevRound} (${a.prevScore}đ) -> Vòng ${a.round} (${a.score}đ), chênh lệch ${a.diff} điểm (${a.severity === 'high' ? 'nghiêm trọng' : 'trung bình'})`
          )
          .join('\n')
      : 'Không ghi nhận bất thường đáng kể.';

    const statsText = `Tổng số nhân sự: ${d.stats.total}. Đã hoàn thành (Approved): ${d.stats.completed} (${d.stats.percent}%). Đang thực hiện: ${d.stats.inProgress}. Chưa bắt đầu: ${d.stats.notStarted}.`;

    const gradeText = (d.gradeDistribution || [])
      .map((g) => `${g.grade}: ${g.count}`)
      .join(', ');

    const teamText = (d.teamStatus || [])
      .map((t) => `${t.name}: ${t.progress}% (${t.membersCount} nhân sự)`)
      .join('; ');

    const recentText = (d.recentActivities || [])
      .map((a) => `- Đánh giá trạng thái ${a.status}, xếp loại ${a.grade || 'chưa có'}`)
      .join('\n');

    const summaryContent = periodSummaryRes.summary || 'Chưa có tóm tắt tổng hợp trước đó.';
    if (detectPromptInjection(summaryContent)) {
      return { error: 'Tóm tắt kỳ chứa nội dung không hợp lệ.' };
    }

    const prompt = `Bạn là thư ký/trợ lý nhân sự chuyên nghiệp của công ty. Hãy soạn BIÊN BẢN KẾT THÚC KỲ ĐÁNH GIÁ NĂNG LỰC QAQC (${periodName}).
Văn phong: Tiếng Việt, chính thức, trang trọng, cô đọng, khách quan (~250-350 từ).

DỮ LIỆU ĐÁNH GIÁ (Đã ẩn danh hóa):
- Kỳ đánh giá: ${periodName} (Trạng thái: ${periodData?.status || 'Active'})
- Thống kê tiến độ: ${statsText}
- Phân bổ xếp loại: ${gradeText || 'Chưa có dữ liệu'}
- Tiến độ theo nhóm: ${teamText || 'Chưa có dữ liệu'}
- Hoạt động gần đây:
${recentText || 'Không có'}
- Tóm tắt tổng hợp kỳ:
${summaryContent}
- Cảnh báo bất thường (chênh lệch điểm giữa các vòng):
${anomalyText}

CẤU TRÚC BIÊN BẢN (đầy đủ các phần rõ ràng):
1. TIÊU ĐỀ: BIÊN BẢN TỔNG KẾT KỲ ĐÁNH GIÁ NĂNG LỰC QAQC - ${periodName.toUpperCase()}
2. MỤC ĐÍCH & PHẠM VI: Nêu rõ mục đích tổng kết và phạm vi áp dụng (bộ phận QAQC).
3. TỔNG QUAN KẾT QUẢ: Nêu cụ thể số lượng nhân sự tham gia, tỷ lệ hoàn thành, bức tranh phân bổ xếp loại (S, A, B, C, D) và tiến độ các nhóm.
4. ĐIỂM NỔI BẬT & ĐÁNH GIÁ CHUNG: Đúc kết từ tóm tắt kỳ về năng lực, tinh thần kỷ luật và những mặt làm tốt.
5. VẤN ĐỀ TỒN TẠI & BẤT THƯỜNG: Nêu các vấn đề cần lưu ý (tiến độ chưa xong, chênh lệch điểm bất thường giữa các vòng nếu có).
6. KHUYẾN NGHỊ & KẾ HOẠCH KỲ TIẾP THEO: 2-3 kiến nghị cụ thể cho kỳ đánh giá tiếp theo (đào tạo, chuẩn hóa tiêu chí chấm, cải thiện tiến độ).

YÊU CẦU: Trình bày mạch lạc, có cấu trúc gạch đầu dòng rõ ràng, chuẩn phong cách biên bản hành chính doanh nghiệp.`;

    const bounded = boundAITextWithMeta(prompt, MAX_AI_PROMPT_CHARS, 'characters');
    const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'generatePeriodMinutes');
    if (!aiQuota.allowed) return { error: aiQuota.error };

    const minutes = await callAI(bounded.text, { maxTokens: 1200, temperature: 0.4 });
    if (!minutes) {
      return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
    }

    return {
      minutes,
      periodName,
      payloadCoverage: bounded.coverageMeta,
      sourceSummaryCoverage: periodSummaryRes.coverage,
    };
  } catch (err: unknown) {
    return { error: toClientError(err, 'Lỗi tạo biên bản kết thúc kỳ. Vui lòng thử lại.') };
  }
}
