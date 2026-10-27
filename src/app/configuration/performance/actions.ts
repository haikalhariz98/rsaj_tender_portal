"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";
import { staffForPermission } from "@/app/_auth/actor";
import * as core from "./core";

/**
 * Performance forms (Phase 2 close-out stage D). A draft's edits are its maker's and its issue a non-maker's, each asking its permission first and
 * calling `core.ts`, which holds the draft's rule; retiring an issued form is proposed here and runs in `core.ts` when a second person applies it.
 * Nothing in this file writes a record.
 */

export async function saveForm(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.saveForm(prev, data);
  return result;
}

export async function discardForm(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  const result = await core.discardForm(prev, data);
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

export async function issueForm(prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.issue");
  if (!guard.ok) return guard.state;
  const result = await core.issueForm(prev, data);
  return result;
}

export async function retireForm(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("performance.retireForm", prev, data);
  return proposed;
}
