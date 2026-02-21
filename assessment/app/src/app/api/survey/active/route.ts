import { NextResponse } from "next/server";
import { getActiveSurveyDefinition } from "@/lib/survey";

export const runtime = "nodejs";

export async function GET() {
  try {
    const definition = await getActiveSurveyDefinition({
      bootstrapFromJson: true,
      useCache: true,
    });

    if (!definition) {
      return NextResponse.json(
        { error: "No active survey is configured" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      survey: {
        id: definition.surveyId,
        versionNumber: definition.versionNumber,
        name: definition.name,
        status: "active" as const,
        activatedAt: definition.activatedAt,
        sourceChecksum: definition.sourceChecksum,
      },
      data: definition.assessmentData,
    });
  } catch (error) {
    console.error("[survey][active] Failed to load active survey", error);
    return NextResponse.json(
      { error: "Failed to load active survey" },
      { status: 500 }
    );
  }
}
