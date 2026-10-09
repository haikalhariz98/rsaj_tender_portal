"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Glossary (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveCorrection(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-glossary.saveCorrection", prev, data);
  return proposed;
}

export async function removeCorrection(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-glossary.removeCorrection", prev, data);
  return proposed;
}

export async function saveTerm(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-glossary.saveTerm", prev, data);
  return proposed;
}

export async function removeTerm(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("templates-glossary.removeTerm", prev, data);
  return proposed;
}
