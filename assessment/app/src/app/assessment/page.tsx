"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchActiveSurveyWithFallback } from "@/lib/questions";
import type { AssessmentData, MaturityAnswers } from "@/lib/types";
import QuestionCard from "@/components/QuestionCard";

export default function AssessmentPage() {
  const router = useRouter();
  const [surveyData, setSurveyData] = useState<AssessmentData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<MaturityAnswers>({});
  const [showFraming, setShowFraming] = useState(true);
  const [processing, setProcessing] = useState(false);

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

  if (!surveyData) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted">Loading assessment...</p>
      </main>
    );
  }

  const questions = surveyData.maturityQuestions;
  const { metadata } = surveyData;
  const currentQuestion = questions[currentIndex];

  function handleAnswer(level: number) {
    if (!currentQuestion) return;

    const newAnswers = { ...answers, [currentQuestion.id]: level };
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setProcessing(true);
      sessionStorage.setItem("assessmentAnswers", JSON.stringify(newAnswers));
      setTimeout(() => {
        router.push("/results");
      }, 2000);
    }
  }

  if (questions.length === 0 || !currentQuestion) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted">No assessment questions are configured.</p>
      </main>
    );
  }

  if (processing) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center animate-pulse-slow">
          <div className="font-mono text-4xl mb-4 text-accent">...</div>
          <h2 className="text-xl font-semibold mb-2">Calculating your profile</h2>
          <p className="text-muted text-sm">
            Analyzing your responses across 7 capabilities
          </p>
        </div>
      </main>
    );
  }

  if (showFraming) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center animate-fade-in">
          <p className="text-lg text-muted leading-relaxed mb-8">
            {metadata.framingText}
          </p>
          <button
            onClick={() => setShowFraming(false)}
            className="px-8 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Start
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full">
        <QuestionCard
          key={currentQuestion.id}
          questionId={currentQuestion.id}
          prompt={currentQuestion.prompt}
          answers={currentQuestion.answers}
          currentIndex={currentIndex}
          totalQuestions={questions.length}
          onAnswer={handleAnswer}
        />
      </div>
    </main>
  );
}
