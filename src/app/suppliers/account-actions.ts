"use server";

import type { FormState } from "@/components/record-editor";
import { diffFields } from "@/lib/audit/diff";
import { parseIssueSupplierCode, parseOpenSupplierAccount, parseRetireContact, parseSetContractorSigner, parseUnlockSupplierAccount } from "@/lib/auth/forms";
import { settingLabels, unsetSettings } from "@/lib/auth/policy";
import { loadSecurityPolicy } from "@/lib/auth/policy-store";
import { disableAccountOfRetiredContact, issueSupplierCode, LoginNameTaken, openSupplierAccount, unlockSupplierAccount, unusableSupplierPasswordHash } from "@/lib/auth/supplier-administration";
import { AUTH_WORDS } from "@/lib/auth/words";
import { dayToDate } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";
import { GONE, label, Refusal, stampNow, inSupplier, audit } from "./shared";

import { permissionGate, staffForAct, toAuditActor } from "@/app/_auth/actor";
import { currentRequestFacts, refuseForeignPost } from "@/app/_auth/cookies";
import { sulitWriteRefusal } from "@/lib/auth/sulit-store";
import { SUPPLIER_ENTITY } from "@/lib/suppliers/audit-view";
import type { Fault, StaffActor } from "@/lib/auth/types";
import type { Tx } from "@/lib/audit/record";

/**
 * An officer's acts on a supplier's portal account (Phase 4a, ADR 0034 D2, D6): open it for a contact that has none, issue the one-time code that activates it or
 * resets its password, unlock it, and retire a contact (which disables its account). The first three need `supplierAccounts.manage` and the officer's word on
 * how the caller's identity was checked; each runs under the supplier's lock, in one transaction with its audit row and its sign-in log row. A code is returned
 * ONCE, to the form that asked, and kept nowhere else.
 */

export type SupplierCodeState = FormState & { issued?: { code: string; validUntil: string } };

const wrongOrigin = (): FormState => ({ ok: false, message: AUTH_WORDS.wrongOrigin.en });

/// A refusal of the rules as the form's state: a field's fault beside the field, the rest as the message.
function faultState(faults: readonly Fault[], fields?: Partial<Record<string, Fault>>): FormState {
  const errors: Record<string, string> = {};
  const loose: string[] = [];
  if (fields) {
    for (const [k, f] of Object.entries(fields)) {
      if (!f) continue;
      if (k === "*") loose.push(f.en);
      else errors[k] = f.en;
    }
  } else loose.push(...faults.map((f) => f.en));
  return { ok: false, errors, ...(loose.length ? { message: `Nothing was saved: ${loose.join(" ")}` } : {}) };
}

/// How long a code stays valid, or the words for the setting that is not set.
async function codeValidity(organisationId: string): Promise<{ ok: true; minutes: number } | { ok: false; message: string }> {
  const policy = await loadSecurityPolicy(db, organisationId);
  const unset = unsetSettings(policy, "ISSUE_CODE");
  if (unset.length > 0 || policy?.resetCodeValidityMinutes == null) return { ok: false, message: `Nothing was saved: a one-time code cannot be issued until the organisation sets ${settingLabels(unset).join("; ")} (Configuration › Security).` };
  return { ok: true, minutes: policy.resetCodeValidityMinutes };
}

/// Decision 9 (ADR 0034 D6): an officer's act on an account needs the right to read the contact's details as well as the permission, since "an officer who may not read the contact cannot tell
/// whom they are handing a code to". Enforced here, not by hiding the button: the action is reachable by anyone who holds the permission. Asked first, inside the transaction, so the access is
/// logged with it; a closed reader is refused in words with nothing written but that log row.
async function contactsClosed(tx: Tx, actor: StaffActor, supplier: { id: string; reference: string }): Promise<FormState | null> {
  const closed = await sulitWriteRefusal(tx, actor, { scope: "supplier", entity: "Supplier", id: supplier.id, label: supplier.reference }, ["contactName", "contactEmail", "contactPhone"]);
  return closed ? { ok: false, message: `Nothing was saved: a supplier's contacts are SULIT and are closed to you. ${closed}` } : null;
}

export async function openSupplierAccountAction(_prev: FormState, data: FormData): Promise<SupplierCodeState> {
  // Not an administrator account (it does no transactional act: NFR-SEC-004, asked first like every act's guard), and an officer holding `supplierAccounts.manage`, a permission grantable to roles
  // only, so an administrator never holds it: the first refusal is the sweep's, the second the organisation's.
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const gate = await permissionGate(actor, "supplierAccounts.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  if (await refuseForeignPost()) return wrongOrigin();
  const parsed = parseOpenSupplierAccount(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const validity = await codeValidity(actor.organisationId);
  if (!validity.ok) return validity;
  const now = stampNow();
  const passwordHash = await unusableSupplierPasswordHash();
  const request = await currentRequestFacts();
  let issued: SupplierCodeState["issued"];
  const state = await inSupplier(actor, parsed.value.supplierId, async (tx, l) => {
    const closed = await contactsClosed(tx, actor, l.supplier);
    if (closed) return closed;
    try {
      const opened = await openSupplierAccount(tx, {
        actor,
        supplier: { id: l.supplier.id, reference: l.supplier.reference },
        contactId: parsed.value.contactId,
        loginName: parsed.value.loginName,
        identityCheck: parsed.value.identityCheck,
        reason: "Portal account opened for the contact",
        validityMinutes: validity.minutes,
        passwordHash,
        request,
        now,
      });
      if (!opened.ok) return faultState(opened.faults, opened.fields);
      issued = { code: opened.issued.code, validUntil: formatOrgDateTime(opened.issued.expiresAt, actor.organisationTimeZone) };
      return { ok: true };
    } catch (e) {
      if (e instanceof LoginNameTaken) throw new Refusal({ ok: false, errors: { loginName: "That sign-in name is already used." } });
      throw e;
    }
  }, { revalidate: false });
  return state.ok && issued ? { ok: true, issued } : state;
}

export async function issueSupplierCodeAction(_prev: FormState, data: FormData): Promise<SupplierCodeState> {
  // Not an administrator account (it does no transactional act: NFR-SEC-004, asked first like every act's guard), and an officer holding `supplierAccounts.manage`, a permission grantable to roles
  // only, so an administrator never holds it: the first refusal is the sweep's, the second the organisation's.
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const gate = await permissionGate(actor, "supplierAccounts.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  if (await refuseForeignPost()) return wrongOrigin();
  const parsed = parseIssueSupplierCode(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const validity = await codeValidity(actor.organisationId);
  if (!validity.ok) return validity;
  const now = stampNow();
  const request = await currentRequestFacts();
  let issued: SupplierCodeState["issued"];
  const state = await inSupplier(actor, parsed.value.supplierId, async (tx, l) => {
    const closed = await contactsClosed(tx, actor, l.supplier);
    if (closed) return closed;
    const result = await issueSupplierCode(tx, {
      actor,
      supplier: { id: l.supplier.id, reference: l.supplier.reference },
      accountId: parsed.value.accountId,
      purpose: parsed.value.purpose,
      identityCheck: parsed.value.identityCheck,
      reason: parsed.value.purpose === "ACTIVATION" ? "Activation code issued after the caller's identity was checked" : "Reset code issued after the caller's identity was checked",
      validityMinutes: validity.minutes,
      request,
      now,
    });
    if (!result.ok) return faultState(result.faults, undefined);
    issued = { code: result.issued.code, validUntil: formatOrgDateTime(result.issued.expiresAt, actor.organisationTimeZone) };
    return { ok: true };
  }, { revalidate: false });
  return state.ok && issued ? { ok: true, issued } : state;
}

export async function unlockSupplierAccountAction(_prev: FormState, data: FormData): Promise<FormState> {
  // Not an administrator account (it does no transactional act: NFR-SEC-004, asked first like every act's guard), and an officer holding `supplierAccounts.manage`, a permission grantable to roles
  // only, so an administrator never holds it: the first refusal is the sweep's, the second the organisation's.
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const gate = await permissionGate(actor, "supplierAccounts.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  if (await refuseForeignPost()) return wrongOrigin();
  const parsed = parseUnlockSupplierAccount(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const now = stampNow();
  const request = await currentRequestFacts();
  return inSupplier(actor, parsed.value.supplierId, async (tx, l) => {
    const closed = await contactsClosed(tx, actor, l.supplier);
    if (closed) return closed;
    const result = await unlockSupplierAccount(tx, { actor, supplier: { id: l.supplier.id, reference: l.supplier.reference }, accountId: parsed.value.accountId, identityCheck: parsed.value.identityCheck, request, now });
    return result.ok ? { ok: true } : faultState(result.faults, undefined);
  });
}

/**
 * Retire a contact: it leaves the supplier's live contacts (its details stay on the record), and its portal account, if it has one, is DISABLED in the same transaction, its sessions
 * ended and its open codes voided (ADR 0034 D2). The primary contact is not retired: another is made primary first, so the supplier always has someone.
 */
export async function retireContactAction(_prev: FormState, data: FormData): Promise<FormState> {
  const txGuard = await staffForAct("TRANSACTION");
  if (!txGuard.ok) return txGuard.state;
  const actor = txGuard.actor;
  const parsed = parseRetireContact(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const now = stampNow();
  const request = await currentRequestFacts();
  return inSupplier(actor, parsed.value.supplierId, async (tx, l) => {
    if (!l.org.today) return { ok: false, message: "The organisation's time zone is not set, so no day can be recorded. Set it under Configuration › Organisation." };
    const contact = await tx.supplierContact.findFirst({ where: { id: parsed.value.contactId, supplierId: l.supplier.id, retiredOn: null, organisationId: actor.organisationId } });
    if (!contact) return GONE;
    // Retiring changes details the form shows: it is done by someone they are open to, as editing them is, and the access is logged in this transaction.
    const closed = await contactsClosed(tx, actor, l.supplier);
    if (closed) return closed;
    if (contact.isPrimary) return { ok: false, errors: { reason: "This is the primary contact. Mark another contact primary first: the supplier keeps someone to reach." } };
    await tx.supplierContact.update({ where: { id: contact.id, organisationId: actor.organisationId }, data: { retiredOn: dayToDate(l.org.today) } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.contact, contact.id, label(l.supplier, "Contact"), "UPDATE", diffFields({ retiredOn: null }, { retiredOn: l.org.today, retiredBecause: parsed.value.reason }), parsed.value.reason);
    await disableAccountOfRetiredContact(tx, { actor, supplier: { id: l.supplier.id, reference: l.supplier.reference }, contactId: contact.id, reason: `The contact was retired: ${parsed.value.reason}`, request, now });
    return { ok: true };
  });
}

/**
 * Mark whether a contact may sign for the contractor's company from the portal (decisions log, 2026-10-09, ruling on 1928(3)). An officer's act under the supplier's lock, audited with its
 * before and after and the reason. It is the one place the mark is written; a contact's own session never writes it. Needs the same permission as the contact's portal account
 * (`supplierAccounts.manage`) and the right to read the contact, since whom a company is bound by is judged on who the contact is. Not decided is the default: it refuses the portal's signature, saying so.
 */
export async function setContractorSignerAction(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForAct("TRANSACTION");
  if (!guard.ok) return guard.state;
  const actor = guard.actor;
  const gate = await permissionGate(actor, "supplierAccounts.manage");
  if (!gate.ok) return { ok: false, message: gate.message };
  if (await refuseForeignPost()) return wrongOrigin();
  const parsed = parseSetContractorSigner(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  return inSupplier(actor, parsed.value.supplierId, async (tx, l) => {
    const closed = await contactsClosed(tx, actor, l.supplier);
    if (closed) return closed;
    const contact = await tx.supplierContact.findFirst({ where: { id: parsed.value.contactId, supplierId: l.supplier.id, retiredOn: null, organisationId: actor.organisationId } });
    if (!contact) return GONE;
    if (contact.authorisedToSignForContractor === parsed.value.mark) return { ok: false, message: "Nothing was changed: that is already how it is recorded." };
    const words = (v: boolean | null) => (v == null ? "not decided" : v ? "authorised to sign for the contractor" : "not authorised to sign for the contractor");
    await tx.supplierContact.update({ where: { id: contact.id, organisationId: actor.organisationId }, data: { authorisedToSignForContractor: parsed.value.mark } });
    await audit(tx, toAuditActor(actor), l.org.id, SUPPLIER_ENTITY.contact, contact.id, label(l.supplier, "Contact"), "UPDATE", diffFields({ signsForTheContractor: words(contact.authorisedToSignForContractor) }, { signsForTheContractor: words(parsed.value.mark) }), parsed.value.reason);
    return { ok: true };
  });
}
