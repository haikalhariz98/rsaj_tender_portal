import { describe, expect, it } from "vitest";

import { openingFindingText } from "./labels";
import { declaredWrite, doorReason, filesToRelease, materialFinding, onlineFinaliseDoorFaults, parseEstimateFigure } from "./online-finalise";

/** The online finalise's rules (ADR 0036 D10, ruling 20t; build plan step 15). */

const ready: Parameters<typeof onlineFinaliseDoorFaults>[0] = { channel: "ONLINE", actorIsAdministrator: false, actorIsNamedOfficer: true, unsealed: true, finalised: false, cancelled: false, fileClassSet: true, fileClassSulit: true, allSigned: true, officers: 2 };
const codes = (over: Partial<typeof ready>) => onlineFinaliseDoorFaults({ ...ready, ...over }).map((f) => f.code);

describe("the doors of the online finalise", () => {
  it("a named officer at an unsealed, unfinalised online opening with the class set is clear", () => expect(codes({})).toEqual([]));
  it("an administrator is refused, and named first in the log", () => {
    expect(codes({ actorIsAdministrator: true, actorIsNamedOfficer: false })).toEqual(["ADMINISTRATOR", "NOT_NAMED_OFFICER"]);
    expect(doorReason(onlineFinaliseDoorFaults({ ...ready, actorIsAdministrator: true, actorIsNamedOfficer: false, unsealed: false }))).toBe("ADMINISTRATOR");
  });
  it("someone not named, a paper exercise, a cancelled one, one not unsealed, one finalised, and no class set are each refused", () => {
    expect(codes({ actorIsNamedOfficer: false })).toEqual(["NOT_NAMED_OFFICER"]);
    expect(codes({ channel: "PAPER" })).toEqual(["NOT_ONLINE"]);
    expect(codes({ channel: null })).toEqual(["NOT_ONLINE"]);
    expect(codes({ cancelled: true })).toEqual(["CANCELLED"]);
    expect(codes({ unsealed: false })).toEqual(["NOT_UNSEALED"]);
    expect(codes({ finalised: true })).toEqual(["ALREADY_FINALISED"]);
    expect(codes({ fileClassSet: false })).toEqual(["ONLINE_FILE_CLASS_NOT_SET"]);
    expect(codes({ fileClassSulit: false })).toEqual(["ONLINE_FILE_CLASS_NOT_SULIT"]);
    expect(codes({ allSigned: false })).toEqual(["ONLINE_NOT_ALL_SIGNED"]);
  });
  it("every refusal has words, and an unsealed opening says every named officer must authorise first, not the paper's box", () => {
    for (const over of [{ actorIsAdministrator: true }, { actorIsNamedOfficer: false }, { channel: "PAPER" }, { cancelled: true }, { unsealed: false }, { finalised: true }, { fileClassSet: false }, { fileClassSulit: false }, { allSigned: false }]) {
      for (const f of onlineFinaliseDoorFaults({ ...ready, ...over })) expect(openingFindingText(f), f.code).not.toMatch(/\b[A-Z]{3,}_[A-Z_]+\b|cannot be recorded as it stands/);
    }
    const early = onlineFinaliseDoorFaults({ ...ready, unsealed: false })[0];
    expect(openingFindingText(early)).toMatch(/All 2 named opening officers must authorise/);
    expect(openingFindingText(early)).not.toMatch(/box/);
  });
});

describe("what a failed check says", () => {
  it.each(["ONLINE_BID_NOT_FOUND", "ONLINE_GRANT_MISSING", "ONLINE_GRANT_UNREADABLE", "ONLINE_BYTES_MISSING", "ONLINE_FILE_UNREADABLE", "ONLINE_DIGEST_MISMATCH", "ONLINE_DECLARATION_UNREADABLE"] as const)("%s names the offer and says nothing was finalised, with no code", (code) => {
    const t = openingFindingText(materialFinding(code, 4));
    expect(t).toMatch(/offer 4/i);
    expect(t).toMatch(/Nothing finalised/);
    expect(t).not.toMatch(/ONLINE_/);
  });
  it("an estimate that did not open names no offer", () => expect(openingFindingText(materialFinding("ONLINE_ESTIMATE_UNREADABLE", null))).toMatch(/Nothing finalised/));
});

describe("what the finalise writes and releases", () => {
  it("the declaration is written as the decimal string it was sealed as, never a float", () => {
    expect(declaredWrite({ price: "123456.78", completionPeriod: 9, completionUnit: "MONTHS" })).toEqual({ priceAsRead: "123456.78", completionPeriod: 9, completionUnit: "MONTHS" });
  });
  it("every file of an opened offer is released once, and nothing else", () => {
    expect(filesToRelease([{ fileIds: ["a", "b"] }, { fileIds: ["b", "c"] }])).toEqual(["a", "b", "c"]);
    expect(filesToRelease([])).toEqual([]);
  });
  it("the lodged estimate's figure is a decimal amount of at most two places, as UTF-8", () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    expect(parseEstimateFigure(enc("1500000.00"))).toBe(150000000n);
    expect(parseEstimateFigure(enc("75"))).toBe(7500n);
    expect(parseEstimateFigure(enc("12.5"))).toBe(1250n);
    for (const bad of ["", "1,500", "-3", "1.234", "abc", "1e6", " 5", "5 "]) expect(parseEstimateFigure(enc(bad)), bad).toBeNull();
    expect(parseEstimateFigure(new Uint8Array([0xff, 0xfe]))).toBeNull();
  });
});
