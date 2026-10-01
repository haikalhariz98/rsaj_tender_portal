import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { addendumFieldValues, inviteeFieldValues, issueLanguage, renderInstrument, WINDOW_FIELD_KEYS, windowFieldValues, windowWhitelist, type TemplateFacts, type WindowFieldContext } from "./fields";
import { klAt } from "./fixture";

/**
 * ADR 0008 for the window's instruments: whitelisted merge fields per instrument, values in words
 * in the template's language, the restriction's configured stamp at the head, and a template not
 * chosen or without text reported, never a default text.
 */

const ctx: WindowFieldContext = {
  organisationName: "Demo Utilities",
  exerciseReference: "SX/2026/16",
  exerciseTitle: "Pump station works",
  requirements: [{ bodyCode: "B1", bodyLabel: "Contractor board", bodyLabelMs: "Lembaga kontraktor", qualifierLabel: "Grade", qualifiers: "G4, CE01", alternativeGroup: 1, sortOrder: 0 }],
  advertisementDay: "2026-11-03",
  closingAt: klAt("2026-11-24"),
  timeZone: "Asia/Kuala_Lumpur",
  inspectionPlace: "Tender table",
  purchasePlace: "Finance counter",
  inspectionHours: "09:00 to 16:00",
  purchaseFromDay: "2026-11-04",
  purchaseCloseDay: "2026-11-20",
  fee: parseSen("250.00"),
  feePaymentMethods: "Bank draft",
  submissionPlace: "Tender box",
  events: [{ kind: "BRIEFING", startsAt: klAt("2026-11-06", "10:00"), place: "Room 2", mandatory: true, cancelled: false }],
  mandatoryPermitted: true,
};
const tpl = (over: Partial<TemplateFacts> = {}): TemplateFacts => ({ id: "t", code: "notice", nameEn: "Notice", bodyEn: "{{exercise.reference}} closes {{window.closing}}. Fee {{window.fee}}. Briefing: {{window.briefing}}. Site visit: {{window.siteVisit}}.", bodyMs: null, primaryLanguage: null, bodyVersion: 3, ...over });

describe("the values, in words", () => {
  it("in English", () => {
    const v = windowFieldValues(ctx, "EN");
    expect(v["window.closing"]).toBe("24 November 2026, 14:30");
    expect(v["window.fee"]).toBe("RM250");
    expect(v["eligibility.registration"]).toBe("Contractor board (G4, CE01)");
    expect(v["eligibility.window"]).toBe("from 3 November 2026 to 24 November 2026");
    expect(v["window.briefing"]).toBe("6 November 2026, 10:00, Room 2 (attendance is mandatory)");
    expect(v["window.siteVisit"]).toBe("None");
  });
  it("in Malay", () => {
    const v = windowFieldValues(ctx, "MS");
    expect(v["window.closing"]).toBe("24 November 2026, 14:30");
    expect(v["window.purchaseFrom"]).toBe("4 November 2026");
    expect(v["eligibility.registration"]).toBe("Lembaga kontraktor (G4, CE01)");
    expect(v["window.siteVisit"]).toBe("Tiada");
  });
  it("a mandatory answer is stated only where the policy permits mandatory attendance", () => {
    expect(windowFieldValues({ ...ctx, mandatoryPermitted: null }, "EN")["window.briefing"]).toBe("6 November 2026, 10:00, Room 2");
  });
  it("what is not known is left empty, so a render reports it missing", () => {
    const v = windowFieldValues({ ...ctx, advertisementDay: null, fee: null }, "EN");
    expect(v["window.advertisedOn"]).toBe("");
    expect(v["window.fee"]).toBe("");
    expect(v["eligibility.window"]).toBe("");
  });
});

describe("rendering an instrument", () => {
  it("renders the notice in its language", () => {
    const r = renderInstrument("NOTICE", tpl(), (l) => windowFieldValues(ctx, l), null);
    expect(r).toMatchObject({ state: "OK", language: "EN", missing: [], unknown: [] });
    expect(r.text).toBe("SX/2026/16 closes 24 November 2026, 14:30. Fee RM250. Briefing: 6 November 2026, 10:00, Room 2 (attendance is mandatory). Site visit: None.");
  });
  it("puts the restriction's configured stamp at the head; missing in the language, says so", () => {
    const r = renderInstrument("NOTICE", tpl(), (l) => windowFieldValues(ctx, l), { EN: "RESTRICTED TENDER", MS: null });
    expect(r.text!.split("\n\n")[0]).toBe("RESTRICTED TENDER");
    expect(renderInstrument("NOTICE", tpl({ bodyEn: null, bodyMs: "{{exercise.reference}}" }), (l) => windowFieldValues(ctx, l), { EN: "RESTRICTED TENDER", MS: null }).stampMissing).toBe(true);
  });
  it("a field of another instrument is unknown to this one", () => {
    const r = renderInstrument("NOTICE", tpl({ bodyEn: "Dear {{invitee.name}}" }), (l) => windowFieldValues(ctx, l), null);
    expect(r.unknown).toEqual(["invitee.name"]);
    expect(r.text).toBe("Dear [not a merge field]");
  });
  it("a letter is addressed to its invitee; an addendum names itself", () => {
    const letter = renderInstrument("INVITATION", tpl({ bodyEn: "To {{invitee.name}} ({{invitee.registrationNo}}), {{invitee.address}}" }), (l) => ({ ...windowFieldValues(ctx, l), ...inviteeFieldValues({ name: "Alpha", registrationNo: "A-1", address: "" }) }), null);
    expect(letter.missing).toEqual(["invitee.address"]);
    const add = renderInstrument("ADDENDUM", tpl({ bodyEn: "Addendum {{addendum.number}}: {{addendum.whatChanged}}" }), (l) => ({ ...windowFieldValues(ctx, l), ...addendumFieldValues({ number: 2, title: "T", whatChanged: "Drawing 4 replaced.", issuedOn: "2026-11-08" }, l) }), null);
    expect(add.text).toBe("Addendum 2: Drawing 4 replaced.");
  });
  it("no template, no text, or two languages with no primary: nothing is rendered, and why", () => {
    expect(renderInstrument("NOTICE", null, () => ({}), null).state).toBe("NOT_SET");
    expect(renderInstrument("NOTICE", tpl({ bodyEn: " ", bodyMs: null }), () => ({}), null).state).toBe("NO_TEXT");
    expect(renderInstrument("NOTICE", tpl({ bodyEn: "a", bodyMs: "b" }), () => ({}), null).state).toBe("NO_LANGUAGE");
    expect(issueLanguage({ bodyEn: "a", bodyMs: "b", primaryLanguage: "MS" })).toBe("MS");
  });
});

describe("the whitelists", () => {
  it("every instrument's own keys, and the union a template save accepts", () => {
    expect(windowWhitelist("NOTICE").has("invitee.name")).toBe(false);
    expect(windowWhitelist("INVITATION").has("invitee.name")).toBe(true);
    expect(windowWhitelist("ADDENDUM").has("addendum.whatChanged")).toBe(true);
    for (const k of ["window.closing", "invitee.address", "addendum.number", "eligibility.window"]) expect(WINDOW_FIELD_KEYS.has(k)).toBe(true);
  });
});
