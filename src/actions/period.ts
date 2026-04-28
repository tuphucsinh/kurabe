'use server';

import { db, EvaluationPeriod, Evaluation } from '@/data/mock';
import { revalidatePath } from 'next/cache';

/**
 * Manager khởi tạo kỳ đánh giá mới cho tất cả nhân viên.
 */
export async function initializeEvaluationPeriod(managerId: string, year: number, name: string) {
  const manager = db.users.find(u => u.id === managerId);
  if (!manager || manager.role !== 'Manager') {
    return { success: false, error: 'Chỉ Manager mới có quyền khởi tạo kỳ đánh giá.' };
  }

  // 1. Tạo period mới
  const periodId = `p-${Date.now()}`;
  const period: EvaluationPeriod = {
    id: periodId,
    year,
    name,
    status: 'Active',
    createdBy: managerId,
    createdAt: new Date().toISOString()
  };

  db.periods.push(period);

  // 2. Tạo Evaluation cho từng user
  db.users.forEach(user => {
    // Round 1 logic:
    // - Employee: evaluator = SubLeader cùng team (người đầu tiên tìm thấy)
    // - Các role khác: evaluator = self (tự đánh giá)
    let evaluatorId = user.id;
    let evaluatorRole = user.role;

    if (user.role === 'Employee') {
      const subLeader = db.users.find(u => u.role === 'SubLeader' && u.teamId === user.teamId);
      if (subLeader) {
        evaluatorId = subLeader.id;
        evaluatorRole = subLeader.role;
      }
    }

    const evaluation: Evaluation = {
      id: `e-${user.id}-${Date.now()}`,
      periodId: periodId,
      employeeId: user.id,
      employeeRole: user.role,
      teamId: user.teamId,
      rounds: [
        {
          round: 1,
          evaluatorId,
          evaluatorRole,
          scores: {},
          totalScore: 0,
          grade: 'Pending',
          createdAt: new Date().toISOString()
        }
      ],
      currentRound: 1,
      status: 'NotStarted',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.evaluations.push(evaluation);
  });

  revalidatePath('/evaluations');
  revalidatePath('/dashboard');

  return { success: true, periodId };
}
