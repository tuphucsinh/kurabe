import { User, EvaluationRound, Grade, CriteriaGroup } from '@/types';
import { calculateGrade, getGradeColor } from '@/lib/scoring';

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
}

export default function EvaluationHeader({
  employee,
  isLeader,
  allPreviousRounds,
  grade,
  totalScore,
  scoredCount,
  totalCriteria,
  currentRound
}: EvaluationHeaderProps) {
  const gradeStyles = getGradeColor(grade);
  const gradeColorClass = gradeStyles.split(' ')[0];
  const gradeBgClass = gradeStyles.split(' ').slice(1).join(' ');

  return (
    <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row">
        {/* Left: Employee Info */}
        <div className="flex-1 p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">{employee.name}</h1>
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isLeader ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
              {employee.role}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-8 md:gap-16 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-outline">Mã NV:</span>
              <span className="font-bold text-on-surface">{employee.employeeCode}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-outline">Bộ phận:</span>
              <span className="font-bold text-on-surface">QAQC Line 1</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-outline">Ngày vào làm:</span>
              <span className="font-bold text-on-surface">{employee.joinDate || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Right: Score Panel */}
        <div className={`flex items-center justify-center px-6 py-6 md:py-4 border-t md:border-t-0 md:border-l border-outline-variant/50 ${gradeBgClass}`}>
          <table className="border-collapse text-center">
            <thead>
              <tr>
                <th className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-black/40 w-[30px]"></th>
                <th className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-black/40">Xếp loại</th>
                <th className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-black/40">Tổng điểm</th>
                <th className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-black/40">Tiêu chí</th>
              </tr>
            </thead>
            <tbody>
              {/* Current Round */}
              <tr>
                <td className="px-2 py-1 text-[10px] font-bold text-black/45 uppercase">L{currentRound}</td>
                <td className="px-3 py-1">
                  <span className={`${gradeColorClass} text-2xl font-black`}>{grade}</span>
                </td>
                <td className="px-3 py-1">
                  <span className={`${gradeColorClass} text-2xl font-black`}>{totalScore}</span>
                </td>
                <td className="px-3 py-1">
                  <span className={`${gradeColorClass} text-2xl font-black`}>
                    {scoredCount}
                    <span className="text-sm font-medium text-black/30">/{totalCriteria}</span>
                  </span>
                </td>
              </tr>
              {/* Previous Rounds */}
              {allPreviousRounds.map(r => {
                const rScore = Object.values(r.scores).reduce((sum: number, s: number) => sum + s, 0);
                const rGrade = calculateGrade(rScore, isLeader);
                const rScoredCount = Object.keys(r.scores).length;
                const gradeClasses = getGradeColor(rGrade);
                const rGradeColorClass = gradeClasses.split(' ')[0];
                
                return (
                  <tr key={r.round} className="opacity-50">
                    <td className="px-2 py-0.5 text-[10px] font-bold text-[#999] uppercase">L{r.round}</td>
                    <td className="px-3 py-0.5">
                      <span className={`${rGradeColorClass} text-sm font-black`}>{rGrade}</span>
                    </td>
                    <td className="px-3 py-0.5">
                      <span className={`${rGradeColorClass} text-sm font-black`}>{rScore}</span>
                    </td>
                    <td className="px-3 py-0.5">
                      <span className={`${rGradeColorClass} text-sm font-black`}>
                        {rScoredCount}
                        <span className="text-[10px] font-normal text-black/30">/{totalCriteria}</span>
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
