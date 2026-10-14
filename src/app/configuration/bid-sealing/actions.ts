"use server";

import { stageEdit } from "@/app/_auth/stage";
import type { FormState } from "@/components/record-editor";

/** Configuration > Bid sealing: a proposal of the editor in `core.ts`. Nothing in this file writes a record. */

export async function saveBidSealingPolicy(prev: FormState, data: FormData): Promise<FormState> {
  const proposed = await stageEdit("bidSealing.saveBidSealingPolicy", prev, data);
  return proposed;
}
