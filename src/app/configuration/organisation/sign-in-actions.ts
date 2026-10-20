"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Sign-in page (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function uploadSignInImage(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation-sign-in.uploadSignInImage", prev, data);
  return proposed;
}

export async function removeSignInImage(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation-sign-in.removeSignInImage", prev, data);
  return proposed;
}

export async function uploadDarkLogo(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation-sign-in.uploadDarkLogo", prev, data);
  return proposed;
}

export async function removeDarkLogo(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation-sign-in.removeDarkLogo", prev, data);
  return proposed;
}

export async function saveSignInPage(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation-sign-in.saveSignInPage", prev, data);
  return proposed;
}

export async function savePortalPage(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation-sign-in.savePortalPage", prev, data);
  return proposed;
}
