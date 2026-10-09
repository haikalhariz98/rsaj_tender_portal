import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { OPERATIONS, type EditKey } from "@/app/configuration/_editors/operations";
import type { EditRegistry, EditRunResult } from "@/lib/auth/edit-store";
import { proposeEdit, stagedFields } from "@/lib/auth/edit-store";

import { attributionRefusalState, beginAct } from "./act";
import { refuseForeignPost } from "./cookies";
import { staffForPermission } from "./actor";
import { AUTH_WORDS } from "@/lib/auth/words";

/**
 * An editor's exported action (sign-in programme Phase 5). Every Configuration editor but the sign-in and matrix ones proposes: it checks who is signed in
 * and what they hold, rehearses the editor against the live values, and keeps what was posted for a second person to decide. Nothing is written until then.
 * What the rehearsal refuses is answered at once in the editor's own words, beside its own fields.
 */

/// The registry as the store reads it. The editors are loaded when one runs.
export const editRegistry: EditRegistry = {
  find(key) {
    const op = (OPERATIONS as Record<string, (typeof OPERATIONS)[EditKey] | undefined>)[key];
    return op ? { key: op.key, kind: op.kind ?? "CONFIGURATION_EDIT", label: `${op.section}: ${op.label}`, administratorMay: op.administratorMay !== false } : null;
  },
  async run(key, data): Promise<EditRunResult> {
    const op = (OPERATIONS as Record<string, (typeof OPERATIONS)[EditKey] | undefined>)[key];
    if (!op) return { ok: false, message: "That is not an editor a change can carry." };
    const run = await op.load();
    const result = await run({ ok: false }, data);
    return { ok: result.ok, ...(result.errors ? { errors: result.errors } : {}), ...(result.message ? { message: result.message } : {}) };
  },
};

export const PROPOSED_NOTICE = "Proposed. Nothing has changed yet: a second person who holds the permission to issue configuration decides it, under Configuration, Changes waiting.";

export async function stageEdit(key: EditKey, _prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  const actor = guard.actor;
  // The proposer's attribution is begun (not a signature, so no password): the person is the signed-in one.
  const begun = await beginAct(actor, data, "ConfigurationChange.proposedBy", { personField: "personId" });
  if (!begun.ok) return begun.state;
  try {
    const outcome = await proposeEdit(actor, begun.act, editRegistry, { operation: key, fields: await stagedFields(data), reason: String(data.get("reason") ?? ""), posted: data });
    if (!outcome.ok) {
      if (outcome.kind === "EDITOR") return { ok: false, ...(outcome.result.errors ? { errors: outcome.result.errors } : {}), ...(outcome.result.message ? { message: outcome.result.message } : {}) };
      return { ok: false, message: outcome.faults.map((x) => x.en).join(" ") };
    }
  } catch (e) {
    const refused = attributionRefusalState(e);
    if (refused) return refused;
    throw e;
  }
  revalidatePath("/configuration/changes");
  return { ok: true, notice: PROPOSED_NOTICE };
}
