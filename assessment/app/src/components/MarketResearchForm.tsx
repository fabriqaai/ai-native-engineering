"use client";

import { useState } from "react";
import type { MarketResearchQuestion, MarketResearchAnswers } from "@/lib/types";

interface MarketResearchFormProps {
  questions: MarketResearchQuestion[];
  onComplete: (answers: MarketResearchAnswers) => void;
}

export default function MarketResearchForm({
  questions,
  onComplete,
}: MarketResearchFormProps) {
  const [answers, setAnswers] = useState<MarketResearchAnswers>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});

  function handleSingleSelect(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { selected: value } }));
  }

  function handleMultiSelect(questionId: string, value: string, maxSelections?: number) {
    setAnswers((prev) => {
      const current = (prev[questionId] as { selected: string[] })?.selected ?? [];
      const updated = current.includes(value)
        ? current.filter((v: string) => v !== value)
        : maxSelections && current.length >= maxSelections
          ? current
          : [...current, value];
      return { ...prev, [questionId]: { selected: updated } };
    });
  }

  function handleOpenText(questionId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { text } }));
  }

  function handleSubmit() {
    // Merge "other" text into answers
    const finalAnswers = { ...answers };
    for (const [qId, text] of Object.entries(otherText)) {
      if (text.trim()) {
        const existing = finalAnswers[qId] as Record<string, unknown> ?? {};
        finalAnswers[qId] = { ...existing, other: text };
      }
    }
    onComplete(finalAnswers);
  }

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <h3 className="text-lg font-semibold mb-2">
          Help shape the future of AI coding tools
        </h3>
        <p className="text-muted text-sm">
          Optional — your answers help us understand how developers work with AI
        </p>
      </div>

      {questions.map((q) => (
        <div key={q.id} className="space-y-3">
          <label className="text-sm font-medium">{q.prompt}</label>

          {q.type === "single-select" && q.options && (
            <div className="space-y-2">
              {q.options.map((opt) => {
                const isSelected =
                  (answers[q.id] as { selected?: string })?.selected === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => handleSingleSelect(q.id, opt)}
                    className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-all cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : "border-border bg-card hover:border-accent/50"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
              {q.allowOther && (
                <input
                  type="text"
                  placeholder="Other..."
                  value={otherText[q.id] ?? ""}
                  onChange={(e) =>
                    setOtherText((prev) => ({
                      ...prev,
                      [q.id]: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          {q.type === "multi-select" && q.options && (
            <div className="space-y-2">
              {q.maxSelections && (
                <p className="text-xs text-muted">
                  Select up to {q.maxSelections}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => {
                  const selected =
                    (answers[q.id] as { selected?: string[] })?.selected ?? [];
                  const isSelected = selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() =>
                        handleMultiSelect(q.id, opt, q.maxSelections)
                      }
                      className={`px-3 py-1.5 rounded-full border text-sm transition-all cursor-pointer ${
                        isSelected
                          ? "border-accent bg-accent/10 text-accent-light"
                          : "border-border bg-card hover:border-accent/50"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {q.allowOther && (
                <input
                  type="text"
                  placeholder="Other..."
                  value={otherText[q.id] ?? ""}
                  onChange={(e) =>
                    setOtherText((prev) => ({
                      ...prev,
                      [q.id]: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          {q.type === "open-text" && (
            <textarea
              placeholder={q.placeholder ?? "Your answer..."}
              maxLength={q.maxLength}
              value={(answers[q.id] as { text?: string })?.text ?? ""}
              onChange={(e) => handleOpenText(q.id, e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent resize-none"
            />
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        className="w-full py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer"
      >
        Generate Share Card
      </button>

      <button
        onClick={() => onComplete({})}
        className="w-full py-2 text-muted text-sm hover:text-foreground transition-colors cursor-pointer"
      >
        Skip and see my card
      </button>
    </div>
  );
}
