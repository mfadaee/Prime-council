# Beyond the System

> Do not merely optimise the existing game. Learn to recognise when the game itself is the problem.

Every Prime may question the system it works within — the framing, objective, rules, incentives and definition of success behind its task, including the Founder's question, the Chair's interpretation and the council's own design. The goal is not to reject systems. It is to tell **fundamental constraints** (physical, logical, mathematical, empirical) apart from **inherited assumptions** (conventions people made), and to see what becomes possible when an unnecessary assumption is removed.

Like the apple tree and the machine that makes apples: the outcome people want is not the same thing as the process that happens to produce it today.

This document describes how the capability is built and records the decisions behind it.

## What it consists of

| Piece | Where | What it does |
|---|---|---|
| **The lens** (every seat, every session) | `BEYOND_THE_SYSTEM` in `src/lib/council/prompts.ts` | Added to every member's system prompt, whatever its role. Grants permission to question the framing and asks for the five layers, proportionality, and disagreement on the merits. |
| **Frame checks** | `Contribution.frameCheck` | A member records whether questioning the framing was worth it, which assumptions it examined (constraint / convention / uncertain, with a basis), any proxy risk and any reframe. Optional: omitted when it would not change the answer. |
| **Productive disagreement** | `Critique.assumption`, `Critique.resolveBy` | A challenge names the assumption it targets and what evidence or experiment would settle it. |
| **Minority views** | `FinalAnswer.minorityViews` | Views that did not prevail but should survive. |
| **Exploration mode** | `mode: "beyond"` in `CouncilRun` | Stages A–G (below), reusing the bounded pipeline. |
| **Code checks** | `src/lib/council/beyond.ts` | Deterministic validation of what members publish. |
| **Discovery record** | `discoveries` table, `src/lib/discovery/*` | Keeps every investigation so it can be revisited. |
| **Interface** | `BeyondPanel`, `/discoveries` | Makes the reasoning observable, from recorded events only. |
| **Self-examination** | `selfExamination`, Settings cadence | The council applies the mode to itself; proposals only. |
| **Evaluation** | `tests/eval/beyond.eval.ts`, `evals/beyond/cases.json` | Outcome comparison against the standard pipeline with real models. |

### The five layers

1. **Reality** — what is physically, logically, mathematically or empirically constrained?
2. **Assumptions** — what are we treating as true without sufficient evidence?
3. **Constructed reality** — which rules, categories, objectives, incentives, institutions or measures of success exist because people created them?
4. **System boundaries** — what does the current framing exclude?
5. **Alternative possibilities** — what could we create if we changed the framing itself?

Human-made does not mean arbitrary: conventions can encode real constraints, knowledge and coordination. The prompts say so, and the code checks for maps that dismiss everything as changeable.

## The exploration mode, stage by stage

Choose **⟁ Beyond the System** when asking the Primes, or press **Explore beyond the system** on a finished session. The same bounded pipeline runs — same budget guard, concurrency, retries, timeouts, round caps and cancellation — with different prompts and two extra steps:

| Stage | Phase | Who | Output |
|---|---|---|---|
| A. Understand the current reality · B. Identify invisible boundaries | `map` | Chair | `SystemMap`: the current system, what it produces, why it exists, 3–8 classified assumptions, excluded possibilities, distortions. Assumption ids (A1, A2, …) are assigned in code. |
| C. Remove assumptions selectively · D. Generate genuinely different alternatives | `independent` | Contributors, blind to each other | Up to three alternatives each, marked `implementation`, `redesign` or `reframe`, with the assumption ids they drop and the constraints they keep. Ids (`<member>#<n>`) are assigned in code; references to unknown assumptions are dropped. |
| E. Challenge the alternatives | `critique` → `resolve` | Every contributor | Support / challenge / refine per alternative, with `escapesFraming`. Originators keep, revise or **withdraw** their own alternatives — never anyone else's. |
| F. Run an experiment | `experiment` | Builder (else another contributor) | The smallest reversible experiment: hypothesis, expected observations, cost, risks, success criteria, stop conditions — or an explanation of why none is justified. **Nothing is run.** |
| G. Learn and update | `synthesize` + discovery | Synthesizer, then the Founder | What was learned, what to investigate next, whether the framing held, whether the conventional approach is already best, minority views. The Founder later records experiment results and what became of each assumption. |

## Checks run in code

`buildBeyondView()` turns published messages into the view the UI shows and the discovery stores, and runs these checks. Each reports **pass**, **attention** or **not applicable** with a concrete detail. There is no score.

| Check | Passes when |
|---|---|
| Material assumption | At least one mapped assumption materially affects the decision. |
| Constraints vs conventions | The map has at least one fundamental constraint and at least one convention or unverified assumption. |
| Distinct alternatives | Three or more **viable** alternatives remain after merging near-duplicates (word and dropped-assumption similarity) and excluding withdrawn or constraint-violating ones — or the council concluded the conventional approach is best. |
| Reframe present | At least one alternative changes the problem itself (not applicable when the conventional approach is best). |
| No constraint removed | No alternative drops an assumption the map classified as a fundamental constraint. |
| Cross-examined | Every alternative received support, challenge or refinement from someone other than its originator. |
| Falsifiable experiment | A justified experiment has a hypothesis, success criteria, stop conditions and is reversible — or a reason is given why none is needed. |
| Minority retained | When an idea was contested, the final answer records a minority view or disagreement. |

## The discovery record

One row in `discoveries` per exploration session, written when the session ends — **including** stopped or failed sessions (status `incomplete`), so an interrupted investigation is not lost. It holds the original question and framing, the existing system, every assumption with its classification, who challenged it and what became of it (`open`, `held`, `revised`, `refuted`), the constraints that remain, **every alternative** (with originator, supporters, challengers, refiners, flags, evolution and status, including withdrawn ones), the code checks, evidence, confidence, uncertainty, minority views, the experiment (status `proposed → running → completed / rejected`, or `not_justified`, plus the Founder's recorded result), lessons and follow-ups.

- **Searchable** at `/discoveries` and `GET /api/discoveries?q=`.
- **Linked**: the detail page lists other investigations that rest on similar assumptions (recurring assumptions across domains).
- **Revisitable**: *Revisit with the council* starts a new exploration that receives a bounded summary of the record as context and links back to it (`parentId`).
- **Continuations** (another round, challenge a claim) update the same record and keep the Founder's edits.

## Recursive self-examination

The council can examine itself (*Examine the council itself* on `/discoveries`, or on a cadence set in **Settings → Council self-examination every N days**, off by default). The session receives a factual description of how the council runs, generated from its live configuration (`describeCouncil()`), and may return `proposedChanges` to its prompts, roles, orchestration, evaluation, memory, interface, limits or security.

Proposing is separated from authorising and applying:

- Proposals become **follow-ups** on the discovery with `status: "proposed"` and a `changePolicy()` that always says `autoApply: false`.
- Approving one records the Founder's decision. Implementing it still requires a branch, tests, passing CI and a pull request; limits, security and orchestration are flagged as **sensitive** (human review, never auto-merged — matching `src/lib/improvements/eligibility.ts`).
- No code path reads a proposal and changes settings, prompts or code. Proposed changes outside a self-examination are discarded.
- A completed cycle may conclude that no change is justified.

The cadence runs through the normal background path: Founder opt-in, interval, daily session cap, separate background budget, global pause. At most one self-examination is queued per window. Investigation follow-ups the Founder approves become suggested Beyond-the-System topics that build on the original record.

## Evaluation

Unit tests use scripted members to check the plumbing: assumption identification, constraint-vs-convention handling, alternative generation, disagreement validation, persistence, and safe execution. They cannot tell whether a real model reasons well.

For that, `BEYOND_EVAL=1 npm run eval:beyond` runs the representative cases in `evals/beyond/cases.json` against the configured real models, once in standard mode (the baseline) and once in Beyond-the-System mode, and writes a report to `evals/beyond/results/`:

| Case | Tests whether the council… |
|---|---|
| `physical-vs-convention` | keeps the speed of light as a constraint while questioning what "instant" must mean |
| `misleading-objective` | notices that tickets closed is a proxy for problems resolved |
| `alternative-framing` | proposes structurally different options, including one that questions whether parking is the problem |
| `challenge-unnecessary` | answers a plain calculation plainly |

The eval spends real budget (bounded by the normal limits), never runs in CI, and skips — rather than scoring demo output — when no real model is seated.

## Decisions

**D1. One lens for every seat, rather than a new "contrarian" role.** The spec requires the capability for every agent. A dedicated role would make challenging someone else's job and invite manufactured disagreement. The lens is added to the shared system prompt; roles keep their focus.

**D2. Proportionate by default.** In standard sessions `frameCheck` is optional and the prompt says to include it only when it changes the answer. No extra phases or calls are added to standard sessions; the only cost is a slightly longer system prompt.

**D3. The exploration reuses the bounded pipeline.** Map and experiment are two more phases inside `CouncilRun`, so every existing limit, cancellation path, retry rule and event applies unchanged. No limit is raised for the mode; it uses the Founder's configured `maxOutputTokens`, and the prompts ask for compact output.

**D4. Ids and references are assigned in code.** Assumption ids, alternative ids and originators are never taken from model output. Critique references to another member's alternative are dropped; members can only withdraw their own ideas. This keeps attribution honest and prevents one member from erasing another's idea.

**D5. Checks, not scores.** The spec warns against rewarding novelty, disagreement or the number of challenges. The code reports concrete findings and outcome metrics for evaluation; nothing ranks members or rewards challenge counts. Near-duplicates are merged and constraint-violating ideas are not counted.

**D6. A separate discovery table, not memory items.** Memory holds short Founder-approved facts that enter every session. Discoveries are structured, council-generated investigations; they enter a session only when the Founder revisits one (wrapped as untrusted). This keeps the existing memory contract — only approved items are given to members — intact.

**D7. Experiments are proposals.** The council has no tools to act in the world, and the spec requires approval for consequential actions. Experiments are designed, never run; the Founder records what happened.

**D8. Self-change is a record, never an action.** See [Recursive self-examination](#recursive-self-examination).

**D9. Additive schema.** One new table and one nullable column (`suggestions.mode`). Session mode lives in the existing `council_sessions.config` JSON. Old events without `mode` reduce to `"standard"`; old contributions parse to exactly their previous shape.

**D10. Rendered only from recorded events.** The panel is derived from published messages by the same pure function the discovery uses, so the live view, replay and record agree, and nothing on screen is invented by the UI. Demo output is labelled simulated end to end, and the demo provider makes no claims.

## Known limitations

- Classification of assumptions and the judgement of whether an alternative "escapes the framing" come from models; the code validates structure and consistency, not truth.
- Near-duplicate detection is lexical (word overlap plus shared dropped assumptions). Two ideas worded differently but structurally identical can be counted twice.
- Linking across discoveries is lexical too, and considers the 200 most recent records.
- Beyond sessions make two more calls than standard ones and produce longer outputs; with a low `maxOutputTokens` some members may fall back to plain text (shown with a parse warning).
- The self-examination description covers configuration, not code; the council cannot read its own source.
