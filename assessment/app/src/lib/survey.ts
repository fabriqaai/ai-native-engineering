import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { ensureAssessmentSchema, getPool } from "./db";
import type {
  AssessmentData,
  AssessmentMetadata,
  Archetype,
  Capability,
  MarketResearchQuestion,
  MaturityQuestion,
  ScreeningOption,
} from "./types";
import fallbackAssessmentData from "../../questions.json";

const FALLBACK_DATA = fallbackAssessmentData as unknown as AssessmentData;
const ACTIVE_SURVEY_CACHE_TTL_MS = 30_000;

export type SurveySection = "screening" | "maturity" | "market-research";
export type SurveyQuestionType = "single-select" | "multi-select" | "open-text";

export interface SurveyOptionDefinition {
  id: string;
  optionKey: string | null;
  optionLabel: string;
  maturityLevel: number | null;
  optionOrder: number;
  isOtherOption: boolean;
}

export interface SurveyQuestionDefinition {
  mapId: string;
  surveyId: string;
  section: SurveySection;
  questionOrder: number;
  isScored: boolean;
  isEnabled: boolean;
  mapMetadata: Record<string, unknown>;
  questionId: string;
  questionKey: string;
  questionGroup: SurveySection;
  questionType: SurveyQuestionType;
  capabilityId: string | null;
  prompt: string;
  allowOther: boolean;
  isRequired: boolean;
  questionMetadata: Record<string, unknown>;
  options: SurveyOptionDefinition[];
}

export interface SurveyDefinition {
  surveyId: string;
  versionNumber: number;
  name: string;
  status: "draft" | "active" | "archived";
  sourceChecksum: string;
  activatedAt: string | null;
  metadata: Record<string, unknown>;
  questions: SurveyQuestionDefinition[];
  assessmentData: AssessmentData;
}

export interface SurveyImportResult {
  surveyId: string;
  versionNumber: number;
  sourceChecksum: string;
}

type DbSurveyRow = {
  id: string;
  version_number: number;
  name: string;
  status: "draft" | "active" | "archived";
  source_checksum: string;
  metadata: unknown;
  activated_at: Date | string | null;
};

type DbQuestionRow = {
  map_id: string;
  survey_id: string;
  section: SurveySection;
  question_order: number;
  is_scored: boolean;
  is_enabled: boolean;
  map_metadata: unknown;
  question_id: string;
  question_key: string;
  question_group: SurveySection;
  question_type: SurveyQuestionType;
  capability_id: string | null;
  prompt: string;
  allow_other: boolean;
  is_required: boolean;
  question_metadata: unknown;
};

type DbOptionRow = {
  id: string;
  question_id: string;
  option_key: string | null;
  option_label: string;
  maturity_level: number | null;
  option_order: number;
  is_other_option: boolean;
};

type QuestionSeed = {
  questionKey: string;
  section: SurveySection;
  questionType: SurveyQuestionType;
  capabilityId: string | null;
  prompt: string;
  allowOther: boolean;
  isRequired: boolean;
  questionMetadata: Record<string, unknown>;
  mapMetadata: Record<string, unknown>;
  isScored: boolean;
  options: Array<{
    optionKey: string;
    optionLabel: string;
    maturityLevel: number | null;
    optionOrder: number;
    isOtherOption: boolean;
  }>;
};

declare global {
  var surveyActiveCache:
    | {
        expiresAt: number;
        value: SurveyDefinition;
      }
    | undefined;
  var surveyByIdCache:
    | Map<
        string,
        {
          expiresAt: number;
          value: SurveyDefinition;
        }
      >
    | undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value as T[];
}

function asString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseIsoDate(value: Date | string | null): string | null {
  if (!value) return null;
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function hashPayload(data: AssessmentData): string {
  const serialized = JSON.stringify(data);
  return createHash("sha256").update(serialized).digest("hex");
}

function clearSurveyCache() {
  globalThis.surveyActiveCache = undefined;
  if (!globalThis.surveyByIdCache) {
    return;
  }

  globalThis.surveyByIdCache.clear();
}

function setSurveyByIdCache(definition: SurveyDefinition) {
  if (!globalThis.surveyByIdCache) {
    globalThis.surveyByIdCache = new Map();
  }

  globalThis.surveyByIdCache.set(definition.surveyId, {
    expiresAt: Date.now() + ACTIVE_SURVEY_CACHE_TTL_MS,
    value: definition,
  });
}

function getSurveyByIdCache(surveyId: string): SurveyDefinition | null {
  const cache = globalThis.surveyByIdCache?.get(surveyId);
  if (!cache) return null;
  if (cache.expiresAt < Date.now()) {
    globalThis.surveyByIdCache?.delete(surveyId);
    return null;
  }
  return cache.value;
}

function getActiveSurveyCache(): SurveyDefinition | null {
  const cache = globalThis.surveyActiveCache;
  if (!cache) return null;
  if (cache.expiresAt < Date.now()) {
    globalThis.surveyActiveCache = undefined;
    return null;
  }
  return cache.value;
}

function setActiveSurveyCache(definition: SurveyDefinition) {
  globalThis.surveyActiveCache = {
    expiresAt: Date.now() + ACTIVE_SURVEY_CACHE_TTL_MS,
    value: definition,
  };
  setSurveyByIdCache(definition);
}

function getDefaultAssessmentData(): AssessmentData {
  return FALLBACK_DATA;
}

function optionDisplayLabel(option: SurveyOptionDefinition): string {
  if (option.maturityLevel === null) {
    return option.optionLabel;
  }

  return `L${option.maturityLevel}: ${option.optionLabel}`;
}

function buildAssessmentData(
  surveyRow: DbSurveyRow,
  questions: SurveyQuestionDefinition[]
): AssessmentData {
  const fallback = getDefaultAssessmentData();
  const surveyMetadata = asRecord(surveyRow.metadata);

  const metadata = asRecord(surveyMetadata.assessmentMetadata);
  const assessmentMetadata: AssessmentMetadata = {
    title: asString(metadata.title, fallback.metadata.title),
    description: asString(metadata.description, fallback.metadata.description),
    estimatedMinutes: asNumber(
      metadata.estimatedMinutes,
      fallback.metadata.estimatedMinutes
    ),
    totalMaturityQuestions: asNumber(
      metadata.totalMaturityQuestions,
      fallback.metadata.totalMaturityQuestions
    ),
    totalMarketResearchQuestions: asNumber(
      metadata.totalMarketResearchQuestions,
      fallback.metadata.totalMarketResearchQuestions
    ),
    answersPerMaturityQuestion: asNumber(
      metadata.answersPerMaturityQuestion,
      fallback.metadata.answersPerMaturityQuestion
    ),
    shuffleAnswers: asBoolean(metadata.shuffleAnswers, fallback.metadata.shuffleAnswers),
    framingText: asString(metadata.framingText, fallback.metadata.framingText),
  };

  const capabilities = asArray<Capability>(
    surveyMetadata.capabilities,
    fallback.capabilities
  );
  const archetypes = asArray<Archetype>(surveyMetadata.archetypes, fallback.archetypes);

  const screeningQuestion =
    questions.find((question) => question.section === "screening") ?? null;
  const screeningFallbackResult = asRecord(
    surveyMetadata.screeningFallbackResult ??
      screeningQuestion?.questionMetadata.fallbackResult
  );

  const proceedByValue = asRecord(screeningQuestion?.questionMetadata.proceedByValue);

  const screeningOptions: ScreeningOption[] = screeningQuestion
    ? screeningQuestion.options
        .sort((a, b) => a.optionOrder - b.optionOrder)
        .map((option) => {
          const optionValue = asString(option.optionKey, option.optionLabel);
          const fallbackProceed = optionValue.toLowerCase() === "yes";
          return {
            value: optionValue,
            label: option.optionLabel,
            proceed: asBoolean(proceedByValue[optionValue], fallbackProceed),
          };
        })
    : fallback.screening.options;

  const screening = {
    id: screeningQuestion?.questionKey ?? fallback.screening.id,
    prompt: screeningQuestion?.prompt ?? fallback.screening.prompt,
    options: screeningOptions,
    fallbackResult: {
      archetype: asString(
        screeningFallbackResult.archetype,
        fallback.screening.fallbackResult.archetype
      ),
      name: asString(
        screeningFallbackResult.name,
        fallback.screening.fallbackResult.name
      ),
      tagline: asString(
        screeningFallbackResult.tagline,
        fallback.screening.fallbackResult.tagline
      ),
      description: asString(
        screeningFallbackResult.description,
        fallback.screening.fallbackResult.description
      ),
    },
  };

  const maturityQuestions: MaturityQuestion[] = questions
    .filter((question) => question.section === "maturity")
    .sort((a, b) => a.questionOrder - b.questionOrder)
    .map((question) => ({
      id: question.questionKey,
      group: "maturity",
      capability: question.capabilityId ?? "unknown",
      prompt: question.prompt,
      answers: question.options
        .sort((a, b) => a.optionOrder - b.optionOrder)
        .map((option) => ({
          level:
            option.maturityLevel ??
            (Number.parseInt(option.optionKey?.replace(/\D+/g, "") ?? "", 10) ||
              1),
          text: option.optionLabel,
        })),
    }));

  const marketResearchQuestions: MarketResearchQuestion[] = questions
    .filter((question) => question.section === "market-research")
    .sort((a, b) => a.questionOrder - b.questionOrder)
    .map((question) => {
      const meta = question.questionMetadata;
      const type = question.questionType;
      const options = question.options
        .sort((a, b) => a.optionOrder - b.optionOrder)
        .map((option) => option.optionLabel);

      const mappedQuestion: MarketResearchQuestion = {
        id: question.questionKey,
        group: "market-research",
        type,
        prompt: question.prompt,
        fabriqaCategory: asString(meta.fabriqaCategory, "general"),
      };

      if (options.length > 0) {
        mappedQuestion.options = options;
      }

      if (type === "multi-select") {
        const maxSelections = asNumber(meta.maxSelections, 0);
        if (maxSelections > 0) {
          mappedQuestion.maxSelections = maxSelections;
        }
      }

      const allowOther = asBoolean(meta.allowOther, question.allowOther);
      if (allowOther) {
        mappedQuestion.allowOther = true;
      }

      const required = asBoolean(meta.required, question.isRequired);
      if (required) {
        mappedQuestion.required = true;
      }

      const enrichesCard = asBoolean(meta.enrichesCard, false);
      if (enrichesCard) {
        mappedQuestion.enrichesCard = true;
      }

      const cardDisplay = typeof meta.cardDisplay === "string" ? meta.cardDisplay : null;
      if (cardDisplay) {
        mappedQuestion.cardDisplay = cardDisplay;
      }

      const placeholder = typeof meta.placeholder === "string" ? meta.placeholder : null;
      if (placeholder) {
        mappedQuestion.placeholder = placeholder;
      }

      const maxLength = asNumber(meta.maxLength, 0);
      if (maxLength > 0) {
        mappedQuestion.maxLength = maxLength;
      }

      return mappedQuestion;
    });

  return {
    version: asString(
      surveyMetadata.assessmentVersion,
      `survey-v${surveyRow.version_number}`
    ),
    metadata: assessmentMetadata,
    screening,
    capabilities,
    archetypes,
    maturityQuestions,
    marketResearchQuestions,
  };
}

async function loadSurveyDefinitionByQuery(
  client: PoolClient,
  whereClause: string,
  values: unknown[]
): Promise<SurveyDefinition | null> {
  const surveyResult = await client.query<DbSurveyRow>(
    `
      SELECT
        id,
        version_number,
        name,
        status,
        source_checksum,
        metadata,
        activated_at
      FROM survey
      WHERE ${whereClause}
      ORDER BY version_number DESC
      LIMIT 1
    `,
    values
  );

  if (surveyResult.rowCount === 0) {
    return null;
  }

  const surveyRow = surveyResult.rows[0];

  const questionResult = await client.query<DbQuestionRow>(
    `
      SELECT
        sqm.id AS map_id,
        sqm.survey_id,
        sqm.section,
        sqm.question_order,
        sqm.is_scored,
        sqm.is_enabled,
        sqm.metadata AS map_metadata,
        ql.id AS question_id,
        ql.question_key,
        ql.question_group,
        ql.question_type,
        ql.capability_id,
        ql.prompt,
        ql.allow_other,
        ql.is_required,
        ql.metadata AS question_metadata
      FROM survey_question_map sqm
      JOIN question_lookup ql ON ql.id = sqm.question_id
      WHERE sqm.survey_id = $1
        AND sqm.is_enabled = TRUE
      ORDER BY
        CASE sqm.section
          WHEN 'screening' THEN 1
          WHEN 'maturity' THEN 2
          ELSE 3
        END,
        sqm.question_order ASC
    `,
    [surveyRow.id]
  );

  const questionIds = questionResult.rows.map((row) => row.question_id);

  const optionResult =
    questionIds.length > 0
      ? await client.query<DbOptionRow>(
          `
            SELECT
              id,
              question_id,
              option_key,
              option_label,
              maturity_level,
              option_order,
              is_other_option
            FROM question_option_lookup
            WHERE question_id = ANY($1::uuid[])
            ORDER BY question_id, option_order ASC
          `,
          [questionIds]
        )
      : { rows: [] as DbOptionRow[] };

  const optionsByQuestionId = new Map<string, SurveyOptionDefinition[]>();
  for (const row of optionResult.rows) {
    const option: SurveyOptionDefinition = {
      id: row.id,
      optionKey: row.option_key,
      optionLabel: row.option_label,
      maturityLevel:
        typeof row.maturity_level === "number" ? row.maturity_level : null,
      optionOrder: row.option_order,
      isOtherOption: row.is_other_option,
    };

    const existing = optionsByQuestionId.get(row.question_id);
    if (existing) {
      existing.push(option);
    } else {
      optionsByQuestionId.set(row.question_id, [option]);
    }
  }

  const questions: SurveyQuestionDefinition[] = questionResult.rows.map((row) => ({
    mapId: row.map_id,
    surveyId: row.survey_id,
    section: row.section,
    questionOrder: row.question_order,
    isScored: row.is_scored,
    isEnabled: row.is_enabled,
    mapMetadata: asRecord(row.map_metadata),
    questionId: row.question_id,
    questionKey: row.question_key,
    questionGroup: row.question_group,
    questionType: row.question_type,
    capabilityId: row.capability_id,
    prompt: row.prompt,
    allowOther: row.allow_other,
    isRequired: row.is_required,
    questionMetadata: asRecord(row.question_metadata),
    options:
      optionsByQuestionId.get(row.question_id)?.sort(
        (a, b) => a.optionOrder - b.optionOrder
      ) ?? [],
  }));

  return {
    surveyId: surveyRow.id,
    versionNumber: surveyRow.version_number,
    name: surveyRow.name,
    status: surveyRow.status,
    sourceChecksum: surveyRow.source_checksum,
    activatedAt: parseIsoDate(surveyRow.activated_at),
    metadata: asRecord(surveyRow.metadata),
    questions,
    assessmentData: buildAssessmentData(surveyRow, questions),
  };
}

function buildQuestionSeeds(data: AssessmentData): QuestionSeed[] {
  const seeds: QuestionSeed[] = [];

  const screeningProceedMap: Record<string, boolean> = {};
  for (const option of data.screening.options) {
    screeningProceedMap[option.value] = option.proceed;
  }

  seeds.push({
    questionKey: data.screening.id,
    section: "screening",
    questionType: "single-select",
    capabilityId: null,
    prompt: data.screening.prompt,
    allowOther: false,
    isRequired: true,
    questionMetadata: {
      proceedByValue: screeningProceedMap,
      fallbackResult: data.screening.fallbackResult,
    },
    mapMetadata: {},
    isScored: false,
    options: data.screening.options.map((option, index) => ({
      optionKey: option.value,
      optionLabel: option.label,
      maturityLevel: null,
      optionOrder: index + 1,
      isOtherOption: false,
    })),
  });

  for (const question of data.maturityQuestions) {
    seeds.push({
      questionKey: question.id,
      section: "maturity",
      questionType: "single-select",
      capabilityId: question.capability,
      prompt: question.prompt,
      allowOther: false,
      isRequired: true,
      questionMetadata: {},
      mapMetadata: {},
      isScored: true,
      options: question.answers.map((answer, index) => ({
        optionKey: `L${answer.level}`,
        optionLabel: answer.text,
        maturityLevel: answer.level,
        optionOrder: index + 1,
        isOtherOption: false,
      })),
    });
  }

  for (const question of data.marketResearchQuestions) {
    const optionValues = Array.isArray(question.options) ? question.options : [];

    seeds.push({
      questionKey: question.id,
      section: "market-research",
      questionType: question.type,
      capabilityId: null,
      prompt: question.prompt,
      allowOther: question.allowOther ?? false,
      isRequired: question.required ?? false,
      questionMetadata: {
        maxSelections: question.maxSelections ?? null,
        allowOther: question.allowOther ?? false,
        required: question.required ?? false,
        enrichesCard: question.enrichesCard ?? false,
        cardDisplay: question.cardDisplay ?? null,
        placeholder: question.placeholder ?? null,
        maxLength: question.maxLength ?? null,
        fabriqaCategory: question.fabriqaCategory,
      },
      mapMetadata: {},
      isScored: false,
      options: optionValues.map((option, index) => ({
        optionKey: `opt-${index + 1}`,
        optionLabel: option,
        maturityLevel: null,
        optionOrder: index + 1,
        isOtherOption: false,
      })),
    });
  }

  return seeds;
}

async function upsertQuestionWithOptions(
  client: PoolClient,
  seed: QuestionSeed
): Promise<string> {
  const questionResult = await client.query<{ id: string }>(
    `
      INSERT INTO question_lookup (
        question_key,
        question_group,
        question_type,
        capability_id,
        prompt,
        allow_other,
        is_required,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (question_key)
      DO UPDATE SET
        question_group = EXCLUDED.question_group,
        question_type = EXCLUDED.question_type,
        capability_id = EXCLUDED.capability_id,
        prompt = EXCLUDED.prompt,
        allow_other = EXCLUDED.allow_other,
        is_required = EXCLUDED.is_required,
        metadata = EXCLUDED.metadata
      RETURNING id
    `,
    [
      seed.questionKey,
      seed.section,
      seed.questionType,
      seed.capabilityId,
      seed.prompt,
      seed.allowOther,
      seed.isRequired,
      JSON.stringify(seed.questionMetadata),
    ]
  );

  const questionId = questionResult.rows[0]?.id;
  if (!questionId) {
    throw new Error(`Failed to upsert question ${seed.questionKey}`);
  }

  if (seed.options.length === 0) {
    return questionId;
  }

  // Move historical option orders out of the active range to avoid collisions.
  await client.query(
    `
      UPDATE question_option_lookup
      SET option_order = option_order + 1000
      WHERE question_id = $1
    `,
    [questionId]
  );

  for (const option of seed.options) {
    await client.query(
      `
        INSERT INTO question_option_lookup (
          question_id,
          option_key,
          option_label,
          maturity_level,
          option_order,
          is_other_option
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (question_id, option_key)
        DO UPDATE SET
          option_label = EXCLUDED.option_label,
          maturity_level = EXCLUDED.maturity_level,
          option_order = EXCLUDED.option_order,
          is_other_option = EXCLUDED.is_other_option
      `,
      [
        questionId,
        option.optionKey,
        option.optionLabel,
        option.maturityLevel,
        option.optionOrder,
        option.isOtherOption,
      ]
    );
  }

  return questionId;
}

async function createSurveyVersion(
  client: PoolClient,
  data: AssessmentData,
  source: string,
  name: string
): Promise<SurveyImportResult> {
  const checksum = hashPayload(data);
  const seeds = buildQuestionSeeds(data);

  const questionIdByKey = new Map<string, string>();
  for (const seed of seeds) {
    const questionId = await upsertQuestionWithOptions(client, seed);
    questionIdByKey.set(seed.questionKey, questionId);
  }

  const versionResult = await client.query<{ version_number: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number FROM survey`
  );

  const versionNumber = versionResult.rows[0]?.version_number;
  if (!versionNumber) {
    throw new Error("Failed to allocate survey version number");
  }

  await client.query(`UPDATE survey SET status = 'archived' WHERE status = 'active'`);

  const surveyMetadata = {
    assessmentVersion: data.version,
    assessmentMetadata: data.metadata,
    capabilities: data.capabilities,
    archetypes: data.archetypes,
    screeningFallbackResult: data.screening.fallbackResult,
  };

  const surveyInsertResult = await client.query<{ id: string }>(
    `
      INSERT INTO survey (
        version_number,
        name,
        status,
        source,
        source_checksum,
        metadata,
        activated_at
      ) VALUES ($1, $2, 'active', $3, $4, $5::jsonb, NOW())
      RETURNING id
    `,
    [versionNumber, name, source, checksum, JSON.stringify(surveyMetadata)]
  );

  const surveyId = surveyInsertResult.rows[0]?.id;
  if (!surveyId) {
    throw new Error("Failed to create survey row");
  }

  const questionOrderBySection = {
    screening: 0,
    maturity: 0,
    "market-research": 0,
  } as Record<SurveySection, number>;

  for (const seed of seeds) {
    const questionId = questionIdByKey.get(seed.questionKey);
    if (!questionId) {
      throw new Error(`Missing question id for ${seed.questionKey}`);
    }

    questionOrderBySection[seed.section] += 1;

    await client.query(
      `
        INSERT INTO survey_question_map (
          survey_id,
          question_id,
          section,
          question_order,
          is_scored,
          is_enabled,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, TRUE, $6::jsonb)
      `,
      [
        surveyId,
        questionId,
        seed.section,
        questionOrderBySection[seed.section],
        seed.isScored,
        JSON.stringify(seed.mapMetadata),
      ]
    );
  }

  return {
    surveyId,
    versionNumber,
    sourceChecksum: checksum,
  };
}

export function getFallbackSurveyData(): AssessmentData {
  return getDefaultAssessmentData();
}

export async function importSurveyFromAssessmentData(
  data: AssessmentData,
  options?: {
    source?: string;
    name?: string;
  }
): Promise<SurveyImportResult> {
  await ensureAssessmentSchema();

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await createSurveyVersion(
      client,
      data,
      options?.source ?? "questions.json",
      options?.name ?? "AI-Native Engineering Maturity Assessment"
    );

    await client.query("COMMIT");
    clearSurveyCache();

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function importSurveyFromQuestionBank(): Promise<SurveyImportResult> {
  return importSurveyFromAssessmentData(getFallbackSurveyData(), {
    source: "questions.json",
    name: "AI-Native Engineering Maturity Assessment",
  });
}

export async function getActiveSurveyDefinition(options?: {
  bootstrapFromJson?: boolean;
  useCache?: boolean;
}): Promise<SurveyDefinition | null> {
  const shouldUseCache = options?.useCache ?? true;
  if (shouldUseCache) {
    const cached = getActiveSurveyCache();
    if (cached) {
      return cached;
    }
  }

  await ensureAssessmentSchema();

  const pool = getPool();
  const client = await pool.connect();

  try {
    let definition = await loadSurveyDefinitionByQuery(client, `status = 'active'`, []);

    if (!definition && (options?.bootstrapFromJson ?? true)) {
      await client.query("BEGIN");
      try {
        await createSurveyVersion(
          client,
          getFallbackSurveyData(),
          "questions.json",
          "AI-Native Engineering Maturity Assessment"
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }

      definition = await loadSurveyDefinitionByQuery(client, `status = 'active'`, []);
    }

    if (!definition) {
      return null;
    }

    setActiveSurveyCache(definition);
    return definition;
  } finally {
    client.release();
  }
}

export async function getSurveyDefinitionById(
  surveyId: string,
  options?: { useCache?: boolean }
): Promise<SurveyDefinition | null> {
  const shouldUseCache = options?.useCache ?? true;
  if (shouldUseCache) {
    const cached = getSurveyByIdCache(surveyId);
    if (cached) {
      return cached;
    }
  }

  await ensureAssessmentSchema();

  const pool = getPool();
  const client = await pool.connect();
  try {
    const definition = await loadSurveyDefinitionByQuery(client, `id = $1`, [surveyId]);
    if (!definition) {
      return null;
    }

    setSurveyByIdCache(definition);
    return definition;
  } finally {
    client.release();
  }
}

export function findSurveyQuestionByKey(
  definition: SurveyDefinition,
  questionKey: string,
  section?: SurveySection
): SurveyQuestionDefinition | null {
  return (
    definition.questions.find((question) => {
      if (question.questionKey !== questionKey) {
        return false;
      }

      if (section && question.section !== section) {
        return false;
      }

      return true;
    }) ?? null
  );
}

export function findSurveyOptionByValue(
  question: SurveyQuestionDefinition,
  value: string
): SurveyOptionDefinition | null {
  const normalized = value.trim().toLowerCase();

  const direct = question.options.find((option) => {
    if (option.optionKey && option.optionKey.toLowerCase() === normalized) {
      return true;
    }

    return option.optionLabel.trim().toLowerCase() === normalized;
  });

  return direct ?? null;
}

export function findSurveyOptionByMaturityLevel(
  question: SurveyQuestionDefinition,
  level: number
): SurveyOptionDefinition | null {
  return (
    question.options.find((option) => option.maturityLevel === level) ?? null
  );
}

export function summarizeSurveyQuestion(
  question: SurveyQuestionDefinition
): string {
  const prefix = `${question.questionKey}. ${question.prompt}`;
  if (question.options.length === 0) {
    return prefix;
  }

  return `${prefix}\n${question.options
    .map((option) => `- ${optionDisplayLabel(option)}`)
    .join("\n")}`;
}
