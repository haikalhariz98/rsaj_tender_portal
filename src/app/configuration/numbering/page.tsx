import { loadSeries } from "@/lib/numbering/load";
import { patternFaults, periodFor, previewNext, serialFor } from "@/lib/numbering/series";
import { organisationDay } from "@/lib/dates";
import { organisationTimeZone } from "@/lib/org-time";

import { Section } from "../records-ui";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddSeries, EditSeries } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { HistoryButton } from "@/components/history-drawer";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Numbering" };

const RESET_LABEL: Record<string, string> = {
  NEVER: "Never",
  CALENDAR_YEAR: "Each calendar year",
  FINANCIAL_YEAR: "Each financial year",
};

export default async function NumberingPage() {
  const actor = await requireStaff();
  // Previews are drawn on the organisation's day, never the UTC one; with no zone set
  // the period a serial belongs to is not known, so none is shown (6.10 §9.5 follow-up).
  const zone = await organisationTimeZone(actor.organisationId);
  const day = organisationDay(new Date(), zone);
  const on = day ?? new Date();
  const series = await loadSeries(actor.organisationCode);
  const faulty = series.filter((s) => patternFaults(s).length > 0);

  return (
    <>
      <PageHeader
        title="Numbering"
        badge={
          faulty.length > 0 ? (
            <Badge tone="warn" dot>
              {faulty.length === 1 ? "1 pattern at fault" : `${faulty.length} patterns at fault`}
            </Badge>
          ) : undefined
        }
        info={{ title: "Numbering", text: "How references are formed. A reference is the business key of a record, so it is configured. A cancelled record's number is not reused; the gap is recorded." }}
      />

      {!day && (
        <Callout tone="warn" title="The organisation's time zone is not set" className="mb-6">
          Set it under Organisation to save a series.
        </Callout>
      )}
      {faulty.length > 0 && (
        <Callout tone="err" title="A pattern would repeat references" className="mb-6">
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {faulty.map((s) =>
              patternFaults(s).map((f) => (
                <li key={`${s.id}-${f.kind}`} className="text-[13px]">
                  <strong>{s.nameEn}</strong>: 
                  {f.kind === "NO_SERIAL"
                    ? "no {SERIAL} in the pattern, so every reference would be the same."
                    : f.kind === "UNKNOWN_TOKEN"
                      ? `{${f.token}} is not a token and is rendered literally.`
                      : "it starts again each period but shows no year, so the next period repeats this one."}
                </li>
              )),
            )}
          </ul>
        </Callout>
      )}

      <Section
        title="Series"
        blurb="Allocated numbers are never reused."
        empty="No series yet. Nothing can be numbered."
        count={series.length}
        action={<AddSeries taken={series.map((s) => s.key)} />}
      >
        <Table minWidth={920}>
          <colgroup>
            <col />
            <col style={{ width: "26%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "14%" }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Series</Th>
            <Th>Pattern</Th>
            <Th>Next reference</Th>
            <Th>Starts again</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {series.map((s) => {
              const faults = patternFaults(s);
              const period = periodFor(s, on);
              const next = faults.length > 0 ? null : previewNext(s, on);
              return (
                <Tr key={s.id}>
                  <Td label="Series" title={s.nameEn}>
                    <CellStack
                      title={s.nameEn}
                      sub={
                        <>
                          serial {serialFor(s, on)}
                          {period ? ` of ${period}` : ""}
                        </>
                      }
                    />
                  </Td>
                  <Td label="Pattern" className="font-mono text-[12.5px] text-ink-2 [overflow-wrap:anywhere]">
                    {s.pattern}
                  </Td>
                  <Td label="Next reference" className="[overflow-wrap:anywhere]">
                    {next == null ? (
                      <Badge tone="warn">Would repeat</Badge>
                    ) : !day ? (
                      <span className="text-[12.5px] text-ink-3">Time zone not set</span>
                    ) : (
                      <span className="font-mono text-[12.5px] tabular-nums text-ink">{next}</span>
                    )}
                  </Td>
                  <Td label="Starts again" className="text-ink-2">
                    {RESET_LABEL[s.resetOn] ?? s.resetOn}
                    {s.resetOn === "FINANCIAL_YEAR" && s.financialYearStartMonth !== 1
                      ? ` (from month ${s.financialYearStartMonth})`
                      : ""}
                  </Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="NumberingSeries" entityId={s.id} label={s.nameEn} />
                      <EditSeries series={s} />
                    </RowActions>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

    </>
  );
}
