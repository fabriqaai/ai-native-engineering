# Scoring & Data Specification v2.0

## Scoring Algorithm

### Per-Answer Points
Each maturity question has 5 answer options. Each answer maps to a maturity level:

| Level | Points |
|-------|--------|
| L1 | 1 |
| L2 | 2 |
| L3 | 3 |
| L4 | 4 |
| L5 | 5 |

### Capability Score (0-100)

Each capability has exactly 2 questions. Score formula:

```
capability_score = ((mean_of_2_answer_levels - 1) / 4) * 100
```

**Examples:**
- Both L1 → mean = 1.0 → score = 0
- Both L3 → mean = 3.0 → score = 50
- Both L5 → mean = 5.0 → score = 100
- L2 + L4 → mean = 3.0 → score = 50
- L1 + L5 → mean = 3.0 → score = 50

### Overall Score (0-100)

Equal-weight average of 7 capability scores:

```
overall_score = (specs + context + agents + feedback + governance + delivery + organization) / 7
```

Round to nearest integer for display.

### Archetype Assignment

| Score Range | Archetype ID | Name |
|-------------|-------------|------|
| 0-20 | explorer | The Explorer |
| 21-40 | adopter | The Adopter |
| 41-60 | integrator | The Integrator |
| 61-80 | conductor | The Conductor |
| 81-100 | architect | The Architect |

Boundary rule: score of exactly 20 → Explorer, score of exactly 21 → Adopter, etc.

### Pre-Explorer (Screening Fallback)

If the screening question answer is "No": skip scoring entirely, assign Pre-Explorer archetype with no numeric score.

---

## Scoring Edge Cases

**All same level:** Valid. A developer who answers L2 on everything gets score = 25 (Adopter). This is realistic.

**Extreme spread:** A developer with some L1 and some L5 answers. The math works — they'll get a mid-range score. The radar chart shows the variance, which is more useful than the overall number.

**Equal reliability:** All 7 capabilities have exactly 2 questions each, so all capability scores have the same confidence interval. This is an improvement over v1 where dimensions had 2 or 3 questions.

**Rounding:** All intermediate calculations use full precision. Only the final display values are rounded:
- Capability scores: round to nearest integer
- Overall score: round to nearest integer
- No rounding on archetype boundaries (use exact comparison)

---

## Growth Recommendations

Each archetype has a general growth focus (defined in `questions.json`). Additionally, per-capability recommendations are generated based on the lowest-scoring capabilities:

**Rule:** Surface the 2 lowest-scoring capabilities as growth areas. For each, provide:
1. The capability name and current score
2. A specific next-step recommendation
3. A link to the relevant maturity model section

**Per-capability growth recommendations:**

| Capability | Low Score Recommendation |
|-----------|------------------------|
| Specs | "Write a structured spec for your next feature before touching code. Include acceptance criteria that AI can use to generate tests." |
| Context | "Set up persistent context for your AI tools — project rules files, architecture docs, or memory features. Stop starting from zero every session." |
| Agents | "Try delegating a multi-step task to AI agents instead of doing each step yourself. Start with a well-defined task like writing tests for existing code." |
| Feedback | "Start tracking one metric about AI effectiveness — acceptance rate, rework frequency, or time saved. You can't improve what you don't measure." |
| Governance | "Add one automated quality check to your AI workflow — a linter rule, a test coverage gate, or a security scan that runs on all code." |
| Delivery | "Connect your specs to your CI/CD pipeline. Start by making specs machine-readable so automation can consume them." |
| Organization | "Share one AI workflow with your team this week. Start a channel or doc where people post AI tips — making sharing normal is the first step." |

---

## Data Schema (PostgreSQL on Railway)

### Table: `assessments`

```sql
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Screening
  screening_answer TEXT NOT NULL CHECK (screening_answer IN ('yes', 'no')),

  -- Raw answers (only populated if screening passed)
  -- Format: {"Q1a": 3, "Q1b": 4, "Q2a": 2, ...}
  answers JSONB,

  -- Computed scores (0-100)
  score_overall INTEGER,
  score_specs INTEGER,
  score_context INTEGER,
  score_agents INTEGER,
  score_feedback INTEGER,
  score_governance INTEGER,
  score_delivery INTEGER,
  score_organization INTEGER,
  archetype_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  referrer TEXT,
  session_id TEXT,  -- anonymous session tracking (no PII)

  -- Email (optional, only if user provides)
  email TEXT
);

CREATE INDEX idx_assessments_archetype ON assessments(archetype_id);
CREATE INDEX idx_assessments_created_at ON assessments(created_at);
CREATE INDEX idx_assessments_score ON assessments(score_overall);
```

### Table: `market_research_responses`

```sql
CREATE TABLE market_research_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,  -- M1, M2, M3, M4, M5, M6, M7, M8

  -- Response data (type depends on question)
  response JSONB NOT NULL,
  -- M1: {"selected": ["Claude Code", "Cursor"], "other": "Bolt"}
  -- M2: {"selected": "Daily"}
  -- M3: {"selected": ["Code generation", "Debugging", "Writing tests"]}
  -- M4: {"selected": "Context gets lost between sessions", "other": null}
  -- M5: {"text": "Cross-session memory that actually works"}
  -- M6: {"selected": "$21-50"}
  -- M7: {"selected": "Solo"}
  -- M8: {"selected": "Individual contributor"}

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mr_assessment ON market_research_responses(assessment_id);
CREATE INDEX idx_mr_question ON market_research_responses(question_id);
```

---

## Fabriqa Analytics Queries

### Tool Adoption by Maturity Level

```sql
SELECT
  a.archetype_id,
  tool,
  COUNT(*) as users
FROM market_research_responses mr
JOIN assessments a ON mr.assessment_id = a.id
CROSS JOIN LATERAL jsonb_array_elements_text(mr.response->'selected') AS tool
WHERE mr.question_id = 'M1'
GROUP BY a.archetype_id, tool
ORDER BY a.archetype_id, users DESC;
```

### Top Friction Points by Maturity Level

```sql
SELECT
  a.archetype_id,
  mr.response->>'selected' AS friction,
  COUNT(*) AS mentions
FROM market_research_responses mr
JOIN assessments a ON mr.assessment_id = a.id
WHERE mr.question_id = 'M4'
GROUP BY a.archetype_id, friction
ORDER BY a.archetype_id, mentions DESC;
```

### Use Case Distribution by Maturity

```sql
SELECT
  a.archetype_id,
  use_case,
  COUNT(*) AS mentions
FROM market_research_responses mr
JOIN assessments a ON mr.assessment_id = a.id
CROSS JOIN LATERAL jsonb_array_elements_text(mr.response->'selected') AS use_case
WHERE mr.question_id = 'M3'
GROUP BY a.archetype_id, use_case
ORDER BY a.archetype_id, mentions DESC;
```

### Spending Distribution by Maturity

```sql
SELECT
  a.archetype_id,
  mr.response->>'selected' AS spending_tier,
  COUNT(*) AS respondents
FROM market_research_responses mr
JOIN assessments a ON mr.assessment_id = a.id
WHERE mr.question_id = 'M6'
GROUP BY a.archetype_id, spending_tier
ORDER BY a.archetype_id;
```

### Team Size vs Maturity Score

```sql
SELECT
  mr.response->>'selected' AS team_size,
  a.archetype_id,
  AVG(a.score_overall) AS avg_score,
  COUNT(*) AS respondents
FROM market_research_responses mr
JOIN assessments a ON mr.assessment_id = a.id
WHERE mr.question_id = 'M7'
GROUP BY team_size, a.archetype_id
ORDER BY team_size, a.archetype_id;
```

### Role Distribution by Maturity

```sql
SELECT
  mr.response->>'selected' AS role,
  a.archetype_id,
  COUNT(*) AS respondents
FROM market_research_responses mr
JOIN assessments a ON mr.assessment_id = a.id
WHERE mr.question_id = 'M8'
GROUP BY role, a.archetype_id
ORDER BY role, a.archetype_id;
```

### Score Distribution (for calibration)

```sql
SELECT
  archetype_id,
  COUNT(*) AS total,
  ROUND(AVG(score_overall)) AS avg_score,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY score_overall) AS p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY score_overall) AS median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY score_overall) AS p75
FROM assessments
WHERE screening_answer = 'yes'
GROUP BY archetype_id;
```

### Capability Score Correlation Matrix

```sql
SELECT
  CORR(score_specs, score_context) AS specs_context,
  CORR(score_specs, score_agents) AS specs_agents,
  CORR(score_agents, score_feedback) AS agents_feedback,
  CORR(score_governance, score_delivery) AS governance_delivery,
  CORR(score_delivery, score_organization) AS delivery_org
FROM assessments
WHERE screening_answer = 'yes';
```

---

## Share Card Data

The share card image (generated server-side via Satori/@vercel/og) includes:

| Field | Source |
|-------|--------|
| Archetype name + tagline | Scoring result |
| Overall score | Scoring result |
| Radar chart (7 spokes) | Capability scores |
| Tool badges | M1 response (if provided) |
| Team size label | M7 response (if provided) |
| Date taken | Assessment timestamp |
| URL | ainative.engineering/assessment |

### Card Formats

| Format | Dimensions | Use Case |
|--------|-----------|----------|
| Landscape | 1200 x 630 | Twitter/LinkedIn/Open Graph |
| Story | 1080 x 1920 | Instagram/mobile sharing |

---

## Privacy & Data

- No PII collected unless user voluntarily provides email
- Session ID is a random UUID, not tied to any identity
- All data stored on Railway PostgreSQL
- No third-party analytics tracking in v1
- Data retention: indefinite for aggregate analytics, email addresses can be deleted on request
- GDPR-compatible: no cookies required for assessment, optional email is clearly opt-in
