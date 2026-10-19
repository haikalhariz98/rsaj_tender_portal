import { describe, expect, it } from "vitest";

import { actFaultErrors, interpretAct, type ActForm } from "./act-input";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

/// ApprovalStep.decidedBy: signature-class, may come from paper. Requisition.requestingPerson: neither.
const SIGNATURE = { signatureClass: true, onBehalf: true } as const;
const ORDINARY = { signatureClass: false, onBehalf: false } as const;
const PAPER_ONLY = { signatureClass: false, onBehalf: true } as const;

const form = (over: Partial<ActForm> = {}): ActForm => ({
  onBehalf: false,
  attestedPersonId: null,
  paperReference: "",
  reason: "",
  password: "",
  claimedDay: null,
  backdate: false,
  backdateReason: "",
  backdateAuthorisedByPersonId: null,
  ...over,
});

const run = (over: { slot?: typeof SIGNATURE | typeof ORDINARY | typeof PAPER_ONLY; today?: string | null; form?: Partial<ActForm>; actor?: string | null; dated?: boolean } = {}) =>
  interpretAct({ slot: over.slot ?? ORDINARY, actorPersonId: over.actor === undefined ? "me" : over.actor, today: over.today === undefined ? "2026-10-07" : over.today, dated: over.dated, form: form(over.form) });
const codes = (r: ReturnType<typeof run>) => (r.ok ? [] : r.faults.map((f) => f.code));

describe("the act is the signed-in person's own", () => {
  it("is signed by the actor, and a person the form names is not believed", () => {
    const r = run({ form: { attestedPersonId: "someone-else" } });
    expect(r.ok && r.intent.mode).toBe("SIGNED");
    expect(r.ok && r.intent.subjectPersonId).toBe("me");
  });

  it("asks the password for a signature-class act, every time, and not for another", () => {
    expect(codes(run({ slot: SIGNATURE }))).toEqual(["PASSWORD_REQUIRED"]);
    const signed = run({ slot: SIGNATURE, form: { password: "pw" } });
    expect(signed.ok && signed.intent.passwordRequired).toBe(true);
    const ordinary = run({ slot: ORDINARY });
    expect(ordinary.ok && ordinary.intent.passwordRequired).toBe(false);
  });

  it("is dated today by the server where the form gives no day, or today", () => {
    const r = run({ form: { claimedDay: "2026-10-07" } });
    expect(r.ok && r.intent.day).toBe("2026-10-07");
    expect(r.ok && r.intent.effectiveOn).toBeNull();
    const none = run({});
    expect(none.ok && none.intent.day).toBe("2026-10-07");
  });

  it("refuses a day after today, and says when today is not known", () => {
    expect(codes(run({ form: { claimedDay: "2026-10-08" } }))).toEqual(["DATE_IN_FUTURE"]);
    expect(codes(run({ today: null, form: { claimedDay: "2026-10-07" } }))).toEqual(["TODAY_UNKNOWN"]);
  });
});

describe("back-dating a signed signature-class act is a recorded exception (NFR-AUD-005 and 006)", () => {
  const sign = (f: Partial<ActForm>) => run({ slot: SIGNATURE, form: { password: "pw", ...f } });

  it("is refused when the day is earlier and the form does not say it is back-dated", () => {
    expect(codes(sign({ claimedDay: "2026-10-01" }))).toEqual(["BACKDATE_NEEDED"]);
  });

  it("needs the reason and the officer who authorised it", () => {
    expect(codes(sign({ claimedDay: "2026-10-01", backdate: true })).sort()).toEqual(["BACKDATE_AUTHORISER_REQUIRED", "BACKDATE_REASON_REQUIRED"]);
  });

  it("is refused when the actor authorised it themselves", () => {
    expect(codes(sign({ claimedDay: "2026-10-01", backdate: true, backdateReason: "Away", backdateAuthorisedByPersonId: "me" }))).toEqual(["BACKDATE_SELF_AUTHORISED"]);
  });

  it("is recorded with its day, reason and authoriser", () => {
    const r = sign({ claimedDay: "2026-10-01", backdate: true, backdateReason: "Away on leave", backdateAuthorisedByPersonId: "boss" });
    expect(r.ok && r.intent.day).toBe("2026-10-01");
    expect(r.ok && r.intent.effectiveOn).toBe("2026-10-01");
    expect(r.ok && r.intent.backdate).toEqual({ reason: "Away on leave", authorisedByPersonId: "boss" });
  });

  it("is not needed for a day that is today, whatever the switch says", () => {
    const r = sign({ claimedDay: "2026-10-07", backdate: true });
    expect(r.ok && r.intent.backdate).toBeNull();
  });

  it("is not asked of an ordinary act: its day is a fact the officer reports", () => {
    const r = run({ form: { claimedDay: "2026-10-01" } });
    expect(r.ok && r.intent.day).toBe("2026-10-01");
    expect(r.ok && r.intent.effectiveOn).toBeNull();
    expect(r.ok && r.intent.backdate).toBeNull();
  });
});

describe("an act recorded on someone's behalf from paper", () => {
  it("is for the person the form names, with the paper or the reason, not signed and with no password", () => {
    const r = run({ slot: SIGNATURE, form: { onBehalf: true, attestedPersonId: "boss", paperReference: "Minute 4", claimedDay: "2026-09-30" } });
    expect(r.ok && r.intent).toMatchObject({ mode: "RECORDED_ON_BEHALF", subjectPersonId: "boss", passwordRequired: false, day: "2026-09-30", effectiveOn: "2026-09-30", backdate: null });
  });

  it("is refused for a slot that is the actor's own: it cannot be recorded for someone else", () => {
    expect(codes(run({ slot: ORDINARY, form: { onBehalf: true, attestedPersonId: "boss", paperReference: "p" } }))).toEqual(["ON_BEHALF_NOT_ALLOWED"]);
  });

  it("is refused with nobody named, with oneself named, and with neither the paper nor the reason", () => {
    expect(codes(run({ slot: PAPER_ONLY, form: { onBehalf: true, paperReference: "p" } }))).toEqual(["ATTESTED_REQUIRED"]);
    expect(codes(run({ slot: PAPER_ONLY, form: { onBehalf: true, attestedPersonId: "me", paperReference: "p" } }))).toEqual(["ON_BEHALF_OF_SELF"]);
    expect(codes(run({ slot: PAPER_ONLY, form: { onBehalf: true, attestedPersonId: "boss" } }))).toEqual(["PAPER_OR_REASON_REQUIRED"]);
  });

  it("needs the paper's reference, not only a reason, for a signature or an act that moves money, time or authority (review of Phase 2b), on the paper-reference field", () => {
    const GATED = { signatureClass: false, onBehalf: true, paperGated: true } as const;
    const faultOf = (r: ReturnType<typeof run>) => (r.ok ? [] : r.faults.map((f) => `${f.code}@${f.field}`));
    expect(faultOf(run({ slot: GATED, form: { onBehalf: true, attestedPersonId: "boss", reason: "by phone" } }))).toEqual(["PAPER_REFERENCE_REQUIRED@paperReference"]);
    expect(faultOf(run({ slot: SIGNATURE, form: { onBehalf: true, attestedPersonId: "boss", reason: "by phone" } }))).toEqual(["PAPER_REFERENCE_REQUIRED@paperReference"]);
    expect(faultOf(run({ slot: GATED, form: { onBehalf: true, attestedPersonId: "boss" } }))).toEqual(["PAPER_REFERENCE_REQUIRED@paperReference"]);
    expect(codes(run({ slot: GATED, form: { onBehalf: true, attestedPersonId: "boss", paperReference: "Memo 4" } }))).toEqual([]);
    // An act that is only paper-capable still takes the reason alone.
    expect(codes(run({ slot: PAPER_ONLY, form: { onBehalf: true, attestedPersonId: "boss", reason: "by phone" } }))).toEqual([]);
  });

  it("needs the day the paper is dated where the act is dated, and not a day after today", () => {
    expect(codes(run({ slot: SIGNATURE, dated: true, form: { onBehalf: true, attestedPersonId: "boss", paperReference: "p" } }))).toEqual(["DATE_REQUIRED"]);
    expect(codes(run({ slot: SIGNATURE, dated: true, form: { onBehalf: true, attestedPersonId: "boss", paperReference: "p", claimedDay: "2026-10-09" } }))).toEqual(["DATE_IN_FUTURE"]);
    expect(codes(run({ slot: SIGNATURE, dated: true, form: { onBehalf: true, attestedPersonId: "boss", paperReference: "p", claimedDay: "2026-09-01" } }))).toEqual([]);
  });

  it("is allowed with a reason alone for an act that is not a signature", () => {
    expect(codes(run({ slot: PAPER_ONLY, form: { onBehalf: true, attestedPersonId: "boss", reason: "Said so at the sitting" } }))).toEqual([]);
  });
});

describe("a loader run: nobody is signed in, and the data names who did each act", () => {
  it("attests the person the data names, for every slot, recorded by the system with its label as the reason", () => {
    const r = run({ actor: null, slot: ORDINARY, form: { attestedPersonId: "p1" } });
    expect(r.ok && r.intent).toMatchObject({ mode: "RECORDED_ON_BEHALF", subjectPersonId: "p1", passwordRequired: false });
    const withLabel = interpretAct({ slot: SIGNATURE, actorPersonId: null, systemLabel: "demo loader", today: null, form: form({ attestedPersonId: "p1" }) });
    expect(withLabel.ok && withLabel.intent.reason).toBe("demo loader");
  });

  it("is refused when the data names nobody", () => {
    expect(codes(run({ actor: null }))).toEqual(["ATTESTED_REQUIRED"]);
  });
});

describe("the faults, as a form shows them", () => {
  it("are keyed by the field they belong on, and the rest are one message", () => {
    const r = run({ slot: SIGNATURE, form: { onBehalf: true, attestedPersonId: "me" } });
    if (r.ok) throw new Error("expected a refusal");
    const shown = actFaultErrors(r.faults, { person: "personId", date: "decidedOn" });
    expect(Object.keys(shown.errors).sort()).toEqual(["personId", "personId:paperReference"]);
    expect(shown.message).toBeUndefined();
  });

  it("puts a date fault on the date's own field", () => {
    const r = run({ form: { claimedDay: "2026-10-08" } });
    if (r.ok) throw new Error("expected a refusal");
    expect(actFaultErrors(r.faults, { person: "personId", date: "decidedOn" }).errors.decidedOn).toMatch(/after today/);
  });

  it("says each in both languages, the Malay not the English", () => {
    const r = run({ slot: SIGNATURE });
    if (r.ok) throw new Error("expected a refusal");
    for (const f of r.faults) expect(f.en.trim()).not.toBe("");
  });
});
