// Inlines the real world engine (src/lib/sim/types.ts + engine.ts, types stripped) into the
// GitHub Pages demo (index.html) between the <engine> markers. Run: node scripts/build-pages-demo.mjs
import { stripTypeScriptTypes } from "node:module";
import fs from "node:fs";

const sim = new URL("../src/lib/sim/", import.meta.url);
const page = new URL("../index.html", import.meta.url);
const strip = (f) => stripTypeScriptTypes(fs.readFileSync(new URL(f, sim), "utf8"), { mode: "transform" });
const engine = (strip("types.ts") + "\n" + strip("engine.ts").replace(/import\s*\{[\s\S]*?\}\s*from\s*"\.\/types";?/, ""))
  .replace(/^export\s+/gm, "")
  .replace(/<\/script/gi, "<\\/script");
const html = fs.readFileSync(page, "utf8");
const start = "// <engine>";
const end = "// </engine>";
const a = html.indexOf(start);
const b = html.indexOf(end);
if (a < 0 || b < a) throw new Error("engine markers not found in index.html");
const head = html.slice(0, html.indexOf("\n", a) + 1);
fs.writeFileSync(page, head + engine + "\n" + html.slice(b));
console.log(`Inlined world engine (${engine.length} chars) into index.html`);
