"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Users and roles (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function savePerson(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.savePerson", prev, data);
  return proposed;
}

export async function setPersonActive(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.setPersonActive", prev, data);
  return proposed;
}

/// A cell of the permissions grid is posted as the form the editor reads.
const grantForm = (roleCode: string, capabilityId: string, granted: boolean): FormData => {
  const data = new FormData();
  data.set("roleCode", roleCode);
  data.set("capabilityId", capabilityId);
  data.set("granted", granted ? "yes" : "no");
  return data;
};

export async function setGrant(roleCode: string, capabilityId: string, granted: boolean): Promise<FormState> {
  const proposed = await stageEdit("users.setGrant", { ok: false }, grantForm(roleCode, capabilityId, granted));
  return proposed;
}

export async function saveDelegation(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.saveDelegation", prev, data);
  return proposed;
}

export async function saveReportingLine(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.saveReportingLine", prev, data);
  return proposed;
}

export async function saveOffice(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.saveOffice", prev, data);
  return proposed;
}

export async function saveAssignment(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.saveAssignment", prev, data);
  return proposed;
}

export async function endAssignment(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("users.endAssignment", prev, data);
  return proposed;
}
