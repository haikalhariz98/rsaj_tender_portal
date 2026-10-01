import type { ReactNode } from "react";

import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { SlidersIcon } from "@/components/icons";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { NOT_SET } from "@/lib/scope/labels";
import { scopeConfiguration } from "@/lib/scope/read";

import { Section } from "../records-ui";
import { ColumnDrawer, EditBasisRule, EditMethodRule, EditScopePolicy, HoldingDrawer, QualificationDrawer, TemplateDrawer, TemplateSectionDrawer } from "./editors";

export const dynamic = "force-dynamic";

/// A setting's value, or "Not set" and what that leaves undecided.
function Setting({ value, unset }: { value: string; unset: string }) {
  if (value !== NOT_SET) return <>{value}</>;
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{unset}</span>
    </span>
  );
}

/// What each policy field leaves undecided while it is unset, in the order of the read model.
const UNSET: Record<string, string> = {
  "Measurement standard": "A bill cannot be finalised: it has no standard to follow.",
  "Qualification a bill's preparer holds": "A bill cannot be finalised: nobody can be judged qualified to prepare it.",
  "Estimate made at least this many days before closing": "The estimate's lead time cannot be judged. No number is assumed.",
  "Office holding the estimate's copies": "Who may hold the copies is not recorded. It matters once sign-in exists.",
  "Office auditing the estimate": "Who may audit the estimate is not recorded. It matters once sign-in exists.",
  "List of contract kinds": "A panel's contract kind is specified in words.",
  "List of project statuses": "A panel's project status is specified in words.",
  "Opening benchmark row is called": "The row is given a plain default name when bids are opened.",
};

const day = (d: string | null) => (d ? formatDate(d) : "");

export default async function ScopeConfigurationPage() {
  const org = await exerciseOrg();
  const c = org ? await scopeConfiguration() : null;
  if (!org || !c) {
    return (
      <>
        <PageHeader title="Scope and estimate" subtitle="How bills, specification panels and company estimates are judged." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const policyRow = await db.scopePolicy.findUnique({ where: { organisationId: org.id }, select: { id: true } });
  const p = c.policy.raw;
  const f = (label: string) => c.policy.fields.find((x) => x.label === label)!;
  const standardUnset = p.measurementStandardLabel == null;
  const qualificationUnset = p.bqPreparerQualificationCode == null;
  const leadUnset = p.estimateLeadDays == null;
  const methodsUnset = c.methods.filter((m) => m.raw === "unset" && !m.retired).length;
  const basesUnset = c.bases.filter((b) => b.raw === "unset" && !b.retired).length;
  const unset = [standardUnset, qualificationUnset, leadUnset].filter(Boolean).length + methodsUnset + basesUnset;

  const policyValues: Record<string, string> = {
    measurementStandardLabel: p.measurementStandardLabel ?? "",
    measurementStandardProvenance: p.measurementStandardProvenance ?? "",
    bqPreparerQualificationCode: p.bqPreparerQualificationCode ?? "",
    estimateLeadDays: p.estimateLeadDays == null ? "" : String(p.estimateLeadDays),
    estimateLeadProvenance: p.estimateLeadProvenance ?? "",
    estimateCustodianRoleCode: p.estimateCustodianRoleCode ?? "",
    estimateAuditRoleCode: p.estimateAuditRoleCode ?? "",
    estimateOverrideRoleCode: p.estimateOverrideRoleCode ?? "",
    panelSignatoryLimit: p.panelSignatoryLimit == null ? "" : String(p.panelSignatoryLimit),
    panelSignatoryLimitProvenance: p.panelSignatoryLimitProvenance ?? "",
    panelContractKindTaxonomyCode: p.panelContractKindTaxonomyCode ?? "",
    panelProjectStatusTaxonomyCode: p.panelProjectStatusTaxonomyCode ?? "",
    benchmarkLabelEn: p.benchmarkLabelEn ?? "",
    benchmarkLabelMs: p.benchmarkLabelMs ?? "",
    notes: p.notes,
  };
  const people = c.options.people;

  const setting = (label: string): { label: string; value: ReactNode } => {
    const x = f(label);
    const raw = (x as { rawProvenance?: string | null }).rawProvenance;
    return {
      label,
      value: (
        <span className="flex flex-col items-start gap-1.5">
          <Setting value={x.value} unset={UNSET[label] ?? ""} />
          {x.value !== NOT_SET && raw !== undefined && <ProvenanceBadge value={raw} />}
        </span>
      ),
    };
  };

  return (
    <>
      <PageHeader
        title="Scope and estimate"
        badge={unset > 0 ? <Badge tone="warn" dot>{`${unset} not set`}</Badge> : <Badge tone="ok" dot>All set</Badge>}
        subtitle="How bills of quantities, specification panels and company estimates are judged."
        actions={
          <>
            {policyRow && <HistoryButton entity="ScopePolicy" entityId={policyRow.id} label="the scope and estimate policy" />}
            <EditScopePolicy values={policyValues} qualifications={c.options.qualifications} offices={c.options.offices} lists={c.options.lists} />
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {leadUnset && (
          <Callout tone="warn" title="Estimate lead time is not set">
            How many days before closing the estimate is made is not set, so its lead time cannot be judged on any exercise and no number is assumed. Set it under &ldquo;Estimate made at least this many days before closing&rdquo; below.
          </Callout>
        )}

        <Card>
          <CardHeader icon={<SlidersIcon size={17} />} title="Policy" subtitle="Unset is not zero and not a guess: it says what it leaves undecided. A value set says where it came from." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                setting("Measurement standard"),
                setting("Qualification a bill's preparer holds"),
                setting("Estimate made at least this many days before closing"),
                setting("Office holding the estimate's copies"),
                setting("Office auditing the estimate"),
                { label: "Office that may accept a late estimate", value: f("Office that may accept a late estimate").value },
                { label: "Most verifiers on a specification panel", value: <span className="flex flex-col items-start gap-1.5"><span>{f("Most verifiers on a specification panel").value}</span>{p.panelSignatoryLimit != null && <ProvenanceBadge value={p.panelSignatoryLimitProvenance} />}</span> },
                setting("List of contract kinds"),
                setting("List of project statuses"),
                setting("Opening benchmark row is called"),
              ]}
            />
            {p.notes && <p className="mt-4 text-[13px] break-words whitespace-pre-line text-ink-2">{p.notes}</p>}
          </CardBody>
        </Card>

        <Section title="Which methods need a company estimate" blurb="Where a method does, the documents cannot go for approval until the estimate is lodged. Not set holds that check back, naming this setting; it is never read as No." empty="No sourcing methods are configured. Add them under Reference data." count={c.methods.length}>
          <Table minWidth={560}>
            <colgroup>
              <col />
              <col style={{ width: "26%" }} />
              <col style={{ width: "20%" }} />
              <ActionsCol icons={1} labelled={1} />
            </colgroup>
            <THead>
              <Th>Method</Th>
              <Th>Needs an estimate</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.methods.map((m) => (
                <Tr key={m.id}>
                  <Td label="Method"><CellStack title={m.name} sub={m.retired ? "Retired" : undefined} /></Td>
                  <Td label="Needs an estimate">{m.raw === "unset" ? <Badge tone="warn">Not set</Badge> : m.needsEstimate}</Td>
                  <Td label="Source">{m.raw === "unset" ? <span className="text-ink-3">—</span> : <ProvenanceBadge value={m.rawProvenance} />}</Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.name} />
                      <EditMethodRule id={m.id} name={m.name} raw={m.raw} provenance={m.rawProvenance} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Which contract bases are let on a bill of quantities" blurb="Where a basis is, a finalised bill must go with the documents. Not set holds that check back, naming this setting." empty="No contract bases are configured. Add them under Reference data." count={c.bases.length}>
          <Table minWidth={560}>
            <colgroup>
              <col />
              <col style={{ width: "26%" }} />
              <col style={{ width: "20%" }} />
              <ActionsCol icons={1} labelled={1} />
            </colgroup>
            <THead>
              <Th>Contract basis</Th>
              <Th>Let on a bill</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.bases.map((b) => (
                <Tr key={b.id}>
                  <Td label="Contract basis"><CellStack title={b.name} sub={b.retired ? "Retired" : undefined} /></Td>
                  <Td label="Let on a bill">{b.raw === "unset" ? <Badge tone="warn">Not set</Badge> : b.letOnBill}</Td>
                  <Td label="Source">{b.raw === "unset" ? <span className="text-ink-3">—</span> : <ProvenanceBadge value={b.rawProvenance} />}</Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="ContractBasis" entityId={b.id} label={b.name} />
                      <EditBasisRule id={b.id} name={b.name} raw={b.raw} provenance={b.rawProvenance} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Qualifications" blurb="What a bill's preparer must hold, and who holds it, day by day. A holding counts from its first day to its last." empty="No qualifications are recorded, so nobody can be judged qualified to prepare a bill." count={c.qualifications.length} action={<QualificationDrawer />}>
          <Table minWidth={720}>
            <colgroup>
              <col style={{ width: "30%" }} />
              <col />
              <col style={{ width: "14%" }} />
              <ActionsCol icons={1} labelled={1} />
            </colgroup>
            <THead>
              <Th>Qualification</Th>
              <Th>Held by</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.qualifications.map((q) => (
                <Tr key={q.id}>
                  <Td label="Qualification"><CellStack title={q.name} sub={[q.governingSource || null, q.retiredOn ? `Retired from ${day(q.retiredOn)}` : null].filter(Boolean).join(" · ") || undefined} /></Td>
                  <Td label="Held by">
                    {q.holders.length === 0 ? (
                      <span className="text-[13px] text-ink-3">Nobody recorded</span>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {q.holders.map((h) => (
                          <li key={h.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="text-[13.5px] break-words text-ink">
                              {h.person}, {day(h.from)} to {h.to ? day(h.to) : "no end date"}
                            </span>
                            <HoldingDrawer qualificationCode={q.code} qualificationName={q.name} people={people} holding={{ ...h.raw, person: h.person }} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-1.5">
                      <HoldingDrawer qualificationCode={q.code} qualificationName={q.name} people={people} />
                    </div>
                  </Td>
                  <Td label="Source"><ProvenanceBadge value={q.rawProvenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="Qualification" entityId={q.id} label={q.name} />
                      <QualificationDrawer q={q} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Bill templates" blurb="Section headings a new bill can start from. A template brings no lines." empty="No templates are configured: a bill's sections are added by hand." count={c.templates.length} action={<TemplateDrawer />}>
          <Table minWidth={720}>
            <colgroup>
              <col style={{ width: "30%" }} />
              <col />
              <col style={{ width: "14%" }} />
              <ActionsCol icons={1} labelled={1} />
            </colgroup>
            <THead>
              <Th>Template</Th>
              <Th>Sections</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.templates.map((t) => (
                <Tr key={t.id}>
                  <Td label="Template"><CellStack title={t.name} sub={t.retiredOn ? `Retired from ${day(t.retiredOn)}` : undefined} /></Td>
                  <Td label="Sections">
                    {t.sections.length === 0 ? (
                      <span className="text-[13px] text-ink-3">No sections yet</span>
                    ) : (
                      <ol className="flex flex-col gap-1">
                        {t.sections.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-x-2">
                            <span className="text-[13.5px] break-words text-ink">{s.number}. {s.title}</span>
                            <TemplateSectionDrawer templateId={t.id} templateName={t.name} section={s} />
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="mt-1.5">
                      <TemplateSectionDrawer templateId={t.id} templateName={t.name} />
                    </div>
                  </Td>
                  <Td label="Source"><ProvenanceBadge value={t.rawProvenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="BqTemplate" entityId={t.id} label={t.name} />
                      <TemplateDrawer t={t} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Specification panel columns" blurb="The columns of the signed panel form. Each is verified by a named person, recorded on behalf of, not signed. With none configured nothing can be verified." empty="No columns are configured, so no panel can be verified." count={c.columns.length} action={<ColumnDrawer units={c.options.units} />}>
          <Table minWidth={640}>
            <colgroup>
              <col />
              <col style={{ width: "26%" }} />
              <col style={{ width: "14%" }} />
              <ActionsCol icons={1} labelled={1} />
            </colgroup>
            <THead>
              <Th>Column</Th>
              <Th>Unit whose officer verifies</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.columns.map((col) => (
                <Tr key={col.id}>
                  <Td label="Column"><CellStack title={col.label} sub={col.retiredOn ? `Retired from ${day(col.retiredOn)}` : undefined} /></Td>
                  <Td label="Unit" className="text-ink-2">{col.unit ?? "Not tied to a unit"}</Td>
                  <Td label="Source"><ProvenanceBadge value={col.rawProvenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="SpecPanelColumn" entityId={col.id} label={col.label} />
                      <ColumnDrawer units={c.options.units} c={col} />
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </div>
    </>
  );
}
