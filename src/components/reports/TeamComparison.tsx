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
      className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-on-surface">So sánh nhóm</h3>
        <span className="text-xs font-medium text-outline bg-surface-container px-2 py-1 rounded-full uppercase tracking-wider">
          Average Score
        </span>
      </div>

      {sortedTeams.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-outline text-xs italic">
          Chưa có dữ liệu so sánh nhóm
        </div>
      ) : (
        <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {sortedTeams.map((team, index) => (
            <div key={team.id} className="group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-outline-variant w-4">
                    {index + 1}.
                  </span>
                  <span className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">
                    {team.name}
                  </span>
                </div>
                <span className="text-sm font-bold text-on-surface">
                  {team.avgScore.toFixed(1)}
                </span>
              </div>

              <div className="relative h-2.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-1000 ease-out group-hover:from-primary group-hover:to-primary"
                  style={{ width: `${Math.min(team.progress, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-outline-variant border-dashed">
        <p className="text-xs text-outline leading-relaxed italic">
          * Điểm trung bình được tính dựa trên các tiêu chí QAQC trong kỳ đánh giá hiện tại.
        </p>
      </div>
    </div>
  );
}
