import { describe, expect, it } from "vitest";

import { detachFault, reliedOn, reliedOnAttachment } from "./attach";
import { documentFaultText } from "./labels";
import { contractFacts } from "./owner-facts";

/**
 * 6.12 review (flagged against the accepted document store): the legal office's comments a return was
 * recorded on are what the return stands on, and are replaced by a new version, never simply taken off.
 * 6.12 re-review S-2: by document, not by version, so the replacement attachNewVersion makes (attached now,
 * after the decision) is protected as its predecessor was; and, as everywhere in reliedOn, only the last
 * live one is relied on: of two live attachments of the same comments, one may come off.
 */

const sent = new Date("2026-09-20T02:00:00Z");
const decided = new Date("2026-09-22T06:00:00Z");
type Att = { purpose: string; versionId: string; attachedAt: Date; detachedAt: Date | null; version: { documentId: string; withdrawnAt: Date | null } };
const att = (versionId: string, documentId: string, attachedAt: Date, detachedAt: Date | null = null, purpose = "LEGAL_COMMENTS"): Att => ({ purpose, versionId, attachedAt, detachedAt, version: { documentId, withdrawnAt: null } });
const facts = (attachments: Att[], decision: "RETURNED" | "ENDORSED" | null = "RETURNED") =>
  contractFacts({ status: decision ? "RETURNED_FOR_AMENDMENT" : "PENDING_LEGAL_ENDORSEMENT", signatures: [], legalReviews: [{ decision, submittedAt: sent, decidedAt: decision ? decided : null }], attachments });
const during = new Date("2026-09-21T03:00:00Z");
const after = new Date("2026-09-23T00:00:00Z");

describe("the legal office's comments a return was recorded on", () => {
  it("attached while the review was open, returned on: relied on", () => {
    const f = facts([att("v1", "d-comments", during), att("v-sent", "d-sent", new Date("2026-09-19T02:00:00Z"), null, "LEGAL_SUBMISSION")]);
    expect(reliedOn("LEGAL_COMMENTS", f, 1, "v1")).toBe("RETURNED_ON_IT");
    // Other comments live beside it do not release it: the return stands on this document.
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d-comments", during), att("v9", "d-other", after)]), 2, "v1")).toBe("RETURNED_ON_IT");
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d-comments", during), att("v9", "d-other", after)]), 2, "v9")).toBeNull();
  });
  it("cannot be detached afterwards; the refusal says to attach a new version", () => {
    const f = facts([att("v1", "d-comments", during)]);
    const by = reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("LEGAL_COMMENTS", f, 1, "v1"));
    const fs = detachFault({ purpose: "LEGAL_COMMENTS", owner: f, reason: "Wrong file", reliedOn: by });
    expect(fs.map((x) => x.code)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(fs[0])).toBe("Return recorded on these comments. Attach a new version, with a reason.");
  });
  it("S-2: the replacement attachNewVersion makes (now, after the decision) descends from it and is protected too", () => {
    // The predecessor was closed by the repin; the replacement is version 2 of the same document, attached after the decision.
    const f = facts([att("v1", "d-comments", during, after), att("v2", "d-comments", after)]);
    expect(reliedOn("LEGAL_COMMENTS", f, 1, "v2")).toBe("RETURNED_ON_IT");
  });
  it("S-2: of two live attachments of the same version, one may come off and the last may not", () => {
    const two = facts([att("v1", "d-comments", during), att("v1", "d-comments", after)]);
    expect(reliedOn("LEGAL_COMMENTS", two, 2, "v1")).toBeNull();
    const one = facts([att("v1", "d-comments", during), att("v1", "d-comments", after, new Date("2026-09-24T00:00:00Z"))]);
    expect(reliedOn("LEGAL_COMMENTS", one, 1, "v1")).toBe("RETURNED_ON_IT");
  });
  it("comments attached only after the decision, or before the sending: not relied on", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d-comments", after)]), 1, "v1")).toBeNull();
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d-comments", new Date("2026-09-19T00:00:00Z"))]), 1, "v1")).toBeNull();
  });
  it("on the edges: attached at the sending or at the decision's instant counts", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", sent)]), 1, "v1")).toBe("RETURNED_ON_IT");
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", decided)]), 1, "v1")).toBe("RETURNED_ON_IT");
  });
  it("an endorsement does not stand on comments; nor does a review still open", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", during)], "ENDORSED"), 1, "v1")).toBeNull();
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", during)], null), 1, "v1")).toBeNull();
  });
  it("asked without a version, it fails safe while any comments a return stands on are live", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", during)]), 1)).toBe("RETURNED_ON_IT");
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", during, after)]), 0)).toBeNull();
    expect(reliedOn("LEGAL_COMMENTS", facts([att("v1", "d", after)]), 1)).toBeNull();
  });
  it("other purposes on the contract are unchanged", () => {
    expect(reliedOn("LEGAL_SUBMISSION", facts([att("v1", "d", during)]), 1, "v-sent")).toBeNull();
  });
});
