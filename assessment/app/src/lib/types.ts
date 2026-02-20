export interface Answer {
  level: number;
  text: string;
}

export interface MaturityQuestion {
  id: string;
  group: "maturity";
  capability: string;
  prompt: string;
  answers: Answer[];
}

export interface MarketResearchQuestion {
  id: string;
  group: "market-research";
  type: "multi-select" | "single-select" | "open-text";
  prompt: string;
  options?: string[];
  maxSelections?: number;
  allowOther?: boolean;
  required?: boolean;
  enrichesCard?: boolean;
  cardDisplay?: string;
  placeholder?: string;
  maxLength?: number;
  fabriqaCategory: string;
}

export interface Capability {
  id: string;
  name: string;
  radarLabel: string;
  description: string;
  questionCount: number;
}

export interface Archetype {
  id: string;
  name: string;
  scoreMin: number;
  scoreMax: number;
  tagline: string;
  description: string;
  growthFocus: string;
}

export interface ScreeningOption {
  value: string;
  label: string;
  proceed: boolean;
}

export interface AssessmentData {
  version: string;
  metadata: {
    title: string;
    description: string;
    estimatedMinutes: number;
    totalMaturityQuestions: number;
    totalMarketResearchQuestions: number;
    answersPerMaturityQuestion: number;
    shuffleAnswers: boolean;
    framingText: string;
  };
  screening: {
    id: string;
    prompt: string;
    options: ScreeningOption[];
    fallbackResult: {
      archetype: string;
      name: string;
      tagline: string;
      description: string;
    };
  };
  capabilities: Capability[];
  archetypes: Archetype[];
  maturityQuestions: MaturityQuestion[];
  marketResearchQuestions: MarketResearchQuestion[];
}

export interface CapabilityScore {
  id: string;
  name: string;
  radarLabel: string;
  score: number;
}

export interface AssessmentResult {
  overallScore: number;
  capabilityScores: CapabilityScore[];
  archetype: Archetype;
  lowestCapabilities: CapabilityScore[];
}

export type MaturityAnswers = Record<string, number>;
export type MarketResearchAnswers = Record<string, unknown>;
