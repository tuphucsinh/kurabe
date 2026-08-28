import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isIndividualRole } from '@/lib/role-policy';
import TeamsClient from '@/components/teams/TeamsClient';

/**
 * Server shell (D6): chỉ Manager được vào danh sách nhóm.
 * Các role còn lại đi thẳng tới nhóm của mình; user chưa được gán nhóm
 * dùng fallback an toàn theo role, không bao giờ rơi vào danh sách toàn hệ thống.
 */
export default async function TeamsPage() {
  const viewer = await getSessionUser();
  if (!viewer) redirect('/login');
  if (viewer.role !== 'Manager') {
    if (viewer.teamId) redirect(`/teams/${viewer.teamId}`);
    if (isIndividualRole(viewer.role)) redirect(`/evaluations/${viewer.id}`);
    redirect('/dashboard');
  }
  return <TeamsClient />;
}
