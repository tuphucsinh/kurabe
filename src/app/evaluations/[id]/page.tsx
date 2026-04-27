
'use client';

import { useState, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  leaderCriteria, 
  staffCriteria, 
  CriteriaGroup
} from '@/data/criteria';
import { mockUsers, User } from '@/data/mock';
import CriteriaTab from '@/components/evaluation/CriteriaTab';
import ScoreSummary from '@/components/evaluation/ScoreSummary';
import { 
  ArrowLeft, 
  Calendar, 
  User as UserIcon, 
  Briefcase, 
  ChevronRight,
  ShieldCheck, 
  Zap, 
  Handshake, 
  ClipboardCheck,
  TrendingUp,
  Target,
  Award
} from 'lucide-react';
import { motion } from 'framer-motion';
import Image from 'next/image';

const groupIcons: Record<string, React.ReactNode> = {
  'A': <ShieldCheck size={18} />,
  'B': <Handshake size={18} />,
  'C': <Zap size={18} />,
  'D': <Target size={18} />,
  'E': <ClipboardCheck size={18} />,
  'F': <TrendingUp size={18} />,
  'G': <Award size={18} />,
};

interface EvaluationPageProps {
  params: Promise<{ id: string }>;
}

export default function EvaluationPage({ params }: EvaluationPageProps) {
  const router = useRouter();
  const { id } = use(params);
  
  const [employee, setEmployee] = useState<User | null>(null);
  const [activeGroupId, setActiveGroupId] = useState('A');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const found = mockUsers.find(u => u.id === id);
    if (found) {
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
    <div className="w-full space-y-8 p-4 md:p-8 animate-in fade-in duration-500">
      {/* Header & Back Button */}
      <div className="flex flex-col gap-6">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-outline hover:text-primary transition-colors group w-fit"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium">Quay lại danh sách</span>
        </button>

        <div className="bg-white rounded-3xl border border-outline-variant p-6 md:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center text-primary overflow-hidden border-2 border-white shadow-lg">
                {employee.avatar ? (
                  <Image src={employee.avatar} alt={employee.name} width={96} height={96} className="object-cover" />
                ) : (
                  <UserIcon size={48} />
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-white"></div>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl font-black text-on-surface tracking-tight">{employee.name}</h1>
                  <span className={`
                    px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                    ${isLeader ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}
                  `}>
                    {employee.role}
                  </span>
                </div>
                <p className="text-outline font-medium flex items-center gap-2 mt-1">
                  Mã NV: <span className="text-on-surface">{employee.employeeCode}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-outline">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <p className="text-outline font-medium">Bộ phận</p>
                    <p className="font-bold text-on-surface">QAQC Line 1</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-outline">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="text-outline font-medium">Ngày vào làm</p>
                    <p className="font-bold text-on-surface">{employee.joinDate || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="xl:col-span-3 space-y-8">
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
                  
                  {/* Icon box */}
                  <div className={`relative z-20 flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 shrink-0 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                  }`}>
                    {groupIcons[group.id] || <ShieldCheck size={18} />}
                  </div>
                  
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
            onScoreChange={handleScoreChange} 
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
                  <button onClick={() => navigateTo(currentIdx - 1)} className="flex items-center gap-2 font-bold text-primary hover:underline">
                    <ArrowLeft size={20} />
                    Nhóm trước
                  </button>
                ) : <div />}
                {currentIdx < criteriaGroups.length - 1 ? (
                  <button onClick={() => navigateTo(currentIdx + 1)} className="flex items-center gap-2 font-bold text-primary hover:underline bg-primary/5 px-6 py-3 rounded-2xl">
                    Nhóm tiếp theo
                    <ChevronRight size={20} />
                  </button>
                ) : <div />}
              </div>
            );
          })()}
        </div>

        {/* Sidebar Summary */}
        <div className="xl:col-span-1">
          <ScoreSummary 
            scores={scores} 
            isLeader={isLeader} 
            onSave={handleSave}
            isSaving={isSaving}
          />
        </div>
      </div>
    </div>
  );
}
