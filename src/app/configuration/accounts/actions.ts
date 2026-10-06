"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { createAccount, disableAccount, enableAccount, issueCode, unlockAccount, type AdminOutcome } from "@/lib/auth/administration";
import { parseAccountAct, parseCreateAccount, parseIssueCode } from "@/lib/auth/forms";
import { settingLabels } from "@/lib/auth/policy";
import { AUTH_WORDS } from "@/lib/auth/words";
import { formatOrgDateTime } from "@/lib/format";

import { requireStaff } from "@/app/_auth/actor";
import { currentRequestFacts, refuseForeignPost } from "@/app/_auth/cookies";

/**
 * Administering sign-in accounts (Phase 1b). Each action asks who is signed in first, then passes the Origin guard, parses what was posted (unknown
 * fields refused), and hands it to `administration.ts`, which judges it, writes it, audits it and logs it in one transaction. Who acts is the session's, never a field.
 */

const PATH = "/configuration/accounts";

/// What a refused act says to the form: the field-level faults where there are some, and the first in words otherwise.
function stateOf(outcome: Exclude<AdminOutcome, { ok: true }>): FormState {
  if (outcome.kind === "POLICY_NOT_SET") return { ok: false, message: `${AUTH_WORDS.policyNotSet.en}: ${settingLabels(outcome.unset).join("; ")}.` };
  const errors = outcome.fields ? Object.fromEntries(Object.entries(outcome.fields).flatMap(([k, f]) => (f && k !== "*" ? [[k, f.en]] : []))) : {};
  const general = outcome.fields?.["*"]?.en ?? (Object.keys(errors).length === 0 ? outcome.faults.map((f) => f.en).join(" ") : undefined);
  return { ok: false, ...(Object.keys(errors).length > 0 ? { errors } : {}), ...(general ? { message: general } : {}) };
}

export async function createAccountAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const parsed = parseCreateAccount(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const outcome = await createAccount(actor, parsed.value, await currentRequestFacts());
  if (!outcome.ok) return stateOf(outcome);
  revalidatePath(PATH);
  return { ok: true };
}

export async function disableAccountAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const parsed = parseAccountAct(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const outcome = await disableAccount(actor, parsed.value, await currentRequestFacts());
  if (!outcome.ok) return stateOf(outcome);
  revalidatePath(PATH);
  return { ok: true };
}

export async function enableAccountAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const parsed = parseAccountAct(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const outcome = await enableAccount(actor, parsed.value);
  if (!outcome.ok) return stateOf(outcome);
  revalidatePath(PATH);
  return { ok: true };
}

export async function unlockAccountAction(_prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const parsed = parseAccountAct(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const outcome = await unlockAccount(actor, parsed.value, await currentRequestFacts());
  if (!outcome.ok) return stateOf(outcome);
  revalidatePath(PATH);
  return { ok: true };
}

/// What issuing a code answers: the code itself, once. It is returned to the one form that asked and kept nowhere else: not in a URL, not in the page, not in the trail.
export type IssueCodeState = FormState & { issued?: { code: string; validUntil: string; officeHolderNotice: string | null } };

export async function issueCodeAction(_prev: FormState, data: FormData): Promise<IssueCodeState> {
  const actor = await requireStaff();
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const parsed = parseIssueCode(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const outcome = await issueCode(actor, parsed.value, await currentRequestFacts());
  if (!outcome.ok) return stateOf(outcome);
  revalidatePath(PATH);
  const { issued } = outcome;
  return { ok: true, issued: { code: issued.code, validUntil: formatOrgDateTime(issued.expiresAt, actor.organisationTimeZone), officeHolderNotice: issued.officeHolderNotice } };
}
