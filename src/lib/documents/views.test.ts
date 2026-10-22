import { describe, expect, it } from "vitest";

import { APPLICANT_WORDS, SUPPLIER_UPLOADER_WORDS } from "./labels";
import { recorderWords, slotAct, slotStatus } from "./views";

describe("slotStatus", () => {
  it("a required open slot with nothing attached is outstanding", () => {
    expect(slotStatus({ state: "OPEN", live: 0, required: true })).toEqual({ text: "Outstanding", tone: "warn" });
  });
  it("the owner may say what an empty open slot is waiting for instead", () => {
    const waiting = { text: "Waiting for the paper copy", tone: "neutral" as const };
    expect(slotStatus({ state: "OPEN", live: 0, required: true }, waiting)).toEqual(waiting);
  });
  it("what is attached always wins over what the owner says while empty", () => {
    expect(slotStatus({ state: "OPEN", live: 1, required: true }, { text: "Waiting", tone: "neutral" })).toEqual({ text: "Attached", tone: "ok" });
  });
  it("a closed slot is closed whatever the owner says", () => {
    expect(slotStatus({ state: "FROZEN", live: 0, required: true }, { text: "Waiting", tone: "neutral" }).text).toBe("Closed");
  });
});

describe("slotAct", () => {
  it("offers Upload while a slot is empty", () => {
    expect(slotAct("SIGNED_MINUTES", 0)).toBe("UPLOAD");
    expect(slotAct("DOSSIER_EVIDENCE", 0)).toBe("UPLOAD");
  });
  it("offers a new version where the slot holds one document, once it holds it", () => {
    for (const p of ["SIGNED_MINUTES", "SIGNED_LETTER", "DECLARATION", "AUTHORISATION", "ACCEPTANCE_PAGE", "HOLDER_RECOMMENDATION"] as const) expect(slotAct(p, 1)).toBe("NEW_VERSION");
  });
  it("offers another where the slot holds several", () => {
    expect(slotAct("DOSSIER_EVIDENCE", 1)).toBe("ADD_ANOTHER");
    expect(slotAct("COORDINATION_SCOPE", 2)).toBe("ADD_ANOTHER");
  });
});

describe("who recorded a version that names no person (ADR 0041 D3, plan 6.3.1)", () => {
  it("an applicant who was not signed in is never called the supplier's own portal account, nor the other way round", () => {
    expect(recorderWords({ recordedByPortalApplicationId: "pa1" })).toBe(APPLICANT_WORDS);
    expect(APPLICANT_WORDS).toBe("Applicant, not signed in");
    expect(recorderWords({ recordedByPortalApplicationId: null })).toBe(SUPPLIER_UPLOADER_WORDS);
    expect(recorderWords({})).toBe(SUPPLIER_UPLOADER_WORDS);
  });
});
