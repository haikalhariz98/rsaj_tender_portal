"use server";

import type { FormState } from "@/components/record-editor";
import { stageEdit } from "@/app/_auth/stage";

/// Proposes the save; the editor itself is `core.ts`, and runs when a second person applies it (sign-in programme Phase 5b).
export async function saveSeries(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("numbering.saveSeries", prev, data);
  return proposed;
}
