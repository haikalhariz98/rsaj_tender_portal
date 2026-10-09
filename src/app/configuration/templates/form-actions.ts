"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Forms (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveSignatureBlock(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.saveSignatureBlock", prev, data);
  return proposed;
}

export async function removeSignatureBlock(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.removeSignatureBlock", prev, data);
  return proposed;
}

export async function saveDistributionRow(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.saveDistributionRow", prev, data);
  return proposed;
}

export async function removeDistributionRow(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.removeDistributionRow", prev, data);
  return proposed;
}

export async function savePageCount(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.savePageCount", prev, data);
  return proposed;
}

export async function savePrintedField(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.savePrintedField", prev, data);
  return proposed;
}

export async function removePrintedField(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-forms.removePrintedField", prev, data);
  return proposed;
}
