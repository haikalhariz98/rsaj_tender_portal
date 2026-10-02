import Link from "next/link";
import type { ReactNode } from "react";

import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { evaluationConfiguration } from "@/lib/evaluation/config-read";
import { ASPECT_KIND_LABEL, MODEL_STATUS_LABEL, MODEL_STATUS_TONE, ROUTE_LABEL } from "@/lib/evaluation/labels";
import { exerciseOrg } from "@/lib/method/repo";

import { Section, Stat, Stats } from "../records-ui";
import { AspectDrawer, BasisRouteDrawer, MethodModelDrawer, ModelDrawer, PolicyDrawer, RetireAspectDrawer } from "./editors";

export const dynamic = "force-dynamic";

/// A setting's value, or "Not set" and what that holds back.
function Setting({ value, unset }: { value: ReactNode | null; unset: string }) {
  if (value != null && value !== "") return <>{value}</>;
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{unset}</span>
    </span>
  );
}

/**
 * Configuration › Evaluation models (6.8, FR-EVL-006, 008, 009; ADR 0018): the models, each version a
 * draft, issued or retired; the aspects bidders are assessed on; the evaluation policy; each contract
 * basis's route; and each method's usual model. None ships: every number is the customer's.
 */
export default async function EvaluationConfigurationPage() {
  const org = await exerciseOrg();
  if (!org) {
    return (
      <>
        <PageHeader title="Evaluation models" subtitle="How bids are evaluated: the models, their stages and figures, and the policy." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const c = await evaluationConfiguration(org.id);
  const now = new Date();
  const issued = c.models.filter((m) => m.status === "ISSUED");
  const p = c.policy;
  const policyUnset = [p?.reportSeriesKey, p?.scoreDecimals, p?.checkerRoleCode, p?.recommenderRoleCode, p?.reportTemplateId, p?.proposalTemplateId].filter((x) => x == null).length;
  const liveBases = c.bases.filter((b) => b.retiredOn == null || b.retiredOn > now);
  const basesUnset = liveBases.filter((b) => b.evaluationRoute == null).length;
  const holding = (issued.length === 0 ? 1 : 0) + policyUnset + basesUnset;
  const office = (code: string | null | undefined) => (code ? (c.offices.find((o) => o.code === code)?.nameEn ?? "An office no longer configured") : null);
  const modelName = (code: string | null) => {
    if (!code) return null;
    const m = c.models.find((x) => x.code === code);
    return m ? m.nameEn : "A model no longer configured";
  };
  const modelOptions = [...new Map(c.models.map((m) => [m.code, { value: m.code, label: m.nameEn }])).values()];

  return (
    <>
      <PageHeader
        title="Evaluation models"
        badge={holding > 0 ? <Badge tone="warn" dot>{`${holding} holding work back`}</Badge> : <Badge tone="ok" dot>Nothing holding work back</Badge>}
        subtitle="Each model's stages, criteria, weights, pass marks and bands; aspects; the policy."
        actions={<ModelDrawer />}
      />

      <Stats>
        <Stat label="Issued models" value={issued.length} hint={issued.length ? "Offered on an exercise's Window card." : "None issued: no exercise with a tender or quotation pack can be published."} warn={issued.length === 0} />
        <Stat label="Policy settings not set" value={policyUnset} hint="Each holds back the act it governs." warn={policyUnset > 0} />
        <Stat label="Contract bases with no route" value={basesUnset} hint="An exercise on one is not published." warn={basesUnset > 0} />
      </Stats>

      <Section id="models" title="Models" blurb="A model is drafted, checked and issued; an issued version never changes, and a change is a new version. An exercise pins the version it publishes with, and is evaluated by what it pinned." empty="No model is configured. Start one: a draft is checked when it is issued." count={c.models.length} action={<ModelDrawer />}>
        <Table minWidth={720}>
          <colgroup>
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 130 }} />
            <ActionsCol labelled={1} icons={1} />
          </colgroup>
          <THead>
            <Th>Model</Th>
            <Th>Route</Th>
            <Th>Status</Th>
            <Th>Chosen on</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {c.models.map((m) => (
              <Tr key={m.id}>
                <Td label="Model"><CellStack title={<Link href={`/configuration/evaluation/${m.id}`}>{`${m.nameEn}, version ${m.version}`}</Link>} sub={`${m._count.stages} ${m._count.stages === 1 ? "stage" : "stages"}`} /></Td>
                <Td label="Route">{ROUTE_LABEL[m.route]}</Td>
                <Td label="Status"><Badge tone={MODEL_STATUS_TONE[m.status]}>{MODEL_STATUS_LABEL[m.status]}</Badge></Td>
                <Td label="Chosen on">{m._count.exercises ? `${m._count.exercises} ${m._count.exercises === 1 ? "exercise" : "exercises"}` : <span className="text-ink-3">None</span>}</Td>
                <Td label="Source"><ProvenanceBadge value={m.provenance} /></Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="EvaluationModel" entityId={m.id} label={`${m.nameEn}, version ${m.version}`} />
                    <ButtonLink href={`/configuration/evaluation/${m.id}`} size="sm" variant="secondary">Open</ButtonLink>
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="aspects" title="Aspects assessed" blurb="Each bidder is assessed on these, with a verdict and a narrative (FR-EVL-003). One required on a route is assessed on the aspects stage of every model of that route; a model freezes the aspects in force when it is issued." empty="No aspect is configured. A traditional model that has an aspects stage cannot be issued without the four the requirement names." count={c.aspects.length} action={<AspectDrawer />}>
        <Table minWidth={680}>
          <colgroup>
            <col />
            <col style={{ width: 200 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 130 }} />
            <ActionsCol labelled={1} icons={2} />
          </colgroup>
          <THead>
            <Th>Aspect</Th>
            <Th>Assesses</Th>
            <Th>Required on</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {c.aspects.map((a) => {
              const retired = a.retiredOn != null && a.retiredOn <= now;
              return (
                <Tr key={a.id}>
                  <Td label="Aspect"><CellStack title={<span className="inline-flex items-center gap-2"><span>{a.labelEn}</span>{retired && <Badge>retired</Badge>}</span>} sub={a.labelMs ?? undefined} /></Td>
                  <Td label="Assesses">{ASPECT_KIND_LABEL[a.kind]}</Td>
                  <Td label="Required on">{a.requiredOnRoute ? ROUTE_LABEL[a.requiredOnRoute] : <span className="text-ink-3">Not required</span>}</Td>
                  <Td label="Source"><ProvenanceBadge value={a.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="EvaluationAspect" entityId={a.id} label={a.labelEn} />
                      {!retired && <AspectDrawer aspect={{ id: a.id, label: a.labelEn, values: { kind: a.kind, labelEn: a.labelEn, labelMs: a.labelMs, requiredOnRoute: a.requiredOnRoute, provenance: a.provenance, governingSource: a.governingSource, sortOrder: String(a.sortOrder) } }} />}
                      {!retired && <RetireAspectDrawer id={a.id} label={a.labelEn} />}
                    </RowActions>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

      <Card id="policy" className="mb-6 scroll-mt-24">
        <CardHeader
          title="Evaluation policy"
          subtitle="What the report is numbered from and produced on, how a score is shown and judged, and who checks and recommends the Kertas Cadangan. An evaluation keeps the policy it started under."
          actions={
            <>
              {p && <HistoryButton entity="EvaluationPolicy" entityId={p.id} label="the evaluation policy" />}
              <PolicyDrawer
                values={{ reportSeriesKey: p?.reportSeriesKey ?? null, scoreDecimals: p?.scoreDecimals == null ? "" : String(p.scoreDecimals), scoreDecimalsProvenance: p?.scoreDecimalsProvenance ?? null, checkerRoleCode: p?.checkerRoleCode ?? null, recommenderRoleCode: p?.recommenderRoleCode ?? null, reportTemplateId: p?.reportTemplateId ?? null, proposalTemplateId: p?.proposalTemplateId ?? null, governingSource: p?.governingSource ?? "", notes: p?.notes ?? "" }}
                series={c.series.map((s) => ({ value: s.key, label: s.nameEn }))}
                offices={c.offices.map((o) => ({ value: o.code, label: o.nameEn }))}
                templates={c.templates.map((t) => ({ value: t.id, label: t.nameEn }))}
              />
            </>
          }
        />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              { label: "Report reference series", value: <Setting value={p?.reportSeriesKey ? (c.series.find((s) => s.key === p.reportSeriesKey)?.nameEn ?? "A series no longer configured") : null} unset="No report can be issued: it has no reference to take." /> },
              { label: "Decimal places a score is judged at", value: <Setting value={p?.scoreDecimals != null ? <span className="flex flex-wrap items-center gap-2"><span>{p.scoreDecimals}</span>{p.scoreDecimalsProvenance && <ProvenanceBadge value={p.scoreDecimalsProvenance} />}</span> : null} unset="No evaluation starts: a score could not be shown as it is judged." /> },
              { label: "Office checking the Kertas Cadangan", value: <Setting value={office(p?.checkerRoleCode)} unset="The paper cannot be checked." /> },
              { label: "Office recommending it", value: <Setting value={office(p?.recommenderRoleCode)} unset="The paper cannot be recommended." /> },
              { label: "Report template", value: <Setting value={p?.reportTemplate?.nameEn ?? null} unset="No report can be issued: it has no text." /> },
              { label: "Kertas Cadangan template", value: <Setting value={p?.proposalTemplate?.nameEn ?? null} unset="The paper cannot be produced: it has no text." /> },
              { label: "Annex labels", value: "The product's labels, A to F" },
            ]}
          />
        </CardBody>
      </Card>

      <Section id="bases" title="Each contract basis's evaluation route" blurb="The route a contract on the basis is evaluated by. An exercise pins a model of its basis's route when it is published; not set, it is not published." empty="No contract basis is configured. Add them under Reference data." count={liveBases.length}>
        <Table minWidth={560}>
          <colgroup>
            <col />
            <col style={{ width: 180 }} />
            <col style={{ width: 140 }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Contract basis</Th>
            <Th>Evaluation route</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {liveBases.map((b) => (
              <Tr key={b.id}>
                <Td label="Contract basis"><CellStack title={b.nameEn} /></Td>
                <Td label="Evaluation route">{b.evaluationRoute ? ROUTE_LABEL[b.evaluationRoute] : <Badge tone="warn">Not set</Badge>}</Td>
                <Td label="Source">{b.evaluationRouteProvenance ? <ProvenanceBadge value={b.evaluationRouteProvenance} /> : <span className="text-ink-3">—</span>}</Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="ContractBasis" entityId={b.id} label={b.nameEn} />
                    <BasisRouteDrawer id={b.id} label={b.nameEn} values={{ evaluationRoute: b.evaluationRoute, evaluationRouteProvenance: b.evaluationRouteProvenance }} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section id="methods" title="Each method's usual model" blurb="A suggestion the Window card names; the officer chooses, and nothing is pinned without that choice." empty="No method assembles a tender or quotation pack. Methods are set under Reference data." count={c.methods.filter((m) => m.retiredOn == null).length}>
        <Table minWidth={520}>
          <colgroup>
            <col />
            <col style={{ width: 260 }} />
            <ActionsCol icons={2} />
          </colgroup>
          <THead>
            <Th>Method</Th>
            <Th>Usual model</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {c.methods.filter((m) => m.retiredOn == null).map((m) => (
              <Tr key={m.id}>
                <Td label="Method"><CellStack title={m.nameEn} /></Td>
                <Td label="Usual model">{modelName(m.defaultEvaluationModelCode) ?? <span className="text-ink-3">None suggested</span>}</Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.nameEn} />
                    <MethodModelDrawer id={m.id} label={m.nameEn} value={m.defaultEvaluationModelCode} models={modelOptions} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
