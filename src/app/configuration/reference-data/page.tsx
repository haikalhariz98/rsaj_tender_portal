import { AlertTriangle } from "@/components/icons";
import {
  AddContractType,
  AddFundingRoute,
  AddSourcingMethod,
  EditContractType,
  EditFundingRoute,
  EditSourcingMethod,
  RestoreEntry,
  RetireEntry,
} from "./editors";
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
                    <EditSourcingMethod method={m} id={m.id} />
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
            <ActionsCol icons={2} labelled={1} />
          </colgroup>
          <THead>
            <Th>Type</Th>
            <Th>Notes</Th>
            <Th>Source</Th>
            <Th className="text-right">Actions</Th>
          </THead>
          <tbody>
            {types.map((c) => (
              <Tr key={c.code}>
                <Td title={c.nameMs ? `${c.nameEn} — ${c.nameMs}` : c.nameEn}>
                  <CellStack title={c.nameEn} sub={c.nameMs || undefined} />
                </Td>
                <Td className="text-ink-2">{c.notes || "—"}</Td>
                <Td>
                  <ProvenanceCell value={c.provenance} source={c.governingSource} />
                </Td>
                <Td>
                  <RowActions>
                    <HistoryButton iconOnly entity="ContractType" entityId={c.id} label={c.nameEn} />
                    <EditContractType type={c} id={c.id} />
                    <RetireEntry entity="ContractType" id={c.id} label={c.nameEn} />
                  </RowActions>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <RetiredEntries
        entries={[
          ...data.fundingRoutes.map((e) => ({ ...e, entity: "FundingRoute" as const, list: "Funding route" })),
          ...data.sourcingMethods.map((e) => ({ ...e, entity: "SourcingMethod" as const, list: "Sourcing method" })),
          ...data.contractTypes.map((e) => ({ ...e, entity: "ContractType" as const, list: "Contract type" })),
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
    entity: "FundingRoute" | "SourcingMethod" | "ContractType";
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
