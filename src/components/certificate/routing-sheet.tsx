import type { ReactNode } from "react";

import { ClockIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KeyValues } from "@/components/ui/stat";
import { CERT_WORDS, CHECK_KIND_WORDS } from "@/lib/certificate/labels";
import type { CheckDef, Sheet } from "@/lib/certificate/routing-sheet";
import { printedSheetWords, verdictText } from "@/lib/certificate/sheet-words";
import { formatDate } from "@/lib/format";

/**
 * One routing sheet, drawn the same way wherever it is (ADR 0023): a certificate's and an award's pre-award
 * sheet. The header (the day received, the day approved, elapsed against the target, the stages' printed days)
 * and one card per iteration side by side (FR-CRT-009), each with its checks and its approval route's steps.
 * The caller supplies the acts: the received day's drawer and, for the current round's next check, its drawer.
 * The target and verdict are worded in src/lib/certificate/sheet-words.ts.
 */

const dim = (t: string) => <span className="text-ink-4">{t}</span>;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function RoutingSheetView({ sheet, headerAction, checkAction, open, routeNote, stepAction }: { sheet: Sheet; headerAction?: ReactNode; checkAction: (def: CheckDef) => ReactNode; open: boolean; routeNote: string; /** 6.13 Part A step 3 (614-C4): the act on a route's waiting step (deciding it, escalating it), where the caller has one. */ stepAction?: (routeId: string, sequence: number) => ReactNode }) {
  // 6.14 increment 2: the printed sheet and its labels, as frozen with the type (the form's labels beside the product's words).
  const printed = printedSheetWords(sheet.type);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ClockIcon size={17} />} title={sheet.type.labelEn} subtitle={`Frozen when the sheet started, ${formatDate(sheet.type.frozenOn)}. ${CERT_WORDS.calendarDays.en}.`} actions={headerAction} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Received", value: sheet.date1 ? formatDate(sheet.date1) : dim("Not recorded") },
              { label: "Approved", value: sheet.date2 ? formatDate(sheet.date2) : dim(sheet.routeState === "NONE" ? "No approval route open yet" : sheet.routeState === "RECALLED" ? "Not approved: its route was recalled" : "Not approved yet") },
              { label: "Elapsed against the target", value: verdictText(sheet) },
              { label: "The stages' printed days", value: sheet.parts ? `${days(sheet.parts.sum)}${sheet.parts.differs && sheet.target.state === "SET" ? `: the form prints a total of ${sheet.target.days}, which differs from the sum of its parts (both shown)` : ""}` : dim("Not printed per stage") },
              { label: "Printed sheet", value: printed.labels ? printed.form.en : dim(printed.form.en) },
              ...(printed.labels ? [{ label: "Its printed labels", value: printed.labels.en }] : []),
            ]}
          />
        </CardBody>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        {sheet.iterations.map((it) => (
          <Card key={it.n} className="overflow-hidden">
            <CardHeader title={it.n === 1 ? "First submission" : `Resubmission ${it.n - 1}`} subtitle={`${it.receivedOn ? `Received ${formatDate(it.receivedOn)}` : "Received: not recorded"}${it.endedOn ? ` · decided ${formatDate(it.endedOn)}` : ""}${it.elapsed != null ? ` · ${days(it.elapsed)}` : ""}`} divided />
            <ul className="divide-y divide-line/70">
              {it.checks.map((c) => {
                const current = open && it.n === sheet.current.n;
                const earlier = it.checks.find((x) => x.def.order < c.def.order && !x.recorded);
                return (
                  <li key={c.def.order} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold break-words text-ink">{c.def.labelEn}</span>
                      <span className="block text-[12.5px] break-words text-ink-3">
                        {c.recorded ? `${CHECK_KIND_WORDS[c.def.kind].en} ${c.recorded.personName}, ${formatDate(c.recorded.on)}${c.recorded.note ? ` · ${c.recorded.note}` : ""}` : [`${CHECK_KIND_WORDS[c.def.kind].en}: ${c.def.officeLabel ?? CERT_WORDS.officeNotSet.en}`, c.def.targetDays ? `${days(c.def.targetDays)} printed` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {c.recorded ? <Chip tone="ok">Recorded</Chip> : current ? (earlier ? <Blocked label="Record" reason={`"${earlier.def.labelEn}" is recorded first.`} /> : checkAction(c.def)) : <Chip>{it.n < sheet.current.n ? "Not recorded in that round" : "Not recorded"}</Chip>}
                    </span>
                  </li>
                );
              })}
              {it.route ? (
                it.route.steps.map((s) => (
                  <li key={`s${s.sequence}`} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold break-words text-ink">{s.actingRoleLabel ?? s.roleLabel}</span>
                      <span className="block text-[12.5px] break-words text-ink-3">{s.decidedOn ? `${s.decidedByName ?? "Decided"}, ${formatDate(s.decidedOn)}` : s.receivedOn ? `Received ${formatDate(s.receivedOn)}, waiting` : "Waiting"}</span>
                    </span>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      {s.decision === "PENDING" && stepAction ? stepAction(it.route!.id, s.sequence) : null}
                      <Chip tone={s.decision === "DONE" ? "ok" : s.decision === "REJECTED" ? "err" : undefined}>{s.decision === "DONE" ? "Done" : s.decision === "REJECTED" ? "Refused" : "Pending"}</Chip>
                    </span>
                  </li>
                ))
              ) : (
                <li className="px-5 py-3 text-[12.5px] text-ink-3 sm:px-6">{routeNote}</li>
              )}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
