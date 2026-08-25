import { useState, memo } from 'react';
import { CriteriaGroup, EvaluationRound } from '@/types';
import { Info, StickyNote, History } from 'lucide-react';

interface CriteriaTabProps {
  group: CriteriaGroup;
  scores: Record<string, number>;
  selectedLevelIndexes: Record<string, number>;
  notes: Record<string, string>;
  onScoreChange: (criterionId: string, points: number, levelIndex: number) => void;
  onNoteChange: (criterionId: string, note: string) => void;
  allPreviousRounds: EvaluationRound[];
  disabled?: boolean;
}

const CriteriaTab = memo(function CriteriaTab({
  group,
  scores,
  selectedLevelIndexes,
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

  const handleLevelSelect = (criterionId: string, levelIndex: number, points: number) => {
    onScoreChange(criterionId, points, levelIndex);
  };

  return (
    <div className="space-y-2 max-md:space-y-2.5 animate-in fade-in duration-200 w-full min-w-0 max-w-full">
      {group.criteria.map((criterion) => {
        const hasNote = !!notes[criterion.id];
        const isNoteVisible = activeNotes.has(criterion.id) || hasNote;
        const currentScore = scores[criterion.id];
        const overrideIndex = selectedLevelIndexes[criterion.id];
        const hasValidOverride = overrideIndex !== undefined
          && criterion.levels[overrideIndex] !== undefined
          && criterion.levels[overrideIndex].points === currentScore;
        const selectedLevelIndex = hasValidOverride
          ? overrideIndex
          : currentScore === undefined
            ? -1
            : criterion.levels.findIndex(level => level.points === currentScore);
        
        // Find if current score differs from any previous rounds
        const mostRecentRound = allPreviousRounds.length > 0
          ? allPreviousRounds[allPreviousRounds.length - 1]
          : null;

        // Change logic: Highlight if current differs from ANY previous round
        const hasHistoryVariance = allPreviousRounds.length > 0 && allPreviousRounds.some(r => r.scores?.[criterion.id] !== undefined && r.scores[criterion.id] !== currentScore);
        const mostRecentScore = mostRecentRound?.scores?.[criterion.id];
        const hasScoreChanged = mostRecentScore !== undefined && currentScore !== undefined && mostRecentScore !== currentScore;

        return (
          <div
            key={criterion.id}
            className={`w-full min-w-0 max-w-full bg-surface-raised rounded-2xl border overflow-hidden shadow-sm max-md:shadow-2xs transition-all duration-200 ${
              hasScoreChanged
                ? 'border-amber-400 ring-1 ring-amber-400/40'
                : 'border-outline-soft hover:border-brand/30'
            }`}
          >
            <div className="px-4 py-2.5 max-md:px-3 max-md:py-2 bg-surface-muted/50 border-b border-outline-soft/70 flex flex-row items-center justify-between gap-2 max-md:flex-col max-md:items-start w-full min-w-0">
              <div className="flex items-center gap-3 max-md:gap-2 max-md:justify-between max-md:w-full min-w-0">
                <h3 className="font-bold text-ink flex items-center gap-2 text-sm min-w-0">
                  <span
                    className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded border transition-colors ${
                      hasHistoryVariance
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : 'bg-brand-soft text-brand border-brand/20'
                    }`}
                  >
                    {criterion.code}
                  </span>
                  <span className="min-w-0 break-words">{criterion.name}</span>
                </h3>
                <button
                  onClick={() => toggleNote(criterion.id)}
                  className={`
                    shrink-0 flex items-center gap-1.5 px-2.5 py-1 max-md:h-auto max-md:min-h-0 max-md:py-1 rounded-lg transition-all text-xs font-semibold active:scale-95
                    ${isNoteVisible
                      ? 'bg-brand text-white shadow-2xs'
                      : 'text-ink-muted hover:bg-brand-soft hover:text-brand border border-outline-soft bg-surface-raised'
                    }
                  `}
                >
                  <StickyNote size={13} className="max-md:hidden" />
                  <span>Ghi chú</span>
                </button>
              </div>

              <div className="flex items-center gap-2 max-md:gap-1.5 flex-wrap max-md:w-full min-w-0">
                {allPreviousRounds.map((round, rIdx) => {
                  const rScore = round.scores?.[criterion.id];
                  if (rScore === undefined) return null;
                  
                  // Highlight if different from ITS own previous round
                  const prevRScore = rIdx > 0 ? allPreviousRounds[rIdx - 1].scores?.[criterion.id] : undefined;
                  const scoreChangedAtThisRound = prevRScore !== undefined && prevRScore !== rScore;

                  return (
                    <span
                      key={round.round}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded border flex items-center gap-1 shrink-0 transition-colors ${
                        scoreChangedAtThisRound
                          ? 'text-amber-800 bg-amber-50 border-amber-200 shadow-2xs'
                          : 'text-ink-muted bg-surface-raised border-outline-soft/80'
                      }`}
                    >
                      <History size={10} className="shrink-0" />
                      <span>L{round.round}: {rScore > 0 ? `+${rScore}` : rScore}</span>
                    </span>
                  );
                })}
                
                {currentScore !== undefined && (
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-lg shadow-2xs shrink-0 transition-all ${
                      currentScore > 0
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : currentScore < 0
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-surface-raised text-ink-muted border border-outline-soft'
                    }`}
                  >
                    {currentScore > 0 ? `+${currentScore}` : currentScore} điểm
                  </span>
                )}
              </div>
            </div>

            {/* Card grid with radio dots & L badges */}
            <div className="p-3 max-md:p-2.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 max-md:gap-2 w-full min-w-0">
              {criterion.levels.map((level, idx) => {
                const isSelected = idx === selectedLevelIndex;
                const selectedRounds = allPreviousRounds.filter(r => r.scores?.[criterion.id] === level.points);

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleLevelSelect(criterion.id, idx, level.points)}
                    className={`
                      w-full max-md:min-w-0 max-md:min-h-[44px] relative p-3 max-md:p-2.5 rounded-xl border text-left transition-all duration-150 group cursor-pointer active:scale-[0.99]
                      ${isSelected
                        ? 'border-brand ring-1 ring-brand/30 bg-brand-soft/60 shadow-2xs z-10'
                        : selectedRounds.length > 0
                          ? 'border-amber-300 bg-amber-50/40 hover:bg-amber-50/70 hover:border-amber-400'
                          : 'border-outline-soft bg-surface-raised hover:border-brand/30 hover:bg-surface-muted/40'
                      }
                      ${disabled ? 'opacity-65 cursor-not-allowed hover:border-outline-soft hover:bg-transparent' : ''}
                    `}
                  >
                    <div className="flex items-center gap-3 max-md:gap-2 max-md:min-w-0 w-full">
                      <span
                        className={`
                          shrink-0 text-xs font-bold px-2 py-0.5 rounded leading-none
                          ${level.points > 0
                            ? (isSelected ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-emerald-50 text-emerald-700')
                            : level.points < 0
                              ? (isSelected ? 'bg-rose-600 text-white shadow-2xs' : 'bg-rose-50 text-rose-700')
                              : (isSelected ? 'bg-brand text-white shadow-2xs' : 'bg-surface-muted text-ink-muted')
                          }
                        `}
                      >
                        {level.points > 0 ? `+${level.points}` : level.points}
                      </span>
                      <p
                        className={`text-sm max-md:text-xs leading-snug flex-1 min-w-0 max-md:min-w-0 max-md:break-words transition-colors ${
                          isSelected ? 'font-bold text-brand' : 'text-ink'
                        }`}
                      >
                        {level.label}
                      </p>
                      {selectedRounds.length > 0 && (
                        <div className="flex flex-col max-md:flex-row gap-0.5 max-md:gap-1.5 shrink-0 items-center justify-center">
                          {selectedRounds.map(r => (
                            <span
                              key={r.round}
                              className={`w-6 h-6 flex items-center justify-center text-[11px] font-bold border rounded shadow-2xs leading-none shrink-0 ${
                                isSelected
                                  ? 'bg-brand text-white border-brand'
                                  : 'bg-amber-100 text-amber-800 border-amber-200'
                              }`}
                            >
                              L{r.round}
                            </span>
                          ))}
                        </div>
                      )}
                      {isSelected && (
                        <div className="shrink-0 w-3.5 h-3.5 bg-brand text-white rounded-full flex items-center justify-center shadow-2xs">
                          <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                        </div>
                      )}
                    </div>
                    {level.description && (
                      <div className="mt-1.5 flex items-start gap-1 text-[11px] text-ink-muted/80 leading-tight min-w-0">
                        <Info size={11} className="shrink-0 mt-0.5 text-ink-muted/60" />
                        <p className="italic min-w-0 max-md:break-words">{level.description}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {isNoteVisible && (
              <div className="px-4 py-2 max-md:px-3 border-t border-outline-soft/60 bg-surface-muted/30 animate-in slide-in-from-top-1 duration-150 min-w-0 w-full">
                <div className="flex flex-row max-md:flex-col items-center max-md:items-stretch gap-2 min-w-0 w-full">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <StickyNote size={14} className="text-ink-muted shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      disabled={disabled}
                      value={notes[criterion.id] || ''}
                      onChange={(e) => onNoteChange(criterion.id, e.target.value)}
                      className="flex-1 min-w-0 max-md:min-h-[44px] bg-surface-raised border border-outline-soft rounded-xl px-3 py-1.5 text-sm max-md:text-base focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all outline-none disabled:bg-surface disabled:cursor-not-allowed text-ink"
                      placeholder={`Ghi chú cho ${criterion.name}...`}
                    />
                  </div>
                  {allPreviousRounds.some(r => r.notes?.[criterion.id]) && (
                    <div className="flex items-center gap-1 shrink-0 flex-wrap max-md:pl-6 min-w-0 max-w-full">
                      {allPreviousRounds.map(round => round.notes?.[criterion.id] && (
                        <span key={round.round} title={`L${round.round}: ${round.notes[criterion.id]}`} className="flex items-center gap-1 text-[11px] text-ink-muted border border-outline-soft/60 rounded px-2 py-0.5 bg-surface-raised cursor-help max-w-full break-all">
                          <History size={10} className="shrink-0" />
                          <span className="truncate">L{round.round}: {round.notes[criterion.id]}</span>
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
});

export default CriteriaTab;
