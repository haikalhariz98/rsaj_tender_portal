// The prototype ships a second stylesheet inside its JS, injected at runtime as
// template literals. The <style> block alone is therefore an incomplete port —
// screens like Configuration rely on rules that only exist here.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.env.USERPROFILE, "projects", "perolehan", "docs", "prototype", "RSAJ-Tender-Portal.html"),
  "utf8",
);

/// Walk a template literal from its opening backtick, respecting escapes.
function readTemplate(text, start) {
  let out = "";
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      out += text[i + 1];
      i++;
      continue;
    }
    if (c === "`") return { body: out, end: i };
    out += c;
  }
  return null;
}

const chunks = [];
for (let i = 0; i < src.length; i++) {
  if (src[i] !== "`") continue;
  const tpl = readTemplate(src, i);
  if (!tpl) break;
  const body = tpl.body;
  i = tpl.end;

  // A CSS chunk: several rules, at least one class selector, no JS interpolation.
  const looksLikeCss =
    body.length > 120 &&
    !body.includes("${") &&
    /(^|\n)\s*[.#@:a-zA-Z][^\n{]{0,120}\{[^}]*[a-z-]+\s*:/.test(body) &&
    (body.match(/\{/g) || []).length >= 2 &&
    /\.[a-z][a-z0-9_-]*\s*[{,.:]/i.test(body);

  if (looksLikeCss) chunks.push(body.trim());
}

const seen = new Set();
const unique = chunks.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
const css = unique.join("\n\n");

const outFile = join(
  process.env.USERPROFILE,
  "projects",
  "perolehan",
  "src",
  "app",
  "design-system-runtime.css",
);
writeFileSync(
  outFile,
  "/* Stylesheet the prototype injects from JS at runtime, extracted verbatim.\n" +
    "   Kept separate from design-system.css so each stays a faithful copy of its\n" +
    "   source. Regenerate with `node scripts/extract-runtime-css.mjs`. */\n\n" +
    css +
    "\n",
  "utf8",
);

const classes = [...new Set([...css.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((m) => m[1]))];
console.log("chunks    :", unique.length);
console.log("bytes     :", css.length);
console.log("classes   :", classes.length);
console.log("sample    :", classes.slice(0, 40).join(" "));
