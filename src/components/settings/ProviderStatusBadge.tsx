const MAP: Record<string, { label: string; cls: string; glyph: string; hint: string }> = {
  available: { label: "Available", cls: "border-support/60 text-support", glyph: "✓", hint: "A live check succeeded" },
  configured: { label: "Configured · not checked", cls: "border-refine/60 text-refine", glyph: "○", hint: "Credentials or URL present; run a check to confirm" },
  unavailable: { label: "Unavailable", cls: "border-danger/60 text-danger", glyph: "×", hint: "The last live check failed" },
  not_configured: { label: "Not configured", cls: "border-line-strong text-faint", glyph: "–", hint: "Missing API key or base URL" },
  disabled: { label: "Disabled", cls: "border-line-strong text-faint", glyph: "⏸", hint: "Turned off by the Prime" },
  demo: { label: "Demo · simulated", cls: "sim-badge", glyph: "◇", hint: "No model is called" },
};

export function ProviderStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? MAP.not_configured;
  return (
    <span className={`chip ${m.cls}`} title={m.hint}>
      <span aria-hidden="true">{m.glyph}</span> {m.label}
    </span>
  );
}
