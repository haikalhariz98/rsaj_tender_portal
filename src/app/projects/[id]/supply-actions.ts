"use server";

import { revalidatePath } from "next/cache";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { FormState } from "@/components/record-editor";
import { toSecond } from "@/lib/bids/lateness";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { withLockedContract } from "@/lib/contract/repo";
import type { ContractStatus } from "@/lib/contract/types";
import { dayOf, storedDay } from "@/lib/dates";
import { parseSen } from "@/lib/money";
import { recordSupplyPayment as recordSupplyPaymentCore, SupplyPaymentRefused } from "@/lib/payment/supply-write";
import { FormReader } from "@/lib/validate";

/**
 * Finance's payment of a supply claim, recorded by hand (ADR 0045 D7; WV-13; INT-07's manual adapter, as `recordCertificatePayment` is for a certificate). The edge only:
 * who is asking (`staffForAct("TRANSACTION")`: an administrator account is refused), the form read once, the act begun before the lock, then the contract's lock and its
 * act × status row. The claim lives in the Project workspace, so the row is PROJECT_WORKSPACE (open from Executed through Terminated). Every rule is the library's
 * (`src/lib/payment/supply-write.ts`, `supply.ts`). Its own file, not `payment-actions.ts`, whose acts are pinned to the table as it stood before the workspace's row.
 */

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const NO_ZONE = "Time zone not set. An administrator sets it under Configuration › Organisation.";

export async function recordSupplyPayment(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const now = toSecond(new Date());
  const r = new FormReader(data);
  const contractId = r.text("id", "Contract", { required: true, max: 100 });
  const documentId = r.text("documentId", "Invoice", { required: true, max: 100 });
  const paidOn = r.date("paidOn", "Paid on", { required: true });
  const batchNo = r.text("batchNo", "Batch number", { required: true, max: 60 });
  const amount = r.money("amount", "Amount paid", { required: true });
  const note = r.text("note", "Note", { max: 2000 });
  if (r.failed || !paidOn) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "SupplyInvoicePayment.person", { personField: "personId" });
  if (!begun.ok) return begun.state;
  let result: FormState | null;
  try {
    result = await withLockedContract(actor.organisationId, contractId, async (tx, l) => {
      const shut = actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus);
      if (shut) return { ok: false, message: actStatusText(shut) };
      const today = dayOf(now, l.org.timeZone);
      if (!today) return { ok: false, message: NO_ZONE };
      await recordSupplyPaymentCore({ tx, l, actor: toAuditActor(actor), now, today }, { documentId, paidOn: storedDay(paidOn), batchNo, amount: amount === null ? null : parseSen(amount), note, act: begun.act });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof SupplyPaymentRefused) return { ok: false, message: e.message };
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    throw e;
  }
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${contractId}`);
  }
  return result ?? GONE;
}
