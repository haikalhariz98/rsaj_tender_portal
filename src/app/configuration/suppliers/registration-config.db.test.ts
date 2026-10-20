import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * Configuration, Supplier register: the registration's settings and the declarations' wording (Phase 4b), against the scratch database. Each is the customer's and ships unset; a setting
 * made says where it comes from; the bank statement's class must be SULIT; a wording that was signed is never edited in place; every change is audited with its before and after.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  return { ...actorModule(), requireStaff: async () => h.who! };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

// Phase 5b (the plan's 5b line, ruling 1909(A)): these editors are proposals now; this file tests the editors themselves (the rules each holds), which run in `core.ts` when a second
// person applies a change. `registration-value.db.test.ts` proposes and applies one through the screen's own action.
import { saveDeclarationText, saveDocumentType, savePortalIntake, saveRegistrationSettings, setDeclarationTextRetired } from "./core";

const run = randomId();
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
let organisationId = "";
let internalClass = "";
let sulitClass = "";

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `RC_${run}`, name: "Registration config test organisation", timeZone: "Asia/Kuala_Lumpur" } });
  organisationId = org.id;
  const admin = await makePerson(organisationId, `Config admin ${run}`);
  h.who = { kind: "STAFF", accountId: "a", sessionId: "s", personId: admin.id, personName: "Admin", jobTitle: null, isAdministrator: true, organisationId, organisationCode: org.code, organisationTimeZone: "Asia/Kuala_Lumpur", offices: [], permissions: new Set(), stepUpAt: null, sessionCreatedAt: new Date(), sourceAddress: null, mustChangePassword: false } as unknown as StaffActor;
  internalClass = (await db.documentClass.create({ data: { organisationId, code: "rc_int", nameEn: "Internal class", classification: "INTERNAL" } })).id;
  sulitClass = (await db.documentClass.create({ data: { organisationId, code: "rc_sul", nameEn: "Sulit class", classification: "SULIT" } })).id;
});

const policy = () => db.supplierPolicy.findUniqueOrThrow({ where: { organisationId } });
const trail = (entity: string) => db.auditEntry.findMany({ where: { organisationId, entity }, orderBy: { at: "asc" } });

describe("the registration's settings", () => {
  it("nothing is set until the organisation sets it, and a setting made must say where it comes from", async () => {
    const noSource = await saveRegistrationSettings({ ok: true }, form({ helpEmail: "help@example.org", maxFiles: "", maxMegabytes: "" }));
    expect(noSource).toMatchObject({ ok: false, errors: { helpProvenance: expect.any(String) } });
    expect(await db.supplierPolicy.findUnique({ where: { organisationId } })).toBeNull();
  });

  it("the two limits go together, and the bank statement's class must be SULIT", async () => {
    const half = await saveRegistrationSettings({ ok: true }, form({ maxFiles: "5", uploadLimitProvenance: "ASSUMED" }));
    expect(half).toMatchObject({ ok: false, errors: { maxMegabytes: expect.any(String) } });
    const notSulit = await saveRegistrationSettings({ ok: true }, form({ statementClassId: internalClass, uploadClassProvenance: "STATED" }));
    expect(notSulit).toMatchObject({ ok: false, errors: { statementClassId: expect.stringMatching(/SULIT/) } });
    expect(await db.supplierPolicy.findUnique({ where: { organisationId } })).toBeNull();
  });

  it("saves what is set, as bytes for the megabytes, and audits it in words without a code or a byte count", async () => {
    const ok = await saveRegistrationSettings({ ok: true }, form({ helpEmail: "help@example.org", helpPhone: "03-0000", helpProvenance: "STATED", maxFiles: "8", maxMegabytes: "30", uploadLimitProvenance: "ASSUMED", uploadClassId: internalClass, statementClassId: sulitClass, uploadClassProvenance: "STATED", onlineDeclarationReplacesPaper: "yes", onlineDeclarationProvenance: "STATED", reason: "Set up" }));
    expect(ok.ok).toBe(true);
    const p = await policy();
    expect(p).toMatchObject({ helpEmail: "help@example.org", uploadMaxFilesPerApplication: 8, supplierUploadClassId: internalClass, supplierBankStatementClassId: sulitClass, onlineDeclarationReplacesPaper: true, helpProvenance: "STATED" });
    expect(p.uploadMaxBytesPerApplication).toBe(BigInt(30) * BigInt(1_048_576));
    const rows = await trail("SupplierPolicy");
    const last = rows.at(-1)!;
    expect(JSON.stringify(last.changes)).toMatch(/Sulit class/);
    expect(JSON.stringify(last.changes)).not.toMatch(/rc_sul|31457280/);
  });

  it("clearing a setting returns it to not set, with its source cleared as well", async () => {
    const ok = await saveRegistrationSettings({ ok: true }, form({ helpProvenance: "", uploadLimitProvenance: "", uploadClassProvenance: "", onlineDeclarationProvenance: "", onlineDeclarationReplacesPaper: "unset" }));
    expect(ok.ok).toBe(true);
    expect(await policy()).toMatchObject({ helpEmail: null, uploadMaxFilesPerApplication: null, uploadMaxBytesPerApplication: null, supplierUploadClassId: null, supplierBankStatementClassId: null, onlineDeclarationReplacesPaper: null, helpProvenance: null, onlineDeclarationProvenance: null });
  });
});

describe("the declarations' wording", () => {
  const text = (over: Record<string, string> = {}) => form({ kind: "GIRO_AUTHORISATION", bodyEn: "We authorise {organisation} to pay.", bodyMs: "Kami membenarkan {organisation} membayar.", provenance: "ASSUMED", governingSource: "A demonstration wording", ...over });

  it("a wording needs its kind, its words and where it comes from", async () => {
    expect(await saveDeclarationText({ ok: true }, text({ bodyEn: " " }))).toMatchObject({ ok: false });
    expect(await saveDeclarationText({ ok: true }, text({ provenance: "" }))).toMatchObject({ ok: false, errors: { provenance: expect.any(String) } });
    expect(await db.declarationText.count({ where: { organisationId } })).toBe(0);
  });

  it("each save of a kind is the next version, in force from the organisation's day", async () => {
    expect((await saveDeclarationText({ ok: true }, text())).ok).toBe(true);
    expect((await saveDeclarationText({ ok: true }, text({ bodyEn: "We authorise {organisation} to pay, version two." }))).ok).toBe(true);
    const rows = await db.declarationText.findMany({ where: { organisationId, kind: "GIRO_AUTHORISATION" }, orderBy: { version: "asc" } });
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows[1]!.issuedOn.toISOString().slice(0, 10)).toBe(todayIn(new Date(), "Asia/Kuala_Lumpur"));
    expect((await trail("DeclarationText")).length).toBe(2);
  });

  it("an unsigned wording may be corrected with a reason; one a supplier signed never is", async () => {
    const v2 = await db.declarationText.findFirstOrThrow({ where: { organisationId, kind: "GIRO_AUTHORISATION", version: 2 } });
    const noReason = await saveDeclarationText({ ok: true }, text({ id: v2.id, bodyEn: "Corrected wording." }));
    expect(noReason).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
    expect((await saveDeclarationText({ ok: true }, text({ id: v2.id, bodyEn: "Corrected wording.", reason: "A typing slip" }))).ok).toBe(true);
    expect((await db.declarationText.findUniqueOrThrow({ where: { id: v2.id } })).bodyEn).toBe("Corrected wording.");
    // A signature names the version it was made on.
    const supplier = await db.supplier.create({ data: { organisationId, reference: `RC/${run}`, registeredName: "S", registrationNo: `RC-${run}`, registrationNoKey: `RC-${run}`, entityTypeCode: "x", countryCode: "x", registeredAddress: "x", companyEmail: "x@x.invalid" } });
    const contact = await db.supplierContact.create({ data: { organisationId, supplierId: supplier.id, name: "C", isPrimary: true } });
    const account = await db.supplierAccount.create({ data: { organisationId, contactId: contact.id, supplierId: supplier.id, loginName: `rc.${run}`, loginKey: `rc.${run}`, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } });
    const app = await db.supplierApplication.create({ data: { organisationId, supplierId: supplier.id, kind: "NEW", receivedOn: new Date("2026-10-01T00:00:00Z"), channel: "PORTAL", recordedAt: new Date(), submittedAt: new Date(), submittedBySupplierAccountId: account.id } });
    await db.registrationDeclaration.create({ data: { organisationId, applicationId: app.id, kind: "GIRO_AUTHORISATION", textId: v2.id, textVersion: 2, textSha256: "a".repeat(64), frozenTextEn: "x", frozenTextMs: "", signatoryName: "N", signatoryDesignation: "D", signedOn: new Date("2026-10-02T00:00:00Z"), signedAt: new Date(), signedBySupplierAccountId: account.id } });
    const signed = await saveDeclarationText({ ok: true }, text({ id: v2.id, bodyEn: "Changed after signing.", reason: "No" }));
    expect(signed).toMatchObject({ ok: false, message: expect.stringMatching(/signed by 1 supplier/) });
    expect((await db.declarationText.findUniqueOrThrow({ where: { id: v2.id } })).bodyEn).toBe("Corrected wording.");
  });

  it("withdrawing a wording is audited and needs the reason", async () => {
    const v1 = await db.declarationText.findFirstOrThrow({ where: { organisationId, kind: "GIRO_AUTHORISATION", version: 1 } });
    expect(await setDeclarationTextRetired({ ok: true }, form({ id: v1.id, retire: "yes" }))).toMatchObject({ ok: false });
    expect((await setDeclarationTextRetired({ ok: true }, form({ id: v1.id, retire: "yes", reason: "Superseded" }))).ok).toBe(true);
    expect((await db.declarationText.findUniqueOrThrow({ where: { id: v1.id } })).retiredOn).not.toBeNull();
  });
});

// Founder, 2026-10-20: the notice is English only. The editor no longer asks for the Malay one, and a save posts the stored Malay through unchanged.
describe("the personal data notice is English only", () => {
  const intake = (over: Record<string, string> = {}) =>
    form({ personalDataNoticeEn: "We use your details to review this application.", personalDataNoticeMs: "", personalDataProvenance: "ASSUMED", portalDailyLimit: "50", portalDailyLimitPerNumber: "3", portalLimitProvenance: "ASSUMED", ...over });

  it("saves with the English notice alone", async () => {
    expect((await savePortalIntake({ ok: true }, intake())).ok).toBe(true);
    expect(await policy()).toMatchObject({ personalDataNoticeEn: "We use your details to review this application.", personalDataNoticeMs: null });
  });

  it("keeps a stored Malay notice when the hidden field carries it", async () => {
    expect((await savePortalIntake({ ok: true }, intake({ personalDataNoticeMs: "Notis yang disimpan." }))).ok).toBe(true);
    expect((await savePortalIntake({ ok: true }, intake({ personalDataNoticeEn: "A revised English notice.", personalDataNoticeMs: "Notis yang disimpan." }))).ok).toBe(true);
    expect(await policy()).toMatchObject({ personalDataNoticeEn: "A revised English notice.", personalDataNoticeMs: "Notis yang disimpan." });
  });
});

describe("a document type's new settings", () => {
  it("records the hint, whether it records a rate and whether several may be lodged, audited in words", async () => {
    const base = { code: `rc_type_${run}`, nameEn: "Sales tax", provenance: "ASSUMED", expires: "no", mandatoryAtRegistration: "no", notApplicableAllowed: "yes" };
    expect((await saveDocumentType({ ok: true }, form({ ...base, hintEn: "The certificate.", recordsRate: "yes", repeatable: "no" }))).ok).toBe(true);
    const t = await db.supplierDocumentType.findFirstOrThrow({ where: { organisationId, code: base.code } });
    expect(t).toMatchObject({ hintEn: "The certificate.", recordsRate: true, repeatable: false });
    // Changing what a type records, once documents of it are on file, needs the reason (it did not before these switches existed): none is on file here, so it saves.
    expect((await saveDocumentType({ ok: true }, form({ ...base, id: t.id, hintEn: "", recordsRate: "unset", repeatable: "unset" }))).ok).toBe(true);
    expect(await db.supplierDocumentType.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ hintEn: null, recordsRate: null, repeatable: null });
    const rows = await trail("SupplierDocumentType");
    expect(JSON.stringify(rows.at(-1)!.changes)).toMatch(/Records a rate/);
  });
});
