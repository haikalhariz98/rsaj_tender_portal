import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { sulitGranted, sulitWithheld } from "@/lib/auth/sulit-access";

import { DataList, type Row } from "./data-list";
import { SulitValue } from "./ui/badge";

/**
 * A SULIT value as a screen draws it (ADR 0034 D14, Phase 3a): the figure with a lock that says why the reader may see it, or "SULIT · withheld" with the
 * reason, and in a list a cell that carries no figure to search, sort or export. A withheld answer has no value to draw, so these show that the markup
 * holds nothing of it.
 */

describe("SulitValue", () => {
  it("draws a granted value with the reason it is shown, in the lock's words", () => {
    const html = renderToStaticMarkup(createElement(SulitValue, { of: sulitGranted("RM 4,200.00", "NAMED_ON_RECORD") }));
    expect(html).toContain("RM 4,200.00");
    expect(html).toContain("Shown because you are named on this record.");
  });
  it("draws a withheld value as 'SULIT · withheld' with the reason, and nothing else", () => {
    const html = renderToStaticMarkup(createElement(SulitValue, { of: sulitWithheld("NOT_NAMED_PERMISSION_UNDECIDED", "exercise") }));
    expect(html).toContain("Hidden");
    expect(html).toContain("not yet decided");
    expect(html).not.toMatch(/\d{1,3},\d{3}/);
  });
  // Phase 3b, a deliberate change to this test (logged): the older form, which drew a value no loader had judged with "not restricted until sign-in", is retired. A value is drawn from a
  // `Sulit`, or it is not drawn as SULIT: the component takes no children.
  it("takes only a judged value: the older form with children is gone", () => {
    const src = readFileSync(join(process.cwd(), "src/components/ui/sulit-marks.tsx"), "utf8");
    const component = src.slice(src.indexOf("export function SulitValue"));
    expect(component.slice(0, 200)).toMatch(/\{ of: s \}: \{ of: Sulit<ReactNode> \}/);
    expect(src).not.toMatch(/not restricted until sign-in/);
  });
});

describe("a withheld cell in a list", () => {
  const rows: Row[] = [
    { id: "1", search: "alpha", sortKeys: { value: 500 }, cells: { name: { kind: "text", text: "Alpha" }, value: { kind: "money", value: 500 } } },
    { id: "2", search: "beta", cells: { name: { kind: "text", text: "Beta" }, value: { kind: "withheld", words: "You are not named on this exercise." } } },
  ];
  const html = renderToStaticMarkup(createElement(DataList, { columns: [{ key: "name", label: "Name", mobile: "primary" }, { key: "value", label: "Value", numeric: true, sulit: true, mobile: "meta" }], rows, selectable: false }));
  it("says withheld, with the reason, where the figure would be", () => {
    expect(html).toContain("Hidden");
    expect(html).toContain("You are not named on this exercise.");
  });
  it("shows the figure of the row that may be read", () => {
    expect(html).toContain("500");
  });
});
