import { describe, expect, it } from "vitest";

import { actingPeople, attributionFaults, attributionLabel, attributionRow, latestAttribution, needsStepUp, NOT_SIGNED_WORDS, ON_BEHALF_PHRASE, ON_BEHALF_SENTENCE, stepUpFault, type AttributionRequest } from "./attribution";
import type { PermissionKey } from "./types";

const person = (personId: string, sessionId: string | null = "s1") => ({ kind: "PERSON", personId, sessionId }) as const;
const codes = (r: AttributionRequest) => attributionFaults(r).map((f) => f.code);

// ApprovalStep.decidedBy is signature-class; Requisition.requestingPerson is not.
const SIGNATURE = { entity: "ApprovalStep", entityId: "st1", slot: "decidedBy" } as const;
const ORDINARY = { entity: "Requisition", entityId: "rq1", slot: "requestingPerson" } as const;

const signed = (over: Partial<AttributionRequest> = {}): AttributionRequest => ({
  ...SIGNATURE,
  subject: { kind: "PERSON", personId: "p1" },
  recorder: person("p1"),
  mode: "SIGNED",
  stepUpAt: new Date("2026-10-07T01:00:00Z"),
  ...over,
});

const onBehalf = (over: Partial<AttributionRequest> = {}): AttributionRequest => ({
  ...SIGNATURE,
  subject: { kind: "PERSON", personId: "p2" },
  recorder: person("p1"),
  mode: "RECORDED_ON_BEHALF",
  paperReference: "Minute 4/2026",
  recorderPermissions: new Set<PermissionKey>(["acts.recordOnBehalf"]),
  paperSignatureRecording: "ALLOWED",
  ...over,
});

describe("a signed act", () => {
  it("is signed by the person it is attributed to, with the password asked again for a signature-class act", () => {
    expect(codes(signed())).toEqual([]);
  });

  it("is refused for a recorder who is not the subject (the F1 hole): recording for someone else is not signing", () => {
    expect(codes(signed({ recorder: person("p9") }))).toEqual(["SIGNED_BY_ANOTHER"]);
  });

  it("is refused for the system: a loader cannot sign", () => {
    expect(codes(signed({ recorder: { kind: "SYSTEM", label: "demo loader" } }))).toEqual(["SIGNED_BY_ANOTHER"]);
  });

  it("needs the password again for a signature-class act, and not for another", () => {
    expect(codes(signed({ stepUpAt: null }))).toEqual(["STEP_UP_REQUIRED"]);
    expect(codes({ ...ORDINARY, subject: { kind: "PERSON", personId: "p1" }, recorder: person("p1"), mode: "SIGNED" })).toEqual([]);
  });

  it("holds across the supplier-account pair as across the person pair", () => {
    const supplier = { ...ORDINARY, subject: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a1" }, mode: "SIGNED" } as const;
    expect(codes({ ...supplier, recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a1", sessionId: "s" } })).toEqual([]);
    expect(codes({ ...supplier, recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a2", sessionId: "s" } })).toEqual(["SIGNED_BY_ANOTHER"]);
    // A person is never the same party as a supplier account that happens to share an id.
    expect(codes({ ...supplier, recorder: person("a1") })).toEqual(["SIGNED_BY_ANOTHER"]);
  });
});

describe("an act recorded on someone's behalf", () => {
  const plain = { ...ORDINARY, subject: { kind: "PERSON", personId: "p2" }, recorder: person("p1"), mode: "RECORDED_ON_BEHALF" } as const;

  it("needs the paper it came from or a reason", () => {
    expect(codes(plain)).toEqual(["PAPER_OR_REASON_REQUIRED"]);
    expect(codes({ ...plain, reason: "  " })).toEqual(["PAPER_OR_REASON_REQUIRED"]);
    expect(codes({ ...plain, reason: "Away on leave" })).toEqual([]);
  });

  it("is allowed for a signature-class act only with the permission, a paper reference and the organisation's switch on", () => {
    expect(codes(onBehalf())).toEqual([]);
    expect(codes(onBehalf({ recorderPermissions: new Set() }))).toEqual(["NOT_PERMITTED_TO_RECORD"]);
    expect(codes(onBehalf({ paperReference: "", reason: "a reason is not a paper reference" }))).toEqual(["PAPER_REFERENCE_REQUIRED"]);
  });

  it("is refused while the paper-signature switch is unset, and says the setting is not set", () => {
    const r = attributionFaults(onBehalf({ paperSignatureRecording: null }));
    expect(r.map((x) => x.code)).toEqual(["PAPER_SWITCH_NOT_SET"]);
    expect(r[0].en).toMatch(/has not set whether a paper decision may be recorded/);
  });

  it("is refused where the organisation has chosen not to allow it", () => {
    expect(codes(onBehalf({ paperSignatureRecording: "REFUSED" }))).toEqual(["PAPER_REFUSED"]);
  });

  it("does not need the permission or the switch for an act that is not signature-class", () => {
    expect(codes({ ...plain, paperReference: "Form 7" })).toEqual([]);
  });

  it("lets the system record a signature-class act for a person, with a reason, and no permission or switch of a person", () => {
    expect(codes(onBehalf({ recorder: { kind: "SYSTEM", label: "demo loader" }, recorderPermissions: undefined, paperSignatureRecording: null, paperReference: "", reason: "history made by the demo loader" }))).toEqual([]);
    expect(codes(onBehalf({ recorder: { kind: "SYSTEM", label: " " }, paperReference: "x" }))).toEqual(["SYSTEM_UNLABELLED"]);
  });
});

describe("an act recorded on the recorder's own behalf", () => {
  it("is refused: it would skip the password a signature asks, and says nothing true", () => {
    expect(codes(onBehalf({ subject: { kind: "PERSON", personId: "p1" } }))).toEqual(["ON_BEHALF_OF_SELF"]);
    expect(codes({ ...ORDINARY, mode: "RECORDED_ON_BEHALF", reason: "mine", subject: { kind: "PERSON", personId: "p1" }, recorder: person("p1") })).toEqual(["ON_BEHALF_OF_SELF"]);
    const supplier = { ...ORDINARY, mode: "RECORDED_ON_BEHALF", reason: "mine", subject: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a1" } } as const;
    expect(codes({ ...supplier, recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a1", sessionId: null } })).toEqual(["ON_BEHALF_OF_SELF"]);
    // Another person, another supplier account, and the system are not the same party.
    expect(codes({ ...supplier, recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a2", sessionId: null } })).toEqual([]);
    expect(codes({ ...supplier, recorder: { kind: "SYSTEM", label: "demo loader" } })).toEqual([]);
  });
});

describe("the password asked again, judged against the session", () => {
  const at = new Date("2026-10-07T01:00:00Z");
  it("is current when it is the stamp the session carries now and no act has signed on it", () => {
    expect(stepUpFault({ passed: at, onSession: new Date(at), consumed: false })).toBeNull();
  });

  it("is refused when none was passed, when the session carries another stamp or none, and when it has signed an act already", () => {
    expect(stepUpFault({ passed: null, onSession: at, consumed: false })?.code).toBe("STEP_UP_REQUIRED");
    expect(stepUpFault({ passed: new Date(at.getTime() + 1), onSession: at, consumed: false })?.code).toBe("STEP_UP_NOT_CURRENT");
    expect(stepUpFault({ passed: at, onSession: null, consumed: false })?.code).toBe("STEP_UP_NOT_CURRENT");
    expect(stepUpFault({ passed: at, onSession: at, consumed: true })?.code).toBe("STEP_UP_USED");
  });

  it("says each in both languages, the Malay not the English", () => {
    for (const f of [{ passed: null, onSession: at, consumed: false }, { passed: at, onSession: null, consumed: false }, { passed: at, onSession: at, consumed: true }]) {
      const fault = stepUpFault(f)!;
      expect(fault.ms).not.toBe(fault.en);
      expect(fault.ms.length).toBeGreaterThan(10);
    }
  });

  it("is asked of a signature-class act signed by a person, and of nothing else", () => {
    expect(needsStepUp(signed())).toBe(true);
    expect(needsStepUp(signed({ ...ORDINARY }))).toBe(false);
    expect(needsStepUp(onBehalf())).toBe(false);
    expect(needsStepUp(signed({ recorder: { kind: "SYSTEM", label: "x" } }))).toBe(false);
    expect(needsStepUp(signed({ subject: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a" }, recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a", sessionId: null } }))).toBe(false);
  });

  it("keeps the stamp on the row only where it is the proof of a signature, so one entry cannot collide with an ordinary act", () => {
    const stamp = new Date("2026-10-07T01:00:00Z");
    expect(attributionRow(signed({ stepUpAt: stamp })).stepUpAt).toEqual(stamp);
    expect(attributionRow({ ...ORDINARY, subject: { kind: "PERSON", personId: "p1" }, recorder: person("p1"), mode: "SIGNED", stepUpAt: stamp }).stepUpAt).toBeNull();
    expect(attributionRow(onBehalf({ stepUpAt: stamp })).stepUpAt).toBeNull();
  });
});

describe("a slot written again", () => {
  it("is read as its highest occurrence, whatever order the rows come in, and as nothing when there are none", () => {
    const rows = [{ occurrence: 2, id: "b" }, { occurrence: 1, id: "a" }, { occurrence: 3, id: "c" }];
    expect(latestAttribution(rows)?.id).toBe("c");
    expect(latestAttribution([...rows].reverse())?.id).toBe("c");
    expect(latestAttribution([])).toBeNull();
  });
});

describe("the slot", () => {
  it("must be one the registry knows", () => {
    expect(codes(signed({ slot: "nobody" }))).toEqual(["UNKNOWN_SLOT"]);
    expect(codes(signed({ entity: "Nothing" }))).toEqual(["UNKNOWN_SLOT"]);
  });
});

describe("the row", () => {
  it("is a person recorder with the session and the password stamp, for a signed act", () => {
    const at = new Date("2026-10-07T01:00:00Z");
    expect(attributionRow(signed({ stepUpAt: at }))).toMatchObject({
      subjectPersonId: "p1",
      subjectSupplierAccountId: null,
      recordedByPersonId: "p1",
      recordedBySupplierAccountId: null,
      recordedBySystemLabel: null,
      mode: "SIGNED",
      stepUpAt: at,
      sessionId: "s1",
    });
  });

  it("is the system by its label, with no person, no session and no password stamp, whatever was passed", () => {
    const row = attributionRow(onBehalf({ recorder: { kind: "SYSTEM", label: " demo loader " }, stepUpAt: new Date(), reason: "history" }));
    expect(row).toMatchObject({ recordedByPersonId: null, recordedBySystemLabel: "demo loader", sessionId: null, stepUpAt: null, reason: "history" });
  });

  it("names exactly one subject and exactly one recorder", () => {
    const supplierSigned = signed({ subject: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a" }, recorder: { kind: "SUPPLIER_ACCOUNT", supplierAccountId: "a", sessionId: null } });
    for (const req of [signed(), onBehalf(), onBehalf({ recorder: { kind: "SYSTEM", label: "x" } }), supplierSigned]) {
      const r = attributionRow(req);
      expect([r.subjectPersonId, r.subjectSupplierAccountId].filter((x) => x != null)).toHaveLength(1);
      expect([r.recordedByPersonId, r.recordedBySupplierAccountId, r.recordedBySystemLabel].filter((x) => x != null)).toHaveLength(1);
    }
  });
});

describe("the people an act's separation-of-duties checks run against", () => {
  it("are the actor and the attested person, both", () => {
    expect(actingPeople(onBehalf()).sort()).toEqual(["p1", "p2"]);
    expect(actingPeople(signed())).toEqual(["p1"]);
    expect(actingPeople(onBehalf({ recorder: { kind: "SYSTEM", label: "x" } }))).toEqual(["p2"]);
  });
});

describe("how an attribution reads", () => {
  it("a signed act: signed by the person", () => {
    expect(attributionLabel({ row: { mode: "SIGNED", recordedBySystemLabel: null }, subjectName: "Aminah", recorderName: "Aminah", auditAttributed: true })).toEqual({
      state: "SIGNED",
      en: "Signed by Aminah",
      ms: "Ditandatangani oleh Aminah",
    });
  });

  it("an act recorded on behalf: who recorded it, for whom, not signed", () => {
    const r = attributionLabel({ row: { mode: "RECORDED_ON_BEHALF", recordedBySystemLabel: null }, subjectName: "Aminah", recorderName: "Bakar", auditAttributed: true });
    expect(r.state).toBe("ON_BEHALF");
    expect(r.en).toBe("Recorded by Bakar on behalf of Aminah, not signed");
  });

  it("an act the system recorded names the system, not a person", () => {
    const r = attributionLabel({ row: { mode: "RECORDED_ON_BEHALF", recordedBySystemLabel: "demo loader" }, subjectName: "Aminah", recorderName: null, auditAttributed: true });
    expect(r.en).toBe("Recorded by demo loader on behalf of Aminah, not signed");
  });

  it("no row and an unattributed audit row: before sign-in, never a defect", () => {
    const r = attributionLabel({ row: null, subjectName: "Aminah", recorderName: null, auditAttributed: false });
    expect(r).toMatchObject({ state: "LEGACY", en: "Recorded on behalf of Aminah, not signed (before sign-in)" });
  });

  it("no row but an attributed audit row: the attribution is missing, shown as a defect", () => {
    expect(attributionLabel({ row: null, subjectName: "Aminah", recorderName: null, auditAttributed: true })).toMatchObject({ state: "MISSING", en: "Attribution missing" });
  });

  it("keeps the words three screens already say, byte for byte", () => {
    expect(ON_BEHALF_PHRASE).toBe("recorded on behalf of, not signed");
    expect(ON_BEHALF_SENTENCE).toBe("Recorded on behalf of, not signed");
    expect(NOT_SIGNED_WORDS).toBe("not signed");
  });
});
