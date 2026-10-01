/**
 * The dashboard's money figures, summed in sen (ruling C6): never through a float,
 * however many matters are added up.
 *
 * Pure.
 */

import { addSen, parseSen, type Sen } from "@/lib/money";

/// The value carried at committee on appointments: every carried appointment matter's
/// amount. A matter that states no amount adds nothing, and says so in its own count.
export function committedSen(decisions: readonly { outcome: string; domain: string; amount: { toString(): string } | null }[]): { total: Sen; counted: number; withoutAmount: number } {
  const carried = decisions.filter((d) => d.outcome === "CARRIED" && d.domain === "appointment");
  const withAmount = carried.filter((d) => d.amount != null);
  return { total: addSen(...withAmount.map((d) => parseSen(d.amount!.toString()))), counted: withAmount.length, withoutAmount: carried.length - withAmount.length };
}

/**
 * Sourcing exercises tallied by status, every status listed (a status with none counts
 * 0, which is a true count here, not an unset one). `open` is those not cancelled.
 */
export function exerciseTally<S extends string>(statuses: readonly S[], order: readonly S[]): { open: number; total: number; byStatus: { status: S; count: number }[] } {
  const byStatus = order.map((status) => ({ status, count: statuses.filter((s) => s === status).length }));
  return { open: statuses.filter((s) => (s as string) !== "CANCELLED").length, total: statuses.length, byStatus };
}
