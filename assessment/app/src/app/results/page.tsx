"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { calculateResults } from "@/lib/scoring";
import { getGrowthRecommendation } from "@/lib/archetypes";
import { fetchActiveSurveyWithFallback } from "@/lib/questions";
import type { AssessmentData, MaturityAnswers, MarketResearchAnswers } from "@/lib/types";
import RadarChart from "@/components/RadarChart";
import ShareCard from "@/components/ShareCard";
import MarketResearchForm from "@/components/MarketResearchForm";

type Phase = "results" | "market-research" | "share-card";

function ResultsContent() {
  const searchParams = useSearchParams();
  const isPreExplorer = searchParams.get("pre") === "true";
  const hasSubmittedRef = useRef(false);

  const [surveyData, setSurveyData] = useState<AssessmentData | null>(null);
  const [phase, setPhase] = useState<Phase>("results");
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [mrAnswers, setMrAnswers] = useState<MarketResearchAnswers>({});
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;

    fetchActiveSurveyWithFallback()
      .then((response) => {
        if (!active) return;
        setSurveyData(response.data);
      })
      .catch(() => {
        if (!active) return;
        setSurveyData(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const maturityAnswers = useMemo(() => {
    if (typeof window === "undefined" || isPreExplorer) {
      return null;
    }

    const stored = sessionStorage.getItem("assessmentAnswers");
    if (!stored) {
      return null;
    }

    try {
      return JSON.parse(stored) as MaturityAnswers;
    } catch {
      return null;
    }
  }, [isPreExplorer]);

  const result = useMemo(() => {
    if (!surveyData || !maturityAnswers) {
      return null;
    }

    return calculateResults(maturityAnswers, surveyData);
  }, [maturityAnswers, surveyData]);

  useEffect(() => {
    if (isPreExplorer || !result || !maturityAnswers || hasSubmittedRef.current) {
      return;
    }

    hasSubmittedRef.current = true;

    fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        screening_answer: "yes",
        answers: maturityAnswers,
        ...result,
      }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          assessmentId?: string;
          submissionId?: string;
        };
        const id = payload.assessmentId ?? payload.submissionId;
        if (id) {
          setAssessmentId(id);
        }
      })
      .catch(() => {});
  }, [isPreExplorer, maturityAnswers, result]);

  if (!surveyData) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted">Loading results...</p>
        </div>
      </main>
    );
  }

  if (isPreExplorer) {
    const fallback = surveyData.screening.fallbackResult;
    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full text-center animate-fade-in">
          <div className="font-mono text-5xl mb-4 text-muted">--</div>
          <h1 className="text-3xl font-bold mb-2">{fallback.name}</h1>
          <p className="text-muted italic mb-6">&ldquo;{fallback.tagline}&rdquo;</p>
          <p className="text-muted mb-8">{fallback.description}</p>
          <a
            href="https://ainative.engineering/resources/maturity-model"
            className="inline-block px-6 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors"
          >
            Learn about AI-Native Engineering
          </a>
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted">Loading results...</p>
        </div>
      </main>
    );
  }

  if (phase === "share-card") {
    const tools = (mrAnswers["M1"] as { selected?: string[] })?.selected;
    const teamSize = (mrAnswers["M7"] as { selected?: string })?.selected;

    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full animate-fade-in">
          <ShareCard result={result} tools={tools} teamSize={teamSize} />

          <div className="mt-8 max-w-lg mx-auto">
            <div className="p-6 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold mb-2">Get your full report</h3>
              <p className="text-xs text-muted mb-4">
                Receive detailed growth recommendations and join the AI-native
                engineering community.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => {
                    if (!email) return;

                    fetch("/api/submit", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email, assessmentId }),
                    }).catch(() => {});
                    setEmail("");
                  }}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          <div className="text-center mt-6">
            <a
              href="https://ainative.engineering"
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              ainative.engineering
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (phase === "market-research") {
    const mrQuestions = surveyData.marketResearchQuestions;

    return (
      <main className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-xl w-full animate-fade-in">
          <MarketResearchForm
            questions={mrQuestions}
            onComplete={(answers) => {
              setMrAnswers(answers);

              fetch("/api/submit", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  assessmentId,
                  marketResearch: answers,
                }),
              }).catch(() => {});

              setPhase("share-card");
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-2xl w-full animate-fade-in">
        <div className="text-center mb-10">
          <div className="font-mono text-6xl font-bold text-accent mb-3">
            {result.overallScore}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            {result.archetype.name}
          </h1>
          <p className="text-muted text-lg italic">
            &ldquo;{result.archetype.tagline}&rdquo;
          </p>
          <p className="text-muted text-sm mt-4 max-w-lg mx-auto">
            {result.archetype.description}
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <RadarChart scores={result.capabilityScores} size={320} />
        </div>

        <div className="space-y-3 mb-10">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
            Capability Scores
          </h3>
          {result.capabilityScores.map((capability) => (
            <div
              key={capability.id}
              className="flex items-center gap-4 p-3 rounded-lg bg-card border border-border"
            >
              <div className="font-mono text-lg w-10 text-right text-accent">
                {capability.score}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{capability.name}</div>
                <div className="h-1.5 bg-border rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{ width: `${capability.score}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-10">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Growth Areas
          </h3>
          <div className="space-y-3">
            {result.lowestCapabilities.map((capability) => (
              <div
                key={capability.id}
                className="p-4 rounded-lg bg-card border border-border"
              >
                <div className="text-sm font-medium mb-1">
                  {capability.name}{" "}
                  <span className="text-muted">({capability.score}/100)</span>
                </div>
                <p className="text-sm text-muted">
                  {getGrowthRecommendation(capability.id)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 mb-10">
          <p className="text-sm">
            <span className="font-semibold">Your growth focus: </span>
            {result.archetype.growthFocus}
          </p>
        </div>

        <div className="text-center">
          <button
            onClick={() => setPhase("market-research")}
            className="px-8 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Continue to Share Card
          </button>
          <button
            onClick={() => {
              setMrAnswers({});
              setPhase("share-card");
            }}
            className="block mx-auto mt-3 text-muted text-sm hover:text-foreground transition-colors cursor-pointer"
          >
            Skip to card
          </button>
        </div>
      </div>
    </main>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center">
          <p className="text-muted">Loading...</p>
        </main>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}
