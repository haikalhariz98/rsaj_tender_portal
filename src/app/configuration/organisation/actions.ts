"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Organisation (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveOrgUnit(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.saveOrgUnit", prev, data);
  return proposed;
}

export async function saveCostCentre(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.saveCostCentre", prev, data);
  return proposed;
}

export async function saveSite(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.saveSite", prev, data);
  return proposed;
}

export async function saveTimeZone(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.saveTimeZone", prev, data);
  return proposed;
}

export async function saveDetails(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.saveDetails", prev, data);
  return proposed;
}

export async function uploadLogo(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.uploadLogo", prev, data);
  return proposed;
}

export async function removeLogo(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("organisation.removeLogo", prev, data);
  return proposed;
}
