'use client';

import { m } from 'framer-motion';
import { CriteriaGroup } from '@/data/criteria';

interface GroupNavTabsProps {
  groups: CriteriaGroup[];
  activeGroupId: string;
  scores: Record<string, number>;
  onGroupChange: (groupId: string) => void;
}

export default function GroupNavTabs({
  groups,
  activeGroupId,
  scores,
  onGroupChange
}: GroupNavTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
      {groups.map((group) => {
        const isActive = activeGroupId === group.id;
        const groupScore = group.criteria.reduce((sum, c) => sum + (scores[c.id] || 0), 0);
        const hasScores = group.criteria.some(c => scores[c.id] !== undefined);
        
        // Extract short name cleanly
        let baseName = group.name.replace(/\s*\(.*?\)\s*/g, '').trim();
        // Remove group letter prefix if present (e.g., "A. ", "B ")
        baseName = baseName.replace(/^[A-Z][.\s]+/, '');
        
        let shortName = baseName;
        if (shortName.toLowerCase().startsWith('tính ')) {
          shortName = shortName.substring(5);
        } else if (shortName.toLowerCase().startsWith('năng lực')) {
          shortName = 'Năng lực';
        } else if (shortName.toLowerCase().startsWith('thành tích')) {
          shortName = 'Thành tích';
        }
        
        // Capitalize first letter (e.g., "kỷ luật" -> "Kỷ luật")
        shortName = shortName.charAt(0).toUpperCase() + shortName.slice(1);

        return (
          <button
            key={group.id}
            onClick={() => onGroupChange(group.id)}
            className={`
              relative flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 shrink-0
              ${isActive 
                ? 'border-transparent text-white z-10 shadow-lg shadow-primary/30' 
                : 'bg-white border-outline-variant/40 hover:border-primary/40 hover:bg-primary/5 shadow-sm hover:shadow-md'
              }
            `}
          >
            {isActive && (
              <m.div 
                layoutId="activeTab"
                className="absolute inset-0 bg-gradient-to-r from-[#0E4B66] to-[#1A6D91] rounded-2xl"
                transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
              />
            )}
            
            {/* Label */}
            <div className="relative z-20 flex flex-col items-start">
              <span className={`text-[9px] font-bold uppercase tracking-[0.15em] leading-none ${isActive ? 'text-white/60' : 'text-outline'}`}>
                Nhóm {group.id}
              </span>
              <span className={`text-sm font-bold whitespace-nowrap leading-snug ${isActive ? 'text-white' : 'text-on-surface'}`}>
                {shortName}
              </span>
            </div>

            {/* Badge */}
            <div className="relative z-20 ml-1">
              {hasScores ? (
                <m.span 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-white/25 text-white' : 
                    groupScore >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {groupScore > 0 ? `+${groupScore}` : groupScore}
                </m.span>
              ) : (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white/70' : 'bg-surface text-outline'
                }`}>
                  {group.criteria.length}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
