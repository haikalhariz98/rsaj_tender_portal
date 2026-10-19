import { Accordion } from "@/components/accordion";
import { DataList } from "@/components/data-list";
import { ClipboardIcon, FileIcon, FilesIcon, ScaleIcon, ShieldIcon, SlidersIcon, ToolsIcon } from "@/components/icons";
import { Badge, Chip, SulitValue } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { InfoChip } from "@/components/ui/info-chip";
import { KeyValues, Stat } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import type { bqTab } from "@/lib/scope/read";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";

import { ExportCsvForm, ImportCsvDrawer } from "./csv-tools";
import { EditBqHeaderDrawer, FinaliseBqDrawer, ItemDrawer, RemoveItemDrawer, RemoveSectionDrawer, ReviseBqDrawer, SectionDrawer, StartBqDrawer } from "./editors";

type Data = NonNullable<Awaited<ReturnType<typeof bqTab>>>;

const dash = (t: string) => (t === "Not set" ? "—" : t);

/**
 * Bill of quantities: manual entry in increment 1 (CSV comes with increment 2). Amounts
 * and totals are worked out by the domain layer from quantities and rates; this screen
 * asks and renders. The priced bill is SULIT (Phase 3b): its rates, amounts and totals are read
 * by the people named on the exercise and the roles the organisation has chosen, and the callout says so.
 */
export function BqSection({ d }: { d: Data }) {
  const exerciseId = d.exercise.id;
  const v = d.current;
  const people = d.options.people.map((p) => ({ value: p.id, label: p.name }));

  if (!v) {
    return (
      <div className="flex flex-col gap-6">
        <Callout tone="neutral" title="Priced figures are SULIT">{d.statement}</Callout>
        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Bill of quantities" subtitle="Measured work, prime cost and provisional sums." />
          <EmptyState size="sm" title="No bill of quantities yet" action={<StartBqDrawer exerciseId={exerciseId} templates={d.options.templates} allowed={d.actions.start} />}>
            Start a draft. Finalise before documents go for approval.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const draft = v.status === "Draft";
  const editable = draft && d.actions.edit.allowed;
  const sections = v.sections.map((s) => ({ value: s.id, label: `${s.number}. ${s.title}` }));
  const itemLabel = (i: { itemRef: string; description: string }) => i.itemRef || i.description.slice(0, 40);

  return (
    <div className="flex flex-col gap-6">
      {d.readOnly && (
        <p className="text-[13px] text-ink-2">Earlier record. Kept as recorded. The bill is an uploaded file under Tender documents.</p>
      )}
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <InfoChip tone="warn" detail={d.statement} label="About SULIT">SULIT</InfoChip>
        Priced figures
      </p>
      {d.finalised && draft && (
        <p className="text-[13px] text-ink-2">Version {d.finalised.versionNo} stands until this draft is finalised.</p>
      )}

      {v.stats.incompleteLines > 0 && <Callout tone="warn">{v.stats.incompleteLines === 1 ? "1 line is" : `${v.stats.incompleteLines} lines are`} not complete yet: each needs a quantity or a sum, and a rate.</Callout>}

      <Card id="bill-version" className="scroll-mt-24">
        <CardHeader
          icon={<ScaleIcon size={17} />}
          title={
            `Version ${v.versionNo}`
          }
          subtitle={v.header.revisionReason ? `A revision: ${v.header.revisionReason}` : "Who scoped, prepared and measured."}
          actions={<Badge tone={draft ? "info" : "ok"} dot>{v.status}</Badge>}
        />
        <CardBody>
          <KeyValues
            columns={3}
            items={[
              { label: "Scoped by", value: v.header.scopedBy },
              { label: "Measurement standard", value: v.header.standard },
              { label: "Follows the standard", value: v.header.followsStandard },
              { label: "Prepared by", value: v.header.preparer },
              { label: "Qualification", value: v.header.qualification },
              { label: "Provisional quantities left out of the firm value", value: v.header.provisionalLeftOut },
              { label: "Scope statement", value: <span className="whitespace-pre-line">{v.header.scopeStatement}</span> },
              ...(v.header.departures ? [{ label: "Departures from the standard", value: <span className="whitespace-pre-line">{v.header.departures}</span> }] : []),
            ]}
          />
          <div className="mt-5 flex flex-wrap items-start gap-3 border-t border-line pt-5">
              {draft && <EditBqHeaderDrawer exerciseId={exerciseId} versionId={v.id} raw={v.raw} scopedBy={d.options.scopedBy} people={people} allowed={d.actions.edit} />}
              {draft ? (
                <FinaliseBqDrawer
                  exerciseId={exerciseId}
                  versionId={v.id}
                  versionNo={v.versionNo}
                  allowed={d.actions.finalise}
                  summary={[
                    ["Lines", String(v.stats.lines)],
                    ...(v.totals.state === "GRANTED" ? ([["Total", v.totals.value.total], ["Firm value", v.totals.value.firmValue]] as [string, string][]) : ([["Total", "SULIT · withheld"]] as [string, string][])),
                    ["Standard", `${v.header.standard}, followed: ${v.header.followsStandard}`],
                    ["Prepared by", v.header.preparer],
                  ]}
                />
              ) : (
                <ReviseBqDrawer exerciseId={exerciseId} versionNo={v.versionNo} allowed={d.actions.revise} />
              )}
            </div>
          {draft && !d.actions.edit.allowed && <p className="mt-4 text-[13px] text-ink-3">{d.actions.edit.reason}</p>}
        </CardBody>
      </Card>

      {v.sections.length === 0 ? (
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Sections and lines" actions={editable ? <SectionDrawer exerciseId={exerciseId} versionId={v.id} /> : undefined} />
          <EmptyState size="sm" title="No sections yet">
            A bill is made of sections, each with its lines. {editable ? "Add a section, or import under More." : ""}
          </EmptyState>
        </Card>
      ) : (
        <>
          {v.sections.map((s) => (
            <Card key={s.id} className="overflow-hidden">
              <CardHeader
                icon={<FileIcon size={17} />}
                title={`${s.number}. ${s.title}`}
                subtitle={s.items.length === 0 ? "No lines yet." : `${s.items.length} ${s.items.length === 1 ? "line" : "lines"}`}
                divided={s.items.length > 0}
                actions={
                  editable ? (
                    <span className="flex flex-wrap items-center gap-1">
                      <ItemDrawer exerciseId={exerciseId} versionId={v.id} sections={sections} kinds={d.options.kinds} sectionId={s.id} sectionName={s.number} scheduleItems={d.options.scheduleItems} />
                      <SectionDrawer exerciseId={exerciseId} versionId={v.id} section={{ id: s.id, number: s.number, title: s.title, sortOrder: s.sortOrder }} />
                      <RemoveSectionDrawer exerciseId={exerciseId} versionId={v.id} section={{ id: s.id, number: s.number, title: s.title }} lines={s.items.length} />
                    </span>
                  ) : undefined
                }
              />
              {s.items.length > 0 && (
                <Table minWidth={900}>
                  <colgroup>
                    <col style={{ width: 56 }} />
                    <col style={{ minWidth: 300 }} />
                    <col style={{ width: 60 }} />
                    <col style={{ width: 88 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 124 }} />
                    {editable && <ActionsCol icons={0} labelled={2} />}
                  </colgroup>
                  <THead>
                    <Th>Item</Th>
                    <Th>Description</Th>
                    <Th>Unit</Th>
                    <Th numeric>Quantity</Th>
                    <Th numeric>Rate (RM)</Th>
                    <Th numeric>Amount (RM)</Th>
                    {editable && <Th className="text-right">Actions</Th>}
                  </THead>
                  <tbody>
                    {s.items.map((i) => (
                      <Tr key={i.id}>
                        <Td label="Item" className="text-ink-2">{i.itemRef || "—"}</Td>
                        <Td label="Description">
                          <CellStack
                            title={i.description}
                            sub={
                              <span className="flex flex-col items-start gap-1">
                                <span>{i.kind}</span>
                                <span>{i.rateSource}</span>
                                {i.chips.map((c) => (
                                  <Chip key={c} tone="warn">{c}</Chip>
                                ))}
                              </span>
                            }
                          />
                        </Td>
                        <Td label="Unit" className="text-ink-2">{i.unit || "—"}</Td>
                        <Td label="Quantity" numeric>{dash(i.quantity)}</Td>
                        <Td label="Rate (RM)" numeric>{i.rate.state === "GRANTED" ? dash(i.rate.value) : <SulitValue of={i.rate} />}</Td>
                        <Td label="Amount (RM)" numeric className="font-semibold text-ink">{i.amount.state === "GRANTED" ? dash(i.amount.value) : <SulitValue of={i.amount} />}</Td>
                        {editable && (
                          <Td>
                            <RowActions>
                              <ItemDrawer exerciseId={exerciseId} versionId={v.id} sections={sections} kinds={d.options.kinds} sectionId={s.id} item={{ id: i.id, label: itemLabel(i), raw: i.raw }} scheduleItems={d.options.scheduleItems} />
                              <RemoveItemDrawer exerciseId={exerciseId} versionId={v.id} itemId={i.id} label={itemLabel(i)} />
                            </RowActions>
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          ))}
          {editable && (
            <div>
              <SectionDrawer exerciseId={exerciseId} versionId={v.id} />
            </div>
          )}
        </>
      )}

      <Accordion title="More" meta="Totals, CSV import and export, imported files, versions">
        <div className="flex flex-col gap-6 p-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            <Stat label="Lines" value={v.stats.lines} hint={v.stats.incompleteLines > 0 ? `${v.stats.incompleteLines} not complete yet` : "All have a quantity or a sum, and a rate"} tone={v.stats.incompleteLines > 0 ? "warn" : "brand"} icon={<ClipboardIcon size={16} />} />
            {v.totals.state === "GRANTED" ? (
              <>
                <Stat label="Total" value={v.totals.value.total} hint={`Builders' works ${v.totals.value.buildersWorks}`} icon={<ScaleIcon size={16} />} />
                <Stat label="Firm value" value={dash(v.totals.value.firmValue)} hint={v.header.provisionalLeftOut === "Not stated" ? "Not stated" : `Provisional quantities ${v.header.provisionalLeftOut === "Yes" ? "left out" : "counted in"}`} tone={v.totals.value.firmValue === "Not stated" ? "warn" : "brand"} icon={<ShieldIcon size={16} />} />
                <Stat label="Provisional quantities" value={v.totals.value.provisionalQuantities} hint={`${v.totals.value.provisionalShare} of the total`} icon={<SlidersIcon size={16} />} />
                <Stat label="Prime cost sums" value={v.totals.value.primeCostSums} icon={<FilesIcon size={16} />} />
                <Stat label="Provisional sums" value={v.totals.value.provisionalSums} icon={<ToolsIcon size={16} />} />
              </>
            ) : (
              <Stat label="Totals" value={<SulitValue of={v.totals} />} hint="Total and sums are SULIT." icon={<ScaleIcon size={16} />} />
            )}
          </div>

          <Card>
            <CardHeader icon={<FileIcon size={17} />} title="CSV and schedules of rates" subtitle="Import into the draft, or export a version." />
            <CardBody className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold text-ink-3">Import</p>
                <p className="text-[13px] text-ink-2">{d.csv.importNote}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <ImportCsvDrawer exerciseId={exerciseId} draft={d.csv.draft} upload={d.csv.upload} allowed={d.csv.import} note={d.csv.importNote} />
                  {!d.csv.import.allowed && <span className="text-[13px] text-ink-3">{d.csv.import.reason}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-line pt-5">
                <p className="text-[12px] font-semibold text-ink-3">Export</p>
                <ExportCsvForm exerciseId={exerciseId} versions={d.csv.exportable} note={d.csv.exportNote} />
              </div>
              <div className="flex flex-col gap-1 border-t border-line pt-5">
                <p className="text-[12px] font-semibold text-ink-3">Schedules of rates</p>
                <p className="text-[13px] text-ink-2">{d.schedulesNote}</p>
              </div>
            </CardBody>
          </Card>

          <OwnerAttachments
            owner={{ kind: "bqVersion", id: v.id }}
            title={`Files version ${v.versionNo} was imported from`}
            subtitle="Kept as received. Replaced only by importing again."
            only={["BQ_IMPORT_SOURCE"]}
            collapseWhenEmpty
            attachedBy={{ BQ_IMPORT_SOURCE: "Attached by Import from CSV." }}
            statuses={{ BQ_IMPORT_SOURCE: { text: "None: entered by hand", tone: "neutral" } }}
          />

          <Card className="overflow-hidden">
            <CardHeader icon={<ClipboardIcon size={17} />} title="Versions" subtitle="Finalised versions never change. Revise with a new draft." divided={false} />
            <DataList
              flat
              selectable={false}
              searchable={false}
              toolbar={false}
              exportName="bill-versions"
              emptyTitle="No versions"
              columns={[
                { key: "version", label: "Version", width: "16%", mobile: "primary" },
                { key: "status", label: "Status", width: "18%", mobile: "meta" },
                { key: "finalised", label: "Finalised on", width: "20%", nowrap: true, mobile: "meta" },
                { key: "reason", label: "Why it was revised", mobile: "meta" },
              ]}
              rows={d.versions.map((x) => ({
                id: x.id,
                search: `${x.versionNo} ${x.status}`,
                cells: {
                  version: { kind: "text", text: `Version ${x.versionNo}` },
                  status: { kind: "badge", text: x.status, tone: x.status === "Finalised" ? "ok" : x.status === "Draft" ? "info" : undefined },
                  finalised: { kind: "text", text: x.finalisedOn ?? "—", dim: !x.finalisedOn },
                  reason: { kind: "text", text: x.revisionReason ?? (x.versionNo === 1 ? "First version" : "—"), dim: true },
                },
              }))}
            />
          </Card>
        </div>
      </Accordion>
    </div>
  );
}
