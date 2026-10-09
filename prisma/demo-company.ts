/**
 * Demo data for Phase 4c: the supplier's own Company workspace. Invented throughout; every configured value is ASSUMED and none is a customer's figure, list, wording or source.
 *
 *   demo_vnd10  an APPLICANT recorded from a paper application, which the office has asked to resubmit (FR-VND-007): its works certificate was found not in order, and its tax
 *               clearance was not given. The deadline is two weeks out. Its portal account (`demo.supplier5`) waits for activation; `npm run demo:accounts` gives it the demonstration
 *               password. It answers the two items from Company > Documents.
 *   demo_ctr13  the contractor of demo_con13 (made by prisma/demo-contractor.ts, bank details checked) gains two certificates in force that are near their expiry, so the bands and the
 *               reminders show (FR-VND-008), and a version 2 of its bank details that an officer found not in order, with the reason, so the screen shows version 1 still in force.
 *   demo_sx3    a DRAFT exercise (its conditions can still be edited) gains a requirement of the Contractors Board entered as a grade and a category (615-C1): the officer's Conditions tab
 *               shows it compared, with its words composed from the needs. It is not on the supplier's Eligibility tab, which lists only exercises the public may read; that tab shows a
 *               compared requirement once an officer has taken an exercise like this one as far as advertising. No requirement of an issued exercise is touched: its conditions are frozen.
 *
 * Applied alone to a database the demonstration is already loaded in by `npm run demo:company`, and at the end of a full load. Nothing is deleted or replaced: a second run adds nothing.
 */

import { randomBytes } from "node:crypto";

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { loginKeyOf } from "../src/lib/auth/identity";
import { hashPassword } from "../src/lib/auth/password";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { issueReference } from "../src/lib/numbering/issue";
import { composeQualifiers } from "../src/lib/tender-docs/requirement-needs";
import { normaliseRegistrationNo } from "../src/lib/suppliers/identity";
import { DEMO_ACTOR } from "./demo-actor";
import { demoPdf, writeDemoDocs } from "./demo-documents";

type Db = PrismaClient;
const P = "demo_";
const OFFICER = { id: `${P}p4`, name: "Daniel Anak Jelani" };

export const COMPANY_DEMO_ACCOUNTS = [{ loginName: "demo.supplier5", supplierId: `${P}vnd10` }] as const;

type Entry = { id: string; organisationId: string; entity: string; entityId: string; entityLabel: string; action: "CREATE" | "UPDATE"; at: Date; changes: object[]; reason: string; unattributed: boolean };

export async function loadCompanyDemo(db: Db, organisationId: string): Promise<{ loaded: boolean; notes: string[] }> {
  const notes: string[] = [];
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo 4c: the organisation's time zone is not set.");
  const L = todayIn(new Date(), tz)!;
  const D = (days: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const T = (day: string, time: string) => instantAt(day, time, tz)!;
  const trail: Entry[] = [];
  let n = 0;
  const entry = (entity: string, entityId: string, entityLabel: string, action: Entry["action"], when: Date, changes: object[], reason = "") => trail.push({ id: `${P}cmpau${++n}`, organisationId, entity, entityId, entityLabel, action, at: when, changes, reason, ...DEMO_ACTOR });
  const flush = async () => {
    if (trail.length) await db.auditEntry.createMany({ data: trail.splice(0) as never });
  };
  const exists = async (table: "supplier" | "supplierDocument", id: string) => (await (db[table] as unknown as { findUnique: (a: unknown) => Promise<unknown> }).findUnique({ where: { id }, select: { id: true } })) != null;
  const pdf = (title: string, who: string) => demoPdf([`${title} (demo scan)`, `Held for ${who}.`, "Not scanned for malware: the demonstration holds the file as it was sent."]);
  const scan = (id: string, title: string, who: string, docId: string, label: string, day: string) => ({
    id: `${P}${id}`, title, classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const, createdAt: `${day}T10:00`,
    versions: [{ id: `${P}${id}v1`, n: 1, bytes: pdf(title, who), mediaType: "application/pdf", filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`, receivedOn: day, storedAt: `${day}T10:00` }],
    attachments: [{ id: `${P}${id}a1`, purpose: "SUPPLIER_DOCUMENT" as const, owner: { supplierDocumentId: docId }, ownerLabel: label, versionId: `${P}${id}v1`, at: `${day}T10:05` }],
  });

  // ---- demo_vnd10: an applicant asked to resubmit.
  if (!(await exists("supplier", `${P}vnd10`))) {
    const acceptedAt = T(D(-12), "10:00");
    const ref = await db.$transaction((tx) => issueReference(tx as never, organisationId, "supplier", dayToDate(todayIn(acceptedAt, tz)!)));
    const name = "Cermat Binaan Sdn Bhd";
    const no = "DEMO-0210-C";
    await db.supplier.create({
      data: {
        id: `${P}vnd10`, organisationId, reference: ref, registeredName: name, registrationNo: no, registrationNoKey: normaliseRegistrationNo(no), entityTypeCode: "private_limited", countryCode: "demo_home",
        registeredAddress: "10 Demo Jalan Tiga, 00400 Demo City", addressLine1: "10 Demo Jalan Tiga", city: "Demo City", postcode: "00400", stateCode: "demo_state_a", incorporatedOn: dayToDate(D(-1500)), companyEmail: "office@cermatbinaan.invalid", createdAt: acceptedAt,
      },
    });
    await db.supplierContact.create({ data: { id: `${P}vct10`, organisationId, supplierId: `${P}vnd10`, name: "Faizal Bin Hamid", designation: "Director", email: "faizal@cermatbinaan.invalid", phone: "012-000 0210", isPrimary: true, createdAt: acceptedAt } });
    await db.supplierAccount.create({ data: { id: `${P}vacc10`, organisationId, contactId: `${P}vct10`, supplierId: `${P}vnd10`, loginName: COMPANY_DEMO_ACCOUNTS[0].loginName, loginKey: loginKeyOf(COMPANY_DEMO_ACCOUNTS[0].loginName), passwordHash: await hashPassword(randomBytes(32).toString("base64url")), passwordChangedAt: acceptedAt, status: "PENDING_ACTIVATION" } });
    const received = D(-10);
    const app = await db.supplierApplication.create({
      data: { id: `${P}vapp10`, organisationId, supplierId: `${P}vnd10`, kind: "NEW", receivedOn: dayToDate(received), channel: "COUNTER", recordedByPersonId: OFFICER.id, recordedAt: T(received, "09:30"), status: "RESUBMISSION_REQUESTED", resubmitBy: dayToDate(D(14)) },
    });
    const doc = (id: string, typeId: string, typeLabel: string, reference: string, authority: string, extra: Record<string, unknown>) =>
      db.supplierDocument.create({
        data: { id: `${P}${id}`, organisationId, supplierId: `${P}vnd10`, typeId, typeLabelSnapshot: typeLabel, applicationId: app.id, reference, issuingAuthority: authority, lodgedOn: dayToDate(received), recordedAt: T(received, "09:40"), recordedByPersonId: OFFICER.id, ...extra },
      });
    await doc("vdoc10a", `${P}sdt1`, "Company registration certificate", "CR-0210", "Demo Companies Registry", { verification: "VERIFIED", verifiedByPersonId: OFFICER.id, verifiedOn: dayToDate(D(-8)), verifiedAt: T(D(-8), "11:00") });
    await doc("vdoc10b", `${P}sdt2`, "Contractor registration certificate", "CB-0210", "Demo Contractors Board", {
      expiresOn: dayToDate(D(400)), verification: "NOT_IN_ORDER", verifiedByPersonId: OFFICER.id, verifiedOn: dayToDate(D(-8)), verifiedAt: T(D(-8), "11:10"), verificationNote: "The scan is cut off at the right edge, so the grade cannot be read (internal note).",
    });
    const decision = await db.applicationDecision.create({
      data: {
        id: `${P}vdec10`, organisationId, applicationId: app.id, outcome: "RESUBMIT", remarks: "Both of these are needed before the application can be approved. Send them by the date given.", resubmitBy: dayToDate(D(14)), decidedByPersonId: OFFICER.id, decidedOn: dayToDate(D(-7)), decidedAt: T(D(-7), "14:00"),
        items: {
          create: [
            { id: `${P}vri10a`, organisationId, supplierDocumentId: `${P}vdoc10b`, labelSnapshot: "Contractor registration certificate CB-0210", remarks: "The scan is cut off at the right edge. Send the whole page, with the grade and categories legible." },
            { id: `${P}vri10b`, organisationId, documentTypeId: `${P}sdt5`, labelSnapshot: "Tax clearance letter", remarks: "Not given. Send the letter that is in force." },
          ],
        },
      },
    });
    entry("Supplier", `${P}vnd10`, `${ref} · ${name}`, "CREATE", acceptedAt, diffFields(null, { reference: ref, registeredName: name, registrationNo: no, status: "Applicant" }));
    entry("SupplierApplication", app.id, `${ref} · Application received ${received}`, "CREATE", T(received, "09:30"), diffFields(null, { kind: "New registration", channel: "Counter", receivedOn: received }));
    entry("ApplicationDecision", decision.id, `${ref} · Application received ${received}`, "CREATE", T(D(-7), "14:00"), diffFields(null, { outcome: "Resubmission requested", resubmitBy: D(14), items: "Contractor registration certificate CB-0210; Tax clearance letter", decidedBy: OFFICER.name }));
    entry("SupplierAccount", `${P}vacc10`, `${ref} · Portal account`, "CREATE", acceptedAt, diffFields(null, { status: "Waiting for activation", demonstration: "give it the demonstration password with npm run demo:accounts" }));
    await flush();
    const e = await writeDemoDocs(
      db,
      organisationId,
      [
        scan("vscan10a", "Company certificate CR-0210", name, `${P}vdoc10a`, `${ref} · Company registration certificate CR-0210`, D(-10)),
        scan("vscan10b", "Contractor certificate CB-0210, cut off", name, `${P}vdoc10b`, `${ref} · Contractor registration certificate CB-0210`, D(-10)),
      ],
      `${P}vscau10_`,
      OFFICER,
    );
    await e.flush();
    notes.push("demo_vnd10, an applicant asked to resubmit two documents");
  }

  // ---- demo_ctr13: certificates near their expiry, and a change of bank details found not in order.
  if (await exists("supplier", `${P}ctr13`)) {
    if (!(await exists("supplierDocument", `${P}cdoc13a`))) {
      const ref = (await db.supplier.findUniqueOrThrow({ where: { id: `${P}ctr13` }, select: { reference: true } })).reference;
      const lodged = D(-200);
      const contractorCert = await db.supplierDocumentType.findUniqueOrThrow({ where: { id: `${P}sdt2` }, select: { nameEn: true } });
      const make = (id: string, typeId: string, label: string, reference: string, authority: string, expires: string, extra: Record<string, unknown> = {}) =>
        db.supplierDocument.create({
          data: { id: `${P}${id}`, organisationId, supplierId: `${P}ctr13`, typeId, typeLabelSnapshot: label, reference, issuingAuthority: authority, validFrom: dayToDate(lodged), expiresOn: dayToDate(expires), lodgedOn: dayToDate(lodged), recordedAt: T(lodged, "09:40"), recordedByPersonId: OFFICER.id, verification: "VERIFIED", verifiedByPersonId: OFFICER.id, verifiedOn: dayToDate(D(-198)), verifiedAt: T(D(-198), "11:00"), ...extra },
        });
      await make("cdoc13a", `${P}sdt5`, "Tax clearance letter", "TC-0013", "Demo Tax Office", D(25));
      await make("cdoc13b", `${P}sdt2`, contractorCert.nameEn, "CB-0013", "Demo Contractors Board", D(55), {
        values: { create: [{ id: `${P}cdv13a`, organisationId, registrationValueId: `${P}rgv3`, kind: "GRADE", codeSnapshot: "G3", labelSnapshot: "Grade G3" }, { id: `${P}cdv13b`, organisationId, registrationValueId: `${P}rgv6`, kind: "CATEGORY", codeSnapshot: "CIV", labelSnapshot: "Civil works" }] },
      });
      entry("SupplierDocument", `${P}cdoc13a`, `${ref} · Tax clearance letter TC-0013`, "CREATE", T(lodged, "09:40"), diffFields(null, { type: "Tax clearance letter", reference: "TC-0013", expiresOn: D(25), lodgedBy: OFFICER.name }));
      entry("SupplierDocument", `${P}cdoc13b`, `${ref} · ${contractorCert.nameEn} CB-0013`, "CREATE", T(lodged, "09:40"), diffFields(null, { type: contractorCert.nameEn, reference: "CB-0013", expiresOn: D(55), codes: "G3 — Grade G3; CIV — Civil works", lodgedBy: OFFICER.name }));
      // Version 2 of its bank details: sent by the supplier, and found not in order by an officer, who said why. Version 1 stays in force. No bank value is written to the trail.
      const v1 = await db.creditorProfile.findUniqueOrThrow({ where: { id: `${P}ctr13_creditor` } });
      await db.creditorProfile.create({
        data: {
          id: `${P}ctr13_creditor2`, organisationId, supplierId: `${P}ctr13`, version: 2, supersedesId: v1.id, beneficiaryName: v1.beneficiaryName, beneficiaryAddress: v1.beneficiaryAddress, beneficiaryIdentityNo: v1.beneficiaryIdentityNo, beneficiaryContactPerson: v1.beneficiaryContactPerson,
          beneficiaryTelephone: v1.beneficiaryTelephone, beneficiaryEmail: v1.beneficiaryEmail, bankCode: "demo_bank_b", bankAccountNo: "000013000099", bankAccountTypeCode: "demo_current", bankAddress: "2 Demo Bank Street, Demo City", enteredBySupplierAccountId: `${P}ctr13_account`,
          createdAt: T(D(-6), "10:00"), submittedAt: T(D(-6), "10:30"), verification: "NOT_IN_ORDER", verifiedByPersonId: OFFICER.id, verifiedOn: dayToDate(D(-5)), verifiedAt: T(D(-5), "15:00"),
          verificationNote: "The account number on the form does not match the statement. Send the form again with the number as it is on the statement.",
        },
      });
      entry("CreditorProfile", `${P}ctr13_creditor2`, `${ref} · Creditor's profile`, "CREATE", T(D(-6), "10:30"), [{ field: "status", before: null, after: "version 2 sent, to change the bank details after registration" }]);
      entry("CreditorProfile", `${P}ctr13_creditor2`, `${ref} · Creditor's profile`, "UPDATE", T(D(-5), "15:00"), [{ field: "status", before: "waiting for an officer", after: "found not in order, with the officer's reason" }]);
      await flush();
      const e = await writeDemoDocs(
        db,
        organisationId,
        [scan("cscan13a", "Tax clearance TC-0013", "the contractor", `${P}cdoc13a`, `${ref} · Tax clearance letter TC-0013`, lodged), scan("cscan13b", "Contractor certificate CB-0013", "the contractor", `${P}cdoc13b`, `${ref} · Contractor registration certificate CB-0013`, lodged)],
        `${P}cscau13_`,
        OFFICER,
      );
      await e.flush();
      notes.push("demo_ctr13, two certificates near their expiry and a change of bank details found not in order");
    }
  } else notes.push("demo_ctr13 is not in this database, so its certificates and bank change were not added");

  // ---- demo_sx3 (a draft): a contractor requirement entered as a grade and a category (615-C1). Only an exercise whose conditions can still be edited is given one.
  const sx3 = await db.sourcingExercise.findUnique({ where: { id: `${P}sx3` }, select: { id: true, reference: true, status: true } });
  const grade = await db.registrationValue.findUnique({ where: { id: `${P}rgv2` }, include: { body: true } });
  const category = await db.registrationValue.findUnique({ where: { id: `${P}rgv6` } });
  if (sx3 && (sx3.status === "DRAFT" || sx3.status === "DOCUMENTS_IN_PREPARATION") && grade && category && grade.bodyId === category.bodyId) {
    const taken = await db.exerciseRegistrationRequirement.count({ where: { exerciseId: sx3.id, bodyCode: grade.body.code, alternativeGroup: 1 } });
    if (taken === 0) {
      const needs = [
        { kind: "GRADE" as const, value: grade },
        { kind: "CATEGORY" as const, value: category },
      ].map((n) => ({ kind: n.kind, valueId: n.value.id, label: `${n.value.code} — ${n.value.nameEn}`, code: n.value.code }));
      const words = composeQualifiers(needs);
      const row = await db.exerciseRegistrationRequirement.create({
        data: {
          id: `${P}sx3_rq1`,
          organisationId,
          exerciseId: sx3.id,
          bodyCode: grade.body.code,
          bodyLabelSnapshot: grade.body.labelEn,
          qualifierLabelSnapshot: grade.body.qualifierLabelEn,
          qualifiers: words,
          qualifiersFromNeeds: true,
          alternativeGroup: 1,
          sortOrder: 0,
          needs: { create: needs.map((n, i) => ({ id: `${P}rqn${i + 1}`, organisationId, registrationValueId: n.valueId, kind: n.kind, codeSnapshot: n.code, labelSnapshot: n.label })) },
        },
      });
      entry("ExerciseRegistrationRequirement", row.id, `${sx3.reference} · Registration required · ${grade.body.labelEn}`, "CREATE", T(D(-3), "09:00"), diffFields(null, { registrationBody: grade.body.labelEn, requiredWithIt: words, compared: needs.map((n) => n.label).join("; "), alternativeGroup: "Group 1" }));
      await flush();
      notes.push("demo_sx3's contractor requirement, entered as a grade and a category");
    }
  }
  return { loaded: notes.length > 0, notes };
}
