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
