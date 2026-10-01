import { DataList } from "@/components/data-list";
import { ClipboardIcon, FileIcon, FilesIcon, ScaleIcon, ShieldIcon, SlidersIcon, ToolsIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues, Stat } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { bqTab } from "@/lib/scope/read";

import { OwnerAttachments } from "@/components/attachments/owner-attachments";

import { ExportCsvForm, ImportCsvDrawer } from "./csv-tools";
import { EditBqHeaderDrawer, FinaliseBqDrawer, ItemDrawer, RemoveItemDrawer, RemoveSectionDrawer, ReviseBqDrawer, SectionDrawer, StartBqDrawer } from "./editors";

type Data = NonNullable<Awaited<ReturnType<typeof bqTab>>>;

const dash = (t: string) => (t === "Not set" ? "—" : t);

/**
 * Bill of quantities: manual entry in increment 1 (CSV comes with increment 2). Amounts
 * and totals are worked out by the domain layer from quantities and rates; this screen
 * asks and renders. The bill is not SULIT: its rates and totals are readable by anyone
 * who can reach the portal, and the callout says so.
 */
export function BqSection({ d }: { d: Data }) {
  const exerciseId = d.exercise.id;
  const v = d.current;
  const people = d.options.people.map((p) => ({ value: p.id, label: p.name }));

  if (!v) {
    return (
      <div className="flex flex-col gap-6">
        <Callout tone="neutral" title="Readable by anyone with access">{d.statement}</Callout>
        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Bill of quantities" subtitle="Sections of measured work, prime cost sums and provisional sums, each priced from a quantity and a rate." />
          <EmptyState size="sm" title="No bill of quantities yet" action={<StartBqDrawer exerciseId={exerciseId} templates={d.options.templates} allowed={d.actions.start} />}>
            Start a draft, then enter its sections and lines by hand or import them from a CSV file. It is finalised, with its preparer&apos;s qualification checked, before the documents go for approval.
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
      <Callout tone="neutral" title="Readable by anyone with access">{d.statement}</Callout>
      {d.finalised && draft && (
        <Callout tone="info">Version {d.finalised.versionNo} is finalised and stands until this draft is finalised.</Callout>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Stat label="Lines" value={v.stats.lines} hint={v.stats.incompleteLines > 0 ? `${v.stats.incompleteLines} not complete yet` : "All have a quantity or a sum, and a rate"} tone={v.stats.incompleteLines > 0 ? "warn" : "brand"} icon={<ClipboardIcon size={16} />} />
        <Stat label="Total" value={v.stats.total} hint={`Builders' works ${v.stats.buildersWorks}`} icon={<ScaleIcon size={16} />} />
        <Stat label="Firm value" value={dash(v.stats.firmValue)} hint={v.header.provisionalLeftOut === "Not stated" ? "Not stated: whether provisional quantities are left out is not said" : `Provisional quantities ${v.header.provisionalLeftOut === "Yes" ? "left out" : "counted in"}`} tone={v.stats.firmValue === "Not stated" ? "warn" : "brand"} icon={<ShieldIcon size={16} />} />
        <Stat label="Provisional quantities" value={v.stats.provisionalQuantities} hint={`${v.stats.provisionalShare} of the total`} icon={<SlidersIcon size={16} />} />
        <Stat label="Prime cost sums" value={v.stats.primeCostSums} icon={<FilesIcon size={16} />} />
        <Stat label="Provisional sums" value={v.stats.provisionalSums} icon={<ToolsIcon size={16} />} />
      </div>

      <Card id="bill-version" className="scroll-mt-24">
        <CardHeader
          icon={<ScaleIcon size={17} />}
          title={
            `Version ${v.versionNo}`
          }
          subtitle={v.header.revisionReason ? `A revision: ${v.header.revisionReason}` : "The header says who scoped and prepared the bill, and how it was measured."}
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
                    ["Total", v.stats.total],
                    ["Firm value", v.stats.firmValue],
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
            A bill is made of sections, each with its lines. {editable ? "Add the first section." : ""}
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
                        <Td label="Rate (RM)" numeric>{dash(i.rate)}</Td>
                        <Td label="Amount (RM)" numeric className="font-semibold text-ink">{dash(i.amount)}</Td>
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

      <Card>
        <CardHeader icon={<FileIcon size={17} />} title="CSV and schedules of rates" subtitle="Import the department's bill into the draft, or export a version, built by the portal. Rates may be taken from a schedule in force." />
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
        subtitle="Kept as received, with the class the officer chose. Lines imported from a file stand on it: it is replaced only by importing again."
        only={["BQ_IMPORT_SOURCE"]}
        collapseWhenEmpty
        attachedBy={{ BQ_IMPORT_SOURCE: "Attached by Import from CSV, above, in the same step as the lines." }}
        statuses={{ BQ_IMPORT_SOURCE: { text: "None: entered by hand", tone: "neutral" } }}
      />

      <Card className="overflow-hidden">
        <CardHeader icon={<ClipboardIcon size={17} />} title="Versions" subtitle="A finalised version is never changed. A revision is a new draft that replaces it when it is finalised." divided={false} />
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
              finalised: { kind: "text", text: x.finalisedOn ? formatDate(x.finalisedOn) : "—", dim: !x.finalisedOn },
              reason: { kind: "text", text: x.revisionReason ?? (x.versionNo === 1 ? "First version" : "—"), dim: true },
            },
          }))}
        />
      </Card>
    </div>
  );
}
