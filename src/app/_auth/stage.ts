import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/record-editor";
import { OPERATIONS, type EditKey } from "@/app/configuration/_editors/operations";
import type { EditRegistry, EditRunResult } from "@/lib/auth/edit-store";
import { EDIT_DECIDE_PERMISSION, EDIT_PROPOSE_PERMISSION } from "@/lib/auth/configuration-edit";
import { proposeEdit, stagedFields } from "@/lib/auth/edit-store";
import type { StaffActor } from "@/lib/auth/types";

import { attributionRefusalState, beginAct } from "./act";
import { refuseForeignPost } from "./cookies";
import { requireStaff, staffForPermission } from "./actor";
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
    return op
      ? {
          key: op.key,
          kind: op.kind ?? "CONFIGURATION_EDIT",
          label: `${op.section}: ${op.label}`,
          administratorMay: op.administratorMay !== false,
          proposePermission: op.propose === "EDITOR" ? null : EDIT_PROPOSE_PERMISSION,
          decidePermission: op.decide ?? EDIT_DECIDE_PERMISSION,
        }
      : null;
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
export const PROPOSED_CORRECTION_NOTICE = "Proposed. Nothing has changed yet: a second person who holds the permission to decide corrections decides it, under Configuration, Changes waiting.";

/// A Configuration editor's exported action: the maker's permission is asked first.
export async function stageEdit(key: EditKey, _prev: FormState, data: FormData): Promise<FormState> {
  const guard = await staffForPermission("configuration.draft");
  if (!guard.ok) return guard.state;
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  return propose(guard.actor, key, data);
}

/**
 * An act of the record that a second person decides (a correction of a contract or an award, a lowered classification): the editor's own rule says who may do the act
 * and is judged in the rehearsal, so only who is signed in is asked first. An editor that is not declared an act of the record (`propose: "EDITOR"`) is refused here.
 */
export async function stageRecordEdit(key: EditKey, _prev: FormState, data: FormData): Promise<FormState> {
  const actor = await requireStaff();
  if ((OPERATIONS[key] as { propose?: string }).propose !== "EDITOR") return { ok: false, message: "That is a change to configuration, proposed by a holder of the drafting permission." };
  if (await refuseForeignPost()) return { ok: false, message: AUTH_WORDS.wrongOrigin.en };
  return propose(actor, key, data);
}

async function propose(actor: StaffActor, key: EditKey, data: FormData): Promise<FormState> {
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
  return { ok: true, notice: editRegistry.find(key)?.decidePermission === "configuration.issue" ? PROPOSED_NOTICE : PROPOSED_CORRECTION_NOTICE };
}
