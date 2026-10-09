"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Contracts (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveContractPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("contracts.saveContractPolicy", prev, data);
  return proposed;
}

export async function saveDocumentPart(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("contracts.saveDocumentPart", prev, data);
  return proposed;
}

export async function saveCopyRecipient(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("contracts.saveCopyRecipient", prev, data);
  return proposed;
}

export async function retireContractRow(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("contracts.retireContractRow", prev, data);
  return proposed;
}
