import { Pool, type PoolClient } from "pg";

declare global {
  var assessmentPool: Pool | undefined;
  var assessmentSchemaReady: Promise<void> | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  return new Pool({ connectionString });
}

export function getPool(): Pool {
  if (!globalThis.assessmentPool) {
    globalThis.assessmentPool = createPool();
  }

  return globalThis.assessmentPool;
}

async function createSchema(client: PoolClient) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  // Legacy tables retained for rollback and historical backfill.
  await client.query(`
    CREATE TABLE IF NOT EXISTS assessments (
      id UUID PRIMARY KEY,
      screening_answer TEXT NOT NULL CHECK (screening_answer IN ('yes', 'no')),
      answers JSONB,
      score_overall INTEGER,
      score_specs INTEGER,
      score_context INTEGER,
      score_agents INTEGER,
      score_feedback INTEGER,
      score_governance INTEGER,
      score_delivery INTEGER,
      score_organization INTEGER,
      archetype_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_agent TEXT,
      referrer TEXT,
      session_id TEXT,
      email TEXT
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_assessments_archetype
      ON assessments(archetype_id);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_assessments_created_at
      ON assessments(created_at);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_assessments_score
      ON assessments(score_overall);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS market_research_responses (
      id UUID PRIMARY KEY,
      assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      response JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_mr_assessment
      ON market_research_responses(assessment_id);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_mr_question
      ON market_research_responses(question_id);
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mr_assessment_question_unique
      ON market_research_responses(assessment_id, question_id);
  `);

  // New normalized survey model.
  await client.query(`
    CREATE TABLE IF NOT EXISTS question_lookup (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_key TEXT NOT NULL UNIQUE,
      question_group TEXT NOT NULL CHECK (question_group IN ('screening','maturity','market-research')),
      question_type TEXT NOT NULL CHECK (question_type IN ('single-select','multi-select','open-text')),
      capability_id TEXT,
      prompt TEXT NOT NULL,
      allow_other BOOLEAN NOT NULL DEFAULT FALSE,
      is_required BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS question_option_lookup (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id UUID NOT NULL REFERENCES question_lookup(id) ON DELETE CASCADE,
      option_key TEXT,
      option_label TEXT NOT NULL,
      maturity_level SMALLINT,
      option_order INT NOT NULL,
      is_other_option BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (question_id, option_order),
      UNIQUE (question_id, option_key)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS survey (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      version_number INT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft','active','archived')),
      source TEXT NOT NULL DEFAULT 'questions.json',
      source_checksum TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at TIMESTAMPTZ
    );
  `);
  await client.query(`
    ALTER TABLE survey
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS survey_question_map (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      survey_id UUID NOT NULL REFERENCES survey(id) ON DELETE CASCADE,
      question_id UUID NOT NULL REFERENCES question_lookup(id),
      section TEXT NOT NULL CHECK (section IN ('screening','maturity','market-research')),
      question_order INT NOT NULL,
      is_scored BOOLEAN NOT NULL DEFAULT FALSE,
      is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (survey_id, question_id),
      UNIQUE (survey_id, section, question_order)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS survey_submission (
      id UUID PRIMARY KEY,
      survey_id UUID NOT NULL REFERENCES survey(id),
      session_id TEXT,
      user_agent TEXT,
      referrer TEXT,
      respondent_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS survey_submission_answer (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES survey_submission(id) ON DELETE CASCADE,
      survey_question_map_id UUID NOT NULL REFERENCES survey_question_map(id),
      question_id UUID NOT NULL REFERENCES question_lookup(id),
      option_id UUID REFERENCES question_option_lookup(id),
      answer_kind TEXT NOT NULL CHECK (answer_kind IN ('selected_option','other_text','open_text','screening')),
      answer_text TEXT,
      answer_numeric NUMERIC,
      answer_boolean BOOLEAN,
      answer_index INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_answer_unique
      ON survey_submission_answer(
        submission_id,
        question_id,
        answer_kind,
        COALESCE(option_id, '00000000-0000-0000-0000-000000000000'::uuid),
        answer_index
      );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_submission_answer_submission
      ON survey_submission_answer(submission_id);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_submission_answer_question
      ON survey_submission_answer(question_id);
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_submission_answer_option
      ON survey_submission_answer(option_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS survey_submission_score (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      submission_id UUID NOT NULL REFERENCES survey_submission(id) ON DELETE CASCADE,
      score_scope TEXT NOT NULL CHECK (score_scope IN ('overall','capability','question')),
      scope_key TEXT NOT NULL,
      score_value NUMERIC(6,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (submission_id, score_scope, scope_key)
    );
  `);
}

export async function ensureAssessmentSchema() {
  const pool = getPool();

  if (!globalThis.assessmentSchemaReady) {
    globalThis.assessmentSchemaReady = (async () => {
      const client = await pool.connect();
      try {
        await createSchema(client);
      } finally {
        client.release();
      }
    })();
  }

  await globalThis.assessmentSchemaReady;
}
