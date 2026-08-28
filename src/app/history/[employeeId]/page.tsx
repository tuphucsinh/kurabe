import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isIndividualRole } from '@/lib/role-policy';
import { getEvaluationHistoryAdmin } from '@/lib/db/evaluation-history-admin';
import EvaluationHistoryPage from '@/components/evaluation/EvaluationHistoryPage';

interface HistoryPageProps {
  params: Promise<{ employeeId: string }>;
}

/**
 * Server page route for read-only employee evaluation history (/history/[employeeId]).
 *
 * Auth & RBAC rules:
 * 1. Bắt buộc đăng nhập; nếu chưa đăng nhập -> chuyển hướng về /login.
 * 2. Nhân viên cá nhân (Employee/Worker) truy cập ID người khác -> chuyển hướng về /history/[chính mình].
 * 3. Dữ liệu được query server-side bằng getEvaluationHistoryAdmin với server-only auth guard.
 */
export default async function HistoryPage({ params }: HistoryPageProps) {
  const { employeeId } = await params;
  const viewer = await getSessionUser();

  if (!viewer) {
    redirect('/login');
  }

  if (isIndividualRole(viewer.role) && viewer.id !== employeeId) {
    redirect(`/history/${viewer.id}`);
  }

  const { target, entries } = await getEvaluationHistoryAdmin(employeeId, viewer);

  return (
    <EvaluationHistoryPage
      target={target}
      entries={entries}
      viewer={viewer}
    />
  );
}
