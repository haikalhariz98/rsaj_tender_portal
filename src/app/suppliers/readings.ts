import { dayOrNull as day } from "@/lib/dates";
import { documentStates } from "@/lib/suppliers/documents";
import { expiryBand, worstBand } from "@/lib/suppliers/expiry";
import { documentFacts, type listSuppliers, type loadSupplierConfig } from "@/lib/suppliers/repo";
import { standing } from "@/lib/suppliers/standing";
import { standingEventFacts } from "@/lib/suppliers/standing-repo";
import type { SupplierStatus } from "@/lib/suppliers/types";

type Config = Awaited<ReturnType<typeof loadSupplierConfig>>;
type Listed = Pick<NonNullable<Awaited<ReturnType<typeof listSuppliers>>>["suppliers"][number], "id" | "status" | "registeredOn" | "documents" | "standingEvents">;

/**
 * Each supplier's standing (derived, OD-7 A) and its documents' expiry bands (FR-VND-008), read on the organisation's day and never stored. Built once for the
 * page and for the export route (7.6). With no day (`today` null) nothing is judged.
 */
export function readSuppliers(suppliers: readonly Listed[], cfg: Config, today: string | null) {
  const p = cfg.policy;
  const bands = { criticalDays: p?.criticalDays ?? null, warningDays: p?.warningDays ?? null, upcomingDays: p?.upcomingDays ?? null };
  const typeExpires = new Map(cfg.types.map((t) => [t.id, t.expires]));
  return new Map(
    suppliers.map((s) => {
      const docs = s.documents.map(documentFacts);
      const states = today ? documentStates(cfg.typeFacts, docs, today) : [];
      const st = today ? standing({ status: s.status as SupplierStatus, registeredOn: day(s.registeredOn) }, s.standingEvents.map(standingEventFacts), states.filter((x) => x.mandatory).map((x) => ({ typeLabel: x.type.label, state: x.state })), { autoSuspendOnLapse: p?.autoSuspendOnLapse ?? null }, today) : null;
      // The band of each type's document in force (a renewal counts once verified).
      const expiring = today ? states.filter((x) => x.effective && !x.effective.notApplicable && x.effective.expiresOn && typeExpires.get(x.type.id) !== false).map((x) => ({ type: x.type.label, doc: x.effective!, pending: !!x.pending, upcoming: x.upcoming?.validFrom ?? null, ...expiryBand(x.effective!.expiresOn, today, bands) })) : [];
      return [s.id, { states, standing: st, expiring, worst: worstBand(expiring.map((e) => e.band).filter((b) => b !== "NONE")) }] as const;
    }),
  );
}
