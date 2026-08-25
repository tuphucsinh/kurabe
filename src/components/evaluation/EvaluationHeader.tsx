import { User, EvaluationRound, Grade, CriteriaGroup } from '@/types';
import { getGradeFromScore, getGradeColor } from '@/lib/scoring';
import { GradeBands } from '@/lib/grade-bands';

interface EvaluationHeaderProps {
  employee: User;
  isLeader: boolean;
  scores: Record<string, number>;
  criteriaGroups: CriteriaGroup[];
  allPreviousRounds: EvaluationRound[];
  grade: Grade;
  totalScore: number;
  scoredCount: number;
  totalCriteria: number;
  currentRound: number;
  gradeBands?: GradeBands;
}

export default function EvaluationHeader({
  employee,
  isLeader,
  allPreviousRounds,
  grade,
  totalScore,
  scoredCount,
  totalCriteria,
  currentRound,
  gradeBands,
}: EvaluationHeaderProps) {
  const gradeStyles = getGradeColor(grade);
  const gradeColorClass = gradeStyles.split(' ')[0];
  const gradeBgClass = gradeStyles.split(' ').slice(1).join(' ');

  return (
    <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm max-md:shadow-2xs overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Left: Employee Info */}
        <div className="flex-1 p-6 md:p-8 space-y-4 max-md:p-3.5 max-md:space-y-2 xl:p-5 xl:space-y-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl max-md:text-lg font-bold text-ink tracking-tight">{employee.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${isLeader ? 'bg-amber-100 text-amber-800' : 'bg-brand-soft text-brand'}`}>
              {employee.role}
            </span>
          </div>
          <div className="max-md:hidden flex flex-wrap items-center gap-8 md:gap-16 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-ink-muted">Mã NV:</span>
              <span className="font-semibold text-ink">{employee.employeeCode}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-ink-muted">Bộ phận:</span>
              <span className="font-semibold text-ink">QAQC Line 1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-ink-muted">Ngày vào làm:</span>
              <span className="font-semibold text-ink">{employee.joinDate || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Right: Score Panel */}
        <div className={`flex items-center justify-center px-6 py-6 md:py-4 max-md:px-4 max-md:py-3 xl:py-2 border-t md:border-t-0 md:border-l border-outline-soft/60 ${gradeBgClass}`}>
          <table className="border-collapse text-center">
            <thead>
              <tr>
                <th className="px-2 pb-1 xl:pb-0 max-md:px-1.5 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80 w-[32px]"></th>
                <th className="px-3 pb-1 xl:pb-0 max-md:px-2 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80">Xếp loại</th>
                <th className="px-3 pb-1 xl:pb-0 max-md:px-2 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80">Tổng điểm</th>
                <th className="px-3 pb-1 xl:pb-0 max-md:px-2 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80">Tiêu chí</th>
              </tr>
            </thead>
            <tbody>
              {/* Current Round */}
              <tr>
                <td className="px-2 py-1 xl:py-0.5 max-md:px-1.5 max-md:py-0.5 text-xs font-bold text-ink-muted uppercase">L{currentRound}</td>
                <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                  <span className={`${gradeColorClass} text-2xl max-md:text-xl font-black`}>{grade}</span>
                </td>
                <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                  <span className={`${gradeColorClass} text-2xl max-md:text-xl font-black`}>{totalScore}</span>
                </td>
                <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                  <span className={`${gradeColorClass} text-2xl max-md:text-xl font-black`}>
                    {scoredCount}
                    <span className="text-sm max-md:text-xs font-semibold text-ink-muted/70">/{totalCriteria}</span>
                  </span>
                </td>
              </tr>
              {/* Previous Rounds */}
              {allPreviousRounds.map(r => {
                const rScore = Object.values(r.scores).reduce((sum: number, s: number) => sum + s, 0);
                const rGrade = getGradeFromScore(rScore, employee.role, gradeBands);
                const rScoredCount = Object.keys(r.scores).length;
                const gradeClasses = getGradeColor(rGrade);
                const rGradeColorClass = gradeClasses.split(' ')[0];
                
                return (
                  <tr key={r.round} className="opacity-65">
                    <td className="px-2 py-1 xl:py-0.5 max-md:px-1.5 max-md:py-0.5 text-[11px] font-bold text-ink-muted uppercase">L{r.round}</td>
                    <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                      <span className={`${rGradeColorClass} text-sm max-md:text-xs font-bold`}>{rGrade}</span>
                    </td>
                    <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                      <span className={`${rGradeColorClass} text-sm max-md:text-xs font-bold`}>{rScore}</span>
                    </td>
                    <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                      <span className={`${rGradeColorClass} text-sm max-md:text-xs font-bold`}>
                        {rScoredCount}
                        <span className="text-xs max-md:text-[10px] font-medium text-ink-muted/60">/{totalCriteria}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
