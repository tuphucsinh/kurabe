'use client';

import React, { useState } from 'react';
import { X, Users, User as UserIcon } from 'lucide-react';
import { Team } from '@/types';
import { useUsers } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { roleLabel } from '@/lib/role-policy';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (team: Partial<Team>) => void;
  team?: Team | null;
}

export default function TeamModal({ isOpen, onClose, onSave, team }: TeamModalProps) {
  const { user } = useAuth();
  // Modal chỉ Manager mở — truyền requester để hook enabled && scope đúng (C2)
  const { data: users = [] } = useUsers(user);
  // Init từ props + parent truyền key={team?.id ?? 'new'} để đổi đối tượng → remount (state reset)
  const [formData, setFormData] = useState<Partial<Team>>({
    name: team?.name ?? '',
    leaderId: team?.leaderId || '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
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
          <h2 className="text-lg font-bold text-ink">
            {team ? 'Chỉnh sửa nhóm' : 'Thêm nhóm mới'}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-2">
              <Users size={14} />
              Tên nhóm
            </label>
            <input
              type="text"
              required
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-outline-soft focus:border-brand focus:ring-4 focus:ring-brand/30 outline-none transition-all text-ink bg-surface-raised"
              placeholder="Nhập tên nhóm..."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-ink-muted uppercase tracking-wider flex items-center gap-2">
              <UserIcon size={14} />
              Trưởng nhóm (Leader)
            </label>
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-outline-soft focus:border-brand focus:ring-4 focus:ring-brand/30 outline-none transition-all text-ink bg-surface-raised"
              value={formData.leaderId || ''}
              onChange={(e) => setFormData({ ...formData, leaderId: e.target.value })}
            >
              <option value="">-- Chọn trưởng nhóm --</option>
              {users.filter((u) => u.role === 'Leader').map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({roleLabel(user.role)})
                </option>
              ))}
            </select>
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
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-brand hover:bg-brand-mid shadow-md shadow-brand/20 transition-all"
            >
              {team ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
