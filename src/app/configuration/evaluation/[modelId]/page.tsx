import Link from "next/link";
import { decimalText } from "@/lib/format";
import { notFound } from "next/navigation";

import { HistoryButton } from "@/components/history-drawer";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { draftFindings, loadModel, stageChoices } from "@/lib/evaluation/config-read";
import { CAPITAL_BASE_LABEL, INPUT_LABEL, MODEL_STATUS_LABEL, MODEL_STATUS_TONE, modelFindingText, OUTCOME_LABEL, ROUTE_LABEL, SCALE_LABEL, SHORTLIST_RULE_LABEL, SIDE_LABEL, STAGE_KIND_LABEL } from "@/lib/evaluation/labels";
import { formatOrgDay } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";

import { BandDrawer, BandSetDrawer, CriterionDrawer, DiscardDraftDrawer, FactorDrawer, IssueModelDrawer, ModelDrawer, NewVersionDrawer, RemoveBandDrawer, RemoveBandSetDrawer, RemoveCriterionDrawer, RemoveFactorDrawer, RemoveStageDrawer, RetireModelDrawer, StageDrawer } from "../editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// A stored decimal as typed: trailing zeros after the point dropped, never those of a whole number.
const num = (v: { toString(): string } | null) => decimalText(v) ?? "";
const tri = (v: boolean | null) => (v == null ? null : v ? "yes" : "no");
const dash = <span className="text-ink-3">—</span>;

/**
 * One evaluation model version (6.8, FR-EVL-006, 008, 009): its stages with their criteria and factor
 * options, its band sets with their bands, and what holds its issue back. A draft is edited here; an
 * issued or retired version is shown as it was frozen, with a new version as the way to change it.
 */
export default async function EvaluationModelPage(props: PageProps<"/configuration/evaluation/[modelId]">) {
  await requireStaff();
  const { modelId } = await props.params;
  const org = await exerciseOrg();
  if (!org) notFound();
  const m = await loadModel(org.id, modelId);
  if (!m) notFound();
  const draft = m.status === "DRAFT";
  const { findings } = await draftFindings(org.id, m, new Date());
  const blocks = findings.filter((f) => f.level === "block").map(modelFindingText);
  const warnings = findings.filter((f) => f.level !== "block").map(modelFindingText);
  const choices = await stageChoices(org.id);
  const committee = (code: string | null) => (code ? (choices.committees.find((c) => c.code === code)?.nameEn ?? "A committee no longer configured") : null);
  const office = (code: string | null) => (code ? (choices.offices.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : null);
  const bandSetName = (code: string | null) => (code ? (m.bandSets.find((b) => b.code === code)?.nameEn ?? "A band set not in this model") : null);
  const bandSetOptions = m.bandSets.map((b) => ({ value: b.code, label: b.nameEn }));
  const label = `${m.nameEn}, version ${m.version}`;

  return (
    <>
      <RecordCrumb label={label} />
      <PageHeader
        eyebrow={<Link href="/configuration/evaluation">Evaluation models</Link>}
        title={label}
        badge={<Badge tone={MODEL_STATUS_TONE[m.status]} dot>{MODEL_STATUS_LABEL[m.status]}</Badge>}
        subtitle={draft ? "A draft: change it here, then issue it. Issuing freezes it; a change after that is a new version." : m.status === "ISSUED" ? `Issued ${m.issuedAt ? formatOrgDay(m.issuedAt, org.timeZone) : ""}. It is read-only: exercises pin it as it was issued. A change is a new version.` : "Retired: no longer offered. Exercises that pinned it keep it."}
        actions={
          <>
            <HistoryButton entity="EvaluationModel" entityId={m.id} label={label} />
            {draft && <ModelDrawer model={{ id: m.id, label, values: { nameEn: m.nameEn, nameMs: m.nameMs, route: m.route, provenance: m.provenance, governingSource: m.governingSource, notes: m.notes } }} />}
            {draft && <DiscardDraftDrawer id={m.id} label={label} />}
            {draft && <IssueModelDrawer id={m.id} label={label} blocks={blocks} warnings={warnings} />}
            {m.status === "ISSUED" && <RetireModelDrawer id={m.id} label={label} />}
            {!draft && <NewVersionDrawer id={m.id} label={label} />}
          </>
        }
      />

      {draft && blocks.length > 0 && (
        <Callout tone="warn" title="What holds the issue back">
          <ul className="list-disc pl-5">{blocks.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </Callout>
      )}
      {draft && blocks.length === 0 && warnings.length > 0 && <Callout tone="info" title="It may be issued with">{warnings.join(" ")}</Callout>}

      <Card className="my-6">
        <CardHeader title="The model" subtitle="Its route decides which exercises may pin it: those whose contract basis takes the same route." />
        <CardBody>
          <KeyValues columns={3} items={[{ label: "Route", value: ROUTE_LABEL[m.route] }, { label: "Source", value: <span className="flex flex-wrap items-center gap-2"><ProvenanceBadge value={m.provenance} />{m.governingSource && <span className="text-[12.5px] text-ink-3">{m.governingSource}</span>}</span> }, { label: "Stages", value: String(m.stages.length) }]} />
          {m.notes && <p className="mt-4 text-[13px] whitespace-pre-line text-ink-2">{m.notes}</p>}
        </CardBody>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Stages, in order</h2>
        {draft && <StageDrawer modelId={m.id} committees={choices.committees.map((c) => ({ value: c.code, label: c.nameEn }))} offices={choices.offices.map((o) => ({ value: o.code, label: o.nameEn }))} />}
      </div>
      {m.stages.length === 0 && (
        <Card className="mb-6">
          <EmptyState title="No stages">A model is its stages, in order: add the first.</EmptyState>
        </Card>
      )}
      {m.stages.map((s) => {
        const codeOf = new Map(s.criteria.map((c) => [c.id, c.code]));
        const groups = s.criteria.filter((c) => c.parentId == null).map((c) => ({ value: c.code, label: c.labelEn }));
        const opensAfter = s.unlocksAfterOrder != null ? (m.stages.find((x) => x.order === s.unlocksAfterOrder)?.labelEn ?? `the stage of order ${s.unlocksAfterOrder}`) : null;
        const stageValues = { order: String(s.order), labelEn: s.labelEn, labelMs: s.labelMs, kind: s.kind, side: s.side, unlocksAfterOrder: s.unlocksAfterOrder == null ? "" : String(s.unlocksAfterOrder), maxMarks: num(s.maxMarks), passMark: num(s.passMark), passInclusive: tri(s.passInclusive), mustPass: tri(s.mustPass), compositeWeight: num(s.compositeWeight), committeeCode: s.committeeCode, shortlistRule: s.shortlistRule, shortlistMin: s.shortlistMin == null ? "" : String(s.shortlistMin), shortlistMax: s.shortlistMax == null ? "" : String(s.shortlistMax), shortlistOfficeCode: s.shortlistOfficeCode, capitalBase: s.capitalBase, provenance: s.provenance, governingSource: s.governingSource };
        const capital = s.criteria.some((c) => c.computedInput === "MIN_CAPITAL_RATIO");
        return (
          <Card key={s.id} className="mb-6 overflow-hidden">
            <CardHeader
              title={<span className="inline-flex flex-wrap items-center gap-2"><span>{`${s.order}. ${s.labelEn}`}</span><Chip tone="info">{STAGE_KIND_LABEL[s.kind]}</Chip></span>}
              subtitle={`${SIDE_LABEL[s.side]}${opensAfter ? `. Opens once ${opensAfter} is submitted.` : "."}`}
              actions={
                draft ? (
                  <RowActions>
                    <StageDrawer modelId={m.id} stage={{ id: s.id, label: s.labelEn, values: stageValues }} committees={choices.committees.map((c) => ({ value: c.code, label: c.nameEn }))} offices={choices.offices.map((o) => ({ value: o.code, label: o.nameEn }))} />
                    <RemoveStageDrawer modelId={m.id} stageId={s.id} label={s.labelEn} />
                  </RowActions>
                ) : undefined
              }
            />
            <CardBody className="flex flex-col gap-4">
              <KeyValues
                columns={3}
                items={[
                  ...(s.maxMarks != null ? [{ label: "Total marks", value: num(s.maxMarks) }] : []),
                  { label: "Pass mark", value: s.passMark == null ? "None" : `${num(s.passMark)}%${s.passInclusive == null ? " (on it: not set)" : s.passInclusive ? " (on it passes)" : " (on it fails)"}` },
                  { label: "Failing it puts the bidder out", value: s.mustPass == null ? "Not set" : s.mustPass ? "Yes" : "No" },
                  ...(s.compositeWeight != null ? [{ label: "Weight in the composite", value: `${num(s.compositeWeight)}%` }] : []),
                  ...(s.committeeCode ? [{ label: "Committee deciding it", value: committee(s.committeeCode)! }] : []),
                  ...(s.shortlistRule ? [{ label: "Shortlist", value: `${SHORTLIST_RULE_LABEL[s.shortlistRule]}${s.shortlistRule === "COUNT_RANGE" ? `: ${s.shortlistMin ?? "?"} to ${s.shortlistMax ?? "?"}` : s.shortlistRule === "DECIDED_BY_OFFICE" ? `: ${office(s.shortlistOfficeCode) ?? "no office set"}` : ""}` }] : []),
                  ...(s.capitalBase ? [{ label: "Minimum capital is a percentage of", value: CAPITAL_BASE_LABEL[s.capitalBase] }] : []),
                  { label: "Source", value: <span className="flex flex-wrap items-center gap-2"><ProvenanceBadge value={s.provenance} />{s.governingSource && <span className="text-[12.5px] text-ink-3">{s.governingSource}</span>}</span> },
                ]}
              />
            </CardBody>
            {(s.criteria.length > 0 || draft) && (
              <div className="border-t border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                  <p className="text-[13.5px] font-semibold text-ink">Criteria</p>
                  {draft && <CriterionDrawer modelId={m.id} stageId={s.id} stageLabel={s.labelEn} groups={groups} bandSets={bandSetOptions} />}
                </div>
                {s.criteria.length === 0 ? (
                  <p className="px-5 pb-4 text-[13px] text-ink-3 sm:px-6">None yet.</p>
                ) : (
                  <Table minWidth={720}>
                    <colgroup>
                      <col />
                      <col style={{ width: 150 }} />
                      <col style={{ width: 90 }} />
                      <col style={{ width: 210 }} />
                      <col style={{ width: 120 }} />
                      {draft && <ActionsCol labelled={1} icons={1} />}
                    </colgroup>
                    <THead>
                      <Th>Criterion</Th>
                      <Th>Judged</Th>
                      <Th numeric>Marks</Th>
                      <Th>Worked from</Th>
                      <Th>Source</Th>
                      {draft && <Th className="text-right">Actions</Th>}
                    </THead>
                    <tbody>
                      {s.criteria.map((c) => {
                        const parent = c.parentId ? s.criteria.find((x) => x.id === c.parentId) : null;
                        const isGroup = s.criteria.some((x) => x.parentId === c.id);
                        return (
                          <Tr key={c.id}>
                            <Td label="Criterion"><CellStack title={<span className={parent ? "pl-4" : undefined}>{`${c.order}. ${c.labelEn}`}</span>} sub={parent ? `In ${parent.labelEn}` : isGroup ? "A group" : c.needsNamedContractor ? "Judged only with a named contractor" : undefined} /></Td>
                            <Td label="Judged">{isGroup ? "Its criteria's marks" : SCALE_LABEL[c.scale]}</Td>
                            <Td numeric label="Marks">{c.maxMarks != null ? num(c.maxMarks) : "—"}</Td>
                            <Td label="Worked from">{c.computedInput === "NONE" ? dash : <span className="flex flex-col"><span>{INPUT_LABEL[c.computedInput]}</span>{c.bandSetCode && <span className="text-[12.5px] text-ink-3">{`Banded by ${bandSetName(c.bandSetCode)}`}</span>}</span>}</Td>
                            <Td label="Source"><ProvenanceBadge value={c.provenance} /></Td>
                            {draft && (
                              <Td>
                                <RowActions>
                                  <CriterionDrawer modelId={m.id} stageId={s.id} stageLabel={s.labelEn} groups={groups.filter((g) => g.value !== c.code)} bandSets={bandSetOptions} criterion={{ id: c.id, label: c.labelEn, values: { parentCode: c.parentId ? (codeOf.get(c.parentId) ?? null) : null, order: String(c.order), labelEn: c.labelEn, labelMs: c.labelMs, scale: c.scale, maxMarks: num(c.maxMarks), computedInput: c.computedInput === "NONE" ? null : c.computedInput, bandSetCode: c.bandSetCode, needsNamedContractor: c.needsNamedContractor, provenance: c.provenance, governingSource: c.governingSource } }} />
                                  <RemoveCriterionDrawer modelId={m.id} criterionId={c.id} label={c.labelEn} />
                                </RowActions>
                              </Td>
                            )}
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </div>
            )}
            {(s.factorOptions.length > 0 || (draft && (capital || s.kind === "FINANCIAL_TEST"))) && (
              <div className="border-t border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                  <p className="text-[13.5px] font-semibold text-ink">Factor options for the minimum capital</p>
                  {draft && <FactorDrawer modelId={m.id} stageId={s.id} stageLabel={s.labelEn} />}
                </div>
                {s.factorOptions.length === 0 ? (
                  <p className="px-5 pb-4 text-[13px] text-ink-3 sm:px-6">None yet.</p>
                ) : (
                  <Table minWidth={520}>
                    <colgroup>
                      <col />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 120 }} />
                      {draft && <ActionsCol labelled={1} icons={1} />}
                    </colgroup>
                    <THead>
                      <Th>Option</Th>
                      <Th numeric>Percentage</Th>
                      <Th>Source</Th>
                      {draft && <Th className="text-right">Actions</Th>}
                    </THead>
                    <tbody>
                      {s.factorOptions.map((x) => (
                        <Tr key={x.id}>
                          <Td label="Option"><CellStack title={x.labelEn} sub={x.labelMs ?? undefined} /></Td>
                          <Td numeric label="Percentage">{`${num(x.factorPct)}%`}</Td>
                          <Td label="Source"><ProvenanceBadge value={x.provenance} /></Td>
                          {draft && (
                            <Td>
                              <RowActions>
                                <FactorDrawer modelId={m.id} stageId={s.id} stageLabel={s.labelEn} factor={{ id: x.id, label: x.labelEn, values: { labelEn: x.labelEn, labelMs: x.labelMs, factorPct: num(x.factorPct), provenance: x.provenance, governingSource: x.governingSource } }} />
                                <RemoveFactorDrawer modelId={m.id} factorId={x.id} label={x.labelEn} />
                              </RowActions>
                            </Td>
                          )}
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Band sets</h2>
        {draft && <BandSetDrawer modelId={m.id} />}
      </div>
      {m.bandSets.length === 0 && (
        <Card className="mb-6">
          <EmptyState title="No band sets">A banded criterion places its worked figure in one of these.</EmptyState>
        </Card>
      )}
      {m.bandSets.map((set) => (
        <Card key={set.id} className="mb-6 overflow-hidden">
          <CardHeader
            title={set.nameEn}
            subtitle={<span className="inline-flex flex-wrap items-center gap-2"><ProvenanceBadge value={set.provenance} />{set.governingSource && <span>{set.governingSource}</span>}</span>}
            actions={
              draft ? (
                <RowActions>
                  <BandDrawer modelId={m.id} setId={set.id} setLabel={set.nameEn} />
                  <BandSetDrawer modelId={m.id} set={{ id: set.id, label: set.nameEn, values: { nameEn: set.nameEn, provenance: set.provenance, governingSource: set.governingSource } }} />
                  <RemoveBandSetDrawer modelId={m.id} setId={set.id} label={set.nameEn} />
                </RowActions>
              ) : undefined
            }
            divided={set.bands.length === 0}
          />
          {set.bands.length === 0 ? (
            <EmptyState size="sm" title="No bands">A set without bands cannot be issued.</EmptyState>
          ) : (
            <Table minWidth={640}>
              <colgroup>
                <col />
                <col style={{ width: 170 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 120 }} />
                {draft && <ActionsCol labelled={1} icons={1} />}
              </colgroup>
              <THead>
                <Th>Band</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Means</Th>
                {draft && <Th className="text-right">Actions</Th>}
              </THead>
              <tbody>
                {set.bands.map((b) => {
                  const edge = (v: { toString(): string } | null, inc: boolean, floor: boolean) => (v == null ? "Open" : `${num(v)}${inc ? ", itself in" : ", itself out"}${floor ? ", judged exactly" : ""}`);
                  return (
                    <Tr key={b.id}>
                      <Td label="Band"><CellStack title={b.labelEn} sub={b.labelMs ?? undefined} /></Td>
                      <Td label="From">{edge(b.lower, b.lowerInclusive, b.lowerIsFloor)}</Td>
                      <Td label="To">{edge(b.upper, b.upperInclusive, b.upperIsFloor)}</Td>
                      <Td label="Means">{OUTCOME_LABEL[b.outcome]}</Td>
                      {draft && (
                        <Td>
                          <RowActions>
                            <BandDrawer modelId={m.id} setId={set.id} setLabel={set.nameEn} band={{ id: b.id, label: b.labelEn, values: { labelEn: b.labelEn, labelMs: b.labelMs, lower: num(b.lower), lowerInclusive: b.lower == null ? null : tri(b.lowerInclusive), lowerIsFloor: b.lowerIsFloor, upper: num(b.upper), upperInclusive: b.upper == null ? null : tri(b.upperInclusive), upperIsFloor: b.upperIsFloor, outcome: b.outcome, sortOrder: String(b.sortOrder) } }} />
                            <RemoveBandDrawer modelId={m.id} bandId={b.id} label={b.labelEn} />
                          </RowActions>
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      ))}
    </>
  );
}
