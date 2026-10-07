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

## Milestone 2 — Persistent intelligence

- Member configuration UI (providers, models, personas, roles).
- Inspectable memory: create, edit, delete, disable, explicit import, and save-from-session.
- Suggested discussions queue, with reasons and the basis for each suggestion.
- Opt-in scheduled background sessions with separate limits and a global pause.

## Milestone 3 — Living society

- Deterministic world engine with inhabitants, skills, goals, relationships, homes and workplaces.
- Fictional economy: resources, credits, trade, contracts.
- Projects proposed by inhabitants and funded from a treasury.
- Council decisions that change the world through explicit events.
- Pause, resume, step, speed, snapshots, restore and event replay.
- Graphical world map.

## Milestone 4 — Continuous improvement

- CI: lint, typecheck, unit tests, build and e2e.
- Daily improvement job: a script plus scheduling instructions. Scheduling stays inactive until it is connected to a scheduler.
- PR conventions, eligibility for auto-merge, branch protection guidance.
- Visible improvement history in `/improvements`.

## Later

- Research tools for the Researcher, with sources fetched and treated as untrusted.
- Multi-process deployment: shared event bus (Postgres `LISTEN/NOTIFY`) and a job queue.
- Streaming token-level output for providers that support it.
- Model-driven inhabitant dialogue, budgeted separately.
- World growth: new organisations and capabilities unlocked by rules.
