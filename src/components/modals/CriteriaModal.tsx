'use client';

import React, { useState, useMemo } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Criterion, CriteriaGroup, CriteriaLevel, CriteriaSetKey } from '@/types';
import {
  setKeyToAudience,
  mapAudiencesToRoles,
} from '@/lib/criteria-applicability';

interface CriteriaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (criterion: Criterion, groupId: string) => void;
  criterion?: Criterion | null;
  groupId?: string;
  groups: CriteriaGroup[];
  setKey?: CriteriaSetKey;
  disabled?: boolean;
}

export default function CriteriaModal(props: CriteriaModalProps) {
  if (!props.isOpen) return null;

  const groupId = props.groupId
    || props.groups.find((group) => group.criteria.some((item) => item.id === props.criterion?.id))?.id
    || props.groups[0]?.id
    || '';

  return (
    <CriteriaModalForm
      {...props}
      groupId={groupId}
      key={JSON.stringify([props.criterion?.id ?? null, groupId, props.setKey ?? null])}
    />
  );
}

function CriteriaModalForm({
  onClose,
  onSave,
  criterion,
  groupId,
  groups,
  setKey,
  disabled = false,
}: Omit<CriteriaModalProps, 'isOpen'>) {
  const [initial] = useState(() => {
    const activeGroupId = groupId || groups[0]?.id || '';
    const groupCode = groups.find((group) => group.id === activeGroupId)?.code || '';
    const code = criterion?.code || '';
    return {
      groupId: activeGroupId,
      suffix: groupCode && code.startsWith(groupCode) ? code.slice(groupCode.length) : code,
      name: criterion?.name || '',
      description: criterion?.description || '',
      levels: criterion?.levels?.length
        ? criterion.levels.map((level) => ({ ...level }))
        : [{ label: '', points: 0 }],
    };
  });
  const [selectedGroupId, setSelectedGroupId] = useState(initial.groupId);
  const [idSuffix, setIdSuffix] = useState(initial.suffix);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [levels, setLevels] = useState<CriteriaLevel[]>(initial.levels);
  const initialGroupId = initial.groupId;
  const initialSuffix = initial.suffix;
  const initialName = initial.name;
  const initialDescription = initial.description;
  const initialLevels = initial.levels;

  const isLevelsChanged = useMemo(() => {
    if (levels.length !== initialLevels.length) return true;
    return levels.some((l, idx) => {
      const init = initialLevels[idx];
      if (!init) return true;
      return l.points !== init.points || l.label !== init.label || (l.description || '') !== (init.description || '');
    });
  }, [levels, initialLevels]);

  const isFormChanged = useMemo(() => {
    if (!criterion) {
      return name.trim().length > 0 && idSuffix.trim().length > 0 && levels.length > 0 && levels.every((l) => l.label.trim().length > 0);
    }
    const groupChanged = selectedGroupId !== initialGroupId;
    const suffixChanged = idSuffix !== initialSuffix;
    const nameChanged = name.trim() !== initialName.trim();
    const descChanged = (description || '').trim() !== (initialDescription || '').trim();
    return groupChanged || suffixChanged || nameChanged || descChanged || isLevelsChanged;
  }, [criterion, name, idSuffix, levels, selectedGroupId, initialGroupId, initialSuffix, initialName, initialDescription, description, isLevelsChanged]);

  const isValid = useMemo(() => {
    const selectedGroup = groups.find((g) => g.id === selectedGroupId);
    if (!selectedGroup) return false;
    const targetSet = setKey || selectedGroup.setKey || criterion?.setKey;
    if (setKey && selectedGroup.setKey && selectedGroup.setKey !== setKey) return false;
    if (targetSet && selectedGroup.setKey && selectedGroup.setKey !== targetSet) return false;

    return (
      idSuffix.trim() !== '' &&
      name.trim() !== '' &&
      levels.length > 0 &&
      levels.every((l) => l.label.trim() !== '' && typeof l.points === 'number' && !Number.isNaN(l.points))
    );
  }, [selectedGroupId, groups, setKey, criterion?.setKey, idSuffix, name, levels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !isFormChanged || disabled) return;

    const selectedGroup = groups.find((g) => g.id === selectedGroupId);
    if (!selectedGroup) return;
    const targetSet = setKey || selectedGroup.setKey || criterion?.setKey || null;
    if (setKey && selectedGroup.setKey && selectedGroup.setKey !== setKey) return;
    if (targetSet && selectedGroup.setKey && selectedGroup.setKey !== targetSet) return;

    const roleAppliesTo = targetSet ? mapAudiencesToRoles([setKeyToAudience(targetSet)]) : (criterion?.appliesTo || []);

    const newCriterion: Criterion = {
      id: criterion?.id || '',
      code: (selectedGroup.code || '') + idSuffix,
      name: name.trim(),
      description: description.trim(),
      appliesTo: roleAppliesTo,
      levels,
      setKey: targetSet,
      defaultLevelIndex: criterion?.defaultLevelIndex,
      weight: criterion?.weight ?? 0,
      sortOrder: criterion?.sortOrder,
      configVersion: criterion?.configVersion,
      configVersionId: criterion?.configVersionId,
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
            type="button"
            aria-label="Đóng"
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
                  id="criteria-group"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-all text-sm text-ink bg-surface-raised"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  {groups.map((g) => (
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
                    {groups.find((g) => g.id === selectedGroupId)?.code || ''}
                  </span>
                  <input
                    id="criteria-code-suffix"
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
                id="criteria-name"
                type="text"
                required
                className="flex-1 px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none transition-all text-sm text-ink bg-surface-raised"
                placeholder="VD: Vi phạm ATGT..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Row 3: Mô tả */}
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
                      id={`criteria-level-label-${idx}`}
                      type="text"
                      required
                      placeholder="Mô tả mức (VD: Rất tốt, 1 lần...)"
                      className="flex-1 px-3 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none text-sm text-ink bg-surface-raised"
                      value={level.label}
                      onChange={(e) => updateLevel(idx, 'label', e.target.value)}
                    />
                    <div className="relative w-24">
                      <input
                        id={`criteria-level-points-${idx}`}
                        type="number"
                        required
                        placeholder="Điểm"
                        className="w-full pl-3 pr-8 py-2 rounded-lg border border-outline-soft focus:border-brand focus:ring-2 focus:ring-brand-soft outline-none text-sm text-right font-mono text-ink bg-surface-raised"
                        value={level.points === 0 && level.label === '' ? '' : level.points}
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
            disabled={disabled || !isFormChanged || !isValid}
            className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-brand hover:bg-brand-strong shadow-md shadow-brand/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {criterion ? 'Cập nhật' : 'Thêm mới'}
          </button>
        </div>

      </div>
    </div>
  );
}
