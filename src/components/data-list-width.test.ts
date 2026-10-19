import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DataList, minTableWidth, type Column, type Row } from "./data-list";
import { toPosix } from "@/lib/scan/files";

/**
 * 6.7 review S-1: the shared DataList keeps a list's flexing column from being squeezed (a column's
 * `minWidth` sets the table's least width, and it scrolls in its card instead), and a list may stack
 * below 2xl. Every list that sets neither is unchanged: its floor stays 640px, its breakpoints as before.
 */

describe("the table's least width", () => {
  it("no column sets minWidth: nothing changes (null, the 640px floor stands)", () => {
    expect(minTableWidth([{ width: "110px" }, {}, { width: "190px" }], { selectable: false, actions: 0 })).toBeNull();
  });
  it("the Opening's offers: the fixed columns plus the bidder's 200px", () => {
    const cols = [{ width: "110px" }, { minWidth: "200px" }, { width: "190px" }, { width: "220px" }, { width: "220px" }, { width: "210px" }];
    expect(minTableWidth(cols, { selectable: false, actions: 0 })).toBe("1150px");
    expect(minTableWidth(cols, { selectable: true, actions: 128 })).toBe("1326px");
  });
  it("never below the 640px floor", () => expect(minTableWidth([{ minWidth: "200px" }], { selectable: false, actions: 0 })).toBe("640px"));
});

describe("the breakpoints, written whole for Tailwind", () => {
  const src = readFileSync(join(process.cwd(), "src/components/data-list.tsx"), "utf8");
  it("md and xl read as before; 2xl is new", () => {
    expect(src).toMatch(/const STACKED_BELOW = \{ md: "md:hidden", xl: "xl:hidden", "2xl": "2xl:hidden" \} as const;/);
    expect(src).toMatch(/const TABLE_FROM = \{ md: "hidden md:block", xl: "hidden xl:block", "2xl": "hidden 2xl:block" \} as const;/);
  });
});

describe("only the Opening's offers use them (other lists unchanged)", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.tsx$/.test(name) ? [toPosix(path)] : [];
    });
  }
  const screens = files(join(process.cwd(), "src", "app")).map((p) => ({ p, text: readFileSync(p, "utf8") }));
  // 6.8 (flagged, faithful): the evaluation's lists are the second set to use them, as the build was told to.
  // The documents register's Library and Routing sheets, which gave their main column a minWidth (6.14 inc 2 code review S-1), went with the Documents menu (MN-02, AC-16).
  // Founder, 2026-10-05 (faithful): the sourcing list keeps its exercise column at least 260px.
  it("stackBelow=\"2xl\" and a column minWidth appear only on the offers list, the evaluation's lists and the sourcing list", () => {
    expect(screens.filter((s) => /stackBelow="2xl"/.test(s.text)).map((s) => s.p.replaceAll("\\", "/").replace(/^.*?(?=src\/)/, "")).sort()).toEqual(["src/app/sourcing/[id]/evaluation/lists.tsx", "src/app/sourcing/[id]/opening/lists.tsx"]);
    expect(screens.filter((s) => /\{ key: "[^"]+", label: [^}]*minWidth: "\d+px"/.test(s.text)).map((s) => s.p.replaceAll("\\", "/").replace(/^.*?(?=src\/)/, "")).sort()).toEqual(["src/app/sourcing/[id]/evaluation/lists.tsx", "src/app/sourcing/[id]/opening/lists.tsx", "src/app/sourcing/page.tsx"]);
  });
  it("the offers list: bidder at least 200px; the verdict column holds the badge", () => {
    const lists = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/opening/lists.tsx"), "utf8");
    expect(lists).toMatch(/\{ key: "bidder", label: "Bidder as read", minWidth: "200px"/);
    expect(lists).toMatch(/\{ key: "verdict", label: "Verdict", width: "210px"/);
  });
});

describe("as rendered", () => {
  const rows: Row[] = [{ id: "1", search: "a", cells: { name: { kind: "text", text: "Contoh Bina Sdn Bhd" }, verdict: { kind: "badge", text: "Carried to evaluation", tone: "ok" } } }];
  const render = (columns: Column[], stackBelow?: "md" | "xl" | "2xl") => renderToStaticMarkup(createElement(DataList, { columns, rows, selectable: false, ...(stackBelow ? { stackBelow } : {}) }));
  it("a list without the new options renders as before: the 640px floor, no width style", () => {
    const html = render([{ key: "name", label: "Name", mobile: "primary" }, { key: "verdict", label: "Verdict", width: "170px", mobile: "meta" }]);
    expect(html).toContain('class="w-full min-w-[640px] table-fixed border-collapse text-[13.5px]"');
    expect(html).not.toMatch(/<table[^>]*style=/);
    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden md:block");
  });
  it("with a minWidth column and stackBelow 2xl: the table's least width, stacked below 2xl", () => {
    const html = render([{ key: "name", label: "Name", minWidth: "200px", mobile: "primary" }, { key: "verdict", label: "Verdict", width: "210px", mobile: "meta" }], "2xl");
    expect(html).toMatch(/<table[^>]*style="min-width:640px"/);
    expect(html).toContain("2xl:hidden");
    expect(html).toContain("hidden 2xl:block");
    // The badge is in both layouts, whole.
    expect(html.match(/Carried to evaluation/g)!.length).toBeGreaterThanOrEqual(2);
  });
});
