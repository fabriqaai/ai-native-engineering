import type { PoolClient } from "pg";
import { ensureAssessmentSchema, getPool } from "../src/lib/db";
import {
  findSurveyOptionByMaturityLevel,
  findSurveyOptionByValue,
  findSurveyQuestionByKey,
  getActiveSurveyDefinition,
  type SurveyDefinition,
  type SurveyQuestionDefinition,
} from "../src/lib/survey";

type LegacyAssessmentRow = {
  id: string;
  screening_answer: "yes" | "no";
  answers: unknown;
  score_overall: number | null;
  score_specs: number | null;
  score_context: number | null;
  score_agents: number | null;
  score_feedback: number | null;
  score_governance: number | null;
  score_delivery: number | null;
  score_organization: number | null;
  user_agent: string | null;
  referrer: string | null;
  session_id: string | null;
  email: string | null;
  created_at: Date | string;
};

type LegacyMarketResearchRow = {
  assessment_id: string;
  question_id: string;
  response: unknown;
  created_at: Date | string;
};

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseMaturityAnswers(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const parsed: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      continue;
    }

    parsed[key] = raw;
  }

  return parsed;
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

function questionScoreFromLevel(level: number): number {
  return Number((((level - 1) / 4) * 100).toFixed(2));
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
    createdAt: Date | string;
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
        answer_index,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        created_at = EXCLUDED.created_at
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
      input.createdAt,
    ]
  );
}

async function upsertSubmissionScore(
  client: PoolClient,
  input: {
    submissionId: string;
    scope: "overall" | "capability" | "question";
    scopeKey: string;
    scoreValue: number;
    createdAt: Date | string;
  }
) {
  await client.query(
    `
      INSERT INTO survey_submission_score (
        submission_id,
        score_scope,
        scope_key,
        score_value,
        created_at
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (submission_id, score_scope, scope_key)
      DO UPDATE SET
        score_value = EXCLUDED.score_value,
        created_at = EXCLUDED.created_at
    `,
    [
      input.submissionId,
      input.scope,
      input.scopeKey,
      input.scoreValue,
      input.createdAt,
    ]
  );
}

function toCount(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number.parseInt(value, 10) || 0;
  }
  return 0;
}

async function backfillAssessments(
  client: PoolClient,
  survey: SurveyDefinition
): Promise<number> {
  const assessmentsResult = await client.query<LegacyAssessmentRow>(
    `
      SELECT
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
        user_agent,
        referrer,
        session_id,
        email,
        created_at
      FROM assessments
      ORDER BY created_at ASC
    `
  );

  const screeningQuestion = findSurveyQuestionByKey(
    survey,
    survey.assessmentData.screening.id,
    "screening"
  );
  const maturityQuestions = survey.questions.filter(
    (question) => question.section === "maturity"
  );

  for (const row of assessmentsResult.rows) {
    await client.query(
      `
        INSERT INTO survey_submission (
          id,
          survey_id,
          session_id,
          user_agent,
          referrer,
          respondent_email,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id)
        DO UPDATE SET
          survey_id = EXCLUDED.survey_id,
          session_id = COALESCE(survey_submission.session_id, EXCLUDED.session_id),
          user_agent = COALESCE(survey_submission.user_agent, EXCLUDED.user_agent),
          referrer = COALESCE(survey_submission.referrer, EXCLUDED.referrer),
          respondent_email = COALESCE(survey_submission.respondent_email, EXCLUDED.respondent_email)
      `,
      [
        row.id,
        survey.surveyId,
        row.session_id,
        row.user_agent,
        row.referrer,
        row.email,
        row.created_at,
      ]
    );

    if (screeningQuestion) {
      const screeningOption = findSurveyOptionByValue(
        screeningQuestion,
        row.screening_answer
      );

      await upsertSubmissionAnswer(client, {
        submissionId: row.id,
        mapId: screeningQuestion.mapId,
        questionId: screeningQuestion.questionId,
        optionId: screeningOption?.id ?? null,
        answerKind: "screening",
        answerText: row.screening_answer,
        createdAt: row.created_at,
      });
    }

    const maturityAnswers = parseMaturityAnswers(row.answers);

    for (const question of maturityQuestions) {
      const level = maturityAnswers[question.questionKey];
      if (typeof level !== "number" || !Number.isFinite(level)) {
        continue;
      }

      const selectedOption = findSurveyOptionByMaturityLevel(question, level);

      await upsertSubmissionAnswer(client, {
        submissionId: row.id,
        mapId: question.mapId,
        questionId: question.questionId,
        optionId: selectedOption?.id ?? null,
        answerKind: "selected_option",
        answerText: selectedOption?.optionLabel ?? null,
        answerNumeric: level,
        answerIndex: 0,
        createdAt: row.created_at,
      });

      await upsertSubmissionScore(client, {
        submissionId: row.id,
        scope: "question",
        scopeKey: question.questionKey,
        scoreValue: questionScoreFromLevel(level),
        createdAt: row.created_at,
      });
    }

    if (typeof row.score_overall === "number") {
      await upsertSubmissionScore(client, {
        submissionId: row.id,
        scope: "overall",
        scopeKey: "overall",
        scoreValue: row.score_overall,
        createdAt: row.created_at,
      });
    }

    const capabilityScores = [
      ["specs", row.score_specs],
      ["context", row.score_context],
      ["agents", row.score_agents],
      ["feedback", row.score_feedback],
      ["governance", row.score_governance],
      ["delivery", row.score_delivery],
      ["organization", row.score_organization],
    ] as const;

    for (const [capabilityId, score] of capabilityScores) {
      if (typeof score !== "number") {
        continue;
      }

      await upsertSubmissionScore(client, {
        submissionId: row.id,
        scope: "capability",
        scopeKey: capabilityId,
        scoreValue: score,
        createdAt: row.created_at,
      });
    }
  }

  return assessmentsResult.rowCount ?? 0;
}

async function backfillMarketResearch(
  client: PoolClient,
  survey: SurveyDefinition
): Promise<number> {
  const marketResult = await client.query<LegacyMarketResearchRow>(
    `
      SELECT
        assessment_id,
        question_id,
        response,
        created_at
      FROM market_research_responses
      ORDER BY created_at ASC
    `
  );

  const questionByKey = new Map<string, SurveyQuestionDefinition>(
    survey.questions
      .filter((question) => question.section === "market-research")
      .map((question) => [question.questionKey, question])
  );

  for (const row of marketResult.rows) {
    const question = questionByKey.get(row.question_id);
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
      [row.assessment_id, question.questionId]
    );

    const parsedResponse = isRecord(row.response) ? row.response : {};
    const selectedValues = normalizeSelectedValues(parsedResponse.selected);

    for (const [index, selectedValue] of selectedValues.entries()) {
      const option = findSurveyOptionByValue(question, selectedValue);

      await upsertSubmissionAnswer(client, {
        submissionId: row.assessment_id,
        mapId: question.mapId,
        questionId: question.questionId,
        optionId: option?.id ?? null,
        answerKind: "selected_option",
        answerText: option?.optionLabel ?? selectedValue,
        answerIndex: index,
        createdAt: row.created_at,
      });
    }

    const otherText = isNonEmptyString(parsedResponse.other)
      ? parsedResponse.other.trim()
      : "";

    if (otherText.length > 0) {
      await upsertSubmissionAnswer(client, {
        submissionId: row.assessment_id,
        mapId: question.mapId,
        questionId: question.questionId,
        optionId: null,
        answerKind: "other_text",
        answerText: otherText,
        answerIndex: selectedValues.length,
        createdAt: row.created_at,
      });
    }

    const openText = isNonEmptyString(parsedResponse.text)
      ? parsedResponse.text.trim()
      : "";

    if (openText.length > 0) {
      await upsertSubmissionAnswer(client, {
        submissionId: row.assessment_id,
        mapId: question.mapId,
        questionId: question.questionId,
        optionId: null,
        answerKind: "open_text",
        answerText: openText,
        answerIndex: selectedValues.length + (otherText.length > 0 ? 1 : 0),
        createdAt: row.created_at,
      });
    }
  }

  return marketResult.rowCount ?? 0;
}

async function runValidation(surveyId: string) {
  const pool = getPool();

  const [legacyCountResult, submissionCountResult, missingSubmissionResult] =
    await Promise.all([
      pool.query<{ count: unknown }>(`SELECT COUNT(*) AS count FROM assessments`),
      pool.query<{ count: unknown }>(
        `SELECT COUNT(*) AS count FROM survey_submission WHERE survey_id = $1`,
        [surveyId]
      ),
      pool.query<{ count: unknown }>(
        `
          SELECT COUNT(*) AS count
          FROM assessments legacy
          LEFT JOIN survey_submission normalized ON normalized.id = legacy.id
          WHERE normalized.id IS NULL
        `
      ),
    ]);

  const [legacyMarketRows, normalizedMarketRows] = await Promise.all([
    pool.query<{ count: unknown }>(
      `SELECT COUNT(*) AS count FROM market_research_responses`
    ),
    pool.query<{ count: unknown }>(
      `
        SELECT COUNT(*) AS count
        FROM survey_submission_answer answer
        JOIN question_lookup question ON question.id = answer.question_id
        WHERE question.question_group = 'market-research'
      `
    ),
  ]);

  const randomAssessments = await pool.query<{ id: string; answers: unknown }>(
    `
      SELECT id, answers
      FROM assessments
      ORDER BY random()
      LIMIT 20
    `
  );

  let spotCheckMismatches = 0;

  for (const row of randomAssessments.rows) {
    const maturityAnswers = parseMaturityAnswers(row.answers);
    const expectedCount = Object.keys(maturityAnswers).length;

    const actualResult = await pool.query<{ count: unknown }>(
      `
        SELECT COUNT(*) AS count
        FROM survey_submission_answer answer
        JOIN question_lookup question ON question.id = answer.question_id
        WHERE answer.submission_id = $1
          AND question.question_group = 'maturity'
          AND answer.answer_kind = 'selected_option'
      `,
      [row.id]
    );

    const actualCount = toCount(actualResult.rows[0]?.count);
    if (expectedCount !== actualCount) {
      spotCheckMismatches += 1;
    }
  }

  return {
    legacySubmissionCount: toCount(legacyCountResult.rows[0]?.count),
    normalizedSubmissionCount: toCount(submissionCountResult.rows[0]?.count),
    missingSubmissionCount: toCount(missingSubmissionResult.rows[0]?.count),
    legacyMarketResearchRows: toCount(legacyMarketRows.rows[0]?.count),
    normalizedMarketResearchRows: toCount(normalizedMarketRows.rows[0]?.count),
    randomSpotChecks: randomAssessments.rowCount ?? 0,
    randomSpotCheckMismatches: spotCheckMismatches,
  };
}

async function main() {
  await ensureAssessmentSchema();

  const survey = await getActiveSurveyDefinition({
    bootstrapFromJson: true,
    useCache: false,
  });

  if (!survey) {
    throw new Error("No active survey found. Run survey import first.");
  }

  const pool = getPool();
  const client = await pool.connect();

  let submissionRowsBackfilled = 0;
  let marketRowsBackfilled = 0;

  try {
    await client.query("BEGIN");

    submissionRowsBackfilled = await backfillAssessments(client, survey);
    marketRowsBackfilled = await backfillMarketResearch(client, survey);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const validation = await runValidation(survey.surveyId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        surveyId: survey.surveyId,
        surveyVersion: survey.versionNumber,
        submissionRowsBackfilled,
        marketRowsBackfilled,
        validation,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[survey:backfill] Failed", error);
  process.exitCode = 1;
});
