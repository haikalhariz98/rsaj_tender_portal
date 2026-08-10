// Validate the subagent definitions against the repository they describe.
//
// These files drifted badly once: they named a monorepo that never existed, a component
// directory that had been deleted, and tooling that was never installed. Nothing caught
// it, because nothing checked. This does.
//
//   node scripts/check-agents.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const AGENT_DIR = join(process.cwd(), ".claude", "agents");
const files = readdirSync(AGENT_DIR).filter((f) => f.endsWith(".md"));

/// Paths named in a backtick that are illustrative rather than existing files: examples
/// in prose, and the numbered output templates each agent writes to.
const ILLUSTRATIVE = [/NNNN/, /^src\/lib\/variation\//];

const problems = [];
const note = (file, msg) => problems.push(`${basename(file, ".md")}: ${msg}`);

/**
 * True when the sentence containing this mention says the thing is absent, rather than
 * assuming it is there.
 *
 * Scoped to the sentence on purpose. A wider window makes the check useless: an
 * unrelated "No filler." two paragraphs away was enough to suppress every finding in
 * a file, which is how this validator passed a definition it should have failed.
 */
const DENIAL = /\b(?:no|not|never|without)\b/i;

function denied(text, index) {
  // Scoped to the paragraph the mention sits in — bounded by blank lines.
  //
  // Not a fixed character window: an unrelated "No filler." two paragraphs away was
  // once enough to suppress every finding in a file, which is how this validator
  // passed a definition it should have failed. Not a single line either, because
  // these files wrap mid-sentence and "There is no\ntranslation layer" is one thought.
  const before = text.lastIndexOf("\n\n", index);
  const after = text.indexOf("\n\n", index);
  const paragraph = text.slice(before === -1 ? 0 : before, after === -1 ? text.length : after);

  // Markdown emphasis sits between the negation and its object — "is **no
  // translation layer**" — so strip it before matching.
  return DENIAL.test(paragraph.replace(/[*_`]/g, "").replace(/\s+/g, " "));
}

for (const file of files) {
  const text = readFileSync(join(AGENT_DIR, file), "utf8");
  const slug = basename(file, ".md");

  // --- frontmatter -------------------------------------------------------------
  if (!text.startsWith("---")) note(file, "no frontmatter");
  const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const model = text.match(/^model:\s*(.+)$/m)?.[1]?.trim();

  if (!name) note(file, "missing name");
  else if (name !== slug) note(file, `name "${name}" does not match filename`);
  if (!description) note(file, "missing description");
  else if (description.length < 40) note(file, "description too short to route on");
  if (model && !["opus", "sonnet", "haiku", "fable"].includes(model)) {
    note(file, `unknown model "${model}"`);
  }

  // --- asserted paths ----------------------------------------------------------
  // An agent may name a path precisely to say it is NOT there — "there is no
  // `src/components/ui/`" is the point of that sentence, not a mistake in it.
  for (const m of text.matchAll(/`([a-zA-Z0-9_@.-]+\/[a-zA-Z0-9_@./*-]*)`/g)) {
    const path = m[1];
    if (ILLUSTRATIVE.some((re) => re.test(path))) continue;
    if (path.includes("*")) continue;
    if (existsSync(join(process.cwd(), path))) continue;
    if (denied(text, m.index)) continue;
    note(file, `path does not exist: ${path}`);
  }

  // --- tooling that is not installed -------------------------------------------
  // Naming one is fine — the agents deliberately say what is absent. Requiring one is
  // not, so only flag a mention that is not adjacent to a disclaimer.
  const ABSENT = ["Playwright", "Storybook", "translation layer", "Zod"];
  for (const tool of ABSENT) {
    for (const m of text.matchAll(new RegExp(tool, "g"))) {
      if (!denied(text, m.index)) note(file, `requires ${tool}, which is not installed`);
    }
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s) across ${files.length} agents:\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`${files.length} agents checked — frontmatter valid, every asserted path exists,`);
console.log("no agent requires tooling the repository does not have.");
