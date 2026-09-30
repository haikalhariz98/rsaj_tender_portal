import { AlertTriangle } from "@/components/icons";
import {
  AddContractType,
  AddFundingRoute,
  AddSourcingMethod,
  BasisDrawer,
  ChecklistItemDrawer,
  ClassificationPolicyDrawer,
  ContractBehavioursDrawer,
  EditContractType,
  EditFundingRoute,
  EditSourcingMethod,
  MappingDrawer,
  ReasonDrawer,
  RemoveMapping,
  RestoreEntry,
  RetireChecklistItem,
  RetireEntry,
  TaxonomyDrawer,
  TaxonomyValueDrawer,
  type RetirableEntity,
} from "./editors";
import { loadMethodConfig } from "@/lib/method/repo";
import { behaviourProfile } from "@/lib/method/profile";
import { DELIVERABLE_LABEL } from "@/lib/method/labels";
import type { DeliverableKind } from "@/lib/method/types";
import { KeyValues } from "@/components/ui/stat";
import { CardBody } from "@/components/ui/card";
import { db } from "@/lib/db";
import { ORGANISATION_CODE } from "@/lib/org";
import { loadReferenceData } from "@/lib/reference/load";
import type { ListReadiness, Provenance, SourcingMethod } from "@/lib/reference/types";
import {
  activeOn,
  assessReferenceData,
  fundingPosture,
  isUnbanded,
} from "@/lib/reference/vocabulary";
import { Section, Stats } from "../records-ui";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { Badge, Chip, type Tone } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { Stat } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { HistoryButton } from "@/components/history-drawer";

export const dynamic = "force-dynamic";

const POSTURE_LABEL = {
  PROCURES: "Procures",
  ROUTE_SET_EXTERNALLY: "Funder sets the route",
  RECORDS_ONLY: "Records only",
} as const;

const POSTURE_TONE: Record<keyof typeof POSTURE_LABEL, Tone> = {
  PROCURES: "ok",
  ROUTE_SET_EXTERNALLY: "info",
  RECORDS_ONLY: "warn",
};

/// Wide enough that three row actions never squeeze the columns before them.
const TABLE_MIN = 880;

export default async function ReferenceDataPage() {
  const on = new Date();
  const data = await loadReferenceData(ORGANISATION_CODE);
  const readiness = assessReferenceData(data, on);

  const routes = activeOn(data.fundingRoutes, on);
  const methods = activeOn(data.sourcingMethods, on);
  const types = activeOn(data.contractTypes, on);

  const unbanded = methods.filter(isUnbanded);

  // Classification (6.3): method behaviours, proposal items, reasons, contract-type
  // behaviours, bases, taxonomies, mappings and the mixed-scope policy.
  const org = await db.organisation.findUnique({ where: { code: ORGANISATION_CODE }, select: { id: true } });
  const cls = org ? await loadMethodConfig(org.id) : null;
  const rows = cls?.rows;
  const live = <T extends { retiredOn: Date | null }>(xs: T[]) => xs.filter((x) => x.retiredOn == null || x.retiredOn > on);
  const methodRow = (code: string) => rows?.methods.find((m) => m.code === code);
  const typeRow = (code: string) => rows?.types.find((t) => t.code === code);
  const offices = org ? (await db.authorityRole.findMany({ where: { organisationId: org.id }, orderBy: { sortOrder: "asc" }, select: { code: true, nameEn: true } })).map((o) => ({ value: o.code, label: o.nameEn })) : [];
  const methodOptions = methods.map((m) => ({ value: m.code, label: m.nameEn }));
  const items = (rows?.methods ?? []).flatMap((m) => live(m.checklistItems).map((i) => ({ ...i, method: m.nameEn })));
  const reasons = live(rows?.reasons ?? []);
  const bases = live(rows?.bases ?? []);
  const taxonomies = live(rows?.taxonomies ?? []);
  const mappings = rows?.mappings ?? [];
  const policy = rows?.policy ?? null;
  const taxName = (c: string) => rows?.taxonomies.find((t) => t.code === c)?.nameEn ?? "A classification no longer configured";
  const valueName = (t: string, v: string) => rows?.taxonomies.find((x) => x.code === t)?.values.find((x) => x.code === v)?.nameEn ?? "A value no longer configured";
  const asks = (code: string) => {
    const m = methodRow(code);
    if (!m) return [];
    return [
      m.defaultInTender && "Proposed in the tender band",
      m.defaultInQuotation && "Proposed in the quotation band",
      m.defaultBelow && "Proposed below the quotation floor",
      m.requiresJustification && "Justification",
      m.requiresProposal && "Proposal",
      m.requiresNameApproval && "Name approval",
      m.restrictedAccess && "Restricted",
      m.requiresDossier && "Dossier",
      m.requiresCoordinationRecord && "Coordination record",
    ].filter(Boolean) as string[];
  };

  return (
    <>
      <PageHeader
        title="Reference data"
        badge={!readiness.complete ? <Badge tone="warn" dot>Incomplete</Badge> : undefined}
        subtitle="Sourcing methods, contract types, funding routes and code lists."
      />

      <Stats>
        <ReadinessStat label="Funding routes" readiness={readiness.fundingRoutes} />
        <ReadinessStat label="Sourcing methods" readiness={readiness.sourcingMethods} />
        <ReadinessStat label="Contract types" readiness={readiness.contractTypes} />
      </Stats>

      {unbanded.length > 0 && (
        <Callout
          tone="warn"
          className="mb-6"
          title={
            unbanded.length === 1
              ? "One sourcing method is available at no value at all"
              : `${unbanded.length} sourcing methods are available at no value at all`
          }
        >
          {unbanded.map((m) => m.nameEn).join(", ")} — no band is ticked, so nothing will
          ever offer{unbanded.length === 1 ? " it" : " them"}. Which band applies is a
          policy question, so the portal leaves it showing rather than picking one.
        </Callout>
      )}

      <Section
        title="Funding routes"
        blurb="Funding sources and the procurement each one permits."
        empty="No funding route has been set. Until one is, a matter cannot be classified and the approval matrix cannot say whether a funder's own rules apply."
        count={routes.length}
        action={<AddFundingRoute />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "13%" }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Route</Th>
            <Th>Posture</Th>
            <Th>Authority</Th>
            <Th>Triggered by</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {routes.map((r) => {
              const posture = fundingPosture(r);
              return (
                <Tr key={r.code}>
                  <Td title={r.nameMs ? `${r.nameEn} — ${r.nameMs}` : r.nameEn}>
                    <CellStack title={r.nameEn} sub={r.nameMs || undefined} />
                  </Td>
                  <Td>
                    <Chip tone={POSTURE_TONE[posture]} title={POSTURE_LABEL[posture]}>
                      {POSTURE_LABEL[posture]}
                    </Chip>
                    <div className="mt-1 truncate text-[12px] text-ink-3">
                      {r.approvalCommitsBudget == null
                        ? "Budget commitment not set"
                        : r.approvalCommitsBudget
                          ? "Approval commits the budget"
                          : "Approval commits no budget"}
                    </div>
                    {r.requiresExternalAuthorityRef && (
                      <div className="mt-1 truncate text-[12px] text-ink-3" title={`Waits for ${r.externalAuthorityRefLabel ?? "an external authority"}`}>
                        Waits for {r.externalAuthorityRefLabel ?? "an external authority"}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {r.supersedesAuthority ? (
                      <Badge tone="warn" title="Funder’s rules prevail">
                        Funder&rsquo;s rules prevail
                      </Badge>
                    ) : (
                      <span className="text-ink-2">These limits apply</span>
                    )}
                  </Td>
                  <Td className="text-ink-2">{r.trigger || "—"}</Td>
                  <Td>
                    <ProvenanceCell value={r.provenance} source={r.governingSource} />
                  </Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="FundingRoute" entityId={r.id} label={r.nameEn} />
                      <EditFundingRoute route={r} id={r.id} />
                      <RetireEntry entity="FundingRoute" id={r.id} label={r.nameEn} />
                    </RowActions>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Sourcing methods"
        blurb="How suppliers are approached. Value bands are held in the approval matrix."
        empty="No sourcing method has been set. The approval matrix can still route on value, but nothing yet says how the market is approached."
        count={methods.length}
        action={<AddSourcingMethod />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col />
            <col style={{ width: "16%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "13%" }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Method</Th>
            <Th>Bands</Th>
            <Th>Approach</Th>
            <Th>Awards by</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {methods.map((m) => (
              <Tr key={m.code}>
                <Td title={m.nameMs ? `${m.nameEn} — ${m.nameMs}` : m.nameEn}>
                  <CellStack title={m.nameEn} sub={m.nameMs || undefined} />
                  {asks(m.code).length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {asks(m.code).map((a) => (
                        <Chip key={a}>{a}</Chip>
                      ))}
                    </span>
                  )}
                </Td>
                <Td>
                  <Bands method={m} />
                </Td>
                <Td className="text-ink-2">{approachOf(m)}</Td>
                <Td className="text-ink-2">{m.awardInstrument || "—"}</Td>
                <Td>
                  <ProvenanceCell value={m.provenance} source={m.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.nameEn} />
                    <EditSourcingMethod method={{ ...m, ...(methodRow(m.code) ?? {}), provenance: m.provenance }} id={m.id} />
                    <RetireEntry entity="SourcingMethod" id={m.id} label={m.nameEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Contract types"
        blurb="Classification of what is being bought."
        empty="No contract type has been set."
        count={types.length}
        action={<AddContractType />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col style={{ width: "26%" }} />
            <col />
            <col style={{ width: "17%" }} />
            <ActionsCol icons={3} labelled={1} />
          </colgroup>
          <THead>
            <Th>Type</Th>
            <Th>What it drives</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {types.map((c) => (
              <Tr key={c.code}>
                <Td title={c.nameMs ? `${c.nameEn} — ${c.nameMs}` : c.nameEn}>
                  <CellStack title={c.nameEn} sub={typeRow(c.code)?.deliverableKind ? `Default for this deliverable: ${DELIVERABLE_LABEL[typeRow(c.code)!.deliverableKind as DeliverableKind].toLowerCase()}` : "Default for this deliverable: none"} />
                </Td>
                <Td className="text-ink-2">
                  {(() => {
                    const t = typeRow(c.code);
                    const set = t ? behaviourProfile({ ...t }).filter((b) => b.value != null).length : 0;
                    return `${set} of 12 behaviours set${set < 12 ? " · the rest not set" : ""}`;
                  })()}
                  {c.notes && <div className="truncate text-[12.5px] text-ink-3">{c.notes}</div>}
                </Td>
                <Td>
                  <ProvenanceCell value={c.provenance} source={c.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="ContractType" entityId={c.id} label={c.nameEn} />
                    <EditContractType type={{ ...c, deliverableKind: typeRow(c.code)?.deliverableKind ?? null }} id={c.id} />
                    {typeRow(c.code) && <ContractBehavioursDrawer id={c.id} name={c.nameEn} values={typeRow(c.code)!} offices={offices} />}
                    <RetireEntry entity="ContractType" id={c.id} label={c.nameEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Proposal items"
        blurb="What a method's proposal must hold before it goes to review."
        empty="No proposal items are set. A method that asks for a proposal cannot have one submitted until its items are."
        count={items.length}
        action={<ChecklistItemDrawer methods={methodOptions.filter((o) => methodRow(o.value)?.requiresProposal)} />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col style={{ width: "22%" }} />
            <col />
            <col style={{ width: "13%" }} />
            <ActionsCol icons={1} labelled={1} />
          </colgroup>
          <THead>
            <Th>Method</Th>
            <Th>Item</Th>
            <Th>Required</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {items.map((i) => (
              <Tr key={i.id}>
                <Td className="text-ink-2">{i.method}</Td>
                <Td className="break-words">{i.labelEn}</Td>
                <Td>{i.required ? <Chip tone="brand">Required</Chip> : <Chip>Optional</Chip>}</Td>
                <Td>
                  <RowActions>
                    <ChecklistItemDrawer methods={methodOptions} item={i} />
                    <RetireChecklistItem id={i.id} label={i.labelEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Justification reasons"
        blurb="Why a direct appointment may be justified."
        empty="No reasons are set. A method that keeps a justification dossier cannot have an exercise move into preparation until one is."
        count={reasons.length}
        action={<ReasonDrawer methods={methodOptions} />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col />
            <col style={{ width: "24%" }} />
            <col style={{ width: "20%" }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Reason</Th>
            <Th>Offered for</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {reasons.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <CellStack title={r.nameEn} sub={r.nameMs || undefined} />
                </Td>
                <Td className="text-ink-2">{r.sourcingMethodCode ? (methodRow(r.sourcingMethodCode)?.nameEn ?? "A method no longer configured") : "Every method that asks"}</Td>
                <Td>
                  <ProvenanceCell value={r.provenance as Provenance} source={r.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="JustificationReason" entityId={r.id} label={r.nameEn} />
                    <ReasonDrawer methods={methodOptions} reason={r} />
                    <RetireEntry entity="JustificationReason" id={r.id} label={r.nameEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Contract bases"
        blurb="Bills of quantities, drawings and specification. Always chosen by the officer."
        empty="No contract basis is set. An exercise cannot move into preparation until one is chosen."
        count={bases.length}
        action={<BasisDrawer />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col style={{ width: "30%" }} />
            <col />
            <col style={{ width: "20%" }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Basis</Th>
            <Th>Standard contract form</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {bases.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <CellStack title={b.nameEn} sub={b.nameMs || undefined} />
                </Td>
                <Td className="text-ink-2">{b.standardFormLabel || "Not set"}</Td>
                <Td>
                  <ProvenanceCell value={b.provenance as Provenance} source={b.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="ContractBasis" entityId={b.id} label={b.nameEn} />
                    <BasisDrawer basis={b} />
                    <RetireEntry entity="ContractBasis" id={b.id} label={b.nameEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Other classifications"
        blurb="The other classifications a contract carries, derived from its type."
        empty="No other classification is set, so none is derived for an exercise."
        count={taxonomies.length}
        action={<TaxonomyDrawer />}
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col style={{ width: "24%" }} />
            <col />
            <col style={{ width: "18%" }} />
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Classification</Th>
            <Th>Values</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {taxonomies.map((t) => (
              <Tr key={t.id}>
                <Td>
                  <CellStack title={t.nameEn} sub={t.nameMs || undefined} />
                </Td>
                <Td>
                  <ul className="flex flex-col gap-1">
                    {t.values.map((v) => (
                      <li key={v.id} className="flex min-w-0 items-center gap-1.5 text-[13px]">
                        <span className={v.retiredOn ? "min-w-0 break-words text-ink-4 line-through" : "min-w-0 break-words text-ink-2"}>{v.nameEn}</span>
                        <TaxonomyValueDrawer taxonomyId={t.id} taxonomy={t.nameEn} value={{ id: v.id, nameEn: v.nameEn, nameMs: v.nameMs, sortOrder: v.sortOrder, retired: v.retiredOn != null }} />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2">
                    <TaxonomyValueDrawer taxonomyId={t.id} taxonomy={t.nameEn} />
                  </div>
                </Td>
                <Td>
                  <ProvenanceCell value={t.provenance as Provenance} source={t.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="ClassificationTaxonomy" entityId={t.id} label={t.nameEn} />
                    <TaxonomyDrawer taxonomy={t} />
                    <RetireEntry entity="ClassificationTaxonomy" id={t.id} label={t.nameEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section
        title="Classification mappings"
        blurb="Each contract type's value in the other classifications. Two values for one type ask the officer to choose once."
        empty="No mapping is set, so every other classification shows as not mapped."
        count={mappings.length}
        action={
          <MappingDrawer
            types={types.map((t) => ({ value: t.code, label: t.nameEn }))}
            taxonomies={taxonomies.map((t) => ({ value: t.code, label: t.nameEn }))}
            values={taxonomies.flatMap((t) => live(t.values).map((v) => ({ value: v.code, label: `${t.nameEn}: ${v.nameEn}` })))}
            bases={bases.map((b) => ({ value: b.code, label: b.nameEn }))}
          />
        }
      >
        <Table minWidth={TABLE_MIN}>
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "22%" }} />
            <col />
            <col style={{ width: "16%" }} />
            <ActionsCol icons={0} labelled={1} />
          </colgroup>
          <THead>
            <Th>Contract type</Th>
            <Th>Classification</Th>
            <Th>Value, and when</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {mappings.map((m) => (
              <Tr key={m.id}>
                <Td className="text-ink">{typeRow(m.contractTypeCode)?.nameEn ?? "A type no longer configured"}</Td>
                <Td className="text-ink-2">{taxName(m.taxonomyCode)}</Td>
                <Td className="break-words">
                  {valueName(m.taxonomyCode, m.valueCode)}
                  {(m.whenBasisCode || m.whenTaxonomyCode) && (
                    <div className="text-[12.5px] text-ink-3">
                      Only when{" "}
                      {[
                        m.whenBasisCode && `the basis is ${rows?.bases.find((b) => b.code === m.whenBasisCode)?.nameEn.toLowerCase() ?? "a basis no longer configured"}`,
                        m.whenTaxonomyCode && m.whenValueCode && `${taxName(m.whenTaxonomyCode).toLowerCase()} is ${valueName(m.whenTaxonomyCode, m.whenValueCode)}`,
                      ]
                        .filter(Boolean)
                        .join(" and ")}
                    </div>
                  )}
                </Td>
                <Td>
                  <ProvenanceCell value={m.provenance as Provenance} source={m.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <RemoveMapping id={m.id} label={`${typeRow(m.contractTypeCode)?.nameEn ?? "type"} in ${taxName(m.taxonomyCode)}`} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Card className="mb-6">
        <CardHeader
          title="Mixed scope"
          subtitle="How an exercise whose scope mixes deliverables is classified."
          actions={<ClassificationPolicyDrawer values={{ dominanceSharePct: policy?.dominanceSharePct?.toString() ?? null, provenance: policy?.provenance ?? null, notes: policy?.notes ?? "" }} />}
        />
        <CardBody>
          <KeyValues
            columns={2}
            items={[
              {
                label: "Dominance threshold",
                value: policy?.dominanceSharePct != null ? `The largest deliverable's share must be above ${Number(policy.dominanceSharePct.toString()).toFixed(2)}%` : <span className="text-ink-3">Not set: no default for mixed scope. The officer chooses the type, with a reason.</span>,
              },
              { label: "Where it comes from", value: policy?.provenance ? <ProvenanceBadge value={policy.provenance} /> : "Not set" },
            ]}
          />
        </CardBody>
      </Card>

      <RetiredEntries
        entries={[
          ...data.fundingRoutes.map((e) => ({ ...e, entity: "FundingRoute" as const, list: "Funding route" })),
          ...data.sourcingMethods.map((e) => ({ ...e, entity: "SourcingMethod" as const, list: "Sourcing method" })),
          ...data.contractTypes.map((e) => ({ ...e, entity: "ContractType" as const, list: "Contract type" })),
          ...(rows?.reasons ?? []).map((e) => ({ ...e, entity: "JustificationReason" as const, list: "Justification reason" })),
          ...(rows?.bases ?? []).map((e) => ({ ...e, entity: "ContractBasis" as const, list: "Contract basis" })),
          ...(rows?.taxonomies ?? []).map((e) => ({ ...e, entity: "ClassificationTaxonomy" as const, list: "Classification" })),
        ].filter((e) => e.retiredOn != null && e.retiredOn <= on)}
      />
    </>
  );
}

/// Retired entries stay on record, and can be put back. Hidden, they could only be
/// recreated — and a recreated entry is a different record from the one matters ran under.
function RetiredEntries({
  entries,
}: {
  entries: {
    id: string;
    nameEn: string;
    retiredOn: Date | null;
    entity: RetirableEntity;
    list: string;
  }[];
}) {
  if (entries.length === 0) return null;
  return (
    <Card className="mt-6">
      <CardHeader
        title="Retired"
        subtitle="No longer offered. Matters already run under them keep showing them."
      />
      <ul className="divide-y divide-line/70 px-6">
        {entries.map((e) => (
          <li key={e.entity + e.id} className="flex items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink" title={e.nameEn}>
                {e.nameEn}
              </span>
              <span className="block text-[12.5px] text-ink-3">
                {e.list} · retired {e.retiredOn ? formatDate(e.retiredOn) : ""}
              </span>
            </span>
            <RestoreEntry entity={e.entity} id={e.id} label={e.nameEn} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/// A list that has never been filled in reads differently from one deliberately short.
function ReadinessStat({ label, readiness }: { label: string; readiness: ListReadiness }) {
  const unset = readiness.state === "UNSET";
  return (
    <Stat
      label={label}
      value={unset ? <span className="text-ink-4">Not set</span> : readiness.active}
      tone={readiness.needsSignOff ? "warn" : "neutral"}
      icon={readiness.needsSignOff ? <AlertTriangle size={16} /> : undefined}
      hint={
        unset
          ? "Nobody has configured this list. That is not the same as none."
          : readiness.needsSignOff
            ? `${readiness.assumed} resting on a working default, awaiting sign-off`
            : "Every entry traced to a source"
      }
    />
  );
}

/// Where an entry came from, with the document that states it beneath.
function ProvenanceCell({ value, source }: { value: Provenance; source: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <ProvenanceBadge value={value} />
      {source && (
        <span className="block max-w-full truncate text-[12.5px] text-ink-3" title={source}>
          {source}
        </span>
      )}
    </div>
  );
}

/// The bands a method may be used in, named the way the matrix names them.
function Bands({ method }: { method: SourcingMethod }) {
  const bands = [
    method.availableInTender && "Tender",
    method.availableInQuotation && "Quotation",
    method.availableBelow && "Below",
  ].filter(Boolean) as string[];

  if (bands.length === 0) {
    return <Badge tone="warn">No band</Badge>;
  }
  if (bands.length === 3) {
    return <Chip tone="brand">Any value</Chip>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {bands.map((b) => (
        <Chip key={b}>{b}</Chip>
      ))}
    </span>
  );
}

function approachOf(m: SourcingMethod): string {
  if (!m.requiresFreshSourcing) return "Called off an existing contract";
  const parts = [
    m.requiresAdvertisement && "Advertised",
    m.invitesNamedSuppliers && "Named suppliers invited",
  ].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : "Approached directly";
}
