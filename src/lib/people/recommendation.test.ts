import { describe, expect, it } from "vitest";

import { faultsIn, type Delegation } from "./delegation";
import { NO_END_DATE, recommendationLabel, recommendationNote } from "./labels";
import { legacyEndedBy, recommendationStanding, standsOnTextBeforeAttachments, type DelegationTerms, type RecommendationFacts } from "./recommendation";

/**
 * Ruled 2026-10-01: the delegation legacy mark is a stored fact
 * (`recommendationTextOnlyAtLanding`, set by the migration, never by the application),
 * read by the label and by saveDelegation instead of guessing from the text.
 */

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TEXT = "Recommended by the Section Head in her email of 25 September, before her leave.";

const facts = (x: Partial<RecommendationFacts> = {}): RecommendationFacts => ({ holderRecommendation: TEXT, recommendationTextOnlyAtLanding: false, liveAttachments: 0, everAttachments: 0, ...x });
const terms = (x: Partial<DelegationTerms> = {}): DelegationTerms => ({ fromPersonId: "p5", roleCode: "SEC_PRE", toPersonId: "p4", effectiveFrom: d("2026-09-28"), effectiveTo: d("2026-10-16"), capabilityCodes: ["run_sourcing", "approve_po"], ...x });
const legacy = (x: Partial<RecommendationFacts & DelegationTerms> = {}) => ({ ...facts({ recommendationTextOnlyAtLanding: true }), ...terms(), ...x });

describe("how a delegation's recommendation stands", () => {
  it("attached, when a live one stands — whatever the mark says", () => {
    expect(recommendationStanding(facts({ liveAttachments: 1, everAttachments: 1 }))).toBe("ATTACHED");
    expect(recommendationStanding(facts({ recommendationTextOnlyAtLanding: true, liveAttachments: 1, everAttachments: 1 }))).toBe("ATTACHED");
  });
  it("no longer attached, when one was and none stands (detached, or its version withdrawn)", () => {
    expect(recommendationStanding(facts({ everAttachments: 1 }))).toBe("NO_LONGER_ATTACHED");
    // A legacy delegation that was given a scan and lost it reads the same: it was attached.
    expect(recommendationStanding(facts({ recommendationTextOnlyAtLanding: true, everAttachments: 2 }))).toBe("NO_LONGER_ATTACHED");
  });
  it("text before attachments only where the stored mark says so — never guessed from the text", () => {
    expect(recommendationStanding(facts({ recommendationTextOnlyAtLanding: true }))).toBe("TEXT_BEFORE_ATTACHMENTS");
    expect(recommendationStanding(facts({ recommendationTextOnlyAtLanding: false }))).toBe("TEXT_ONLY");
    expect(recommendationStanding(facts({ recommendationTextOnlyAtLanding: undefined }))).toBe("TEXT_ONLY");
  });
  it("none, with no text and nothing ever attached", () => {
    expect(recommendationStanding(facts({ holderRecommendation: "  " }))).toBe("NONE");
    expect(recommendationStanding(facts({ holderRecommendation: null }))).toBe("NONE");
  });
});

describe("the label (src/lib/people/labels.ts)", () => {
  it("reads attached, no longer attached, text before attachments, or not attached", () => {
    expect(recommendationLabel({ holderRecommendation: TEXT, recommendationAttached: true })).toBe("signed recommendation attached");
    expect(recommendationLabel({ holderRecommendation: TEXT, recommendationAttached: false, recommendationEverAttached: true })).toBe("signed recommendation no longer attached");
    expect(recommendationLabel({ holderRecommendation: TEXT, recommendationTextOnlyAtLanding: true, effectiveTo: d("2026-10-16") })).toBe("recorded as text before attachments existed");
    expect(recommendationLabel({ holderRecommendation: TEXT })).toBe("signed recommendation not attached");
    expect(recommendationLabel({ holderRecommendation: "" })).toBeNull();
  });
  it("text alone no longer reads as recorded before attachments", () => {
    expect(recommendationLabel({ holderRecommendation: TEXT, recommendationTextOnlyAtLanding: false })).not.toMatch(/before attachments/);
  });
  it("a legacy delegation with no end date says so beside its label", () => {
    expect(recommendationLabel({ holderRecommendation: TEXT, recommendationTextOnlyAtLanding: true, effectiveTo: null })).toBe(`recorded as text before attachments existed · ${NO_END_DATE}`);
    expect(NO_END_DATE).toBe("no end date");
    // Only the legacy label carries it: an attached one is judged on its attachment.
    expect(recommendationLabel({ holderRecommendation: TEXT, recommendationTextOnlyAtLanding: true, recommendationAttached: true, effectiveTo: null })).toBe("signed recommendation attached");
  });
});

describe("which edits end legacy standing", () => {
  it("the end date: same or earlier stands, one day later ends", () => {
    expect(legacyEndedBy(terms(), terms())).toEqual([]);
    expect(legacyEndedBy(terms(), terms({ effectiveTo: d("2026-10-15") }))).toEqual([]);
    expect(legacyEndedBy(terms(), terms({ effectiveTo: d("2026-10-17") }))).toEqual(["END_MOVED_LATER"]);
  });
  it("opening the end ends it; closing an open end does not", () => {
    expect(legacyEndedBy(terms(), terms({ effectiveTo: null }))).toEqual(["END_OPENED"]);
    expect(legacyEndedBy(terms({ effectiveTo: null }), terms())).toEqual([]);
    expect(legacyEndedBy(terms({ effectiveTo: null }), terms({ effectiveTo: null }))).toEqual([]);
  });
  it("a different delegate ends it", () => {
    expect(legacyEndedBy(terms(), terms({ toPersonId: "p9" }))).toEqual(["DELEGATE_CHANGED"]);
  });
  // Review must-fix 2 (FR-APR-012): the recommendation comes from the absent holder of that
  // office, so text recorded for one grantor or office does not carry over to another.
  it("a different grantor ends it", () => {
    expect(legacyEndedBy(terms(), terms({ fromPersonId: "p8" }))).toEqual(["GRANTOR_CHANGED"]);
  });
  it("a different office ends it", () => {
    expect(legacyEndedBy(terms(), terms({ roleCode: "HOD_ENG" }))).toEqual(["OFFICE_CHANGED"]);
  });
  it("the start date: same or later stands, one day earlier ends", () => {
    expect(legacyEndedBy(terms(), terms({ effectiveFrom: d("2026-09-28") }))).toEqual([]);
    expect(legacyEndedBy(terms(), terms({ effectiveFrom: d("2026-09-29") }))).toEqual([]);
    expect(legacyEndedBy(terms(), terms({ effectiveFrom: d("2026-09-27") }))).toEqual(["START_MOVED_EARLIER"]);
  });
  it("capabilities: adding one or handing over the whole office ends it; removing one or narrowing the whole office does not", () => {
    expect(legacyEndedBy(terms(), terms({ capabilityCodes: ["run_sourcing", "approve_po", "sign_loa"] }))).toEqual(["CAPABILITIES_WIDENED"]);
    expect(legacyEndedBy(terms(), terms({ capabilityCodes: ["run_sourcing", "sign_loa"] }))).toEqual(["CAPABILITIES_WIDENED"]);
    expect(legacyEndedBy(terms(), terms({ capabilityCodes: [] }))).toEqual(["CAPABILITIES_WIDENED"]);
    expect(legacyEndedBy(terms(), terms({ capabilityCodes: ["run_sourcing"] }))).toEqual([]);
    expect(legacyEndedBy(terms({ capabilityCodes: [] }), terms({ capabilityCodes: ["run_sourcing"] }))).toEqual([]);
    expect(legacyEndedBy(terms({ capabilityCodes: [] }), terms({ capabilityCodes: [] }))).toEqual([]);
    // Order does not matter.
    expect(legacyEndedBy(terms(), terms({ capabilityCodes: ["approve_po", "run_sourcing"] }))).toEqual([]);
  });
  it("several at once are all named", () => {
    expect(legacyEndedBy(terms(), terms({ effectiveTo: null, toPersonId: "p9", capabilityCodes: [] }))).toEqual(["END_OPENED", "DELEGATE_CHANGED", "CAPABILITIES_WIDENED"]);
    expect(legacyEndedBy(terms(), terms({ effectiveFrom: d("2026-09-01"), fromPersonId: "p8", roleCode: "HOD_ENG" }))).toEqual(["START_MOVED_EARLIER", "GRANTOR_CHANGED", "OFFICE_CHANGED"]);
  });
});

describe("standing on text before attachments", () => {
  it("a marked delegation, never given an attachment, edited within its terms, stands", () => {
    expect(standsOnTextBeforeAttachments(legacy(), terms())).toBe(true);
    expect(standsOnTextBeforeAttachments(legacy(), terms({ effectiveTo: d("2026-10-10") }))).toBe(true);
  });
  it("not marked, it does not — however much text it has", () => {
    expect(standsOnTextBeforeAttachments(legacy({ recommendationTextOnlyAtLanding: false }), terms())).toBe(false);
  });
  it("a new delegation never does", () => {
    expect(standsOnTextBeforeAttachments(null, terms())).toBe(false);
  });
  it("one that lost its recommendation does not: it stood on the attachment since", () => {
    expect(standsOnTextBeforeAttachments(legacy({ everAttachments: 1 }), terms())).toBe(false);
  });
  it("an extension, an opened end, a new delegate or wider capabilities end it", () => {
    for (const t of [terms({ effectiveTo: d("2026-10-17") }), terms({ effectiveTo: null }), terms({ toPersonId: "p9" }), terms({ capabilityCodes: [] })]) {
      expect(standsOnTextBeforeAttachments(legacy(), t)).toBe(false);
    }
  });
  it("an earlier start, a new grantor or a new office end it", () => {
    for (const t of [terms({ effectiveFrom: d("2026-09-27") }), terms({ fromPersonId: "p8" }), terms({ roleCode: "HOD_ENG" })]) {
      expect(standsOnTextBeforeAttachments(legacy(), t)).toBe(false);
    }
  });
});

describe("with faultsIn: the attachment is required once legacy standing ends (OD-6)", () => {
  const base: Delegation = {
    id: "dg3", fromPersonId: "p5", toPersonId: "p4", roleCode: "SEC_PRE", capabilityCodes: ["run_sourcing", "approve_po"], valueCeiling: null,
    reason: "Medical leave", reasonMs: "", noSubDelegation: true, effectiveFrom: d("2026-09-28"), effectiveTo: d("2026-10-16"), holderRecommendation: TEXT,
  };
  const judge = (proposed: Delegation) =>
    faultsIn(proposed, [], ["run_sourcing", "approve_po", "sign_loa"], {
      grantorUnavailable: true,
      holderRecommendation: proposed.holderRecommendation,
      recommendationAttached: false,
      recordedBeforeAttachments: standsOnTextBeforeAttachments(legacy(), proposed),
    });

  it("an edit within its terms stands on the text", () => {
    expect(judge({ ...base, reason: "Medical leave, extended paperwork" })).not.toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("moving the end a day later asks for the signed recommendation", () => {
    expect(judge({ ...base, effectiveTo: d("2026-10-17") })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("changing the delegate asks for it", () => {
    expect(judge({ ...base, toPersonId: "p6" })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("changing the grantor asks for it", () => {
    expect(judge({ ...base, fromPersonId: "p8" })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("changing the office asks for it", () => {
    expect(judge({ ...base, roleCode: "HOD_ENG" })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("moving the start a day earlier asks for it; a day later does not", () => {
    expect(judge({ ...base, effectiveFrom: d("2026-09-27") })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
    expect(judge({ ...base, effectiveFrom: d("2026-09-29") })).not.toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
  it("widening the capabilities asks for it", () => {
    expect(judge({ ...base, capabilityCodes: ["run_sourcing", "approve_po", "sign_loa"] })).toContain("ABSENT_GRANTOR_RECOMMENDATION_NOT_ATTACHED");
  });
});

describe("the editor's note matches the record's state", () => {
  it("only an attached recommendation offers to attach another", () => {
    expect(recommendationNote({ holderRecommendation: TEXT, recommendationAttached: true })).toBe("The recommendation on record: signed recommendation attached. Choose a file below to attach another.");
    expect(recommendationNote({ holderRecommendation: TEXT, recommendationEverAttached: true })).toBe("The recommendation on record: signed recommendation no longer attached. Choose a file below to attach it again.");
    expect(recommendationNote({ holderRecommendation: TEXT })).toBe("The recommendation on record: signed recommendation not attached. Choose a file below to attach it.");
  });
  it("a legacy one says what ends its standing on text", () => {
    const n = recommendationNote({ holderRecommendation: TEXT, recommendationTextOnlyAtLanding: true, effectiveTo: null })!;
    expect(n).toMatch(/^The recommendation on record: recorded as text before attachments existed · no end date\. It stands on its text until/);
    expect(n).toMatch(/signed recommendation is needed/);
    expect(n).toMatch(/start date is moved earlier/);
    expect(n).toMatch(/the person delegating, the role or the delegate changes/);
  });
  it("nothing on record, no note", () => {
    expect(recommendationNote({ holderRecommendation: "" })).toBeNull();
  });
});
