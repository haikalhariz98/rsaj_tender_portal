"use server";

import { revalidatePath } from "next/cache";

import { beginAct, attributionRefusalState } from "@/app/_auth/act";
import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import { dayToDate } from "@/lib/dates";
import { withLockedAwardFor, type LoadedAward } from "@/lib/award/repo";
import { NO_ZONE, Refusal } from "@/lib/award/route-write";
import { loadNonAwardPolicy } from "@/lib/portal/bids/non-award-store";
import { issueFaults, nonAwardFaultText, outcomeText, policySnapshot, reasonToFreeze, unsuccessfulPartyIds } from "@/lib/portal/bids/non-award";
import type { Reader } from "@/lib/auth/sulit-store";
import { FormReader } from "@/lib/validate";
import { inOrder } from "@/lib/series";

/**
 * The notice of non-award (FR-AWD-010, policy D7, Phase 4d): an officer issues it to one unsuccessful tenderer, from the exercise's Award tab, after the award was issued. A separate act: the award's own issue is not touched.
 * It refuses, and says why in words, while the organisation has not decided to issue them (policy D7 unset) or has decided not to. The text is frozen as issued, carries a reason only where the organisation's debrief
 * does, and never a score, a rank or a figure. It is shown in the portal and is not sent (INT-09). Every check runs again here, on the locked award, whatever the page offered.
 */

const GONE: FormState = { ok: false, message: "That award no longer exists." };

async function inAward(scope: Reader, id: string, fn: (tx: Tx, l: LoadedAward) => Promise<FormState>): Promise<FormState> {
  let result: FormState | null;
  let exerciseId: string | undefined;
  try {
    result = await withLockedAwardFor(scope, id, (tx, l) => {
      exerciseId = l.ex.id;
      return fn(tx, l);
    });
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    // AC-22: the notices are issued and read on the exercise's Award tab.
    if (exerciseId) revalidatePath(`/sourcing/${exerciseId}`);
  }
  return result ?? GONE;
}

export async function issueNonAwardNotice(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const id = String(data.get("id") ?? "");
  const partyId = String(data.get("partyId") ?? "");
  const r = new FormReader(data);
  const reason = r.text("reason", "The reason for non-award", { max: 2100 });
  if (r.failed) return { ok: false, errors: r.errors };
  // The notice is the signed-in officer's own act.
  const begun = await beginAct(actor, data, "NonAwardNotice.issuedBy", { personField: "issuedByPersonId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  return inAward(actor, id, async (tx, l) => {
    const a = l.award;
    if (!l.org.today) return NO_ZONE;
    const person = await tx.person.findFirst({ where: { id: act.subjectPersonId, organisationId: actor.organisationId, isActive: true }, select: { id: true, name: true } });
    if (!person) return { ok: false, message: "The officer issuing the notice is not an active person on record." };
    const policy = await loadNonAwardPolicy(tx, actor.organisationId);
    const [bids, existing, party] = await inOrder(
      () => tx.openedBid.findMany({ where: { exerciseId: a.exerciseId, organisationId: actor.organisationId }, select: { partyId: true } }),
      () => tx.nonAwardNotice.findUnique({ where: { awardId_partyId: { awardId: a.id, partyId } }, select: { id: true } }),
      () => tx.exerciseParty.findFirst({ where: { id: partyId, exerciseId: a.exerciseId, organisationId: actor.organisationId }, select: { id: true, name: true } }));
    if (!party) return { ok: false, message: "That tenderer is not on this exercise." };
    const faults = issueFaults({ policy, award: { status: a.status, awardeePartyId: a.awardeePartyId }, partyId, unsuccessful: unsuccessfulPartyIds(bids, a.awardeePartyId), alreadyIssued: existing != null, reason });
    const blocks = faults.filter((f) => f.level === "block");
    if (blocks.length > 0) {
      const only = blocks.every((f) => f.code === "REASON_REQUIRED" || f.code === "REASON_TOO_LONG");
      const text = blocks.map(nonAwardFaultText).join(" ");
      return only ? { ok: false, errors: { reason: text } } : { ok: false, message: `Nothing was issued: ${text}` };
    }
    const frozenReason = reasonToFreeze(policy, reason);
    const outcome = outcomeText({ reference: l.ex.reference, title: l.ex.title });
    const now = new Date();
    const notice = await tx.nonAwardNotice.create({
      data: {
        organisationId: actor.organisationId,
        exerciseId: a.exerciseId,
        awardId: a.id,
        partyId: party.id,
        outcomeText: outcome,
        reasonText: frozenReason,
        policySnapshot: policySnapshot(policy, policy.provenance),
        issuedOn: dayToDate(l.org.today),
        issuedAt: now,
        issuedByPersonId: person.id,
      },
    });
    await act.write(tx, notice.id);
    await writeAudit(
      tx,
      { actor: toAuditActor(actor), organisationId: actor.organisationId, entity: "NonAwardNotice", entityId: notice.id, entityLabel: `${l.ex.reference} · Notice of the outcome to ${party.name}` },
      "CREATE",
      diffFields(null, { tenderer: party.name, notice: "Issued, shown in the portal and not sent", reason: frozenReason || "None: the debrief carries no reason", issuedBy: person.name }),
    );
    return { ok: true, message: `Notice issued to ${party.name}. It is shown in the portal and is not sent.` };
  });
}
