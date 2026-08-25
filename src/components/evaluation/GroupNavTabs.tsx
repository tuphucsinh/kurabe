'use client';

import { useEffect, useRef } from 'react';
import { m } from 'framer-motion';
import { CriteriaGroup } from '@/types';

interface GroupNavTabsProps {
  groups: CriteriaGroup[];
  activeGroupId: string;
  scores: Record<string, number>;
  onSelect: (groupId: string) => void;
}

export default function GroupNavTabs({
  groups,
  activeGroupId,
  scores,
  onSelect
}: GroupNavTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeTab = container.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeTab) return;

    const tabLeft = activeTab.offsetLeft;
    const tabRight = tabLeft + activeTab.offsetWidth;
    const visibleLeft = container.scrollLeft;
    const visibleRight = visibleLeft + container.clientWidth;
    const horizontalPadding = 8;

    if (tabLeft < visibleLeft) {
      container.scrollTo({ left: Math.max(0, tabLeft - horizontalPadding), behavior: 'smooth' });
    } else if (tabRight > visibleRight) {
      container.scrollTo({
        left: tabRight - container.clientWidth + horizontalPadding,
        behavior: 'smooth'
      });
    }
  }, [activeGroupId]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Nhóm tiêu chí"
      className="w-full min-w-0 max-w-full flex items-center gap-2 overflow-x-auto pb-2 pt-1 max-md:pb-1.5 max-md:pt-0.5 scrollbar-hide px-1 max-md:px-0.5 touch-pan-x overscroll-x-contain"
    >
      {groups.map((group) => {
        const isActive = activeGroupId === group.id;
        const groupScore = group.criteria.reduce((sum, c) => sum + (scores[c.id] || 0), 0);
        const hasScores = group.criteria.some(c => scores[c.id] !== undefined);

        let shortName = group.name.replace(/\s*\(.*?\)\s*/g, '').replace(/^[A-Z][.\s]+/, '').trim();

        shortName = shortName
          .replace(/^tính\s+/i, '')
          .replace(/^năng lực.*/i, 'Năng lực')
          .replace(/^thành tích.*/i, 'Thành tích');

        // Capitalize first letter (e.g., "kỷ luật" -> "Kỷ luật")
        shortName = shortName.charAt(0).toUpperCase() + shortName.slice(1);

        return (
          <button
            key={group.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${group.id}`}
            id={`tab-${group.id}`}
            data-active={isActive}
            onClick={() => onSelect(group.id)}
            className={`
              relative flex items-center gap-3 max-md:gap-2 px-4 py-3 max-md:px-3 max-md:py-2 rounded-2xl max-md:rounded-xl border transition-all duration-200 shrink-0 max-md:min-h-[44px] select-none
              ${isActive
                ? 'border-transparent text-white z-10 shadow-lg max-md:shadow-sm'
                : 'bg-surface-raised border-outline-soft hover:border-brand/40 hover:bg-surface-muted/50 text-ink shadow-sm max-md:shadow-2xs'
              }
            `}
          >
            {isActive && (
              <m.div
                layoutId="activeTab"
                className="absolute inset-0 bg-brand rounded-2xl max-md:rounded-xl"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}

            {/* Label */}
            <div className="relative z-20 flex flex-col items-start">
              <span className={`text-[11px] max-md:text-[10px] font-bold uppercase tracking-[0.15em] leading-none ${isActive ? 'text-white/70' : 'text-ink-muted'}`}>
                Nhóm {group.code}
              </span>
              <span className={`text-sm max-md:text-xs font-bold whitespace-nowrap leading-tight mt-0.5 ${isActive ? 'text-white' : 'text-ink'}`}>
                {shortName}
              </span>
            </div>

            {/* Badge */}
            <div className="relative z-20 ml-1">
              {hasScores ? (
                <m.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`text-xs max-md:text-[11px] font-bold px-2 py-0.5 max-md:px-1.5 rounded-full leading-none ${
                    isActive ? 'bg-white/20 text-white' :
                    groupScore >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                  }`}
                >
                  {groupScore > 0 ? `+${groupScore}` : groupScore}
                </m.span>
              ) : (
                <span className={`text-xs max-md:text-[11px] font-medium px-2 py-0.5 max-md:px-1.5 rounded-full leading-none ${
                  isActive ? 'bg-white/20 text-white/75' : 'bg-surface-muted text-ink-muted border border-outline-soft/50'
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
