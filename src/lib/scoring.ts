
import { gradingLeader, gradingStaff } from '@/data/criteria';

export type Grade = 'S' | 'A' | 'AB' | 'B' | 'C' | 'D';

export function calculateGrade(totalScore: number, isLeader: boolean): Grade {
  const grading = isLeader ? gradingLeader : gradingStaff;
  
  for (const range of grading) {
    const min = range.minScore ?? -Infinity;
    const max = range.maxScore ?? Infinity;
    
    if (totalScore >= min && totalScore <= max) {
      return range.grade as Grade;
    }
  }
  
  return 'D';
}

export function getGradeColor(grade: Grade): string {
  switch (grade) {
    case 'S': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'A':
    case 'AB': return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'B': return 'text-green-600 bg-green-50 border-green-200';
    case 'C': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'D': return 'text-red-600 bg-red-50 border-red-200';
    default: return 'text-outline bg-surface border-outline-variant';
  }
}
