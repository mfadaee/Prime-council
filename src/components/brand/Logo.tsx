/**
 * Simulated Life mark: six distinct points of light on a ring, joined into a
 * constellation around a central star — separate intelligences forming one
 * living community. Original artwork; no third-party marks.
 */
const POINTS = ["#F5B942", "#4CC3FF", "#FF7A6B", "#3DDC97", "#B79CFF", "#FF8FCB"];

export function LogoMark({ size = 36, title = "Simulated Life" }: { size?: number; title?: string }) {
  const pts = POINTS.map((c, i) => {
    const a = (Math.PI * 2 * i) / POINTS.length - Math.PI / 2;
    return { c, x: 24 + Math.cos(a) * 16, y: 24 + Math.sin(a) * 16 };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
      <defs>
        <radialGradient id="sl-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff7d6" />
          <stop offset="60%" stopColor="#ffd36e" />
          <stop offset="100%" stopColor="#ffd36e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="16" fill="none" stroke="rgba(167,174,216,0.35)" strokeWidth="1" />
      {pts.map((p, i) => {
        const q = pts[(i + 2) % pts.length];
        return <line key={`l${i}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="rgba(200,208,255,0.35)" strokeWidth="0.8" />;
      })}
      {pts.map((p, i) => (
        <line key={`s${i}`} x1={p.x} y1={p.y} x2={24} y2={24} stroke={p.c} strokeOpacity="0.45" strokeWidth="0.8" />
      ))}
      <circle cx="24" cy="24" r="6.5" fill="url(#sl-core)" />
      {pts.map((p, i) => (
        <circle key={`p${i}`} cx={p.x} cy={p.y} r="3.1" fill={p.c} />
      ))}
    </svg>
  );
}
