import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPLIER_ACT_SLOTS, ACT_SLOTS, slotKey, slotOf } from "./act-slots";
import { attributionFaults } from "./attribution";

/**
 * The slots whose actor is a SUPPLIER's account (Phase 4b). `act-slots.test.ts` holds `ACT_SLOTS` to the schema's Person relations; these are held to its SupplierAccount ones, in both
 * directions, so that a column that names a supplier's account because that account did something cannot be added without saying how its act is attributed.
 */

const SCHEMA = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");

/// Every foreign key to SupplierAccount in the schema, as `Model.field`.
function supplierAccountRelations(schema: string): string[] {
  const found: string[] = [];
  let model: string | null = null;
  for (const line of schema.split(/\r?\n/)) {
    const m = line.match(/^model (\w+) \{/);
    if (m) {
      model = m[1];
      continue;
    }
    if (line.startsWith("}")) model = null;
    if (!model || model === "SupplierAccount") continue;
    const f = line.match(/^\s+(\w+)\s+SupplierAccount\??\s+@relation\(([^)]*)\)/);
    if (f && /fields:/.test(f[2])) found.push(slotKey(model, f[1]));
  }
  return found;
}

/// The SupplierAccount relations that are not an act, each with the reason.
const NOT_AN_ACT: Readonly<Record<string, string>> = {
  "SupplierSession.account": "The binding of a browser session to its account: identity, not an act.",
  "OneTimeCode.supplierAccount": "Whose code it is: the account it opens or resets, written by the officer's act that issued it.",
  "SignInEvent.supplierAccount": "The sign-in log itself: it records the account that signed in, and is append-only.",
  "SulitAccessEvent.actorSupplierAccount": "The SULIT access log itself (Phase 4b): it records a supplier reading its own profile, and is append-only.",
  "DocumentAccessEvent.actorSupplierAccount": "The document access log itself (Phase 4b): it records a supplier opening its own file, and is append-only for the app login.",
  "RegistrationDraft.lastSavedBy": "A state of the draft: who saved it last. The draft is the supplier's own working copy; each save is audited with the account that made it.",
  "SupplierDocument.recordedBySupplierAccount": "Who lodged a document: the column is the record (exactly one recorder, by CHECK), and the supplier's signature is the submission it was sent with.",
  "DocumentVersion.recordedBySupplierAccount": "Who uploaded a version: the column is the record (exactly one recorder, by CHECK), and the upload is audited with the account.",
  "SiteEventRegistration.registeredBy": "Who signed the supplier up for a briefing or visit (Phase 4d): the column is the record, stamped by the server, and the sign-up is audited with the account. It is not attendance and signs nothing.",
  "SiteEventRegistration.endedBy": "Who withdrew the sign-up (Phase 4d): paired with `endedAt` by CHECK, and audited with the account.",
  "AddendumAcknowledgement.acknowledgedBy": "Who acknowledged an addendum (Phase 4d): the column is the record, the row is append-only, and it is not delivery. It signs nothing.",
  "DocumentRequest.requestedBy": "Who asked for the tender documents (Phase 4d): the column is the record, and the request starts no sale and signs nothing.",
  "DocumentRequest.endedBy": "Who withdrew the request (Phase 4d): paired with `endedAt` by CHECK, and audited with the account.",
  "DocumentPurchase.buyer": "Who bought the documents online (SR-10): the column is the record, and it names the person signed in whose standing was read. Paying is a separate row (PaymentAttempt.by) and the payment simulator is not a signature.",
  "PaymentAttempt.by": "Who pressed Pay successfully or Payment fails on the simulated provider page (SR-10): append-only for every login, one row per try, failures kept.",
  "PurchaseDownload.account": "Who downloaded a released file or text (SR-10): append-only for every login, one row per download, none deduplicated.",
  "TenderInspectionEvent.viewedBy": "Who opened the tender documents (Phase 4d): the inspection log itself, append-only for every login, written before the content is shown.",
  "SiteDiaryEntry.disputedBy": "Who recorded a disagreement on a diary entry from the portal (Phase 4e): the column is the record, audited with the account. A disagreement is words, not a signature; the entry is then the S.O.'s.",
  // Wave 3b (SR-13, ADR 0036 D5, D9, ruling 20w).
  "OnlineBidFile.uploadedBy": "Who uploaded a draft bid part (SR-13): the column is the record, audited with the account and logged in the sealed access log. An upload signs nothing: the submission that takes the part is the signed act (OnlineBid.submittedBy).",
  "SealedAccessEvent.supplierAccount": "The sealed access log itself (SR-13, ruling 20w): it records a supplier's attempt at sealed content, granted or refused, and is append-only for every login.",
  // N2 step 2 (PDPA right of access, ruling 1875(8)).
  "SupplierDataExport.account": "Which account took an export of the supplier's own data (N2): the column is the record, written with its audit row in the read's transaction. Reading one's own data is not an act and signs nothing.",
  // Workspace 3a (WS-9): no writer in 3a.
  "WorkItem.assigneeSupplierAccount": "Which contractor account a work item is on (WS-9), not who acted. The act is the assignment, audited with the signed-in person; 3a writes none.",
  // Workspace 3b (B-8, ADR 0049 D2): the contractor raises an RFI or an incident and replies from the portal.
  "WorkItem.raisedBySupplierAccount": "Who raised a work item from the portal (ADR 0049 D2): the column is the record, with exactly one raiser by CHECK, audited with the account; it signs nothing.",
  "WorkItemComment.supplierAccount": "Who wrote a reply on a work item from the portal (ADR 0049 D2): the column is the record, with exactly one writer by CHECK, append-only, audited with the account; it signs nothing.",
  // ADR 0042 D1 (plan step 1): the Project workspace's three contractor columns. An upload, a request and the document they make sign nothing; each is the record, audited with the account.
  // Plan step 6 moved `ProjectDocumentVersion.uploadedBySupplierAccount` from this list to `SUPPLIER_ACT_SLOTS`: the statutory declaration moved in, and its every version is signed
  // with the password (it keeps the step-up of `ContractorSubmission.submittedBy`, PW-10). An ordinary version still signs nothing; no attribution is written for it.
  "ProjectDocument.createdBySupplierAccount": "Who made a Project workspace document from the portal (ADR 0042 D1): the column is the record, with exactly one creator by CHECK, and the act is audited with the account. It signs nothing.",
  "ProjectDocumentRequest.requestedBySupplierAccount": "Who asked the organisation for a document from the portal (ADR 0042 D1): the column is the record, with exactly one requester by CHECK, append-only, and audited with the account. It signs nothing.",
  // ADR 0042 D10 (plan step 7): the kick-off meeting's attendance names the contractor's accounts that were there. Staff record it; the account did nothing by being ticked.
  // ADR 0045 D3 (wave V): a contractor's question on an award signs nothing. The column is the record, the row is kept as asked (trigger PA049), and the act is audited with the account.
  "AwardQuery.askedBySupplierAccount": "Who asked a question on an issued award from the portal (ADR 0045 D3): the column is the record, kept as asked by trigger, and audited with the account. It signs nothing.",
  // Phase 2 close-out stage B (ADR 0047 D1, plan section 5): the contractor marks a defect line rectified from the portal. Words, not a signature: the column is the record, the
  // event is append-only, and the act is audited with the account. An officer accepts or returns it.
  "DefectEvent.supplierAccount": "Who reported a defect line rectified from the portal (ADR 0047 D1): the column is the record, append-only by trigger, and audited with the account. It signs nothing.",
  "KickOffAttendance.supplierAccount": "An attendee ticked on the contractor's side of a kick-off meeting (ADR 0042 D10): who was there, not who acted. Staff record the meeting held (`KickOffMeeting.heldRecordedBy`); the row is append-only and the account signs nothing.",
};

describe("the schema scan finds what it should", () => {
  it("reads the SupplierAccount relations of the schema, and only the foreign keys", () => {
    const found = supplierAccountRelations(SCHEMA);
    expect(found.length).toBeGreaterThan(8);
    expect(found).toContain("RegistrationDeclaration.signedBy");
    expect(found).toContain("SupplierApplication.submittedBySupplierAccount");
    // The back-relations on SupplierAccount itself are lists, not foreign keys.
    expect(found.some((r) => r.startsWith("SupplierAccount."))).toBe(false);
    expect(supplierAccountRelations("model A {\n  who SupplierAccount? @relation(fields: [whoId], references: [id])\n  others SupplierAccount[]\n}\nmodel SupplierAccount {\n  a A[]\n}")).toEqual(["A.who"]);
  });
});

describe("every SupplierAccount relation is a supplier act slot or is accounted for", () => {
  const RELATIONS = supplierAccountRelations(SCHEMA);
  const SLOT_KEYS = SUPPLIER_ACT_SLOTS.map((s) => slotKey(s.entity, s.field));

  it("none is in neither list, in both, or named but not in the schema", () => {
    const known = new Set([...SLOT_KEYS, ...Object.keys(NOT_AN_ACT)]);
    expect(RELATIONS.filter((r) => !known.has(r))).toEqual([]);
    expect(SLOT_KEYS.filter((k) => k in NOT_AN_ACT)).toEqual([]);
    expect([...SLOT_KEYS, ...Object.keys(NOT_AN_ACT)].filter((k) => !RELATIONS.includes(k))).toEqual([]);
    expect(SLOT_KEYS.filter((k, i) => SLOT_KEYS.indexOf(k) !== i)).toEqual([]);
    for (const [k, reason] of Object.entries(NOT_AN_ACT)) expect(reason.length, k).toBeGreaterThan(30);
  });

  it("a supplier slot is not also a person slot, and the registry finds it", () => {
    for (const s of SUPPLIER_ACT_SLOTS) {
      expect(ACT_SLOTS.some((p) => p.entity === s.entity && p.field === s.field), slotKey(s.entity, s.field)).toBe(false);
      expect(slotOf(s.entity, s.field)).toBe(s);
      expect(s.label.length).toBeGreaterThan(3);
      expect(s.ms.length).toBeGreaterThan(3);
      expect(s.onBehalf).toBe(false);
    }
  });

  it("the submission and the bank change are the two signatures, with the password; each declaration is a signed row that rests on the same entry", () => {
    // Changed for Phase 4c: a registered supplier's change of its bank details is the second act a supplier signs with the password (the first profile is sent with the registration, and signed with it).
    // `CreditorProfile.enteredBy` was listed as not an act while a profile was only ever filled in; a version sent after registration is signed by the account that entered it.
    // Changed for Phase 4e: the contractor's three signatures from the portal, each with the password: a statutory declaration (the one submission kind the store attributes on `ContractorSubmission.submittedBy`),
    // the agent's attestation of a diary entry (FR-SUP-007) and the contractor's block on a certificate (FR-VAR-022).
    // Changed for wave 3b (ADR 0036 D5, threat S11, build plan step 10): an online submission is a signed act, with the password asked again.
    // Changed again for ruling 20ak: a withdrawal of an online submission is a signed act too.
    // Changed for plan step 6 (PW-10, AC-30): the statutory declaration moved into the Project workspace keeps its password, so a declaration's version is a signed act on its own slot.
    // `ContractorSubmission.submittedBy` stays: the earlier records' attributions still resolve (PW-11).
    // Changed for wave V (ADR 0045 D1): the contractor lodges its award return online with the password asked again, a signed act of its own.
    expect(SUPPLIER_ACT_SLOTS.filter((s) => s.signatureClass).map((s) => slotKey(s.entity, s.field))).toEqual(["SupplierApplication.submittedBySupplierAccount", "CreditorProfile.enteredBy", "ContractorSubmission.submittedBy", "SiteDiaryEntry.agentAttestedBy", "CertificateSignature.signedBySupplierAccount", "OnlineBid.submittedBy", "OnlineBid.withdrawnBy", "ProjectDocumentVersion.uploadedBySupplierAccount", "AwardOnlineReturn.submittedBySupplierAccount"]);
    expect(slotOf("RegistrationDeclaration", "signedBy")!.signatureClass).toBe(false);
  });

  it("the attribution rules accept a supplier's own signed act and refuse the rest", () => {
    const base = { entity: "SupplierApplication", entityId: "a", slot: "submittedBySupplierAccount", subject: { kind: "SUPPLIER_ACCOUNT" as const, supplierAccountId: "x" }, recorder: { kind: "SUPPLIER_ACCOUNT" as const, supplierAccountId: "x", sessionId: "s" }, mode: "SIGNED" as const, document: { entity: "SupplierApplication", id: "a" } };
    expect(attributionFaults({ ...base, stepUpAt: new Date() })).toEqual([]);
    expect(attributionFaults(base).map((f) => f.code)).toEqual(["STEP_UP_REQUIRED"]);
    expect(attributionFaults({ ...base, stepUpAt: new Date(), document: null }).map((f) => f.code)).toEqual(["DOCUMENT_REQUIRED"]);
    expect(attributionFaults({ ...base, stepUpAt: new Date(), slot: "nobody" }).map((f) => f.code)).toEqual(["UNKNOWN_SLOT"]);
    // Recorded on someone's behalf, a supplier's own act is nothing: it is not paper-capable and a supplier records for no one.
    expect(attributionFaults({ ...base, mode: "RECORDED_ON_BEHALF", reason: "x", stepUpAt: new Date() }).map((f) => f.code)).toContain("ON_BEHALF_OF_SELF");
  });
});
