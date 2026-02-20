"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getScreening } from "@/lib/questions";

export default function Home() {
  const router = useRouter();
  const screening = getScreening();
  const [showScreening, setShowScreening] = useState(false);

  function handleScreening(proceed: boolean) {
    if (proceed) {
      router.push("/assessment");
    } else {
      router.push("/results?pre=true");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-xl w-full text-center">
        {!showScreening ? (
          <div className="animate-fade-in">
            {/* Hero */}
            <div className="mb-2 text-xs uppercase tracking-widest text-muted">
              ainative.engineering
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
              AI-Native Maturity
              <br />
              <span className="text-accent">Assessment</span>
            </h1>
            <p className="text-muted text-lg mb-8 max-w-md mx-auto">
              Discover your AI-native engineering archetype in 3 minutes. 14
              behavioral questions, personalized results, and a shareable
              maturity card.
            </p>

            {/* Stats */}
            <div className="flex justify-center gap-8 mb-10 text-sm text-muted">
              <div>
                <div className="font-mono text-2xl text-foreground">14</div>
                questions
              </div>
              <div>
                <div className="font-mono text-2xl text-foreground">7</div>
                capabilities
              </div>
              <div>
                <div className="font-mono text-2xl text-foreground">~3</div>
                minutes
              </div>
            </div>

            <button
              onClick={() => setShowScreening(true)}
              className="px-8 py-4 rounded-lg bg-accent text-white font-medium text-lg hover:bg-accent/90 transition-colors cursor-pointer"
            >
              Take the Assessment
            </button>

            <p className="mt-6 text-xs text-muted">
              No account required. Your answers are anonymous.
            </p>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Screening question */}
            <h2 className="text-2xl font-semibold mb-8">
              {screening.prompt}
            </h2>
            <div className="space-y-3 max-w-sm mx-auto">
              {screening.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleScreening(opt.proceed)}
                  className="w-full p-4 rounded-lg border border-border bg-card hover:border-accent/50 hover:bg-card-hover text-foreground transition-all cursor-pointer"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
