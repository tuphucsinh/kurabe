
import { Criterion } from '@/data/criteria';
import { Info } from 'lucide-react';

interface CriteriaTabProps {
  criteria: Criterion[];
  scores: Record<string, number>;
  onScoreChange: (criterionId: string, points: number) => void;
}

export default function CriteriaTab({ criteria, scores, onScoreChange }: CriteriaTabProps) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      {criteria.map((criterion) => (
        <div key={criterion.id} className="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-surface border-b border-outline-variant flex justify-between items-center">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <span className="text-xs font-bold bg-white text-primary px-1.5 py-0.5 rounded border border-primary/20">
                {criterion.id}
              </span>
              {criterion.name}
            </h3>
            {scores[criterion.id] !== undefined && (
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                scores[criterion.id] > 0 ? 'bg-green-100 text-green-700' : 
                scores[criterion.id] < 0 ? 'bg-red-100 text-red-700' : 'bg-surface text-outline'
              }`}>
                {scores[criterion.id] > 0 ? `+${scores[criterion.id]}` : scores[criterion.id]} điểm
              </span>
            )}
          </div>
          
          <div className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
            {criterion.levels.map((level, idx) => {
              const isSelected = scores[criterion.id] === level.points;
              return (
                <button
                  key={idx}
                  onClick={() => onScoreChange(criterion.id, level.points)}
                  className={`
                    relative p-3 rounded-xl border text-left transition-all duration-300 group
                    ${isSelected 
                      ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-lg scale-[1.02] z-10' 
                      : 'border-outline-variant hover:border-primary/40 hover:bg-surface scale-100'
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className={`
                      shrink-0 text-sm font-black px-2 py-0.5 rounded
                      ${level.points > 0 ? (isSelected ? 'bg-green-600 text-white shadow-sm' : 'bg-green-50 text-green-700') :
                        level.points < 0 ? (isSelected ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 text-red-700') :
                        (isSelected ? 'bg-primary text-white shadow-sm' : 'bg-surface text-outline')}
                    `}>
                      {level.points > 0 ? `+${level.points}` : level.points}
                    </span>
                    <p className={`text-sm leading-snug flex-1 transition-colors ${isSelected ? 'font-bold text-primary' : 'text-on-surface-variant'}`}>
                      {level.label}
                    </p>
                    {isSelected && (
                      <div className="shrink-0 w-4 h-4 bg-primary text-white rounded-full flex items-center justify-center shadow-sm">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      </div>
                    )}
                  </div>
                  {level.description && (
                    <div className="mt-2 flex items-start gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Info size={12} className="shrink-0 mt-0.5" />
                      <p className="text-[10px] italic">{level.description}</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
