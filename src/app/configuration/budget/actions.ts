"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";
import { requireStaff } from "@/app/_auth/actor";
import * as core from "./core";

/**
 * Budget (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 * The few named below are drafts or issues of their own, with their own maker-checker; each asks its permission first.
 */

export async function saveAllocation(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.saveAllocation", prev, data);
  return proposed;
}

export async function saveCommitment(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.saveCommitment", prev, data);
  return proposed;
}

export async function releaseCommitment(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.releaseCommitment", prev, data);
  return proposed;
}

export async function endAllocation(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.endAllocation", prev, data);
  return proposed;
}

export async function saveBudgetCode(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.saveBudgetCode", prev, data);
  return proposed;
}

export async function changePeriod(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.changePeriod", prev, data);
  return proposed;
}

/// The year and the switch are posted as the form the editor reads.
const rollForwardForm = (year: number, on: boolean): FormData => {
  const data = new FormData();
  data.set("year", String(year));
  data.set("on", on ? "yes" : "no");
  return data;
};

export async function setRollForward(year: number, on: boolean): Promise<FormState> {
  const proposed = await stageEdit("budget.setRollForward", { ok: false }, rollForwardForm(year, on));
  return proposed;
}

export async function addRevision(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.addRevision", prev, data);
  return proposed;
}

export async function transferBetweenCodes(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.transferBetweenCodes", prev, data);
  return proposed;
}

export async function saveBudgetControls(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.saveBudgetControls", prev, data);
  return proposed;
}

export async function clearBudgetControls(): Promise<FormState> {
  const proposed = await stageEdit("budget.clearBudgetControls", { ok: false }, new FormData());
  return proposed;
}

export async function saveFinanceSettings(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("budget.saveFinanceSettings", prev, data);
  return proposed;
}

/// Records an attempt to reach the finance system (there is no adapter yet). It changes no configuration: the attempt is a fact about the integration, signed-in only.
export async function synchroniseNow(): Promise<FormState> {
  await requireStaff();
  const result = await core.synchroniseNow();
  return result;
}

/// The variance is posted as the form the editor reads.
const varianceForm = (varianceId: string): FormData => {
  const data = new FormData();
  data.set("varianceId", varianceId);
  return data;
};

export async function acceptPortalFigure(varianceId: string): Promise<FormState> {
  const proposed = await stageEdit("budget.acceptPortalFigure", { ok: false }, varianceForm(varianceId));
  return proposed;
}
