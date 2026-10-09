"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Tender documents (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveTenderPart(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents.saveTenderPart", prev, data);
  return proposed;
}

export async function retireTenderPart(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents.retireTenderPart", prev, data);
  return proposed;
}

export async function restoreTenderPart(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents.restoreTenderPart", prev, data);
  return proposed;
}

export async function saveTenderPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents.saveTenderPolicy", prev, data);
  return proposed;
}

export async function saveMethodDocumentPack(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("tender-documents.saveMethodDocumentPack", prev, data);
  return proposed;
}
