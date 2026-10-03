/**
 * The certificate core's write helpers (6.14 increment 1, ADR 0022, 0023). Server-only: each runs inside the
 * caller's transaction, on rows the caller locked through `withLockedCertificate` (Requisition → Exercise →
 * Award → Contract → Certificate; a domain row after, the supplier last), re-runs the pure rule on those
 * locked rows, writes, and audits before/after in the same transaction. A refusal throws `CertificateRefusal`,
 * so the whole transaction rolls back and nothing is half-written. The owning 6.13 module calls these from its
 * own acts; the certificate page's acts call them directly.
 *
 * Nobody is signed in: a signature, a check or an override records the Person the officer names, "recorded on
 * behalf of, not signed". Server stamps are read once, at the act's entry, and passed in as `now` (truncated to
 * the second); `today` is the organisation's day of that instant. The certificate's date is written only by a
 * signature and by its audited correction (a source scan holds that).
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { baselineFor } from "@/lib/contract/baseline";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayToDate, storedDay } from "@/lib/dates";
import { formatSen, parseSen } from "@/lib/money";
import { issueReference, NumberingError } from "@/lib/numbering/issue";
import { ORGANISATION_NAME } from "@/lib/org";
import { isSupervisedRule } from "@/lib/supervision/blocks";
import { supervisedHoldersOn } from "@/lib/supervision/load";
import { fieldsNamed } from "@/lib/templates/merge";

import { certificateDateOf, dateAtIssue, dateCorrectionFaults, earliestCorrectionDay } from "./date";
import { acknowledgeFaults, copiesFor, despatchFaults } from "./distribution";
import { refusalText } from "./fault-text";
import { certificateFieldValues, figureField, mergeFields, type Lang } from "./fields";
import { renderIssue } from "./issue";
import { CERT_WORDS, CHECK_KIND_WORDS, DECISION_WORDS, KIND_WORDS, METHOD_WORDS, ON_BEHALF, STATUS_WORDS } from "./labels";
import { applyOverrides, overrideFaults, routingRatioOf } from "./override";
import { certificateLabel, checksOf, liveBondOf, officeHolders, officeName, routesOf, routingTypeNow, signedOf, templateNow, type LoadedCertificate } from "./repo";
import { correctionsWords, inPrintedOrder, printedBlankFaults, printedRows } from "./printed";
import { pinRefusals, pinRevision, readRevision, type PinContext, type TemplateRevision } from "./revision";
import { sheetFieldValues } from "./sheet-words";
import { checkFaults, freezeRoutingType, readRoutingSnapshot, receivedFaults, routeBounds, routingSheet, typeFaults, type Sheet } from "./routing-sheet";
import { nextSequence } from "./sequence";
import { issueRefusal, sequenceFloor } from "@/lib/payment/at-issue";
import { afterCertificateIssue, approvalOfRecordFaults, variationIssueRefusal } from "@/lib/variation/at-certificate";
import { variationRefusal } from "@/lib/variation/labels";
import { draftSigningFaults } from "./kinds";
import { allSigned, maskedIc, signFaults, type SignInput } from "./signature";
import { readComputedSnapshot, snapshotFaults, type ComputedSnapshot } from "./snapshot";
import { certificateTransition } from "./status";
import type { CertificateKind, CertificateStatus, DeliveryMethod, Finding } from "./types";
import { isPersonRule } from "./types";

/// A refusal: rolls the transaction back. `errors` names a field where the refusal is about one.
export class CertificateRefusal extends Error {
  constructor(
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = "CertificateRefusal";
  }
}

const refuse = (lead: string, fs: readonly Finding[]): never => {
  throw new CertificateRefusal(refusalText(lead, fs));
};
const one = (code: string, data: Record<string, string | number | null> = {}): Finding[] => [{ code, level: "block", data }];
const CHANGED = "The certificate changed while this was being saved. Reload and try again.";

export interface CertCtx {
  tx: Tx;
  l: LoadedCertificate;
  /// The server's instant, read once at the act's entry, to the second.
  now: Date;
  /// The organisation's day of that instant.
  today: string;
}

const labelOf = (c: CertCtx) => certificateLabel(c.l, c.l.cert);
const statusOf = (c: CertCtx) => c.l.cert.status as CertificateStatus;
const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const money = (v: string | null) => (v == null ? null : formatSen(parseSen(v)));

async function audit(c: { tx: Tx; l: LoadedContract }, entity: string, entityId: string, label: string, action: "CREATE" | "UPDATE" | "DELETE", changes: ReturnType<typeof diffFields>, reason = "") {
  if (action === "UPDATE" && changes.length === 0) return;
  await writeAudit(c.tx, { organisationId: c.l.org.id, entity, entityId, entityLabel: label, reason }, action, changes);
}

/// Move the certificate from the status read under the lock, or roll back.
async function moveTo(c: CertCtx, to: CertificateStatus, extra: Prisma.CertificateUpdateManyMutationInput = {}) {
  const from = statusOf(c);
  const t = certificateTransition(from, to);
  if (t) refuse("Not moved:", one(t));
  const moved = await c.tx.certificate.updateMany({ where: { id: c.l.cert.id, status: from }, data: { status: to, ...extra } });
  if (moved.count !== 1) throw new CertificateRefusal(CHANGED);
}

/// The routing sheet as it stands, on the certificate's frozen type.
export function sheetOf(cert: LoadedCertificate["cert"], today: string): Sheet | null {
  const type = readRoutingSnapshot(cert.routingSnapshot);
  if (!type) return null;
  const snap = readComputedSnapshot(cert.computedSnapshot);
  // 614-C5: the ratio from the figures as they were sent for routing, overrides included (none is made after).
  const ratio = snap ? routingRatioOf(snap, applyOverrides(snap, cert.overrides)) : null;
  return routingSheet({ type, receivedOn: day(cert.routingReceivedOn), routes: routesOf(cert.approvalInstances), checks: checksOf(cert.routingChecks), ratio, today });
}

/// What the certificate brings to the pin (M-2): its pinned baseline version's Contract Date and its frozen figures.
export function pinContextOf(cert: LoadedCertificate["cert"], today: string | null = null): PinContext {
  const snap = readComputedSnapshot(cert.computedSnapshot);
  const f = snap ? applyOverrides(snap, cert.overrides) : null;
  // Code review M-1: a sheet value is filled only on a certificate with a routing type, from its sheet once it starts.
  const sheet = today ? sheetOf(cert, today) : null;
  return { contractDate: day(cert.baseline.contractDate), figures: f ? [...f.lines, ...f.totals].map((x) => ({ key: x.key, value: x.value })) : null, routed: cert.routingTypeId != null, sheet: sheet ? sheetFieldValues(sheet, "EN") : null };
}

/// Whether the certificate's figures certify money (an instruction-only delegate may not sign it, FR-PAY-017).
export const certifiesMoney = (s: ComputedSnapshot | null): boolean => !!s && (s.lines.some((l) => l.type === "MONEY") || s.totals.length > 0);

// ------------------------------------------------------------------ opening

export interface OpenInput {
  kind: CertificateKind;
  /// The form it prints on, chosen by the raising module. Null: none chosen yet (the first signature refuses).
  templateId: string | null;
  /// Its routing sheet type. Null: the raising module sends it to no approval route.
  routingTypeId: string | null;
  sectionId: string | null;
  /// The figures, as the raising module computed them. Null: a certificate with none (a letter).
  computed: ComputedSnapshot | null;
}

/**
 * Open a certificate in DRAFT on a locked contract (called by the owning module inside its own act). Pins the
 * baseline version in force today (ADR 0021 §3); refuses a cancelled contract, no version in force, figures
 * not in the certificate's form, a section not of that version, and a routing type not for this kind.
 */
export async function openCertificate(tx: Tx, l: LoadedContract, o: OpenInput, now: Date, today: string): Promise<string> {
  if (l.contract.status === "CANCELLED") refuse("Not opened:", one("CONTRACT_CANCELLED"));
  const versions = l.contract.baselines.filter((b) => b.version != null).map((b) => ({ ...b, recordedOn: b.recordedOn ? storedDay(b.recordedOn) : null }));
  const baseline = baselineFor(versions, today);
  if (!baseline) refuse("Not opened:", one("NO_BASELINE"));
  if (o.computed) {
    const fs = snapshotFaults(o.computed);
    if (fs.length) refuse("Not opened:", fs);
  }
  if (o.sectionId && !baseline!.sections.some((s) => s.id === o.sectionId)) refuse("Not opened:", one("SECTION_NOT_IN_BASELINE"));
  if (o.templateId && !(await tx.documentTemplate.findFirst({ where: { id: o.templateId, organisationId: l.org.id }, select: { id: true } }))) refuse("Not opened:", one("TEMPLATE_NOT_SET"));
  if (o.routingTypeId) {
    const owned = await tx.routingSheetType.findFirst({ where: { id: o.routingTypeId, organisationId: l.org.id }, select: { id: true } });
    const fs = typeFaults(owned ? await routingTypeNow(o.routingTypeId, tx) : null, "CERTIFICATE", o.kind, today);
    if (fs.length) refuse("Not opened:", fs);
  }
  const row = await tx.certificate.create({
    data: {
      organisationId: l.org.id,
      contractId: l.contract.id,
      kind: o.kind,
      templateId: o.templateId,
      routingTypeId: o.routingTypeId,
      sectionId: o.sectionId,
      baselineId: baseline!.id,
      computedSnapshot: (o.computed ?? undefined) as Prisma.InputJsonValue | undefined,
      openedAt: now,
      openedOn: dayToDate(today),
    },
  });
  await audit({ tx, l }, "Certificate", row.id, certificateLabel(l, { id: row.id, kind: o.kind, number: null }), "CREATE", diffFields(null, { certificate: KIND_WORDS[o.kind].en, stage: STATUS_WORDS.DRAFT.en, baselineVersion: `version ${baseline!.version}`, figures: o.computed ? o.computed.rule.en : "none", routed: o.routingTypeId ? "yes" : "no" }));
  return row.id;
}

// ------------------------------------------------------------------ figures

/// Override a computed figure (FR-CRT-003): DRAFT only, never a total, with a justification and a named Person.
/// Both figures go to the trail under their SULIT keys (sulit-fields.ts): History chips them, the export withholds them.
export async function overrideField(c: CertCtx, fieldKey: string, value: string, justification: string, personId: string) {
  const cert = c.l.cert;
  const snap = readComputedSnapshot(cert.computedSnapshot);
  const current = snap ? applyOverrides(snap, cert.overrides) : null;
  const person = await c.tx.person.findFirst({ where: { id: personId, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } });
  // 614-C4 (6.13 Part A step 3): figures that went for approval on a route still pending or approved are frozen.
  const routeOpen = cert.approvalInstances.some((i) => i.status === "PENDING" || i.status === "APPROVED");
  const r = overrideFaults({ status: statusOf(c), snapshot: snap, current, fieldKey, value, justification, personKnown: !!person, routeOpen });
  if (r.faults.length) refuse("Not overridden:", r.faults);
  const line = snap!.lines.find((l) => l.key === fieldKey)!;
  const row = await c.tx.certificateOverride.create({ data: { organisationId: c.l.org.id, certificateId: cert.id, fieldKey, computed: r.computed ?? "", overridden: r.normalised!, justification, personId: person!.id, personName: person!.name, recordedAt: c.now } });
  const shown = (v: string | null) => (line.type === "MONEY" ? money(v) : v);
  await audit(c, "CertificateOverride", row.id, `${labelOf(c)} · ${line.labelEn}`, "CREATE", diffFields(null, { figure: line.labelEn, certificateComputedAmount: shown(r.computed), certificateOverrideAmount: shown(r.normalised), recordedFor: person!.name, recordedOnBehalf: ON_BEHALF }), justification);
}

// ------------------------------------------------------------------ the routing sheet

/// DRAFT → IN_ROUTING: freezes the routing sheet type as it stands; the figures freeze from here (no override).
export async function sendForRouting(c: CertCtx) {
  const cert = c.l.cert;
  if (statusOf(c) !== "DRAFT") refuse("Not sent:", one("NOT_DRAFT"));
  if (!cert.routingTypeId) refuse("Not sent:", one("NO_ROUTING_TYPE"));
  const t = await routingTypeNow(cert.routingTypeId, c.tx);
  const fs = typeFaults(t, "CERTIFICATE", cert.kind, c.today);
  if (fs.length) refuse("Not sent:", fs);
  const frozen = freezeRoutingType(t!, c.today);
  await moveTo(c, "IN_ROUTING", { routingSnapshot: frozen as unknown as Prisma.InputJsonValue });
  await audit(c, "Certificate", cert.id, labelOf(c), "UPDATE", diffFields({ stage: STATUS_WORDS.DRAFT.en }, { stage: STATUS_WORDS.IN_ROUTING.en, routingSheet: frozen.labelEn, checks: frozen.checks.map((x) => x.labelEn).join(", ") || "none", figures: "frozen as computed" }));
}

/// DATE (1): the day the document was received (entered, never in the future, never after its route opened or decided, audited).
export async function recordRoutingReceived(c: CertCtx, received: string) {
  const cert = c.l.cert;
  const sheet = sheetOf(cert, c.today);
  const first = sheet?.iterations[0].checks.map((x) => x.recorded?.on).filter((d): d is string => !!d).sort()[0] ?? null;
  const fs = receivedFaults(statusOf(c) === "IN_ROUTING" && !!sheet, received, c.today, first, routeBounds(routesOf(cert.approvalInstances)));
  if (fs.length) refuse("Not recorded:", fs);
  const before = day(cert.routingReceivedOn);
  const moved = await c.tx.certificate.updateMany({ where: { id: cert.id, status: "IN_ROUTING" }, data: { routingReceivedOn: dayToDate(received), routingReceivedRecordedAt: c.now } });
  if (moved.count !== 1) throw new CertificateRefusal(CHANGED);
  await audit(c, "Certificate", cert.id, labelOf(c), "UPDATE", diffFields({ receivedOn: before }, { receivedOn: received }));
}

/// An internal check on the routing sheet, in this round, in the sheet's order (FR-CRT-007, 009).
export async function recordCheck(c: CertCtx, defOrder: number, personId: string, on: string, note: string) {
  const cert = c.l.cert;
  const sheet = sheetOf(cert, c.today);
  if (!sheet) refuse("Not recorded:", one("SHEET_CLOSED"));
  const slot = sheet!.current.checks.find((x) => x.def.order === defOrder);
  const person = await c.tx.person.findFirst({ where: { id: personId, organisationId: c.l.org.id }, select: { id: true, name: true, isActive: true } });
  const h = slot?.def.officeCode ? await officeHolders(c.l, slot.def.officeCode, on <= c.today ? on : c.today, c.tx) : null;
  const fs = checkFaults({ open: statusOf(c) === "IN_ROUTING", sheet: sheet!, defOrder, person, holders: h ? { holderIds: h.holderIds, delegateIds: h.delegates.map((d) => d.personId) } : null, on, today: c.today });
  if (fs.length) refuse("Not recorded:", fs);
  const row = await c.tx.routingCheck.create({ data: { organisationId: c.l.org.id, certificateId: cert.id, iteration: sheet!.current.n, defOrder, kind: slot!.def.kind, label: slot!.def.labelEn, personId: person!.id, personName: person!.name, on: dayToDate(on), note, recordedAt: c.now } });
  await audit(c, "RoutingCheck", row.id, `${labelOf(c)} · ${slot!.def.labelEn}`, "CREATE", diffFields(null, { check: `${CHECK_KIND_WORDS[slot!.def.kind].en} (${slot!.def.labelEn})`, round: sheet!.current.n, by: person!.name, on, note: note || null, recordedOnBehalf: ON_BEHALF }));
}

/// Into signing: from DRAFT where it has no routing sheet; from IN_ROUTING once its route is approved and every check of this round is recorded.
export async function proceedToSigning(c: CertCtx) {
  const cert = c.l.cert;
  const s = statusOf(c);
  if (s === "DRAFT") {
    if (cert.routingTypeId) refuse("Not sent to signing:", one("ROUTED"));
    // 614-C1: a money-bearing kind needs its latest approval route approved, whatever its routing type. 6.13 Part A
    // step 4: the variation's application and order are approved on the variation's own routes, which the variation
    // module reads (its approval of record); every other kind, its own latest route.
    const own = await approvalOfRecordFaults(c.tx, c.l, cert);
    if (own) {
      if (own.length) throw new CertificateRefusal(variationRefusal("Not sent to signing:", own));
    } else {
      const routes = routesOf(cert.approvalInstances);
      const fs = draftSigningFaults(cert.kind as CertificateKind, routes.length ? routes[routes.length - 1].status : null);
      if (fs.length) refuse("Not sent to signing:", fs);
    }
  } else if (s === "IN_ROUTING") {
    const sheet = sheetOf(cert, c.today)!;
    const fs: Finding[] = [];
    if (!sheet.date1) fs.push(...one("RECEIVED_NOT_RECORDED"));
    if (sheet.routeState === "NONE") fs.push(...one("ROUTE_NOT_OPENED"));
    if (sheet.routeState === "PENDING") fs.push(...one("ROUTE_PENDING"));
    if (sheet.routeState === "REJECTED") fs.push(...one("ROUTE_REJECTED"));
    if (sheet.routeState === "RECALLED") fs.push(...one("ROUTE_RECALLED"));
    const open = sheet.current.checks.filter((x) => !x.recorded).map((x) => x.def.labelEn);
    if (open.length) fs.push(...one("CHECKS_OUTSTANDING", { checks: open.join(", ") }));
    if (fs.length) refuse("Not sent to signing:", fs);
  } else refuse("Not sent to signing:", one("NOT_ALLOWED"));
  await moveTo(c, "SIGNING");
  await audit(c, "Certificate", cert.id, labelOf(c), "UPDATE", diffFields({ stage: STATUS_WORDS[s].en }, { stage: STATUS_WORDS.SIGNING.en }));
}

// ------------------------------------------------------------------ signatures and issue

export interface SignatureInput extends SignInput {
  /// The Person named for a block of the organisation's own.
  personId: string | null;
}

/**
 * Record one signature block, in printed order (FR-CRT-004). The first pins the form (OD-2 A); the dating
 * block writes the certificate's date (FR-CRT-005); the last issues the certificate.
 */
export async function recordSignature(c: CertCtx, input: SignatureInput) {
  const cert = c.l.cert;
  if (statusOf(c) !== "SIGNING") refuse("Not recorded:", one("NOT_SIGNING", { status: statusOf(c) }));
  let rev = readRevision(cert.templateRevision);
  const pinning = !rev;
  if (!rev) {
    // BD-614-21 residual (c): the form is read under a shared lock, after the certificate's, so an edit to its text,
    // blocks or list (which locks it FOR UPDATE) cannot land between reads: a pin never mixes two versions.
    if (cert.templateId) await c.tx.$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = ${cert.templateId} FOR SHARE`;
    const t = await templateNow(cert.templateId, c.tx);
    // M-2: nothing is pinned that could never issue: a field the text prints must have its value at issue.
    const fs = pinRefusals(t, mergeFields(cert.kind), fieldsNamed, pinContextOf(cert, c.today));
    if (fs.length) refuse("Not recorded:", fs);
    rev = pinRevision(t!, c.today);
  }
  const block = rev.blocks.find((b) => b.blockOrder === input.blockOrder);
  const person = block && isPersonRule(block.officeRule) && input.personId ? await c.tx.person.findFirst({ where: { id: input.personId, organisationId: c.l.org.id }, select: { id: true, name: true, isActive: true } }) : null;
  // A named office's holders on the day; the S.O.'s blocks read the contract's supervision (6.13 Part A, BD-613-13).
  const supervised = block && isSupervisedRule(block.officeRule) ? await supervisedHoldersOn(c.l, block.officeRule, c.today, c.tx, cert.kind as CertificateKind) : null;
  const holders = block?.officeRule === "NAMED_OFFICE" && block.officeCode ? await officeHolders(c.l, block.officeCode, c.today, c.tx) : (supervised?.holders ?? null);
  const signed = signedOf(cert);
  const snap = readComputedSnapshot(cert.computedSnapshot);
  // R-10: no block is signed before the certificate was opened, or before its route was approved where it has one.
  const approvedOn = sheetOf(cert, c.today)?.date2 ?? null;
  const r = signFaults(rev.blocks, signed, input, { status: "SIGNING", today: c.today, person, holders, valueBearing: certifiesMoney(snap), openedOn: storedDay(cert.openedOn), approvedOn });
  if (r.faults.length) refuse("Not recorded:", r.faults);
  // The S.O.'s block keeps the office the contract's supervision gave it that day.
  const office = block!.officeRule === "NAMED_OFFICE" ? await officeName(c.l.org.id, block!.officeCode, c.tx) : block!.officeRule === "SO" ? (supervised?.soLabel ?? null) : null;
  const personBlock = isPersonRule(block!.officeRule);
  const sig = await c.tx.certificateSignature.create({
    data: {
      organisationId: c.l.org.id,
      certificateId: cert.id,
      blockOrder: block!.blockOrder,
      blockKind: block!.blockKind,
      blockLabel: block!.labelEn,
      personId: personBlock ? person!.id : null,
      name: personBlock ? person!.name : input.name.trim(),
      officeCode: block!.officeCode,
      officeLabel: office,
      delegationId: r.delegationId,
      icMasked: personBlock ? null : maskedIc(input.icNumber),
      decision: input.decision,
      decisionCap: input.decisionCap,
      refused: input.refused,
      refusalNote: input.refused ? input.refusalNote.trim() : "",
      signedOn: dayToDate(r.signedOn!),
      recordedAt: c.now,
    },
  });
  // FR-CRT-005: the dating block's act dates the certificate. Written here and by its correction only.
  const dates = block!.datesCertificate;
  if (dates || pinning) {
    // Written as one inline literal (undefined leaves a column as it is), so the source scan reads every key.
    const moved = await c.tx.certificate.updateMany({ where: { id: cert.id, status: "SIGNING" }, data: { templateRevision: pinning ? (rev as unknown as Prisma.InputJsonValue) : undefined, pinnedAt: pinning ? c.now : undefined, certificateDate: dates ? dayToDate(r.signedOn!) : undefined } });
    if (moved.count !== 1) throw new CertificateRefusal(CHANGED);
  }
  await audit(c, "CertificateSignature", sig.id, `${labelOf(c)} · ${block!.labelEn}`, "CREATE", diffFields(null, {
    block: block!.labelEn,
    signedBy: sig.name,
    office,
    underDelegation: r.delegationId ? "yes" : null,
    answer: input.decision ? DECISION_WORDS[input.decision].en : null,
    signatureSupportedUpTo: money(input.decisionCap),
    refusedToSign: input.refused ? "yes" : null,
    refusal: input.refused ? input.refusalNote.trim() : null,
    icNumber: sig.icMasked,
    signedOn: r.signedOn,
    datesTheCertificate: dates ? "yes" : null,
    formPinned: pinning ? `${rev.nameEn}${rev.formCode ? ` (${rev.formCode})` : ""}, form version ${rev.bodyVersion}` : null,
    // BD-614-26 as ruled: the pin records which typing corrections it froze with the form.
    typingCorrectionsPinned: pinning && rev.corrections?.length ? correctionsWords(rev.corrections).en : null,
    recordedOnBehalf: ON_BEHALF,
  }));
  const after = [...signed, { blockOrder: block!.blockOrder, personId: sig.personId, name: sig.name, signedOn: r.signedOn!, refused: sig.refused, decision: sig.decision }];
  // M-1: issued with the certificate's date as read under the lock (carrying any correction made while it was
  // being signed), or this act's day where this act is the dating block's.
  if (allSigned(rev.blocks, after)) await issue(c, rev, dateAtIssue(dates ? r.signedOn! : null, day(cert.certificateDate)));
}

/// The last signature: number, sequence, frozen text, copies and the issue snapshot, under the contract's lock.
async function issue(c: CertCtx, rev: TemplateRevision, certificateDate: string | null) {
  const cert = c.l.cert;
  const plan = copiesFor(rev.distribution, { liveBond: liveBondOf(c.l, c.today), consultingEngineer: c.l.contract.consultingEngineer });
  if (plan.faults.length) refuse("Not issued:", plan.faults);
  let number: string;
  try {
    number = await issueReference(c.tx, c.l.org.id, "certificate", dayToDate(c.today));
  } catch (e) {
    if (e instanceof NumberingError) return refuse("Not issued:", one(e.fault));
    throw e;
  }
  const issued = await c.tx.certificate.findMany({ where: { contractId: c.l.contract.id, status: "ISSUED" }, select: { kind: true, sequence: true } });
  // BD-613-41: an interim certificate follows the contract's opening position, where one is recorded.
  const sequence = Math.max(nextSequence(issued, cert.kind), (await sequenceFloor(c.tx, c.l, cert.kind)) + 1);
  // 6.13 Part A step 3 (FR-PAY-014 as ruled): the raising module judges the certificate on the sequence allocated
  // here, under the contract's lock (an interim certificate before the contract is signed; the sequence its figures
  // were worked out for). A refusal rolls the whole signature back.
  // 6.13 Part A step 4: the variation module judges its own kinds at issue the same way (the instruction still
  // approved and consented, the order still covered, an adjustment still on the issued adjustments it was worked out on).
  const refusal = (await issueRefusal(c.tx, c.l, cert, sequence)) ?? (await variationIssueRefusal(c.tx, c.l, cert));
  if (refusal) throw new CertificateRefusal(refusal);
  const snap = readComputedSnapshot(cert.computedSnapshot);
  const figures = snap ? applyOverrides(snap, cert.overrides) : { lines: [], totals: [], overridden: false };
  const b = cert.baseline;
  const values = (lang: Lang) =>
    certificateFieldValues({
      lang,
      organisationName: ORGANISATION_NAME,
      contract: { number: c.l.contract.number, title: c.l.ex.title, contractorName: c.l.award.awardeeName },
      baseline: { contractSum: b.contractSum.toString(), contractDate: day(b.contractDate), completionPeriod: b.completionPeriod, completionUnit: b.completionUnit },
      certificate: { kind: cert.kind, number, sequence, date: certificateDate },
      figures,
    });
  const labelOfField = (k: string) => {
    const f = [...figures.lines, ...figures.totals].find((x) => figureField(x.key) === k);
    return f ? f.labelEn : k;
  };
  const r = renderIssue(rev, cert.kind, values, labelOfField);
  if (r.faults.length) refuse("Not issued:", r.faults);
  // 6.14 increment 2: the printed form's fields with the values they print, in each language, frozen with the issue.
  const sheet = sheetOf(cert, c.today);
  const printedIn = (lang: Lang) => printedRows(rev.fields ?? [], { ...values(lang), ...sheetFieldValues(sheet, lang) }, lang);
  const printedEn = printedIn("EN");
  const printedMs = printedIn("MS");
  const printed = inPrintedOrder(rev.fields ?? []).map((f, i) => ({ key: f.key, labelEn: f.labelEn, labelMs: f.labelMs, bound: f.bound, valueEn: printedEn[i].value, valueMs: printedMs[i].value }));
  // Code review M-1: a field the portal fills is never issued blank.
  const blank = printedBlankFaults(rev.nameEn, printed);
  if (blank.length) refuse("Not issued:", blank);
  for (const t of r.texts) {
    await c.tx.certificateDocument.create({ data: { organisationId: c.l.org.id, certificateId: cert.id, templateId: rev.templateId, templateCode: rev.code, templateName: rev.nameEn, templateFormCode: rev.formCode, templateRevisionDate: rev.revisionDate ? dayToDate(rev.revisionDate) : null, templateBodyVersion: rev.bodyVersion, language: t.language, fields: values(t.language) as Prisma.InputJsonValue, renderedText: t.text, frozenAt: c.now } });
  }
  for (const p of plan.copies) {
    await c.tx.issuedCopy.create({ data: { organisationId: c.l.org.id, certificateId: cert.id, copyNo: p.copyNo, recipientName: p.recipientName, addressedTo: p.addressedTo, stampText: "", recordedAt: c.now, distributionCode: p.distributionCode, mandatory: p.mandatory, ackRequired: p.ackRequired, isOriginal: p.isOriginal } });
  }
  const snapshot = {
    issuedOn: c.today,
    number,
    sequence,
    certificateDate,
    form: { name: rev.nameEn, formCode: rev.formCode, revisionDate: rev.revisionDate, bodyVersion: rev.bodyVersion, pinnedOn: rev.pinnedOn, pageCount: rev.pageCount ?? null },
    // 6.14 increment 2: how many typing corrections changed the form's words (FR-CRT-010), and the printed fields as printed.
    corrected: r.corrected,
    // BD-614-26 as ruled: which corrections changed the words (their record, wrong and right wording).
    corrections: r.applied,
    printed,
    baseline: { version: b.version, reason: b.reason },
    figures: { overridden: figures.overridden, lines: figures.lines.map((l) => ({ key: l.key, value: l.value, computed: l.computed })), totals: figures.totals.map((t) => ({ key: t.key, value: t.value, computed: t.computed })) },
    copies: plan.copies.map((p) => ({ copyNo: p.copyNo, recipient: p.recipientName, addressedTo: p.addressedTo, mandatory: p.mandatory, ackRequired: p.ackRequired, isOriginal: p.isOriginal })),
    skipped: plan.skipped,
  };
  await moveTo(c, "ISSUED", { number, sequence, issuedAt: c.now, issueSnapshot: snapshot as unknown as Prisma.InputJsonValue });
  await audit(c, "Certificate", cert.id, `${labelOf(c)} ${number}`, "UPDATE", diffFields({ stage: STATUS_WORDS.SIGNING.en, number: null }, { stage: STATUS_WORDS.ISSUED.en, number, ordinal: `${KIND_WORDS[cert.kind].en} ${sequence} on this contract`, certificateDate, copies: plan.copies.length, notSent: plan.skipped.map((s) => s.recipientName).join(", ") || null }));
  // 6.13 Part A step 4 (OD-A7 A): an issued adjustment of the contract sum re-resolves the S.O. where the switch says so,
  // in this transaction; a refusal rolls the issue back.
  const after = await afterCertificateIssue(c.tx, c.l, cert, c.now, c.today);
  if (after) throw new CertificateRefusal(after);
}

/**
 * Correct the certificate's date to an earlier day, with a reason (as 6.12 OD-1 A), only while it is being
 * signed (R-9): the last signature then issues it with the corrected day (M-1). Issued, it is final (ADR 0022
 * §3); void, it stays as it was. Never before the certificate was opened or its route approved.
 */
export async function correctCertificateDate(c: CertCtx, proposed: string, reason: string) {
  const cert = c.l.cert;
  const rev = readRevision(cert.templateRevision);
  const fs = dateCorrectionFaults({ status: statusOf(c), current: day(cert.certificateDate), proposed, reason, today: c.today, earliestAllowed: rev ? earliestCorrectionDay(rev.blocks, signedOf(cert)) : null, openedOn: storedDay(cert.openedOn), approvedOn: sheetOf(cert, c.today)?.date2 ?? null });
  if (fs.length) refuse("Not corrected:", fs);
  const moved = await c.tx.certificate.updateMany({ where: { id: cert.id, status: "SIGNING" }, data: { certificateDate: dayToDate(proposed), certificateDateCorrectedFrom: cert.certificateDateCorrectedFrom ?? cert.certificateDate, certificateDateCorrectionReason: reason } });
  if (moved.count !== 1) throw new CertificateRefusal(CHANGED);
  await audit(c, "Certificate", cert.id, labelOf(c), "UPDATE", diffFields({ certificateDate: day(cert.certificateDate) }, { certificateDate: proposed, correctedFrom: day(cert.certificateDateCorrectedFrom ?? cert.certificateDate) }), reason);
}

// ------------------------------------------------------------------ distribution

async function onCopy(c: CertCtx, copyId: string) {
  // The copy is a domain row: locked after the certificate.
  await c.tx.$queryRaw`SELECT id FROM "IssuedCopy" WHERE id = ${copyId} FOR UPDATE`;
  const x = await c.tx.issuedCopy.findFirst({ where: { id: copyId, certificateId: c.l.cert.id } });
  if (!x) throw new CertificateRefusal("That copy is not on this certificate.");
  if (statusOf(c) !== "ISSUED") throw new CertificateRefusal("Copies go out once the certificate is issued.");
  return { row: x, facts: { mandatory: !!x.mandatory, ackRequired: !!x.ackRequired, despatchedOn: day(x.despatchedOn), acknowledgedOn: day(x.acknowledgedOn) } };
}

export async function despatchCopy(c: CertCtx, copyId: string, method: DeliveryMethod, on: string) {
  const { row, facts } = await onCopy(c, copyId);
  // The organisation's day it was issued, as the issue froze it.
  const issuedOn = (c.l.cert.issueSnapshot as { issuedOn?: string } | null)?.issuedOn ?? c.today;
  const fs = despatchFaults(facts, on, c.today, issuedOn);
  if (fs.length) refuse("Not recorded:", fs);
  await c.tx.issuedCopy.update({ where: { id: row.id }, data: { method, despatchedOn: dayToDate(on) } });
  await audit(c, "IssuedCopy", row.id, `${labelOf(c)} · copy ${row.copyNo}`, "UPDATE", diffFields({ sentOn: null }, { sentBy: METHOD_WORDS[method].en, sentOn: on, to: row.addressedTo }));
}

export async function acknowledgeCopy(c: CertCtx, copyId: string, on: string) {
  const { row, facts } = await onCopy(c, copyId);
  const fs = acknowledgeFaults(facts, on, c.today);
  if (fs.length) refuse("Not recorded:", fs);
  await c.tx.issuedCopy.update({ where: { id: row.id }, data: { acknowledgedOn: dayToDate(on) } });
  await audit(c, "IssuedCopy", row.id, `${labelOf(c)} · copy ${row.copyNo}`, "UPDATE", diffFields({ acknowledgedOn: null }, { acknowledgedOn: on }));
}

// ------------------------------------------------------------------ void

/// Void a certificate before issue, with a reason. A route still waiting is refused on the route first.
export async function voidCertificate(c: CertCtx, reason: string) {
  const cert = c.l.cert;
  const s = statusOf(c);
  const t = certificateTransition(s, "VOID");
  if (t) refuse("Not voided:", one(t));
  if (!reason.trim()) throw new CertificateRefusal(refusalText("Not voided:", one("VOID_REASON_REQUIRED")), { reason: "Say why the certificate is void." });
  if (cert.approvalInstances.some((i) => i.status === "PENDING")) refuse("Not voided:", one("VOID_ROUTE_PENDING"));
  await moveTo(c, "VOID", { voidReason: reason.trim(), voidedAt: c.now });
  await audit(c, "Certificate", cert.id, labelOf(c), "UPDATE", diffFields({ stage: STATUS_WORDS[s].en }, { stage: STATUS_WORDS.VOID.en }), reason.trim());
}

/// Words the page shows beside a draft's date and number, kept with the acts that set them.
export const NOT_YET = { number: CERT_WORDS.numberOnIssue, date: CERT_WORDS.dateWhenSigned };
export { certificateDateOf };
