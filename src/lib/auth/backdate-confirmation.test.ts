import { describe, expect, it } from "vitest";

import { attributionLabel } from "./attribution";
import { backdateToConfirmNotice, confirmationFaults, confirmRefusal, type BackdatedAttribution } from "./backdate-confirmation";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/**
 * The named authoriser's confirmation of a back-dated signature (NFR-AUD-006, ruling item 9 of the Phase 2 rulings, Phase 5a). Pure.
 */

const attribution = (over: Partial<BackdatedAttribution> = {}): BackdatedAttribution => ({ id: "a1", authorisedByPersonId: "boss", effectiveOn: "2026-09-30", alreadyConfirmed: false, ...over });
const codes = (a: BackdatedAttribution | null, who: string) => confirmationFaults(a, who).map((f) => f.code);

describe("who may confirm a back-dating", () => {
  it("is the person named as authorising it, once", () => {
    expect(codes(attribution(), "boss")).toEqual([]);
    expect(codes(attribution({ alreadyConfirmed: true }), "boss")).toEqual(["ALREADY_CONFIRMED"]);
  });

  it("is no one else: not the signer, not another officer, whoever they are", () => {
    for (const who of ["signer", "another", "an-administrator"]) expect(codes(attribution(), who)).toEqual(["NOT_THE_AUTHORISER"]);
  });

  it("is refused for an act that was not back-dated, or that names no one, or that is not there, and says so in both languages", () => {
    expect(codes(attribution({ effectiveOn: null }), "boss")).toEqual(["NOT_BACKDATED"]);
    expect(codes(attribution({ authorisedByPersonId: null }), "boss")).toEqual(["NOT_BACKDATED"]);
    expect(codes(null, "boss")).toEqual(["NOT_BACKDATED"]);
    for (const f of [...confirmationFaults(null, "x"), ...confirmationFaults(attribution(), "x"), ...confirmationFaults(attribution({ alreadyConfirmed: true }), "boss")]) {
      expect(f.en.length).toBeGreaterThan(20);
    }
  });
});

describe("confirmRefusal: the one check the confirm page and the action both ask (ruling on log line 2027(1))", () => {
  const refusal = (who: string, isAdministrator = false, a: BackdatedAttribution | null = attribution()) => confirmRefusal(a, { personId: who, isAdministrator });

  it("refuses the signer, another officer and an administrator account, in words, and nobody else", () => {
    expect(refusal("signer")).toMatch(/Only the person the signer named/);
    expect(refusal("another")).toMatch(/Only the person the signer named/);
    expect(refusal("boss", true)).toMatch(/administration is kept apart/);
    expect(refusal("boss")).toBeNull();
  });

  it("refuses an administrator account even when it is the person named, so the page shows no password field to it", () => {
    expect(refusal("boss", true)).not.toBeNull();
  });

  it("refuses a back-dating already confirmed, and one that is not there", () => {
    expect(refusal("boss", false, attribution({ alreadyConfirmed: true }))).toMatch(/already confirmed/);
    expect(refusal("boss", false, null)).toMatch(/nothing to confirm/);
  });
});

describe("the notice that asks for it", () => {
  const base = { attributionId: "a1", authorisedByPersonId: "boss", signerName: "Aini", whatWords: "Decided by", effectiveOn: "2026-09-30", recordedOn: "2026-10-09", reason: "The meeting was on the 30th", by: "signer" };

  it("goes to the person named, once, with the two days and the reason, and opens the page that confirms", () => {
    const [n] = backdateToConfirmNotice(base);
    expect(n).toMatchObject({ recipientPersonId: "boss", kind: "BACKDATE_TO_CONFIRM", subjectEntity: "ActAttribution", subjectId: "a1", occurrence: "", exerciseId: null, href: "/inbox/a1" });
    expect(n.title).toBe("Aini names you as authorising a back-dated signature");
    expect(n.body).toContain("2026-09-30");
    expect(n.body).toContain("2026-10-09");
    expect(n.body).toContain("The meeting was on the 30th");
  });

  it("says nothing of an amount and shows no code", () => {
    const [n] = backdateToConfirmNotice(base);
    expect(`${n.title} ${n.body}`).not.toMatch(/RM\s?\d|[A-Z]{2,}_[A-Z_]+/);
  });

  it("is not raised to the person who did the act", () => {
    expect(backdateToConfirmNotice({ ...base, by: "boss" })).toEqual([]);
  });
});

describe("how a back-dated signature reads", () => {
  const read = (backdateConfirmedOn: string | null) =>
    attributionLabel({ row: { mode: "SIGNED", recordedBySystemLabel: null, effectiveOn: "2026-09-30", backdateAuthorisedByName: "Boss", backdateConfirmedOn }, subjectName: "Aini", recorderName: "Aini", auditAttributed: true });

  it("reads as the signer's claim, not confirmed, until the person named confirms it", () => {
    expect(read(null).en).toBe("Signed by Aini, dated 2026-09-30 (back-dated; the signer names Boss as authorising it, not confirmed)");
  });

  it("reads as confirmed, by whom and on which day, once they have", () => {
    expect(read("2026-10-10").en).toBe("Signed by Aini, dated 2026-09-30 (back-dated; Boss confirmed it on 2026-10-10)");
    expect(read("2026-10-10").en).not.toContain("not confirmed");
  });
});
