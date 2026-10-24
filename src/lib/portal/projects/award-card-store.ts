import type { Tx } from "@/lib/audit/record";
import type { SupplierActor } from "@/lib/auth/types";
import { indentState } from "@/lib/award/indent";
import { onlineReturnState, paperStarted } from "@/lib/award/online-return";
import { loadAwardPolicy } from "@/lib/award/repo";
import { returnRecordOf } from "@/lib/award/return-acceptance";
import { RETURN_RECORD_SELECT, RETURN_SCANS } from "@/lib/award/stage-two";
import type { InstrumentKind } from "@/lib/award/types";
import { dayOf, dayOrNull, storedDay } from "@/lib/dates";
import { awardReturnClassFault } from "@/lib/documents/award-return-class";
import { isLive } from "@/lib/documents/evidence";
import { loadStorePolicy } from "@/lib/documents/service";
import { inOrder } from "@/lib/series";

import { awardCardView, toAccept, type AwardCardView } from "./award-card";
import type { ProjectContext } from "./context-store";
import { contractorSigningFaultOf } from "./signing-store";
import { STANDING_AWARD } from "./visibility";

/**
 * What the contractor's Accept card and Questions card read (Wave V, V4): one contract's award as its own supplier holds it, in the caller's client. The supplier and organisation are the
 * session's. The identity card number of a lodged page is never selected. The paper return is read only for what `paperStarted` judges (security review L4): its
 * identity card number among them, only to tell whether paper has started, and it never leaves this function. Nothing here shows either. Days are the organisation's.
 */

const ALL_SCANS: readonly string[] = [...new Set(Object.values(RETURN_SCANS).flat())];

export async function loadAwardCard(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId" | "contactId">, ctx: ProjectContext): Promise<AwardCardView | null> {
  const zone = ctx.org.timeZone;
  const c = await client.contract.findFirst({
    where: { id: ctx.contract.id, organisationId: actor.organisationId },
    select: {
      award: {
        select: {
          status: true,
          instrumentKind: true,
          issuedAt: true,
          erpCommitmentNo: true,
          erpCommitmentKind: true,
          indentReceivedOn: true,
          awardReturn: { select: RETURN_RECORD_SELECT },
          attachments: { select: { purpose: true, detachedAt: true, version: { select: { withdrawnAt: true } } } },
          onlineReturns: { select: { submittedAt: true, submittedOn: true, verifiedAt: true, refusedAt: true, refusedReason: true } },
          queries: { orderBy: { askedAt: "asc" }, select: { id: true, body: true, askedAt: true, answer: true, answeredAt: true } },
        },
      },
    },
  });
  if (!c) return null;
  const a = c.award;
  const instrument = a.instrumentKind as InstrumentKind;
  const state = onlineReturnState(a.onlineReturns);
  const latest = a.onlineReturns.reduce<(typeof a.onlineReturns)[number] | null>((x, y) => (x && x.submittedAt.getTime() >= y.submittedAt.getTime() ? x : y), null);

  // What the gate and the form need is read only where the card could offer Accept.
  const open = a.status === "ISSUED" && (state === "NONE" || state === "REFUSED");
  let gate = { classSet: false, today: ctx.org.today, paperStarted: false, signingFault: null as string | null };
  let signatories: { id: string; name: string; designation: string }[] = [];
  let address = "";
  let validUntil: string | null = null;
  let indentExpired = false;
  if (open) {
    const policy = await loadStorePolicy(ctx.org.id, client);
    const [cls, signingFault] = await inOrder(
      () => (policy.awardReturnClassId ? client.documentClass.findFirst({ where: { id: policy.awardReturnClassId, organisationId: ctx.org.id }, select: { classification: true } }) : Promise.resolve(null)),
      () => contractorSigningFaultOf(client, actor),
    );
    const liveScans = a.attachments.filter((x) => ALL_SCANS.includes(x.purpose) && isLive(x)).length;
    gate = { classSet: !!policy.awardReturnClassId && awardReturnClassFault(cls) === null, today: ctx.org.today, paperStarted: paperStarted(a.awardReturn ? returnRecordOf(a.awardReturn) : null, liveScans), signingFault };
    if (instrument === "WORK_INDENT") {
      const [contacts, supplier] = await inOrder(
        () => client.supplierContact.findMany({ where: { supplierId: actor.supplierId, organisationId: actor.organisationId, retiredOn: null, authorisedToSignForContractor: true }, orderBy: { name: "asc" }, select: { id: true, name: true, designation: true } }),
        () => client.supplier.findFirst({ where: { id: actor.supplierId, organisationId: actor.organisationId }, select: { registeredAddress: true } }),
      );
      signatories = contacts;
      address = supplier?.registeredAddress ?? "";
    }
  }
  if (instrument === "WORK_INDENT" && ctx.org.today) {
    const policy = await loadAwardPolicy(ctx.org.id, client);
    const s = indentState(dayOrNull(a.indentReceivedOn), policy.indentValidityDays, ctx.org.today);
    validUntil = s.state === "VALID" || s.state === "EXPIRED" ? s.expiresOn : null;
    indentExpired = s.state === "EXPIRED";
  }

  return awardCardView({
    contractId: ctx.contract.id,
    awardStatus: a.status,
    instrument,
    issuedOn: a.issuedAt ? dayOf(a.issuedAt, zone) : null,
    commitment: { kind: a.erpCommitmentKind, number: a.erpCommitmentNo },
    validUntil,
    indentExpired,
    state,
    sentOn: latest ? storedDay(latest.submittedOn) : null,
    acceptedOn: state === "VERIFIED" && latest?.verifiedAt ? dayOf(latest.verifiedAt, zone) : null,
    refusedReason: latest?.refusedReason ?? "",
    gate,
    signatories,
    signedInContactId: actor.contactId,
    address,
    queries: a.queries.map((q) => ({ id: q.id, body: q.body, askedOn: dayOf(q.askedAt, zone), answer: q.answeredAt ? q.answer : null, answeredOn: q.answeredAt ? dayOf(q.answeredAt, zone) : null })),
  });
}

/// The contracts of this supplier whose issued award still waits for its acceptance, by contract id with the number: the project list's chip and the portal home's line.
export async function contractsToAccept(client: Tx, actor: Pick<SupplierActor, "supplierId" | "organisationId">): Promise<{ id: string; number: string }[]> {
  const rows = await client.contract.findMany({
    where: { organisationId: actor.organisationId, award: { vendorId: actor.supplierId, status: { in: [...STANDING_AWARD] } } },
    orderBy: [{ numberedOn: "desc" }, { number: "asc" }],
    select: { id: true, number: true, award: { select: { status: true, onlineReturns: { select: { submittedAt: true, verifiedAt: true, refusedAt: true } } } } },
  });
  return rows.filter((r) => toAccept(r.award.status, onlineReturnState(r.award.onlineReturns))).map((r) => ({ id: r.id, number: r.number }));
}
