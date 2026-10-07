"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ActionKind, Inhabitant, Location, WorldState } from "@/lib/sim/types";

const LOC_STYLE: Record<Location["kind"], { fill: string; glyph: string }> = {
  hall: { fill: "#ffd36e", glyph: "✦" },
  market: { fill: "#5cc8ff", glyph: "¤" },
  farm: { fill: "#3ddc97", glyph: "❦" },
  forest: { fill: "#8bd450", glyph: "▲" },
  workshop: { fill: "#ffb15c", glyph: "⚒" },
  home: { fill: "#c4a1ff", glyph: "⌂" },
  library: { fill: "#ff8fcb", glyph: "✎" },
  granary: { fill: "#e9c46a", glyph: "◫" },
  site: { fill: "#b79cff", glyph: "▦" },
};

export const ACTION_META: Record<ActionKind, { label: string; glyph: string }> = {
  working: { label: "Working", glyph: "⚒" },
  building: { label: "Building", glyph: "▲" },
  studying: { label: "Studying", glyph: "✎" },
  trading: { label: "Trading", glyph: "¤" },
  eating: { label: "Eating", glyph: "●" },
  resting: { label: "Resting", glyph: "z" },
  idle: { label: "Idle", glyph: "·" },
  hungry: { label: "Hungry", glyph: "!" },
};

export function WorldMap({ state, selected, onSelect }: { state: WorldState; selected: string | null; onSelect: (id: string) => void }) {
  const reduce = useReducedMotion();
  const loc = new Map(state.locations.map((l) => [l.id, l]));
  // Arrange inhabitants who share a location in a small ring around it.
  const groups = new Map<string, Inhabitant[]>();
  for (const i of state.inhabitants) {
    const id = loc.has(i.action.locationId) ? i.action.locationId : i.homeId;
    groups.set(id, [...(groups.get(id) ?? []), i]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [lid, list] of groups) {
    const l = loc.get(lid)!;
    list.forEach((inh, k) => {
      const a = (k / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
      const r = list.length === 1 ? 0 : 2.6 + list.length * 0.55;
      pos.set(inh.id, { x: l.x + Math.cos(a) * r + 4.5, y: l.y + Math.sin(a) * r * 0.9 - 3.5 });
    });
  }
  const hall = loc.get("loc_hall");
  const activeProject = state.projects.find((p) => p.status === "active");

  return (
    <svg viewBox="0 0 100 64" className="h-full w-full" role="img" aria-label={`Map of ${state.name}: ${state.inhabitants.length} agents`}>
      <defs>
        <radialGradient id="land" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#1d2a52" />
          <stop offset="100%" stopColor="#0b1030" />
        </radialGradient>
        <linearGradient id="river" x1="0" x2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#5cc8ff" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="64" rx="3" fill="url(#land)" />
      <path d="M -2 50 C 12 46, 18 58, 30 56 S 52 62, 70 60 S 92 54, 104 58" fill="none" stroke="url(#river)" strokeWidth="2.6" strokeLinecap="round" />
      {/* forest texture */}
      {Array.from({ length: 16 }, (_, k) => (
        <path key={k} d={`M ${76 + (k % 6) * 3.6} ${6 + Math.floor(k / 6) * 4.5} l 1.3 2.6 h -2.6 z`} fill="#8bd450" opacity="0.35" />
      ))}
      {/* field rows */}
      {Array.from({ length: 5 }, (_, k) => (
        <line key={k} x1={10} y1={40 + k * 1.6} x2={22} y2={40 + k * 1.6} stroke="#3ddc97" strokeOpacity="0.25" strokeWidth="0.6" />
      ))}
      {/* roads to the hall */}
      {hall &&
        state.locations
          .filter((l) => l.id !== hall.id)
          .map((l) => <line key={`r${l.id}`} x1={hall.x + 4.5} y1={hall.y} x2={l.x + 4.5} y2={l.y} stroke="#a7aed8" strokeOpacity="0.16" strokeWidth="0.5" strokeDasharray="1 1.2" />)}
      {/* locations */}
      {state.locations.map((l) => {
        const st = LOC_STYLE[l.kind];
        const isSite = l.kind === "site";
        return (
          <g key={l.id}>
            <rect x={l.x} y={l.y - 2.6} width="9" height="5.2" rx="1.2" fill={st.fill} fillOpacity={isSite && !activeProject ? 0.08 : 0.18} stroke={st.fill} strokeOpacity={isSite && !activeProject ? 0.3 : 0.7} strokeWidth="0.3" strokeDasharray={isSite ? "0.8 0.6" : undefined} />
            <text x={l.x + 1.6} y={l.y + 1} fontSize="2.6" fill={st.fill} aria-hidden="true">
              {st.glyph}
            </text>
            <text x={l.x + 4.5} y={l.y + 5.2} fontSize="1.9" textAnchor="middle" fill="#cdd3f5">
              {isSite && activeProject ? `${activeProject.name} ${Math.round((activeProject.progress / activeProject.workRequired) * 100)}%` : l.name}
            </text>
          </g>
        );
      })}
      {/* inhabitants */}
      {state.inhabitants.map((i) => {
        const p = pos.get(i.id) ?? { x: 50, y: 30 };
        const a = ACTION_META[i.action.kind];
        const sel = selected === i.id;
        return (
          <motion.g
            key={i.id}
            initial={false}
            animate={{ x: p.x, y: p.y }}
            transition={{ duration: reduce ? 0 : 0.7, ease: "easeInOut" }}
            role="button"
            tabIndex={0}
            aria-label={`${i.name}, ${i.role}: ${a.label} — ${i.action.detail}`}
            aria-pressed={sel}
            onClick={() => onSelect(i.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(i.id))}
            style={{ cursor: "pointer", outline: "none" }}
          >
            <title>{`${i.name} (${i.role}) — ${i.action.detail}`}</title>
            {sel && <circle r="3" fill="none" stroke="#ffd36e" strokeWidth="0.45" />}
            <circle r="2.1" fill={i.color} stroke={i.action.kind === "hungry" ? "#ff6b7a" : "#0a0d24"} strokeWidth={i.action.kind === "hungry" ? 0.5 : 0.3} />
            <text y="0.75" fontSize="2.1" textAnchor="middle" fontWeight="700" fill="#0a0d24">
              {i.name[0]}
            </text>
            <g transform="translate(1.7,-1.9)">
              <circle r="0.95" fill="#0d1230" stroke={i.color} strokeWidth="0.2" />
              <text y="0.45" fontSize="1.2" textAnchor="middle" fill="#eef0ff">
                {a.glyph}
              </text>
            </g>
          </motion.g>
        );
      })}
    </svg>
  );
}
