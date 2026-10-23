/**
 * What a certificate brings to the first signature's pin, drawn from its row (6.14 inc 1 fix M-2; inc 2 residual M-1).
 * Pure: the act (`recordSignature`) and the certificate page's preview both call `pinCheck`, so the screen never says
 * a form is not ready when the act would pin it, nor the reverse.
 */

import { dayOrNull as day } from "@/lib/dates";
import { fieldsNamed } from "@/lib/templates/merge";

import { mergeFields } from "./fields";
import { applyOverrides, routingRatioOf, type OverrideRow } from "./override";
import { pinRefusals, type PinContext, type PinSheet, type TemplateNow } from "./revision";
import { readRoutingSnapshot, routingSheet, type Sheet } from "./routing-sheet";
import { sheetFieldValues } from "./sheet-words";
import { checksOf, routesOf, type CheckRowIn, type RouteRowIn } from "./sheet-rows";
import { readComputedSnapshot } from "./snapshot";
import type { CertificateKind, Finding } from "./types";

/// The columns a routing sheet is drawn from (a slim select need read only these).
export interface SheetSource {
  routingSnapshot: unknown;
  computedSnapshot: unknown;
  overrides: readonly OverrideRow[];
  routingReceivedOn: Date | null;
  approvalInstances: readonly RouteRowIn[];
  routingChecks: readonly CheckRowIn[];
}

/// And the pin's: its kind and status, whether it has a routing type, and its pinned baseline version's Contract Date.
export interface PinSource extends SheetSource {
  kind: CertificateKind | string;
  /// BD-613-103 / S-6: for a certificate raised without a form, whose words differ once it is void (every loaded row has it).
  status?: string;
  routingTypeId: string | null;
  baseline: { contractDate: Date | null };
}

/// The routing sheet as it stands, on the certificate's frozen type. Null: its sheet has not started.
export function sheetOf(cert: SheetSource, today: string): Sheet | null {
  const type = readRoutingSnapshot(cert.routingSnapshot);
  if (!type) return null;
  const snap = readComputedSnapshot(cert.computedSnapshot);
  // 614-C5: the ratio from the figures as they were sent for routing, overrides included (none is made after).
  const ratio = snap ? routingRatioOf(snap, applyOverrides(snap, cert.overrides)) : null;
  return routingSheet({ type, receivedOn: day(cert.routingReceivedOn), routes: routesOf(cert.approvalInstances), checks: checksOf(cert.routingChecks), ratio, today });
}

/// A drawn sheet as the pin judges it: its values in English, exactly as the issue prints them.
export function pinSheetOf(sheet: Sheet): PinSheet {
  return {
    state: "STARTED",
    decided: sheet.date2 != null || sheet.routeState === "APPROVED",
    typeLabel: sheet.type.labelEn,
    target: sheet.target.state,
    values: { EN: sheetFieldValues(sheet, "EN") },
  };
}

/**
 * What the certificate brings to the pin (M-2): its pinned baseline version's Contract Date, its frozen figures, and its
 * routing sheet once started. `today` null (the organisation's time zone not set): a started sheet is UNJUDGED, said
 * so rather than skipped; the act never runs without the day.
 */
export function pinContextOf(cert: PinSource, today: string | null = null): PinContext {
  const snap = readComputedSnapshot(cert.computedSnapshot);
  const f = snap ? applyOverrides(snap, cert.overrides) : null;
  const started = readRoutingSnapshot(cert.routingSnapshot) != null;
  const sheet = started ? (today ? pinSheetOf(sheetOf(cert, today)!) : ({ state: "UNJUDGED" } as const)) : null;
  return { contractDate: day(cert.baseline.contractDate), figures: f ? [...f.lines, ...f.totals].map((x) => ({ key: x.key, value: x.value })) : null, routed: cert.routingTypeId != null, sheet, raised: { kind: String(cert.kind), status: cert.status ?? "" } };
}

/// Everything the first signature refuses a form for on this certificate: the act's rule and the page's preview.
export function pinCheck(t: TemplateNow | null, cert: PinSource, today: string | null): Finding[] {
  return pinRefusals(t, mergeFields(cert.kind as CertificateKind), fieldsNamed, pinContextOf(cert, today));
}
