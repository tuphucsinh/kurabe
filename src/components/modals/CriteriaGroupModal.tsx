'use client';

import React, { useState, useMemo } from 'react';
import { X, Layers, Tag } from 'lucide-react';
import { CriteriaGroup, CriteriaSetKey } from '@/types';

interface CriteriaGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (group: { id: string; code: string; name: string; shortName: string; setKey?: CriteriaSetKey }) => void;
  group?: CriteriaGroup | null;
  existingGroupIds?: string[];
  setKey?: CriteriaSetKey;
  disabled?: boolean;
}

export default function CriteriaGroupModal({ 
  isOpen, 
  onClose, 
  onSave, 
  group,
  existingGroupIds = [],
  setKey,
  disabled = false,
}: CriteriaGroupModalProps) {
  const [code, setCode] = useState(group?.code || '');
  const [name, setName] = useState(group?.name || '');
  const [shortName, setShortName] = useState(group?.shortName || '');
  const [error, setError] = useState('');

  const initialCode = group?.code || '';
  const initialName = group?.name || '';
  const initialShortName = group?.shortName || '';

  const isChanged = useMemo(() => {
    if (!group) {
      return code.trim().length > 0 && name.trim().length > 0;
    }
    return code !== initialCode || name.trim() !== initialName.trim() || shortName.trim() !== initialShortName.trim();
  }, [group, code, name, shortName, initialCode, initialName, initialShortName]);

  const isValid = useMemo(() => {
    return code.length === 1 && /^[A-Z]$/.test(code) && name.trim().length > 0;
  }, [code, name]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (disabled || !isChanged || !isValid) return;

    // Validate 1 uppercase char
    if (code.length !== 1 || !/^[A-Z]$/.test(code)) {
      setError('Mã nhóm phải là 1 ký tự chữ cái in hoa (A-Z).');
      return;
    }

    // Validate unique on Add within active set
    if (!group && existingGroupIds.includes(code)) {
      setError('Mã nhóm đã tồn tại trong bộ tiêu chí này.');
      return;
    }

    onSave({ 
      id: group?.id || '',
      code,
      name: name.trim(), 
      shortName: shortName.trim() || name.trim().split(' ')[0],
      setKey: setKey || (group?.setKey as CriteriaSetKey) || undefined,
    });
    onClose();
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    setCode(val);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-surface-raised rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-soft/60 flex items-center justify-between bg-surface-muted/50">
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Layers size={20} className="text-brand" />
            {group ? 'Chỉnh sửa nhóm' : 'Thêm nhóm mới'}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form id="group-form" onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-2">
              <Tag size={14} />
              Mã nhóm
            </label>
            <input
              type="text"
              required
              readOnly={!!group}
              autoFocus={!group}
              className="w-full px-4 py-2.5 rounded-xl border border-outline-soft focus:border-brand focus:ring-4 focus:ring-brand/30 outline-none transition-all text-ink read-only:bg-surface-muted read-only:text-ink-muted read-only:cursor-not-allowed font-mono"
              placeholder="VD: A, B, C..."
              value={code}
              onChange={handleCodeChange}
              maxLength={1}
            />
            {!group && (
              <p className="text-xs text-ink-muted">1 ký tự in hoa (A-Z)</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-2">
              <Layers size={14} />
              Tên nhóm (Đầy đủ)
            </label>
            <input
              type="text"
              required
              autoFocus={!!group}
              className="w-full px-4 py-2.5 rounded-xl border border-outline-soft focus:border-brand focus:ring-4 focus:ring-brand/30 outline-none transition-all text-ink"
              placeholder="VD: Tính kỷ luật (Discipline)..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-2">
              <Tag size={14} />
              Tên ngắn (Tab hiển thị)
            </label>
            <input
              type="text"
              className="w-full px-4 py-2.5 rounded-xl border border-outline-soft focus:border-brand focus:ring-4 focus:ring-brand/30 outline-none transition-all text-ink"
              placeholder="VD: Kỷ luật"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
            />
            <p className="text-[11px] text-ink-muted">Dùng để hiển thị trên thanh tab (nên ngắn gọn).</p>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-ink-muted hover:text-ink hover:bg-surface-muted transition-all"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={disabled || !isChanged || !isValid}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-brand hover:bg-brand-mid shadow-md shadow-brand/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {group ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
