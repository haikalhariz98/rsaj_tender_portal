"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Funding (ADR 0046). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against the live values, and
 * keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveFundingSource(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("funding.saveFundingSource", prev, data);
  return proposed;
}

export async function saveProjectCategory(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("funding.saveProjectCategory", prev, data);
  return proposed;
}

export async function saveImpactMeasure(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("funding.saveImpactMeasure", prev, data);
  return proposed;
}

export async function setFundingRowRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("funding.setFundingRowRetired", prev, data);
  return proposed;
}
