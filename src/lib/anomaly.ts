import { Evaluation } from '@/types';

export interface Anomaly {
  evaluationId: string;
  employeeId: string;
  name: string;
  round: number;
  prevRound: number;
  prevScore: number;
  score: number;
  diff: number;
  severity: 'high' | 'medium';
}

/** Ngưỡng chênh lệch điểm giữa 2 vòng liên tiếp */
const HIGH_DIFF = 30;
const MEDIUM_DIFF = 20;

/**
 * Phát hiện đánh giá bất thường — RULE-BASED (chính xác 100%, không phải AI đoán):
 * chênh lệch điểm giữa 2 vòng liên tiếp ≥ 20 (medium) hoặc ≥ 30 (high).
 * Chỉ xét các round CÓ điểm thật (totalScore > 0).
 */
export function detectAnomalies(evaluations: Evaluation[], nameById: Map<string, string>): Anomaly[] {
  const anomalies: Anomaly[] = [];

  for (const ev of evaluations) {
    const scoredRounds = (ev.rounds || [])
      .filter((r) => (r.totalScore || 0) > 0)
      .sort((a, b) => a.round - b.round);

    for (let i = 1; i < scoredRounds.length; i++) {
      const prev = scoredRounds[i - 1];
      const curr = scoredRounds[i];
      const diff = Math.abs((curr.totalScore || 0) - (prev.totalScore || 0));

      if (diff >= MEDIUM_DIFF) {
        anomalies.push({
          evaluationId: ev.id,
          employeeId: ev.employeeId,
          name: nameById.get(ev.employeeId) || 'Không xác định',
          round: curr.round,
          prevRound: prev.round,
          prevScore: prev.totalScore || 0,
          score: curr.totalScore || 0,
          diff: Math.round(diff),
          severity: diff >= HIGH_DIFF ? 'high' : 'medium',
        });
      }
    }
  }

  return anomalies.sort((a, b) => b.diff - a.diff);
}
