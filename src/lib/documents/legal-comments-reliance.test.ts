import { describe, expect, it } from "vitest";

import { detachFault, reliedOn, reliedOnAttachment } from "./attach";
import { documentFaultText } from "./labels";
import { contractFacts } from "./owner-facts";

/**
 * 6.12 review (flagged against the accepted document store): the legal office's comments a return was
 * recorded on are what the return stands on. Once the contract is back for amendment they could be
 * detached, leaving a return with no comments on record. Now the comments attached while the review was
 * open (from its sending to its decision) are relied on by that return: replaced by a new version, never
 * simply taken off. Comments attached at another time, or an endorsement's, are not.
 */

const sent = new Date("2026-09-20T02:00:00Z");
const decided = new Date("2026-09-22T06:00:00Z");
const facts = (attachedAt: Date, decision: "RETURNED" | "ENDORSED" = "RETURNED") =>
  contractFacts({
    status: "RETURNED_FOR_AMENDMENT",
    signatures: [],
    legalReviews: [{ decision, submittedAt: sent, decidedAt: decided }],
    attachments: [
      { purpose: "LEGAL_COMMENTS", versionId: "v-comments", attachedAt },
      { purpose: "LEGAL_SUBMISSION", versionId: "v-sent", attachedAt: new Date("2026-09-19T02:00:00Z") },
    ],
  });

describe("the legal office's comments a return was recorded on", () => {
  it("attached while the review was open, returned on: relied on, by its version", () => {
    const f = facts(new Date("2026-09-21T03:00:00Z"));
    expect(reliedOn("LEGAL_COMMENTS", f, 1, "v-comments")).toBe("RETURNED_ON_IT");
    // Even with a second live copy: the return stands on this version, not on whichever is last.
    expect(reliedOn("LEGAL_COMMENTS", f, 2, "v-comments")).toBe("RETURNED_ON_IT");
    expect(reliedOn("LEGAL_COMMENTS", f, 2, "v-other")).toBeNull();
  });
  it("cannot be detached afterwards; the refusal says to attach a new version", () => {
    const f = facts(new Date("2026-09-21T03:00:00Z"));
    const by = reliedOnAttachment({ detachedAt: null, version: { withdrawnAt: null } }, () => reliedOn("LEGAL_COMMENTS", f, 1, "v-comments"));
    const fs = detachFault({ purpose: "LEGAL_COMMENTS", owner: f, reason: "Wrong file", reliedOn: by });
    expect(fs.map((x) => x.code)).toEqual(["RELIED_ON"]);
    expect(documentFaultText(fs[0])).toBe("The legal office's return was recorded on these comments, so they are not taken off. To correct them, attach a new version, with the reason.");
  });
  it("attached after the decision, or before the sending: not relied on", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts(new Date("2026-09-23T00:00:00Z")), 1, "v-comments")).toBeNull();
    expect(reliedOn("LEGAL_COMMENTS", facts(new Date("2026-09-19T00:00:00Z")), 1, "v-comments")).toBeNull();
  });
  it("on the edges: attached at the sending or at the decision's instant counts", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts(sent), 1, "v-comments")).toBe("RETURNED_ON_IT");
    expect(reliedOn("LEGAL_COMMENTS", facts(decided), 1, "v-comments")).toBe("RETURNED_ON_IT");
  });
  it("an endorsement does not stand on comments; nor does a review still open", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts(new Date("2026-09-21T03:00:00Z"), "ENDORSED"), 1, "v-comments")).toBeNull();
    const open = contractFacts({ status: "PENDING_LEGAL_ENDORSEMENT", signatures: [], legalReviews: [{ decision: null, submittedAt: sent, decidedAt: null }], attachments: [{ purpose: "LEGAL_COMMENTS", versionId: "v-comments", attachedAt: new Date("2026-09-21T03:00:00Z") }] });
    expect(reliedOn("LEGAL_COMMENTS", open, 1, "v-comments")).toBeNull();
  });
  it("asked without a version, it fails safe while any comments a return stands on exist", () => {
    expect(reliedOn("LEGAL_COMMENTS", facts(new Date("2026-09-21T03:00:00Z")), 1)).toBe("RETURNED_ON_IT");
    expect(reliedOn("LEGAL_COMMENTS", facts(new Date("2026-09-23T00:00:00Z")), 1)).toBeNull();
  });
  it("other purposes on the contract are unchanged", () => {
    expect(reliedOn("LEGAL_SUBMISSION", facts(new Date("2026-09-21T03:00:00Z")), 1, "v-sent")).toBeNull();
  });
});
