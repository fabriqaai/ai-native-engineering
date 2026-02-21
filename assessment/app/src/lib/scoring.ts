import type {
  MaturityAnswers,
  AssessmentResult,
  CapabilityScore,
  AssessmentData,
} from "./types";

export function calculateResults(
  answers: MaturityAnswers,
  data: AssessmentData
): AssessmentResult {
  const capabilityScores: CapabilityScore[] = [];

  for (const cap of data.capabilities) {
    const capQuestions = data.maturityQuestions.filter(
      (question) => question.capability === cap.id
    );

    if (capQuestions.length === 0) {
      capabilityScores.push({
        id: cap.id,
        name: cap.name,
        radarLabel: cap.radarLabel,
        score: 0,
      });
      continue;
    }

    const levels = capQuestions.map((question) => answers[question.id] ?? 1);
    const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    const score = ((mean - 1) / 4) * 100;

    capabilityScores.push({
      id: cap.id,
      name: cap.name,
      radarLabel: cap.radarLabel,
      score: Math.round(score),
    });
  }

  const overallScore = Math.round(
    capabilityScores.reduce((sum, capability) => sum + capability.score, 0) /
      Math.max(capabilityScores.length, 1)
  );

  const archetype =
    data.archetypes.find(
      (candidate) =>
        overallScore >= candidate.scoreMin && overallScore <= candidate.scoreMax
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
