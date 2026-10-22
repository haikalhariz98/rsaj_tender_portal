/**
 * The officer's acts on a whole online application (ADR 0041 D5 to D7, plan section 6.1): verifying what it holds, sending it for decision, deciding a step of its route, the last
 * approval that creates the supplier, and rejecting it. The cores, each taking the caller's transaction, the actor, the server's clock read once at the act's entry, and the act's writer;
 * `src/app/suppliers/portal-actions.ts` reads the form, opens the transaction and revalidates. Nothing here is restated from the register's rules: the file is judged by
 * `submitFaults` and `approveFaults` on `portalFileFacts`, a check by `verifyFaults` and `creditorReviewFaults`, and a decider by `deciderFaults`.
 *
 * Locks: the organisation, where a supplier may be created (the step decisions; the number and the series are serialised on it, as `recordApplication` does), then the online
 * application, then the row the act changes. Every refusal returns words and writes nothing; one found deep inside an approval is thrown as a `Refusal`, rolling the step back with it.
 */

import type { FormState } from "@/components/record-editor";
import type { Prisma } from "@/generated/prisma/client";
import { closeRejected } from "@/lib/approvals/rejection-store";
import { routeRequesterId } from "@/lib/approvals/requester";
import { diffFields } from "@/lib/audit/diff";
import type { Tx } from "@/lib/audit/record";
import { APPLICANT_WORDS } from "@/lib/audit/actor";
import type { ActWriter } from "@/lib/auth/act-writer";
import { carryAttribution } from "@/lib/auth/attribution-store";
import type { AuditActor } from "@/lib/auth/types";
import { routeCoreFields, stepOrigin } from "@/lib/authority/core-routing";
import { personDecisionWrite } from "@/lib/authority/decided-step";
import { actingOffice } from "@/lib/authority/escalation";
import { lockOrganisation } from "@/lib/authority/locks";
import { loadIssue } from "@/lib/authority/load";
import { boundaryOperatorFor } from "@/lib/authority/resolve";
import { dayToDate, storedDay, todayIn } from "@/lib/dates";
import { isLive } from "@/lib/documents/evidence";
import { ACT_LABEL } from "@/lib/labels";
import { issueReference, NumberingError } from "@/lib/numbering/issue";
import { loadDelegations, loadRoster } from "@/lib/people/load";
import { portalFileFacts } from "@/lib/portal/register/file-facts";
import { blocksRecording, flagWords, portalFlags } from "@/lib/portal/queue";
import { CREDITOR_FIELDS, type DeclarationKind } from "@/lib/portal/registration/types";
import { ableToAct, deciderFaults } from "@/lib/requisition/holders";
import { earlierRecordersOf } from "@/lib/requisition/earlier-recorders";
import { inOrder } from "@/lib/series";

import { SUPPLIER_ENTITY } from "./audit-view";
import { creditorReviewFaults, creditorReviewText } from "./creditor-review";
import { expiryCorrected, verifyFaults, type DocumentState } from "./documents";
import { DOCUMENT_STATE_LABEL, OUTCOME_LABEL, REGISTRATION_MATTER, SUPPLIER_DECIDER_TEXT, supplierFaultText, VERIFICATION_LABEL } from "./labels";
import type { SupplierOrg } from "./repo";
import { typeFacts } from "./repo";
import { approveFaults, decisionSnapshot, submitFaults, type FileFacts } from "./review";
import { supplierHolders, supplierRoute } from "./route";
import { blocking, SUPPLIER_REGISTRATION_DOMAIN, SUPPLIER_SERIES_KEY, type Finding, type SupplierStatus, type VerificationState } from "./types";
import { activePerson, audit, CHANGED, Refusal } from "./write";

/// What every core is given: the transaction, who acts, the organisation as read in it, the server's clock, and how the act is attributed (none where a loader calls the core).
export interface PortalActContext {
  tx: Tx;
  actor: AuditActor;
  org: SupplierOrg;
  now: Date;
  act?: ActWriter;
}

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);
const NOT_WAITING: FormState = { ok: false, message: "That online application is not waiting any more: it was decided or set aside already. Nothing was saved." };
const GONE_APP: FormState = { ok: false, message: "That online application no longer exists." };
const NOT_WHOLE: FormState = { ok: false, message: "That online application holds company information only. Record the supplier from it instead." };
const ROUTE_WAITING = "A route is waiting. Decide it first.";
const refuse = (fs: readonly Finding[], lead: string): FormState => ({ ok: false, message: `${lead} ${[...new Set(blocking(fs).map((f) => supplierFaultText(f)))].join(" ")}` });
/// The words an online application is known by in the trail: its reference, never the applicant's name (erased on set aside, and the trail is append-only).
export const portalLabel = (reference: string, what = "Online application") => `${reference} · ${what}`;

/// The application row, locked. Null: there is none of that organisation.
async function lockApplication(tx: Tx, organisationId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "PortalApplication" WHERE id = ${id} AND "organisationId" = ${organisationId} FOR UPDATE`;
  return tx.portalApplication.findFirst({ where: { id, organisationId }, include: { routes: { include: { steps: { orderBy: { sequence: "asc" } } } } } });
}
type LockedApplication = NonNullable<Awaited<ReturnType<typeof lockApplication>>>;

/// The register's holder of the application's number, now, or null.
async function holderOf(tx: Tx, organisationId: string, key: string) {
  if (!key) return null;
  const h = await tx.supplier.findFirst({ where: { organisationId, registrationNoKey: key }, select: { reference: true, registeredName: true, status: true } });
  return h ? { reference: h.reference, name: h.registeredName, status: h.status as SupplierStatus } : null;
}

/// The application's file as the approval rules judge it, read on the locked rows (`portalFileFacts`): the held certificates with their live files and checks, the bank details' check,
/// the false declaration, the organisation's document types and whether the online declaration stands in for the paper.
export async function portalFileOf(tx: Tx, organisationId: string, pa: Pick<LockedApplication, "id" | "status" | "receivedOn" | "routes">, today: string) {
  const [types, docs, creditor, agreements, policy] = await inOrder(
    () => tx.supplierDocumentType.findMany({ where: { organisationId } }),
    () => tx.portalApplicationDocument.findMany({ where: { portalApplicationId: pa.id, organisationId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { attachments: { where: { purpose: "PORTAL_APPLICATION_DOCUMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } } }),
    () => tx.portalApplicationCreditor.findUnique({ where: { portalApplicationId: pa.id }, select: { verification: true, erasedAt: true } }),
    () => tx.registrationDeclaration.findMany({ where: { portalApplicationId: pa.id, organisationId }, select: { kind: true, signedAt: true } }),
    () => tx.supplierPolicy.findUnique({ where: { organisationId }, select: { onlineDeclarationReplacesPaper: true } }),
  );
  const f: FileFacts = portalFileFacts(
    { status: pa.status, receivedOn: storedDay(pa.receivedOn), routePending: pa.routes.some((r) => r.status === "PENDING") },
    docs.map((d) => ({ id: d.id, typeId: d.typeId, typeLabel: d.typeLabelSnapshot, expiresOn: day(d.expiresOn), notApplicable: d.notApplicable, verification: d.verification as VerificationState, verifiedOn: day(d.verifiedOn) })),
    creditor && !creditor.erasedAt ? { verification: creditor.verification as VerificationState } : null,
    agreements.map((a) => ({ kind: a.kind as DeclarationKind, signedAt: a.signedAt.toISOString() })),
    types.map(typeFacts),
    { onlineDeclarationReplacesPaper: policy?.onlineDeclarationReplacesPaper ?? null },
    today,
  );
  return { f, docs, provenanceOf: (typeLabel: string) => types.find((t) => t.nameEn === typeLabel)?.provenance ?? null };
}

/// An application the officer may act on: whole, received, and (where `free`) with no route waiting.
function waitingFault(pa: LockedApplication | null, free: boolean): FormState | null {
  if (!pa) return GONE_APP;
  if (pa.form !== "WHOLE") return NOT_WHOLE;
  if (pa.status !== "RECEIVED") return NOT_WAITING;
  if (free && pa.routes.some((r) => r.status === "PENDING")) return { ok: false, message: `Nothing was saved: ${ROUTE_WAITING}` };
  return null;
}

// ------------------------------------------------------------------ verifying what it holds (FR-VND-004, FR-VND-005)

export interface VerifyPortalDocumentInput {
  documentId: string;
  state: VerificationState | null;
  verifiedOn: string | null;
  note: string;
  /// The expiry as the officer confirms it against the certificate, where the form asked (YYYY-MM-DD or null); absent: not asked.
  expiry?: { to: string | null };
  personId: string | null;
}

/// A named officer's check of a certificate held on the application, against the original (FR-VND-004). Made once; a different expiry is a correction with its reason.
export async function verifyPortalDocument(c: PortalActContext, i: VerifyPortalDocumentInput): Promise<FormState> {
  const { tx, org } = c;
  const found = await tx.portalApplicationDocument.findFirst({ where: { id: i.documentId, organisationId: org.id }, select: { portalApplicationId: true } });
  if (!found) return { ok: false, message: "That certificate is not on an online application." };
  const pa = await lockApplication(tx, org.id, found.portalApplicationId);
  const stop = waitingFault(pa, false);
  if (stop) return stop;
  await tx.$queryRaw`SELECT id FROM "PortalApplicationDocument" WHERE id = ${i.documentId} FOR UPDATE`;
  const d = await tx.portalApplicationDocument.findFirstOrThrow({ where: { id: i.documentId, organisationId: org.id }, include: { attachments: { where: { purpose: "PORTAL_APPLICATION_DOCUMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } } });
  const person = await activePerson(tx, org.id, i.personId);
  const expiry = i.expiry ? { from: day(d.expiresOn), to: i.expiry.to } : null;
  const fs = verifyFaults({ state: i.state, personActive: !!person, verifiedOn: i.verifiedOn, note: i.note, expiry }, { verification: d.verification as VerificationState, lodgedOn: storedDay(pa!.receivedOn), notApplicable: d.notApplicable, scanned: d.attachments.some(isLive) }, org.today);
  if (blocking(fs).length) {
    const errors: Record<string, string> = {};
    const rest: string[] = [];
    for (const f of blocking(fs)) {
      const field = f.code === "PERSON_REQUIRED" ? "personId" : f.code === "DAY_REQUIRED" || f.code === "IN_FUTURE" || f.code === "BEFORE_LODGED" ? "verifiedOn" : f.code === "NOTE_REQUIRED" || f.code === "EXPIRY_REASON_REQUIRED" ? "verificationNote" : f.code === "EXPIRY_NOT_A_DAY" ? "expiresOn" : f.code === "STATE_REQUIRED" ? "verification" : null;
      if (field) errors[field] = supplierFaultText(f);
      else rest.push(supplierFaultText(f));
    }
    return { ok: false, errors, ...(rest.length ? { message: `Nothing was saved: ${rest.join(" ")}` } : {}) };
  }
  const corrected = expiryCorrected(expiry);
  const moved = await tx.portalApplicationDocument.updateMany({
    where: { id: d.id, verification: "NOT_CHECKED" },
    data: { verification: i.state!, verifiedByPersonId: person!.id, verifiedOn: dayToDate(i.verifiedOn!), verifiedAt: c.now, verificationNote: i.note, ...(corrected ? { expiresOn: expiry!.to ? dayToDate(expiry!.to) : null } : {}) },
  });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  const what = portalLabel(pa!.reference, d.title ? `${d.typeLabelSnapshot} · ${d.title}` : d.typeLabelSnapshot);
  if (corrected) await audit(tx, c.actor, org.id, "PortalApplicationDocument", d.id, what, "UPDATE", diffFields({ expiresOn: day(d.expiresOn) }, { expiresOn: expiry!.to }), `Expiry date corrected when the certificate was checked: ${i.note}`);
  await audit(tx, c.actor, org.id, "PortalApplicationDocument", d.id, what, "UPDATE", diffFields({ verification: VERIFICATION_LABEL.NOT_CHECKED.en }, { verification: VERIFICATION_LABEL[i.state!].en, verifiedBy: person!.name, verifiedOn: i.verifiedOn, verificationNote: i.note || null }), i.note);
  await c.act?.write(tx, d.id, { document: { entity: "PortalApplication", id: pa!.id } });
  return { ok: true };
}

export interface VerifyPortalCreditorInput {
  portalApplicationId: string;
  state: VerificationState | null;
  verifiedOn: string | null;
  note: string;
  personId: string | null;
  /// The office the officer held when they signed, for the attribution.
  roleCode?: string | null;
}

/// One officer's check of the bank details held on the application, against the statement (FR-VND-005; signed, as a profile's check is). The caller has judged and logged the reader's
/// right to see them (`portalCreditorNamedFacts`); this re-judges the check itself on the locked rows.
export async function verifyPortalCreditor(c: PortalActContext, i: VerifyPortalCreditorInput): Promise<FormState> {
  const { tx, org } = c;
  const pa = await lockApplication(tx, org.id, i.portalApplicationId);
  const stop = waitingFault(pa, false);
  if (stop) return stop;
  await tx.$queryRaw`SELECT id FROM "PortalApplicationCreditor" WHERE "portalApplicationId" = ${pa!.id} FOR UPDATE`;
  const cr = await tx.portalApplicationCreditor.findUnique({ where: { portalApplicationId: pa!.id }, include: { attachments: { where: { purpose: "PORTAL_APPLICATION_BANK_STATEMENT" }, select: { detachedAt: true, version: { select: { withdrawnAt: true } } } } } });
  if (!cr || cr.erasedAt) return { ok: false, message: "This online application holds no bank details." };
  const person = await activePerson(tx, org.id, i.personId);
  const fs = creditorReviewFaults(
    { state: i.state as "VERIFIED" | "NOT_IN_ORDER" | null, personActive: !!person, verifiedOn: i.verifiedOn, note: i.note },
    { sent: true, verification: cr.verification as VerificationState, sentOn: todayIn(pa!.receivedAt, org.timeZone), statementFiles: cr.attachments.filter(isLive).length },
    org.today,
  );
  if (blocking(fs).length) {
    const errors: Record<string, string> = {};
    const rest: string[] = [];
    for (const f of blocking(fs)) {
      const field = f.code === "STATE_REQUIRED" ? "verification" : f.code === "NOTE_REQUIRED" ? "verificationNote" : f.code === "DAY_REQUIRED" || f.code === "IN_FUTURE" || f.code === "BEFORE_SENT" ? "verifiedOn" : null;
      if (field) errors[field] = creditorReviewText(f).en;
      else rest.push(creditorReviewText(f).en);
    }
    return { ok: false, errors, ...(rest.length ? { message: `Nothing was saved: ${rest.join(" ")}` } : {}) };
  }
  const moved = await tx.portalApplicationCreditor.updateMany({ where: { id: cr.id, verification: "NOT_CHECKED", erasedAt: null }, data: { verification: i.state!, verifiedByPersonId: person!.id, verifiedOn: dayToDate(i.verifiedOn!), verifiedAt: c.now, verificationNote: i.note } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, c.actor, org.id, "PortalApplicationCreditor", cr.id, portalLabel(pa!.reference, "Bank details"), "UPDATE", diffFields({ bankDetails: VERIFICATION_LABEL.NOT_CHECKED.en }, { bankDetails: VERIFICATION_LABEL[i.state!].en, checkedOn: i.verifiedOn, checkNote: i.note || null }), i.note);
  await c.act?.write(tx, cr.id, { document: { entity: "PortalApplication", id: pa!.id }, roleCode: i.roleCode ?? null });
  return { ok: true, message: i.state === "VERIFIED" ? "The bank details are checked and in order." : "The bank details are marked as not in order, with your reasons." };
}

// ------------------------------------------------------------------ sending it for decision (ADR 0041 D5)

/// Send the application for decision: the number not on the register, every mandatory certificate standing (verified by a named officer), then the engine's route on
/// `supplier_registration` for a new registration, with no value, resolved now with the sender as requester. No rule: refused, naming the approval matrix.
export async function sendPortalApplicationForDecision(c: PortalActContext, i: { portalApplicationId: string; personId: string | null }): Promise<FormState> {
  const { tx, org } = c;
  const pa = await lockApplication(tx, org.id, i.portalApplicationId);
  const stop = waitingFault(pa, true);
  if (stop) return stop;
  const person = await activePerson(tx, org.id, i.personId);
  if (!person) return { ok: false, errors: { personId: supplierFaultText({ code: "PERSON_REQUIRED", level: "block" }) } };
  if (!org.today) return { ok: false, message: supplierFaultText({ code: "TIME_ZONE_UNSET", level: "block" }) };
  const flags = portalFlags({ holder: await holderOf(tx, org.id, pa!.registrationNoKey), othersWaiting: 0 });
  if (blocksRecording(flags)) return { ok: false, message: `Not sent: ${flagWords(flags[0]!).text}` };
  const { f } = await portalFileOf(tx, org.id, pa!, org.today);
  const fs = submitFaults(f, org.today);
  if (blocking(fs).length) return refuse(fs, "Not sent:");
  const today = org.today;
  const issue = await loadIssue(org.code, dayToDate(today), undefined, null, tx);
  if (!issue) return { ok: false, message: "No approval matrix is in force, so nobody can be shown as approving a supplier's registration. Issue one under Configuration › Approval matrix." };
  const [roster, delegations] = await inOrder(() => loadRoster(org.code, tx), () => loadDelegations(org.code, tx));
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const available = (pid: string) => !!people.get(pid)?.isActive && !!people.get(pid)?.isAvailable;
  const res = supplierRoute(issue.matrix, SUPPLIER_REGISTRATION_DOMAIN, "NEW", {
    id: person.id,
    holds: (code) => supplierHolders(code, roster, delegations, today).holderIds.includes(person.id),
    ableToAct: (code) => ableToAct(supplierHolders(code, roster, delegations, today), person.id, 0n, available),
  }, REGISTRATION_MATTER);
  if (res.refusal) return { ok: false, message: `Not sent: ${res.refusal.en}` };
  const rule = issue.matrix.rules.find((x) => x.ruleKey === res.ruleKey)!;
  const roleLabel = (code: string) => issue.matrix.roles[code]?.nameEn ?? "An office no longer configured";
  const instance = await tx.approvalInstance.create({
    data: {
      organisationId: org.id,
      matterKind: "SUPPLIER",
      portalApplicationId: pa!.id,
      domain: SUPPLIER_REGISTRATION_DOMAIN,
      cond: "NEW",
      // Routed on no value. Never an invented 0.
      value: null,
      authorityMatrixId: issue.id,
      matrixLabel: issue.label,
      ruleKey: rule.ruleKey,
      ruleLabel: rule.labelEn,
      ruleClause: rule.clause,
      boundaryValue: String(issue.matrix.policy.boundaryValue),
      boundaryInclusive: issue.matrix.policy.boundaryInclusive,
      ruleFollowsBoundarySwitch: rule.followsBoundarySwitch,
      boundaryOperator: boundaryOperatorFor(rule, issue.matrix.policy),
      checkedAgainstMatrix: true,
      warnings: res.warnings as unknown as Prisma.InputJsonValue,
      status: "PENDING",
      openedAt: dayToDate(today),
      // A refusal returns the application to the officer: it stays waiting (ASSUMED, as the register's own route).
      rejectionSnapshotAt: c.now,
      rejectionDestinationId: null,
      rejectionKind: "RETURN_TO_ORIGINATOR",
      rejectionReturnToRoleCode: null,
      rejectionProvenance: "ASSUMED",
      ...routeCoreFields(res.core, c.now),
      steps: { create: res.chain.map((s, n) => ({ sequence: n + 1, roleCode: s.roleCode, roleLabel: roleLabel(s.roleCode), act: s.act, committeeCode: s.committeeCode ?? null, nonDelegable: s.nonDelegable, sourceRuleKey: s.sourceRuleKey, chainOrigin: stepOrigin(s) })) },
    },
  });
  const before = pa!.sentByPersonId ? (await tx.person.findUnique({ where: { id: pa!.sentByPersonId }, select: { name: true } }))?.name ?? null : null;
  await tx.portalApplication.update({ where: { id: pa!.id, organisationId: org.id }, data: { sentByPersonId: person.id } });
  await audit(tx, c.actor, org.id, "ApprovalInstance", instance.id, portalLabel(pa!.reference, "Registration approval route"), "CREATE",
    diffFields(null, { matter: `New registration from online application ${pa!.reference}`, matrix: issue.label, rule: rule.labelEn, routedOn: "No value (supplier matters are not routed on a value)", route: res.chain.map((s) => `${roleLabel(s.roleCode)} (${ACT_LABEL[s.act]?.toLowerCase() ?? "acts"})`).join(" → "), ifRefused: "the application stays waiting" }));
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.onlineApplication, pa!.id, portalLabel(pa!.reference), "UPDATE", diffFields({ sentBy: before }, { sentBy: person.name }));
  await c.act?.write(tx, pa!.id);
  return { ok: true, message: "Sent for decision. The supplier is registered when its route's last step is recorded." };
}

// ------------------------------------------------------------------ a step of its route, and the approval (ADR 0041 D6)

export interface DecidePortalStepInput {
  stepId: string;
  decision: "DONE" | "REJECTED";
  reason: string;
  personId: string | null;
  /// The day the decision is dated.
  decidedOn: Date;
  /// Whether it is recorded for the holder from paper.
  onBehalf: boolean;
}

/// The route a step is on, for the act's entry: the application it decides, where it is an online application's. Read before the transaction, to know what to lock.
export async function portalApplicationOfStep(client: Tx, organisationId: string, stepId: string): Promise<string | null> {
  const s = await client.approvalStep.findFirst({ where: { id: stepId, instance: { organisationId } }, select: { instance: { select: { portalApplicationId: true } } } });
  return s?.instance.portalApplicationId ?? null;
}

/**
 * A named Person's decision on a step of an online application's route: the same checks as the register's own route (`deciderFaults`, the holders organisation-wide, the sender as
 * requester). A refusal returns the application to the officer, waiting. The last step's approval creates the supplier (`approvePortalApplication`) in this transaction.
 */
export async function decidePortalRegistrationStep(c: PortalActContext, i: DecidePortalStepInput): Promise<FormState> {
  const { tx, org } = c;
  const paId = await portalApplicationOfStep(tx, org.id, i.stepId);
  if (!paId) return { ok: false, message: "That step is not on an online application's route." };
  // The organisation first: the last approval issues a supplier reference and checks the register under it, as recording a supplier does. FOR NO KEY UPDATE (`lockOrganisation`), never
  // FOR UPDATE: every audit row takes KEY SHARE on it, so FOR UPDATE would deadlock with an act that holds the application and then writes its trail (review MUST 1).
  await lockOrganisation(tx, org.id);
  const pa = await lockApplication(tx, org.id, paId);
  const stop = waitingFault(pa, false);
  if (stop) return stop;
  const full = pa!.routes.find((x) => x.status === "PENDING" && x.steps.some((s) => s.id === i.stepId));
  if (!full) return { ok: false, message: "That step is not on a registration route awaiting a decision." };
  const step = full.steps.find((s) => s.id === i.stepId)!;
  const [roster, delegations] = await inOrder(() => loadRoster(org.code, tx), () => loadDelegations(org.code, tx));
  const person = await tx.person.findFirst({ where: { id: i.personId ?? "", organisationId: org.id }, select: { id: true, name: true, isActive: true } });
  const decidedOn = storedDay(i.decidedOn);
  const office = actingOffice(step);
  const check = deciderFaults(step, {
    today: org.today,
    holders: office ? supplierHolders(office, roster, delegations, decidedOn) : { scope: null, holderIds: [], delegates: [] },
    declaredConflictIds: step.declaredByPersonId ? [step.declaredByPersonId] : [],
    person,
    requesterId: routeRequesterId("SUPPLIER_APPLICATION", { applicationSenderId: pa!.sentByPersonId }) ?? "",
    recorderId: c.act?.recorderId ?? null,
    endorserIds: [],
    earlier: await earlierRecordersOf(tx, org.id, { otherStepIds: full.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.id) }),
    otherDeciderIds: full.steps.filter((s) => s.id !== step.id && s.decidedByPersonId).map((s) => s.decidedByPersonId!),
    earlierDone: full.steps.filter((s) => s.sequence < step.sequence).every((s) => s.decision === "DONE"),
    decidedOn,
    openedOn: storedDay(full.openedAt),
    value: 0n,
  });
  if (check.faults.length > 0) {
    const texts = check.faults.map((f) => SUPPLIER_DECIDER_TEXT[f].en.replace(/^That person/, person?.name ?? "That person"));
    return ["TIME_ZONE_UNSET", "COMMITTEE_STEP", "NOT_PENDING", "OUT_OF_ORDER"].includes(check.faults[0]) ? { ok: false, message: texts.join(" ") } : { ok: false, errors: { personId: texts.join(" ") } };
  }
  const after = personDecisionWrite({ decision: i.decision, person: { id: person!.id, name: person!.name }, decidedOn: i.decidedOn, delegationId: check.delegationId, reason: i.reason, recordedAt: c.now });
  const done = await tx.approvalStep.updateMany({ where: { id: step.id, decision: "PENDING", actingRoleCode: step.actingRoleCode }, data: after });
  if (done.count !== 1) throw new Refusal(CHANGED);
  const routeLabel = portalLabel(pa!.reference, "Registration approval route");
  await audit(tx, c.actor, org.id, "ApprovalStep", step.id, `${routeLabel} · ${step.roleLabel}`, "UPDATE", diffFields({ decision: step.decision }, { decision: i.decision, decidedBy: person!.name, decidedOn: i.decidedOn, recordedOnBehalf: i.onBehalf ? "not signed" : null, underDelegation: check.delegationId ? "yes" : null }), i.reason);
  await c.act?.write(tx, step.id, { document: { entity: "PortalApplication", id: pa!.id }, roleCode: step.actingRoleCode ?? step.roleCode });
  if (i.decision === "REJECTED") {
    await closeRejected(tx, c.actor, { organisationId: org.id, routeLabel }, full, { apply: "RETURN_TO_ORIGINATOR", source: "CONFIGURED" }, i.reason, "the online application stays waiting: it may be rejected, set aside, or sent again");
    return { ok: true, message: "Refused on its route. The application stays waiting: reject it, set it aside, or send it again." };
  }
  if (!full.steps.every((s) => s.id === step.id || s.decision === "DONE")) return { ok: true };
  return approvePortalApplication(c, pa!, full, { id: person!.id, name: person!.name }, i);
}

/**
 * The last approval (ADR 0041 D6), in the step's transaction, on the organisation and the application locked by the caller: the file judged again; the number checked against the
 * register again; the supplier reference issued; the Supplier (registered today) with its primary contact; the SupplierApplication (new, online, approved, naming this application) with
 * its decision and what it was judged under; the certificates with their codes, checks and files; the bank details as version 1 of the creditor's profile with the statement; the
 * application approved, naming the supplier. Each recorder stays the applicant. The agreements are not copied: readers follow the application.
 */
async function approvePortalApplication(c: PortalActContext, pa: LockedApplication, full: LockedApplication["routes"][number], person: { id: string; name: string }, i: DecidePortalStepInput): Promise<FormState> {
  const { tx, org, now } = c;
  const today = org.today!;
  const { f, provenanceOf } = await portalFileOf(tx, org.id, { ...pa, routes: [] }, today);
  const fs = approveFaults(f, today);
  if (blocking(fs).length) throw new Refusal(refuse(fs, "Not approved, and the step was not recorded: the application no longer stands as it did when sent."));
  const holder = await holderOf(tx, org.id, pa.registrationNoKey);
  if (holder) throw new Refusal({ ok: false, message: `Not approved, and the step was not recorded: ${flagWords({ code: "NUMBER_ON_REGISTER", holder }).text}` });
  let reference: string;
  try {
    reference = await issueReference(tx, org.id, SUPPLIER_SERIES_KEY, dayToDate(today));
  } catch (e) {
    if (e instanceof NumberingError) throw new Refusal({ ok: false, message: e.fault === "SERIES_MISSING" ? "Not approved: no numbering series for suppliers is set, so no reference can be issued. Add the series for suppliers under Configuration › Numbering." : "Not approved: the numbering series for suppliers is not valid. Correct it under Configuration › Numbering." });
    throw e;
  }
  // The route and the application.
  await tx.approvalInstance.update({ where: { id: full.id, organisationId: org.id }, data: { status: "APPROVED", closedAt: now } });
  await audit(tx, c.actor, org.id, "ApprovalInstance", full.id, portalLabel(pa.reference, "Registration approval route"), "UPDATE", diffFields({ status: full.status }, { status: "APPROVED" }), i.reason);

  // The supplier, registered today, with its primary contact: what the applicant typed. A number another act registered while this one waited is refused, never a second supplier.
  let supplier: { id: string; reference: string; registeredName: string };
  try {
    supplier = await tx.supplier.create({
      data: {
        organisationId: org.id,
        reference,
        registeredName: pa.registeredName,
        registrationNo: pa.registrationNo,
        registrationNoKey: pa.registrationNoKey,
        entityTypeCode: pa.entityTypeCode,
        countryCode: pa.countryCode,
        registeredAddress: pa.registeredAddress,
        addressLine1: pa.addressLine1,
        addressLine2: pa.addressLine2,
        city: pa.city,
        postcode: pa.postcode,
        stateCode: pa.stateCode,
        bumiputeraClaimCode: pa.bumiputeraClaimCode,
        incorporatedOn: pa.incorporatedOn,
        companyEmail: pa.companyEmail,
        status: "REGISTERED",
        registeredOn: dayToDate(today),
      },
      select: { id: true, reference: true, registeredName: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Refusal({ ok: false, message: "Not approved, and the step was not recorded: this number is now on the register. Nothing was saved." });
    throw e;
  }
  const contact = await tx.supplierContact.create({ data: { organisationId: org.id, supplierId: supplier.id, name: pa.contactName, designation: pa.contactDesignation, email: pa.contactEmail, phone: pa.contactPhone, isPrimary: true } });
  const app = await tx.supplierApplication.create({
    data: {
      organisationId: org.id,
      supplierId: supplier.id,
      kind: "NEW",
      receivedOn: pa.receivedOn,
      channel: "PORTAL",
      // Nobody recorded it: the applicant sent it. Who sent it for decision is the route's requester.
      recordedByPersonId: null,
      recordedAt: pa.receivedAt,
      status: "APPROVED",
      submittedByPersonId: pa.sentByPersonId,
      decidedAt: now,
      portalApplicationId: pa.id,
    },
    include: { supplier: { select: { reference: true } } },
  });
  const snap = decisionSnapshot(f, today, provenanceOf);
  const dec = await tx.applicationDecision.create({ data: { organisationId: org.id, applicationId: app.id, outcome: "APPROVE", decidedByPersonId: person.id, decidedOn: i.decidedOn, decidedAt: now, policySnapshot: snap as unknown as Prisma.InputJsonValue } });
  await c.act?.writeAlso(tx, "ApplicationDecision.decidedBy", dec.id);
  // The officer who sent it is the new application's sender; carried, not acted again (the sending was attributed on the online application).
  if (pa.sentByPersonId) await carryAttribution(tx, org.id, { entity: "SupplierApplication", slot: "submittedBy", entityId: app.id, personId: pa.sentByPersonId });
  const supplierWhat = (what: string) => `${supplier.reference} · ${what}`;
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.supplier, supplier.id, supplierWhat(supplier.registeredName), "CREATE",
    diffFields(null, { reference, registeredName: supplier.registeredName, registrationNo: pa.registrationNo, fromOnlineApplication: pa.reference, companyEmail: pa.companyEmail, status: "Registered", registeredOn: today }));
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.contact, contact.id, supplierWhat("Primary contact"), "CREATE", diffFields(null, { contactName: contact.name, contactDesignation: contact.designation || null, contactEmail: contact.email || null, contactPhone: contact.phone || null, primary: true }));
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.application, app.id, `${supplier.reference} · Application received ${day(pa.receivedOn)}`, "CREATE",
    diffFields(null, { kind: "New registration", channel: `Online application ${pa.reference}`, receivedOn: day(pa.receivedOn), sentBy: APPLICANT_WORDS, status: "APPROVED" }));
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.decision, dec.id, `${supplier.reference} · Application received ${day(pa.receivedOn)}`, "CREATE",
    diffFields(null, { outcome: OUTCOME_LABEL.APPROVE.en, decidedBy: person.name, decidedOn: i.decidedOn, recordedOnBehalf: i.onBehalf ? "not signed" : null, judgedUnder: snap.mandatory.map((m) => `${m.type}: ${DOCUMENT_STATE_LABEL[m.state as DocumentState].en}`).join("; ") || "No mandatory document type" }));

  // The certificates, as sent and as checked, with their codes and their files moved to them. The applicant stays their recorder.
  const reason = `Moved to supplier ${supplier.reference} when online application ${pa.reference} was approved`;
  const held = await tx.portalApplicationDocument.findMany({
    where: { portalApplicationId: pa.id, organisationId: org.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { values: true, attachments: { where: { purpose: "PORTAL_APPLICATION_DOCUMENT", detachedAt: null }, select: { id: true, versionId: true } } },
  });
  for (const d of held) {
    const doc = await tx.supplierDocument.create({
      data: {
        organisationId: org.id,
        supplierId: supplier.id,
        typeId: d.typeId,
        typeLabelSnapshot: d.typeLabelSnapshot,
        applicationId: app.id,
        reference: d.reference,
        issuingAuthority: d.issuingAuthority,
        title: d.title,
        expiresOn: d.notApplicable ? null : d.expiresOn,
        notApplicable: d.notApplicable,
        ratePercent: d.ratePercent,
        lodgedOn: pa.receivedOn,
        recordedAt: pa.receivedAt,
        recordedByPersonId: null,
        recordedBySupplierAccountId: null,
        recordedByPortalApplicationId: pa.id,
        verification: d.verification,
        verifiedByPersonId: d.verifiedByPersonId,
        verifiedOn: d.verifiedOn,
        verifiedAt: d.verifiedAt,
        verificationNote: d.verificationNote,
        ...(d.values.length ? { values: { create: d.values.map((v) => ({ organisationId: org.id, registrationValueId: v.registrationValueId, kind: v.kind, codeSnapshot: v.codeSnapshot, labelSnapshot: v.labelSnapshot })) } } : {}),
      },
    });
    for (const a of d.attachments) {
      await tx.documentAttachment.update({ where: { id: a.id }, data: { detachedAt: now, detachReason: reason } });
      await tx.documentAttachment.create({ data: { organisationId: org.id, purpose: "SUPPLIER_DOCUMENT", versionId: a.versionId, supplierDocumentId: doc.id } });
    }
    // The check was the named officer's act on the held row, attributed there; the promoted row carries it, so it reads as that officer's and never as missing.
    if (d.verifiedByPersonId) await carryAttribution(tx, org.id, { entity: "SupplierDocument", slot: "verifiedBy", entityId: doc.id, personId: d.verifiedByPersonId });
    await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.document, doc.id, supplierWhat(d.title ? `${d.typeLabelSnapshot} · ${d.title}` : d.typeLabelSnapshot), "CREATE",
      diffFields(null, {
        type: d.typeLabelSnapshot,
        title: d.title || null,
        reference: d.reference || null,
        issuingAuthority: d.issuingAuthority || null,
        expiresOn: d.notApplicable ? null : day(d.expiresOn),
        notApplicable: d.notApplicable,
        ratePercent: d.ratePercent ? d.ratePercent.toString() : null,
        codes: d.values.length ? d.values.map((v) => `${v.codeSnapshot} — ${v.labelSnapshot}`).join("; ") : null,
        files: d.attachments.length,
        verification: VERIFICATION_LABEL[d.verification as VerificationState].en,
        lodgedBy: APPLICANT_WORDS,
      }));
  }

  // The bank details, as version 1 of the creditor's profile, sent when the application was, with the officer's check carried and the statement moved to it.
  const cr = await tx.portalApplicationCreditor.findUnique({ where: { portalApplicationId: pa.id }, include: { attachments: { where: { purpose: "PORTAL_APPLICATION_BANK_STATEMENT", detachedAt: null }, select: { id: true, versionId: true } } } });
  if (cr && !cr.erasedAt) {
    const profile = await tx.creditorProfile.create({
      data: {
        organisationId: org.id,
        supplierId: supplier.id,
        version: 1,
        ...Object.fromEntries(CREDITOR_FIELDS.map((k) => [k, cr[k]])),
        enteredBySupplierAccountId: null,
        enteredByPortalApplicationId: pa.id,
        submittedAt: pa.receivedAt,
        verification: cr.verification,
        verifiedByPersonId: cr.verifiedByPersonId,
        verifiedOn: cr.verifiedOn,
        verifiedAt: cr.verifiedAt,
        verificationNote: cr.verificationNote,
      },
    });
    for (const a of cr.attachments) {
      await tx.documentAttachment.update({ where: { id: a.id }, data: { detachedAt: now, detachReason: reason } });
      await tx.documentAttachment.create({ data: { organisationId: org.id, purpose: "SUPPLIER_BANK_STATEMENT", versionId: a.versionId, creditorProfileId: profile.id } });
    }
    if (cr.verifiedByPersonId) await carryAttribution(tx, org.id, { entity: "CreditorProfile", slot: "verifiedBy", entityId: profile.id, personId: cr.verifiedByPersonId });
    // No bank detail in the trail: only that version 1 exists, from where, and its check.
    await audit(tx, c.actor, org.id, "CreditorProfile", profile.id, supplierWhat("Creditor's profile"), "CREATE", diffFields(null, { version: 1, enteredBy: APPLICANT_WORDS, fromOnlineApplication: pa.reference, bankDetails: VERIFICATION_LABEL[cr.verification as VerificationState].en, statements: cr.attachments.length }));
  }

  const moved = await tx.portalApplication.updateMany({ where: { id: pa.id, status: "RECEIVED" }, data: { status: "APPROVED", acceptedSupplierId: supplier.id, decidedAt: now, decidedByPersonId: person.id } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  // Who decided the application is the last step's decider, whose act is attributed on the step and on the decision (`ApplicationDecision.decidedBy`). The application's own column
  // is carried for that person: the step may be recorded from paper, and this slot is not paper-capable, so it is never written as a second act beside it.
  if (c.act) await carryAttribution(tx, org.id, { entity: "PortalApplication", slot: "decidedBy", entityId: pa.id, personId: person.id });
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.onlineApplication, pa.id, portalLabel(pa.reference), "UPDATE", diffFields({ status: "Received" }, { status: "Approved", supplier: supplier.reference, decidedBy: person.name }), i.reason);
  return { ok: true, message: `Approved: ${supplier.registeredName} is registered as ${supplier.reference}. Open its portal account from the supplier's page when the office is ready.` };
}

// ------------------------------------------------------------------ rejecting it (ADR 0041 D7)

/// Reject the application, with the reasons as written (FR-VND-007), verbatim. No supplier is created; reapplying is a fresh application. Refused while a route is waiting.
export async function rejectPortalApplication(c: PortalActContext, i: { portalApplicationId: string; reasons: string; personId: string | null }): Promise<FormState> {
  const { tx, org } = c;
  const pa = await lockApplication(tx, org.id, i.portalApplicationId);
  const stop = waitingFault(pa, true);
  if (stop) return stop;
  if (!i.reasons.trim()) return { ok: false, errors: { reason: "Write the reasons, as they will be given to the applicant." } };
  const person = await activePerson(tx, org.id, i.personId);
  if (!person) return { ok: false, errors: { personId: supplierFaultText({ code: "PERSON_REQUIRED", level: "block" }) } };
  const moved = await tx.portalApplication.updateMany({ where: { id: pa!.id, status: "RECEIVED" }, data: { status: "REJECTED", decidedAt: c.now, decidedByPersonId: person.id, decisionRemarks: i.reasons } });
  if (moved.count !== 1) throw new Refusal(CHANGED);
  await audit(tx, c.actor, org.id, SUPPLIER_ENTITY.onlineApplication, pa!.id, portalLabel(pa!.reference), "UPDATE", diffFields({ status: "Received" }, { status: "Rejected", decidedBy: person.name }), i.reasons);
  await c.act?.write(tx, pa!.id);
  return { ok: true, message: "Rejected. Give the reasons to the applicant: nothing is sent from here." };
}
