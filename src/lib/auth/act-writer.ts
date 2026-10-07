import type { Tx } from "@/lib/audit/record";

/**
 * The part of a prepared act (`beginAct`, `src/app/_auth/act.ts`) that library code is handed: who the act is attributed to, how, and the one call that
 * writes its attribution inside the act's own transaction. Types only, so `src/lib` can take an act without importing the server side.
 */
export interface ActWriter {
  /// Whom the act is attributed to.
  subjectPersonId: string;
  /// The signed-in person where the act is attributed to someone else, else null.
  recorderId: string | null;
  intent: { mode: "SIGNED" | "RECORDED_ON_BEHALF" };
  /// The day the act is dated (YYYY-MM-DD), where it has one.
  day: string | null;
  write(tx: Tx, entityId: string, extra?: { document?: { entity: string; id: string } | null; roleCode?: string | null }): Promise<void>;
  writeAlso(tx: Tx, slotKey: string, entityId: string, extra?: { document?: { entity: string; id: string } | null; roleCode?: string | null }): Promise<void>;
}

/// What an audit row says of an act that was recorded for someone: nothing for a signed (or the person's own) act.
export const onBehalfAudit = (act: Pick<ActWriter, "intent">, words: string): string | null => (act.intent.mode === "RECORDED_ON_BEHALF" ? words : null);
