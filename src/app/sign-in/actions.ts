"use server";

import { redirect, RedirectType } from "next/navigation";

import type { FormState } from "@/components/record-editor";
import { redeemOneTimeCode } from "@/lib/auth/account-store";
import { parseCodeForm, parseNoFields, parseSignIn } from "@/lib/auth/forms";
import { StaffCredentials } from "@/lib/auth/identity";
import { settingLabels } from "@/lib/auth/policy";
import { AFTER_SIGN_IN, SIGN_IN_PATH } from "@/lib/auth/routes";
import { signOutToken } from "@/lib/auth/session-store";
import { AUTH_WORDS } from "@/lib/auth/words";
import { SURFACE_ENV, surfaceOf } from "@/lib/portal/surface";

import { clearStaffCookie, currentRequestFacts, refuseForeignPost, setStaffCookie, staffToken } from "../_auth/cookies";

/**
 * The public entry points of staff sign-in. They are the only server actions that are reachable with nobody signed in, and each is a POST, so each
 * passes the Origin guard first. The public copy of the product has no staff sign-in, and refuses every server action at the proxy as well.
 */

const refused = (): FormState => ({ ok: false, message: AUTH_WORDS.wrongOrigin.en });

export async function signInAction(_prev: FormState, data: FormData): Promise<FormState> {
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") return { ok: false, message: AUTH_WORDS.signInFailed.en };
  if (await refuseForeignPost()) return refused();

  const parsed = parseSignIn(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const outcome = await StaffCredentials.authenticate(parsed.value, { request: await currentRequestFacts(), replacingToken: await staffToken() });
  if (outcome.ok) {
    await setStaffCookie(outcome.token, outcome.maxAgeSeconds);
    // One navigation (AC-8, AC-9a). The cookie write makes Next re-render this page in the action's answer, and /sign-in sends a signed-in person to /; a
    // client-side router.replace on top of that fetched / a second time. The redirect is the one navigation, and it replaces, so Back does not return to sign-in.
    redirect(AFTER_SIGN_IN, RedirectType.replace);
  }
  switch (outcome.kind) {
    case "SESSION_LIMIT":
      return { ok: false, message: AUTH_WORDS.sessionLimit.en };
    case "NOT_CONFIGURED":
      return { ok: false, message: AUTH_WORDS.notConfigured.en };
    case "NO_ADMINISTRATOR":
      return { ok: false, message: AUTH_WORDS.noAdministrator.en };
    case "UNSAFE_DATABASE_ROLE":
      return { ok: false, message: AUTH_WORDS.unsafeDatabaseRole.en };
    case "POLICY_NOT_SET":
      return { ok: false, message: `${AUTH_WORDS.policyNotSet.en}: ${settingLabels(outcome.unset).join("; ")}.` };
    case "FAILED":
      // The same words for a wrong password, a locked account, a held-back address and a name that does not exist.
      return { ok: false, message: AUTH_WORDS.signInFailed.en };
  }
}

export async function redeemCodeAction(_prev: FormState, data: FormData): Promise<FormState> {
  if (surfaceOf(process.env[SURFACE_ENV]) === "public") return { ok: false, message: AUTH_WORDS.codeFailed.en };
  if (await refuseForeignPost()) return refused();

  const parsed = parseCodeForm(data.entries());
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const outcome = await redeemOneTimeCode(parsed.value, await currentRequestFacts());
  if (outcome.ok) return { ok: true, href: `${SIGN_IN_PATH}?password=set` };
  switch (outcome.kind) {
    case "FIELDS":
      return { ok: false, errors: Object.fromEntries(Object.entries(outcome.faults).map(([field, fault]) => [field, fault.en])) };
    case "NOT_CONFIGURED":
      return { ok: false, message: AUTH_WORDS.notConfigured.en };
    case "NO_ADMINISTRATOR":
      return { ok: false, message: AUTH_WORDS.noAdministrator.en };
    case "UNSAFE_DATABASE_ROLE":
      return { ok: false, message: AUTH_WORDS.unsafeDatabaseRole.en };
    case "POLICY_NOT_SET":
      return { ok: false, message: `${AUTH_WORDS.policyNotSet.en}: ${settingLabels(outcome.unset).join("; ")}.` };
    case "FAILED":
      return { ok: false, message: AUTH_WORDS.codeFailed.en };
  }
}

/// Sign out is a POST: a link anyone can be sent to must not end a session. It works for whoever holds a cookie, signed in or not.
export async function signOutAction(data: FormData): Promise<void> {
  if ((await refuseForeignPost()) || !parseNoFields(data.entries()).ok) redirect(SIGN_IN_PATH);
  await signOutToken(await staffToken(), await currentRequestFacts());
  await clearStaffCookie();
  redirect(SIGN_IN_PATH);
}
