"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Reference data (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveFundingRoute(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveFundingRoute", prev, data);
  return proposed;
}

export async function saveSourcingMethod(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveSourcingMethod", prev, data);
  return proposed;
}

export async function saveContractType(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveContractType", prev, data);
  return proposed;
}

export async function retireEntry(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.retireEntry", prev, data);
  return proposed;
}

export async function restoreEntry(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.restoreEntry", prev, data);
  return proposed;
}

export async function saveContractBehaviours(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveContractBehaviours", prev, data);
  return proposed;
}

export async function saveChecklistItem(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveChecklistItem", prev, data);
  return proposed;
}

export async function retireChecklistItem(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.retireChecklistItem", prev, data);
  return proposed;
}

export async function saveJustificationReason(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveJustificationReason", prev, data);
  return proposed;
}

export async function saveContractBasis(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveContractBasis", prev, data);
  return proposed;
}

export async function saveTaxonomy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveTaxonomy", prev, data);
  return proposed;
}

export async function saveTaxonomyValue(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveTaxonomyValue", prev, data);
  return proposed;
}

export async function saveTaxonomyMapping(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveTaxonomyMapping", prev, data);
  return proposed;
}

export async function removeTaxonomyMapping(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.removeTaxonomyMapping", prev, data);
  return proposed;
}

export async function saveClassificationPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("reference-data.saveClassificationPolicy", prev, data);
  return proposed;
}
