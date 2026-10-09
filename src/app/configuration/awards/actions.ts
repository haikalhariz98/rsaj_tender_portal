"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Awards (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveAwardPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveAwardPolicy", prev, data);
  return proposed;
}

export async function saveNonAwardPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveNonAwardPolicy", prev, data);
  return proposed;
}

export async function saveRecipient(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveRecipient", prev, data);
  return proposed;
}

export async function saveVariant(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveVariant", prev, data);
  return proposed;
}

export async function saveConditionKind(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveConditionKind", prev, data);
  return proposed;
}

export async function saveRequirement(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveRequirement", prev, data);
  return proposed;
}

export async function saveBand(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveBand", prev, data);
  return proposed;
}

export async function saveIssuer(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.saveIssuer", prev, data);
  return proposed;
}

export async function retireRow(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("awards.retireRow", prev, data);
  return proposed;
}
