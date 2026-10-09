"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Committees (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveCommittee(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.saveCommittee", prev, data);
  return proposed;
}

export async function saveMember(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.saveMember", prev, data);
  return proposed;
}

export async function vacateSeat(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.vacateSeat", prev, data);
  return proposed;
}

export async function saveNotApprovedOutcome(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.saveNotApprovedOutcome", prev, data);
  return proposed;
}

export async function retireNotApprovedOutcome(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.retireNotApprovedOutcome", prev, data);
  return proposed;
}

export async function saveCommitteePanel(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.saveCommitteePanel", prev, data);
  return proposed;
}

export async function saveCommitteeQuorum(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("committees.saveCommitteeQuorum", prev, data);
  return proposed;
}
