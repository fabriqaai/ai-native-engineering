import type {
  MaturityAnswers,
  AssessmentResult,
  CapabilityScore,
} from "./types";
import { getAssessmentData } from "./questions";

export function calculateResults(answers: MaturityAnswers): AssessmentResult {
  const data = getAssessmentData();
  const capabilityScores: CapabilityScore[] = [];

  for (const cap of data.capabilities) {
    const capQuestions = data.maturityQuestions.filter(
      (q) => q.capability === cap.id
    );
    const levels = capQuestions.map((q) => answers[q.id] ?? 1);
    const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
    const score = ((mean - 1) / 4) * 100;

    capabilityScores.push({
      id: cap.id,
      name: cap.name,
      radarLabel: cap.radarLabel,
      score: Math.round(score),
    });
  }

  const overallScore = Math.round(
    capabilityScores.reduce((sum, c) => sum + c.score, 0) /
      capabilityScores.length
  );

  const archetype =
    data.archetypes.find(
      (a) => overallScore >= a.scoreMin && overallScore <= a.scoreMax
    ) ?? data.archetypes[0];

  const sorted = [...capabilityScores].sort((a, b) => a.score - b.score);
  const lowestCapabilities = sorted.slice(0, 2);

  return {
    overallScore,
    capabilityScores,
    archetype,
    lowestCapabilities,
  };
}
