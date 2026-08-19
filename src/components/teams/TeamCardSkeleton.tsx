import { Users, User as UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import TeamEvaluationCell from '@/components/teams/TeamEvaluationCell';

export default function TeamCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-sm flex flex-col overflow-hidden">
      {/* Card Header */}
      <div className="p-6 pb-5">
        <div className="flex justify-between items-start mb-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Users size={22} />
          </div>
        </div>
        <div className="mb-1.5 h-7 flex items-center">
          <Skeleton variant="text" width={140} height={20} className="rounded" />
        </div>
        <p className="text-sm text-outline flex items-center gap-1.5">
          <UserIcon size={14} />
          Leader: <Skeleton variant="text" width={80} height={16} className="rounded inline-block" />
        </p>
      </div>

      {/* Card Body */}
      <div className="px-6 pb-6 flex-1">
        <TeamEvaluationCell skeleton />
      </div>
    </div>
  );
}
