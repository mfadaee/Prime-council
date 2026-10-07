/**
 * Original monogram avatar: the member's letter over a personal mini
 * constellation derived from its id. No provider logos are used, so nothing
 * implies endorsement by a model provider.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function Avatar({
  id,
  monogram,
  color,
  size = 56,
  dim = false,
}: {
  id: string;
  monogram: string;
  color: string;
  /** Pixel size, or "fill" to fill the parent box. */
  size?: number | "fill";
  dim?: boolean;
}) {
  const h = hash(id);
  const dots = Array.from({ length: 5 }, (_, i) => {
    const a = ((h >> (i * 5)) % 360) * (Math.PI / 180);
    const r = 14 + ((h >> (i * 3)) % 9);
    return { x: 32 + Math.cos(a) * r, y: 32 + Math.sin(a) * r };
  });
  const gid = `av-${id.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={size === "fill" ? "100%" : size} height={size === "fill" ? "100%" : size} viewBox="0 0 64 64" aria-hidden="true" style={{ filter: dim ? "grayscale(1)" : undefined }}>
      <defs>
        <radialGradient id={gid} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="70%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0d1230" stopOpacity="1" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#${gid})`} />
      <circle cx="32" cy="32" r="30.5" fill="none" stroke={color} strokeOpacity="0.8" strokeWidth="1" />
      {dots.map((d, i) => (
        <line key={`l${i}`} x1={d.x} y1={d.y} x2={dots[(i + 1) % dots.length].x} y2={dots[(i + 1) % dots.length].y} stroke="#fff" strokeOpacity="0.18" strokeWidth="0.7" />
      ))}
      {dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.x} cy={d.y} r="1.3" fill="#fff" fillOpacity="0.55" />
      ))}
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="700" fill="#ffffff" fontFamily="var(--font-grotesk), sans-serif" stroke="#0a0d24" strokeOpacity="0.6" strokeWidth="2.5" paintOrder="stroke">
        {monogram}
      </text>
    </svg>
  );
}
