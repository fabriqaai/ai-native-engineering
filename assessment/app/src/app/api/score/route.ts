import { NextRequest, NextResponse } from "next/server";
import { calculateResults } from "@/lib/scoring";
import type { MaturityAnswers } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const answers: MaturityAnswers = body.answers;

  if (!answers || typeof answers !== "object") {
    return NextResponse.json(
      { error: "Missing or invalid answers" },
      { status: 400 }
    );
  }

  const result = calculateResults(answers);

  return NextResponse.json(result);
}
