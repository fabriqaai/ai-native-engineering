import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureAssessmentSchema, getPool } from "@/lib/db";

export const runtime = "nodejs";

const COOKIE_ASSESSMENT_ID = "assessment_id";
const COOKIE_SESSION_ID = "assessment_session_id";

const CAPABILITY_IDS = [
  "specs",
  "context",
  "agents",
  "feedback",
  "governance",
  "delivery",
  "organization",
] as const;

type CapabilityId = (typeof CAPABILITY_IDS)[number];

type AssessmentSubmitPayload = {
  screening_answer?: unknown;
  answers?: unknown;
  overallScore?: unknown;
  capabilityScores?: unknown;
  archetype?: { id?: unknown };
};

type MarketResearchSubmitPayload = {
  assessmentId?: unknown;
  assessment_id?: unknown;
  marketResearch?: unknown;
};

type EmailSubmitPayload = {
  assessmentId?: unknown;
  assessment_id?: unknown;
  email?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return Math.max(0, Math.min(100, rounded));
}

function getCapabilityScoreMap(
  capabilityScores: unknown
): Record<CapabilityId, number | null> {
  const scoreMap = {
    specs: null,
    context: null,
    agents: null,
    feedback: null,
    governance: null,
    delivery: null,
    organization: null,
  } as Record<CapabilityId, number | null>;

  if (!Array.isArray(capabilityScores)) {
    return scoreMap;
  }

  for (const item of capabilityScores) {
    if (!isRecord(item)) continue;

    const capabilityId = item.id;
    const score = parseScore(item.score);

    if (
      typeof capabilityId === "string" &&
      (CAPABILITY_IDS as readonly string[]).includes(capabilityId)
    ) {
      scoreMap[capabilityId as CapabilityId] = score;
    }
  }

  return scoreMap;
}

function getAssessmentIdFromBody(
  body: MarketResearchSubmitPayload | EmailSubmitPayload
): string | null {
  if (typeof body.assessmentId === "string" && body.assessmentId) {
    return body.assessmentId;
  }

  if (typeof body.assessment_id === "string" && body.assessment_id) {
    return body.assessment_id;
  }

  return null;
}

function getAssessmentId(
  request: NextRequest,
  body: MarketResearchSubmitPayload | EmailSubmitPayload
): string | null {
  const fromBody = getAssessmentIdFromBody(body);
  if (fromBody) return fromBody;

  return request.cookies.get(COOKIE_ASSESSMENT_ID)?.value ?? null;
}

function setTrackingCookies(
  response: NextResponse,
  assessmentId: string,
  sessionId: string
) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(COOKIE_ASSESSMENT_ID, assessmentId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set(COOKIE_SESSION_ID, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

function setAssessmentCookie(response: NextResponse, assessmentId: string) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(COOKIE_ASSESSMENT_ID, assessmentId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function POST(request: NextRequest) {
  let body: AssessmentSubmitPayload;

  try {
    body = (await request.json()) as AssessmentSubmitPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (body.screening_answer !== "yes" && body.screening_answer !== "no") {
    return NextResponse.json(
      { error: "screening_answer must be 'yes' or 'no'" },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 }
    );
  }

  const assessmentId = randomUUID();
  const sessionId = request.cookies.get(COOKIE_SESSION_ID)?.value ?? randomUUID();
  const capabilityScores = getCapabilityScoreMap(body.capabilityScores);
  const overallScore = parseScore(body.overallScore);
  const answers = isRecord(body.answers) ? body.answers : null;
  const archetypeId =
    typeof body.archetype?.id === "string" ? body.archetype.id : null;

  try {
    await ensureAssessmentSchema();
    const pool = getPool();

    await pool.query(
      `
        INSERT INTO assessments (
          id,
          screening_answer,
          answers,
          score_overall,
          score_specs,
          score_context,
          score_agents,
          score_feedback,
          score_governance,
          score_delivery,
          score_organization,
          archetype_id,
          user_agent,
          referrer,
          session_id
        ) VALUES (
          $1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
      `,
      [
        assessmentId,
        body.screening_answer,
        answers ? JSON.stringify(answers) : null,
        overallScore,
        capabilityScores.specs,
        capabilityScores.context,
        capabilityScores.agents,
        capabilityScores.feedback,
        capabilityScores.governance,
        capabilityScores.delivery,
        capabilityScores.organization,
        archetypeId,
        request.headers.get("user-agent"),
        request.headers.get("referer"),
        sessionId,
      ]
    );

    const response = NextResponse.json({ ok: true, assessmentId });
    setTrackingCookies(response, assessmentId, sessionId);
    return response;
  } catch (error) {
    console.error("[submit][POST] Failed to persist assessment", error);
    return NextResponse.json(
      { error: "Failed to persist assessment" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: MarketResearchSubmitPayload;

  try {
    body = (await request.json()) as MarketResearchSubmitPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const assessmentId = getAssessmentId(request, body);
  if (!assessmentId) {
    return NextResponse.json(
      { error: "Missing assessmentId" },
      { status: 400 }
    );
  }

  if (!isRecord(body.marketResearch)) {
    return NextResponse.json(
      { error: "marketResearch must be an object" },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 }
    );
  }

  const responses = Object.entries(body.marketResearch).filter(
    ([questionId, response]) => /^M\d+$/.test(questionId) && response !== undefined
  );

  if (responses.length === 0) {
    const response = NextResponse.json({ ok: true, questionCount: 0 });
    setAssessmentCookie(response, assessmentId);
    return response;
  }

  try {
    await ensureAssessmentSchema();
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const assessmentExists = await client.query(
        "SELECT 1 FROM assessments WHERE id = $1",
        [assessmentId]
      );

      if (assessmentExists.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Assessment not found for provided assessmentId" },
          { status: 404 }
        );
      }

      for (const [questionId, response] of responses) {
        await client.query(
          `
            INSERT INTO market_research_responses (
              id,
              assessment_id,
              question_id,
              response
            ) VALUES (
              $1, $2, $3, $4::jsonb
            )
            ON CONFLICT (assessment_id, question_id)
            DO UPDATE SET
              response = EXCLUDED.response,
              created_at = NOW()
          `,
          [randomUUID(), assessmentId, questionId, JSON.stringify(response)]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const response = NextResponse.json({
      ok: true,
      questionCount: responses.length,
    });
    setAssessmentCookie(response, assessmentId);
    return response;
  } catch (error) {
    console.error("[submit][PUT] Failed to persist market research", error);
    return NextResponse.json(
      { error: "Failed to persist market research" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  let body: EmailSubmitPayload;

  try {
    body = (await request.json()) as EmailSubmitPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const assessmentId = getAssessmentId(request, body);
  if (!assessmentId) {
    return NextResponse.json(
      { error: "Missing assessmentId" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isValidEmail) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL is not configured" },
      { status: 500 }
    );
  }

  try {
    await ensureAssessmentSchema();
    const pool = getPool();
    const result = await pool.query(
      `
        UPDATE assessments
        SET email = $1
        WHERE id = $2
      `,
      [email, assessmentId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "Assessment not found for provided assessmentId" },
        { status: 404 }
      );
    }

    const response = NextResponse.json({ ok: true });
    setAssessmentCookie(response, assessmentId);
    return response;
  } catch (error) {
    console.error("[submit][PATCH] Failed to persist email", error);
    return NextResponse.json(
      { error: "Failed to persist email" },
      { status: 500 }
    );
  }
}
