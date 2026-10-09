"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Requisitions (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function savePolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("requisitions.savePolicy", prev, data);
  return proposed;
}

export async function saveBudgetCheckSource(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("requisitions.saveBudgetCheckSource", prev, data);
  return proposed;
}

export async function saveErpFormat(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("requisitions.saveErpFormat", prev, data);
  return proposed;
}

export async function saveGateRule(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("requisitions.saveGateRule", prev, data);
  return proposed;
}
