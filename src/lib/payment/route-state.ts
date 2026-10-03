/**
 * Whether a certificate may be sent for approval now, and the figure it is routed on (6.13 Part A step 3: 614-C4,
 * FR-PAY-016, OD-A6). Pure: read by the act (route-open.ts) and by the certificate page's button, so the two agree.
 */

import type { applyOverrides } from "@/lib/certificate/override";
import { parseSen, type Sen } from "@/lib/money";

import { ROUTE_FIGURE_WORDS } from "./labels";
import { interimRouteFigure } from "./route";
import type { Finding, PaymentRouteFigure } from "./types";

const one = (code: string, data: Record<string, string | number | null> = {}): Finding[] => [{ code, level: "block", data }];

/// Why the certificate cannot be sent for approval now, from its own state (the route's rule is judged after).
export function submitStateFaults(i: { domain: string | null; status: string; latest: { status: string; applied: string | null; choices: readonly string[] } | null }): Finding[] {
  if (!i.domain) return one("KIND_HAS_NO_ROUTE");
  if (i.status !== "DRAFT" && i.status !== "IN_ROUTING") return one("NOT_ROUTABLE_STATUS");
  const r = i.latest;
  if (r && (r.status === "PENDING" || r.status === "APPROVED")) return one("ROUTE_ALREADY_OPEN", { state: r.status });
  // A refusal still waiting for the officer's choice, or one that went anywhere but back to whoever raised it.
  if (r && r.status === "REJECTED" && r.applied !== "RETURN_TO_ORIGINATOR") return one("ROUTE_NOT_REOPENABLE");
  return [];
}

/// The figure the certificate is routed on, from its figures as they stand.
export function routeValueOf(kind: string, figures: ReturnType<typeof applyOverrides> | null, choice: PaymentRouteFigure | null, contractSum: Sen): { value: Sen; figure: string } | Finding[] {
  const total = (k: string) => {
    const v = figures?.totals.find((t) => t.key === k)?.value ?? figures?.lines.find((l) => l.key === k)?.value ?? null;
    return v == null ? null : parseSen(v);
  };
  if (kind === "INTERIM_PAYMENT") {
    const r = interimRouteFigure(choice, { recommended: total("recommended"), grossThisPeriod: total("grossThisPeriod") });
    if (r.state === "NOT_SET") return one("ROUTE_FIGURE_NOT_SET");
    if (r.state === "NOT_COMPUTED") return one("ROUTE_FIGURE_NOT_COMPUTED");
    return { value: r.value, figure: ROUTE_FIGURE_WORDS[r.figure].en.toLowerCase() };
  }
  if (kind === "ADVANCE_PAYMENT") {
    const v = total("advanceAmount");
    return v == null ? one("ROUTE_FIGURE_NOT_COMPUTED") : { value: v, figure: "the advance's amount" };
  }
  return { value: contractSum, figure: "the contract sum" };
}

