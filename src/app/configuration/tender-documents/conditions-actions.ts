"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Conditions of contract (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveRegistrationBody(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents-conditions.saveRegistrationBody", prev, data);
  return proposed;
}

export async function retireRegistrationBody(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents-conditions.retireRegistrationBody", prev, data);
  return proposed;
}

export async function restoreRegistrationBody(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents-conditions.restoreRegistrationBody", prev, data);
  return proposed;
}

export async function saveClause(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents-conditions.saveClause", prev, data);
  return proposed;
}

export async function retireClause(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents-conditions.retireClause", prev, data);
  return proposed;
}

export async function restoreClause(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents-conditions.restoreClause", prev, data);
  return proposed;
}
