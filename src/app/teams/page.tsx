import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import TeamsClient from '@/components/teams/TeamsClient';

/**
 * Server shell (D6): auth guard phía server — Employee về phiếu của mình,
 * chưa đăng nhập về /login. UI + data tiếp tục ở client component (react-query).
 */
export default async function TeamsPage() {
  const viewer = await getSessionUser();
  if (!viewer) redirect('/login');
  if (viewer.role === 'Employee') redirect(`/evaluations/${viewer.id}`);
  return <TeamsClient />;
}
