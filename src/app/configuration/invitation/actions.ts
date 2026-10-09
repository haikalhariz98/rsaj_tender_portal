"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/**
 * Invitation (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 */

export async function saveWindowPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveWindowPolicy", prev, data);
  return proposed;
}

export async function saveChannel(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveChannel", prev, data);
  return proposed;
}

export async function setChannelRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.setChannelRetired", prev, data);
  return proposed;
}

export async function saveFeeFloor(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveFeeFloor", prev, data);
  return proposed;
}

export async function removeFeeFloor(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.removeFeeFloor", prev, data);
  return proposed;
}

export async function saveCalendar(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveCalendar", prev, data);
  return proposed;
}

export async function setCalendarRetired(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.setCalendarRetired", prev, data);
  return proposed;
}

export async function saveCalendarYear(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveCalendarYear", prev, data);
  return proposed;
}

export async function saveHoliday(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveHoliday", prev, data);
  return proposed;
}

export async function removeHoliday(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.removeHoliday", prev, data);
  return proposed;
}

export async function importHolidayYear(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.importHolidayYear", prev, data);
  return proposed;
}

export async function saveMethodBidRule(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveMethodBidRule", prev, data);
  return proposed;
}

export async function saveMethodOpeningRule(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveMethodOpeningRule", prev, data);
  return proposed;
}

export async function saveOpeningPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("invitation.saveOpeningPolicy", prev, data);
  return proposed;
}
