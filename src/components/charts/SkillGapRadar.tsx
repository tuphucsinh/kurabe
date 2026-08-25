import React, { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Evaluation, CriteriaGroup } from '@/types';

interface SkillGapRadarProps {
  evaluations: Evaluation[];
  criteriaGroups: CriteriaGroup[];
}

export function SkillGapRadar({ evaluations, criteriaGroups }: SkillGapRadarProps) {
  const data = useMemo(() => {
    if (!evaluations.length || !criteriaGroups.length) return [];

    return criteriaGroups.map(group => {
      let totalSelfPercentage = 0;
      let totalManagerPercentage = 0;
      let count = 0;

      evaluations.forEach(ev => {
        if (ev.rounds.length === 0) return;
        
        // Tìm round tự đánh giá và quản lý đánh giá
        const selfRound = ev.rounds.find(r => r.evaluatorId === ev.employeeId);
        const managerRounds = ev.rounds.filter(r => r.evaluatorId !== ev.employeeId);
        const managerRound = managerRounds.length > 0 ? managerRounds[managerRounds.length - 1] : null;

        if (selfRound && managerRound && Object.keys(managerRound.scores).length > 0) {
          let selfGroupScore = 0;
          let managerGroupScore = 0;
          let maxApplicableScore = 0;

          group.criteria.forEach(c => {
            const mScore = managerRound.scores[c.id];
            const sScore = selfRound.scores[c.id];
            
            // Chỉ tính những tiêu chí mà Manager có chấm điểm
            if (mScore !== undefined) {
              const maxLevel = Math.max(...c.levels.map(l => l.points), 1);
              maxApplicableScore += maxLevel;
              managerGroupScore += mScore;
              selfGroupScore += sScore || 0;
            }
          });

          if (maxApplicableScore > 0) {
            totalSelfPercentage += (selfGroupScore / maxApplicableScore) * 100;
            totalManagerPercentage += (managerGroupScore / maxApplicableScore) * 100;
            count++;
          }
        }
      });

      return {
        subject: group.shortName || group.name,
        Self: count > 0 ? Math.round(totalSelfPercentage / count) : 0,
        Manager: count > 0 ? Math.round(totalManagerPercentage / count) : 0,
        fullMark: 100,
      };
    });
  }, [evaluations, criteriaGroups]);

  if (data.length === 0 || data.every(d => d.Self === 0 && d.Manager === 0)) {
    return (
      <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col items-center justify-center h-full min-h-[300px]">
        <h3 className="text-lg font-semibold text-ink mb-2 self-start w-full">Skill Gap Analysis</h3>
        <p className="text-ink-muted mt-10">Chưa đủ dữ liệu đánh giá 2 chiều.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col h-full">
      <h3 className="text-lg font-semibold text-ink mb-2">Skill Gap Analysis</h3>
      <p className="text-sm text-ink-muted mb-6">Khoảng cách kỹ năng: Tự đánh giá vs Quản lý (%)</p>
      <div className="flex-1 w-full min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
            <PolarGrid stroke="#D9E1E6" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#5F6B73', fontSize: 11, fontWeight: 500 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#AEB8BF', fontSize: 10 }} />
            <Radar name="Tự đánh giá" dataKey="Self" stroke="#AEB8BF" fill="#EEF3F6" fillOpacity={0.5} />
            <Radar name="Quản lý" dataKey="Manager" stroke="#6366f1" fill="#818cf8" fillOpacity={0.6} />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              itemStyle={{ fontSize: '13px', fontWeight: 500 }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
