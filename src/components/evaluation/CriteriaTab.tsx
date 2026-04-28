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
  allPreviousRounds: EvaluationRound[];
  disabled?: boolean;
}

export default function CriteriaTab({ 
  criteria, 
  scores, 
  notes, 
  onScoreChange, 
  onNoteChange,
  allPreviousRounds = [],
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
        
        // Find if current score differs from any previous rounds
        const mostRecentRound = allPreviousRounds.length > 0 
          ? allPreviousRounds[allPreviousRounds.length - 1] 
          : null;
        
        // Change logic: Highlight if current differs from ANY previous round
        const hasHistoryVariance = allPreviousRounds.length > 0 && allPreviousRounds.some(r => r.scores?.[criterion.id] !== undefined && r.scores[criterion.id] !== currentScore);
        const mostRecentScore = mostRecentRound?.scores?.[criterion.id];
        const hasScoreChanged = mostRecentScore !== undefined && currentScore !== undefined && mostRecentScore !== currentScore;

        return (
          <div key={criterion.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 ${hasScoreChanged ? 'border-amber-400 ring-1 ring-amber-400/50' : 'border-outline-variant hover:border-primary/20'}`}>
            <div className="px-6 py-2.5 bg-surface border-b border-outline-variant flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <h3 className="font-bold text-on-surface flex items-center gap-2">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border transition-colors ${hasHistoryVariance ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-primary border-primary/20'}`}>
                    {criterion.id}
                  </span>
                  {criterion.name}
                </h3>
                <button 
                  onClick={() => toggleNote(criterion.id)}
                  className={`
                    flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all text-[10px] font-black uppercase tracking-wider
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
              
              <div className="flex items-center gap-2 flex-wrap">
                {allPreviousRounds.map((round, rIdx) => {
                  const rScore = round.scores?.[criterion.id];
                  if (rScore === undefined) return null;
                  
                  // Highlight if different from ITS own previous round
                  const prevRScore = rIdx > 0 ? allPreviousRounds[rIdx - 1].scores?.[criterion.id] : undefined;
                  const scoreChangedAtThisRound = prevRScore !== undefined && prevRScore !== rScore;

                  return (
                    <span key={round.round} className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 transition-colors ${
                      scoreChangedAtThisRound ? 'text-amber-700 bg-amber-50 border-amber-200 shadow-sm' : 'text-outline-variant bg-surface border-outline-variant/60'
                    }`}>
                      <History size={10} />
                      L{round.round}: {rScore > 0 ? `+${rScore}` : rScore}
                    </span>
                  );
                })}
                
                {currentScore !== undefined && (
                  <span className={`text-xs font-black px-3 py-1 rounded-full shadow-sm transition-all ${
                    currentScore > 0 ? 'bg-green-100 text-green-700 ring-1 ring-green-200' : 
                    currentScore < 0 ? 'bg-red-100 text-red-700 ring-1 ring-red-200' : 'bg-surface text-outline border border-outline-variant'
                  }`}>
                    {currentScore > 0 ? `+${currentScore}` : currentScore} điểm
                  </span>
                )}
              </div>
            </div>
            
            {/* Card grid with radio dots & L badges — restored */}
            <div className="p-2 md:p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
              {criterion.levels.map((level, idx) => {
                const isSelected = currentScore === level.points;
                const selectedRounds = allPreviousRounds.filter(r => r.scores?.[criterion.id] === level.points);
                
                return (
                  <button
                    key={idx}
                    disabled={disabled}
                    onClick={() => onScoreChange(criterion.id, level.points)}
                    className={`
                      relative p-3 rounded-xl border text-left transition-all duration-300 group
                      ${isSelected 
                        ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-lg scale-[1.02] z-10' 
                        : selectedRounds.length > 0
                          ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400 scale-100'
                          : 'border-outline-variant hover:border-primary/40 hover:bg-surface scale-100'
                      }
                      ${disabled ? 'opacity-70 cursor-not-allowed hover:border-outline-variant hover:bg-transparent hover:scale-100' : ''}
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
                      {selectedRounds.length > 0 && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          {selectedRounds.map(r => (
                            <span key={r.round} className={`w-5 h-5 flex items-center justify-center text-[9px] font-bold border rounded shadow-sm ${
                              isSelected ? 'bg-primary text-white border-primary' : 'bg-amber-100 text-amber-700 border-amber-200'
                            }`}>
                              L{r.round}
                            </span>
                          ))}
                        </div>
                      )}
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
              <div className="px-4 py-2 border-t border-outline-variant/30 animate-in slide-in-from-top-2 duration-200 bg-surface/30">
                <div className="flex items-center gap-2">
                  <StickyNote size={12} className="text-outline shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    disabled={disabled}
                    value={notes[criterion.id] || ''}
                    onChange={(e) => onNoteChange(criterion.id, e.target.value)}
                    className="flex-1 h-7 bg-white border border-outline-variant rounded-md px-3 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none disabled:bg-surface disabled:cursor-not-allowed"
                    placeholder={`Ghi chú cho ${criterion.name}...`}
                  />
                  {allPreviousRounds.some(r => r.notes?.[criterion.id]) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {allPreviousRounds.map(round => round.notes?.[criterion.id] && (
                        <span key={round.round} title={`L${round.round}: ${round.notes[criterion.id]}`} className="flex items-center gap-1 text-[10px] text-outline-variant border border-outline-variant/40 rounded px-1.5 py-0.5 bg-white cursor-help">
                          <History size={9} />L{round.round}
                        </span>
                      ))}
                    </div>
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
