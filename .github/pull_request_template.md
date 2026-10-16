<!-- See CONTRIBUTING.md. One focused improvement per pull request. -->

## What

<!-- The change, in a sentence or two. -->

## Why

<!-- The problem it solves or the value it adds. -->

## Validation

<!-- Commands you ran and their results. -->
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`
- [ ] `npm run test:e2e` (when UI or API behaviour changes)

## Remaining issues

<!-- Known gaps, follow-ups, or "none". -->

## Checklist

- [ ] Limits, permissions and spending are still enforced in code, not prompts
- [ ] Demo / simulated output stays labelled
- [ ] No API key values in code, logs, the database or test fixtures
- [ ] Schema changes are additive (`npm run db:generate` run if `schema.ts` changed)
- [ ] Labelled `low-risk` or `needs-review`
