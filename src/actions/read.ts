'use server';

import { requireAuth, requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Evaluation, Role, CriteriaGroup, User, Team, EvaluationPeriod } from '@/types';
import { 
  getEvaluationsAdmin, 
  getEvaluationsByPeriodAdmin, 
  getEvaluationSummariesAdmin,
  getEvaluationSummariesByPeriodAdmin,
  getEvaluationSummariesByEmployeeIdsAdmin,
  getEvaluationByIdAdmin, 
  getEvaluationByEmployeeAdmin, 
  getEvaluationHistoryByEmployeeAdmin 
} from '@/lib/db/evaluations-admin';
import { 
  getUsersAdmin, 
  getUsersBatchAdmin,
  UsersBatchOptions,
  UsersBatchResult,
  getUserByIdAdmin, 
  getUsersByTeamAdmin 
} from '@/lib/db/users-admin';
import { 
  getTeamsAdmin, 
  getTeamByIdAdmin 
} from '@/lib/db/teams-admin';
import { getCriteriaForRole, getAllCriteriaGroups } from '@/lib/db/criteria';
import { loadGradeBandsFromDb, getGradeBandsSync, GradeBands } from '@/lib/grade-bands';
import { getActivePeriod, getPeriods } from '@/lib/db/evaluations';

export type AuditRow = {
  id: string;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string | null;
};

/**
 * Đọc thông tin User đang đăng nhập (session hiện tại).
 * Bắt buộc requireAuth(). Trả null nếu chưa đăng nhập.
 */
export async function getCurrentUserAction(): Promise<User | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }
  return auth.user;
}

/**
 * Đọc danh sách users (phân quyền theo viewer: Manager xem tất cả, Employee/Leader/SubLeader theo team).
 * Bắt buộc requireAuth().
 */
export async function getUsersAction(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<User[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }
  return getUsersAdmin(auth.user, options);
}

/**
 * Đọc danh sách users theo lô (batch) 20 dòng.
 * Phân quyền theo requester: Manager xem tất cả, Employee/Leader/SubLeader theo team.
 * Bắt buộc requireAuth().
 */
export async function getUsersBatchAction(options?: UsersBatchOptions): Promise<UsersBatchResult> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
  }
  return getUsersBatchAdmin(auth.user, options);
}

export type EmployeesPageData = {
  teams: Team[];
  teamsError: string | null;
  users: UsersBatchResult;
  usersError: string | null;
  summaries: Record<string, Evaluation>;
  summariesError: string | null;
};

/**
 * Đọc dữ liệu tổng hợp cho trang /employees trong 1 server action duy nhất:
 * - teams (danh sách nhóm theo quyền viewer)
 * - users (danh sách nhân viên theo phân trang & bộ lọc)
 * - summaries (tóm tắt đánh giá theo kỳ của các nhân viên trong lô)
 *
 * Bắt buộc requireAuth() duy nhất 1 lần.
 * Trả về discriminated per-part error contract:
 * { teams, teamsError, users, usersError, summaries, summariesError }
 */
export async function getEmployeesPageDataAction(
  periodId?: string,
  options?: UsersBatchOptions
): Promise<EmployeesPageData> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    const err = auth.error ?? 'Chưa đăng nhập';
    return {
      teams: [],
      teamsError: err,
      users: { items: [], hasMore: false, totalCount: 0, subleaderMap: {} },
      usersError: err,
      summaries: {},
      summariesError: err,
    };
  }

  let teams: Team[] = [];
  let teamsError: string | null = null;
  let users: UsersBatchResult = { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
  let usersError: string | null = null;
  const summaries: Record<string, Evaluation> = {};
  let summariesError: string | null = null;

  const [teamsRes, usersRes] = await Promise.allSettled([
    getTeamsAdmin(auth.user),
    getUsersBatchAdmin(auth.user, options),
  ]);

  if (teamsRes.status === 'fulfilled') {
    teams = teamsRes.value;
  } else {
    console.error('getEmployeesPageDataAction teams error:', teamsRes.reason);
    teamsError = teamsRes.reason instanceof Error ? teamsRes.reason.message : 'Không thể tải danh sách nhóm.';
  }

  if (usersRes.status === 'fulfilled') {
    users = usersRes.value;
  } else {
    console.error('getEmployeesPageDataAction users error:', usersRes.reason);
    usersError = usersRes.reason instanceof Error ? usersRes.reason.message : 'Không thể tải danh sách nhân viên.';
  }

  if (periodId && users.items.length > 0) {
    try {
      const summaryList = await getEvaluationSummariesByEmployeeIdsAdmin(
        users.items.map((u) => u.id),
        periodId,
        auth.user
      );
      for (const ev of summaryList) {
        if (ev.employeeId) {
          summaries[ev.employeeId] = ev;
        }
      }
    } catch (err) {
      console.error('getEmployeesPageDataAction summaries error:', err);
      summariesError = err instanceof Error ? err.message : 'Không thể tải kết quả đánh giá.';
    }
  }

  return {
    teams,
    teamsError,
    users,
    usersError,
    summaries,
    summariesError,
  };
}

export type TeamsPageData = {
  users: User[];
  usersError: string | null;
  teams: Team[];
  teamsError: string | null;
  evaluations: Evaluation[];
  evalsError: string | null;
};

/**
 * Đọc dữ liệu tổng hợp cho trang /teams trong 1 server action duy nhất:
 * - users (danh sách người dùng theo quyền viewer)
 * - teams (danh sách nhóm theo quyền viewer)
 * - evaluations (danh sách đánh giá theo kỳ hiện tại nếu periodId được cung cấp)
 *
 * Bắt buộc requireAuth() duy nhất 1 lần.
 * Trả về discriminated per-part error contract:
 * { users, usersError, teams, teamsError, evaluations, evalsError }
 */
export async function getTeamsPageDataAction(
  periodId?: string
): Promise<TeamsPageData> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    const err = auth.error ?? 'Chưa đăng nhập';
    return {
      users: [],
      usersError: err,
      teams: [],
      teamsError: err,
      evaluations: [],
      evalsError: err,
    };
  }

  let users: User[] = [];
  let usersError: string | null = null;
  let teams: Team[] = [];
  let teamsError: string | null = null;
  let evaluations: Evaluation[] = [];
  let evalsError: string | null = null;

  if (periodId) {
    const [usersRes, teamsRes, evalsRes] = await Promise.allSettled([
      getUsersAdmin(auth.user),
      getTeamsAdmin(auth.user),
      getEvaluationsByPeriodAdmin(periodId, auth.user),
    ]);

    if (usersRes.status === 'fulfilled') {
      users = usersRes.value;
    } else {
      console.error('getTeamsPageDataAction users error:', usersRes.reason);
      usersError = usersRes.reason instanceof Error ? usersRes.reason.message : 'Không thể tải danh sách nhân viên.';
    }

    if (teamsRes.status === 'fulfilled') {
      teams = teamsRes.value;
    } else {
      console.error('getTeamsPageDataAction teams error:', teamsRes.reason);
      teamsError = teamsRes.reason instanceof Error ? teamsRes.reason.message : 'Không thể tải danh sách nhóm.';
    }

    if (evalsRes.status === 'fulfilled') {
      evaluations = evalsRes.value;
    } else {
      console.error('getTeamsPageDataAction evaluations error:', evalsRes.reason);
      evalsError = evalsRes.reason instanceof Error ? evalsRes.reason.message : 'Không thể tải danh sách đánh giá.';
    }
  } else {
    const [usersRes, teamsRes] = await Promise.allSettled([
      getUsersAdmin(auth.user),
      getTeamsAdmin(auth.user),
    ]);

    if (usersRes.status === 'fulfilled') {
      users = usersRes.value;
    } else {
      console.error('getTeamsPageDataAction users error:', usersRes.reason);
      usersError = usersRes.reason instanceof Error ? usersRes.reason.message : 'Không thể tải danh sách nhân viên.';
    }

    if (teamsRes.status === 'fulfilled') {
      teams = teamsRes.value;
    } else {
      console.error('getTeamsPageDataAction teams error:', teamsRes.reason);
      teamsError = teamsRes.reason instanceof Error ? teamsRes.reason.message : 'Không thể tải danh sách nhóm.';
    }
  }

  return {
    users,
    usersError,
    teams,
    teamsError,
    evaluations,
    evalsError,
  };
}

export type EvaluationPageData = {
  employee: User | null;
  employeeError: string | null;
  evaluation: Evaluation | null;
  evaluationError: string | null;
  periods: EvaluationPeriod[];
  periodsError: string | null;
};

/**
 * Đọc dữ liệu tổng hợp cho trang /evaluations/[id] trong 1 server action duy nhất:
 * - employee (thông tin nhân viên theo ID)
 * - evaluation (phiếu đánh giá theo kỳ hoặc kỳ active)
 * - periods (danh sách các kỳ đánh giá)
 *
 * Bắt buộc requireAuth() duy nhất 1 lần.
 * Trả về discriminated per-part error contract:
 * { employee, employeeError, evaluation, evaluationError, periods, periodsError }
 */
export async function getEvaluationPageDataAction(
  employeeId: string,
  periodId?: string
): Promise<EvaluationPageData> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    const err = auth.error ?? 'Chưa đăng nhập';
    return {
      employee: null,
      employeeError: err,
      evaluation: null,
      evaluationError: err,
      periods: [],
      periodsError: err,
    };
  }

  let employee: User | null = null;
  let employeeError: string | null = null;
  let evaluation: Evaluation | null = null;
  let evaluationError: string | null = null;
  let periods: EvaluationPeriod[] = [];
  let periodsError: string | null = null;

  const [employeeRes, evalRes, periodsRes] = await Promise.allSettled([
    getUserByIdAdmin(employeeId, auth.user),
    getEvaluationByEmployeeAdmin(employeeId, periodId, auth.user),
    getPeriods(),
  ]);

  if (employeeRes.status === 'fulfilled') {
    employee = employeeRes.value;
  } else {
    console.error('getEvaluationPageDataAction employee error:', employeeRes.reason);
    employeeError = employeeRes.reason instanceof Error ? employeeRes.reason.message : 'Không thể tải thông tin nhân viên.';
  }

  if (evalRes.status === 'fulfilled') {
    evaluation = evalRes.value;
  } else {
    console.error('getEvaluationPageDataAction evaluation error:', evalRes.reason);
    evaluationError = evalRes.reason instanceof Error ? evalRes.reason.message : 'Không thể tải dữ liệu đánh giá.';
  }

  if (periodsRes.status === 'fulfilled') {
    periods = periodsRes.value;
  } else {
    console.error('getEvaluationPageDataAction periods error:', periodsRes.reason);
    periodsError = periodsRes.reason instanceof Error ? periodsRes.reason.message : 'Không thể tải danh sách kỳ đánh giá.';
  }

  return {
    employee,
    employeeError,
    evaluation,
    evaluationError,
    periods,
    periodsError,
  };
}

export type EvaluationComparePageData = {
  employee: User | null;
  employeeError: string | null;
  evaluation: Evaluation | null;
  evaluationError: string | null;
  users: User[];
  usersError: string | null;
  groups: CriteriaGroup[];
  groupsError: string | null;
};

/**
 * Đọc dữ liệu tổng hợp cho trang /evaluations/[id]/compare trong 1 server action duy nhất:
 * - employee (thông tin nhân viên theo ID)
 * - evaluation (phiếu đánh giá theo kỳ hoặc kỳ active)
 * - users (danh sách người dùng theo quyền viewer)
 * - groups (danh sách nhóm tiêu chí)
 *
 * Bắt buộc requireAuth() duy nhất 1 lần.
 * Trả về discriminated per-part error contract:
 * { employee, employeeError, evaluation, evaluationError, users, usersError, groups, groupsError }
 */
export async function getEvaluationComparePageDataAction(
  employeeId: string,
  periodId?: string
): Promise<EvaluationComparePageData> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    const err = auth.error ?? 'Chưa đăng nhập';
    return {
      employee: null,
      employeeError: err,
      evaluation: null,
      evaluationError: err,
      users: [],
      usersError: err,
      groups: [],
      groupsError: err,
    };
  }

  let employee: User | null = null;
  let employeeError: string | null = null;
  let evaluation: Evaluation | null = null;
  let evaluationError: string | null = null;
  let users: User[] = [];
  let usersError: string | null = null;
  let groups: CriteriaGroup[] = [];
  let groupsError: string | null = null;

  const [employeeRes, evalRes, usersRes, groupsRes] = await Promise.allSettled([
    getUserByIdAdmin(employeeId, auth.user),
    getEvaluationByEmployeeAdmin(employeeId, periodId, auth.user),
    getUsersAdmin(auth.user),
    getAllCriteriaGroups(),
  ]);

  if (employeeRes.status === 'fulfilled') {
    employee = employeeRes.value;
  } else {
    console.error('getEvaluationComparePageDataAction employee error:', employeeRes.reason);
    employeeError = employeeRes.reason instanceof Error ? employeeRes.reason.message : 'Không thể tải thông tin nhân viên.';
  }

  if (evalRes.status === 'fulfilled') {
    evaluation = evalRes.value;
  } else {
    console.error('getEvaluationComparePageDataAction evaluation error:', evalRes.reason);
    evaluationError = evalRes.reason instanceof Error ? evalRes.reason.message : 'Không thể tải dữ liệu đánh giá.';
  }

  if (usersRes.status === 'fulfilled') {
    users = usersRes.value;
  } else {
    console.error('getEvaluationComparePageDataAction users error:', usersRes.reason);
    usersError = usersRes.reason instanceof Error ? usersRes.reason.message : 'Không thể tải danh sách nhân viên.';
  }

  if (groupsRes.status === 'fulfilled') {
    groups = groupsRes.value;
  } else {
    console.error('getEvaluationComparePageDataAction groups error:', groupsRes.reason);
    groupsError = groupsRes.reason instanceof Error ? groupsRes.reason.message : 'Không thể tải nhóm tiêu chí.';
  }

  return {
    employee,
    employeeError,
    evaluation,
    evaluationError,
    users,
    usersError,
    groups,
    groupsError,
  };
}


/**
 * Đọc thông tin user theo ID.
 * Bắt buộc requireAuth().
 */
export async function getUserByIdAction(id: string): Promise<User | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }
  return getUserByIdAdmin(id, auth.user);
}

/**
 * Đọc danh sách users thuộc một Team.
 * Bắt buộc requireAuth() + phân quyền: Manager mọi team; khác chỉ team mình.
 */
export async function getUsersByTeamAction(teamId: string): Promise<User[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }
  return getUsersByTeamAdmin(teamId, auth.user);
}

/**
 * Đọc danh sách teams (phân quyền theo viewer).
 * Bắt buộc requireAuth().
 */
export async function getTeamsAction(): Promise<Team[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }
  return getTeamsAdmin(auth.user);
}

/**
 * Đọc thông tin team theo ID.
 * Bắt buộc requireAuth().
 */
export async function getTeamByIdAction(id: string): Promise<Team | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }
  return getTeamByIdAdmin(id, auth.user);
}

/**
 * Đọc danh sách evaluations theo kỳ hoặc toàn bộ (phân quyền theo viewer).
 * Bắt buộc requireAuth() — chỉ trả evaluations viewer được phép xem.
 */
export async function getEvaluationsAction(
  periodId?: string,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  if (periodId) {
    return getEvaluationsByPeriodAdmin(periodId, auth.user, opts);
  }
  return getEvaluationsAdmin(auth.user, opts);
}

/**
 * Đọc danh sách tóm tắt evaluations theo kỳ hoặc toàn bộ (phân quyền theo viewer).
 * Dùng summary projection (không tải scores/notes nặng) để tối ưu danh sách nhân viên.
 * Bắt buộc requireAuth() — chỉ trả evaluations viewer được phép xem.
 */
export async function getEvaluationSummariesAction(
  periodId?: string,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  if (periodId) {
    return getEvaluationSummariesByPeriodAdmin(periodId, auth.user, opts);
  }
  return getEvaluationSummariesAdmin(auth.user, opts);
}

/**
 * Đọc danh sách tóm tắt evaluations theo lô employee IDs (1..20 UUIDs).
 * Dùng summary projection (không tải scores/notes nặng).
 * Bắt buộc requireAuth() — phân quyền chặt chẽ theo viewer.
 */
export async function getEvaluationSummariesBatchAction(
  employeeIds: string[],
  periodId?: string
): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null || !auth.user) {
    return [];
  }
  return getEvaluationSummariesByEmployeeIdsAdmin(employeeIds, periodId, auth.user);
}


/**
 * Đọc chi tiết một evaluation theo ID.
 * Bắt buộc requireAuth() + canViewEvaluation.
 */
export async function getEvaluationByIdAction(id: string): Promise<Evaluation | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }

  return getEvaluationByIdAdmin(id, auth.user);
}

/**
 * Đọc evaluation của một nhân viên theo kỳ (hoặc kỳ đang mở).
 * Bắt buộc requireAuth() + canViewEvaluation.
 */
export async function getEvaluationByEmployeeAction(
  employeeId: string,
  periodId?: string
): Promise<Evaluation | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }

  const effectivePeriodId = periodId ?? (await getActivePeriod())?.id;
  if (!effectivePeriodId) {
    return null;
  }

  return getEvaluationByEmployeeAdmin(employeeId, effectivePeriodId, auth.user);
}

/**
 * Đọc lịch sử đánh giá các kỳ trước (status = Approved) của nhân viên.
 * Bắt buộc requireAuth() + chỉ Manager hoặc chính nhân viên đó mới được xem.
 */
export async function getEvaluationHistoryAction(employeeId: string): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  return getEvaluationHistoryByEmployeeAdmin(employeeId, auth.user);
}

/**
 * Đọc nhật ký kiểm toán (audit_logs).
 * Bắt buộc requireRole(['Manager']) — chỉ Manager mới có quyền xem.
 */
export async function getAuditLogsAction(opts?: {
  limit?: number;
}): Promise<{ logs: AuditRow[]; error: string | null }> {
  const auth = await requireRole(['Manager']);
  if (auth.error !== null) {
    return { logs: [], error: auth.error };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('id, actor_name, action, entity, entity_id, created_at')
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 50);

    if (error) {
      console.error('getAuditLogsAction error:', error.message);
      return { logs: [], error: 'Không thể tải nhật ký hoạt động.' };
    }

    return { logs: (data || []) as AuditRow[], error: null };
  } catch (err) {
    console.error('getAuditLogsAction exception:', err);
    return { logs: [], error: 'Lỗi hệ thống khi tải nhật ký.' };
  }
}

/**
 * Đọc thang điểm từ DB (supabaseAdmin).
 * Bắt buộc requireAuth().
 */
export async function getGradeBandsAction(): Promise<GradeBands> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return getGradeBandsSync();
  }

  return loadGradeBandsFromDb(supabaseAdmin);
}

/**
 * Đọc nhóm tiêu chí áp dụng cho một Role cụ thể.
 * Bắt buộc requireAuth().
 */
export async function getCriteriaForRoleAction(role: Role): Promise<CriteriaGroup[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  return getCriteriaForRole(role);
}
