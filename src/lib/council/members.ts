import "server-only";
import { z } from "zod";
import type { members, providers } from "@/lib/db/schema";
import { publicProvider } from "@/lib/providers/registry";
import { COUNCIL_ROLES } from "./types";
import { demoForced } from "./service";

export const memberFields = {
  name: z.string().trim().min(1).max(40),
  role: z.enum(COUNCIL_ROLES),
  persona: z.string().trim().max(600),
  providerId: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(160).regex(/^[\w.:/@+-]+$/, "Model ids may contain letters, digits and . : / @ + - _"),
  enabled: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  monogram: z.string().trim().min(1).max(2),
};

export const memberCreateSchema = z.object({ ...memberFields, persona: memberFields.persona.default(""), enabled: memberFields.enabled.default(true) });
export const memberUpdateSchema = z.object(memberFields).partial().extend({ seat: z.number().int().min(0).max(50).optional() });

type MemberRow = typeof members.$inferSelect;
type ProviderRow = typeof providers.$inferSelect;

/** Members joined with their provider's public status and shared-model labels. */
export function publicMembers(rows: MemberRow[], provs: ProviderRow[]) {
  const byId = new Map(provs.map((p) => [p.id, p]));
  const forced = demoForced();
  return {
    demoForced: forced,
    members: rows.map((m) => {
      const p = byId.get(m.providerId);
      const sharesModelWith = rows.filter((o) => o.id !== m.id && o.enabled && o.providerId === m.providerId && o.model === m.model).map((o) => o.id);
      return {
        ...m,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
        provider: p ? publicProvider(p) : null,
        sharesModelWith,
        simulated: forced || p?.kind === "demo",
      };
    }),
  };
}
export type PublicMember = ReturnType<typeof publicMembers>["members"][number];
