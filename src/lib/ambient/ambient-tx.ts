import { AsyncLocalStorage } from "node:async_hooks";

import type { FieldChange } from "@/lib/audit/diff";

/**
 * The ambient transaction (sign-in programme Phase 5b).
 *
 * A two-person change to configuration is an editor's save, held until a second person decides it. When they do, the editor's own code runs, as it always did:
 * but inside the decision's transaction, so that the write, its audit rows and the decision are one act or none. Rather than rewrite 180 editors to take a
 * transaction, the editors keep using `db`, and while an ambient transaction is set `db` is that transaction (see `src/lib/db.ts`). A `db.$transaction(fn)`
 * inside it becomes a SAVEPOINT, so an editor that fails part-way undoes its own writes and nothing else.
 *
 * The same device runs a proposal as a rehearsal: the editor runs against the live values, every audit row it writes is captured (that is what the second person
 * is shown, in the trail's own words), and everything is undone, so the proposer is told at once whatever the editor would refuse and nothing is left behind.
 *
 * It is a store on `globalThis`, because Next bundles route handlers, server actions and pages apart and a module-level store would not be shared between them.
 * This file reads nothing of the database: whoever holds the transaction hands in the three statements that make a savepoint.
 */

export interface CapturedAudit {
  entity: string;
  entityId: string;
  entityLabel: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  reason: string;
  changes: FieldChange[];
}

/// The statements of a savepoint, given by whoever holds the transaction client.
export interface SavepointSql {
  savepoint(name: string): Promise<unknown>;
  release(name: string): Promise<unknown>;
  rollbackTo(name: string): Promise<unknown>;
}

export interface Ambient {
  /// Whether the editor is being rehearsed (a proposal: everything is undone) or applied (a second person's decision: it stays). An act an editor begins while it is
  /// applied is attributed to the person applying it, and what its form names is data, not an attestation (`src/app/_auth/act.ts`).
  mode: "REHEARSAL" | "APPLY";
  /// The transaction client that `db` stands for while this is set.
  tx: object;
  sql: SavepointSql;
  /// Every audit row written while it is set, in order, with those of a rolled-back savepoint removed.
  captured: CapturedAudit[];
  savepoints: number;
}

const KEY = Symbol.for("perolehan.ambientTransaction");
const g = globalThis as unknown as { [KEY]?: AsyncLocalStorage<Ambient> };
export const ambientStore: AsyncLocalStorage<Ambient> = (g[KEY] ??= new AsyncLocalStorage<Ambient>());

export const currentAmbient = (): Ambient | undefined => ambientStore.getStore();

export const newAmbient = (tx: object, sql: SavepointSql, mode: Ambient["mode"]): Ambient => ({ mode, tx, sql, captured: [], savepoints: 0 });

/// Called by `writeAudit`: when an ambient transaction is set the row is also kept, so a rehearsal and a decision can read what the editor recorded.
export function captureAudit(row: CapturedAudit): void {
  ambientStore.getStore()?.captured.push(row);
}

/// A savepoint's name is made from a counter and never from input.
const nameOf = (a: Ambient) => `amb_${++a.savepoints}`;

/**
 * A nested `db.$transaction(fn)` while an ambient transaction is set: `fn` runs in a SAVEPOINT of the one transaction. If it throws, what it wrote is undone and the
 * error goes on. One that returns a refusal instead of throwing has written whatever it wrote before refusing, as it always did in its own transaction.
 */
export async function nested<T>(a: Ambient, fn: (tx: object) => Promise<T>): Promise<T> {
  const name = nameOf(a);
  const mark = a.captured.length;
  await a.sql.savepoint(name);
  try {
    const result = await fn(a.tx);
    await a.sql.release(name);
    return result;
  } catch (e) {
    a.captured.length = mark;
    await a.sql.rollbackTo(name);
    await a.sql.release(name);
    throw e;
  }
}

export interface Attempt<T> {
  result: T;
  /// The audit rows the editor wrote.
  captured: CapturedAudit[];
  /// Whether its writes stay in the transaction (false: they were undone).
  kept: boolean;
}

/**
 * Run an editor with `db` standing for the transaction `a` holds, inside a savepoint. `keep` judges its result: where it says no (the editor refused, or the
 * caller is rehearsing) everything the editor wrote is undone, whatever it returned; where yes the savepoint is released and the writes stay in the transaction.
 * Either way, what the editor recorded in the audit trail is handed back.
 */
export async function attempt<T>(a: Ambient, fn: () => Promise<T>, keep: (result: T, captured: CapturedAudit[]) => boolean): Promise<Attempt<T>> {
  const name = nameOf(a);
  const mark = a.captured.length;
  await a.sql.savepoint(name);
  let result: T;
  try {
    result = await ambientStore.run(a, fn);
  } catch (e) {
    a.captured.length = mark;
    await a.sql.rollbackTo(name);
    await a.sql.release(name);
    throw e;
  }
  const captured = a.captured.slice(mark);
  if (keep(result, captured)) {
    await a.sql.release(name);
    return { result, captured, kept: true };
  }
  a.captured.length = mark;
  await a.sql.rollbackTo(name);
  await a.sql.release(name);
  return { result, captured, kept: false };
}
