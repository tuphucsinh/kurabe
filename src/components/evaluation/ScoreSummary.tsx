
import { calculateGrade, getGradeColor } from '@/lib/scoring';
import { TrendingUp, AlertCircle } from 'lucide-react';

interface ScoreSummaryProps {
  scores: Record<string, number>;
  isLeader: boolean;
  onSave: (status: 'Draft' | 'Submitted') => void;
  isSaving?: boolean;
}

export default function ScoreSummary({ scores, isLeader }: ScoreSummaryProps) {
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const grade = calculateGrade(totalScore, isLeader);
  const gradeStyles = getGradeColor(grade);

  // Simple progress to 200 points (just for visual effect)
  const progress = Math.min(Math.max((totalScore / 200) * 100, 0), 100);

  const missingScores = 0; // In a real app, we'd count unanswered mandatory criteria

  return (
    <div className="bg-white rounded-3xl border border-outline-variant shadow-xl overflow-hidden md:sticky md:top-8">
      {/* Grade Header */}
      <div className={`p-8 text-center border-b border-outline-variant transition-colors duration-500 ${gradeStyles.split(' ').slice(1).join(' ')}`}>
        <span className="text-xs font-bold uppercase tracking-widest opacity-70 mb-2 block">Xếp loại dự kiến</span>
        <div className={`text-7xl font-black mb-2 transition-transform duration-500 hover:scale-110 cursor-default ${gradeStyles.split(' ')[0]}`}>
          {grade}
        </div>
        <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white/50 text-sm font-bold ${gradeStyles.split(' ')[0]}`}>
          <TrendingUp size={16} />
          {totalScore} điểm
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Progress Bar */}
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-on-surface-variant">Tiến độ điểm số</span>
            <span className="font-bold text-on-surface">{totalScore} / 200</span>
          </div>
          <div className="h-3 bg-surface rounded-full overflow-hidden border border-outline-variant p-0.5">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)]"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-surface rounded-2xl border border-outline-variant text-center">
            <div className="text-xs text-outline font-bold uppercase mb-1">Tiêu chí</div>
            <div className="text-xl font-bold text-on-surface">{Object.keys(scores).length}</div>
          </div>
          <div className="p-4 bg-surface rounded-2xl border border-outline-variant text-center">
            <div className="text-xs text-outline font-bold uppercase mb-1">Chưa chấm</div>
            <div className="text-xl font-bold text-red-500">{missingScores}</div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100 text-amber-800 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <p>Dữ liệu sẽ được gửi tới Ban Giám Đốc để phê duyệt sau khi bạn nhấn &quot;Gửi Đánh giá&quot;.</p>
        </div>
      </div>
    </div>
  );
}
