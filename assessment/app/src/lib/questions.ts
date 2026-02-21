import fallbackAssessmentData from "../../questions.json";
import type {
  ActiveSurveyResponse,
  AssessmentData,
  MaturityQuestion,
  Answer,
} from "./types";

const fallbackData = fallbackAssessmentData as unknown as AssessmentData;

const fallbackSurveyResponse: ActiveSurveyResponse = {
  survey: {
    id: "local-fallback",
    versionNumber: 0,
    name: "Local Fallback Survey",
    status: "active",
    activatedAt: null,
    sourceChecksum: "local-dev-fallback",
  },
  data: fallbackData,
};

export function getFallbackSurveyResponse(): ActiveSurveyResponse {
  return fallbackSurveyResponse;
}

export function getAssessmentData(): AssessmentData {
  return fallbackData;
}

export function getMaturityQuestions(): MaturityQuestion[] {
  return fallbackData.maturityQuestions;
}

export function getMarketResearchQuestions() {
  return fallbackData.marketResearchQuestions;
}

export function getCapabilities() {
  return fallbackData.capabilities;
}

export function getScreening() {
  return fallbackData.screening;
}

export async function fetchActiveSurvey(): Promise<ActiveSurveyResponse> {
  const response = await fetch("/api/survey/active", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch active survey: ${response.status}`);
  }

  return (await response.json()) as ActiveSurveyResponse;
}

export async function fetchActiveSurveyWithFallback(): Promise<ActiveSurveyResponse> {
  try {
    return await fetchActiveSurvey();
  } catch {
    return getFallbackSurveyResponse();
  }
}

export function shuffleAnswers(answers: Answer[]): Answer[] {
  const shuffled = [...answers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
