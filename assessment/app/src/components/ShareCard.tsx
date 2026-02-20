"use client";

import type { AssessmentResult } from "@/lib/types";
import RadarChart from "./RadarChart";

interface ShareCardProps {
  result: AssessmentResult;
  tools?: string[];
  teamSize?: string;
}

export default function ShareCard({ result, tools, teamSize }: ShareCardProps) {
  const handleDownload = async () => {
    // For now, use a simple canvas-based approach
    // In production, this would call the /api/card endpoint
    const cardEl = document.getElementById("share-card");
    if (!cardEl) return;

    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(cardEl, {
        backgroundColor: "#0d1117",
        scale: 2,
      });
      const link = document.createElement("a");
      link.download = `ai-native-${result.archetype.id}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      // Fallback: open print dialog
      window.print();
    }
  };

  const handleShare = async () => {
    const text = `I'm "${result.archetype.name}" with a score of ${result.overallScore}/100 on the AI-Native Engineering Maturity Assessment! ${result.archetype.tagline}\n\nTake the assessment: https://assessment.ainative.engineering`;

    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="space-y-4">
      {/* Card preview */}
      <div
        id="share-card"
        className="bg-card border border-border rounded-xl p-6 md:p-8 max-w-lg mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-xs text-muted uppercase tracking-wider mb-2">
            AI-Native Engineering Maturity
          </div>
          <div className="font-mono text-5xl font-bold text-accent mb-2">
            {result.overallScore}
          </div>
          <h2 className="text-2xl font-bold mb-1">{result.archetype.name}</h2>
          <p className="text-muted text-sm italic">
            &ldquo;{result.archetype.tagline}&rdquo;
          </p>
        </div>

        {/* Radar chart */}
        <div className="flex justify-center mb-6">
          <RadarChart scores={result.capabilityScores} size={260} />
        </div>

        {/* Tool badges */}
        {tools && tools.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mb-4">
            {tools.map((tool) => (
              <span
                key={tool}
                className="px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent-light border border-accent/20"
              >
                {tool}
              </span>
            ))}
          </div>
        )}

        {/* Team size */}
        {teamSize && (
          <div className="text-center text-xs text-muted">{teamSize}</div>
        )}

        {/* Footer */}
        <div className="text-center mt-4 pt-4 border-t border-border">
          <div className="text-xs text-muted">
            ainative.engineering/assessment
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 max-w-lg mx-auto">
        <button
          onClick={handleDownload}
          className="flex-1 py-3 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer"
        >
          Download Card
        </button>
        <button
          onClick={handleShare}
          className="flex-1 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-card transition-colors cursor-pointer"
        >
          Share
        </button>
      </div>
    </div>
  );
}
