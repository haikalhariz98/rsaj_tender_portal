import { describe, expect, it } from "vitest";

import { audienceFaults, commentAudience, DEFAULT_AUDIENCE, filesWith, portalSeesFile, removeFileFaults } from "./audience";
import { CONTRACTOR, person } from "./party";
import type { Audience, WorkActor } from "./types";

/** Who sees a comment or a file (3b B-2, B-3, B-6; WB-3, WB-4, WB-9): chosen when written, never re-read; a file by when it was attached. */

const SHARED = "2026-11-01T02:00:00.000Z";
const at = (iso: string) => new Date(iso);
const staffHeld = { sharedAt: SHARED, assignee: person("aisyah") };
const contractorHeld = { sharedAt: SHARED, assignee: CONTRACTOR };

describe("commentAudience", () => {
  it("unshared: internal, whatever is chosen", () => {
    for (const choice of ["REPLY", "INTERNAL", null] as (Audience | null)[]) {
      expect(commentAudience({ sharedAt: null, assignee: null }, "STAFF", choice, "COMMENT")).toBe("INTERNAL");
      expect(commentAudience({ sharedAt: null, assignee: null }, "STAFF", choice, "SEND_BACK")).toBe("INTERNAL");
    }
  });
  it("shared: staff's choice; the composer presets Reply (0008 §4.5, WB-9) but a post with no choice is Internal on the server (WSEC-1)", () => {
    expect(DEFAULT_AUDIENCE).toBe("REPLY");
    expect(commentAudience(staffHeld, "STAFF", "INTERNAL", "COMMENT")).toBe("INTERNAL");
    expect(commentAudience(staffHeld, "STAFF", "REPLY", "COMMENT")).toBe("REPLY");
    expect(commentAudience(staffHeld, "STAFF", null, "COMMENT")).toBe("INTERNAL");
    expect(commentAudience(contractorHeld, "STAFF", null, "COMMENT")).toBe("INTERNAL");
  });
  it("the contractor: always a Reply", () => {
    expect(commentAudience(contractorHeld, "CONTRACTOR", "INTERNAL", "COMMENT")).toBe("REPLY");
    expect(commentAudience(staffHeld, "CONTRACTOR", null, "COMMENT")).toBe("REPLY");
  });
  it("Send back: a Reply when the contractor holds it, else internal, whatever is chosen", () => {
    expect(commentAudience(contractorHeld, "STAFF", "INTERNAL", "SEND_BACK")).toBe("REPLY");
    expect(commentAudience(staffHeld, "STAFF", "REPLY", "SEND_BACK")).toBe("INTERNAL");
  });
});

describe("audienceFaults: a Reply needs the item shared by the comment's instant (PA056)", () => {
  it("shared at the same instant is shared; one millisecond later is not", () => {
    expect(audienceFaults(SHARED, "REPLY", at(SHARED))).toEqual([]);
    expect(audienceFaults(SHARED, "REPLY", at("2026-11-01T01:59:59.999Z"))).toEqual([{ code: "NOT_SHARED" }]);
    expect(audienceFaults(SHARED, "REPLY", at("2026-11-05T00:00:00.000Z"))).toEqual([]);
  });
  it("unshared refuses a Reply; an internal note is never refused for it", () => {
    expect(audienceFaults(null, "REPLY", at(SHARED))).toEqual([{ code: "NOT_SHARED" }]);
    expect(audienceFaults(null, "INTERNAL", at(SHARED))).toEqual([]);
    expect(audienceFaults(SHARED, "INTERNAL", at("2020-01-01T00:00:00.000Z"))).toEqual([]);
  });
});

describe("files", () => {
  it("the composer offers files on a shared item only with Reply (B-3)", () => {
    expect([filesWith(null, "INTERNAL"), filesWith(SHARED, "REPLY"), filesWith(SHARED, "INTERNAL")]).toEqual([true, true, false]);
  });
  it("the portal sees a file attached at or after sharing, never one before (WB-3)", () => {
    expect(portalSeesFile({ attachedAt: at(SHARED), byContractor: false }, SHARED)).toBe(true);
    expect(portalSeesFile({ attachedAt: at("2026-11-01T02:00:00.001Z"), byContractor: false }, SHARED)).toBe(true);
    expect(portalSeesFile({ attachedAt: at("2026-11-01T01:59:59.999Z"), byContractor: false }, SHARED)).toBe(false);
    expect(portalSeesFile({ attachedAt: at("2026-11-01T01:59:59.999Z"), byContractor: false }, at(SHARED))).toBe(false);
  });
  it("the contractor's own file is seen; nothing on an unshared item is", () => {
    expect(portalSeesFile({ attachedAt: at("2020-01-01T00:00:00.000Z"), byContractor: true }, SHARED)).toBe(true);
    expect(portalSeesFile({ attachedAt: at(SHARED), byContractor: true }, null)).toBe(false);
    expect(portalSeesFile({ attachedAt: at(SHARED), byContractor: false }, null)).toBe(false);
  });
});

describe("removeFileFaults (B-6, WB-4)", () => {
  const staff = (personId: string): WorkActor => ({ side: "STAFF", personId, leadIds: ["nurul"], mayReadContract: true });
  const whoCan = { en: "Only Aisyah, who added it, or the S.O. (Nurul) can remove this." };
  const open = { sharedAt: null, status: "IN_PROGRESS" as const };

  it("never on a shared item, whoever asks", () => {
    for (const p of ["aisyah", "nurul"]) expect(removeFileFaults({ ...open, sharedAt: SHARED }, staff(p), "aisyah", "Wrong drawing", whoCan)).toEqual([{ code: "FILE_ON_SHARED_ITEM" }]);
  });
  it("on an unshared item: who attached it, or the lead, with a reason", () => {
    expect(removeFileFaults(open, staff("aisyah"), "aisyah", "Wrong drawing", whoCan)).toEqual([]);
    expect(removeFileFaults(open, staff("nurul"), "aisyah", "Wrong drawing", whoCan)).toEqual([]);
    expect(removeFileFaults(open, staff("hafiz"), "aisyah", " ", whoCan)).toEqual([{ code: "NOT_EDITABLE", whoCan }, { code: "REASON_NEEDED" }]);
  });
  it("a closed item is reopened first; the contractor never removes", () => {
    expect(removeFileFaults({ ...open, status: "DONE" }, staff("aisyah"), "aisyah", "x", whoCan)).toEqual([{ code: "CLOSED_ITEM" }]);
    expect(removeFileFaults(open, { side: "CONTRACTOR", personId: null, leadIds: [], mayReadContract: true }, null, "x", whoCan)).toEqual([{ code: "NOT_EDITABLE", whoCan }]);
  });
});
