import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { makeSupplierAccount, randomId, testOrganisation } from "@/lib/test-db/auth-fixtures";

/**
 * What the database itself holds of a whole online application (ADR 0041 D2 to D4, D8; plan 1.4 and 8.3.4), against the migrations of step 1: the held rows are frozen as sent but for
 * the officer's verification and the one erasure, the agreements are append-only, every recorder names exactly one kind of recorder, and the terms row carries the notice. Each
 * refusal is told apart by its SQLSTATE: PA001 the trail's append-only refusal, PA036 to PA038 the new triggers, 23514 a CHECK.
 */

let organisationId: string;
let typeId: string;

function sqlState(error: unknown): string {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; code?: string; kind?: string } } } }).meta?.driverAdapterError?.cause;
  return cause?.originalCode ?? cause?.code ?? cause?.kind ?? `not a database refusal: ${String(error).slice(0, 300)}`;
}

async function refusal(work: Promise<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (error) {
    return sqlState(error);
  }
}

const sha = () => randomBytes(32).toString("hex");

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  typeId = (await db.supplierDocumentType.upsert({ where: { organisationId_code: { organisationId, code: "held_rows_reg" } }, update: {}, create: { organisationId, code: "held_rows_reg", nameEn: "Companies registry certificate", provenance: "ASSUMED" } })).id;
});

async function application() {
  return db.portalApplication.create({ data: { organisationId, reference: `TEST/PA/${randomId()}`, receivedOn: new Date("2026-10-21T00:00:00Z"), receivedAt: new Date(), form: "WHOLE", registeredName: "Held Rows Sdn Bhd", registrationNo: "HR-1", registrationNoKey: "HR-1" } });
}

async function text(kind: "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS") {
  const existing = await db.declarationText.findFirst({ where: { organisationId, kind }, orderBy: { version: "desc" } });
  return existing ?? db.declarationText.create({ data: { organisationId, kind, version: 1, bodyEn: `The ${kind} wording of {organisation}.`, provenance: "ASSUMED", issuedOn: new Date("2026-01-01T00:00:00Z") } });
}

const agreement = async (portalApplicationId: string | null, kind: "GIRO_AUTHORISATION" | "FALSE_DECLARATION" | "TERMS_AND_CONDITIONS", over: Record<string, unknown> = {}) => {
  const t = await text(kind);
  return db.registrationDeclaration.create({
    data: {
      organisationId,
      portalApplicationId,
      kind,
      textId: t.id,
      textVersion: t.version,
      textSha256: sha(),
      frozenTextEn: "The wording as shown.",
      signatoryName: "Aminah Binti Ali",
      signatoryDesignation: "Director",
      signedOn: new Date("2026-10-21T00:00:00Z"),
      signedAt: new Date(),
      signedBySupplierAccountId: null,
      ...(kind === "TERMS_AND_CONDITIONS" ? { noticeSha256: sha(), noticeFrozenEn: "The notice as shown." } : {}),
      ...over,
    },
  });
};

describe("a certificate held on an online application (PortalApplicationDocument_frozen)", () => {
  it("is kept as sent: its content never changes and it is never deleted; the officer's verification and confirmed expiry may change", async () => {
    const pa = await application();
    const person = await db.person.create({ data: { organisationId, name: `Officer ${randomId()}` } });
    const d = await db.portalApplicationDocument.create({ data: { organisationId, portalApplicationId: pa.id, typeId, typeLabelSnapshot: "Companies registry certificate", clientKey: "new:a", reference: "R-1" } });
    expect(await refusal(db.portalApplicationDocument.update({ where: { id: d.id }, data: { reference: "R-2" } }))).toBe("PA036");
    expect(await refusal(db.portalApplicationDocument.update({ where: { id: d.id }, data: { typeLabelSnapshot: "Another" } }))).toBe("PA036");
    expect(await refusal(db.portalApplicationDocument.delete({ where: { id: d.id } }))).toBe("PA036");
    await db.portalApplicationDocument.update({ where: { id: d.id }, data: { verification: "VERIFIED", verifiedByPersonId: person.id, verifiedOn: new Date("2026-10-21T00:00:00Z"), verifiedAt: new Date(), verificationNote: "Seen", expiresOn: new Date("2027-06-30T00:00:00Z") } });
    expect((await db.portalApplicationDocument.findUniqueOrThrow({ where: { id: d.id } })).verification).toBe("VERIFIED");
    // Security audit L1: checked once. Once checked, neither the check nor the expiry changes again; an update that changes nothing is let through.
    expect(await refusal(db.portalApplicationDocument.update({ where: { id: d.id }, data: { verification: "NOT_IN_ORDER" } }))).toBe("PA036");
    expect(await refusal(db.portalApplicationDocument.update({ where: { id: d.id }, data: { verificationNote: "Changed" } }))).toBe("PA036");
    expect(await refusal(db.portalApplicationDocument.update({ where: { id: d.id }, data: { expiresOn: new Date("2028-06-30T00:00:00Z") } }))).toBe("PA036");
    expect(await refusal(db.portalApplicationDocument.update({ where: { id: d.id }, data: { verification: "VERIFIED" } }))).toBeNull();
  });

  it("its codes are insert-only", async () => {
    const pa = await application();
    const d = await db.portalApplicationDocument.create({ data: { organisationId, portalApplicationId: pa.id, typeId, typeLabelSnapshot: "x", clientKey: "new:b" } });
    const body = await db.registrationBody.upsert({ where: { organisationId_code: { organisationId, code: "held_rows_board" } }, update: {}, create: { organisationId, code: "held_rows_board", labelEn: "Board", provenance: "ASSUMED" } });
    const value = await db.registrationValue.upsert({ where: { bodyId_kind_code: { bodyId: body.id, kind: "GRADE", code: "G1" } }, update: {}, create: { organisationId, bodyId: body.id, kind: "GRADE", code: "G1", nameEn: "Grade one", provenance: "ASSUMED" } });
    const v = await db.portalApplicationValue.create({ data: { organisationId, portalApplicationDocumentId: d.id, registrationValueId: value.id, kind: "GRADE", codeSnapshot: "G1", labelSnapshot: "Grade one" } });
    expect(await refusal(db.portalApplicationValue.update({ where: { id: v.id }, data: { labelSnapshot: "Changed" } }))).toBe("PA001");
    expect(await refusal(db.portalApplicationValue.delete({ where: { id: v.id } }))).toBe("PA001");
  });
});

describe("the bank details held on an online application (PortalApplicationCreditor_frozen)", () => {
  it("never change; the verification may; one erasure blanks every detail; nothing after it; never deleted", async () => {
    const pa = await application();
    const person = await db.person.create({ data: { organisationId, name: `Officer ${randomId()}` } });
    const c = await db.portalApplicationCreditor.create({ data: { organisationId, portalApplicationId: pa.id, beneficiaryName: "Held Rows", bankAccountNo: "123456789", bankCode: "bank-a" } });
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { bankAccountNo: "987654321" } }))).toBe("PA037");
    expect(await refusal(db.portalApplicationCreditor.delete({ where: { id: c.id } }))).toBe("PA037");
    await db.portalApplicationCreditor.update({ where: { id: c.id }, data: { verification: "VERIFIED", verifiedByPersonId: person.id, verifiedOn: new Date("2026-10-21T00:00:00Z"), verifiedAt: new Date() } });
    // Security audit L1: checked once.
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { verification: "NOT_IN_ORDER", verificationNote: "Changed" } }))).toBe("PA037");
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { verifiedOn: new Date("2026-10-20T00:00:00Z") } }))).toBe("PA037");
    // An erasure that leaves a detail, or that changes anything else with it, is refused.
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { erasedAt: new Date(), beneficiaryName: "" } }))).toBe("PA037");
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { erasedAt: new Date(), beneficiaryName: "", bankAccountNo: "", bankCode: "", verificationNote: "x" } }))).toBe("PA037");
    await db.portalApplicationCreditor.update({ where: { id: c.id }, data: { erasedAt: new Date(), beneficiaryName: "", bankAccountNo: "", bankCode: "" } });
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { verificationNote: "after" } }))).toBe("PA037");
    expect(await refusal(db.portalApplicationCreditor.update({ where: { id: c.id }, data: { erasedAt: new Date() } }))).toBe("PA037");
  });
});

describe("the online application itself (PortalApplication_frozen, security audit L3)", () => {
  it("keeps the typed details, the reference and when and how it came in; its status and decision move; one erasure blanks every typed detail; nothing after it", async () => {
    const pa = await application();
    const person = await db.person.create({ data: { organisationId, name: `Officer ${randomId()}` } });
    for (const data of [{ registeredName: "Another Sdn Bhd" }, { registrationNoKey: "HR-2" }, { companyEmail: "x@y.invalid" }, { incorporatedOn: new Date("2020-01-01T00:00:00Z") }, { reference: "TEST/PA/other" }, { receivedAt: new Date(0) }, { form: "STEP_ONE" as const }])
      expect(await refusal(db.portalApplication.update({ where: { id: pa.id }, data })), JSON.stringify(data)).toBe("PA039");
    // The acts' own moves: sending, deciding.
    expect(await refusal(db.portalApplication.update({ where: { id: pa.id }, data: { sentByPersonId: person.id } }))).toBeNull();
    // An erasure that keeps a typed detail is refused; one that blanks all of them, at once, is taken.
    expect(await refusal(db.portalApplication.update({ where: { id: pa.id }, data: { status: "DISCARDED", erasedAt: new Date(), registeredName: "" } }))).toBe("PA039");
    const ERASED = { registeredName: "", registrationNo: "", registrationNoKey: "", entityTypeCode: "", countryCode: "", registeredAddress: "", addressLine1: "", addressLine2: "", city: "", postcode: "", stateCode: "", bumiputeraClaimCode: "", incorporatedOn: null, companyEmail: "", contactName: "", contactDesignation: "", contactEmail: "", contactPhone: "" };
    expect(await refusal(db.portalApplication.update({ where: { id: pa.id }, data: { status: "DISCARDED", decidedAt: new Date(), decidedByPersonId: person.id, discardReason: "Not a company.", erasedAt: new Date(), ...ERASED } }))).toBeNull();
    expect(await refusal(db.portalApplication.update({ where: { id: pa.id }, data: { registeredName: "Back again" } }))).toBe("PA039");
    expect(await refusal(db.portalApplication.update({ where: { id: pa.id }, data: { erasedAt: null } }))).toBe("PA039");
  });
});

describe("the agreements sent with an online application (RegistrationDeclaration)", () => {
  it("are append-only, whoever writes", async () => {
    const pa = await application();
    const d = await agreement(pa.id, "FALSE_DECLARATION");
    expect(await refusal(db.registrationDeclaration.update({ where: { id: d.id }, data: { signatoryName: "Someone else" } }))).toBe("PA001");
    expect(await refusal(db.registrationDeclaration.delete({ where: { id: d.id } }))).toBe("PA001");
  });

  it("name a signer: a supplier's account, or the online application; never neither", async () => {
    expect(await refusal(agreement(null, "FALSE_DECLARATION", { creditorProfileId: null, applicationId: null }))).toBe("23514");
    const pa = await application();
    expect(await refusal(agreement(pa.id, "GIRO_AUTHORISATION"))).toBeNull();
    // One of each kind per application.
    expect(await refusal(agreement(pa.id, "GIRO_AUTHORISATION"))).toBe("23505");
  });

  it("carry the Personal Data Notice on the terms row, and on no other", async () => {
    const pa = await application();
    expect(await refusal(agreement(pa.id, "TERMS_AND_CONDITIONS", { noticeSha256: null, noticeFrozenEn: null }))).toBe("23514");
    expect(await refusal(agreement(pa.id, "TERMS_AND_CONDITIONS", { noticeSha256: "not-a-hash" }))).toBe("23514");
    expect(await refusal(agreement(pa.id, "FALSE_DECLARATION", { noticeSha256: sha(), noticeFrozenEn: "x" }))).toBe("23514");
    const terms = await agreement(pa.id, "TERMS_AND_CONDITIONS");
    expect(terms.noticeSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("who recorded a version, a document or a profile: exactly one kind", () => {
  async function version(over: Record<string, unknown>) {
    const documentClass = await db.documentClass.create({ data: { organisationId, code: `HELD_${randomId()}`, nameEn: "Held rows class" } });
    const document = await db.document.create({ data: { organisationId, title: "Held rows document", documentClassId: documentClass.id, retentionSnapshot: {} } });
    const sha256 = sha();
    await db.blobContent.create({ data: { organisationId, sha256, byteSize: BigInt(4), bytes: new Uint8Array([1, 2, 3, 4]) } });
    return db.documentVersion.create({ data: { organisationId, documentId: document.id, versionNo: 1, sha256, byteSize: BigInt(4), mediaType: "application/pdf", originalFilename: "t.pdf", ...over } });
  }

  it("a document version with no recorder is refused; the applicant, not signed in, is a recorder of its own", async () => {
    const pa = await application();
    expect(await refusal(version({}))).toBe("23514");
    const person = await db.person.create({ data: { organisationId, name: `Officer ${randomId()}` } });
    expect(await refusal(version({ recordedByPersonId: person.id, recordedByPortalApplicationId: pa.id }))).toBe("23514");
    expect((await version({ recordedByPortalApplicationId: pa.id })).recordedByPortalApplicationId).toBe(pa.id);
  });

  it("a creditor profile names the account that entered it or the application it came from, exactly one", async () => {
    const s = await makeSupplierAccount(organisationId);
    const pa = await application();
    const profile = (v: number, over: Record<string, unknown>) => db.creditorProfile.create({ data: { organisationId, supplierId: s.supplier.id, version: v, ...over } });
    expect(await refusal(profile(1, {}))).toBe("23514");
    expect(await refusal(profile(1, { enteredBySupplierAccountId: s.account!.id, enteredByPortalApplicationId: pa.id }))).toBe("23514");
    expect(await refusal(profile(1, { enteredByPortalApplicationId: pa.id }))).toBeNull();
  });
});

describe("a spent form token (PortalFormToken_once)", () => {
  it("names its application once, never again, and is never deleted; its hash is unique", async () => {
    const pa = await application();
    const tokenSha256 = sha();
    const t = await db.portalFormToken.create({ data: { organisationId, tokenSha256, issuedAt: new Date(Date.now() - 1000), consumedAt: new Date() } });
    expect(await refusal(db.portalFormToken.create({ data: { organisationId, tokenSha256, issuedAt: new Date(Date.now() - 1000), consumedAt: new Date() } }))).toBe("23505");
    await db.portalFormToken.update({ where: { id: t.id }, data: { portalApplicationId: pa.id } });
    const other = await application();
    expect(await refusal(db.portalFormToken.update({ where: { id: t.id }, data: { portalApplicationId: other.id } }))).toBe("PA038");
    expect(await refusal(db.portalFormToken.update({ where: { id: t.id }, data: { portalApplicationId: null } }))).toBe("PA038");
    expect(await refusal(db.portalFormToken.delete({ where: { id: t.id } }))).toBe("PA038");
  });
});

describe("the trail names the applicant, not signed in (AuditEntry_actor_matches_kind)", () => {
  const row = (over: Record<string, unknown>) => db.auditEntry.create({ data: { organisationId, entity: "PortalApplication", entityId: "x", entityLabel: "Online application", action: "CREATE", changes: [], unattributed: false, ...over } });

  it("an APPLICANT row names its application and nothing else", async () => {
    const pa = await application();
    expect(await refusal(row({ actorKind: "APPLICANT", actorPortalApplicationId: pa.id }))).toBeNull();
    expect(await refusal(row({ actorKind: "APPLICANT" }))).toBe("23514");
    expect(await refusal(row({ actorKind: "APPLICANT", actorPortalApplicationId: pa.id, actorSessionId: "s1" }))).toBe("23514");
    expect(await refusal(row({ actorKind: "SYSTEM", actorSystemLabel: "x", actorPortalApplicationId: pa.id }))).toBe("23514");
  });
});
