import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Blocked } from "./ui/blocked";
import { CardHeader } from "./ui/card";

/**
 * 6.15a fix S-4 (a): the supplier's Standing tab scrolled sideways at 390 because its own copy of
 * `Blocked` (a long reason in an unbounded row) sat in CardHeader's shrink-0 actions. There is one
 * Blocked now, in the design system, bounded to the width it has; the header's actions never exceed
 * the card.
 */

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    if (statSync(join(process.cwd(), p)).isDirectory()) return f === "generated" ? [] : walk(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

describe("a blocked control fits its card (fix S-4)", () => {
  it("the shared Blocked bounds itself and its reason to the width available", () => {
    const html = renderToStaticMarkup(createElement(Blocked, { label: "Suspend", reason: "The supplier is blacklisted (since 24 Sep 2026): a suspension adds nothing." }));
    expect(html).toMatch(/^<span class="inline-flex max-w-full flex-col/);
    expect(html).toContain("The supplier is blacklisted (since 24 Sep 2026): a suspension adds nothing.");
    expect(html).toMatch(/<span class="max-w-full [^"]*sm:max-w-64">/);
  });

  it("CardHeader's actions are never wider than the card", () => {
    const html = renderToStaticMarkup(createElement(CardHeader, { title: "Standing", actions: createElement("span", null, "x") }));
    expect(html).toMatch(/<div class="flex max-w-full shrink-0 flex-wrap items-center gap-2">/);
  });

  it("no screen defines its own Blocked (one copy, in src/components/ui)", () => {
    const own = walk("src").filter((p) => p !== "src/components/ui/blocked.tsx" && /function Blocked\b/.test(readFileSync(join(process.cwd(), p), "utf8")));
    expect(own).toEqual([]);
  });
});
