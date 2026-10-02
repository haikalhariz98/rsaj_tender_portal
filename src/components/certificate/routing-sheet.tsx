import type { ReactNode } from "react";

import { ClockIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KeyValues } from "@/components/ui/stat";
import { CERT_WORDS, CHECK_KIND_WORDS } from "@/lib/certificate/labels";
import type { CheckDef, Sheet } from "@/lib/certificate/routing-sheet";
import { formatDate } from "@/lib/format";

/**
 * One routing sheet, drawn the same way wherever it is (ADR 0023): a certificate's and an award's pre-award
 * sheet. The header (DATE (1), DATE (2), elapsed against the target, the stages' printed days) and one card
 * per iteration side by side (FR-CRT-009), each with its checks and its approval route's steps. The caller
 * supplies the acts: the DATE (1) drawer and, for the current round's next check, its drawer.
 */

const dim = (t: string) => <span className="text-ink-4">{t}</span>;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function targetText(sheet: Sheet): string {
  const t = sheet.target;
  if (t.state === "SET") {
    if (!t.band) return days(t.days);
    const lo = t.band.pctMin;
    const hi = t.band.pctMax;
    return `${days(t.days)} (${lo != null && hi != null ? `above ${lo}% and up to ${hi}%` : lo != null ? `above ${lo}%` : `up to ${hi}%`}, for this percentage)`;
  }
  if (t.state === "EDGE_UNDECIDED") return CERT_WORDS.edgeUndecided.en;
  if (t.state === "NO_RATIO") return "Target not set: the type's targets are banded and no percentage was handed in with the figures";
  if (t.state === "NO_BAND") return "Target not set: no band of the type covers this percentage";
  if (t.state === "OVERLAP") return "Target not set: two of the type's targets overlap";
  return CERT_WORDS.targetNotSet.en;
}

export function verdictText(sheet: Sheet): string {
  const v = sheet.verdict;
  const target = targetText(sheet);
  switch (v.state) {
    case "NOT_STARTED":
      return `Not started: DATE (1) is not recorded. Target: ${target}.`;
    case "MET":
      return `${days(v.elapsed)} against ${target}: met.`;
    case "OVER":
      return `${days(v.elapsed)} against ${target}: ${days(v.by)} over.`;
    case "OPEN":
      return `Open: ${days(v.soFar)} so far against ${target}${v.overBy ? `, ${days(v.overBy)} over` : ""}.`;
    case "NOT_MEASURED":
      return `${v.elapsed == null ? "Open" : days(v.elapsed)}. ${target}, so it is not judged met or over.`;
  }
}

export function RoutingSheetView({ sheet, headerAction, checkAction, open, routeNote }: { sheet: Sheet; headerAction?: ReactNode; checkAction: (def: CheckDef) => ReactNode; open: boolean; routeNote: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ClockIcon size={17} />} title={sheet.type.labelEn} subtitle={`Frozen when the sheet started, ${formatDate(sheet.type.frozenOn)}. ${CERT_WORDS.calendarDays.en}.`} actions={headerAction} />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "DATE (1): received", value: sheet.date1 ? formatDate(sheet.date1) : dim("Not recorded") },
              { label: "DATE (2): approved", value: sheet.date2 ? formatDate(sheet.date2) : dim(sheet.routeState === "NONE" ? "No approval route open yet" : "Not approved yet") },
              { label: "Elapsed against the target", value: verdictText(sheet) },
              { label: "The stages' printed days", value: sheet.parts ? `${days(sheet.parts.sum)}${sheet.parts.differs && sheet.target.state === "SET" ? `: the form prints a total of ${sheet.target.days}, which differs from the sum of its parts (both shown)` : ""}` : dim("Not printed per stage") },
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
                    <Chip tone={s.decision === "DONE" ? "ok" : s.decision === "REJECTED" ? "err" : undefined}>{s.decision === "DONE" ? "Done" : s.decision === "REJECTED" ? "Refused" : "Pending"}</Chip>
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
