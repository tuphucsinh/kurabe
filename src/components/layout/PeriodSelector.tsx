'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronDown, Calendar, Check } from 'lucide-react';

export default function PeriodSelector() {
  const { currentPeriod, allPeriods, setCurrentPeriod } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        // Also check if the click is inside the fixed popup (we'll add an ID to it)
        const popup = document.getElementById('period-flyout-menu');
        if (popup && popup.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 768; // md breakpoint
      
      if (isMobile) {
        setDropdownStyle({
          bottom: window.innerHeight - rect.top + 8,
          left: 12,
          right: 12,
          position: 'fixed',
          backgroundColor: '#0E4B66'
        });
      } else {
        setDropdownStyle({
          bottom: window.innerHeight - rect.bottom, 
          left: rect.right + 12,
          width: '260px',
          position: 'fixed',
          backgroundColor: '#0E4B66'
        });
      }
    }
    setIsOpen(!isOpen);
  };

  if (!currentPeriod || allPeriods.length <= 1) {
    if (!currentPeriod) return null;
    return (
      <div className="px-4 py-2 flex items-center gap-2 text-white/70 text-base font-bold border-t border-white/5">
        <Calendar size={20} />
        <span>Kỳ {currentPeriod.year}</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-t border-white/10" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-all duration-200 group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Calendar size={20} className="text-white/60 group-hover:text-white shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-white/40 font-bold leading-none mb-1">Kỳ đánh giá</p>
            <p className="text-lg font-bold truncate">Kỳ {currentPeriod.year}</p>
          </div>
        </div>
        <ChevronDown 
          size={16} 
          className={`text-white/40 transition-transform duration-300 ${isOpen ? '-rotate-90 md:rotate-90' : ''}`} 
        />
      </button>

      {mounted && isOpen && createPortal(
        <div 
          id="period-flyout-menu"
          style={dropdownStyle}
          className="bg-[#0E4B66] backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-[9999] animate-in fade-in slide-in-from-bottom-2 md:slide-in-from-left-2 duration-200"
        >
          <div className="px-4 py-3 border-b border-white/10 bg-black/30">
            <h4 className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Chọn kỳ đánh giá</h4>
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar bg-[#0E4B66]/50">
            {allPeriods.map((period) => {
              const isActive = period.id === currentPeriod.id;
              const isClosed = period.status === 'Closed';

              return (
                <button
                  key={period.id}
                  onClick={() => {
                    setCurrentPeriod(period);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all border-b border-white/5 last:border-0 ${
                    isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">Kỳ {period.year}</span>
                      {isClosed && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-white/40 text-[9px] font-bold uppercase">
                          Closed
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {new Date(period.createdAt).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                  {isActive && <Check size={14} className="text-indigo-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
