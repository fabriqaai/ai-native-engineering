import { NextRequest, NextResponse } from "next/server";
import { calculateResults } from "@/lib/scoring";
import { getActiveSurveyDefinition } from "@/lib/survey";
import type { MaturityAnswers } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const answers: MaturityAnswers = body.answers;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { error: "Missing or invalid answers" },
      { status: 400 }
    );
  }

  const survey = await getActiveSurveyDefinition({
    bootstrapFromJson: true,
    useCache: true,
  });

  if (!survey) {
    return NextResponse.json(
      { error: "No active survey available" },
      { status: 500 }
    );
  }

  const result = calculateResults(answers, survey.assessmentData);
  return NextResponse.json(result);
}
