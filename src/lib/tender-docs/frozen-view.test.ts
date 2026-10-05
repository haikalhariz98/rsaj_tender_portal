import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { conditionsSnapshot, readConditionsSnapshot, type ConditionsInput } from "./conditions";
import { frozenConditionsView, groupHeadings } from "./frozen-view";
import type { PackPartFacts } from "./types";

const part = (x: Partial<PackPartFacts>): PackPartFacts => ({ partCode: "p", printedNumber: "1", sortOrder: 1, label: "Part", role: "OTHER", content: "STANDARD", source: "UPLOAD", mandatory: true, inTableDocument: true, templateCode: null, template: null, state: "READY", omittedReason: "", liveUploads: 1, ...x });

/// What was judged and frozen. The same input, edited afterwards, is the "live" configuration.
const FROZEN_INPUT: ConditionsInput = {
  today: "2026-10-01",
  eligibility: { requirements: [{ bodyCode: "a", bodyLabel: "Registry A", bodyLabelMs: null, qualifierLabel: null, qualifiers: "Grade 5", alternativeGroup: 1, sortOrder: 0 }, { bodyCode: "b", bodyLabel: "Registry B", bodyLabelMs: null, qualifierLabel: null, qualifiers: "", alternativeGroup: 1, sortOrder: 1 }, { bodyCode: "c", bodyLabel: "Registry C", bodyLabelMs: null, qualifierLabel: null, qualifiers: "", alternativeGroup: 2, sortOrder: 0 }], bodies: [] },
  restriction: { restricted: true, label: "Restricted to approved bidders", stamp: { EN: "STAMP WORDS", MS: "KATA CAP" } },
  permit: { regulated: true, permitCode: "t1", list: { name: "Permits", values: [{ code: "t1", label: "Permit One", retired: false }] } },
  clauses: { clauses: [{ code: "cl", titleEn: "Clause One", titleMs: null, bodyEn: "x", bodyMs: null, bodyVersion: 3, mandatoryInAgreements: true, retiredOn: null }], overrides: [] },
  assurance: { required: true, confirmations: [{ kind: "NO_AMBIGUITY", personName: "Nur Aina", confirmedOn: "2026-09-30" }] },
};

const NOTICE = part({ partCode: "n", role: "INVITATION", source: "TEMPLATE", liveUploads: 0, template: { id: "t", code: "t", nameEn: "Notice", formCode: "", revisionDate: null, bodyEn: "Registered {{eligibility.registration}} {{eligibility.window}}.", bodyMs: null, primaryLanguage: null, bodyVersion: 1 } });
const stored = JSON.parse(JSON.stringify(conditionsSnapshot([NOTICE], FROZEN_INPUT, { startOn: "2026-10-08", closingDay: "2026-10-22" })));

describe("a frozen pack's conditions are read only from the snapshot", () => {
  const view = frozenConditionsView(readConditionsSnapshot(stored)!, 2);

  it("states the registrations, the restriction, the permit, assurance and clauses as frozen", () => {
    expect(view.groups.map((g) => [g.heading, g.items.map((i) => i.body)])).toEqual([["One of these", ["Registry A", "Registry B"]], ["And", ["Registry C"]]]);
    expect(view.restriction).toEqual({ question: "Restricted to approved bidders", answer: "Yes", stampEn: "STAMP WORDS", stampMs: "KATA CAP" });
    expect(view.permit).toEqual({ answer: "Yes", type: "Permit One" });
    expect(view.assurance.required).toBe("Required by policy");
    expect(view.clauses).toEqual([{ title: "Clause One", version: "Text version 3", status: "Carried", override: null }]);
  });
  it("states the window once, as the notice states it, in the organisation's date format", () => {
    expect(view.notice).toBe("The notice states 08 Oct 2026 – 22 Oct 2026");
  });
  it("says nothing of a window no frozen document states", () => {
    const none = JSON.parse(JSON.stringify(conditionsSnapshot([part({})], FROZEN_INPUT, { startOn: "2026-10-08", closingDay: "2026-10-22" })));
    expect(frozenConditionsView(readConditionsSnapshot(none)!, 1).notice).toBeNull();
  });
  it("takes nothing from the live configuration: the view is a function of the snapshot alone", () => {
    // Everything configuration could since have changed is absent from the signature; changing a copy of the live input changes nothing.
    const later: ConditionsInput = { ...FROZEN_INPUT, restriction: { restricted: false, label: "Another question", stamp: { EN: null, MS: null } }, permit: { regulated: null, permitCode: null, list: null }, clauses: { clauses: [], overrides: [] }, assurance: { required: null, confirmations: [] } };
    expect(later.restriction.label).not.toBe(view.restriction.question);
    expect(frozenConditionsView(readConditionsSnapshot(stored)!, 2)).toEqual(view);
  });
  it("records an unanswered restriction and a permit not chosen as not set, never as no", () => {
    const s = JSON.parse(JSON.stringify(conditionsSnapshot([part({})], { ...FROZEN_INPUT, restriction: { ...FROZEN_INPUT.restriction, restricted: null }, permit: { regulated: true, permitCode: null, list: null } }, null)));
    const v = frozenConditionsView(readConditionsSnapshot(s)!, 1);
    expect(v.restriction.answer).toBe("Not set");
    expect(v.permit.type).toBe("Not set");
  });
  it("an endorsed clause reads as left out, with who and why", () => {
    const s = JSON.parse(JSON.stringify(conditionsSnapshot([part({})], { ...FROZEN_INPUT, clauses: { ...FROZEN_INPUT.clauses, overrides: [{ clauseCode: "cl", clauseTitle: "Clause One", personName: "Lim", reason: "Counsel advised" }] } }, null)));
    expect(frozenConditionsView(readConditionsSnapshot(s)!, 1).clauses[0]).toMatchObject({ status: "Left out under an endorsement", override: expect.stringContaining("Counsel advised") });
  });
  it("assurance not required is the organisation's decision and lists no confirmation", () => {
    const s = JSON.parse(JSON.stringify(conditionsSnapshot([part({})], { ...FROZEN_INPUT, assurance: { required: false, confirmations: [] } }, null)));
    const v = frozenConditionsView(readConditionsSnapshot(s)!, 1);
    // `policy` is the raw answer the screen hides the card by (founder, 2026-10-05: no card where the policy is No).
    expect(v.assurance).toEqual({ required: "Not required (the organisation's decision)", policy: "no", rows: [] });
  });
  it("a pack frozen before the snapshot existed has none to read", () => {
    expect(readConditionsSnapshot(null)).toBeNull();
    expect(readConditionsSnapshot({})).toBeNull();
  });
});

describe("groupHeadings", () => {
  it("names the first group 'Required' when it has one member and 'One of these' when it has alternatives", () => {
    expect(groupHeadings([{ alternativeGroup: 1 }], () => 0)[0].heading).toBe("Required");
    expect(groupHeadings([{ alternativeGroup: 1 }, { alternativeGroup: 1 }], () => 0)[0].heading).toBe("One of these");
    expect(groupHeadings([{ alternativeGroup: 1 }, { alternativeGroup: 2 }, { alternativeGroup: 2 }], () => 0).map((g) => g.heading)).toEqual(["Required", "And one of these"]);
  });
});

describe("the reader builds a frozen pack's cards before it reads any live finding (source scan)", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/tender-docs/read-conditions.ts"), "utf8");
  const branch = src.slice(src.indexOf("if (frozenPack) {"), src.indexOf("const [policy, bodies, requirements, clauses, people]"));
  it("returns from the frozen branch, naming no finder, no live clause and no configured body", () => {
    expect(branch.length).toBeGreaterThan(100);
    expect(branch).toContain("frozenConditionsView(");
    expect(branch).not.toMatch(/Faults\(|liveClauses|loadClauses|loadRegistrationBodies|conditionsFaultText|words\(/);
    expect(src.indexOf("if (frozenPack) {")).toBeLessThan(src.indexOf("eligibilityFaults("));
  });
  it("a pack frozen without a snapshot reads the exercise's own answers and the callout, with no finding", () => {
    expect(branch).toContain("BEFORE_CONDITIONS_TEXT");
    expect(branch).not.toMatch(/findings/);
  });
});
