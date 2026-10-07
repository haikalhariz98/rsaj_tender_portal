import type { ReactNode } from "react";

import { RouteIcon } from "@/components/icons";
import { actLabel } from "@/components/ui/act";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { REJECTION_KIND_LABEL } from "@/lib/authority/rejection-labels";
import type { RejectionKind } from "@/lib/authority/rejection";
import { storedDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatSen as formatMoney, parseSen } from "@/lib/money";

/**
 * One approval route and its steps, drawn the same way wherever a post-award record carries one (6.13 Part A: lifted
 * unchanged from the certificate's page so a variation's routes match it): the rule and issue it was routed under, the
 * value, each step's office, act and decision (who decided it, signed or recorded from paper, read from its attribution), an escalation, and where a
 * refusal went. The caller supplies the act on a waiting step (deciding it, citing a committee, escalating it).
 */

const day = (d: Date | null | undefined) => (d ? storedDay(d) : null);

export interface RouteForCard {
  id: string;
  status: string;
  checkedAgainstMatrix: boolean;
  ruleLabel: string | null;
  ruleClause: string | null;
  matrixLabel: string | null;
  value: { toString(): string } | null;
  openedAt: Date;
  rejectionApplied: string | null;
  steps: readonly { id: string; sequence: number; roleCode: string | null; roleLabel: string; actingRoleLabel: string | null; act: string; decision: string; decidedByName: string | null; decidedOn: Date | null; receivedOn: Date | null; reason: string; escalation: string | null; escalationReason: string | null }[];
}

export function ApprovalRouteCard({ route, title, stepAction, officeName, acted, extra }: { route: RouteForCard; acted: (stepId: string, decidedByName: string | null) => string; title: string; stepAction: (routeId: string, sequence: number) => ReactNode; officeName: (code: string) => string | null; extra?: ReactNode }) {
  const state = route.status === "APPROVED" ? { text: "Approved", tone: "ok" as const } : route.status === "REJECTED" ? { text: "Refused", tone: "err" as const } : route.status === "RECALLED" ? { text: "Recalled", tone: "warn" as const } : { text: "Waiting for a decision", tone: "info" as const };
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<RouteIcon size={17} />} title={title} subtitle={`${route.checkedAgainstMatrix ? `${route.ruleLabel ?? "Its rule"}${route.ruleClause ? ` (${route.ruleClause})` : ""}, ${route.matrixLabel ?? "the approval matrix"}` : "Not routed by the approval matrix (recorded as given, not checked against it)"}; routed on ${route.value == null ? "no value" : formatMoney(parseSen(route.value.toString()))}; opened ${formatDate(day(route.openedAt))}.`} actions={<Badge tone={state.tone}>{state.text}</Badge>} divided />
      {extra}
      <ul className="divide-y divide-line/70">
        {route.steps.map((st) => (
          <li key={st.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold break-words text-ink">{`${st.sequence}. ${st.actingRoleLabel ?? st.roleLabel}`} <span className="font-normal text-ink-3">{`· ${actLabel(st.act)}`}</span></span>
              <span className="block text-[12.5px] break-words text-ink-3">
                {st.decision === "PENDING" ? (route.status === "PENDING" ? "Waiting" : "Not decided: the route closed.") : `${st.decision === "DONE" ? "Done" : "Refused"} · ${acted(st.id, st.decidedByName)} · ${formatDate(day(st.decidedOn))}${st.receivedOn ? ` · received ${formatDate(day(st.receivedOn))}` : ""}${st.reason ? ` · “${st.reason}”` : ""}`}
              </span>
              {st.escalation && <span className="block text-[12.5px] break-words text-amber-800">{`Escalated from ${officeName(st.roleCode ?? "") ?? st.roleLabel}: ${st.escalationReason ?? ""}`}</span>}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-2">{st.decision !== "PENDING" ? <Chip tone={st.decision === "DONE" ? "ok" : "err"}>{st.decision === "DONE" ? "Done" : "Refused"}</Chip> : stepAction(route.id, st.sequence)}</span>
          </li>
        ))}
      </ul>
      {route.status === "REJECTED" && route.rejectionApplied && (
        <CardBody className="border-t border-line/70">
          <p className="text-[12.5px] text-ink-3">{`Refused: ${REJECTION_KIND_LABEL[route.rejectionApplied as RejectionKind]}.`}</p>
        </CardBody>
      )}
    </Card>
  );
}
