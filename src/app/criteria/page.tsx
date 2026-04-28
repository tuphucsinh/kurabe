'use client';

import { useState } from 'react';
import { 
  gradingLeader, 
  gradingStaff,
  allCriteria,
  Criterion,
  CriteriaGroup,
  CriteriaRole
} from '@/data/criteria';
import Tabs from '@/components/ui/Tabs';
import { 
  Users, 
  UserCheck, 
  Award, 
  Info, 
  ShieldCheck, 
  Zap, 
  Handshake, 
  ClipboardCheck,
  TrendingUp,
  Target,
  Search,
  Pencil,
  Plus
} from 'lucide-react';
import { motion } from 'framer-motion';
import CriteriaModal from '@/components/modals/CriteriaModal';
import CriteriaGroupModal from '@/components/modals/CriteriaGroupModal';

function getCriteriaForRoleLocal(criteria: CriteriaGroup[], role: CriteriaRole): CriteriaGroup[] {
  const targetAppliesTo = role === 'Leader' ? 'leader' : 'staff';
  return criteria.map(group => {
    const filteredCriteria = group.criteria.filter(
      c => c.appliesTo === 'both' || c.appliesTo === targetAppliesTo
    );
    return { ...group, criteria: filteredCriteria };
  });
}

const groupIcons: Record<string, React.ReactNode> = {
  'A': <ShieldCheck size={18} />,
  'B': <Handshake size={18} />,
  'C': <Zap size={18} />,
  'D': <Target size={18} />,
  'E': <ClipboardCheck size={18} />,
  'F': <TrendingUp size={18} />,
  'G': <Award size={18} />,
};



export default function CriteriaPage() {
  const [localCriteria, setLocalCriteria] = useState<CriteriaGroup[]>(allCriteria);
  const [activeType, setActiveType] = useState('leader');
  const [activeGroupId, setActiveGroupId] = useState('A');
  const [searchQuery, setSearchQuery] = useState('');

  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<Criterion | null>(null);
  const [editingGroup, setEditingGroup] = useState<CriteriaGroup | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string>('');

  const tabs = [
    { id: 'leader', label: 'Quản lý / Có chức vụ', icon: <UserCheck size={18} /> },
    { id: 'staff', label: 'Nhân viên (Staff)', icon: <Users size={18} /> },
  ];

  const currentCriteria = activeType === 'leader' ? getCriteriaForRoleLocal(localCriteria, 'Leader') : getCriteriaForRoleLocal(localCriteria, 'Employee');
  const currentGrading = activeType === 'leader' ? gradingLeader : gradingStaff;

  // Reset activeGroupId when switching type if current id doesn't exist
  const validGroupIds = currentCriteria.map(g => g.id);
  const safeGroupId = validGroupIds.includes(activeGroupId) ? activeGroupId : (validGroupIds[0] || '');

  const activeGroup = currentCriteria.find(g => g.id === safeGroupId) || currentCriteria[0];

  const handleSaveCriterion = (criterion: Criterion, groupId: string) => {
    setLocalCriteria(prev => prev.map(g => {
      if (g.id === groupId) {
        const exists = g.criteria.find(c => c.id === criterion.id);
        if (exists) {
          return { ...g, criteria: g.criteria.map(c => c.id === criterion.id ? criterion : c) };
        } else {
          return { ...g, criteria: [...g.criteria, criterion] };
        }
      }
      return g;
    }));
  };

  const handleSaveGroup = (group: { id: string; name: string; shortName: string }) => {
    setLocalCriteria(prev => {
      const exists = prev.find(g => g.id === group.id);
      if (exists) {
        return prev.map(g => g.id === group.id ? { ...g, name: group.name, shortName: group.shortName } : g);
      } else {
        return [...prev, { id: group.id, name: group.name, shortName: group.shortName, criteria: [] }];
      }
    });
    setActiveGroupId(group.id);
  };

  // Filter criteria within active group by search
  const filteredCriteria = searchQuery && activeGroup
    ? activeGroup.criteria.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : (activeGroup?.criteria || []);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface tracking-tight">Tiêu chuẩn Đánh giá</h1>
          <p className="text-outline mt-1 text-lg">Hệ thống tiêu chuẩn xếp loại và thang điểm Kurabe</p>
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full md:w-auto">
          <Tabs 
            tabs={tabs} 
            activeTab={activeType} 
            onChange={(id) => { setActiveType(id); setActiveGroupId('A'); }}
            className="w-full md:w-auto"
          />
          <button
            onClick={() => {
              setEditingCriterion(null);
              setEditingGroupId(safeGroupId);
              setCriteriaModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus size={18} />
            Thêm tiêu chuẩn
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-outline">
          <Search size={20} />
        </div>
        <input
          type="text"
          placeholder="Tìm kiếm tiêu chí, nhóm hoặc mã số..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white border border-outline-variant rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="xl:col-span-3 space-y-8">
          {/* Group Navigation Tabs - pill style */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
            {currentCriteria.map((group) => {
              const isActive = safeGroupId === group.id;
              const displayName = group.shortName || group.name;

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
                      layoutId="criteriaActiveTab"
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
                      {displayName}
                    </span>
                  </div>

                  {/* Badge - criteria count */}
                  <div className="relative z-20 ml-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white/70' : 'bg-surface text-outline'
                    }`}>
                      {group.criteria.length}
                    </span>
                  </div>
                </button>
              );
            })}
            
            {/* Add Group Button */}
            <button
              onClick={() => {
                setEditingGroup(null);
                setGroupModalOpen(true);
              }}
              className="flex items-center justify-center w-12 h-12 rounded-2xl border border-dashed border-outline-variant bg-surface hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all duration-300 shrink-0 text-outline"
              title="Thêm nhóm tiêu chuẩn"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Active Group Title */}
          <div className="flex items-center gap-4">
            <div className="h-10 w-1.5 bg-primary rounded-full"></div>
            <h2 className="text-2xl font-black text-on-surface flex items-center gap-3">
              Nhóm {safeGroupId}: {activeGroup?.name}
              {activeGroup && (
                <button
                  onClick={() => {
                    setEditingGroup(activeGroup);
                    setGroupModalOpen(true);
                  }}
                  className="p-1.5 text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  title="Sửa nhóm"
                >
                  <Pencil size={18} />
                </button>
              )}
            </h2>
          </div>

          {/* Criteria List - same style as evaluation detail */}
          {filteredCriteria.length > 0 ? (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              {filteredCriteria.map((criterion) => (
                <div key={criterion.id} className="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm hover:border-primary/20 transition-all duration-300">
                  <div className="px-6 py-2.5 bg-surface border-b border-outline-variant flex justify-between items-center">
                    <h3 className="font-bold text-on-surface flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[10px] font-black bg-white text-primary px-1.5 py-0.5 rounded border border-primary/20 shrink-0">
                        {criterion.id}
                      </span>
                      <span className="shrink-0">{criterion.name}</span>
                      {criterion.appliesTo === 'leader' && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Chỉ QL</span>
                      )}
                      {criterion.appliesTo === 'staff' && (
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full shrink-0">Chỉ NV</span>
                      )}
                      {criterion.description && (
                        <span className="text-sm font-normal text-outline">
                          — {criterion.description}
                        </span>
                      )}
                    </h3>
                    
                    <button
                      onClick={() => {
                        setEditingCriterion(criterion);
                        setEditingGroupId(safeGroupId);
                        setCriteriaModalOpen(true);
                      }}
                      className="p-2 text-outline hover:text-primary hover:bg-primary/10 rounded-xl transition-colors shrink-0"
                    >
                      <Pencil size={18} />
                    </button>
                  </div>
                  
                  <div className="p-2 md:p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
                    {criterion.levels.map((level, idx) => (
                      <div
                        key={idx}
                        className="relative p-3 rounded-xl border border-outline-variant text-left group hover:border-primary/30 hover:bg-surface transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`
                            shrink-0 text-sm font-black px-2 py-0.5 rounded
                            ${level.points > 0 ? 'bg-green-50 text-green-700' :
                              level.points < 0 ? 'bg-red-50 text-red-700' :
                              'bg-surface text-outline'}
                          `}>
                            {level.points > 0 ? `+${level.points}` : level.points}
                          </span>
                          <p className="text-sm leading-snug flex-1 text-on-surface-variant">
                            {level.label}
                          </p>
                        </div>
                        {level.description && (
                          <div className="mt-2 flex items-start gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <Info size={12} className="shrink-0 mt-0.5" />
                            <p className="text-[10px] italic">{level.description}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center bg-surface rounded-3xl border border-dashed border-outline-variant">
              <p className="text-outline">Không tìm thấy tiêu chí nào khớp với &quot;{searchQuery}&quot;</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="mt-4 text-primary font-medium hover:underline"
              >
                Xóa tìm kiếm
              </button>
            </div>
          )}
        </div>

        {/* Sidebar: Grading Summary */}
        <div className="space-y-6">
          <div className="sticky top-8">
            <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
              <div className="bg-primary px-6 py-4 flex items-center gap-3">
                <Award className="text-white" size={20} />
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Thang điểm Xếp loại</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {currentGrading.map((g) => (
                    <div key={g.grade} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg transition-transform group-hover:scale-110
                          ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' : 
                            g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                            g.grade === 'B' ? 'bg-green-100 text-green-700' :
                            'bg-surface text-outline'}
                        `}>
                          {g.grade}
                        </div>
                        <span className="font-semibold text-on-surface">Hạng {g.grade}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-outline">
                          {g.minScore && g.maxScore 
                            ? `${g.minScore} - ${g.maxScore}` 
                            : g.minScore 
                            ? `Trên ${g.minScore}` 
                            : `Dưới ${g.maxScore}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-4 bg-surface rounded-xl border border-outline-variant">
                  <div className="flex gap-3 text-sm text-on-surface-variant">
                    <Info size={16} className="text-primary shrink-0 mt-0.5" />
                    <p>Hệ thống tự động xếp loại dựa trên tổng điểm đánh giá của tất cả các nhóm tiêu chí.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CriteriaModal
        isOpen={criteriaModalOpen}
        onClose={() => setCriteriaModalOpen(false)}
        onSave={handleSaveCriterion}
        criterion={editingCriterion}
        groupId={editingGroupId}
        groups={localCriteria}
      />

      <CriteriaGroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSave={handleSaveGroup}
        group={editingGroup}
        existingGroupIds={localCriteria.map(g => g.id)}
      />
    </div>
  );
}
