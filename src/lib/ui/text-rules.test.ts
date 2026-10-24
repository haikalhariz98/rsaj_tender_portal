import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BANNED_WORDS, scanSource } from "../../../scripts/ui-text-rules.mjs";

/// The literal-text rules of the minimal-words standard (note 0005 section 4 and R2, founder 2026-10-19).
const rules = (source: string) => scanSource("fixture.tsx", source).map((v) => v.rule);

describe("literal-text rules", () => {
  it("passes money, percentages and dates (R2)", () => {
    const source = `export const a = <div title="RM 1.2m"><p>6.2% by 3 Nov (2026)</p><span>{"Closes 12.5% above RM 3,400.50"}</span><i>(1.5m)</i></div>;`;
    expect(rules(source)).toEqual([]);
  });

  it("passes a customer's own clause citation, which is data", () => {
    expect(rules(`export const a = <p>Closing date falls on a weekend · SK002 7.4.2(g)</p>;`)).toEqual([]);
  });

  it("fails a spec or ruling code in rendered text", () => {
    expect(rules(`export const a = <p>Reads evaluations (FR-EVL-014).</p>;`)).toEqual(["product-code"]);
    expect(rules(`export const a = "Kept for 7 years (NFR-RET-002)";`)).toEqual(["product-code"]);
    expect(rules("export const a = `Ruled in AC-52`;")).toEqual(["product-code"]);
    expect(rules(`export const a = <p>Per SR-08 and (6.16)</p>;`)).toEqual(["product-code"]);
  });

  it("holds a literal page subtitle to 8 words", () => {
    expect(rules(`export const a = <PageHeader title="X" subtitle="One two three four five six seven eight" />;`)).toEqual([]);
    expect(rules(`export const a = <PageHeader title="X" subtitle="One two three four five six seven eight nine" />;`)).toEqual(["page-subtitle"]);
  });

  it("holds a card subtitle to 6 and an editor intro to 15", () => {
    expect(rules(`export const a = <CardHeader title="X" subtitle="One two three four five six seven" />;`)).toEqual(["card-subtitle"]);
    expect(rules(`export const a = <RecordEditor description="${"word ".repeat(16)}" />;`)).toEqual(["editor-intro"]);
    expect(rules(`export const a = <RecordEditor description="${"word ".repeat(15)}" />;`)).toEqual([]);
  });

  it("measures the longest branch of a conditional", () => {
    expect(rules(`export const a = <RecordEditor description={x ? "short" : "${"word ".repeat(16)}"} />;`)).toEqual(["editor-intro"]);
  });

  it("fails an empty state with a body", () => {
    expect(rules(`export const a = <EmptyState title="None">Add one to start.</EmptyState>;`)).toEqual(["empty-body"]);
    expect(rules(`export const a = <EmptyState title="None" action={<b />} />;`)).toEqual([]);
  });

  it("allows only warn, err and ok callouts, each with a tone and 15 words", () => {
    expect(rules(`export const a = <Callout tone="warn">Needs a second administrator.</Callout>;`)).toEqual([]);
    expect(rules(`export const a = <Callout tone="info">Fine.</Callout>;`)).toEqual(["callout-tone"]);
    expect(rules(`export const a = <Callout tone="neutral">Fine.</Callout>;`)).toEqual(["callout-tone"]);
    expect(rules(`export const a = <Callout>Fine.</Callout>;`)).toEqual(["callout-tone"]);
    expect(rules(`export const a = <Callout tone={x ? "ok" : "info"}>Fine.</Callout>;`)).toEqual(["callout-tone"]);
    expect(rules(`export const a = <Callout tone="warn" title="Stop">${"word ".repeat(15)}</Callout>;`)).toEqual(["callout-length"]);
  });

  it("holds a field hint, as a prop or as field data, to 8 words", () => {
    const nine = "one two three four five six seven eight nine";
    expect(rules(`export const a = <Field label="X" hint="one two three four five six seven eight" />;`)).toEqual([]);
    expect(rules(`export const a = <Field label="X" hint="${nine}" />;`)).toEqual(["field-hint"]);
    expect(rules(`export const a = { kind: "text", name: "n", hint: "${nine}" };`)).toEqual(["field-hint"]);
    expect(rules("export const a = { hint: value };")).toEqual([]);
  });

  it("does not judge a test file", () => {
    expect(scanSource("x.test.tsx", `export const a = "FR-EVL-014";`)).toEqual([]);
  });
});

describe("paragraph rule (0005 R14, 2026-10-20)", () => {
  const long = Array.from({ length: 21 }, () => "word").join(" ");
  const onTab = (source: string) => scanSource("src/app/sourcing/[id]/documents/x.tsx", source).map((v) => v.rule);
  it("fails a paragraph over 20 words on a screen that has been cut", () => {
    expect(onTab(`export const a = <p>${long}</p>;`)).toEqual(["paragraph-length"]);
  });
  it("passes 20 words, and leaves other screens and the print view alone", () => {
    expect(onTab(`export const a = <p>${long.slice(5)}</p>;`)).toEqual([]);
    expect(rules(`export const a = <p>${long}</p>;`)).toEqual([]);
    expect(scanSource("src/app/sourcing/[id]/documents/print/page.tsx", `export const a = <p>${long}</p>;`)).toEqual([]);
  });
});

describe("paragraph rule on Bids and opening (0005 R14, 2026-10-20)", () => {
  const long = Array.from({ length: 21 }, () => "word").join(" ");
  it("covers the bids, briefing and scope tab files too", () => {
    for (const dir of ["bids", "briefing", "scope"]) expect(scanSource(`src/app/sourcing/[id]/${dir}/x.tsx`, `export const a = <p>${long}</p>;`).map((v) => v.rule)).toEqual(["paragraph-length"]);
  });
  it("covers the opening tab's files and leaves its print view alone", () => {
    expect(scanSource("src/app/sourcing/[id]/opening/workspace.tsx", `export const a = <p>${long}</p>;`).map((v) => v.rule)).toEqual(["paragraph-length"]);
    expect(scanSource("src/app/sourcing/[id]/opening/print/page.tsx", `export const a = <p>${long}</p>;`)).toEqual([]);
  });

  it("fails the phrases no screen says, in text and in string literals, and passes ordinary words", () => {
    expect(rules(`export const a = <p>Where it comes from</p>;`)).toEqual(["banned-word"]);
    expect(rules(`export const a = "Changes awaiting a second person";`)).toEqual(["banned-word"]);
    expect(rules(`export const a = <b>Approve (A)</b>;`)).toEqual(["banned-word"]);
    expect(rules(`export const a = <b>Not emailed</b>;`)).toEqual(["banned-word"]);
    expect(rules(`export const a = <p>(invented)</p>;`)).toEqual(["banned-word"]);
    expect(rules(`export const a = <p>Issue a case; act on the window. A (B) option and Plan (A1).</p>;`)).toEqual([]);
    expect(rules(`export const a = <p>Where the value came from</p>;`)).toEqual([]);
  });

  // ST-12 (2026-10-24): the inbox is the channel, so no source file says "Not emailed" (the scan above covers screens; this covers src/lib too).
  it("finds no Not emailed anywhere in src but this test", () => {
    const re = BANNED_WORDS.find(([name]) => name === "Not emailed")![1];
    const files = readdirSync("src", { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f) && path.basename(f) !== "text-rules.test.ts");
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((f) => re.test(readFileSync(path.join("src", f), "utf8")))).toEqual([]);
  });
});
