import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/council/service";
import { importMemory, importSchema } from "@/lib/memory/service";

/** Explicit import: the Founder pastes notes or an export. Items arrive disabled for review. */
export const POST = route(async (req, _ctx, db) => {
  const { text, label } = await body(req, importSchema);
  const rows = await importMemory(db, text, label);
  if (!rows.length) throw new HttpError(400, "Nothing to import — paste one item per line or a JSON array of strings.");
  await audit(db, "prime", "memory.import", null, { count: rows.length, label: label ?? null });
  return json({ imported: rows.length, items: rows }, { status: 201 });
});
