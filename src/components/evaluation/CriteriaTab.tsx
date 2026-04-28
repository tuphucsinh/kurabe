import { useState } from 'react';
import { Criterion } from '@/data/criteria';
import { EvaluationRound } from '@/data/mock';
import { Info, StickyNote, History } from 'lucide-react';

interface CriteriaTabProps {
  criteria: Criterion[];
  scores: Record<string, number>;
  notes: Record<string, string>;
  onScoreChange: (criterionId: string, points: number) => void;
  onNoteChange: (criterionId: string, note: string) => void;
  previousRound?: EvaluationRound;
  disabled?: boolean;
}

export default function CriteriaTab({ 
  criteria, 
  scores, 
  notes, 
  onScoreChange, 
  onNoteChange,
  previousRound,
  disabled
}: CriteriaTabProps) {
  const [activeNotes, setActiveNotes] = useState<Set<string>>(new Set());

  const toggleNote = (id: string) => {
    setActiveNotes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
      {criteria.map((criterion) => {
        const hasNote = !!notes[criterion.id];
        const isNoteVisible = activeNotes.has(criterion.id) || hasNote;
        const currentScore = scores[criterion.id];
        const prevScore = previousRound?.scores?.[criterion.id];
        const hasScoreChanged = prevScore !== undefined && currentScore !== undefined && prevScore !== currentScore;

        return (
          <div key={criterion.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-colors ${hasScoreChanged ? 'border-amber-400 ring-1 ring-amber-400/50' : 'border-outline-variant'}`}>
            <div className="px-6 py-2.5 bg-surface border-b border-outline-variant flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <h3 className="font-bold text-on-surface flex items-center gap-2">
                  <span className="text-xs font-bold bg-white text-primary px-1.5 py-0.5 rounded border border-primary/20">
                    {criterion.id}
                  </span>
                  {criterion.name}
                </h3>
                <button 
                  onClick={() => toggleNote(criterion.id)}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-xs font-bold uppercase tracking-wider
                    ${isNoteVisible 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'text-outline hover:bg-primary/10 hover:text-primary border border-dashed border-outline-variant'
                    }
                  `}
                >
                  <StickyNote size={14} />
                  <span>Ghi chú</span>
                </button>
              </div>
              
              <div className="flex items-center gap-2">
                {prevScore !== undefined && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                    hasScoreChanged ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-outline-variant bg-surface border-outline-variant'
                  }`}>
                    <History size={10} />
                    R{previousRound?.round}: {prevScore > 0 ? `+${prevScore}` : prevScore}
                  </span>
                )}
                {currentScore !== undefined && (
                  <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                    currentScore > 0 ? 'bg-green-100 text-green-700' : 
                    currentScore < 0 ? 'bg-red-100 text-red-700' : 'bg-surface text-outline'
                  }`}>
                    {currentScore > 0 ? `+${currentScore}` : currentScore} điểm
                  </span>
                )}
              </div>
            </div>
            
            <div className="p-2 md:p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
              {criterion.levels.map((level, idx) => {
                const isSelected = currentScore === level.points;
                const isPrevSelected = prevScore === level.points;
                
                return (
                  <button
                    key={idx}
                    disabled={disabled}
                    onClick={() => onScoreChange(criterion.id, level.points)}
                    className={`
                      relative p-3 rounded-xl border text-left transition-all duration-300 group
                      ${isSelected 
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-lg scale-[1.02] z-10' 
                        : isPrevSelected
                          ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400 scale-100'
                          : 'border-outline-variant hover:border-primary/40 hover:bg-surface scale-100'
                      }
                      ${disabled ? 'opacity-70 cursor-not-allowed hover:border-outline-variant hover:bg-transparent hover:scale-100' : ''}
                    `}
                  >
                    {isPrevSelected && !isSelected && (
                      <span className="absolute -top-2 -right-2 text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded shadow-sm z-20">
                        R{previousRound?.round}
                      </span>
                    )}
                    {isPrevSelected && isSelected && (
                      <span className="absolute -top-2 -right-2 text-[9px] font-bold bg-primary text-white border border-primary px-1.5 py-0.5 rounded shadow-sm z-20">
                        R{previousRound?.round} & Hiện tại
                      </span>
                    )}
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

            {isNoteVisible && (
              <div className="px-6 pb-12 pt-1 animate-in slide-in-from-top-2 duration-300">
                <div className="bg-surface/50 rounded-xl">
                  <input 
                    type="text"
                    disabled={disabled}
                    value={notes[criterion.id] || ''}
                    onChange={(e) => onNoteChange(criterion.id, e.target.value)}
                    className="w-full bg-white border border-outline-variant rounded-lg px-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none h-[24px] min-h-[24px] shadow-inner leading-[24px] py-0 disabled:bg-surface disabled:cursor-not-allowed"
                    placeholder={`Ghi chú cho ${criterion.name}...`}
                  />
                  {previousRound?.notes?.[criterion.id] && (
                    <p className="mt-1 text-[10px] text-outline italic flex items-center gap-1 px-1">
                      <History size={10} />
                      Ghi chú cũ (R{previousRound.round}): {previousRound.notes?.[criterion.id]}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
