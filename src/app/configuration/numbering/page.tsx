import { AlertTriangle } from "@/components/icons";
import { loadSeries } from "@/lib/numbering/load";
import { patternFaults, periodFor, previewNext, serialFor } from "@/lib/numbering/series";
import { ORGANISATION_CODE } from "@/lib/org";

import { ProvenanceChip, Section } from "../records-ui";
import { CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { AddSeries, EditSeries } from "./editors";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { HistoryButton } from "@/components/history-drawer";

export const dynamic = "force-dynamic";

const RESET_LABEL: Record<string, string> = {
  NEVER: "Never",
  CALENDAR_YEAR: "Each calendar year",
  FINANCIAL_YEAR: "Each financial year",
};

export default async function NumberingPage() {
  const on = new Date();
  const series = await loadSeries(ORGANISATION_CODE);
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
        subtitle="How exercise, contract and certificate references are formed."
      />

      {faulty.length > 0 && (
        <Callout tone="err" title="A pattern would produce references that collide" className="mb-6">
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {faulty.map((s) =>
              patternFaults(s).map((f) => (
                <li key={`${s.id}-${f.kind}`} className="text-[13px]">
                  <strong>{s.nameEn}</strong> —{" "}
                  {f.kind === "NO_SERIAL"
                    ? "no {SERIAL} in the pattern, so every reference would be identical."
                    : f.kind === "UNKNOWN_TOKEN"
                      ? `{${f.token}} is not a token and is rendered literally.`
                      : "it starts again each period but shows no year, so next period's first reference repeats this one."}
                </li>
              )),
            )}
          </ul>
        </Callout>
      )}

      <Section
        title="Series"
        blurb="A reference is the business key of a matter, so it is configured rather than improvised. Allocated numbers are never reused."
        empty="No series has been set. Nothing can be numbered until one is, and a record without a reference cannot be cited on a contract or a certificate."
        count={series.length}
        action={<AddSeries />}
      >
        <Table>
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
          </colgroup>
          <THead>
            <Th>Series</Th>
            <Th>Pattern</Th>
            <Th>Next reference</Th>
            <Th>Starts again</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {series.map((s) => {
              const faults = patternFaults(s);
              const period = periodFor(s, on);
              const next = faults.length > 0 ? null : previewNext(s, on);
              return (
                <Tr key={s.id}>
                  <Td title={s.nameEn}>
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
                  <Td className="truncate font-mono text-[12.5px] text-ink-2" title={s.pattern}>
                    {s.pattern}
                  </Td>
                  <Td className="truncate" title={next ?? undefined}>
                    {next == null ? (
                      <Badge tone="warn">Would collide</Badge>
                    ) : (
                      <span className="font-mono text-[12.5px] tabular-nums text-ink">{next}</span>
                    )}
                  </Td>
                  <Td className="text-ink-2">
                    {RESET_LABEL[s.resetOn] ?? s.resetOn}
                    {s.resetOn === "FINANCIAL_YEAR" && s.financialYearStartMonth !== 1
                      ? ` (from month ${s.financialYearStartMonth})`
                      : ""}
                  </Td>
                  <Td>
                    <ProvenanceChip value={s.provenance} />
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

      <Callout tone="info" icon={<AlertTriangle size={18} />}>
        A serial only ever moves forward. Where a matter is cancelled its reference is
        not returned to the pool — the gap is recorded, because a missing reference is
        evidence and a reused one is a defect.
      </Callout>
    </>
  );
}
