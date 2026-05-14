'use client';

import * as XLSX from 'xlsx';
import { getEvaluationsByPeriod, mapPeriodFromDb } from './db/evaluations';
import { getUsers } from './db/users';
import { getTeams } from './db/teams';
import { getAllCriteriaGroups } from './db/criteria';
import { User, Team } from '@/types';
import { supabase } from './supabase';

/**
 * Xuất dữ liệu đánh giá của một kỳ ra file Excel.
 */
export async function exportEvaluationsToExcel(
  periodId: string,
  options: { includeRoundDetails?: boolean } = {}
): Promise<void> {
  try {
    // 1. Fetch data
    const [evaluations, users, teams, criteriaGroups, periodData] = await Promise.all([
      getEvaluationsByPeriod(periodId),
      getUsers(),
      getTeams(),
      getAllCriteriaGroups(),
      supabase.from('evaluation_periods').select('*').eq('id', periodId).single()
    ]);

    const period = periodData.data ? mapPeriodFromDb(periodData.data) : null;
    const periodName = period ? period.name : 'KyDanhGia';

    const userMap = new Map<string, User>(users.map(u => [u.id, u]));
    const teamMap = new Map<string, Team>(teams.map(t => [t.id, t]));
    
    // Flatten criteria for column mapping
    const allCriteria = criteriaGroups.flatMap(g => g.criteria);


    // 2. Prepare Sheet 1: Summary
    const summaryData = evaluations.map(ev => {
      const employee = userMap.get(ev.employeeId);
      const team = ev.teamId ? teamMap.get(ev.teamId) : null;
      
      return {
        'Mã Nhân Viên': employee?.employeeCode || '',
        'Họ Tên': employee?.name || '',
        'Team': team?.name || '',
        'Chức Vụ': ev.employeeRole,
        'Trạng Thái': ev.status,
        'Điểm Tổng': ev.finalScore || '',
        'Xếp Loại': ev.finalGrade || ''
      };
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Tổng Hợp');

    // 3. Prepare Sheet 2: Chi tiết Round (Optional)
    if (options.includeRoundDetails) {
      const detailData: Record<string, string | number>[] = [];
      
      evaluations.forEach(ev => {
        const employee = userMap.get(ev.employeeId);
        
        ev.rounds.forEach(round => {
          const row: Record<string, string | number> = {
            'Mã Nhân Viên': employee?.employeeCode || '',
            'Họ Tên': employee?.name || '',
            'Vòng': round.round,
            'Người Đánh Giá': userMap.get(round.evaluatorId)?.name || 'N/A',
            'Vai Trò ĐG': round.evaluatorRole,
            'Điểm Vòng': round.totalScore,
            'Xếp Loại Vòng': round.grade,
            'Nhận Xét': round.comment || ''
          };

          // Thêm điểm chi tiết từng tiêu chí
          allCriteria.forEach(c => {
            row[c.name] = round.scores[c.id] || 0;
          });

          detailData.push(row);
        });
      });

      const wsDetail = XLSX.utils.json_to_sheet(detailData);
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Chi Tiết Vòng');
    }

    // 4. Trigger Download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `Kurabe_${periodName.replace(/\s+/g, '_')}_${timestamp}.xlsx`;
    XLSX.writeFile(wb, fileName);

  } catch (error) {
    console.error('Lỗi khi xuất file Excel:', error);
    throw error;
  }
}
