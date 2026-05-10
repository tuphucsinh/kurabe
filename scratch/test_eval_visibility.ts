import { getEvaluations } from '../src/lib/db/evaluations';
import { getUsers } from '../src/lib/db/users';

async function test() {
  const users = await getUsers();
  const leader = users.find(u => u.role === 'Leader');
  if (!leader) {
    console.log('No leader found');
    return;
  }
  
  console.log('Testing with Leader:', leader.name);
  const evals = await getEvaluations(leader);
  console.log('Total evaluations returned:', evals.length);
  
  // Check if any evaluation doesn't involve this leader
  const suspicious = evals.filter(e => !e.rounds.some(r => r.evaluatorId === leader.id));
  console.log('Evaluations NOT involving this leader:', suspicious.length);
}

test();
