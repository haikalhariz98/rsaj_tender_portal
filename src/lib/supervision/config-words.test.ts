import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/// Review 12 (AGENTS.md rule 1): the Post-award controls show no customer's figure, as a placeholder or in an error.
describe("the Post-award controls name no figure", () => {
  const ROOT = path.join(__dirname, "../../..");
  it.each(["src/app/configuration/post-award/editors.tsx", "src/app/configuration/post-award/actions.ts", "src/app/configuration/post-award/page.tsx"])("%s", (f) => {
    const src = readFileSync(path.join(ROOT, f), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
    expect(src).not.toMatch(/\b(70|75)\b/);
    expect(src).not.toMatch(/placeholder: "e\.g\. \d/);
  });
});
