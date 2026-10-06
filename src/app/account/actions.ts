"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { acknowledgeResetNotice, changePassword } from "@/lib/auth/account-store";
import { parseChangePassword, parseNoFields } from "@/lib/auth/forms";
import { signOutEverywhere } from "@/lib/auth/identity";
import { settingLabels } from "@/lib/auth/policy";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { AUTH_WORDS } from "@/lib/auth/words";

import { refusalState, requireStaff } from "../_auth/actor";
import { clearStaffCookie, currentRequestFacts, refuseForeignPost, setStaffCookie } from "../_auth/cookies";

/// What the signed-in person does to their own account. Each asks who is signed in first, then passes the Origin guard.

export async function changePasswordAction(_prev: FormState, data: FormData): Promise<FormState> {
  let actor;
  try {
    actor = await requireStaff({ on: "throw" });
  } catch (error) {
    const refusal = refusalState(error);
    if (refusal) return refusal;
    throw error;
  }
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };

  const parsed = parseChangePassword(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const outcome = await changePassword(actor, { current: parsed.value.current, next: parsed.value.password }, await currentRequestFacts());
  if (!outcome.ok) {
    switch (outcome.kind) {
      case "FIELDS":
        return { ok: false, errors: Object.fromEntries(Object.entries(outcome.faults).map(([field, fault]) => [field, fault.en])) };
      case "LOCKED":
        return { ok: false, message: "This account is locked after too many wrong passwords. Try again later." };
      case "POLICY_NOT_SET":
        return { ok: false, message: `${AUTH_WORDS.policyNotSet.en}: ${settingLabels(outcome.unset).join("; ")}.` };
    }
  }
  // The token changed with the password: the cookie follows, or this session would be the one signed out.
  await setStaffCookie(outcome.token, outcome.maxAgeSeconds);
  revalidatePath("/account");
  return { ok: true, message: AUTH_WORDS.passwordChanged.en };
}

/// Nobody signed in (a stale tab, a session that ended) is sent to sign in, not shown an error.
async function staffOrSignIn() {
  try {
    return await requireStaff({ on: "throw" });
  } catch (error) {
    if (refusalState(error)) redirect(SIGN_IN_PATH);
    throw error;
  }
}

export async function signOutEverywhereAction(data: FormData): Promise<void> {
  const actor = await staffOrSignIn();
  if ((await refuseForeignPost()) || !parseNoFields(data.entries()).ok) redirect("/account");
  await signOutEverywhere(actor, await currentRequestFacts());
  await clearStaffCookie();
  redirect(SIGN_IN_PATH);
}

export async function acknowledgeResetAction(data: FormData): Promise<void> {
  const actor = await staffOrSignIn();
  if ((await refuseForeignPost()) || !parseNoFields(data.entries()).ok) return;
  await acknowledgeResetNotice(actor, await currentRequestFacts());
  revalidatePath("/welcome");
  revalidatePath("/account");
}
