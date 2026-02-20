import { NextRequest, NextResponse } from "next/server";
import { calculateResults } from "@/lib/scoring";
import type { MaturityAnswers } from "@/lib/types";

// Stub for share card PNG generation
// TODO: Implement with Satori / @vercel/og when ready for production

export async function POST(request: NextRequest) {
  const body = await request.json();
  const answers: MaturityAnswers = body.answers;

  if (!answers) {
    return NextResponse.json(
      { error: "Missing answers" },
      { status: 400 }
    );
  }

  const result = calculateResults(answers);

  // For now, return JSON metadata that would be used to render the card
  // In production, this generates a PNG via Satori/@vercel/og
  return NextResponse.json({
    message: "Card generation not yet implemented — use client-side html2canvas for now",
    archetype: result.archetype.name,
    score: result.overallScore,
    capabilities: result.capabilityScores,
    tools: body.tools ?? [],
    teamSize: body.teamSize ?? null,
    format: body.format ?? "landscape",
  });
}
