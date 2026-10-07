"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import type { ChamberLink } from "@/lib/council/reducer";
import type { CouncilRole, MemberState, Phase } from "@/lib/council/types";
import { Avatar } from "./Avatar";
import { PROVIDER_LABEL, ROLE_META, STANCE_META, STATE_META } from "./meta";

export interface SeatMember {
  id: string;
  name: string;
  role: CouncilRole;
  color: string;
  monogram: string;
  providerKind: string;
  providerLabel: string;
  model: string;
  simulated: boolean;
  sharesModelWith: string[];
  enabled: boolean;
}

export interface Speech {
  memberId: string;
  kindLabel: string;
  excerpt: string;
  simulated: boolean;
}

interface Props {
  members: SeatMember[];
  states: Record<string, { state: MemberState; detail?: string }>;
  links: ChamberLink[];
  speakingId: string | null;
  speech: Speech | null;
  phaseLabel: string;
  round: number;
  phase: Phase | null;
  running: boolean;
  simulated: boolean;
  excluded?: Set<string>;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}

const PRIME = { x: 50, y: 10 };
const DAIS = { x: 50, y: 44 };

function seatPositions(n: number): { x: number; y: number }[] {
  if (n === 1) return [{ x: 50, y: 82 }];
  return Array.from({ length: n }, (_, i) => {
    const t = Math.PI - (i * Math.PI) / (n - 1); // left → bottom → right
    return { x: 50 + 41 * Math.cos(t), y: 38 + 46 * Math.sin(t) };
  });
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const cx = (a.x + b.x) / 2 + (DAIS.x - (a.x + b.x) / 2) * 0.55;
  const cy = (a.y + b.y) / 2 + (DAIS.y - (a.y + b.y) / 2) * 0.55;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

export function Chamber(props: Props) {
  const reduce = useReducedMotion();
  const pos = useMemo(() => {
    const p = seatPositions(props.members.length);
    return Object.fromEntries(props.members.map((m, i) => [m.id, p[i]])) as Record<string, { x: number; y: number }>;
  }, [props.members]);
  const posOf = (id: string) => (id === "prime" ? PRIME : pos[id]);

  // De-duplicate links per pair (latest stance wins) so repeated events don't stack.
  const links = useMemo(() => {
    const m = new Map<string, ChamberLink>();
    for (const l of props.links) if (posOf(l.from) && posOf(l.to) && l.from !== l.to) m.set(`${l.from}>${l.to}`, l);
    return [...m.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.links, pos]);

  return (
    <div className="panel relative overflow-hidden p-2 sm:p-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(139,123,255,0.18),transparent_60%)]" aria-hidden="true" />
      {props.simulated && (
        <div className="relative z-20 mb-1 flex justify-end sm:absolute sm:right-3 sm:top-3 sm:mb-0">
          <span className="chip sim-badge" title="Every member in this session uses the demo provider. No model was called.">
            SIMULATED · demo provider
          </span>
        </div>
      )}
      <div className="relative mx-auto aspect-[10/11] w-full max-w-[920px] sm:aspect-[10/7.4]">
        {/* Connections + chamber ring */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id="dais" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffd36e" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#8b7bff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M 9 38 A 41 46 0 0 0 91 38" fill="none" stroke="rgba(148,163,255,0.22)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 6" />
          <path d="M 4 38 A 46 52 0 0 0 96 38" fill="none" stroke="rgba(148,163,255,0.1)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {/* Founder's line of sight to the dais */}
          <line x1={PRIME.x} y1={PRIME.y + 6} x2={DAIS.x} y2={DAIS.y - 8} stroke="rgba(255,211,110,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 5" />
          <AnimatePresence>
            {links.map((l) => {
              const a = posOf(l.from)!;
              const b = posOf(l.to)!;
              const meta = STANCE_META[l.stance];
              return (
                <motion.g key={`${l.from}>${l.to}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.4 }}>
                  <path d={curve(a, b)} fill="none" stroke={meta.color} strokeOpacity="0.25" strokeWidth="6" vectorEffect="non-scaling-stroke" />
                  <path
                    d={curve(a, b)}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth="2.2"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray="6 6"
                    className={reduce ? undefined : "dash-flow"}
                  />
                </motion.g>
              );
            })}
          </AnimatePresence>
        </svg>

        {/* Dais: phase indicator */}
        <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" style={{ left: `${DAIS.x}%`, top: `${DAIS.y - 12}%` }}>
          <div className="relative grid h-12 w-12 place-items-center sm:h-16 sm:w-16">
            <div className="absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,211,110,0.55), rgba(139,123,255,0) 70%)" }} />
            {props.running && !reduce && <div className="absolute inset-1 rounded-full border border-dashed border-prime/60 spin-slow" />}
            <span className="relative text-lg text-prime sm:text-2xl" aria-hidden="true">
              ✦
            </span>
          </div>
          <p className="mt-1 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-muted sm:text-xs" aria-live="polite">
            {props.phaseLabel}
            {props.round > 0 ? ` · R${props.round}` : ""}
          </p>
        </div>

        {/* Speech panel (desktop: inside the chamber) */}
        <div className="absolute left-1/2 top-[47%] hidden w-[46%] max-w-[440px] -translate-x-1/2 sm:block">
          <SpeechPanel speech={props.speech} members={props.members} reduce={Boolean(reduce)} />
        </div>

        {/* Founder seat */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${PRIME.x}%`, top: `${PRIME.y}%` }}>
          <div className="flex flex-col items-center">
            <div className="relative grid h-12 w-12 place-items-center rounded-full border-2 border-prime bg-[radial-gradient(circle_at_35%_30%,#fff2c4,#ffd36e_45%,#5a3d00)] shadow-[0_0_28px_rgba(255,211,110,0.55)] sm:h-16 sm:w-16">
              <span className="font-display text-base font-bold text-[#2a1c00] sm:text-xl" aria-hidden="true">
                ♛
              </span>
            </div>
            <span className="mt-1 rounded-full bg-prime/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-prime sm:text-xs">The Founder</span>
          </div>
        </div>

        {/* Member seats */}
        {props.members.map((m) => {
          const p = pos[m.id];
          const st = props.states[m.id]?.state ?? (m.enabled ? "idle" : "offline");
          const excluded = props.excluded?.has(m.id);
          const speaking = props.speakingId === m.id && props.running;
          const lastSpeaker = props.speakingId === m.id && !props.running;
          const label = speaking && (st === "idle" || st === "speaking") ? "speaking" : st;
          const meta = STATE_META[excluded ? "offline" : label];
          const offline = excluded || st === "offline";
          return (
            <div key={m.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
              <button
                type="button"
                onClick={() => props.onSelect?.(m.id)}
                aria-pressed={props.selectedId === m.id}
                aria-label={`${m.name}, ${ROLE_META[m.role].title}. ${meta.label}${props.states[m.id]?.detail ? ` — ${props.states[m.id]?.detail}` : ""}. ${PROVIDER_LABEL[m.providerKind] ?? m.providerKind} model ${m.model}${m.simulated ? ", simulated" : ""}. Open details.`}
                className="group flex w-[68px] flex-col items-center rounded-2xl p-1 text-center outline-offset-2 sm:w-[118px]"
              >
                <motion.div
                  className="relative rounded-full"
                  animate={{ scale: speaking && !reduce ? 1.14 : 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  style={{
                    boxShadow: speaking
                      ? `0 0 0 3px ${m.color}, 0 0 38px 8px ${m.color}aa`
                      : props.selectedId === m.id
                        ? `0 0 0 2px #ffd36e`
                        : lastSpeaker
                          ? `0 0 0 2px ${m.color}88`
                          : "none",
                  }}
                >
                  <div className="h-10 w-10 sm:h-16 sm:w-16">
                    <Avatar id={m.id} monogram={m.monogram} color={m.color} size="fill" dim={offline} />
                  </div>
                  {/* state ring */}
                  {(label === "preparing" || label === "reviewing") && (
                    <span
                      className={`pointer-events-none absolute -inset-1.5 rounded-full border-2 border-dashed ${reduce ? "" : "spin-slow"}`}
                      style={{ borderColor: meta.color }}
                      aria-hidden="true"
                    />
                  )}
                  {(label === "agreeing" || label === "challenging" || label === "blocked") && (
                    <span className="pointer-events-none absolute -inset-1 rounded-full border-2" style={{ borderColor: meta.color }} aria-hidden="true" />
                  )}
                  <span
                    className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-bg text-[11px] font-bold text-bg sm:h-6 sm:w-6"
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  >
                    {meta.glyph}
                  </span>
                </motion.div>
                <span className="mt-1.5 max-w-full truncate font-display text-xs font-bold sm:text-sm" style={{ color: offline ? "#8a92c4" : "#eef0ff" }}>
                  {m.name}
                </span>
                <span className="max-w-full truncate text-[10px] text-muted sm:text-[11px]">
                  <span aria-hidden="true">{ROLE_META[m.role].glyph} </span>
                  {ROLE_META[m.role].title}
                </span>
                <span className="mt-0.5 rounded-full px-1.5 text-[10px] font-semibold sm:text-[11px]" style={{ color: meta.color, background: `${meta.color}1f` }}>
                  {excluded ? "Excluded" : meta.label}
                </span>
                <span className="mt-0.5 hidden max-w-full truncate text-[10px] text-faint sm:block" title={`${m.providerLabel} · ${m.model}`}>
                  {m.simulated ? "demo · simulated" : `${PROVIDER_LABEL[m.providerKind] ?? m.providerKind} · ${m.model}`}
                </span>
                {m.sharesModelWith.length > 0 && !m.simulated && (
                  <span className="hidden text-[10px] text-warn sm:block" title={`Same provider and model as ${m.sharesModelWith.join(", ")}`}>
                    shared model ×{m.sharesModelWith.length + 1}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Speech panel (mobile: below the chamber) */}
      <div className="mt-2 sm:hidden">
        <SpeechPanel speech={props.speech} members={props.members} reduce={Boolean(reduce)} />
      </div>

      <Legend />
    </div>
  );
}

function SpeechPanel({ speech, members, reduce }: { speech: Speech | null; members: SeatMember[]; reduce: boolean }) {
  const m = speech ? members.find((x) => x.id === speech.memberId) : null;
  return (
    <div aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {speech && m ? (
          <motion.div
            key={`${speech.memberId}-${speech.excerpt.slice(0, 20)}`}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="rounded-2xl border bg-panel-solid/90 p-3 shadow-2xl"
            style={{ borderColor: `${m.color}88`, boxShadow: `0 10px 40px -10px ${m.color}66` }}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
              <span className="font-display font-bold" style={{ color: m.color }}>
                {m.name}
              </span>
              <span className="text-muted">{speech.kindLabel}</span>
              {speech.simulated && <span className="chip sim-badge ml-auto !text-[10px]">Simulated</span>}
            </div>
            <p className="mt-1.5 line-clamp-4 text-sm leading-snug text-ink/95">{speech.excerpt}</p>
          </motion.div>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-dashed border-line p-3 text-center text-xs text-faint">
            The floor is open. Contributions appear here as the Primes publish them.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Legend() {
  return (
    <details className="mt-2 px-1 text-xs text-muted">
      <summary className="cursor-pointer select-none">Legend</summary>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {Object.entries(STATE_META).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-bg" style={{ background: v.color }} aria-hidden="true">
              {v.glyph}
            </span>
            <b className="font-semibold text-ink">{v.label}</b> {v.description}
          </span>
        ))}
        {Object.entries(STANCE_META).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-5" style={{ background: v.color }} aria-hidden="true" /> {v.label}
          </span>
        ))}
      </div>
    </details>
  );
}
