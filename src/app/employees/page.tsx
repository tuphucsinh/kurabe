import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isIndividualRole } from '@/lib/role-policy';
import EmployeesClient from '@/components/employees/EmployeesClient';

/**
 * Server shell (D6): auth guard phía server — Employee/Worker về phiếu của mình,
 * chưa đăng nhập về /login. UI + data tiếp tục ở client component (react-query).
 */
export default async function EmployeesPage() {
  const viewer = await getSessionUser();
  if (!viewer) redirect('/login');
  if (isIndividualRole(viewer.role)) redirect(`/evaluations/${viewer.id}`);
  return <EmployeesClient initialViewer={viewer} />;
}
