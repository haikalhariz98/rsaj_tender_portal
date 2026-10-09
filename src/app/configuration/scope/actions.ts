"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";
import { staffForPermission } from "@/app/_auth/actor";
import * as core from "./core";

/**
 * Scope and estimate (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 * The few named below are drafts or issues of their own, with their own maker-checker; each asks its permission first.
 */

export async function saveScopePolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveScopePolicy", prev, data);
  return proposed;
}

export async function saveQualification(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveQualification", prev, data);
  return proposed;
}

export async function savePersonQualification(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.savePersonQualification", prev, data);
  return proposed;
}

export async function saveBqTemplate(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveBqTemplate", prev, data);
  return proposed;
}

export async function saveBqTemplateSection(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveBqTemplateSection", prev, data);
  return proposed;
}

export async function saveSpecPanelColumn(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveSpecPanelColumn", prev, data);
  return proposed;
}

export async function saveMethodEstimateRule(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveMethodEstimateRule", prev, data);
  return proposed;
}

export async function saveBasisBqRule(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveBasisBqRule", prev, data);
  return proposed;
}

export async function saveMethodScopeRule(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("scope.saveMethodScopeRule", prev, data);
  return proposed;
}

export async function startRateIssue(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.startRateIssue(prev, data);
  return result;
}

export async function saveRateItem(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveRateItem(prev, data);
  return result;
}

export async function removeRateItem(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.removeRateItem(prev, data);
  return result;
}

export async function issueRateSchedule(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.issue");
  if (!guard.ok) return guard.state;
  const result = await core.issueRateSchedule(prev, data);
  return result;
}

export async function discardRateIssue(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.discardRateIssue(prev, data);
  return result;
}

export async function adoptRateDraft(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.adoptRateDraft(prev, data);
  return result;
}
