import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { isIndividualRole } from '@/lib/role-policy';

export default async function Home() {
  const user = await getSessionUser();
  if (isIndividualRole(user?.role)) {
    redirect(`/evaluations/${user?.id}`);
  }
  redirect('/dashboard');
}

