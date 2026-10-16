# Security policy

Prime Council is local-first software that holds model provider API keys and can spend money on model calls, so security reports are welcome and taken seriously.

## Supported versions

The project is pre-1.0 (`0.1.0`) and has no tagged releases yet. Only the latest commit on `main` is supported; fixes land there.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include:

- what is affected (file, route or setting) and the commit you tested;
- steps to reproduce, and what an attacker gains;
- whether it needs non-default configuration (for example `SIMLIFE_ACCESS_TOKEN` set, or the app bound to a non-loopback address).

Never include real API keys or other secrets in a report. If one was exposed, rotate it at the provider first.

## Scope

In scope, because the project makes these promises (see the [Security model](README.md#security-model)):

- reaching the app from a non-loopback host without `SIMLIFE_ACCESS_TOKEN`, or bypassing the token or `/login` cookie;
- writes that succeed without the `x-simlife-request: 1` header, or bypass rate limits;
- API key values reaching the browser, the database, transcripts, logs or provider error messages;
- model output, imported memory or retrieved text escaping its untrusted-data wrapping to change limits, permissions or spending;
- exceeding per-session or daily spending limits, rounds, timeouts or concurrency set in Settings.

Out of scope: problems that need an attacker who already controls the server environment or `.env.local`, and the behaviour of third-party model providers themselves.
