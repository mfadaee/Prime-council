# Provider integrations

Prime Council keeps three things separate:

| Concept | What it is | Where it lives |
|---|---|---|
| **Provider** | A service that serves models (Anthropic, OpenAI, a local Ollama…) | `providers` table + an adapter in `src/lib/providers/adapters/` |
| **Model** | The underlying model id (`claude-opus-5-5`, `llama3.2`, …) | Chosen per member |
| **Member** | A persistent persona with a role, memory and chosen model | `members` table |

Several members may use the same provider and model. The chamber and the Members page label this ("shared model"), because agreement between instances of one model is weak evidence.

## Status labels

The UI never claims more than it checked:

| Status | Meaning |
|---|---|
| **Available** | A live check (listing models) succeeded |
| **Configured · not checked** | Key or URL present; no live check yet |
| **Unavailable** | The last live check failed (the reason is shown) |
| **Not configured** | Missing key or base URL |
| **Disabled** | Turned off by the Prime |
| **Demo · simulated** | Built-in demo provider; no model is called |

Members whose provider is not configured are shown **Offline** and skipped. They never fall back silently to the demo provider.

## Built-in adapters

All adapters share bounded retries for transient errors, a per-call timeout and cancellation. Error messages are redacted so a key can never reach events or logs.

| Kind | API used | Auth | Verified against |
|---|---|---|---|
| `anthropic` | Messages API via the official `@anthropic-ai/sdk` (`beta.messages.create`). Server-side refusal fallback (`fallbacks: "default"`) is enabled for models that support it. | `ANTHROPIC_API_KEY` | Anthropic API reference (Sept 2026) |
| `openai` | Responses API `POST /v1/responses` (`instructions`, `input`, `max_output_tokens`). Text is read from `output[].content[type=output_text]`, usage from `usage.input_tokens/output_tokens`. | `Authorization: Bearer $OPENAI_API_KEY` | OpenAI OpenAPI spec |
| `google` | Gemini `POST v1beta/models/{model}:generateContent` (`systemInstruction`, `contents`, `generationConfig.maxOutputTokens`). Thought parts are skipped; `thoughtsTokenCount` is billed as output. | `x-goog-api-key: $GEMINI_API_KEY` | Google API discovery document for `generativelanguage` v1beta |
| `openai_compatible` | `POST {baseUrl}/chat/completions` with `max_tokens` | Optional bearer key | OpenAI chat schema; Ollama/LM Studio compatibility docs |
| `ollama` | Native `POST /api/chat` with `stream:false`, `options.num_predict`; models from `GET /api/tags` | none | Ollama API docs |
| `demo` | No call. Returns labelled simulated output | — | — |

Model ids are **discovered at runtime**. Use "Check now" on the Members page to list them. Apart from the Anthropic default, the app hard-codes no model ids it could not verify.

## Pricing and spend

Costs are **estimates** computed from token usage and the price table:

- Built-in prices cover only Anthropic list prices verified when this release was written.
- Everything else is **unpriced** until you add a price in Settings → Pricing, using a `kind:model` or `providerId:model` key.
- Local providers (Ollama, providers marked "runs locally") and the demo cost $0.

By default, calls to **unpriced remote models are refused**, because spending limits cannot apply to an unknown price. You can allow them explicitly in Settings.

Before each call, the orchestrator reserves the call's worst-case cost (estimated input plus the full `max_output_tokens`) against the session and daily budgets. This is why parallel calls cannot jointly overspend. A request that is already in flight cannot be recalled, so the budgets are not a hard billing cap.

## Adding a provider instance (no code)

To add a second OpenAI-compatible endpoint (e.g. LM Studio or OpenRouter), go to **Members → Add provider** and enter:

- an id;
- the kind;
- the base URL;
- the *name* of the environment variable holding its key (e.g. `OPENROUTER_API_KEY`).

Put the key itself in `.env.local` and restart. Key variable names must end in `_API_KEY`, `_KEY` or `_TOKEN`. Only point a provider at a server you trust, because the key is sent there.

## Adding a new provider kind (code)

1. Add the kind to `PROVIDER_KINDS` in `src/lib/council/types.ts`.
2. Implement `ProviderAdapter` in `src/lib/providers/adapters/<kind>.ts`:
   - `generate()` must honour `req.signal` and `req.timeoutMs`;
   - throw `ProviderError` with the right code (`auth`, `rate_limited`, `timeout`, `unavailable`, `refused`, …);
   - return token usage when the API reports it.
3. Register it in `ADAPTERS` (`src/lib/providers/registry.ts`) and add a seed row in `src/lib/council/seed.ts` if it should appear by default.
4. Add adapter tests against the local HTTP stub in `tests/unit/adapters.test.ts`.

The orchestrator does not change: it only sees `ProviderAdapter`.
