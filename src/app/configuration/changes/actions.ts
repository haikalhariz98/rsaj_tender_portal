"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { attributionRefusalState, beginAct } from "@/app/_auth/act";
import { requireStaff, staffForPermission } from "@/app/_auth/actor";
import { currentRequestFacts, refuseForeignPost } from "@/app/_auth/cookies";
import { editRegistry } from "@/app/_auth/stage";
import { decideChange, proposeChange, type ChangeFaults } from "@/lib/auth/change-store";
import { decisionFaults, KIND_PERMISSION, type ChangeKind } from "@/lib/auth/configuration-change";
import { isEditKind, parseEditPayload, unresolvedEditRule } from "@/lib/auth/configuration-edit";
import { decideEdit, editDecisionFaults } from "@/lib/auth/edit-store";
import { permissionHeldThrough } from "@/lib/auth/permission-store";
import { SETTING_LABELS } from "@/lib/auth/policy";
import type { SecurityPolicyKey, StaffActor } from "@/lib/auth/types";
import { AUTH_WORDS } from "@/lib/auth/words";
import { db } from "@/lib/db";
import { formatOrgDateTime } from "@/lib/format";

/**
 * Two-person changes (ADR 0034 D15, Phase 2c): proposing each kind, deciding, and withdrawing. Each action asks who is signed in first, passes the Origin guard,
 * and hands what was posted to `change-store.ts`, which judges it under its locks, writes it with its audit row and its attribution in one transaction, and
 * answers in words. Who proposes and who decides is the session's person, never a field. A decision is a signature: the password is asked again, every time.
 */

const PATH = "/configuration/changes";

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/configuration/security");
  revalidatePath("/configuration/accounts");
  revalidatePath("/configuration/users");
  // An editor's save changes the section it belongs to, whichever it is: the layout's count of changes waiting is read on every page of Configuration.
  revalidatePath("/configuration", "layout");
}

/// What a refused act says to the form: the field-level faults beside their fields, the rest in one message.
function stateOf(outcome: ChangeFaults, fieldMap: Record<string, string> = {}): FormState {
  const errors: Record<string, string> = {};
  const rest: string[] = [];
  for (const fault of outcome.fields ?? []) errors[fieldMap[fault.field] ?? fault.field] = fault.en;
  const named = new Set((outcome.fields ?? []).map((x) => x.code + x.en));
  for (const fault of outcome.faults) if (!named.has(fault.code + fault.en)) rest.push(fault.en);
  return { ok: false, ...(Object.keys(errors).length > 0 ? { errors } : {}), ...(rest.length > 0 ? { message: rest.join(" ") } : {}) };
}

/// The one path every proposal takes: the proposer's attribution is begun (not a signature, so no password), then the store proposes.
async function propose(actor: StaffActor, data: FormData, kind: ChangeKind, payload: unknown, fieldMap: Record<string, string> = {}): Promise<FormState> {
  const begun = await beginAct(actor, data, "ConfigurationChange.proposedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  try {
    const outcome = await proposeChange(actor, act, { kind, payload, reason: String(data.get("reason") ?? "") }, new Date(), await currentRequestFacts());
    if (!outcome.ok) return stateOf(outcome, fieldMap);
    refresh();
    // A code made at once (the two-person switch is off) is said here, once, to the person who asked, and kept nowhere.
    if (outcome.applied && outcome.code) return { ok: true, notice: `Code for ${outcome.code.personName}: ${outcome.code.code}. Valid until ${formatOrgDateTime(outcome.code.expiresAt, actor.organisationTimeZone)}. Hand it over by hand. The system sends nothing.` };
  } catch (e) {
    const refused = attributionRefusalState(e);
    if (refused) return refused;
    throw e;
  }
  return { ok: true };
}

// --------------------------------------------------------------------------------------------- proposing

/// A setting of the organisation's sign-in policy is changed to a value. A whole number for a number, one of the offered choices for a choice.
export async function proposeSecurityPolicy(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("security.policy");
  if (!guard.ok) return guard.state;
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const key = String(data.get("setting") ?? "");
  if (!(key in SETTING_LABELS)) return { ok: false, message: "That is not a sign-in setting." };
  const value = String(data.get("value") ?? "").trim();
  if (value === "") return { ok: false, errors: { value: "Enter the value it is to be changed to. A setting is changed to a value, never cleared." } };
  const payload = { changes: { [key as SecurityPolicyKey]: /^\d+$/.test(value) ? Number(value) : value } };
  return propose(guard.actor, data, "SECURITY_POLICY", payload, { changes: "value" });
}

/// A role is granted, withheld or left undecided on one product permission.
export async function proposePermissionGrant(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("permissions.grant");
  if (!guard.ok) return guard.state;
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const payload = { permissionKey: String(data.get("permissionKey") ?? ""), roleCode: String(data.get("roleCode") ?? ""), decision: String(data.get("decision") ?? "") };
  return propose(guard.actor, data, "PERMISSION_GRANT", payload);
}

/// A person's account is made an administrator's, or is taken from one. Both are the accounts permission's.
export async function proposeAdministratorChange(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("accounts.manage");
  if (!guard.ok) return guard.state;
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const make = String(data.get("direction") ?? "") === "GRANT";
  return propose(guard.actor, data, make ? "ADMINISTRATOR_GRANT" : "ADMINISTRATOR_REVOKE", { accountId: String(data.get("accountId") ?? "") });
}

/// An activation or reset code for an administrator's account, or for the account of someone who holds or has held an office, a seat or a delegation, which a second person issues.
export async function proposeAccountCode(_prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("accounts.manage");
  if (!guard.ok) return guard.state;
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  return propose(guard.actor, data, "ACCOUNT_CODE", { accountId: String(data.get("accountId") ?? ""), purpose: String(data.get("purpose") ?? "") });
}

// --------------------------------------------------------------------------------------------- deciding

/// What deciding answers: where the change made a code, the code itself, once. It is returned to the one form that asked and kept nowhere else.
export type DecideState = FormState & { issued?: { code: string; validUntil: string; personName: string; purpose: "ACTIVATION" | "RESET" } };

async function decide(actor: StaffActor, data: FormData, decision: "APPLY" | "DECLINE" | "WITHDRAW"): Promise<DecideState> {
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const changeId = String(data.get("changeId") ?? "");
  const reason = String(data.get("reason") ?? "");
  if (decision === "DECLINE" && !reason.trim()) return { ok: false, errors: { reason: "Say why it is declined." } };

  // Said before the password is asked, so someone who cannot decide it is told so and spends nothing; judged again under the locks.
  const row = await db.configurationChange.findFirst({ where: { id: changeId, organisationId: actor.organisationId }, select: { kind: true, status: true, proposedByPersonId: true, payload: true } });
  if (!row) return { ok: false, message: "That change no longer exists." };
  // An editor's save (Phase 5) is decided by the rule of its editor; the other kinds each have their own.
  const editKind = isEditKind(row.kind) ? row.kind : null;
  const parsedEdit = editKind ? parseEditPayload(row.payload, row.kind) : null;
  const editOp = parsedEdit?.ok ? editRegistry.find(parsedEdit.payload.operation) : null;
  if (decision === "WITHDRAW") {
    if (row.status !== "PROPOSED") return { ok: false, message: "This change has already been decided or withdrawn." };
    if (row.proposedByPersonId !== actor.personId) return { ok: false, message: "Only the person who proposed a change withdraws it." };
  } else if (editKind) {
    // An editor that cannot be resolved cannot be applied, only declined (by the rule of its kind), which also blanks any personal values it holds.
    if (!editOp && decision === "APPLY") return { ok: false, message: "This change's editor is no longer one a change can carry, so it cannot be applied. Decline it, and propose it again." };
    const faults = editDecisionFaults(editOp ?? unresolvedEditRule(editKind), row, actor);
    if (faults.length > 0) return { ok: false, message: faults.map((x) => x.en).join(" ") };
  } else {
    const faults = decisionFaults({ kind: row.kind as ChangeKind, status: row.status, proposedByPersonId: row.proposedByPersonId }, { personId: actor.personId, permissions: actor.permissions });
    if (faults.length > 0) return { ok: false, message: faults.map((x) => x.en).join(" ") };
  }

  // A decision is a signature: the password is asked again, every time, before the transaction (a wrong one counts towards the lockout).
  const begun = await beginAct(actor, data, "ConfigurationChange.decidedBy", { personField: "personId", document: { entity: "ConfigurationChange", id: changeId } });
  if (!begun.ok) return begun.state;
  const act = begun.act;
  // The office the signer held (NFR-SIG-001): the role they hold the kind's permission through, if any (an administrator holds it through the flag, which is no office).
  const roleCode = await permissionHeldThrough(db, { organisationId: actor.organisationId, personId: actor.personId, isAdministrator: actor.isAdministrator, timeZone: actor.organisationTimeZone, now: new Date() }, editKind ? (editOp?.decidePermission ?? unresolvedEditRule(editKind).decidePermission) : KIND_PERMISSION[row.kind as ChangeKind]);
  try {
    if (editKind) {
      const edited = await decideEdit(actor, act, editRegistry, { changeId, decision, reason, roleCode });
      if (!edited.ok) {
        // A stale change is written, so the queue changes.
        if (edited.kind === "STALE") {
          refresh();
          return { ok: false, message: edited.message };
        }
        // The editor refused the change as it now stands. It is left proposed (the cause can be put right, or it can be declined), and the reasons are said here:
        // the decision's form has none of the editor's fields to put them beside.
        if (edited.kind === "EDITOR") return { ok: false, message: [edited.result.message, ...Object.values(edited.result.errors ?? {})].filter(Boolean).join(" ") || "The editor refused this change." };
        return stateOf(edited);
      }
      refresh();
      return { ok: true };
    }
    const outcome = await decideChange(actor, act, { changeId, decision, reason, roleCode }, await currentRequestFacts());
    if (!outcome.ok) {
      // A stale change is written, so the queue changes.
      if (outcome.kind === "STALE") refresh();
      return outcome.kind === "STALE" ? { ok: false, message: outcome.message } : stateOf(outcome);
    }
    // A change that makes a code leaves the page as it is: the code is on screen in the dialog that asked, once, and a refresh now would take the row, and the
    // dialog with it, before anyone read it. The dialog refreshes the page when it is closed.
    if (!outcome.code) refresh();
    return outcome.code
      ? { ok: true, issued: { code: outcome.code.code, validUntil: formatOrgDateTime(outcome.code.expiresAt, actor.organisationTimeZone), personName: outcome.code.personName, purpose: outcome.code.purpose } }
      : { ok: true };
  } catch (e) {
    const refused = attributionRefusalState(e);
    if (refused) return refused;
    throw e;
  }
}

/// Apply a proposed change, as a second person.
export async function applyChangeAction(_prev: FormState, data: FormData): Promise<DecideState> {
  const actor = await requireStaff();
  return decide(actor, data, "APPLY");
}

/// Decline a proposed change, with the reason.
export async function declineChangeAction(_prev: FormState, data: FormData): Promise<DecideState> {
  const actor = await requireStaff();
  return decide(actor, data, "DECLINE");
}

/// The proposer takes their own change back.
export async function withdrawChangeAction(_prev: FormState, data: FormData): Promise<DecideState> {
  const actor = await requireStaff();
  return decide(actor, data, "WITHDRAW");
}
