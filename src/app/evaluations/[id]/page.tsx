
'use client';

import { useState, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  leaderCriteria, 
  staffCriteria
} from '@/data/criteria';
import { mockUsers, User } from '@/data/mock';
import CriteriaTab from '@/components/evaluation/CriteriaTab';
import { calculateGrade, getGradeColor } from '@/lib/scoring';
import { 
  ArrowLeft, 
  ChevronRight,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';


interface EvaluationPageProps {
  params: Promise<{ id: string }>;
}

export default function EvaluationPage({ params }: EvaluationPageProps) {
  const router = useRouter();
  const { id } = use(params);
  
  const [employee, setEmployee] = useState<User | null>(null);
  const [activeGroupId, setActiveGroupId] = useState('A');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const found = mockUsers.find(u => u.id === id);
    if (found) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmployee(found);
    } else {
      // Redirect or show error
      console.error('Employee not found');
    }
  }, [id]);

  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isLeader = employee.role !== 'Employee';
  const criteriaGroups = isLeader ? leaderCriteria : staffCriteria;
  const activeGroup = criteriaGroups.find(g => g.id === activeGroupId) || criteriaGroups[0];

  const handleScoreChange = (criterionId: string, points: number) => {
    setScores(prev => ({
      ...prev,
      [criterionId]: points
    }));
  };

  const handleNoteChange = (criterionId: string, note: string) => {
    setNotes(prev => ({
      ...prev,
      [criterionId]: note
    }));
  };

  const handleSave = async (status: 'Draft' | 'Submitted') => {
    setIsSaving(true);
    // Mock API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSaving(false);
    
    if (status === 'Submitted') {
      alert('Đánh giá đã được gửi thành công!');
      router.push('/employees');
    } else {
      alert('Đã lưu bản nháp.');
    }
  };

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header & Back Button */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-outline hover:text-primary transition-colors group w-fit"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">Quay lại danh sách</span>
          </button>

          {/* Action Buttons */}
          <div className="flex flex-row gap-3 w-full md:w-auto">
            <button 
              onClick={() => handleSave('Draft')}
              disabled={isSaving}
              className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-white text-on-surface border border-outline-variant rounded-xl font-bold hover:bg-surface hover:border-outline transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap"
            >
              Lưu bản nháp
            </button>
            <button 
              onClick={() => handleSave('Submitted')}
              disabled={isSaving}
              className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100 text-sm whitespace-nowrap"
            >
              <CheckCircle2 size={18} className="shrink-0" />
              <span>{isSaving ? 'Đang gửi...' : 'Gửi Đánh giá'}</span>
            </button>
          </div>
        </div>

        {(() => {
          const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
          const totalCriteria = criteriaGroups.reduce((sum, g) => sum + g.criteria.length, 0);
          const scoredCount = Object.keys(scores).length;
          const grade = calculateGrade(totalScore, isLeader);
          const gradeStyles = getGradeColor(grade);
          const gradeColorClass = gradeStyles.split(' ')[0];
          const gradeBgClass = gradeStyles.split(' ').slice(1).join(' ');

          return (
            <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden">
              <div className="flex flex-col md:flex-row">
                {/* Left: Employee Info */}
                <div className="flex-1 p-6 md:p-8 space-y-4">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">{employee.name}</h1>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${isLeader ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {employee.role}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-8 md:gap-16 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-outline">Mã NV:</span>
                      <span className="font-bold text-on-surface">{employee.employeeCode}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-outline">Bộ phận:</span>
                      <span className="font-bold text-on-surface">QAQC Line 1</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-outline">Ngày vào làm:</span>
                      <span className="font-bold text-on-surface">{employee.joinDate || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Score Panel */}
                <div className={`flex items-center justify-between md:justify-end gap-8 md:gap-12 px-8 py-6 md:py-0 border-t md:border-t-0 md:border-l border-outline-variant/50 ${gradeBgClass}`}>
                  {/* Grade */}
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface/50 mb-1">Xếp loại</span>
                    <span className={`text-2xl font-black leading-none ${gradeColorClass}`}>{grade}</span>
                  </div>

                  {/* Total Score */}
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface/50 mb-1">Tổng điểm</span>
                    <span className={`text-2xl font-black leading-none ${gradeColorClass}`}>{totalScore}</span>
                  </div>

                  {/* Criteria */}
                  <div className="flex flex-col items-center min-w-[60px]">
                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface/50 mb-1">Tiêu chí</span>
                    <span className={`text-2xl font-black leading-none ${gradeColorClass}`}>{scoredCount}<span className="text-on-surface/40 font-medium text-base">/{totalCriteria}</span></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="space-y-8">
        <div className="space-y-8">
          {/* Navigation Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
            {criteriaGroups.map((group) => {
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
                  onClick={() => setActiveGroupId(group.id)}
                  className={`
                    relative flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 shrink-0
                    ${isActive 
                      ? 'border-transparent text-white z-10 shadow-lg shadow-primary/30' 
                      : 'bg-white border-outline-variant/40 hover:border-primary/40 hover:bg-primary/5 shadow-sm hover:shadow-md'
                    }
                  `}
                >
                  {isActive && (
                    <motion.div 
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
                      <motion.span 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                          isActive ? 'bg-white/25 text-white' : 
                          groupScore >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {groupScore > 0 ? `+${groupScore}` : groupScore}
                      </motion.span>
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

          {/* Active Group Title */}
          <div className="flex items-center gap-4">
            <div className="h-10 w-1.5 bg-primary rounded-full"></div>
            <h2 className="text-2xl font-black text-on-surface">
              Nhóm {activeGroupId}: {activeGroup.name}
            </h2>
          </div>

          {/* Criteria List */}
          <CriteriaTab 
            criteria={activeGroup.criteria} 
            scores={scores} 
            notes={notes}
            onScoreChange={handleScoreChange} 
            onNoteChange={handleNoteChange}
          />
          
          {/* Navigation between groups */}
          {(() => {
            const currentIdx = criteriaGroups.findIndex(g => g.id === activeGroupId);
            const navigateTo = (idx: number) => {
              setActiveGroupId(criteriaGroups[idx].id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            return (
              <div className="flex justify-between items-center pt-8 border-t border-outline-variant">
                {currentIdx > 0 ? (
                  <button onClick={() => navigateTo(currentIdx - 1)} className="flex items-center gap-2 font-bold text-primary hover:bg-primary/10 transition-colors bg-primary/5 px-6 py-3 rounded-2xl">
                    <ArrowLeft size={20} />
                    Nhóm trước
                  </button>
                ) : <div />}
                {currentIdx < criteriaGroups.length - 1 ? (
                  <button onClick={() => navigateTo(currentIdx + 1)} className="flex items-center gap-2 font-bold text-primary hover:bg-primary/10 transition-colors bg-primary/5 px-6 py-3 rounded-2xl">
                    Nhóm tiếp theo
                    <ChevronRight size={20} />
                  </button>
                ) : <div />}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
