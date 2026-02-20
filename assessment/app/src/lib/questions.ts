import assessmentData from "../../questions.json";
import type { AssessmentData, MaturityQuestion, Answer } from "./types";

const data = assessmentData as unknown as AssessmentData;

export function getAssessmentData(): AssessmentData {
  return data;
}

export function getMaturityQuestions(): MaturityQuestion[] {
  return data.maturityQuestions;
}

export function getMarketResearchQuestions() {
  return data.marketResearchQuestions;
}

export function getCapabilities() {
  return data.capabilities;
}

export function getScreening() {
  return data.screening;
}

export function shuffleAnswers(answers: Answer[]): Answer[] {
  const shuffled = [...answers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
