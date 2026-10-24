/**
 * Demo data for Wave V (plan step V9, ADR 0045): the contractor's online award return and supply claims paid by delivery order and invoice. Invented throughout; it sets no
 * policy. What the online return also needs on the organisation's side (contractor portal signing "yes", the class for returned award documents, the awardee's contact allowed
 * to sign, and the supply type's route on a loaded database) is configuration, written only by the audited development fill (`npm run pack -- dev-fill --apply`).
 *
 *   Persons in charge  every demo award's exercise names one (WV-8: told of a return sent and a question asked): its requisition's requesting officer, where none is named.
 *                      Backdated to the exercise's opening, as it would have stood: an awarded exercise's details are fixed.
 *   demo_law1          DEMO/AWD/0009/2026, the Results fixture's issued work indent, nothing returned on paper, names its awardee on the register: Demo Paip Services (demo_vnd2, the same
 *                      registration number), whose portal account is demo.supplier6 (active once npm run demo:accounts has run). Once the development fill has run, it may accept the award online.
 *   demo_con3          XI202600799, the supply contract of demo_aw5, names its awardee on the register (demo_ctr5, Contoh Supplies Enterprise, portal account demo.ctr5 waiting
 *                      for activation: npm run demo:accounts), and holds four supply claims sent from it: one with the organisation, one returned with remarks, one verified, and
 *                      one verified and paid by Finance. Written only where the supply type is paid by delivery order and invoice.
 *
 * Applied alone to a loaded database by `npm run demo:wave-v`, and at the end of a full load. Each part is skipped where its rows stand: a second run adds nothing.
 */

import type { PrismaClient } from "../src/generated/prisma/client";
import { diffFields } from "../src/lib/audit/diff";
import { contractLabel, loadContract } from "../src/lib/contract/repo";
import { dayToDate, instantAt, todayIn } from "../src/lib/dates";
import { STAGED_FOR_PROJECT_DOCUMENT } from "../src/lib/documents/staged-for";
import { formatDate, formatOrgDateTime } from "../src/lib/format";
import { projectDocumentNotices } from "../src/lib/inbox/notices";
import { loadSupplyClaims } from "../src/lib/project-docs/supply-read";
import { kindWords, versionLabel } from "../src/lib/project-docs/labels";
import { noticeTargets } from "../src/lib/project-docs/notices";
import { organisationSideOn } from "../src/lib/project-docs/side-store";
import { normaliseRegistrationNo } from "../src/lib/suppliers/identity";
import { loadSupervision } from "../src/lib/supervision/load";
import { DEMO_ACTOR } from "./demo-actor";
import { createRegisteredContractor } from "./demo-contractor";
import { demoPdf, writeDemoDocs } from "./demo-documents";

type Db = PrismaClient;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
const P = "demo_";
const SUPPLY_CON = `${P}con3`;
const FILE_CLASS = { classId: `${P}dc1`, className: "Contract documents", classification: "INTERNAL" as const };
/// The supply contractor's portal account, for `npm run demo:accounts`.
export const WAVE_V_DEMO_ACCOUNTS = [{ loginName: "demo.ctr5", supplierId: `${P}ctr5` }];

export async function loadWaveVDemo(db: Db, organisationId: string): Promise<{ notes: string[] }> {
  const notes: string[] = [];
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true, timeZone: true } });
  const tz = org.timeZone;
  if (!tz) throw new Error("Demo Wave V: the organisation's time zone is not set.");
  notes.push(...(await namePersonsInCharge(db, organisationId)));
  notes.push(...(await linkAwardee(db, organisationId, { awardId: `${P}law1`, key: "ctr9", registeredOn: "2026-03-02" })));
  notes.push(...(await linkAwardee(db, organisationId, { awardId: `${P}aw5`, key: "ctr5", registeredOn: "2026-03-02" })));
  notes.push(...(await loadSupplyClaimsDemo(db, organisationId, org.name, tz)));
  return { notes };
}

/// WV-8: each demo award's exercise names a person in charge, the requisition's requesting officer, where it names none.
async function namePersonsInCharge(db: Db, organisationId: string): Promise<string[]> {
  const exercises = await db.sourcingExercise.findMany({
    where: { organisationId, personInChargeId: null, awards: { some: { id: { startsWith: P } } } },
    orderBy: { id: "asc" },
    select: { id: true, reference: true, title: true, createdAt: true, requisition: { select: { requestingPerson: { select: { id: true, name: true, isActive: true } } } } },
  });
  const named: string[] = [];
  for (const ex of exercises) {
    const person = ex.requisition?.requestingPerson;
    if (!person?.isActive) continue;
    const done = await db.sourcingExercise.updateMany({ where: { id: ex.id, organisationId, personInChargeId: null }, data: { personInChargeId: person.id } });
    if (done.count !== 1) continue;
    await db.auditEntry.createMany({
      data: [{ id: `${ex.id}_au_pic`, organisationId, entity: "SourcingExercise", entityId: ex.id, entityLabel: `${ex.reference} · ${ex.title}`, action: "UPDATE" as const, at: ex.createdAt, changes: diffFields({ personInCharge: null }, { personInCharge: person.name }), reason: "", ...DEMO_ACTOR }] as never,
      skipDuplicates: true,
    });
    named.push(ex.reference);
  }
  return named.length ? [`a person in charge on ${named.length} exercise(s) with a demo award: ${named.join(", ")}`] : [];
}

/// The award names its awardee on the register, as an officer links an award with no party: the registered supplier with the awardee's registration number, or else a new
/// one put on the register with checked bank details (`demo_<key>`). Nothing where the award already names a supplier or is not in this database.
async function linkAwardee(db: Db, organisationId: string, a: { awardId: string; key: string; registeredOn: string }): Promise<string[]> {
  const award = await db.award.findFirst({ where: { id: a.awardId, organisationId }, select: { id: true, reference: true, awardeeName: true, awardeeRegistrationNo: true, awardeeAddress: true, vendorId: true } });
  if (!award || award.vendorId) return [];
  const regNo = award.awardeeRegistrationNo || `DEMO-${a.key.toUpperCase()}-X`;
  const registered = await db.supplier.findFirst({ where: { organisationId, registrationNoKey: normaliseRegistrationNo(regNo), status: "REGISTERED" }, select: { id: true } });
  const own = registered ? null : await db.supplier.findUnique({ where: { id: `${P}${a.key}` }, select: { id: true } });
  const supplierId = registered?.id ?? own?.id ?? (await createRegisteredContractor(db, organisationId, { key: a.key, name: award.awardeeName, registrationNo: regNo, address: award.awardeeAddress || "1 Demo Road, Demo North", registeredOn: a.registeredOn }));
  // Only an award that still names nobody is linked: a concurrent link is not overwritten.
  const linked = await db.award.updateMany({ where: { id: award.id, organisationId, vendorId: null }, data: { vendorId: supplierId } });
  if (linked.count !== 1) return [];
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId }, select: { reference: true, registeredName: true, accounts: { select: { loginName: true, status: true } } } });
  await db.auditEntry.createMany({
    data: [
      {
        id: `${award.id}_au_vendor`, organisationId, entity: "Award", entityId: award.id, entityLabel: `${award.reference} · Awardee's supplier`, action: "UPDATE" as const, at: new Date(),
        changes: [{ field: "supplier", before: null, after: `${supplier.reference} · ${supplier.registeredName}` }, { field: "linkedBy", before: null, after: "the demo loader, as an officer links an award with no party" }], reason: "", ...DEMO_ACTOR,
      },
    ] as never,
    skipDuplicates: true,
  });
  const account = supplier.accounts[0];
  return [`${award.reference} names ${supplier.registeredName} on the register${account ? ` (portal account ${account.loginName}${account.status === "ACTIVE" ? "" : ", waiting for activation: npm run demo:accounts"})` : ""}`];
}

interface Claim {
  id: string;
  invoiceNo: string;
  sent: string;
  mark?: { outcome: "RETURNED" | "TAKEN_UP"; day: string; remarks: string };
  paid?: { day: string; batchNo: string; amount: string; note: string };
  expect: "WITH_ORGANISATION" | "RETURNED" | "VERIFIED" | "PAID";
}

/// Four supply claims on demo_con3, each as the contractor's portal would have sent it (a delivery order and its invoice) and the officer and Finance would have acted on it.
async function loadSupplyClaimsDemo(db: Db, organisationId: string, orgName: string, tz: string): Promise<string[]> {
  const notes: string[] = [];
  const L = todayIn(new Date(), tz)!;
  const D = (days: number) => {
    const t = dayToDate(L);
    t.setUTCDate(t.getUTCDate() + days);
    return t.toISOString().slice(0, 10);
  };
  const T = (day: string, time: string) => instantAt(day, time, tz)!;

  const l = await loadContract(organisationId, SUPPLY_CON);
  if (!l || l.contract.status !== "ACTIVE" || !l.award.vendorId) return ["XI202600799 is not an active contract with its awardee on the register in this database, so no supply claim was added"];
  const type = l.ex.contractTypeCode ? await db.contractType.findFirst({ where: { organisationId, code: l.ex.contractTypeCode }, select: { paymentRoute: true } }) : null;
  if (type?.paymentRoute !== "DELIVERY_ORDER_INVOICE") return ["no supply claim was added: the supply contract type is not paid by delivery order and invoice. Run the development fill (npm run pack -- dev-fill --apply), then this again"];
  const account = await db.supplierAccount.findFirst({ where: { supplierId: l.award.vendorId, organisationId }, orderBy: { id: "asc" }, select: { id: true } });
  const officer = (await organisationSideOn(l, await loadSupervision(SUPPLY_CON, db), L, db)).find((m) => m.mayAct) ?? null;
  const finance = await db.person.findFirst({ where: { id: `${P}p2`, organisationId, isActive: true }, select: { id: true, name: true } });
  if (!account || !officer || !finance) return [`no supply claim was added: ${!account ? "the contractor has no portal account" : !officer ? "nobody may act for the organisation on XI202600799 today" : "the Finance Director (demo_p2) is not an active person here"}`];
  const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: l.award.vendorId }, select: { registeredName: true } });

  const claims: Claim[] = [
    { id: `${P}sic1`, invoiceNo: "INV-DEMO-0141", sent: D(-2), expect: "WITH_ORGANISATION" },
    { id: `${P}sic2`, invoiceNo: "INV-DEMO-0137", sent: D(-9), mark: { outcome: "RETURNED", day: D(-7), remarks: "The delivery order is not signed by the store. Send it again with the store's signature and stamp." }, expect: "RETURNED" },
    { id: `${P}sic3`, invoiceNo: "INV-DEMO-0129", sent: D(-16), mark: { outcome: "TAKEN_UP", day: D(-13), remarks: "" }, expect: "VERIFIED" },
    { id: `${P}sic4`, invoiceNo: "INV-DEMO-0118", sent: D(-30), mark: { outcome: "TAKEN_UP", day: D(-27), remarks: "" }, paid: { day: D(-20), batchNo: "DEMO-B-0907", amount: "18450.00", note: "" }, expect: "PAID" },
  ];

  async function play(tx: Tx, c: Claim) {
    const trail: object[] = [];
    let n = 0;
    const entry = (entity: string, entityId: string, suffix: string, when: Date, changes: object[]) =>
      trail.push({ id: `${c.id}_au${++n}`, organisationId, entity, entityId, entityLabel: `${label} · ${c.invoiceNo}${suffix ? ` · ${suffix}` : ""}`, action: "CREATE", at: when, changes, reason: "", ...DEMO_ACTOR });
    const sentAt = T(c.sent, "10:30");
    await tx.projectDocument.create({ data: { id: c.id, organisationId, contractId: SUPPLY_CON, title: c.invoiceNo, note: "", side: "CONTRACTOR", kind: "SUPPLY_CLAIM", createdBySupplierAccountId: account!.id, createdAt: sentAt } });
    entry("ProjectDocument", c.id, "", sentAt, diffFields(null, { title: c.invoiceNo, note: null, kind: kindWords("SUPPLY_CLAIM"), from: "the contractor", createdOn: formatDate(c.sent) }));
    const versionId = `${c.id}v1`;
    await tx.projectDocumentVersion.create({ data: { id: versionId, organisationId, documentId: c.id, number: 1, note: "", uploadedBySupplierAccountId: account!.id, uploadedAt: sentAt, uploadedOn: dayToDate(c.sent), noApproversAtUpload: true } });
    // The two files, as the upload route staged them and the act pinned each with its purpose (writeDemoDocs writes the store's own trail rows).
    const iso = sentAt.toISOString().slice(0, 16);
    const owner = `${label} · ${c.invoiceNo}, ${versionLabel(1)}`;
    const file = (suffix: string, title: string, purpose: "DELIVERY_ORDER" | "SUPPLY_INVOICE", lines: string[]) => ({
      id: `${c.id}${suffix}`, title, ...FILE_CLASS, createdAt: iso, stagedFor: STAGED_FOR_PROJECT_DOCUMENT,
      versions: [{ id: `${c.id}${suffix}1`, n: 1, bytes: demoPdf(lines), mediaType: "application/pdf", filename: `${title}.pdf`, receivedOn: c.sent, storedAt: iso }],
      attachments: [{ id: `${c.id}${suffix}a`, purpose, owner: { projectDocumentVersionId: versionId }, ownerLabel: owner, versionId: `${c.id}${suffix}1`, at: iso }],
    });
    const files = await writeDemoDocs(
      tx as unknown as Db,
      organisationId,
      [file("do", `delivery-order-${c.invoiceNo.toLowerCase()}`, "DELIVERY_ORDER", ["Delivery order", `For invoice ${c.invoiceNo}: water meters and fittings delivered to the Northern Works Depot store.`]), file("in", c.invoiceNo.toLowerCase(), "SUPPLY_INVOICE", ["Invoice", `${c.invoiceNo}, ${supplier.registeredName}`])],
      `${c.id}_fau`,
      { supplierAccountId: account!.id, name: supplier.registeredName },
    );
    await files.flush();
    entry("ProjectDocumentVersion", versionId, versionLabel(1), sentAt, diffFields(null, { version: versionLabel(1), note: null, files: "a delivery order and an invoice", uploadedOn: formatDate(c.sent), received: formatOrgDateTime(sentAt, tz), sharedAtOnce: "yes: no approver" }));
    if (c.mark) {
      const at = T(c.mark.day, "11:00");
      const decisionId = `${c.id}d1`;
      await tx.projectDocumentDecision.create({ data: { id: decisionId, organisationId, versionId, approverId: null, outcome: c.mark.outcome, remarks: c.mark.remarks, decidedByPersonId: officer!.personId, decidedAt: at, decidedOn: dayToDate(c.mark.day) } });
      entry("ProjectDocumentDecision", decisionId, versionLabel(1), at, diffFields(null, { version: versionLabel(1), mark: c.mark.outcome === "TAKEN_UP" ? "Verified" : "Returned", remarks: c.mark.remarks || null, markedOn: formatDate(c.mark.day) }));
    }
    if (c.paid) {
      const at = T(c.paid.day, "15:00");
      const paymentId = `${c.id}p`;
      await tx.supplyInvoicePayment.create({ data: { id: paymentId, organisationId, contractId: SUPPLY_CON, documentId: c.id, versionId, paidOn: dayToDate(c.paid.day), batchNo: c.paid.batchNo, amount: c.paid.amount, personId: finance!.id, note: c.paid.note, recordedAt: at } });
      entry("SupplyInvoicePayment", paymentId, "paid by Finance", at, diffFields(null, { invoice: c.invoiceNo, batchNo: c.paid.batchNo, paidOn: c.paid.day, amountPaid: c.paid.amount, recordedFor: finance!.name, note: null }));
    }
    await tx.auditEntry.createMany({ data: trail as never });
    // The officer's notice of the claim sent: read once it was marked, unread while it waits.
    const drafts = projectDocumentNotices({ target: noticeTargets({ event: "CONTRACTOR_UPLOADED", versionId, soHolderIds: [officer!.personId], soActingIds: [] }), by: null, contractLabel: label, documentTitle: c.invoiceNo, contractorName: l!.award.awardeeName, versionLabel: versionLabel(1), exerciseId: null, href: `/projects/${SUPPLY_CON}/documents/${c.id}` });
    if (drafts.length) await tx.staffNotice.createMany({ data: drafts.map((d) => ({ ...d, organisationId, raisedByPersonId: null, raisedAt: sentAt, readAt: c.mark ? T(c.mark.day, "11:00") : null })), skipDuplicates: true });
  }

  for (const c of claims) {
    if (await db.projectDocument.findUnique({ where: { id: c.id }, select: { id: true } })) continue;
    await db.$transaction((tx) => play(tx, c), { timeout: 60_000 });
    notes.push(`the supply claim ${c.invoiceNo} on XI202600799`);
  }
  // Read back: each claim reads the state it was written to show, through the rule both screens use.
  const states = new Map((await loadSupplyClaims(db, { organisationId, orgName, contractId: SUPPLY_CON })).map((r) => [r.documentId, r.state]));
  for (const c of claims) if (states.has(c.id) && states.get(c.id) !== c.expect) throw new Error(`Demo Wave V: the supply claim ${c.invoiceNo} reads ${states.get(c.id)}, not ${c.expect}.`);
  return notes;
}
