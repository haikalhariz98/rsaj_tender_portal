import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/// N3 reviewer run 1, AC-63: the tab strip follows the APG tabs pattern. Each selected tab points at its panel and the panel is named by that tab.
const src = readFileSync("src/components/tabs.tsx", "utf8");

describe("Tabs links tab and panel", () => {
  it("gives every tab an id and the selected one aria-controls", () => {
    expect(src).toMatch(/role="tab"\s+id=\{`\$\{uid\}-tab-\$\{tab\.id\}`\}\s+aria-controls=\{selected \? `\$\{uid\}-panel` : undefined\}/);
  });
  it("names the panel by the current tab, with an id from useId", () => {
    expect(src).toMatch(/role="tabpanel" id=\{`\$\{uid\}-panel`\} aria-labelledby=\{current \? `\$\{uid\}-tab-\$\{current\.id\}` : undefined\}/);
    expect(src).toContain("useId()");
  });
});
