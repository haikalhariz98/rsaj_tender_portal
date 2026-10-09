"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";
import { staffForPermission } from "@/app/_auth/actor";
import * as core from "./core";

/**
 * Evaluation models (sign-in programme Phase 5b). Each editor here proposes: it checks who is signed in and what they hold, rehearses the editor in `core.ts` against
 * the live values, and keeps what was posted for a second person to decide. `core.ts` runs only then. Nothing in this file writes a record.
 * The few named below are drafts or issues of their own, with their own maker-checker; each asks its permission first.
 */

export async function saveModel(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveModel(prev, data);
  return result;
}

export async function issueModel(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.issue");
  if (!guard.ok) return guard.state;
  const result = await core.issueModel(prev, data);
  return result;
}

export async function adoptModelDraft(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.adoptModelDraft(prev, data);
  return result;
}

export async function retireModel(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("evaluation.retireModel", prev, data);
  return proposed;
}

export async function discardDraft(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.discardDraft(prev, data);
  return result;
}

export async function newModelVersion(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.newModelVersion(prev, data);
  return result;
}

export async function saveStage(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveStage(prev, data);
  return result;
}

export async function removeStage(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.removeStage(prev, data);
  return result;
}

export async function saveCriterion(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveCriterion(prev, data);
  return result;
}

export async function removeCriterion(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.removeCriterion(prev, data);
  return result;
}

export async function saveFactor(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveFactor(prev, data);
  return result;
}

export async function removeFactor(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.removeFactor(prev, data);
  return result;
}

export async function saveBandSet(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveBandSet(prev, data);
  return result;
}

export async function removeBandSet(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.removeBandSet(prev, data);
  return result;
}

export async function saveBand(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveBand(prev, data);
  return result;
}

export async function removeBand(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.removeBand(prev, data);
  return result;
}

export async function saveAspect(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("evaluation.saveAspect", prev, data);
  return proposed;
}

export async function retireAspect(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("evaluation.retireAspect", prev, data);
  return proposed;
}

export async function saveEvaluationPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("evaluation.saveEvaluationPolicy", prev, data);
  return proposed;
}

export async function saveBasisRoute(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("evaluation.saveBasisRoute", prev, data);
  return proposed;
}

export async function saveMethodModel(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("evaluation.saveMethodModel", prev, data);
  return proposed;
}
