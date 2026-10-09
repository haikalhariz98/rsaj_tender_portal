"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Routing sheets (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveRoutingType(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("routing-sheets.saveRoutingType", prev, data);
  return proposed;
}

export async function retireRoutingType(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("routing-sheets.retireRoutingType", prev, data);
  return proposed;
}

export async function saveCheckDef(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("routing-sheets.saveCheckDef", prev, data);
  return proposed;
}

export async function removeCheckDef(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("routing-sheets.removeCheckDef", prev, data);
  return proposed;
}

export async function saveTarget(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("routing-sheets.saveTarget", prev, data);
  return proposed;
}

export async function removeTarget(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("routing-sheets.removeTarget", prev, data);
  return proposed;
}
