import { Users, User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import TeamEvaluationCell from '@/components/teams/TeamEvaluationCell';

export default function TeamCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-sm flex flex-col overflow-hidden">
      {/* Card Header */}
      <div className="p-4 pb-3 md:p-4 md:pb-3">
        {/* Mobile Header Skeleton (< 768px) */}
        <div className="flex items-center gap-3 md:hidden">
          <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton variant="text" width={120} height={18} className="rounded" />
            <div className="text-xs text-outline flex items-center gap-1.5">
              <UserIcon size={12} className="shrink-0" />
              Leader: <Skeleton variant="text" width={70} height={14} className="rounded inline-block" />
            </div>
          </div>
        </div>

        {/* Desktop Header Skeleton (>= 768px) */}
        <div className="max-md:hidden">
          <div className="flex justify-between items-start mb-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Users size={20} />
            </div>
          </div>
          <div className="mb-1 h-7 flex items-center">
            <Skeleton variant="text" width={140} height={20} className="rounded" />
          </div>
          <div className="text-sm text-outline flex items-center gap-1.5">
            <UserIcon size={14} />
            Leader: <Skeleton variant="text" width={80} height={16} className="rounded inline-block" />
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="px-4 pb-4 md:px-4 md:pb-4 flex-1">
        <TeamEvaluationCell skeleton />
      </div>
    </div>
  );
}
