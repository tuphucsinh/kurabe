import { resolveActiveEvaluationPeriodScope } from '@/lib/db/evaluation-period-scope-admin';
import ComparePageClient from './ComparePageClient';

interface ComparePageProps {
  params: Promise<{ id: string }>;
}

export default async function ComparePage({ params }: ComparePageProps) {
  const { id } = await params;
  const scope = await resolveActiveEvaluationPeriodScope();

  return <ComparePageClient employeeId={id} scope={scope} />;
}
