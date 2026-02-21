"use client";

import { useMemo, useState } from "react";
import type { Answer } from "@/lib/types";
import { shuffleAnswers } from "@/lib/questions";

interface QuestionCardProps {
  questionId: string;
  prompt: string;
  answers: Answer[];
  currentIndex: number;
  totalQuestions: number;
  onAnswer: (level: number) => void;
}

export default function QuestionCard({
  questionId,
  prompt,
  answers,
  currentIndex,
  totalQuestions,
  onAnswer,
}: QuestionCardProps) {
  const shuffled = useMemo(() => shuffleAnswers(answers), [answers]);
  const [selected, setSelected] = useState<number | null>(null);

  const handleSelect = (level: number) => {
    setSelected(level);
    setTimeout(() => onAnswer(level), 300);
  };

  const progress = ((currentIndex + 1) / totalQuestions) * 100;

  return (
    <div className="animate-fade-in" key={questionId}>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-muted mb-2">
          <span>
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-400 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <h2 className="text-xl md:text-2xl font-semibold mb-8 leading-relaxed">
        {prompt}
      </h2>

      {/* Answer options */}
      <div className="space-y-3">
        {shuffled.map((answer) => (
          <button
            key={answer.level}
            onClick={() => handleSelect(answer.level)}
            disabled={selected !== null}
            className={`w-full text-left p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
              selected === answer.level
                ? "border-accent bg-accent/10 text-foreground"
                : selected !== null
                  ? "border-border/50 text-muted/50"
                  : "border-border bg-card hover:border-accent/50 hover:bg-card-hover text-foreground"
            }`}
          >
            <span className="text-sm md:text-base leading-relaxed">
              {answer.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
