import { createHash } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import type { WrittenAttribution } from "@/lib/test-support/staff";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * An officer checks a supplier's bank details (Phase 4b, FR-VND-005; CPD, 2026-10-07: ONE officer, no second officer), against the scratch database. The act is the officer's alone, signed
 * with their own password; it needs the right to read the profile, judged on the locked rows and logged either way; it is made once, on a profile the supplier has sent, against a
 * bank statement; and it never changes the content. Nothing here has a second-officer step.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null, written: [] as WrittenAttribution[] }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return {
    ...base,
    staffForAct: async (act: Parameters<typeof base.staffForAct>[0]) => {
      if (h.who?.isAdministrator) return { ok: false as const, state: { ok: false as const, message: "An administrator account cannot sign this act." } };
      void act;
      return { ok: true as const, actor: h.who! };
    },
    requireStaff: async () => h.who!,
  };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  const act = actModule();
  h.written = act.written;
  return act.module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { verifyDocument } from "./actions";
import { verifyCreditorProfile } from "./creditor-actions";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const run = randomId();
const OFFICE = `CA_OFFICE_${run}`;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let supplierId = "";
let accountId = "";
let giroTextId = "";
const p = { holder: "", finance: "", admin: "", recorder: "" };
let counter = 0;

const staff = (personId: string, o: { admin?: boolean; permissions?: string[]; office?: boolean } = {}): StaffActor =>
  ({
    kind: "STAFF",
    accountId: `acc_${personId}`,
    sessionId: `ses_${personId}`,
    personId,
    personName: "Officer",
    jobTitle: null,
    isAdministrator: o.admin === true,
    organisationId,
    organisationCode: `CA_${run}`,
    organisationTimeZone: "Asia/Kuala_Lumpur",
    offices: o.office ? [{ roleCode: OFFICE, scope: null }] : [],
    permissions: new Set(o.permissions ?? []),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

/// A sent profile of the supplier, optionally with a live bank statement.
async function profile(o: { statement?: boolean; sent?: boolean } = {}) {
  const version = ++counter;
  // A profile is named by the registration route of the application it was sent with (the application of its GIRO authorisation), so each is sent with an application of its own, whose route has one
  // pending step held by the office the holder holds. (One application of a supplier is open at a time: the earlier ones are decided.)
  const app = await db.supplierApplication.create({ data: { organisationId, supplierId, kind: "NEW", status: "REJECTED", receivedOn: day("2026-10-01"), channel: "COUNTER", recordedByPersonId: p.recorder, recordedAt: new Date("2026-10-01T02:00:00Z") } });
  const route = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: app.id, domain: "supplier_registration", openedAt: new Date("2026-10-03T02:00:00Z") } });
  await db.approvalStep.create({ data: { instanceId: route.id, sequence: 1, roleCode: OFFICE, roleLabel: "Approve", act: "A" } });
  const row = await db.creditorProfile.create({
    data: { organisationId, supplierId, version, beneficiaryName: "Beneficiary", bankCode: "b", bankAccountNo: "1234567890", bankAccountTypeCode: "c", enteredBySupplierAccountId: accountId, submittedAt: o.sent === false ? null : new Date("2026-10-05T02:00:00Z") },
  });
  await db.registrationDeclaration.create({ data: { organisationId, applicationId: app.id, creditorProfileId: row.id, kind: "GIRO_AUTHORISATION", textId: giroTextId, textVersion: 1, textSha256: "0".repeat(64), frozenTextEn: "x", signatoryName: "S", signatoryDesignation: "D", signedOn: day("2026-10-05"), signedAt: new Date("2026-10-05T02:00:00Z"), signedBySupplierAccountId: accountId } });
  if (o.statement !== false) {
    const bytes = new TextEncoder().encode(`%PDF-1.4 statement ${run} ${version}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const cls = await db.documentClass.upsert({ where: { organisationId_code: { organisationId, code: "ca_statement" } }, update: {}, create: { organisationId, code: "ca_statement", nameEn: "Statements", classification: "SULIT" } });
    const doc = await db.document.create({ data: { organisationId, title: `Statement ${version}`, documentClassId: cls.id, classificationSnapshot: "SULIT", retentionSnapshot: {}, status: "FILED", filedAt: new Date() } });
    const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "statement.pdf", recordedBySupplierAccountId: accountId, storedAt: new Date() } });
    await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_BANK_STATEMENT", versionId: v.id, creditorProfileId: row.id } });
  }
  return row.id;
}

const check = (profileId: string, fields: Record<string, string> = {}) => verifyCreditorProfile({ ok: true }, form({ profileId, verification: "VERIFIED", verificationNote: "", "personId:password": "the officer's own password", ...fields }));
const events = (entityId: string) => db.sulitAccessEvent.findMany({ where: { organisationId, entityId, scope: "creditorProfile" }, orderBy: { at: "asc" } });
const stored = (id: string) => db.creditorProfile.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `CA_${run}`, name: "Creditor action test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] = (await makePerson(organisationId, `Creditor action ${k} ${run}`)).id;
  await db.authorityRole.create({ data: { organisationId, code: OFFICE, nameEn: `Office ${run}`, nameMs: `Pejabat ${run}` } });
  await db.roleAssignment.create({ data: { personId: p.holder, roleCode: OFFICE, effectiveFrom: day("2020-01-01") } });
  const s = await db.supplier.create({ data: { organisationId, reference: `CA/${run}`, registeredName: "Supplier CA", registrationNo: `CA-${run}`, registrationNoKey: `CA-${run}`.toUpperCase(), entityTypeCode: "x", countryCode: "x", registeredAddress: "Somewhere", companyEmail: "ca@x.invalid" } });
  supplierId = s.id;
  const c = await db.supplierContact.create({ data: { organisationId, supplierId, name: "Contact", isPrimary: true } });
  accountId = (await db.supplierAccount.create({ data: { organisationId, contactId: c.id, supplierId, loginName: `ca.${run}`, loginKey: `ca.${run}`, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } })).id;
  giroTextId = (await db.declarationText.create({ data: { organisationId, kind: "GIRO_AUTHORISATION", version: 1, bodyEn: "x", provenance: "ASSUMED", issuedOn: day("2026-01-01") } })).id;
});

beforeEach(() => {
  h.written.length = 0;
  h.who = staff(p.holder, { office: true });
});

describe("one officer checks the bank details", () => {
  it("a holder of a step on the supplier's route checks them: the profile records who, the day and the outcome; the act is signed once; the access is logged", async () => {
    const id = await profile();
    const res = await check(id);
    expect(res).toMatchObject({ ok: true });
    const row = await stored(id);
    expect(row).toMatchObject({ verification: "VERIFIED", verifiedByPersonId: p.holder });
    expect(row.verifiedOn).not.toBeNull();
    expect(row.verifiedAt).not.toBeNull();
    // One signature, by the officer, on this exact profile, with the office the officer held. No second officer's step exists to write.
    const mine = h.written.filter((w) => w.entity === "CreditorProfile");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ entityId: id, slot: "verifiedBy", subjectPersonId: p.holder, mode: "SIGNED", roleCode: OFFICE, document: { entity: "CreditorProfile", id } });
    // The reading the check needed was logged, granted, on the route's basis.
    expect((await events(id)).map((e) => [e.actorPersonId, e.outcome, e.basis])).toEqual([[p.holder, "GRANTED", "NAMED_ON_RECORD"]]);
    // The trail holds the before and after in words, and no bank detail.
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: "CreditorProfile", entityId: id } });
    expect(trail).toHaveLength(1);
    expect(trail[0]!.changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: "bankDetails", before: "Not checked", after: "Verified" })]));
    expect(JSON.stringify(trail)).not.toMatch(/1234567890|Beneficiary/);
  });

  it("a second check is refused, writes nothing, and signs nothing", async () => {
    const id = await profile();
    expect((await check(id)).ok).toBe(true);
    const before = await stored(id);
    h.written.length = 0;
    const again = await check(id, { verification: "NOT_IN_ORDER", verificationNote: "Changed my mind" });
    expect(again.ok).toBe(false);
    expect(await stored(id)).toMatchObject({ verification: "VERIFIED", verifiedByPersonId: before.verifiedByPersonId, verificationNote: "" });
    expect(h.written).toHaveLength(0);
  });

  it("finding them not in order needs the reason, and says it in the field", async () => {
    const id = await profile();
    const bad = await check(id, { verification: "NOT_IN_ORDER", verificationNote: "" });
    expect(bad).toMatchObject({ ok: false, errors: { verificationNote: expect.stringMatching(/why/i) } });
    expect((await stored(id)).verification).toBe("NOT_CHECKED");
    const ok = await check(id, { verification: "NOT_IN_ORDER", verificationNote: "The account name differs from the statement." });
    expect(ok.ok).toBe(true);
    expect(await stored(id)).toMatchObject({ verification: "NOT_IN_ORDER", verificationNote: "The account name differs from the statement." });
  });

  it("cannot pass details as in order with no statement to check them against, and cannot check what was never sent", async () => {
    const noStatement = await profile({ statement: false });
    const res = await check(noStatement);
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).toMatch(/no bank statement/i);
    expect((await stored(noStatement)).verification).toBe("NOT_CHECKED");
    const unsent = await profile({ sent: false });
    const draft = await check(unsent);
    expect(draft.ok).toBe(false);
    expect(JSON.stringify(draft)).toMatch(/not sent|has not sent/i);
    expect((await stored(unsent)).verification).toBe("NOT_CHECKED");
  });

  it("is refused to someone who may not read the profile, with the reason in words, and the refusal is logged; nothing changes", async () => {
    const id = await profile();
    h.who = staff(p.finance);
    const res = await check(id);
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).toMatch(/route|creditor/i);
    expect(await stored(id)).toMatchObject({ verification: "NOT_CHECKED", verifiedByPersonId: null });
    expect(h.written).toHaveLength(0);
    expect((await events(id)).map((e) => [e.actorPersonId, e.outcome])).toEqual([[p.finance, "WITHHELD"]]);
  });

  it("is open to a role the organisation granted the right to read creditor profiles", async () => {
    const id = await profile();
    h.who = staff(p.finance, { permissions: ["sulit.read.creditorProfile"] });
    expect((await check(id)).ok).toBe(true);
    expect((await events(id))[0]).toMatchObject({ outcome: "GRANTED", basis: "CREDITOR_PROFILE_PERMISSION" });
  });

  it("is refused at the door to an administrator account, which signs no transaction", async () => {
    const id = await profile();
    h.who = staff(p.admin, { admin: true, permissions: ["sulit.read.creditorProfile"] });
    const res = await check(id);
    expect(res.ok).toBe(false);
    expect((await stored(id)).verification).toBe("NOT_CHECKED");
    expect(h.written).toHaveLength(0);
  });

  it("finds no profile of another organisation, or none at all", async () => {
    expect((await check("no_such_profile_id")).ok).toBe(false);
    expect((await check("")).ok).toBe(false);
  });

  it("two officers who arrive together cannot both write: the second finds it already checked", async () => {
    const id = await profile();
    const first = await check(id);
    h.who = staff(p.finance, { permissions: ["sulit.read.creditorProfile"] });
    const second = await check(id, { verification: "NOT_IN_ORDER", verificationNote: "Too late" });
    expect([first.ok, second.ok]).toEqual([true, false]);
    expect((await stored(id)).verifiedByPersonId).toBe(p.holder);
  });
});

describe("a version the supplier sent after registration is checked by one officer, and only then counts for payment (Phase 4c)", () => {
  let sid = "";
  let acc = "";
  let first = "";
  /// A fresh supplier, so the versions are counted from one: version 1 sent with a registration application whose route the holder holds, checked; then the changes.
  beforeAll(async () => {
    const t = `${run}x`;
    const sup = await db.supplier.create({ data: { organisationId, reference: `CB/${t}`, registeredName: "Supplier CB", registrationNo: `CB-${t}`, registrationNoKey: `CB-${t}`.toUpperCase(), entityTypeCode: "x", countryCode: "x", registeredAddress: "Somewhere", companyEmail: "cb@x.invalid", status: "REGISTERED", registeredOn: day("2026-01-01") } });
    sid = sup.id;
    const c = await db.supplierContact.create({ data: { organisationId, supplierId: sid, name: "Contact B", isPrimary: true } });
    acc = (await db.supplierAccount.create({ data: { organisationId, contactId: c.id, supplierId: sid, loginName: `cb.${t}`, loginKey: `cb.${t}`, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } })).id;
    const app = await db.supplierApplication.create({ data: { organisationId, supplierId: sid, kind: "NEW", status: "APPROVED", receivedOn: day("2026-01-02"), channel: "COUNTER", recordedByPersonId: p.recorder, recordedAt: new Date("2026-01-02T02:00:00Z") } });
    const route = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: app.id, domain: "supplier_registration", openedAt: new Date("2026-01-03T02:00:00Z") } });
    await db.approvalStep.create({ data: { instanceId: route.id, sequence: 1, roleCode: OFFICE, roleLabel: "Approve", act: "A" } });
    const v1 = await db.creditorProfile.create({ data: { organisationId, supplierId: sid, version: 1, beneficiaryName: "Beneficiary", bankCode: "b", bankAccountNo: "1234567890", bankAccountTypeCode: "c", enteredBySupplierAccountId: acc, submittedAt: new Date("2026-01-05T02:00:00Z") } });
    first = v1.id;
    await db.registrationDeclaration.create({ data: { organisationId, applicationId: app.id, creditorProfileId: v1.id, kind: "GIRO_AUTHORISATION", textId: giroTextId, textVersion: 1, textSha256: "0".repeat(64), frozenTextEn: "x", signatoryName: "S", signatoryDesignation: "D", signedOn: day("2026-01-05"), signedAt: new Date("2026-01-05T02:00:00Z"), signedBySupplierAccountId: acc } });
    await attachStatement(v1.id, "v1");
  });

  async function attachStatement(profileId: string, tag: string) {
    const bytes = new TextEncoder().encode(`%PDF-1.4 statement ${run} ${tag}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const cls = await db.documentClass.upsert({ where: { organisationId_code: { organisationId, code: "ca_statement" } }, update: {}, create: { organisationId, code: "ca_statement", nameEn: "Statements", classification: "SULIT" } });
    const doc = await db.document.create({ data: { organisationId, title: `Statement ${tag} ${run}`, documentClassId: cls.id, classificationSnapshot: "SULIT", retentionSnapshot: {}, status: "FILED", filedAt: new Date() } });
    const v = await db.documentVersion.create({ data: { organisationId, documentId: doc.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "statement.pdf", recordedBySupplierAccountId: acc, storedAt: new Date() } });
    await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_BANK_STATEMENT", versionId: v.id, creditorProfileId: profileId } });
  }

  /// A version sent the way the Company workspace sends one: superseding the highest, its authorisation naming the profile and no application.
  async function change(version: number, supersedesId: string) {
    const row = await db.creditorProfile.create({ data: { organisationId, supplierId: sid, version, supersedesId, beneficiaryName: "Beneficiary", bankCode: "b", bankAccountNo: `99887766${version}`, bankAccountTypeCode: "c", enteredBySupplierAccountId: acc, submittedAt: new Date("2026-10-05T02:00:00Z") } });
    await db.registrationDeclaration.create({ data: { organisationId, applicationId: null, creditorProfileId: row.id, kind: "GIRO_AUTHORISATION", textId: giroTextId, textVersion: 1, textSha256: "0".repeat(64), frozenTextEn: "x", signatoryName: "S", signatoryDesignation: "D", signedOn: day("2026-10-05"), signedAt: new Date("2026-10-05T02:00:00Z"), signedBySupplierAccountId: acc } });
    await attachStatement(row.id, `v${version}`);
    return row.id;
  }

  const standing = async () => {
    const { creditorFactsOf } = await import("@/lib/payment/creditor-store");
    const { creditorStanding } = await import("@/lib/payment/creditor");
    return creditorStanding((await creditorFactsOf(db, organisationId, sid)).versions);
  };

  it("version 1 is in force while version 2 waits; the officer the registration route names checks version 2 (no application of its own), and payment then goes to it", async () => {
    expect((await check(first)).ok).toBe(true);
    expect(await standing()).toEqual({ state: "IN_FORCE", version: 1, awaiting: null });
    const v2 = await change(2, first);
    // Waiting: the earlier checked version stays in force, and the later one changes nothing.
    expect(await standing()).toEqual({ state: "IN_FORCE", version: 1, awaiting: 2 });
    h.written.length = 0;
    const res = await check(v2);
    expect(res.ok).toBe(true);
    expect(await stored(v2)).toMatchObject({ verification: "VERIFIED", verifiedByPersonId: p.holder });
    expect(h.written.filter((w) => w.entity === "CreditorProfile")).toHaveLength(1);
    expect((await events(v2)).map((e) => [e.actorPersonId, e.outcome, e.basis])).toEqual([[p.holder, "GRANTED", "NAMED_ON_RECORD"]]);
    expect(await standing()).toEqual({ state: "IN_FORCE", version: 2, awaiting: null });
  });

  it("a version found not in order leaves the version in force in force, and says why", async () => {
    expect(await standing()).toMatchObject({ state: "IN_FORCE", version: 2 });
    const v3 = await change(3, (await db.creditorProfile.findFirstOrThrow({ where: { supplierId: sid, version: 2 } })).id);
    expect(await standing()).toEqual({ state: "IN_FORCE", version: 2, awaiting: 3 });
    expect((await check(v3, { verification: "NOT_IN_ORDER", verificationNote: "The account number does not match the statement." })).ok).toBe(true);
    expect(await stored(v3)).toMatchObject({ verification: "NOT_IN_ORDER", verificationNote: "The account number does not match the statement." });
    expect(await standing()).toEqual({ state: "IN_FORCE", version: 2, awaiting: null });
  });

  it("someone the registration route does not name, with no grant, may not read or check a later version either, and the refusal is logged", async () => {
    const v4 = await change(4, (await db.creditorProfile.findFirstOrThrow({ where: { supplierId: sid, version: 3 } })).id);
    h.who = staff(p.finance);
    const res = await check(v4);
    expect(res.ok).toBe(false);
    expect((await stored(v4)).verification).toBe("NOT_CHECKED");
    expect((await events(v4)).map((e) => [e.actorPersonId, e.outcome])).toEqual([[p.finance, "WITHHELD"]]);
    expect(await standing()).toEqual({ state: "IN_FORCE", version: 2, awaiting: 4 });
  });
});

describe("an officer checks a document's expiry against the certificate (Phase 4b)", () => {
  let typeId = "";
  /// A document the supplier lodged, expiring on a day it said, with a live scan.
  async function lodged(expiresOn: string) {
    typeId ||= (await db.supplierDocumentType.create({ data: { organisationId, code: `ca_type_${run}`, nameEn: "Tax clearance", provenance: "ASSUMED", expires: true } })).id;
    const doc = await db.supplierDocument.create({ data: { organisationId, supplierId, typeId, typeLabelSnapshot: "Tax clearance", reference: `TC-${++counter}`, expiresOn: day(expiresOn), lodgedOn: day("2026-10-05"), recordedAt: new Date("2026-10-05T02:00:00Z"), recordedBySupplierAccountId: accountId } });
    const bytes = new TextEncoder().encode(`%PDF-1.4 scan ${run} ${doc.id}`);
    const sha = createHash("sha256").update(bytes).digest("hex");
    await db.blobContent.createMany({ data: [{ organisationId, sha256: sha, byteSize: BigInt(bytes.length), bytes, storedAt: new Date() }], skipDuplicates: true });
    const cls = await db.documentClass.upsert({ where: { organisationId_code: { organisationId, code: "ca_scan" } }, update: {}, create: { organisationId, code: "ca_scan", nameEn: "Scans", classification: "INTERNAL" } });
    const d = await db.document.create({ data: { organisationId, title: `Scan ${doc.id}`, documentClassId: cls.id, classificationSnapshot: "INTERNAL", retentionSnapshot: {}, status: "FILED", filedAt: new Date() } });
    const v = await db.documentVersion.create({ data: { organisationId, documentId: d.id, versionNo: 1, sha256: sha, byteSize: BigInt(bytes.length), mediaType: "application/pdf", originalFilename: "scan.pdf", recordedBySupplierAccountId: accountId, storedAt: new Date() } });
    await db.documentAttachment.create({ data: { organisationId, purpose: "SUPPLIER_DOCUMENT", versionId: v.id, supplierDocumentId: doc.id } });
    return doc.id;
  }
  const verify = (documentId: string, fields: Record<string, string>) => verifyDocument({ ok: true }, form({ documentId, verification: "VERIFIED", verifiedOn: "2026-10-06", verificationNote: "", "personId:password": "the officer's own password", ...fields }));
  const expiryOf = async (id: string) => (await db.supplierDocument.findUniqueOrThrow({ where: { id } })).expiresOn?.toISOString().slice(0, 10) ?? null;

  it("confirming the date the supplier gave changes nothing and writes no correction", async () => {
    const id = await lodged("2027-03-31");
    const res = await verify(id, { expiresOn: "2027-03-31" });
    expect(res.ok).toBe(true);
    expect(await expiryOf(id)).toBe("2027-03-31");
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: "SupplierDocument", entityId: id } });
    expect(trail.some((t) => /corrected/i.test(t.reason))).toBe(false);
  });

  it("a different date is a correction: it needs the reason, it is stored, and the trail holds the date before and after with the reason", async () => {
    const id = await lodged("2027-03-31");
    const noReason = await verify(id, { expiresOn: "2027-04-30" });
    expect(noReason).toMatchObject({ ok: false, errors: { verificationNote: expect.any(String) } });
    expect(await expiryOf(id)).toBe("2027-03-31");
    const ok = await verify(id, { expiresOn: "2027-04-30", verificationNote: "The certificate reads 30 April." });
    expect(ok.ok).toBe(true);
    expect(await expiryOf(id)).toBe("2027-04-30");
    const trail = await db.auditEntry.findMany({ where: { organisationId, entity: "SupplierDocument", entityId: id }, orderBy: { at: "asc" } });
    const correction = trail.find((t) => /corrected/i.test(t.reason))!;
    expect(correction.changes).toEqual([expect.objectContaining({ field: expect.stringMatching(/expir/i), before: "2027-03-31", after: "2027-04-30" })]);
    expect(correction.reason).toContain("The certificate reads 30 April.");
  });

  it("a date that is not a day is refused where it was typed, and nothing is stored", async () => {
    const id = await lodged("2027-03-31");
    const res = await verify(id, { expiresOn: "next March", verificationNote: "Typo" });
    expect(res).toMatchObject({ ok: false, errors: { expiresOn: expect.any(String) } });
    expect((await db.supplierDocument.findUniqueOrThrow({ where: { id } })).verification).toBe("NOT_CHECKED");
  });
});
