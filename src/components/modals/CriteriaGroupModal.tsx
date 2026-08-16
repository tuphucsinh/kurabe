'use client';

import React, { useState, useEffect } from 'react';
import { X, Layers, Tag } from 'lucide-react';
import { CriteriaGroup } from '@/types';

interface CriteriaGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (group: { id: string; code: string; name: string; shortName: string }) => void;
  group?: CriteriaGroup | null;
  existingGroupIds?: string[];
}

export default function CriteriaGroupModal({ 
  isOpen, 
  onClose, 
  onSave, 
  group,
  existingGroupIds = [] 
}: CriteriaGroupModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    
    if (group) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCode(group.code || '');
      setName(group.name);
      setShortName(group.shortName || '');
    } else {
      setCode('');
      setName('');
      setShortName('');
    }
    setError('');
  }, [group, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate 1 uppercase char
    if (code.length !== 1 || !/^[A-Z]$/.test(code)) {
      setError('Mã nhóm phải là 1 ký tự chữ cái in hoa (A-Z).');
      return;
    }

    // Validate unique on Add
    if (!group && existingGroupIds.includes(code)) {
      setError('Mã nhóm đã tồn tại.');
      return;
    }

    onSave({ 
      id: group?.id || '', // UUID - giữ nguyên khi edit, rỗng khi add (Supabase tự gen)
      code,
      name: name.trim(), 
      shortName: shortName.trim() || name.trim().split(' ')[0] 
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
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Layers size={20} className="text-indigo-600" />
            {group ? 'Chỉnh sửa nhóm' : 'Thêm nhóm mới'}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
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
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Tag size={14} />
              Mã nhóm
            </label>
            <input
              type="text"
              required
              readOnly={!!group}
              autoFocus={!group}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700 read-only:bg-slate-50 read-only:text-slate-500 read-only:cursor-not-allowed font-mono"
              placeholder="VD: A, B, C..."
              value={code}
              onChange={handleCodeChange}
              maxLength={1}
            />
            {!group && (
              <p className="text-xs text-slate-400">1 ký tự in hoa (A-Z)</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Layers size={14} />
              Tên nhóm (Đầy đủ)
            </label>
            <input
              type="text"
              required
              autoFocus={!!group}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700"
              placeholder="VD: Tính kỷ luật (Discipline)..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Tag size={14} />
              Tên ngắn (Tab hiển thị)
            </label>
            <input
              type="text"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700"
              placeholder="VD: Kỷ luật"
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
            />
            <p className="text-[11px] text-slate-400">Dùng để hiển thị trên thanh tab (nên ngắn gọn).</p>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
            >
              {group ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
