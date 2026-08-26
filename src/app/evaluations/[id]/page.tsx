import { resolveActiveEvaluationPeriodScope } from '@/lib/db/evaluation-period-scope-admin';
import EvaluationPageClient from './EvaluationPageClient';

interface EvaluationPageProps {
  params: Promise<{ id: string }>;
}

export default async function EvaluationPage({ params }: EvaluationPageProps) {
  const { id } = await params;
  const scope = await resolveActiveEvaluationPeriodScope();

  return <EvaluationPageClient employeeId={id} scope={scope} />;
}
