import { beforeAll, describe, expect, it, vi } from "vitest";

import type { StaffActor } from "@/lib/auth/types";
import { todayIn } from "@/lib/dates";
import { db } from "@/lib/db";
import { makePerson, randomId } from "@/lib/test-db/auth-fixtures";

/**
 * RSEC-3(b), on the paper and signed-in wizard routes, through the screen's own action (`decideRegistrationStep`), against the scratch database: whoever checked a certificate or the bank
 * details on the application being decided decides no step of its route, as the officer named on the check, as the one who recorded the check for them, or as the officer recording the
 * decision for someone else. The refusal names the person and why. The online route's own core is held by `portal-application-acts.db.test.ts`.
 */

const h = vi.hoisted(() => ({ who: null as StaffActor | null }));

vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const base = actorModule();
  return { ...base, staffForAct: async () => ({ ok: true as const, actor: h.who! }), requireStaff: async () => h.who! };
});
vi.mock("@/app/_auth/act", async () => {
  const { actModule } = await import("@/lib/test-support/staff");
  return actModule({ now: new Date(), paperSignatureRecording: "ALLOWED" }).module;
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import { decideRegistrationStep } from "./actions";

const TZ = "Asia/Kuala_Lumpur";
const run = randomId();
const OFFICE = `RV_OFFICE_${run}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = todayIn(new Date(), TZ)!;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

let organisationId = "";
let typeId = "";
let giroTextId = "";
const p = { holder: "", checker: "", keyer: "", sender: "", plain: "" };
const names: Record<string, string> = {};

const staff = (personId: string): StaffActor =>
  ({
    kind: "STAFF",
    accountId: `acc_${personId}`,
    sessionId: `ses_${personId}`,
    personId,
    personName: names[personId] ?? "Officer",
    jobTitle: null,
    isAdministrator: false,
    organisationId,
    organisationCode: `RV_${run}`,
    organisationTimeZone: TZ,
    offices: [{ roleCode: OFFICE, scope: null }],
    // Recording a decision from paper needs this permission: the refusal tested below is the check's bar, never the missing permission.
    permissions: new Set<string>(["acts.recordOnBehalf"]),
    stepUpAt: null,
    sessionCreatedAt: new Date(),
    sourceAddress: "203.0.113.8",
    mustChangePassword: false,
  }) as unknown as StaffActor;

beforeAll(async () => {
  const org = await db.organisation.create({ data: { code: `RV_${run}`, name: "Verifier bar test organisation", timeZone: TZ } });
  organisationId = org.id;
  for (const k of Object.keys(p) as (keyof typeof p)[]) {
    const person = await makePerson(organisationId, `Verifier ${k} ${run}`);
    p[k] = person.id;
    names[person.id] = `Verifier ${k} ${run}`;
  }
  await db.authorityRole.create({ data: { organisationId, code: OFFICE, nameEn: `Office ${run}`, nameMs: `Pejabat ${run}` } });
  // Everyone but the sender holds the office: each refusal below is the check's bar alone, never "does not hold the office".
  for (const k of ["holder", "checker", "keyer", "plain"] as const) await db.roleAssignment.create({ data: { personId: p[k], roleCode: OFFICE, effectiveFrom: day("2020-01-01") } });
  typeId = (await db.supplierDocumentType.create({ data: { organisationId, code: `rv_type_${run}`, nameEn: "Registry certificate", provenance: "ASSUMED", expires: false, mandatoryAtRegistration: false, notApplicableAllowed: false } })).id;
  giroTextId = (await db.declarationText.create({ data: { organisationId, kind: "GIRO_AUTHORISATION", version: 1, bodyEn: "x", provenance: "ASSUMED", issuedOn: day("2026-01-01") } })).id;
});

/// A supplier with one open application of the channel, sent by the sender, whose route has two pending steps of the office (so deciding the first never approves the application).
async function application(channel: "COUNTER" | "PORTAL") {
  const n = randomId();
  const s = await db.supplier.create({ data: { organisationId, reference: `RV/${n}`, registeredName: `Supplier ${n}`, registrationNo: `RV-${n}`, registrationNoKey: `RV-${n}`.toUpperCase(), entityTypeCode: "x", countryCode: "x", registeredAddress: "Somewhere", companyEmail: "rv@x.invalid" } });
  const app = await db.supplierApplication.create({ data: { organisationId, supplierId: s.id, kind: "NEW", status: "RECEIVED", receivedOn: day("2026-10-01"), channel, recordedByPersonId: channel === "COUNTER" ? p.sender : null, recordedAt: new Date("2026-10-01T02:00:00Z"), submittedByPersonId: p.sender } });
  const route = await db.approvalInstance.create({ data: { organisationId, matterKind: "SUPPLIER", supplierApplicationId: app.id, domain: "supplier_registration", status: "PENDING", openedAt: day("2026-10-02") } });
  const first = await db.approvalStep.create({ data: { instanceId: route.id, sequence: 1, roleCode: OFFICE, roleLabel: "Check", act: "R" } });
  await db.approvalStep.create({ data: { instanceId: route.id, sequence: 2, roleCode: OFFICE, roleLabel: "Approve", act: "A" } });
  return { supplierId: s.id, applicationId: app.id, stepId: first.id };
}

/// A certificate lodged with the application, checked by the person named.
async function checkedCertificate(supplierId: string, applicationId: string, verifiedByPersonId: string) {
  return db.supplierDocument.create({
    data: { organisationId, supplierId, typeId, typeLabelSnapshot: "Registry certificate", applicationId, lodgedOn: day("2026-10-01"), recordedByPersonId: p.sender, recordedAt: new Date("2026-10-01T02:00:00Z"), verification: "VERIFIED", verifiedByPersonId, verifiedOn: day("2026-10-01"), verifiedAt: new Date("2026-10-01T03:00:00Z") },
  });
}

const decide = (actor: string, stepId: string, extra: Record<string, string> = {}) => {
  h.who = staff(actor);
  return decideRegistrationStep({ ok: true }, form({ stepId, decision: "DONE", decidedOn: today, reason: "", personId: actor, "personId:password": "the officer's own password", ...extra }));
};
const stepState = async (id: string) => (await db.approvalStep.findUniqueOrThrow({ where: { id } })).decision;

describe("whoever checked what a registration holds decides no step of its route (RSEC-3(b))", () => {
  it("paper: the officer who checked a certificate lodged with it is refused, by name and reason; another holder decides", async () => {
    const a = await application("COUNTER");
    await checkedCertificate(a.supplierId, a.applicationId, p.checker);
    const refused = await decide(p.checker, a.stepId);
    expect(refused.ok).toBe(false);
    expect(refused.errors?.personId).toContain(names[p.checker]);
    expect(refused.errors?.personId).toMatch(/checked a certificate or the bank details of this application/);
    expect(await stepState(a.stepId)).toBe("PENDING");
    expect(await decide(p.holder, a.stepId)).toMatchObject({ ok: true });
    expect(await stepState(a.stepId)).toBe("DONE");
  });

  it("signed-in wizard: the officer who checked the bank details its GIRO authorisation was signed for is refused", async () => {
    const a = await application("PORTAL");
    const c = await db.supplierContact.create({ data: { organisationId, supplierId: a.supplierId, name: "Contact", isPrimary: true } });
    const login = `rv.${randomId()}`.toLowerCase();
    const account = await db.supplierAccount.create({ data: { organisationId, contactId: c.id, supplierId: a.supplierId, loginName: login, loginKey: login, passwordHash: "x", passwordChangedAt: new Date(), status: "ACTIVE" } });
    const profile = await db.creditorProfile.create({
      data: { organisationId, supplierId: a.supplierId, version: 1, beneficiaryName: "Beneficiary", bankCode: "b", bankAccountNo: "1234567890", bankAccountTypeCode: "c", enteredBySupplierAccountId: account.id, submittedAt: new Date("2026-10-01T02:00:00Z"), verification: "VERIFIED", verifiedByPersonId: p.checker, verifiedOn: day("2026-10-01"), verifiedAt: new Date("2026-10-01T03:00:00Z") },
    });
    await db.registrationDeclaration.create({ data: { organisationId, applicationId: a.applicationId, creditorProfileId: profile.id, kind: "GIRO_AUTHORISATION", textId: giroTextId, textVersion: 1, textSha256: "0".repeat(64), frozenTextEn: "x", signatoryName: "S", signatoryDesignation: "D", signedOn: day("2026-10-01"), signedAt: new Date("2026-10-01T02:00:00Z"), signedBySupplierAccountId: account.id } });
    const refused = await decide(p.checker, a.stepId);
    expect(refused.errors?.personId).toContain(names[p.checker]);
    expect(refused.errors?.personId).toMatch(/checked a certificate or the bank details/);
    expect(await stepState(a.stepId)).toBe("PENDING");
    // A check of another application's certificate is no bar here.
    expect(await decide(p.plain, a.stepId)).toMatchObject({ ok: true });
  });

  it("the officer who recorded a check for the person it names is barred too, and so is a checker recording the decision for someone else", async () => {
    const a = await application("COUNTER");
    const doc = await checkedCertificate(a.supplierId, a.applicationId, p.holder);
    // The check was keyed from paper by the keyer, for the holder it names.
    await db.actAttribution.create({ data: { organisationId, entity: "SupplierDocument", entityId: doc.id, slot: "verifiedBy", subjectPersonId: p.holder, recordedByPersonId: p.keyer, mode: "RECORDED_ON_BEHALF", paperReference: "Check sheet 4" } });
    const keyed = await decide(p.keyer, a.stepId);
    expect(keyed.errors?.personId).toContain(names[p.keyer]);
    expect(await stepState(a.stepId)).toBe("PENDING");
    // The checker, signed in, records the plain holder's decision from paper: refused on the checker's own account.
    const b = await application("COUNTER");
    await checkedCertificate(b.supplierId, b.applicationId, p.checker);
    h.who = staff(p.checker);
    const forSomeone = await decideRegistrationStep({ ok: true }, form({ stepId: b.stepId, decision: "DONE", decidedOn: today, reason: "", personId: p.plain, "personId:onBehalf": "on", "personId:paperReference": "Minute 7" }));
    expect(forSomeone.ok).toBe(false);
    expect(JSON.stringify(forSomeone)).toMatch(/You checked a certificate or the bank details of this application/);
    expect(await stepState(b.stepId)).toBe("PENDING");
  });
});
