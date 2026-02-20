# AI-Native Engineering Maturity Assessment

## Design Document v2.0

### Overview

An interactive, personality.co-style assessment that measures how deeply AI is integrated into a developer's engineering practice. 14 behavioral questions across 7 capabilities produce a maturity score (0-100), an archetype, and a shareable 7-spoke radar chart card.

**Dual purpose:**

1. **Developer value** (primary) — Maturity score, archetype, personalized growth path, shareable card
2. **Fabriqa insights** (secondary) — Tool adoption, friction points, spending, team context, role data

**Design promise:** 14 scored questions + 8 unscored market research questions. Results first, then market research. Total ~3-4 minutes.

---

## What Changed from v1

| Before (v1) | After (v2) | Why |
|-------------|------------|-----|
| 6 MDX dimensions (Strategy, Culture, etc.) | **7 Excel capabilities** as the framework | The Excel model IS the maturity model — it has L0-L5 behavioral descriptions per capability. The MDX's 6 labels were a lossy abstraction. |
| 15 maturity questions (3 answer options) | **14 maturity questions** (5 answer options = L1-L5) | Clean 2-per-capability distribution; full L1-L5 granularity |
| 6 insight questions | **8 market research questions** | Expanded using EPAM's validated survey instruments (273 real responses) |
| Dimension mapping was our invention | **No mapping needed** — Excel capabilities used directly | Eliminates the subjective mapping layer |
| No academic validation | **Validated against 6 arxiv papers** + EPAM data | Novel assessment — no competing instrument exists |

---

## Framework: 7 Excel Capabilities (L0-L5)

Directly from `AI-Native_Engineering_Maturity_Model_v1.0.xlsx`:

| # | Capability | Radar Label | L1 (Beginner) | L3 (Midpoint) | L5 (Advanced) |
|---|-----------|-------------|----------------|----------------|----------------|
| 1 | Spec-Driven Development | Specs | Experimental AI specs | Executable specs | Living specs maintained by agents |
| 2 | Context Management | Context | Copy-paste context | Centralized context graph | Autonomous self-updating context |
| 3 | Agent Collaboration | Agents | Personal assistants in isolation | Multi-agent shared intent | Fully agentic teams |
| 4 | Observability & Feedback Learning | Feedback | Reactive dashboards | First-class agent metrics | Self-healing feedback loops |
| 5 | Governance & Trust | Governance | Ad-hoc rules | Automated policy enforcement | Continuous compliance + explainability |
| 6 | Continuous Spec & Delivery | Delivery | Partial CI/CD, specs disconnected | Spec-to-task-to-test-to-release automation | Spec-code-infra-docs co-evolution |
| 7 | Organizational Adaptation | Organization | Early adopters experiment | Processes redesigned around AI | Living system — humans + AI co-evolve |

---

## Two Question Groups (Internal Classification)

Both groups shown to visitors as one seamless experience. The "maturity" vs "market-research" tag is **internal metadata** in `questions.json` — not visible in the UI.

| Group | Purpose | Count | Format | Scored? |
|-------|---------|-------|--------|---------|
| **Maturity** | Determines archetype, radar chart, growth path | 14 | Situational judgment (5 options = L1-L5) | Yes |
| **Market Research** | Fabriqa insights: tools, pain points, spending | 8 | Multi-select, single-select, free text | No |

**Visitor flow**: Screening → 14 maturity questions → Results (archetype + radar) → 8 market research questions → Share card

---

## Question Format: Situational Judgment

Every maturity question uses a **situational judgment format**: 5 answer options, each describing a concrete behavior at a specific maturity level (L1-L5). The developer picks whichever sounds most like their current practice.

**Why this format:**
- Eliminates aspirational inflation (no "strongly agree" on vague statements)
- Each answer IS a maturity level — no ambiguous scoring
- Answers are shuffled in the live assessment to prevent gaming
- Solo developers can reach L5 on every capability

**Critical design rule:** ALL answer options — including L4 and L5 — describe concrete, first-person behaviors. No abstract system-state descriptions.

---

## Screening Question

> **S1: "Do you currently use any AI tools in your development work?"**
> - Yes → Proceed to 14 maturity questions
> - No → Skip to "Pre-Explorer" result page

If **"No"** → show a custom Pre-Explorer result:
- Archetype: Pre-Explorer — "Your AI journey starts here"
- Community invitation + curated getting-started resources
- Link to the maturity model documentation

---

## Framing Text

Shown before Q1a:

> "Pick the option closest to your **current** practice — there are no right or wrong answers. This is about where you are today, not where you want to be."

---

## The 14 Maturity Questions

### Capability 1: Spec-Driven Development

#### Q1a — When you start building a new feature, how do you define what needs to be built?

| Level | Answer |
|-------|--------|
| L1 | I describe it verbally or in a brief ticket — no formal spec |
| L2 | I use a template or structured format (PRD, user story, ADR) |
| L3 | I write a spec that agents can directly execute — it generates code, tests, or tasks |
| L4 | My spec stays linked to the code and tests — when one changes, the others update |
| L5 | I set the goal and agents write, evolve, and maintain the spec as they build |

#### Q1b — How machine-readable are your project specifications?

| Level | Answer |
|-------|--------|
| L1 | Written for humans — plain text, Slack messages, or verbal descriptions |
| L2 | Partially structured — templates with consistent sections, but agents can't parse them directly |
| L3 | Agents can read and act on them — structured enough to generate code or tests |
| L4 | Specs, code, and tests are connected — I can trace any output back to the requirement |
| L5 | Agents maintain specs autonomously — they update as the project evolves |

---

### Capability 2: Context Management

#### Q2a — How do your AI tools get context about your project?

| Level | Answer |
|-------|--------|
| L1 | I copy-paste relevant code or docs into the chat each time |
| L2 | I maintain context files, READMEs, or tagging conventions that help AI tools understand my project |
| L3 | My project has a connected knowledge base that links specs, code, people, and data |
| L4 | My tools share memory across sessions — context carries over automatically between different tools |
| L5 | Context updates itself based on what I do and what happens in production — I never manually provide it |

#### Q2b — What happens to the knowledge generated during a coding session?

| Level | Answer |
|-------|--------|
| L1 | It's mostly lost — each session starts fresh |
| L2 | I save important findings in docs, notes, or project files manually |
| L3 | Context is captured in standardized formats that the team and tools can reuse |
| L4 | New knowledge automatically connects to existing specs, decisions, and code |
| L5 | The system remembers everything and updates itself — I never re-explain context |

---

### Capability 3: Agent Collaboration

#### Q3a — How do AI tools fit into your daily development workflow?

| Level | Answer |
|-------|--------|
| L1 | I use a single AI assistant for occasional help — my workflow is mostly manual |
| L2 | I have regular AI-assisted patterns for recurring tasks like tests, docs, or code generation |
| L3 | Multiple AI agents work together on my tasks, sharing a common plan or intent |
| L4 | My agents choose their own approach and improve based on what worked before |
| L5 | I set the direction and review — agents handle the full execution workflow autonomously |

#### Q3b — When you need to complete a complex task involving multiple steps, how do AI agents participate?

| Level | Answer |
|-------|--------|
| L1 | I do each step myself and might ask AI for help on individual pieces |
| L2 | I have a defined workflow where AI handles specific steps (e.g., write code then AI writes tests) |
| L3 | Agents coordinate across steps — they understand the full task and divide the work |
| L4 | Agents dynamically figure out the best approach and adapt when things go wrong |
| L5 | I describe the end goal and agents orchestrate the entire multi-step process end-to-end |

---

### Capability 4: Observability & Feedback Learning

#### Q4a — How do you know if AI is actually helping your development process?

| Level | Answer |
|-------|--------|
| L1 | I have a gut feeling but don't measure it — I notice when it helps or fails |
| L2 | I check basic metrics or dashboards when something goes wrong |
| L3 | AI performance feedback is built into my delivery process — I review it regularly |
| L4 | When AI underperforms, the system automatically adjusts (retries, different approach, flags for review) |
| L5 | My system gets smarter over time — it fixes recurring issues on its own and agents improve their approach |

#### Q4b — What happens when an AI-generated output fails or produces a bug?

| Level | Answer |
|-------|--------|
| L1 | I fix it manually and move on — no systematic tracking |
| L2 | I note it mentally and might adjust my prompts next time |
| L3 | Failures feed back into my workflow — I update context, prompts, or rules to prevent recurrence |
| L4 | The system detects the failure pattern and triggers a corrective action automatically |
| L5 | Failures are learning events — the system adapts its reasoning and gets better without my intervention |

---

### Capability 5: Governance & Trust

#### Q5a — How do you ensure AI-generated code is safe and correct before it ships?

| Level | Answer |
|-------|--------|
| L1 | I review it myself — same as any code, no special AI process |
| L2 | I follow some informal rules (don't paste secrets, review AI output carefully) |
| L3 | There are documented policies and guidelines for AI-generated code quality |
| L4 | Automated checks in my pipeline enforce AI-specific quality and security policies |
| L5 | Multiple automated checks run continuously — policies adapt, agents audit each other, and every decision is traceable |

#### Q5b — When AI produces code you don't fully understand, what do you do?

| Level | Answer |
|-------|--------|
| L1 | I rewrite it myself — I need to understand every line |
| L2 | I ask the AI to explain it and review carefully before accepting |
| L3 | I validate it against the spec and run tests — if it passes the checks, I accept it |
| L4 | I focus on whether it achieves the intent — automated verification handles the details |
| L5 | I trust the verification pipeline — agents check each other's work and flag anything that needs human review |

---

### Capability 6: Continuous Specification & Delivery

#### Q6a — How connected is the path from your requirements/specs to production deployment?

| Level | Answer |
|-------|--------|
| L1 | Loosely connected — I write code, run tests, and deploy with mostly manual steps |
| L2 | I have CI/CD but my specs aren't directly connected to the pipeline |
| L3 | My specs feed into the pipeline as metadata — they trigger relevant automation |
| L4 | Specs automatically translate into tasks, tests, and releases end-to-end |
| L5 | The system evolves specs, code, infrastructure, and docs together — one change flows through everything |

#### Q6b — How do changes in requirements flow through to your delivered software?

| Level | Answer |
|-------|--------|
| L1 | I manually update code, tests, and docs when requirements change |
| L2 | Some automation exists but I still coordinate most changes manually |
| L3 | Requirement changes trigger automated updates to related tests and tasks |
| L4 | My delivery system adapts continuously — specs drive everything downstream automatically |
| L5 | Agents propagate requirement changes through code, tests, infra, and docs without my intervention |

---

### Capability 7: Organizational Adaptation

#### Q7a — How has AI changed the way you or your team organizes work?

| Level | Answer |
|-------|--------|
| L1 | It hasn't — individual team members experiment on their own |
| L2 | We've shared some best practices and have informal centers of knowledge |
| L3 | Our workflows have been officially redesigned to include AI as a core part of how we work |
| L4 | We track learning velocity — how quickly the team picks up new AI practices — not just story points |
| L5 | Our team structure, processes, and tools are continuously reshaped based on what AI makes possible |

#### Q7b — How does your organization invest in AI capabilities for engineering?

| Level | Answer |
|-------|--------|
| L1 | No investment — tool access is individual choice with no organizational support |
| L2 | Some tool access is provided and there are optional training opportunities |
| L3 | Dedicated budget for AI tools, training programs, and process integration |
| L4 | AI capability development is a strategic priority — it's in hiring criteria, performance reviews, and team goals |
| L5 | The organization actively shapes the future of AI-native development — contributing to industry practices and standards |

---

## Post-Results: Market Research Questions (8 Unscored)

Shown AFTER the developer sees their archetype, score, and radar chart. Adapted from EPAM's validated AI adoption survey (273 responses) and academic research. M1 and M7 enrich the share card.

### M1 — Which AI coding tools do you actively use? (Multi-select)

Options: Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Continue.dev, aider, Devin, Codex, ChatGPT, Gemini, Other

- Selected tools appear as badges on the share card
- **Fabriqa value:** Tool market share segmented by maturity level

### M2 — How often do you use AI tools in development? (Single-select)

Options: Multiple times daily / Daily / A few times per week / A few times per month / Rarely

- **Fabriqa value:** Usage intensity segmentation (EPAM data: 54% daily)

### M3 — What do you primarily use AI for? (Multi-select, pick top 3)

Options: Code generation / Code explanation / Debugging / Refactoring / Writing tests / Code review / Documentation / Architecture & design / Learning / Project planning

- **Fabriqa value:** Use case prioritization for product roadmap

### M4 — What's the biggest friction in your AI coding workflow? (Single-select)

Options: Context gets lost between sessions / AI doesn't understand my codebase well enough / Output quality is inconsistent / Too much back-and-forth / Hard to verify AI code / Tools don't work together / Security or compliance restrictions / Other

- **Fabriqa value:** Product roadmap priorities

### M5 — If you could add one capability to your AI setup, what would it be? (Free text, optional)

- **Fabriqa value:** Unfiltered product ideas segmented by maturity level

### M6 — How much do you spend on AI coding tools per month? (Single-select)

Options: $0 (free tiers only) / $1-20 / $21-50 / $51-100 / $100+ / My employer pays

- **Fabriqa value:** Pricing intelligence

### M7 — How do you primarily work? (Single-select)

Options: Solo / Small team (2-5) / Medium team (6-20) / Large org (20+)

- Displayed on share card
- **Fabriqa value:** Market segmentation

### M8 — What's your role? (Single-select)

Options: Individual contributor / Tech lead / Engineering manager / Architect / CTO/VP Engineering / Other

- **Fabriqa value:** Persona segmentation

---

## Scoring Specification

### Per-Answer Scoring
Each answer maps to a maturity level: L1=1, L2=2, L3=3, L4=4, L5=5.

### Capability Score (0-100)
Average of 2 questions per capability, scaled:
```
capability_score = ((mean_of_2_answers - 1) / 4) * 100
```
- All L1 answers → 0
- All L3 answers → 50
- All L5 answers → 100

### Overall Score (0-100)
Equal-weight average of 7 capability scores:
```
overall_score = mean(specs, context, agents, feedback, governance, delivery, organization)
```

### Archetype Assignment

| Score Range | Archetype | Tagline |
|-------------|-----------|---------|
| 0-20 | The Explorer | "The AI revolution hasn't hit your workflow yet" |
| 21-40 | The Adopter | "AI assists you, but you're still in the driver's seat" |
| 41-60 | The Integrator | "AI is embedded in your workflow — you'd feel the loss" |
| 61-80 | The Conductor | "Your agents do the work, you set the direction" |
| 81-100 | The Architect | "You're defining how the industry builds with AI" |

### Scoring Sanity Check

| Persona | Answers | Expected Score | Expected Archetype |
|---------|---------|---------------|-------------------|
| The Beginner | All L1 | 0 | Explorer |
| The Mid-Level | All L3 | 50 | Integrator |
| The Power User | All L5 | 100 | Architect |

---

## UX Flow

```
1. Landing page → "Take the Assessment" CTA
2. Screening question (AI usage check)
   → No → Pre-Explorer result page
   → Yes → Continue
3. Framing text: "Pick closest to current practice..."
4. 14 questions, one at a time (answers shuffled)
   - Progress bar (1/14 → 14/14)
   - "Processing your profile..." animation
5. Results page:
   a. Archetype name + tagline
   b. Overall score (0-100) with visual indicator
   c. Radar chart (7 spokes)
   d. Capability breakdown with growth recommendations
6. Market research questions (M1-M8):
   a. M1 — Tools (multi-select → badges on card)
   b. M7 — Team size (single-select → on card)
   c. M2-M6, M8 — Usage, friction, spending, role
7. Email capture: "Get your full report + join the community"
8. Share card generation → download / share buttons
```

---

## Academic & Industry Validation

### No competing instrument exists

Searched arxiv.org (6 papers reviewed). Existing frameworks are:
- **Organizational AI maturity models** (Butler et al.'s 5-level) — enterprise-focused, not individual developer practice
- **AI system evaluation** (CLEAR, Agentic pillars) — evaluates AI tools, not human practices
- **Productivity measurement** (METR study) — measures speed, not maturity
- This assessment is **novel** — first to combine developer practice maturity + behavioral self-assessment

### Cross-validation with EPAM/Novartis data

EPAM's AI adoption survey (273 responses) validates:
- Our 7 capabilities align with EPAM's Agentic AI Ecosystem maturity dimensions (Context Engine ~ Context Mgmt, Agent Management ~ Agent Collab, Governance & Compliance ~ Governance & Trust)
- Market research questions M1-M4 adapted from EPAM's validated instruments
- EPAM's "AI Champion" threshold (4+/5 on proficiency) parallels our L4 Conductor archetype

### Key academic findings incorporated

- Professional Developers Don't Vibe, They Control (arxiv 2512.14012) — Q5b captures this trust tension
- GenAI Adoption in Software Engineering (arxiv 2512.23327v1) — 80% active use; 20% non-users handled by screening question
- METR Study (arxiv 2507.09089) — AI slowed experienced devs by 19%; maturity != speed, validated in messaging

---

## Architecture

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Assessment app | Next.js (App Router, TypeScript, Tailwind) | Railway |
| Data storage | PostgreSQL | Railway |
| Share card generation | Satori / @vercel/og | Railway (API route) |
| Mintlify docs | Static site | Mintlify hosting |
| Card formats | Landscape (1200x630), Story (1080x1920) | Generated on demand |

---

## Manifesto Coverage

### Values Represented

| Value | Questions |
|-------|-----------|
| Building with context over coding from scratch | Q2a, Q2b (context management) |
| Agents as teammates over agents as tools | Q3a, Q3b (agent collaboration) |
| Precision with intent over compliance with process | Q1a, Q1b (spec-driven development) |
| Continuous evolution over static perfection | Q6a, Q6b (continuous delivery) |
| Shared understanding over isolated expertise | Q7a, Q7b (organizational adaptation) |
| Systems that learn over systems that lock-in | Q4a, Q4b (observability & feedback) |

### Principles Represented

| Principle | Questions |
|-----------|-----------|
| Design for Adaptation | Q7a (org adaptation) |
| Living Artifacts | Q1b, Q6b (living specs, cascading changes) |
| Observe, Reason, Evolve | Q4a, Q4b (feedback loops) |
| Human Direction, Machine Exploration | Q3a, Q3b (agent collaboration) |
| Trust Through Transparency | Q5a, Q5b (governance & trust) |
| Conversation, Not Command | Q1a L5, Q3b L5 (goal-driven, agent-orchestrated) |
| Measure Understanding | Q4a (measuring AI effectiveness) |
| Augmentation, Not Automation | Q5b (human judgment in the loop) |

---

## Design Decisions Log

| Decision | Rationale |
|----------|-----------|
| 7 Excel capabilities as dimensions | Direct from the maturity model — no abstraction needed |
| 2 questions per capability (14 total) | Clean distribution, equal weighting, sufficient reliability |
| 5 answer options (L1-L5) | Full granularity from the Excel model |
| Answers shuffled in live assessment | Prevents gaming by always picking the "most advanced" option |
| Equal capability weighting | Simple, transparent, trustworthy |
| Market research questions post-results | Developer gets value first (maturity-first approach) |
| Solo-dev compatible framing | All questions use "I/you/your" — solo devs can reach L5 |
| L0 excluded from assessment | Screening question filters non-users to Pre-Explorer |
| All L4-L5 answers are concrete behaviors | No abstract system-state descriptions |
| Internal group tags invisible to visitors | Both question types shown seamlessly |
| Market research adapted from EPAM | Validated instruments with 273 real responses |

---

## Verification Checklist

- [ ] Every L4-L5 answer describes a concrete personal behavior, not an abstract system state
- [ ] All 7 Excel capabilities covered by exactly 2 questions each
- [ ] Screening question routes non-users to Pre-Explorer page
- [ ] No jargon in any answer option
- [ ] Solo-dev test: All 14 maturity questions work for a solo freelancer
- [ ] Scoring sanity: All-L1 → Explorer (0), All-L3 → Integrator (50), All-L5 → Architect (100)
- [ ] JSON valid: `questions.json` parses, all fields populated, groups tagged correctly
- [ ] Market research questions adapted from EPAM validated instruments
