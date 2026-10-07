# Roadmap

Status labels:
- **Done:** implemented and covered by tests.
- **Partial:** usable, with known gaps listed.
- **Planned:** not started.

## Milestone 1 — Council MVP · Done

- Polished council chamber: Prime seat, semicircle of seats, state labels with glyphs, live links, speech panel.
- Question entry with live SSE streaming.
- Bounded pipeline: interpret → independent → critique → resolve → synthesize.
- Five real adapters (Anthropic, OpenAI, Gemini, OpenAI-compatible, Ollama) plus a labelled demo provider.
- Prime controls: stop, another round, challenge, direct address, exclude/include, override, compare initial vs final.
- Usage, cost estimates, budgets, session history and replay timeline.
- Security baseline: loopback-only access, optional token, CSRF header, rate limits, redaction, audit.

## Milestone 2 — Persistent intelligence · Done

- Member configuration UI (providers, models, personas, roles).
- Inspectable memory: create, edit, delete, disable, explicit import, and save-from-session.
- Suggested discussions queue, with reasons and the basis for each suggestion.
- Opt-in scheduled background sessions with separate limits and a global pause.

## Milestone 3 — Living society · Done

- Deterministic world engine with inhabitants, skills, goals, relationships, homes and workplaces.
- Fictional economy: resources, credits, trade, contracts.
- Projects proposed by inhabitants and funded from a treasury.
- Council decisions that change the world through explicit events.
- Pause, resume, step, speed, snapshots, restore and event replay.
- Graphical world map.

## Milestone 4 — Continuous improvement · Built; daily scheduling being verified

A daily Claude Code Routine is scheduled to run the improvement job: one PR per day, merged only when eligible and green. One run has completed (PR #2); unattended scheduled runs are not yet verified. The GitHub Actions variant is available but off. See [DAILY_IMPROVEMENT.md](DAILY_IMPROVEMENT.md).

- CI: lint, typecheck, unit tests, build and e2e.
- Daily improvement job: a script, a Routine runbook, and a scheduled Routine (see DAILY_IMPROVEMENT.md for its verified status).
- PR conventions, eligibility for auto-merge, branch protection guidance.
- Visible improvement history in `/improvements`.

## Prime Council direction · Done (first slice)

- Founder / Primes / agents model: you deal only with the Primes.
- Charter: an editable standing mission in every Prime's context.
- One Prime per configured model family, with a diversity indicator.
- Chronicle of major decisions and outcomes; autonomous deliberations collapsed by default.
- Prime governance: opt-in, bounded; the Primes decide world matters themselves.
- Agents record which Prime created them; relationship state stays bounded for larger populations (up to 500 now).

## Later

- Agents at scale (thousands → millions): cohort-level simulation, sharded storage, sampled event logs.
- Primes propose new world rules and agent capabilities. Each proposal is reviewed and applied only if the Founder approves.
- Calibrate the world against sourced real-world data.

- Research tools for the Researcher, with sources fetched and treated as untrusted.
- Multi-process deployment: shared event bus (Postgres `LISTEN/NOTIFY`) and a job queue.
- Streaming token-level output for providers that support it.
- Model-driven inhabitant dialogue, budgeted separately.
- World growth: new organisations and capabilities unlocked by rules.
