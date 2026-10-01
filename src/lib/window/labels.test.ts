import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADDENDUM_STATUS_LABEL, CERT_SIGHTED_LABEL, CHANGE_ROUTE_TEXT, CHECK_STATE_LABEL, CLOSING_CHANGE_KIND_LABEL, DAY_RULE_LABEL, DELIVERY_METHOD_LABEL, FEE_COST_KIND_LABEL, PARTY_SOURCE_LABEL, PATH_LABEL, PHASE_LABEL, SETTING_LABEL, SITE_EVENT_KIND_LABEL, TABLE_AVAILABILITY_LABEL, tableAvailabilityText, UNWORDED, windowFindingText } from "./labels";
import { ADDENDUM_STATUSES, ADVERTISEMENT_DAY_RULES, CERT_SIGHTED, CHECK_STATES, CLOSING_CHANGE_KINDS, DELIVERY_METHODS, FEE_COST_KINDS, PARTY_SOURCES, SITE_EVENT_KINDS, WINDOW_PATHS } from "./types";
import { WINDOW_PHASES } from "./phase";

/**
 * Codes never reach a screen (AGENTS.md rule 5): every code a window rule can return has its own
 * words. Read from the source's fault unions, so a code added to a union without words fails here.
 */

const dir = join(process.cwd(), "src/lib/window");
const sources = [
  ...readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => readFileSync(join(dir, f), "utf8")),
  readFileSync(join(process.cwd(), "src/lib/integration/fee-receipt.ts"), "utf8"),
];
const unionCodes = new Set<string>();
for (const src of sources) {
  for (const m of src.matchAll(/export type \w+Fault\s*=([^;]+);/g)) for (const c of m[1].matchAll(/"([A-Z_]+)"/g)) unionCodes.add(c[1]);
}

describe("every finding has words", () => {
  it("the unions were read", () => expect(unionCodes.size).toBeGreaterThan(100));
  it.each([...unionCodes])("%s", (code) => {
    const text = windowFindingText({ code, level: "block", data: {} });
    expect(text).not.toBe(UNWORDED);
    expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
  });
  it("the name's gate codes read in words too", () => {
    for (const code of ["NAME_NOT_REQUESTED", "NAME_NOT_APPROVED", "NAME_REJECTED"]) expect(windowFindingText({ code, level: "block" })).not.toBe(UNWORDED);
  });
});

describe("every enum and state has a label", () => {
  it.each<[string, readonly string[], Record<string, string>]>([
    ["path", WINDOW_PATHS, PATH_LABEL],
    ["fee cost", FEE_COST_KINDS, FEE_COST_KIND_LABEL],
    ["event", SITE_EVENT_KINDS, SITE_EVENT_KIND_LABEL],
    ["certificate", CERT_SIGHTED, CERT_SIGHTED_LABEL],
    ["check", CHECK_STATES, CHECK_STATE_LABEL],
    ["party", PARTY_SOURCES, PARTY_SOURCE_LABEL],
    ["day rule", ADVERTISEMENT_DAY_RULES, DAY_RULE_LABEL],
    ["change", CLOSING_CHANGE_KINDS, CLOSING_CHANGE_KIND_LABEL],
    ["addendum", ADDENDUM_STATUSES, ADDENDUM_STATUS_LABEL],
    ["delivery", DELIVERY_METHODS, DELIVERY_METHOD_LABEL],
    ["phase", WINDOW_PHASES, PHASE_LABEL],
  ])("%s", (_, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const v of values) expect(labels[v]).toBeTruthy();
  });
  it("the route states, the table availability and the settings", () => {
    for (const t of [...Object.values(CHANGE_ROUTE_TEXT), ...Object.values(TABLE_AVAILABILITY_LABEL), ...Object.values(SETTING_LABEL)]) expect(t).not.toMatch(/[A-Z]{3,}_[A-Z_]{3,}/);
  });
  it("a register check not made reads as not checked, never as clear", () => {
    expect(CHECK_STATE_LABEL.NOT_CHECKED).toMatch(/^Not checked/);
  });
});

describe("the estimate never feeds the window's public facts (6.2)", () => {
  it("no window module imports the company estimate", () => {
    for (const src of sources) expect(src).not.toMatch(/@\/lib\/scope\/(estimate|estimate-store|sealed)/);
  });
});

describe("the Tender Table Document's availability in words", () => {
  it("a cancelled exercise says it was cancelled, and when; a closed window says the window closed", () => {
    expect(tableAvailabilityText("WITHDRAWN", "07 Oct 2026")).toBe("Withdrawn: the exercise was cancelled on 07 Oct 2026");
    expect(tableAvailabilityText("WITHDRAWN", null)).toBe(TABLE_AVAILABILITY_LABEL.WITHDRAWN);
    expect(tableAvailabilityText("AVAILABLE", "07 Oct 2026")).toBe(TABLE_AVAILABILITY_LABEL.AVAILABLE);
  });
});
