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
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { HistoryButton } from "@/components/history-drawer";

export const dynamic = "force-dynamic";

const PROVENANCE_LABEL: Record<Provenance, string> = {
  STATED: "Stated",
  OBSERVED: "Observed",
  ASSUMED: "Assumed",
};

const PROVENANCE_CHIP: Record<Provenance, string> = {
  STATED: "chip--ok",
  OBSERVED: "chip--info",
  ASSUMED: "chip--warn",
};

const POSTURE_LABEL = {
  PROCURES: "Procures",
  ROUTE_SET_EXTERNALLY: "Funder sets the route",
  RECORDS_ONLY: "Records only",
} as const;

const POSTURE_CHIP = {
  PROCURES: "chip--ok",
  ROUTE_SET_EXTERNALLY: "chip--info",
  RECORDS_ONLY: "chip--warn",
} as const;

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

      <div className="grid g3 stack--md" style={{ marginBottom: 24 }}>
        <ReadinessStat label="Funding routes" readiness={readiness.fundingRoutes} />
        <ReadinessStat label="Sourcing methods" readiness={readiness.sourcingMethods} />
        <ReadinessStat label="Contract types" readiness={readiness.contractTypes} />
      </div>

      {unbanded.length > 0 && (
        <div className="callout callout--warn" style={{ marginBottom: 24 }}>
          <div>
            <strong>
              {unbanded.length === 1
                ? "One sourcing method is available at no value at all"
                : `${unbanded.length} sourcing methods are available at no value at all`}
            </strong>
            <p className="sm" style={{ margin: "4px 0 0" }}>
              {unbanded.map((m) => m.nameEn).join(", ")} — no band is ticked, so nothing will
              ever offer{unbanded.length === 1 ? " it" : " them"}. Which band applies is a
              policy question, so the portal leaves it showing rather than picking one.
            </p>
          </div>
        </div>
      )}

      <Section
        title="Funding routes"
        blurb="Funding sources and the procurement each one permits."
        empty="No funding route has been set. Until one is, a matter cannot be classified and the approval matrix cannot say whether a funder's own rules apply."
        count={routes.length}
        action={<AddFundingRoute />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "21%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Route</th>
              <th>Posture</th>
              <th>Authority</th>
              <th>Triggered by</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => {
              const posture = fundingPosture(r);
              return (
                <tr key={r.code}>
                  <td>
                    <div className="cellstack">
                      <span className="cellstack__t">{r.nameEn}</span>
                      {r.nameMs && <span className="cellstack__s">{r.nameMs}</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${POSTURE_CHIP[posture]}`}>
                      {POSTURE_LABEL[posture]}
                    </span>
                  </td>
                  <td>
                    {r.supersedesAuthority ? (
                      <span className="badge badge--warn">Funder&rsquo;s rules prevail</span>
                    ) : (
                      <span className="sm dim">These limits apply</span>
                    )}
                  </td>
                  <td className="sm dim">{r.trigger || "—"}</td>
                  <td>
                    <ProvenanceChip value={r.provenance} source={r.governingSource} />
                  </td>
                  <td className="right">
                    <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                      <span className="inline-flex items-center justify-end gap-1">
  <HistoryButton iconOnly entity="FundingRoute" entityId={r.id} label={r.nameEn} />
  <EditFundingRoute route={r} id={r.id} />
</span>
                      <RetireEntry entity="FundingRoute" id={r.id} label={r.nameEn} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section
        title="Sourcing methods"
        blurb="How suppliers are approached. Value bands are held in the approval matrix."
        empty="No sourcing method has been set. The approval matrix can still route on value, but nothing yet says how the market is approached."
        count={methods.length}
        action={<AddSourcingMethod />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Method</th>
              <th>Bands</th>
              <th>Approach</th>
              <th>Awards by</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {methods.map((m) => (
              <tr key={m.code}>
                <td>
                  <div className="cellstack">
                    <span className="cellstack__t">{m.nameEn}</span>
                    {m.nameMs && <span className="cellstack__s">{m.nameMs}</span>}
                  </div>
                </td>
                <td>
                  <Bands method={m} />
                </td>
                <td className="sm dim">{approachOf(m)}</td>
                <td className="sm dim">{m.awardInstrument || "—"}</td>
                <td>
                  <ProvenanceChip value={m.provenance} source={m.governingSource} />
                </td>
                <td className="right">
                  <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                    <span className="inline-flex items-center justify-end gap-1">
  <HistoryButton iconOnly entity="SourcingMethod" entityId={m.id} label={m.nameEn} />
  <EditSourcingMethod method={m} id={m.id} />
</span>
                    <RetireEntry entity="SourcingMethod" id={m.id} label={m.nameEn} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        title="Contract types"
        blurb="Classification of what is being bought."
        empty="No contract type has been set."
        count={types.length}
        action={<AddContractType />}
      >
        <table className="table">
          <colgroup>
            <col style={{ width: "26%" }} />
            <col style={{ width: "40%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "18%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Type</th>
              <th>Notes</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((c) => (
              <tr key={c.code}>
                <td>
                  <div className="cellstack">
                    <span className="cellstack__t">{c.nameEn}</span>
                    {c.nameMs && <span className="cellstack__s">{c.nameMs}</span>}
                  </div>
                </td>
                <td className="sm dim">{c.notes || "—"}</td>
                <td>
                  <ProvenanceChip value={c.provenance} source={c.governingSource} />
                </td>
                <td className="right">
                  <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                    <span className="inline-flex items-center justify-end gap-1">
  <HistoryButton iconOnly entity="ContractType" entityId={c.id} label={c.nameEn} />
  <EditContractType type={c} id={c.id} />
</span>
                    <RetireEntry entity="ContractType" id={c.id} label={c.nameEn} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
              <span className="block truncate text-[14px] font-semibold text-ink">{e.nameEn}</span>
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
    <div className="stat">
      <div className="stat__top">
        <span className="stat__label">{label}</span>
        {readiness.needsSignOff && (
          <span className="stat__ico stat__ico--warn">
            <AlertTriangle size={15} />
          </span>
        )}
      </div>
      <div className="stat__value">
        {unset ? <span className="dim">Not set</span> : readiness.active}
      </div>
      <div className="stat__foot">
        <span className="stat__hint">
          {unset
            ? "Nobody has configured this list. That is not the same as none."
            : readiness.needsSignOff
              ? `${readiness.assumed} resting on a working default, awaiting sign-off`
              : "Every entry traced to a source"}
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  blurb,
  empty,
  count,
  action,
  children,
}: {
  title: string;
  blurb: string;
  empty: string;
  count: number;
  /// The add button. Present even when the list is empty — an empty list is the one
  /// place someone most needs to add the first entry.
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="section" style={{ marginBottom: 24 }}>
      <div className="section__head">
        <h2 className="h3">{title}</h2>
        {count > 0 && <span className="badge badge--outline">{count}</span>}
        <div className="spacer" />
        {action}
      </div>
      <p className="sm muted" style={{ margin: "0 0 12px" }}>
        {blurb}
      </p>
      {count === 0 ? (
        <div className="card">
          <div className="card__body">
            <div className="empty">
              <div className="empty__t">Not set</div>
              <p className="empty__d">{empty}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="dl">
          <div className="tablewrap">{children}</div>
        </div>
      )}
    </section>
  );
}

function ProvenanceChip({ value, source }: { value: Provenance; source: string }) {
  return (
    <div className="cellstack">
      <span className={`chip ${PROVENANCE_CHIP[value]}`}>{PROVENANCE_LABEL[value]}</span>
      {source && <span className="cellstack__s">{source}</span>}
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
    return <span className="badge badge--warn">No band</span>;
  }
  if (bands.length === 3) {
    return <span className="chip chip--brand">Any value</span>;
  }
  return (
    <span className="row" style={{ gap: 4, flexWrap: "wrap" }}>
      {bands.map((b) => (
        <span key={b} className="chip">
          {b}
        </span>
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
