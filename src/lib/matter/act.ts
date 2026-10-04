/**
 * The frame every run 1b act on a contract runs in (6.13 Part B run 1b). Server-only (no "use server": imported by the
 * contract's time, matter and damages action files).
 *
 * The act reads the server's clock once on entry (the caller passes `now`, truncated to the second); its file's own
 * `inContract` locks the requisition, the exercise, the award and the contract in the canonical order
 * (`withLockedContract`), asks the one act × status table for its family (CANCELLED first, in its own words), refuses an
 * unset time zone (never UTC's day), then runs.
 * A refusal throws, so nothing is half-written. `lockMatter` then locks the matter (the first domain row) and its
 * record, in that order, and reads them on the locked transaction.
 */

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { CertificateRefusal } from "@/lib/certificate/write";
import { actStatusText } from "@/lib/contract/act-status";
import { contractLabel, type LoadedContract } from "@/lib/contract/repo";
import { dayOf } from "@/lib/dates";
import type { Tx } from "@/lib/audit/record";
import { capacityFor, type ActNeed, type Capacity } from "@/lib/supervision/authority";
import { supervisionRefusal } from "@/lib/supervision/labels";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "@/lib/supervision/load";

import { loadMatters, type MatterRow } from "./load";
import { MatterRefusal } from "./route-write";
import { MatterChanged } from "./write";

const GONE: FormState = { ok: false, message: "That contract no longer exists." };
const NO_ZONE: FormState = { ok: false, message: "Set the organisation's time zone under Configuration › Organisation first: every act here records the organisation's day, never UTC's." };
const CANCELLED: FormState = { ok: false, message: "The contract is cancelled: it is kept as it was." };
export const ON_BEHALF = "recorded on behalf of, not signed";

export class ActRefusal extends Error {
  constructor(readonly state: FormState) {
    super(state.message ?? "Refused");
  }
}

export interface ActCtx {
  tx: Tx;
  l: LoadedContract;
  now: Date;
  today: string;
  label: string;
}

/**
 * The pieces of the frame each action file's own `inContract` is built from (BD-613-130's scan reads the gate where the
 * act is: each "use server" file asks the table itself, under withLockedContract, as payment-actions does).
 */
/// A refusal of the act × status table, in its words (CANCELLED in its own).
export const tableRefusal = (refused: Parameters<typeof actStatusText>[0]): FormState =>
  refused.code === "CONTRACT_CANCELLED" ? CANCELLED : { ok: false, message: actStatusText(refused) };

/// The act's context on the locked transaction, or null where the organisation's time zone is unset.
export function actCtx(tx: Tx, l: LoadedContract, now: Date): ActCtx | null {
  const today = dayOf(now, l.org.timeZone);
  return today ? { tx, l, now, today, label: contractLabel({ number: l.contract.number, award: { awardeeName: l.award.awardeeName } }) } : null;
}
export const NO_ZONE_STATE = NO_ZONE;

/// A thrown refusal, as the form's state; anything else is rethrown.
export function thrownState(e: unknown): FormState {
  if (e instanceof ActRefusal) return e.state;
  if (e instanceof MatterRefusal || e instanceof CertificateRefusal) return { ok: false, message: e.message, ...(e.errors ? { errors: e.errors } : {}) };
  if (e instanceof MatterChanged) return { ok: false, message: e.message };
  throw e;
}

/// After the act: refresh the contract's pages and the approvals list on success; a vanished contract says so.
export function afterAct(id: string, result: FormState | null, alsoRevalidate: readonly string[] = []): FormState {
  if (result?.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    revalidatePath("/approvals");
    for (const p of alsoRevalidate) revalidatePath(p);
  }
  return result ?? GONE;
}

export const fieldError = (field: string, message: string): never => {
  throw new ActRefusal({ ok: false, errors: { [field]: message } });
};

export async function personNamed(c: ActCtx, personId: string | null, field = "personId"): Promise<{ id: string; name: string }> {
  const p = personId ? await c.tx.person.findFirst({ where: { id: personId, organisationId: c.l.org.id, isActive: true }, select: { id: true, name: true } }) : null;
  if (!p) fieldError(field, "Choose someone on record and active.");
  return p!;
}

/// The Person named, and the capacity they may be recorded in on the day (the S.O., or a representative whose delegation
/// in force covers the act); refused otherwise.
export async function recordedFor(c: ActCtx, personId: string | null, need: ActNeed, on: string, field = "personId"): Promise<{ person: { id: string; name: string }; capacity: Capacity; soLabel: string }> {
  const person = await personNamed(c, personId, field);
  const s = await loadSupervision(c.l.contract.id, c.tx);
  const so = await soOfficeOn(c.l, s, on, c.tx);
  const r = capacityFor(person.id, need, so?.office ?? null, delegationFactsOf(s), on);
  if (!r.capacity) throw new ActRefusal({ ok: false, message: supervisionRefusal("Not recorded:", r.faults) });
  return { person, capacity: r.capacity, soLabel: so!.office.roleLabel };
}

/// The matter's record table, locked after the matter (the first domain row).
const RECORD_TABLE: Readonly<Record<string, string>> = { EOT: "EotClaim", PERIOD_EXTENSION: "PeriodExtension", LOSS_EXPENSE: "LossExpenseClaim", LAD_WAIVER: "LadWaiver" };

/// Lock the matter, then its record; read every matter of the contract on the locked transaction.
export async function lockMatter(c: ActCtx, matterId: string): Promise<{ matters: MatterRow[]; m: MatterRow }> {
  const pre = await c.tx.contractMatter.findFirst({ where: { id: matterId, contractId: c.l.contract.id }, select: { id: true, kind: true } });
  if (!pre) throw new ActRefusal({ ok: false, message: "That matter is not on this contract." });
  await c.tx.$queryRaw`SELECT id FROM "ContractMatter" WHERE id = ${pre.id} FOR UPDATE`;
  const table = RECORD_TABLE[pre.kind];
  if (table === "EotClaim") await c.tx.$queryRaw`SELECT id FROM "EotClaim" WHERE "matterId" = ${pre.id} FOR UPDATE`;
  if (table === "PeriodExtension") await c.tx.$queryRaw`SELECT id FROM "PeriodExtension" WHERE "matterId" = ${pre.id} FOR UPDATE`;
  if (table === "LossExpenseClaim") await c.tx.$queryRaw`SELECT id FROM "LossExpenseClaim" WHERE "matterId" = ${pre.id} FOR UPDATE`;
  if (table === "LadWaiver") await c.tx.$queryRaw`SELECT id FROM "LadWaiver" WHERE "matterId" = ${pre.id} FOR UPDATE`;
  const matters = await loadMatters(c.l.contract.id, c.tx);
  return { matters, m: matters.find((x) => x.id === pre.id)! };
}
