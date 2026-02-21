import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { ensureAssessmentSchema, getPool } from "@/lib/db";
import { calculateResults } from "@/lib/scoring";
import {
  findSurveyOptionByMaturityLevel,
  findSurveyOptionByValue,
  findSurveyQuestionByKey,
  getActiveSurveyDefinition,
  getSurveyDefinitionById,
  type SurveyDefinition,
  type SurveyQuestionDefinition,
} from "@/lib/survey";

export const runtime = "nodejs";

const COOKIE_ASSESSMENT_ID = "assessment_id";
const COOKIE_SESSION_ID = "assessment_session_id";
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_RESULTS_TO_EMAIL = "cengiz@cengizhan.com";
const DEFAULT_RESULTS_FROM_EMAIL =
  "AI Native Engineering <onboarding@resend.dev>";
const NULL_UUID = "00000000-0000-0000-0000-000000000000";

type AssessmentSubmitPayload = {
  screening_answer?: unknown;
  answers?: unknown;
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

type SubmissionRow = {
  id: string;
  survey_id: string;
  session_id: string | null;
  user_agent: string | null;
  referrer: string | null;
  respondent_email: string | null;
  created_at: Date | string;
};

type SubmissionAnswerRow = {
  question_id: string;
  answer_kind: "selected_option" | "other_text" | "open_text" | "screening";
  answer_text: string | null;
  answer_numeric: string | number | null;
  answer_index: number;
  option_id: string | null;
  option_key: string | null;
  option_label: string | null;
  maturity_level: number | null;
};

type SubmissionScoreRow = {
  score_scope: "overall" | "capability" | "question";
  scope_key: string;
  score_value: string | number;
};

type SubmissionEmailInput = {
  subject: string;
  textBody: string;
  htmlBody: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asNumber(value: string | number | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linesToHtml(lines: string[]): string {
  const items = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return `<ul>${items}</ul>`;
}

function normalizeSelectedValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => isNonEmptyString(item));
  }

  if (isNonEmptyString(value)) {
    return [value.trim()];
  }

  return [];
}

function parseMaturityAnswers(input: unknown): Record<string, number> {
  if (!isRecord(input)) {
    return {};
  }

  const parsed: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }

    parsed[key] = value;
  }

  return parsed;
}

function getSubmissionIdFromBody(
  body: MarketResearchSubmitPayload | EmailSubmitPayload
): string | null {
  if (typeof body.assessmentId === "string" && body.assessmentId.trim().length > 0) {
    return body.assessmentId;
  }

  if (
    typeof body.assessment_id === "string" &&
    body.assessment_id.trim().length > 0
  ) {
    return body.assessment_id;
  }

  return null;
}

function getSubmissionId(
  request: NextRequest,
  body: MarketResearchSubmitPayload | EmailSubmitPayload
): string | null {
  const fromBody = getSubmissionIdFromBody(body);
  if (fromBody) {
    return fromBody;
  }

  return request.cookies.get(COOKIE_ASSESSMENT_ID)?.value ?? null;
}

function setTrackingCookies(
  response: NextResponse,
  submissionId: string,
  sessionId: string
) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(COOKIE_ASSESSMENT_ID, submissionId, {
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

function setAssessmentCookie(response: NextResponse, submissionId: string) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set(COOKIE_ASSESSMENT_ID, submissionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function sendSubmissionEmail({
  subject,
  textBody,
  htmlBody,
}: SubmissionEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[submit][email] RESEND_API_KEY not configured");
    return;
  }

  const to = process.env.RESULTS_TO_EMAIL ?? DEFAULT_RESULTS_TO_EMAIL;
  const from = process.env.RESULTS_FROM_EMAIL ?? DEFAULT_RESULTS_FROM_EMAIL;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error(
        `[submit][email] Failed to send email: ${response.status} ${response.statusText} - ${message}`
      );
    }
  } catch (error) {
    console.error("[submit][email] Unexpected email error", error);
  }
}

async function upsertSubmissionAnswer(
  client: PoolClient,
  input: {
    submissionId: string;
    mapId: string;
    questionId: string;
    optionId: string | null;
    answerKind: "selected_option" | "other_text" | "open_text" | "screening";
    answerText?: string | null;
    answerNumeric?: number | null;
    answerBoolean?: boolean | null;
    answerIndex?: number;
  }
) {
  await client.query(
    `
      INSERT INTO survey_submission_answer (
        submission_id,
        survey_question_map_id,
        question_id,
        option_id,
        answer_kind,
        answer_text,
        answer_numeric,
        answer_boolean,
        answer_index
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (
        submission_id,
        question_id,
        answer_kind,
        COALESCE(option_id, '${NULL_UUID}'::uuid),
        answer_index
      )
      DO UPDATE SET
        option_id = EXCLUDED.option_id,
        answer_text = EXCLUDED.answer_text,
        answer_numeric = EXCLUDED.answer_numeric,
        answer_boolean = EXCLUDED.answer_boolean,
        created_at = NOW()
    `,
    [
      input.submissionId,
      input.mapId,
      input.questionId,
      input.optionId,
      input.answerKind,
      input.answerText ?? null,
      input.answerNumeric ?? null,
      input.answerBoolean ?? null,
      input.answerIndex ?? 0,
    ]
  );
}

async function upsertSubmissionScore(
  client: PoolClient,
  submissionId: string,
  scope: "overall" | "capability" | "question",
  scopeKey: string,
  scoreValue: number
) {
  await client.query(
    `
      INSERT INTO survey_submission_score (
        submission_id,
        score_scope,
        scope_key,
        score_value
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (submission_id, score_scope, scope_key)
      DO UPDATE SET
        score_value = EXCLUDED.score_value,
        created_at = NOW()
    `,
    [submissionId, scope, scopeKey, scoreValue]
  );
}

function getOrderedQuestions(definition: SurveyDefinition): SurveyQuestionDefinition[] {
  return [...definition.questions].sort((a, b) => {
    const sectionWeight =
      (a.section === "screening" ? 1 : a.section === "maturity" ? 2 : 3) -
      (b.section === "screening" ? 1 : b.section === "maturity" ? 2 : 3);

    if (sectionWeight !== 0) {
      return sectionWeight;
    }

    return a.questionOrder - b.questionOrder;
  });
}

function renderQuestionOptionLabel(question: SurveyQuestionDefinition, option: {
  optionLabel: string;
  maturityLevel: number | null;
}) {
  if (question.section === "maturity" && option.maturityLevel !== null) {
    return `L${option.maturityLevel}: ${option.optionLabel}`;
  }

  return option.optionLabel;
}

async function buildSubmissionEmailPayload(
  submissionId: string,
  eventName: string
): Promise<SubmissionEmailInput | null> {
  const pool = getPool();

  const submissionResult = await pool.query<SubmissionRow>(
    `
      SELECT
        id,
        survey_id,
        session_id,
        user_agent,
        referrer,
        respondent_email,
        created_at
      FROM survey_submission
      WHERE id = $1
    `,
    [submissionId]
  );

  if (submissionResult.rowCount === 0) {
    return null;
  }

  const submission = submissionResult.rows[0];
  const definition = await getSurveyDefinitionById(submission.survey_id, {
    useCache: true,
  });

  if (!definition) {
    return null;
  }

  const answersResult = await pool.query<SubmissionAnswerRow>(
    `
      SELECT
        answer.question_id,
        answer.answer_kind,
        answer.answer_text,
        answer.answer_numeric,
        answer.answer_index,
        answer.option_id,
        option.option_key,
        option.option_label,
        option.maturity_level
      FROM survey_submission_answer AS answer
      LEFT JOIN question_option_lookup AS option ON option.id = answer.option_id
      WHERE answer.submission_id = $1
      ORDER BY answer.question_id, answer.answer_index, answer.created_at
    `,
    [submissionId]
  );

  const scoreResult = await pool.query<SubmissionScoreRow>(
    `
      SELECT score_scope, scope_key, score_value
      FROM survey_submission_score
      WHERE submission_id = $1
      ORDER BY score_scope, scope_key
    `,
    [submissionId]
  );

  const answersByQuestionId = new Map<string, SubmissionAnswerRow[]>();
  for (const answer of answersResult.rows) {
    const existing = answersByQuestionId.get(answer.question_id);
    if (existing) {
      existing.push(answer);
    } else {
      answersByQuestionId.set(answer.question_id, [answer]);
    }
  }

  const textLines: string[] = [
    `${eventName}`,
    `submissionId: ${submission.id}`,
    `surveyId: ${submission.survey_id}`,
    `surveyVersion: ${definition.versionNumber}`,
    `submittedAt: ${new Date(submission.created_at).toISOString()}`,
    `respondentEmail: ${submission.respondent_email ?? "n/a"}`,
    `sessionId: ${submission.session_id ?? "n/a"}`,
    `referrer: ${submission.referrer ?? "n/a"}`,
    `userAgent: ${submission.user_agent ?? "n/a"}`,
    "",
    "Responses:",
  ];

  const htmlSections: string[] = [
    `<h2>${escapeHtml(eventName)}</h2>`,
    linesToHtml([
      `submissionId: ${submission.id}`,
      `surveyId: ${submission.survey_id}`,
      `surveyVersion: ${definition.versionNumber}`,
      `submittedAt: ${new Date(submission.created_at).toISOString()}`,
      `respondentEmail: ${submission.respondent_email ?? "n/a"}`,
      `sessionId: ${submission.session_id ?? "n/a"}`,
      `referrer: ${submission.referrer ?? "n/a"}`,
      `userAgent: ${submission.user_agent ?? "n/a"}`,
    ]),
    `<h3>Responses</h3>`,
  ];

  for (const question of getOrderedQuestions(definition)) {
    const rows = answersByQuestionId.get(question.questionId) ?? [];

    const selectedRows = rows
      .filter(
        (row) => row.answer_kind === "selected_option" || row.answer_kind === "screening"
      )
      .sort((a, b) => a.answer_index - b.answer_index);

    const selectedOptionIds = new Set(
      selectedRows
        .map((row) => row.option_id)
        .filter((value): value is string => typeof value === "string")
    );

    const selectedLabels = selectedRows.map((row) => {
      if (row.option_label) {
        if (question.section === "maturity" && row.maturity_level !== null) {
          return `L${row.maturity_level}: ${row.option_label}`;
        }
        return row.option_label;
      }

      if (isNonEmptyString(row.answer_text)) {
        return row.answer_text.trim();
      }

      return row.option_key ?? "(unknown option)";
    });

    const otherText = rows
      .filter((row) => row.answer_kind === "other_text" && isNonEmptyString(row.answer_text))
      .map((row) => row.answer_text!.trim());

    const openText = rows
      .filter((row) => row.answer_kind === "open_text" && isNonEmptyString(row.answer_text))
      .map((row) => row.answer_text!.trim());

    textLines.push(`${question.questionKey}. ${question.prompt}`);
    textLines.push(`Type: ${question.questionType}`);
    textLines.push(
      `Selected: ${selectedLabels.length > 0 ? selectedLabels.join(", ") : "No selection"}`
    );

    if (otherText.length > 0) {
      textLines.push(`Other text: ${otherText.join(" | ")}`);
    }

    if (openText.length > 0) {
      textLines.push(`Open text: ${openText.join(" | ")}`);
    }

    if (question.options.length > 0) {
      textLines.push("Options:");
      for (const option of question.options) {
        const marker = selectedOptionIds.has(option.id) ? " [selected]" : "";
        textLines.push(
          `- ${renderQuestionOptionLabel(question, option)}${marker}`
        );
      }
    }

    textLines.push("");

    const optionsHtml =
      question.options.length > 0
        ? `<p><strong>Options:</strong></p><ul>${question.options
            .map((option) => {
              const marker = selectedOptionIds.has(option.id)
                ? " <strong>(selected)</strong>"
                : "";
              return `<li>${escapeHtml(
                renderQuestionOptionLabel(question, option)
              )}${marker}</li>`;
            })
            .join("")}</ul>`
        : "";

    htmlSections.push(
      `<section>`,
      `<h4>${escapeHtml(`${question.questionKey}. ${question.prompt}`)}</h4>`,
      `<p><strong>Type:</strong> ${escapeHtml(question.questionType)}</p>`,
      `<p><strong>Selected:</strong> ${escapeHtml(
        selectedLabels.length > 0 ? selectedLabels.join(", ") : "No selection"
      )}</p>`,
      otherText.length > 0
        ? `<p><strong>Other text:</strong> ${escapeHtml(otherText.join(" | "))}</p>`
        : "",
      openText.length > 0
        ? `<p><strong>Open text:</strong> ${escapeHtml(openText.join(" | "))}</p>`
        : "",
      optionsHtml,
      `</section>`
    );
  }

  const overall = scoreResult.rows.find(
    (row) => row.score_scope === "overall" && row.scope_key === "overall"
  );
  const capabilityScores = scoreResult.rows.filter(
    (row) => row.score_scope === "capability"
  );
  const questionScores = scoreResult.rows.filter((row) => row.score_scope === "question");

  textLines.push("Scores:");
  textLines.push(`Overall: ${asNumber(overall?.score_value ?? null) ?? "n/a"}`);

  if (capabilityScores.length > 0) {
    textLines.push("Capability scores:");
    for (const capability of definition.assessmentData.capabilities) {
      const scoreRow = capabilityScores.find(
        (candidate) => candidate.scope_key === capability.id
      );
      if (!scoreRow) {
        continue;
      }
      textLines.push(
        `- ${capability.name}: ${asNumber(scoreRow.score_value) ?? "n/a"}`
      );
    }
  }

  if (questionScores.length > 0) {
    textLines.push("Question scores:");
    for (const question of getOrderedQuestions(definition).filter(
      (candidate) => candidate.section === "maturity"
    )) {
      const scoreRow = questionScores.find(
        (candidate) => candidate.scope_key === question.questionKey
      );
      if (!scoreRow) {
        continue;
      }
      textLines.push(
        `- ${question.questionKey}: ${asNumber(scoreRow.score_value) ?? "n/a"}`
      );
    }
  }

  htmlSections.push(
    `<h3>Scores</h3>`,
    linesToHtml([
      `Overall: ${asNumber(overall?.score_value ?? null) ?? "n/a"}`,
      ...definition.assessmentData.capabilities
        .map((capability) => {
          const scoreRow = capabilityScores.find(
            (candidate) => candidate.scope_key === capability.id
          );
          if (!scoreRow) {
            return null;
          }

          return `${capability.name}: ${asNumber(scoreRow.score_value) ?? "n/a"}`;
        })
        .filter((line): line is string => typeof line === "string"),
    ])
  );

  return {
    subject: `${eventName}: ${submission.id}`,
    textBody: textLines.join("\n"),
    htmlBody: htmlSections.join("\n"),
  };
}

async function sendSubmissionSummaryEmail(submissionId: string, eventName: string) {
  const payload = await buildSubmissionEmailPayload(submissionId, eventName);
  if (!payload) {
    return;
  }

  await sendSubmissionEmail(payload);
}

function getQuestionLevelScore(level: number): number {
  return Number((((level - 1) / 4) * 100).toFixed(2));
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

  const parsedAnswers = parseMaturityAnswers(body.answers);

  try {
    await ensureAssessmentSchema();

    const survey = await getActiveSurveyDefinition({
      bootstrapFromJson: true,
      useCache: true,
    });

    if (!survey) {
      return NextResponse.json(
        { error: "No active survey configured" },
        { status: 500 }
      );
    }

    const screeningQuestion = findSurveyQuestionByKey(
      survey,
      survey.assessmentData.screening.id,
      "screening"
    );

    if (!screeningQuestion) {
      return NextResponse.json(
        { error: "Active survey is missing screening question" },
        { status: 500 }
      );
    }

    const screeningOption = findSurveyOptionByValue(
      screeningQuestion,
      body.screening_answer
    );

    if (!screeningOption) {
      return NextResponse.json(
        { error: "Invalid screening option" },
        { status: 400 }
      );
    }

    const calculatedResult = calculateResults(parsedAnswers, survey.assessmentData);

    const submissionId = randomUUID();
    const sessionId = request.cookies.get(COOKIE_SESSION_ID)?.value ?? randomUUID();

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
          INSERT INTO survey_submission (
            id,
            survey_id,
            session_id,
            user_agent,
            referrer
          ) VALUES ($1, $2, $3, $4, $5)
        `,
        [
          submissionId,
          survey.surveyId,
          sessionId,
          request.headers.get("user-agent"),
          request.headers.get("referer"),
        ]
      );

      await upsertSubmissionAnswer(client, {
        submissionId,
        mapId: screeningQuestion.mapId,
        questionId: screeningQuestion.questionId,
        optionId: screeningOption.id,
        answerKind: "screening",
        answerText: body.screening_answer,
      });

      const maturityQuestions = survey.questions.filter(
        (question) => question.section === "maturity"
      );

      const answeredQuestionLevels = new Map<string, number>();

      for (const question of maturityQuestions) {
        const level = parsedAnswers[question.questionKey];
        if (typeof level !== "number" || !Number.isFinite(level)) {
          continue;
        }

        const selectedOption = findSurveyOptionByMaturityLevel(question, level);

        await upsertSubmissionAnswer(client, {
          submissionId,
          mapId: question.mapId,
          questionId: question.questionId,
          optionId: selectedOption?.id ?? null,
          answerKind: "selected_option",
          answerText: selectedOption?.optionLabel ?? null,
          answerNumeric: level,
          answerIndex: 0,
        });

        answeredQuestionLevels.set(question.questionKey, level);
      }

      await upsertSubmissionScore(
        client,
        submissionId,
        "overall",
        "overall",
        calculatedResult.overallScore
      );

      for (const capability of calculatedResult.capabilityScores) {
        await upsertSubmissionScore(
          client,
          submissionId,
          "capability",
          capability.id,
          capability.score
        );
      }

      for (const [questionKey, level] of answeredQuestionLevels.entries()) {
        await upsertSubmissionScore(
          client,
          submissionId,
          "question",
          questionKey,
          getQuestionLevelScore(level)
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await sendSubmissionSummaryEmail(submissionId, "Assessment submission");

    const response = NextResponse.json({
      ok: true,
      submissionId,
      assessmentId: submissionId,
    });
    setTrackingCookies(response, submissionId, sessionId);
    return response;
  } catch (error) {
    console.error("[submit][POST] Failed to persist submission", error);
    return NextResponse.json(
      { error: "Failed to persist submission" },
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

  const submissionId = getSubmissionId(request, body);
  if (!submissionId) {
    return NextResponse.json({ error: "Missing assessmentId" }, { status: 400 });
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

  const touchedResponses = Object.entries(body.marketResearch).filter(
    ([questionId, response]) => /^M\d+$/.test(questionId) && response !== undefined
  );

  if (touchedResponses.length === 0) {
    const response = NextResponse.json({
      ok: true,
      questionCount: 0,
      submissionId,
      assessmentId: submissionId,
    });
    setAssessmentCookie(response, submissionId);
    return response;
  }

  try {
    await ensureAssessmentSchema();

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const submissionResult = await client.query<SubmissionRow>(
        `
          SELECT
            id,
            survey_id,
            session_id,
            user_agent,
            referrer,
            respondent_email,
            created_at
          FROM survey_submission
          WHERE id = $1
        `,
        [submissionId]
      );

      if (submissionResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Submission not found for provided assessmentId" },
          { status: 404 }
        );
      }

      const survey = await getSurveyDefinitionById(submissionResult.rows[0].survey_id, {
        useCache: true,
      });

      if (!survey) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Survey definition not found for submission" },
          { status: 500 }
        );
      }

      for (const [questionKey, response] of touchedResponses) {
        const question = findSurveyQuestionByKey(survey, questionKey, "market-research");
        if (!question) {
          continue;
        }

        await client.query(
          `
            DELETE FROM survey_submission_answer
            WHERE submission_id = $1
              AND question_id = $2
              AND answer_kind IN ('selected_option', 'other_text', 'open_text')
          `,
          [submissionId, question.questionId]
        );

        const parsedResponse = isRecord(response) ? response : {};
        const selectedValues = normalizeSelectedValues(parsedResponse.selected);

        for (const [index, selectedValue] of selectedValues.entries()) {
          const option = findSurveyOptionByValue(question, selectedValue);

          await upsertSubmissionAnswer(client, {
            submissionId,
            mapId: question.mapId,
            questionId: question.questionId,
            optionId: option?.id ?? null,
            answerKind: "selected_option",
            answerText: option?.optionLabel ?? selectedValue,
            answerIndex: index,
          });
        }

        const otherText = isNonEmptyString(parsedResponse.other)
          ? parsedResponse.other.trim()
          : "";

        if (otherText.length > 0) {
          await upsertSubmissionAnswer(client, {
            submissionId,
            mapId: question.mapId,
            questionId: question.questionId,
            optionId: null,
            answerKind: "other_text",
            answerText: otherText,
            answerIndex: selectedValues.length,
          });
        }

        const openText = isNonEmptyString(parsedResponse.text)
          ? parsedResponse.text.trim()
          : "";

        if (openText.length > 0) {
          await upsertSubmissionAnswer(client, {
            submissionId,
            mapId: question.mapId,
            questionId: question.questionId,
            optionId: null,
            answerKind: "open_text",
            answerText: openText,
            answerIndex: selectedValues.length + (otherText.length > 0 ? 1 : 0),
          });
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await sendSubmissionSummaryEmail(submissionId, "Market research submission");

    const response = NextResponse.json({
      ok: true,
      questionCount: touchedResponses.length,
      submissionId,
      assessmentId: submissionId,
    });
    setAssessmentCookie(response, submissionId);
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

  const submissionId = getSubmissionId(request, body);
  if (!submissionId) {
    return NextResponse.json({ error: "Missing assessmentId" }, { status: 400 });
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
    const updateResult = await pool.query<{ id: string }>(
      `
        UPDATE survey_submission
        SET respondent_email = $1
        WHERE id = $2
        RETURNING id
      `,
      [email, submissionId]
    );

    if (updateResult.rowCount === 0) {
      return NextResponse.json(
        { error: "Submission not found for provided assessmentId" },
        { status: 404 }
      );
    }

    await sendSubmissionSummaryEmail(submissionId, "Email capture submission");

    const response = NextResponse.json({
      ok: true,
      submissionId,
      assessmentId: submissionId,
    });
    setAssessmentCookie(response, submissionId);
    return response;
  } catch (error) {
    console.error("[submit][PATCH] Failed to persist email", error);
    return NextResponse.json(
      { error: "Failed to persist email" },
      { status: 500 }
    );
  }
}
