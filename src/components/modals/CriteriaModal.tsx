'use client';

import React, { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Criterion, CriteriaGroup, CriteriaLevel } from '@/types';
import {
  CriterionAudience,
  CRITERION_AUDIENCES,
  mapRolesToAudiences,
  mapAudiencesToRoles
} from '@/lib/criteria-applicability';

interface CriteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (criterion: Criterion, groupId: string) => void;
  criterion?: Criterion | null;
  groupId?: string;
  groups: CriteriaGroup[];
}

const AUDIENCE_OPTIONS: { id: CriterionAudience; label: string }[] = [
  { id: 'management', label: 'Quản lý (QL)' },
  { id: 'employee', label: 'Nhân viên (NV)' },
  { id: 'worker', label: 'Công nhân (CN)' },
];

const DEFAULT_AUDIENCES: CriterionAudience[] = ['management', 'employee'];

export default function CriteriaModal({ isOpen, onClose, onSave, criterion, groupId, groups }: CriteriaModalProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [idSuffix, setIdSuffix] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedAudiences, setSelectedAudiences] = useState<CriterionAudience[]>(DEFAULT_AUDIENCES);
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [levels, setLevels] = useState<CriteriaLevel[]>([{ label: '', points: 0 }]);

  useEffect(() => {
    if (!isOpen) return;

    if (criterion) {
      const activeGroup = groupId || groups.find(g => g.criteria.some(c => c.id === criterion.id))?.id || groups[0]?.id || '';
      const activeGroupCode = groups.find(g => g.id === activeGroup)?.code || '';

      let suffix = criterion.code || '';
      if (activeGroupCode && suffix.startsWith(activeGroupCode)) {
        suffix = suffix.slice(activeGroupCode.length);
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGroupId(activeGroup);
      setIdSuffix(suffix);
      setName(criterion.name);
      setDescription(criterion.description || '');

      const mapped = criterion.appliesTo && criterion.appliesTo.length > 0
        ? mapRolesToAudiences(criterion.appliesTo)
        : DEFAULT_AUDIENCES;
      setSelectedAudiences(mapped.length > 0 ? mapped : DEFAULT_AUDIENCES);
      setAudienceError(null);

      setLevels(criterion.levels && criterion.levels.length > 0
        ? criterion.levels.map(l => ({ ...l }))
        : [{ label: '', points: 0 }]);
    } else {
      setSelectedGroupId(groupId || groups[0]?.id || '');
      setIdSuffix('');
      setName('');
      setDescription('');
      setSelectedAudiences(DEFAULT_AUDIENCES);
      setAudienceError(null);
      setLevels([{ label: '', points: 0 }]);
    }
  }, [criterion, groupId, groups, isOpen]);

  if (!isOpen) return null;

  const toggleAudience = (aud: CriterionAudience) => {
    setSelectedAudiences(prev => {
      const next = prev.includes(aud)
        ? prev.filter(a => a !== aud)
        : CRITERION_AUDIENCES.filter(a => prev.includes(a) || a === aud);
      if (next.length > 0) {
        setAudienceError(null);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (levels.length === 0) return;
    if (selectedAudiences.length === 0) {
      setAudienceError('Vui lòng chọn ít nhất một đối tượng áp dụng.');
      return;
    }

    const selectedGroupCode = groups.find(g => g.id === selectedGroupId)?.code || '';
    const roleAppliesTo = mapAudiencesToRoles(selectedAudiences);

    const newCriterion: Criterion = {
      id: criterion?.id || '',
      code: selectedGroupCode + idSuffix,
      name,
      appliesTo: roleAppliesTo,
      levels,
      ...(description.trim() ? { description: description.trim() } : {})
    };

    onSave(newCriterion, selectedGroupId);
    onClose();
  };

  const addLevel = () => {
    setLevels([...levels, { label: '', points: 0 }]);
  };

  const updateLevel = (index: number, field: keyof CriteriaLevel, value: string | number) => {
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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-surface-raised rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-soft flex items-center justify-between bg-surface-muted shrink-0">
          <h2 className="text-lg font-bold text-ink">
            {criterion ? 'Chỉnh sửa tiêu chuẩn' : 'Thêm tiêu chuẩn mới'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">
          <form id="criteria-form" onSubmit={handleSubmit} className="space-y-4">

            {/* Row 1: Nhóm & Mã */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider whitespace-nowrap w-[72px] text-right shrink-0">
                  Nhóm
                </label>
                <select
                  required
                  className="w-full px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-all text-sm text-ink bg-surface-raised"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>[{g.code}] {g.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider whitespace-nowrap w-[72px] text-right shrink-0">
                  Mã
                </label>
                <div className="relative w-full">
                  <span className="absolute left-0 inset-y-0 flex items-center font-bold text-ink-muted bg-surface-muted border border-r-0 border-outline-soft rounded-l-lg px-2 pointer-events-none select-none text-sm">
                    {groups.find(g => g.id === selectedGroupId)?.code || ''}
                  </span>
                  <input
                    type="text"
                    required
                    pattern="\d+"
                    className="w-full pl-10 pr-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-all text-sm text-ink bg-surface-raised"
                    placeholder="1, 2..."
                    value={idSuffix}
                    onChange={(e) => setIdSuffix(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
            </div>

            {/* Row 2: Tên TC */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider whitespace-nowrap w-[72px] text-right shrink-0">
                Tên TC
              </label>
              <input
                type="text"
                required
                className="flex-1 px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-all text-sm text-ink bg-surface-raised"
                placeholder="VD: Vi phạm ATGT..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Row 3: Áp dụng (3 checkboxes) */}
            <div className="flex items-start gap-2">
              <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider whitespace-nowrap w-[72px] text-right shrink-0 pt-3">
                Áp dụng
              </label>
              <div className="flex-1">
                <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2 border-0 p-0 m-0" aria-label="Đối tượng áp dụng">
                  <legend className="sr-only">Đối tượng áp dụng</legend>
                  {AUDIENCE_OPTIONS.map((opt) => {
                    const checked = selectedAudiences.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className="min-h-[44px] inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-ink font-medium hover:text-ink transition-colors focus-within:ring-2 focus-within:ring-brand-soft rounded-lg px-2 py-1"
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-outline-soft text-brand focus:ring-brand-soft focus:ring-2 cursor-pointer accent-brand"
                          checked={checked}
                          onChange={() => toggleAudience(opt.id)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </fieldset>
                {audienceError && (
                  <p className="text-xs text-rose-500 font-medium mt-1">{audienceError}</p>
                )}
              </div>
            </div>

            {/* Row 4: Mô tả */}
            <div className="flex items-start gap-2">
              <label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider whitespace-nowrap w-[72px] text-right shrink-0 pt-2">
                Mô tả
              </label>
              <textarea
                className="flex-1 px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-all text-sm text-ink bg-surface-raised resize-none"
                placeholder="Mô tả chi tiết (không bắt buộc)..."
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Các mức điểm */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                  Các mức điểm (Options)
                </label>
                <button
                  type="button"
                  onClick={addLevel}
                  className="text-xs font-bold text-brand bg-brand-soft hover:bg-brand-soft/80 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
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
                      className="flex-1 px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none text-sm text-ink bg-surface-raised"
                      value={level.label}
                      onChange={(e) => updateLevel(idx, 'label', e.target.value)}
                    />
                    <div className="relative w-24">
                      <input
                        type="number"
                        required
                        placeholder="Điểm"
                        className="w-full pl-3 pr-8 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none text-sm text-right font-mono text-ink bg-surface-raised"
                        value={level.points === 0 && level.label === '' ? '' : level.points} // UX: allow empty initial state but required on submit
                        onChange={(e) => updateLevel(idx, 'points', Number(e.target.value))}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-muted font-bold">pt</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLevel(idx)}
                      disabled={levels.length <= 1}
                      className="p-2 text-ink-muted hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
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
        <div className="p-4 border-t border-outline-soft bg-surface-muted flex gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-ink-muted hover:text-ink hover:bg-surface-muted transition-all"
          >
            Hủy
          </button>
          <button
            type="submit"
            form="criteria-form"
            disabled={selectedAudiences.length === 0}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-brand hover:bg-brand-strong shadow-md shadow-brand/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {criterion ? 'Cập nhật' : 'Thêm mới'}
          </button>
        </div>

      </div>
    </div>
  );
}
