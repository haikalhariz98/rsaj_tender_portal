"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Suppliers (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveRegistrationValue(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveRegistrationValue", prev, data);
  return proposed;
}

export async function setRegistrationValueRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.setRegistrationValueRetired", prev, data);
  return proposed;
}

export async function saveDocumentType(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveDocumentType", prev, data);
  return proposed;
}

export async function setDocumentTypeRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.setDocumentTypeRetired", prev, data);
  return proposed;
}

export async function saveListValue(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveListValue", prev, data);
  return proposed;
}

export async function setListValueRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.setListValueRetired", prev, data);
  return proposed;
}

export async function saveSupplierPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveSupplierPolicy", prev, data);
  return proposed;
}

export async function savePortalIntake(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.savePortalIntake", prev, data);
  return proposed;
}

export async function saveRegistrationSettings(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveRegistrationSettings", prev, data);
  return proposed;
}

export async function saveDeclarationText(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveDeclarationText", prev, data);
  return proposed;
}

export async function setDeclarationTextRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.setDeclarationTextRetired", prev, data);
  return proposed;
}

export async function saveStandingReason(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveStandingReason", prev, data);
  return proposed;
}

export async function setStandingReasonRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.setStandingReasonRetired", prev, data);
  return proposed;
}

export async function saveStandingRules(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("suppliers.saveStandingRules", prev, data);
  return proposed;
}
