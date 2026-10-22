"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { creditorDecision, creditorEventRow, creditorPermissionState, CREDITOR_PROFILE_FIELDS, portalCreditorNamedFacts } from "@/lib/auth/creditor-access-store";
import { refusalWords } from "@/lib/auth/sulit-access";
import { writeSulitEvents } from "@/lib/auth/sulit-store";
import { db } from "@/lib/db";
import { deadlocked, transactionTimedOut } from "@/lib/scope/tx-timeout";
import { portalLabel, rejectPortalApplication, sendPortalApplicationForDecision, verifyPortalCreditor, verifyPortalDocument, type PortalActContext } from "@/lib/suppliers/portal-application-acts";
import { supplierOrg } from "@/lib/suppliers/repo";
import { VERIFICATION_STATES } from "@/lib/suppliers/types";
import { FormReader } from "@/lib/validate";

import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { staffForAct, toAuditActor } from "@/app/_auth/actor";
import type { StaffActor } from "@/lib/auth/types";
import { NO_ORG, Refusal, stampNow } from "./shared";

/**
 * The officer's acts on a whole online application (ADR 0041, plan 6.1): thin, one per core in `src/lib/suppliers/portal-application-acts.ts`. Each reads its form, begins the act
 * (`beginAct`, with its slot), runs the core in one transaction, and revalidates the application's page. A step of its route is decided through `decideRegistrationStep` (actions.ts),
 * which hands a step on an online application's route to its core.
 */

const OPTIONS = { timeout: 30_000, maxWait: 10_000 };

/// One transaction around a core, with the organisation read in it; a Refusal thrown inside rolls everything back and returns its words.
async function inPortal(actor: StaffActor, run: (c: Omit<PortalActContext, "act">) => Promise<FormState>): Promise<FormState> {
  const now = stampNow();
  try {
    return await db.$transaction(async (tx) => {
      const org = await supplierOrg(actor.organisationId, tx);
      if (!org) return NO_ORG;
      return run({ tx, actor: toAuditActor(actor), org, now });
    }, OPTIONS);
  } catch (e) {
    if (e instanceof Refusal) return e.state;
    const attribution = attributionRefusalState(e);
    if (attribution) return attribution;
    if (transactionTimedOut(e)) return { ok: false, message: "This took too long and nothing was saved. Try again." };
    if (deadlocked(e)) return { ok: false, message: "Another officer was changing this application at the same moment, so nothing was saved. Try again." };
    throw e;
  }
}

function revalidate(id: string) {
  revalidatePath(`/suppliers/online/${id}`);
  revalidatePath("/suppliers");
  revalidatePath("/approvals");
}

/// A named officer's check of a certificate held on an online application (FR-VND-004).
export async function verifyPortalDocumentAction(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const documentId = String(data.get("documentId") ?? "").trim();
  const r = new FormReader(data);
  const state = r.choice("verification", "Outcome of the check", VERIFICATION_STATES.filter((s) => s !== "NOT_CHECKED"));
  const verifiedOn = r.optionalText("verifiedOn");
  const note = r.text("verificationNote", "Why", { max: 2000 });
  const expiryAsked = data.has("expiresOn");
  const expiryTyped = expiryAsked ? r.optionalText("expiresOn") : null;
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PortalApplicationDocument.verifiedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const found = documentId ? await db.portalApplicationDocument.findFirst({ where: { id: documentId, organisationId: actor.organisationId }, select: { portalApplicationId: true } }) : null;
  if (!found) return { ok: false, message: "That certificate is not on an online application." };
  const res = await inPortal(actor, (c) => verifyPortalDocument({ ...c, act: begun.act }, { documentId, state, verifiedOn, note, ...(expiryAsked ? { expiry: { to: expiryTyped } } : {}), personId: begun.act.subjectPersonId }));
  if (res.ok) revalidate(found.portalApplicationId);
  return res;
}

/**
 * One officer's check of the bank details held on an online application (FR-VND-005): signed with the officer's own password, as a profile's check is. The officer must be able to
 * read them (named on the application's route, its verifier, or holding `sulit.read.creditorProfile`): judged on the locked rows and logged, whether allowed or refused.
 */
export async function verifyPortalCreditorAction(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("SIGNATURE");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const id = String(data.get("portalApplicationId") ?? "").trim();
  const r = new FormReader(data);
  const state = r.choice("verification", "Outcome of the check", VERIFICATION_STATES.filter((s) => s !== "NOT_CHECKED"));
  const note = r.text("verificationNote", "Why", { max: 2000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PortalApplicationCreditor.verifiedBy", { personField: "personId", dateField: "verifiedOn", document: { entity: "PortalApplication", id }, onBehalf: false });
  if (!begun.ok) return begun.state;
  const office = actor.offices.find((o) => o.scope == null) ?? actor.offices[0];
  const res = await inPortal(actor, async (c) => {
    const held = await c.tx.portalApplicationCreditor.findFirst({ where: { portalApplicationId: id, organisationId: c.org.id }, select: { id: true, portalApplication: { select: { reference: true } } } });
    if (!held) return { ok: false, message: "This online application holds no bank details." };
    // Who may read them may check them: judged on the rows as they stand in this transaction, and logged either way.
    const facts = (await portalCreditorNamedFacts(c.tx, c.org.id, [id])).get(id);
    const decision = creditorDecision(actor, facts, await creditorPermissionState(c.tx, actor));
    await writeSulitEvents(c.tx, actor, [{ ...creditorEventRow({ id: held.id, label: portalLabel(held.portalApplication.reference, "Bank details") }, CREDITOR_PROFILE_FIELDS, decision), entity: "PortalApplicationCreditor" }]);
    if (decision.state === "WITHHELD") return { ok: false, message: `Nothing was saved: ${refusalWords(decision.basis, "creditorProfile", { routeStarted: facts?.routeStarted ?? false }).en}` };
    return verifyPortalCreditor({ ...c, act: begun.act }, { portalApplicationId: id, state, verifiedOn: begun.act.day, note, personId: begun.act.subjectPersonId, roleCode: office?.roleCode ?? null });
  });
  if (res.ok) revalidate(id);
  return res;
}

/// Send a whole online application for decision on its route (ADR 0041 D5). The sender is the route's requester.
export async function sendPortalApplicationAction(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const id = String(data.get("portalApplicationId") ?? "").trim();
  const begun = await beginAct(actor, data, "PortalApplication.sentBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const res = await inPortal(actor, (c) => sendPortalApplicationForDecision({ ...c, act: begun.act }, { portalApplicationId: id, personId: begun.act.subjectPersonId }));
  if (res.ok) revalidate(id);
  return res;
}

/// Reject a whole online application, with the reasons as written (ADR 0041 D7). The officer's own act.
export async function rejectPortalApplicationAction(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const id = String(data.get("portalApplicationId") ?? "").trim();
  const r = new FormReader(data);
  const reasons = r.text("reason", "The reasons, as written", { required: true, max: 4000 });
  if (r.failed) return { ok: false, errors: r.errors };
  const begun = await beginAct(actor, data, "PortalApplication.decidedBy", { personField: "personId", onBehalf: false });
  if (!begun.ok) return begun.state;
  const res = await inPortal(actor, (c) => rejectPortalApplication({ ...c, act: begun.act }, { portalApplicationId: id, reasons, personId: begun.act.subjectPersonId }));
  if (res.ok) revalidate(id);
  return res;
}
