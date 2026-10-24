import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatCompactRM } from "@/lib/format";
import { formatSen } from "@/lib/money";
import { monthSlots } from "@/lib/insights/months";

import { BarList, MonthColumns, TrendLine, monthLong, summarise, type ChartValue } from "./chart";

const rm = (v: ChartValue) => formatCompactRM(BigInt(v));
const exactRM = (v: ChartValue) => formatSen(BigInt(v));
const count = (v: ChartValue) => String(v);
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
/// The cells of the Table toggle's body, row by row.
const tableRows = (out: string) =>
  [...out.slice(out.indexOf("<tbody>")).matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>(?:<span[^>]*>[^<]*<\/span>)?(.*?)<\/td>/g)].map((c) => c[1]));

describe("MonthColumns", () => {
  const months = monthSlots({ from: "2026-01-01", to: "2027-01-01" }).map((month, i) => ({ month, values: [BigInt(i * 1000_00), i === 9 ? 2_100_000_00n : 0n] as ChartValue[] }));
  const out = html(createElement(MonthColumns, { title: "Money through the year", months, series: ["Awarded", "Paid"], format: rm, exact: exactRM }));

  it("has twelve slots for a twelve-month year, empty months included", () => {
    expect(out.match(/data-slot="/g)).toHaveLength(12);
    expect(out).toContain('data-slot="2026-01"');
    expect(out).toContain('data-slot="2026-12"');
  });
  it("is an image with a summary for a screen reader", () => {
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Money through the year, highest Dec 2026, RM 11K"');
  });
  it("carries each column's exact figure in its title", () => {
    expect(out).toContain("<title>Oct 2026 · Paid: RM2,100,000.00</title>");
  });
  it("the table equals the series, exact", () => {
    const rows = tableRows(out);
    expect(rows).toHaveLength(12);
    expect(rows[9]).toEqual(["Oct 2026", "RM9,000.00", "RM2,100,000.00"]);
    expect(rows[0]).toEqual(["Jan 2026", "RM0.00", "RM0.00"]);
  });
  it("a negative value draws down from the axis", () => {
    const neg = html(createElement(MonthColumns, { title: "Paid", months: [{ month: "2026-01", values: [-500n] }, { month: "2026-02", values: [1000n] }], series: ["Paid"], format: rm }));
    const rects = [...neg.matchAll(/<rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"/g)].map((m) => ({ y: Number(m[1]), h: Number(m[2]) }));
    const [down, up] = rects;
    // The axis sits where the positive column ends; the negative column starts there and goes down.
    expect(down.y).toBeCloseTo(up.y + up.h);
    expect(down.h).toBeGreaterThan(0);
  });
  it("a year all nought is drawn flat and says so", () => {
    const flat = html(createElement(MonthColumns, { title: "Paid", months: [{ month: "2026-01", values: [0n] }], series: ["Paid"], format: rm }));
    expect(flat).toContain('aria-label="Paid, nothing yet"');
  });
});

describe("BarList", () => {
  const rows = [
    { label: "Awarding", values: [3], href: "/projects?view=awarding" },
    { label: "Water Supply and a very long department name", values: [12] },
    { label: "Adjusted", values: [-2] },
  ];
  const out = html(createElement(BarList, { title: "Pipeline now", head: "Stage", rows, series: ["Count"], format: count }));

  it("renders a row with an href as a link a screen reader reaches, holding its label and figure", () => {
    expect(out).toMatch(/<a [^>]*href="\/projects\?view=awarding"[^>]*>.*Awarding.*3<\/span><\/a>/);
    expect(out).not.toContain("role=\"img\"");
    expect(out.match(/<a /g)).toHaveLength(1);
  });
  it("hides the bar itself from a screen reader and keeps a truncated label whole in its title", () => {
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('title="Water Supply and a very long department name"');
  });
  it("scales to the largest row, and a negative figure draws nothing but is shown as it is", () => {
    expect(out).toContain("width:100%");
    expect(out).toContain("width:25%");
    expect(out).toContain("width:0%");
    expect(out).toContain(">-2</span>");
  });
  it("stacks up to three series and shows the row's total", () => {
    const s = html(createElement(BarList, { title: "By department", head: "Department", rows: [{ label: "Finance", values: [100_00n, 50_00n, 850_00n] }], series: ["Spent", "Committed", "Available"], format: rm, exact: exactRM }));
    expect(s).toContain("RM 1K");
    expect(s).toContain("bg-brand-500");
    expect(s).toContain("bg-amber-500");
    expect(s).toContain("bg-emerald-500");
    expect(tableRows(s)).toEqual([["Finance", "RM100.00", "RM50.00", "RM850.00"]]);
  });
  it("draws the threshold tick only where one is set", () => {
    const at = html(createElement(BarList, { title: "Most used codes", head: "Code", rows: [{ label: "A", values: [90] }], series: ["Used"], format: count, threshold: 80, max: 100 }));
    expect(at).toContain("data-threshold");
    expect(at).toContain("left:80%");
    expect(out).not.toContain("data-threshold");
  });
  it("the table equals the series", () => {
    expect(tableRows(out)).toEqual([
      ["Awarding", "3"],
      ["Water Supply and a very long department name", "12"],
      ["Adjusted", "-2"],
    ]);
  });
});

describe("TrendLine", () => {
  const points = [
    { label: "Jan", value: 100_00n, reference: 1000_00n },
    { label: "Feb", value: 300_00n, reference: 1000_00n },
    { label: "Mar", value: null, reference: 1000_00n },
  ];
  const out = html(createElement(TrendLine, { title: "Used through the year", points, series: ["Spent and committed", "Allocated"], format: rm, exact: exactRM }));
  it("stops the line where periods have not come yet, and draws the reference across", () => {
    const line = out.match(/data-line="true" d="([^"]+)"/)![1];
    const ref = out.match(/data-reference="true" d="([^"]+)"/)![1];
    expect(line.split(/[ML]/).filter(Boolean)).toHaveLength(2);
    expect(ref.split(/[ML]/).filter(Boolean)).toHaveLength(3);
  });
  it("summarises its latest point", () => {
    expect(out).toContain('aria-label="Used through the year, Feb, RM 300"');
  });
  it("the table equals the series, a period not yet come reading — rather than nought", () => {
    expect(tableRows(out)).toEqual([
      ["Jan", "RM100.00", "RM1,000.00"],
      ["Feb", "RM300.00", "RM1,000.00"],
      ["Mar", "—", "RM1,000.00"],
    ]);
  });
});

describe("summaries", () => {
  it("name the highest point, or say nothing yet", () => {
    expect(summarise("Paid by month", [{ label: "Sep 2026", value: 5n }, { label: "Oct 2026", value: 210_000_000n }], rm)).toBe("Paid by month, highest Oct 2026, RM 2.10M");
    expect(summarise("Paid by month", [], rm)).toBe("Paid by month, nothing yet");
    expect(monthLong("2027-06")).toBe("Jun 2027");
  });
});
