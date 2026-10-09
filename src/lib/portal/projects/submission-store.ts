import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { attributeSupplierAct } from "@/lib/auth/supplier-attribution-store";
import type { AuditActor, SupplierActor } from "@/lib/auth/types";
import { actStatusFault } from "@/lib/contract/act-status";
import { contractLabel, withLockedContract, type LoadedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { contractorSubmissionNotices } from "@/lib/inbox/notices";
import { writeNotices } from "@/lib/inbox/store";
import { formatMoney, senToDecimalString } from "@/lib/money";
import { loadPostAwardPolicy, loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { SUBMISSION_KIND_WORDS } from "./labels";
import { portalSigningFault } from "./certificates";
import { amountSen, dueDayOf, KIND_SHAPE, SUBMISSION_WINDOW_MINUTES, submissionFaults, submissionFloodFault, type LineInput } from "./submission";
import { ProjectRefused, type ProjectFinding, type SubmissionKind } from "./types";
import { supplierHoldsContract } from "./visibility";

/**
 * A contractor sends a submission from its portal account (Phase 4e; spec section 5.3; 6.14 OD-6, BD-614-31). One transaction under the contract's lock (requisition, exercise, award,
 * contract: the canonical order, `withLockedContract`), the contract read as this supplier may hold it, the rules judged on the locked rows, the row written frozen as sent, routed to the
 * S.O. office in force today with the due day from the kind's service level as it stands, the holders of that office told (a notice each, in the same transaction), and the audit row beside it.
 * The supplier is the SESSION's and the clock is the server's: nothing in the request names either. A statutory declaration is signed: the password was asked again before this is called,
 * and the attribution names the submission as the exact document signed. The submission is not a record on the contract: an officer takes it up through the act it calls for.
 */

export const supplierAuditActor = (a: SupplierActor): AuditActor => ({ kind: "SUPPLIER", supplierAccountId: a.accountId, sessionId: a.sessionId, sourceAddress: a.sourceAddress });

/// The signing contact's designation as the supplier gave it, for the record of a signature (4e review fix: the paper path records the signatory, and the portal path now says who in the company signed).
export async function signatoryDesignation(tx: Tx, actor: SupplierActor): Promise<string> {
  const c = await tx.supplierContact.findFirst({ where: { id: actor.contactId, supplierId: actor.supplierId, organisationId: actor.organisationId }, select: { designation: true } });
  return c?.designation.trim() || "designation not given";
}

const refuse = (fs: readonly ProjectFinding[], status: 404 | 409 | 422 | 429 = 422): never => {
  throw new ProjectRefused(fs, status);
};
const NOT_FOUND = () => refuse([{ code: "NOT_FOUND", level: "block" }], 404);

export interface SendSubmissionInput {
  contractId: string;
  kind: SubmissionKind;
  title: string;
  body: string;
  amount: string;
  aboutDay: string;
  lines: readonly LineInput[];
  /// From `confirmSupplierPassword`, for a statutory declaration. Null otherwise.
  stepUpAt: Date | null;
}

/// The contract, locked, as this supplier holds it, or not found (the same answer for every other case).
export async function inHeldContract<T>(actor: SupplierActor, contractId: string, fn: (tx: Tx, l: LoadedContract, today: string) => Promise<T>): Promise<T> {
  const result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
    if (!supplierHoldsContract({ awardVendorId: l.award.vendorId, awardStatus: l.award.status, supplierId: actor.supplierId })) return NOT_FOUND();
    const today = dayOf(new Date(), l.org.timeZone);
    if (!today) return refuse([{ code: "DAY_NOT_KNOWN", level: "block" }]);
    return fn(tx, l, today);
  });
  if (result === null) return NOT_FOUND();
  return result;
}

export async function sendSubmission(actor: SupplierActor, i: SendSubmissionInput, now: Date = new Date()): Promise<{ submissionId: string; routedTo: string | null; dueOn: string | null }> {
  return inHeldContract(actor, i.contractId, async (tx, l, today) => {
    // The act x status table: a submission is an act of the contract's supervision (ADR 0031).
    if (actStatusFault("SUPERVISION", l.contract.status as ContractStatus)) return refuse([{ code: "CONTRACT_NOT_ACTIVE", level: "block" }]);
    const faults = submissionFaults({ kind: i.kind, title: i.title, body: i.body, amount: i.amount, aboutDay: i.aboutDay, lines: i.lines, signed: i.stepUpAt != null, today });
    if (faults.some((f) => f.level === "block")) return refuse(faults);
    // 4e review fix: a statutory declaration binds the company, and whether a contractor signs from its portal account at all is the organisation's policy (unset refuses, said).
    if (KIND_SHAPE[i.kind].signed) {
      const signing = portalSigningFault((await loadPostAwardPolicy(actor.organisationId, tx))?.contractorPortalSigning);
      if (signing) return refuse([{ code: signing, level: "block" }]);
    }
    // 4e review fix: a bound on how many submissions one account sends in a window, counted from the table itself (so every instance shares the count). A technical
    // bound, not policy (open for the product owner): it stops a flood of rows and of the staff notices each one writes, which can never be deleted.
    const recent = await tx.contractorSubmission.count({ where: { submittedBySupplierAccountId: actor.accountId, submittedAt: { gte: new Date(now.getTime() - SUBMISSION_WINDOW_MINUTES * 60_000) } } });
    const flood = submissionFloodFault(recent);
    if (flood) return refuse([flood], 429);

    const [setting, s] = await Promise.all([
      tx.contractorSubmissionSetting.findUnique({ where: { organisationId_kind: { organisationId: actor.organisationId, kind: i.kind } }, select: { serviceLevelDays: true } }),
      loadSupervision(l.contract.id, tx),
    ]);
    const so = await soOfficeOn(l, s, today, tx);
    const serviceLevelDays = setting?.serviceLevelDays ?? null;
    const dueOn = dueDayOf(today, serviceLevelDays);
    const kindLabel = SUBMISSION_KIND_WORDS[i.kind].en;
    const row = await tx.contractorSubmission.create({
      data: {
        organisationId: actor.organisationId,
        contractId: l.contract.id,
        supplierId: actor.supplierId,
        kind: i.kind,
        title: i.title.trim(),
        body: i.body.trim(),
        amount: i.kind === "INTERIM_CLAIM" ? senToDecimalString(amountSen(i.amount)) : null,
        aboutDay: i.aboutDay.trim() ? dayToDate(i.aboutDay.trim()) : null,
        submittedBySupplierAccountId: actor.accountId,
        submittedAt: now,
        submittedOn: dayToDate(today),
        signedAt: i.kind === "STATUTORY_DECLARATION" ? i.stepUpAt : null,
        routedToRoleCode: so?.assignment.roleCode ?? null,
        routedToRoleLabel: so?.office.roleLabel ?? null,
        serviceLevelDays: dueOn ? serviceLevelDays : null,
        dueOn: dueOn ? dayToDate(dueOn) : null,
        lines: { create: i.lines.map((ln, n) => ({ sortOrder: n + 1, description: ln.description.trim(), quantity: ln.quantity.trim(), location: ln.location.trim(), value: ln.value.trim() })) },
      },
      select: { id: true },
    });
    if (i.kind === "STATUTORY_DECLARATION") {
      await attributeSupplierAct(tx, { actor, entity: "ContractorSubmission", entityId: row.id, slot: "submittedBy", stepUpAt: i.stepUpAt, document: { entity: "ContractorSubmission", id: row.id }, reason: `Signed with the password entered when the declaration was sent, by ${actor.displayName} (${await signatoryDesignation(tx, actor)})` });
    }
    const label = contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } });
    await writeAudit(
      tx,
      { actor: supplierAuditActor(actor), organisationId: actor.organisationId, entity: "ContractorSubmission", entityId: row.id, entityLabel: `${label} · ${kindLabel}: ${i.title.trim()}` },
      "CREATE",
      diffFields(null, {
        kind: kindLabel,
        title: i.title.trim(),
        ...(i.kind === "INTERIM_CLAIM" ? { amountClaimed: formatMoney(amountSen(i.amount)) } : {}),
        ...(i.aboutDay.trim() ? { day: formatDate(i.aboutDay.trim()) } : {}),
        ...(i.lines.length ? { items: i.lines.length } : {}),
        sentOn: formatDate(today),
        signed: i.kind === "STATUTORY_DECLARATION" ? "Yes, with the password" : "No",
        routedTo: so?.office.roleLabel ?? "Nobody: no Superintending Officer is assigned to the contract",
        dueOn: dueOn ? formatDate(dueOn) : "No due day: the service level is not set",
        madeBy: "the supplier's own portal account",
      }),
    );
    const recipients = so ? [...so.office.holderIds, ...so.office.actingIds] : [];
    await writeNotices(tx, actor.organisationId, null, contractorSubmissionNotices({ submissionId: row.id, contractLabel: label, kindLabel, contractorName: actor.supplierName, dueLabel: dueOn ? `It is due to be answered by ${formatDate(dueOn)}.` : "No service level is set for this kind, so it has no due day.", recipients }));
    return { submissionId: row.id, routedTo: so?.office.roleLabel ?? null, dueOn };
  });
}
