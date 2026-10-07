/**
 * Remove secrets from strings before they reach logs, events or transcripts.
 * Redacts the exact configured key values plus common key shapes.
 */
const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9._-]{12,}/gi,
  /([?&]key=)[^&\s]+/gi,
];

export function redactSecrets(input: string, secrets: (string | null | undefined)[] = []): string {
  let out = input;
  for (const s of secrets) {
    if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  }
  for (const p of KEY_PATTERNS) {
    out = out.replace(p, (m, prefix) => (typeof prefix === "string" && m.startsWith(prefix) ? `${prefix}[redacted]` : "[redacted]"));
  }
  return out;
}
