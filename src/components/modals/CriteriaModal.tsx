'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Criterion, CriteriaGroup, CriterionLevel, AppliesTo } from '@/data/criteria';

interface CriteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (criterion: Criterion, groupId: string) => void;
  criterion?: Criterion | null;
  groupId?: string;
  groups: CriteriaGroup[];
}

export default function CriteriaModal({ isOpen, onClose, onSave, criterion, groupId, groups }: CriteriaModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [idSuffix, setIdSuffix] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [appliesTo, setAppliesTo] = useState<AppliesTo>('both');
  const [levels, setLevels] = useState<CriterionLevel[]>([{ label: '', points: 0 }]);

  useEffect(() => {
    if (!isOpen) return;
    
    if (criterion) {
      const activeGroup = groupId || groups.find(g => g.criteria.some(c => c.id === criterion.id))?.id || groups[0]?.id || '';
      
      let suffix = criterion.id;
      if (suffix.startsWith(activeGroup)) {
        suffix = suffix.slice(activeGroup.length);
      }
      
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGroupId(activeGroup);
      setIdSuffix(suffix);
      setName(criterion.name);
      setDescription(criterion.description || '');
      setAppliesTo(criterion.appliesTo);
      setLevels(criterion.levels && criterion.levels.length > 0 
        ? criterion.levels.map(l => ({ ...l })) 
        : [{ label: '', points: 0 }]);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGroupId(groupId || groups[0]?.id || '');
      setIdSuffix('');
      setName('');
      setDescription('');
      setAppliesTo('both');
      setLevels([{ label: '', points: 0 }]);
    }
  }, [criterion, groupId, groups, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (levels.length === 0) return;
    
    const newCriterion: Criterion = {
      id: selectedGroupId + idSuffix,
      name,
      appliesTo,
      levels,
      ...(description.trim() ? { description: description.trim() } : {})
    };
    
    onSave(newCriterion, selectedGroupId);
    onClose();
  };

  const addLevel = () => {
    setLevels([...levels, { label: '', points: 0 }]);
  };

  const updateLevel = (index: number, field: keyof CriterionLevel, value: string | number) => {
    const newLevels = [...levels];
    newLevels[index] = { ...newLevels[index], [field]: value };
    setLevels(newLevels);
  };

  const removeLevel = (index: number) => {
    if (levels.length <= 1) return;
    setLevels(levels.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <h2 className="text-lg font-bold text-slate-800">
            {criterion ? 'Chỉnh sửa tiêu chuẩn' : 'Thêm tiêu chuẩn mới'}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">
          <form id="criteria-form" onSubmit={handleSubmit} className="space-y-2">
            
            {/* Row 1 & 2: Grid 4 columns - dùng style inline để đảm bảo Tailwind v4 không render sai */}
            <div 
              className="grid gap-x-4 gap-y-2 items-center"
              style={{ gridTemplateColumns: '84px 1fr 84px 200px' }}
            >
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[84px] text-right pr-4">
                Nhóm
              </label>
              <select
                required
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all text-sm text-slate-700 bg-white"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>[{g.id}] {g.name}</option>
                ))}
              </select>

              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[84px] text-right pr-4">
                Mã
              </label>
              <div className="relative w-full">
                <span className="absolute left-0 inset-y-0 flex items-center font-bold text-slate-500 bg-slate-50 border border-r-0 border-slate-200 rounded-l-lg px-2 pointer-events-none select-none text-sm">
                  {selectedGroupId}
                </span>
                <input
                  type="text"
                  required
                  pattern="\d+"
                  className="w-full pl-10 pr-3 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all text-sm text-slate-700"
                  placeholder="1, 2..."
                  value={idSuffix}
                  onChange={(e) => setIdSuffix(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[84px] text-right pr-4">
                Tên TC
              </label>
              <input
                type="text"
                required
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all text-sm text-slate-700"
                placeholder="VD: Vi phạm ATGT..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[84px] text-right pr-4">
                Áp dụng
              </label>
              <select
                required
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all text-sm text-slate-700 bg-white"
                value={appliesTo}
                onChange={(e) => setAppliesTo(e.target.value as AppliesTo)}
              >
                <option value="both">Leader & Staff</option>
                <option value="leader">Chỉ Leader</option>
                <option value="staff">Chỉ Staff</option>
              </select>
            </div>

            {/* Row 3: Mô tả */}
            <div className="flex items-start gap-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 pt-2 w-[84px] text-right pr-4">
                Mô tả
              </label>
              <textarea
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none transition-all text-sm text-slate-700 resize-none"
                placeholder="Mô tả chi tiết (không bắt buộc)..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>



            {/* Các mức điểm */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Các mức điểm (Options)
                </label>
                <button
                  type="button"
                  onClick={addLevel}
                  className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/15 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  Thêm option
                </button>
              </div>
              
              <div className="space-y-2">
                {levels.map((level, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      required
                      placeholder="Mô tả mức (VD: Rất tốt, 1 lần...)"
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none text-sm"
                      value={level.label}
                      onChange={(e) => updateLevel(idx, 'label', e.target.value)}
                    />
                    <div className="relative w-24">
                      <input
                        type="number"
                        required
                        placeholder="Điểm"
                        className="w-full pl-3 pr-8 py-2 rounded-lg border border-slate-200 focus:border-primary focus:ring-2 focus:ring-primary/10 outline-none text-sm text-right font-mono"
                        value={level.points === 0 && level.label === '' ? '' : level.points} // UX: allow empty initial state but required on submit
                        onChange={(e) => updateLevel(idx, 'points', Number(e.target.value))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">pt</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLevel(idx)}
                      disabled={levels.length <= 1}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="criteria-form"
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 transition-all"
          >
            {criterion ? 'Cập nhật' : 'Thêm mới'}
          </button>
        </div>

      </div>
    </div>
  );
}
