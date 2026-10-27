import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardHeader } from "./card";

// Phase 0.2 item 3: the information button sat in the subtitle slot, so it wrapped below the title (con3's Kick-off meeting card).
// CardHeader carries it in the title's own row, as PageHeader does.
describe("a card header's information button", () => {
  const out = renderToStaticMarkup(createElement(CardHeader, { title: "Kick-off meeting", info: { label: "About the kick-off meeting", text: "Held once the contract is executed." } }));
  it("sits in the title's row, after the title, and keeps its text for a screen reader", () => {
    const row = /<div class="flex min-w-0 items-center gap-1\.5"><h3[^>]*>Kick-off meeting<\/h3><span class="shrink-0">[\s\S]*?<button[\s\S]*?About the kick-off meeting/.exec(out);
    expect(row).not.toBeNull();
    expect(out).toContain("Held once the contract is executed.");
    expect(out).not.toMatch(/<p class="text-\[13px\][^"]*"><span[^>]*><button/);
  });
  it("is not offered on a collapsible card, whose summary a button would fold", () => {
    expect(renderToStaticMarkup(createElement(CardHeader, { title: "Fold", collapsible: true, info: { label: "About", text: "x" } }))).not.toContain("<button");
  });
  it("no screen passes the button as a subtitle any more", () => {
    for (const p of ["src/app/projects/[id]/kick-off-card.tsx", "src/app/projects/[id]/contractor-accounts-card.tsx", "src/app/projects/[id]/project-documents-card.tsx", "src/app/projects/documents-waiting-view.tsx"]) {
      expect(readFileSync(p, "utf8"), p).not.toMatch(/subtitle=\{<MoreText/);
    }
  });
});
