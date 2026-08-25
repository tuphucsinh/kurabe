import React from 'react';

interface TeamStat {
  id: string;
  name: string;
  avgScore: number;
  progress: number; // percentage relative to max score
}

interface TeamComparisonProps {
  teams: TeamStat[];
}

export default function TeamComparison({ teams = [] }: TeamComparisonProps) {
  // Sort teams by avgScore descending
  const sortedTeams = [...(teams || [])].sort((a, b) => b.avgScore - a.avgScore);

  return (
    <div
      data-load-layer="heavy"
      className="bg-surface-raised p-6 rounded-3xl border border-outline-soft shadow-sm h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-ink">So sánh nhóm</h3>
        <span className="text-xs font-medium text-ink-muted bg-surface-muted px-2 py-1 rounded-full uppercase tracking-wider">
          Average Score
        </span>
      </div>

      {sortedTeams.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-ink-muted text-xs italic">
          Chưa có dữ liệu so sánh nhóm
        </div>
      ) : (
        <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {sortedTeams.map((team, index) => (
            <div key={team.id} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-outline-soft w-4">
                    {index + 1}.
                  </span>
                  <span className="text-sm font-semibold text-ink group-hover:text-brand transition-colors">
                    {team.name}
                  </span>
                </div>
                <span className="text-sm font-bold text-ink">
                  {team.avgScore.toFixed(1)}
                </span>
              </div>

              <div className="relative h-2.5 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-brand/60 to-brand transition-all duration-1000 ease-out group-hover:from-brand group-hover:to-brand"
                  style={{ width: `${Math.min(team.progress, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-outline-soft border-dashed">
        <p className="text-xs text-ink-muted leading-relaxed italic">
          * Điểm trung bình được tính dựa trên các tiêu chí QAQC trong kỳ đánh giá hiện tại.
        </p>
      </div>
    </div>
  );
}
