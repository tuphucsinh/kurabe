import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';

export default async function Home() {
  const user = await getSessionUser();
  if (user?.role === 'Employee') {
    redirect(`/evaluations/${user.id}`);
  }
  redirect('/dashboard');
}

