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

/// How deep savepoints may nest. The statements are written out whole (`src/lib/db.ts`), one set per level, so that no SQL is assembled from pieces.
export const MAX_SAVEPOINT_DEPTH = 8;

/// The statements of a savepoint at a level (1 to `MAX_SAVEPOINT_DEPTH`), given by whoever holds the transaction client.
export interface SavepointSql {
  savepoint(level: number): Promise<unknown>;
  release(level: number): Promise<unknown>;
  rollbackTo(level: number): Promise<unknown>;
}

export interface Ambient {
  /// Whether the editor is being rehearsed (a proposal: everything is undone) or applied (a second person's decision: it stays). An act an editor begins while it is
  /// applied is the applier's own, except an act that names its subject in its form (a delegation's grantor): that is the proposer's, made at the proposal, and is
  /// attributed to the person the form names (`beginActAmbientWith`, ruling 1982(h)(1)).
  mode: "REHEARSAL" | "APPLY";
  /// Under APPLY, who proposed the change, from the change's own row and never from a form: the person whose act a named subject is attributed through.
  proposer?: { personId: string; name: string };
  /// The transaction client that `db` stands for while this is set.
  tx: object;
  sql: SavepointSql;
  /// Every audit row written while it is set, in order, with those of a rolled-back savepoint removed.
  captured: CapturedAudit[];
  /// How many savepoints are open now.
  depth: number;
  /// Security-log writes (the SULIT access log) made while it is set. They are not written when asked: a rehearsal, or an editor that refused, rolls its savepoint back and
  /// would erase the record that someone asked for a SULIT field and was told no (NFR-AUD-004). `attempt` writes them in the transaction itself, after the savepoint is
  /// settled, so they stay whatever became of the editor's own writes.
  survivors: Array<(client: object) => Promise<void>>;
}

const KEY = Symbol.for("perolehan.ambientTransaction");
const g = globalThis as unknown as { [KEY]?: AsyncLocalStorage<Ambient> };
export const ambientStore: AsyncLocalStorage<Ambient> = (g[KEY] ??= new AsyncLocalStorage<Ambient>());

export const currentAmbient = (): Ambient | undefined => ambientStore.getStore();

export const newAmbient = (tx: object, sql: SavepointSql, mode: Ambient["mode"], proposer?: Ambient["proposer"]): Ambient => ({ mode, ...(proposer ? { proposer } : {}), tx, sql, captured: [], depth: 0, survivors: [] });

/// Called by `writeAudit`: when an ambient transaction is set the row is also kept, so a rehearsal and a decision can read what the editor recorded.
export function captureAudit(row: CapturedAudit): void {
  ambientStore.getStore()?.captured.push(row);
}

/// Called by a security-log write: when an ambient transaction is set the write is held to be made after the savepoint settles, and true is returned; otherwise false and the caller writes now.
export function deferPastRollback(write: (client: object) => Promise<void>): boolean {
  const a = ambientStore.getStore();
  if (!a) return false;
  a.survivors.push(write);
  return true;
}

/// Writes the security-log rows held since `from`, in the ambient transaction itself, outside the savepoint just settled.
async function writeSurvivors(a: Ambient, from: number): Promise<void> {
  for (const write of a.survivors.splice(from)) await write(a.tx);
}

/// Opens the next level: a savepoint's level is how many are open, never anything a request says.
function open(a: Ambient): number {
  if (a.depth >= MAX_SAVEPOINT_DEPTH) throw new Error(`Savepoints nest no deeper than ${MAX_SAVEPOINT_DEPTH}.`);
  return ++a.depth;
}

/**
 * A nested `db.$transaction(fn)` while an ambient transaction is set: `fn` runs in a SAVEPOINT of the one transaction. If it throws, what it wrote is undone and the
 * error goes on. One that returns a refusal instead of throwing has written whatever it wrote before refusing, as it always did in its own transaction.
 */
export async function nested<T>(a: Ambient, fn: (tx: object) => Promise<T>): Promise<T> {
  const level = open(a);
  const mark = a.captured.length;
  try {
    await a.sql.savepoint(level);
    const result = await fn(a.tx);
    await a.sql.release(level);
    return result;
  } catch (e) {
    a.captured.length = mark;
    await a.sql.rollbackTo(level);
    await a.sql.release(level);
    throw e;
  } finally {
    a.depth = level - 1;
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
  const level = open(a);
  const mark = a.captured.length;
  const held = a.survivors.length;
  try {
    await a.sql.savepoint(level);
    let result: T;
    try {
      result = await ambientStore.run(a, fn);
    } catch (e) {
      a.captured.length = mark;
      await a.sql.rollbackTo(level);
      await a.sql.release(level);
      await writeSurvivors(a, held);
      throw e;
    }
    const captured = a.captured.slice(mark);
    if (keep(result, captured)) {
      await a.sql.release(level);
      await writeSurvivors(a, held);
      return { result, captured, kept: true };
    }
    a.captured.length = mark;
    await a.sql.rollbackTo(level);
    await a.sql.release(level);
    await writeSurvivors(a, held);
    return { result, captured, kept: false };
  } finally {
    a.depth = level - 1;
  }
}
