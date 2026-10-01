import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { tableDocumentFaults } from "./conditions";
import { conditionsFaultText } from "./conditions-labels";
import { partFaultText } from "./labels";
import { CONFIG_STILL_UNSET, flagChanges, refreshView, unsetFlagCount } from "./refresh";

const p = (partCode: string, mandatory: boolean | null, inTableDocument: boolean | null) => ({ partCode, printedNumber: partCode.toUpperCase(), label: `Part ${partCode}`, mandatory, inTableDocument });
const c = (code: string, mandatory: boolean | null, inTableDocument: boolean | null) => ({ code, mandatory, inTableDocument });

describe("refreshing a draft's answers from the configuration (C2, BD-64-39)", () => {
  it("takes an answer the configuration now gives where the draft had none", () => {
    expect(flagChanges([p("a", null, null)], [c("a", true, false)])).toEqual([{ partCode: "a", part: "A. Part a", mandatory: { from: null, to: true }, inTableDocument: { from: null, to: false } }]);
  });
  it("never replaces an answer with 'not set'", () => {
    expect(flagChanges([p("a", true, true)], [c("a", null, null)])).toEqual([]);
  });
  it("leaves a part the configuration no longer lists, and an answer that already agrees", () => {
    expect(flagChanges([p("gone", null, null), p("same", true, false)], [c("same", true, false)])).toEqual([]);
  });
  it("lets an all-'no' Tender Table Document be put right once configuration says which parts are in it", () => {
    const parts = [p("a", true, false), p("b", true, false)];
    expect(flagChanges(parts, [c("a", true, true), c("b", true, false)]).map((x) => x.partCode)).toEqual(["a"]);
  });
  it("says what it will change in words, and that configuration is still unset when it is", () => {
    const v = refreshView([p("a", null, null)], [c("a", true, null)]);
    expect(v).toEqual({ allowed: true, changes: ["A. Part a: mandatory, not set to yes"] });
    expect(refreshView([p("a", null, null)], [c("a", null, null)])).toEqual({ allowed: false, reason: CONFIG_STILL_UNSET });
    expect(refreshView([p("a", true, true)], [c("a", true, true)])).toBeNull();
  });
  it("counts unset answers", () => {
    expect(unsetFlagCount([p("a", null, true), p("b", null, null)])).toBe(3);
  });
});

describe("the dead end is gone: the findings name the way out and the way out exists", () => {
  it("TABLE_DOCUMENT_UNSET and EMPTY, and MANDATORY_UNSET, each say to refresh from configuration under Parts", () => {
    const tableDocumentFaultText = conditionsFaultText;
    const mandatoryUnsetText = () => partFaultText({ code: "MANDATORY_UNSET", level: "block", data: { part: "1. A" } });
    const parts = [{ partCode: "a", printedNumber: "1", sortOrder: 1, label: "A", role: "OTHER", content: "STANDARD", source: "UPLOAD", mandatory: null, inTableDocument: null, templateCode: null, template: null, state: "NOT_STARTED", omittedReason: "", liveUploads: 0 }] as never;
    const [unset] = tableDocumentFaults(parts);
    expect(tableDocumentFaultText(unset)).toMatch(/Refresh from configuration/);
    expect(tableDocumentFaultText(tableDocumentFaults([{ inTableDocument: false, state: "NOT_STARTED", printedNumber: "1", label: "A" }] as never)[0])).toMatch(/Refresh from configuration/);
    expect(mandatoryUnsetText()).toMatch(/Refresh from configuration/);
  });
  it("an act exists that writes the refresh, on a draft, from the configuration, with an audit row (source scan)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/documents/actions.ts"), "utf8");
    const i = src.indexOf("export async function refreshPartFlags(");
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf("\nexport async function ", i + 10) === -1 ? undefined : src.indexOf("\nexport async function ", i + 10));
    expect(body).toMatch(/flagChanges\(/);
    expect(body).toMatch(/loadConfiguredParts\(/);
    expect(body).toMatch(/packEditFault|lockedPart|draftOf/);
    expect(body).toMatch(/audit\(/);
    expect(body).toMatch(/tenderPackPart\.update/);
  });
  it("the decision is recorded in the plan as BD-64-39", () => {
    const plan = readFileSync(join(process.cwd(), "docs/notes/plans/6.4-tender-documents.md"), "utf8");
    expect(plan).toMatch(/\| BD-64-39 \|[^\n]*Refresh from configuration/);
  });
});
