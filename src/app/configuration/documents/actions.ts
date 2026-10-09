"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Documents (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveDocumentClass(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("documents.saveDocumentClass", prev, data);
  return proposed;
}

export async function lowerClassClassification(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("documents.lowerClassClassification", prev, data);
  return proposed;
}

export async function saveStorePolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("documents.saveStorePolicy", prev, data);
  return proposed;
}
