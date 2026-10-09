import type { FormState } from "@/components/record-editor";
import type { EditKind } from "@/lib/auth/configuration-edit";

/**
 * How an editor is made known to the two-person machinery (sign-in programme Phase 5). Each Configuration section lists its editors in its own `operations.ts`
 * beside its `core.ts`; `operations.ts` here gathers them. An editor in the list is never called by a browser: its exported action (`actions.ts`) proposes it, and
 * the editor itself (`core.ts`) runs only when the proposal is rehearsed and when a second person applies it.
 */

export type Runner = (prev: FormState, data: FormData) => Promise<FormState>;

export interface OperationDef {
  /// The editor in words, for the queue: "Save a numbering series". The section's name is put before it.
  label: string;
  /// The kind of change it is. Absent: an ordinary edit of configuration.
  kind?: EditKind;
  /// Whether an administrator account may propose or decide it. Absent: yes. False for an editor that reaches what an administrator is kept from.
  administratorMay?: false;
  /// The editor itself, from the section's `core.ts`. Loaded when it runs, so the registry does not pull every section into every page.
  load: () => Promise<Runner>;
}

export interface Operation extends OperationDef {
  key: string;
  section: string;
}

/// A section's editors, keyed `<prefix>.<name>`, where `name` is the action's exported name.
export function defineOperations<const P extends string, const D extends Record<string, OperationDef>>(prefix: P, section: string, defs: D): { [K in keyof D & string as `${P}.${K}`]: Operation } {
  const out: Record<string, Operation> = {};
  for (const [name, def] of Object.entries(defs)) out[`${prefix}.${name}`] = { ...def, key: `${prefix}.${name}`, section };
  return out as { [K in keyof D & string as `${P}.${K}`]: Operation };
}
