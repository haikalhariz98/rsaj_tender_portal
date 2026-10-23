import { Say } from "@/components/i18n/language-context";
import { CASE_PANEL_TITLE_WORDS as P } from "@/lib/contract/case-page-words";
import { ActGate } from "@/components/act-gate";
import Link from "next/link";

import type { ContractStatus } from "@/lib/contract/types";
import { actStatusFault, actStatusText } from "@/lib/contract/act-status";
import { DataList, type Row } from "@/components/data-list";
import { FileIcon, ScaleIcon, WalletIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { adjustmentFaults } from "@/lib/adjustment/ppjhk";
import { STATUS_TONE as CERT_TONE, STATUS_WORDS as CERT_WORDS } from "@/lib/certificate/labels";
import { noFormFault } from "@/lib/certificate/form-needs";
import type { CertificateStatus } from "@/lib/certificate/types";
import type { LoadedContract } from "@/lib/contract/repo";
import { dayOrNull as day, storedDay, daysFrom } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMoney, senFromDecimal } from "@/lib/money";
import { EXECUTED_STATUSES } from "@/lib/payment/eligibility";
import { approvedValue, commencedPending, stageOf } from "@/lib/variation/application";
import { BASE_WORDS, BASIS_WORDS, DIRECTION_WORDS, EXEMPTION_WORDS, ORIGIN_WORDS, STAGE_TONE, STAGE_WORDS, TRIGGER_WORDS, variationFaultText } from "@/lib/variation/labels";
import { adjustmentInProgress, disputeOf, orderNetOf, ordersAdjusted } from "@/lib/variation/load";
import { percentLabel, percentLabelText } from "@/lib/variation/percent";
import { ADJUSTMENT_DIRECTIONS, ADJUSTMENT_TRIGGERS, VARIATION_EXEMPTIONS, VARIATION_ORIGINS } from "@/lib/variation/types";
import type { VariationView } from "@/lib/variation/view";

import { AdjustmentRefusedCallout } from "./adjustment-refused";
import { WithHiddenNote } from "./hidden-note";
import { AdjustmentDrawer, VariationRecordDrawer, type Option } from "./variation-editors";
import type { HiddenAct } from "@/lib/supervision/authority";

/**
 * The contract's Variations tab (6.13 Part A step 4, 4d): its variations from application to certificate, the exposure
 * of those commenced pending approval (FR-VAR-014), the cumulative approved (FR-VAR-024), and the adjustments of the
 * contract sum (FR-PAD-001–003), the only source of the revised sum. Every figure is the pure rule the acts run;
 * every refusal is said beside its button, in the act's own words. Post-award contract figures are Internal, not
 * SULIT (the item-10 ruling): no chip.
 */

const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
const dim = (t: string) => <span className="text-ink-4">{t}</span>;
export const VARIATION_PAGE = 50;

export const VARIATION_SECTIONS = [
  { id: "variations", label: "Variations" },
  { id: "adjustments", label: "Adjustments of the contract sum" },
] as const;
export type VariationSection = (typeof VARIATION_SECTIONS)[number]["id"];

const pct = (num: bigint, den: bigint | null, edges: readonly string[]) => (den && den > 0n ? percentLabelText(percentLabel({ num, den }, edges)).en : null);

/// `hidden`: the acts outside the delegated scope of a representative who is signed in, which their screen does not offer (FR-SUP-004, Phase 3d).
export function VariationsPanel({ l, v, people, today, section, page, hidden = [] }: { l: LoadedContract; v: VariationView; people: Option[]; today: string | null; section: VariationSection; page: number; hidden?: readonly HiddenAct[] }) {
  return (
    <WithHiddenNote hidden={hidden}>
      {section === "adjustments" ? <AdjustmentsSection l={l} v={v} people={people} today={today} hidden={hidden} /> : <VariationsSection l={l} v={v} people={people} today={today} page={page} hidden={hidden} />}
    </WithHiddenNote>
  );
}

/// The contract's position: the original sum, the issued adjustments, the revised sum, the cumulative approved.
function PositionCard({ l, v }: { l: LoadedContract; v: VariationView }) {
  const pending = v.facts.filter(commencedPending);
  const exposure = pending.reduce((a, f) => a + f.estimate, 0n);
  const basis = v.policy?.variationPctBasis ?? null;
  return (
    <Card>
      <CardHeader icon={<ScaleIcon size={17} />} title={<Say words={P.contractSumAndVariations} />} subtitle="Read from issued adjustments" />
      <CardBody className="flex flex-col gap-4">
        {v.refused && <AdjustmentRefusedCallout l={l} refused={v.refused} />}
        <KeyValues
          columns={2}
          items={[
            { label: "Original contract sum (the baseline in force)", value: v.original == null ? dim("No baseline in force today") : formatMoney(v.original) },
            { label: "Issued adjustments, net", value: v.refused ? dim("Not read: see above") : v.issued.length ? `${formatMoney(v.issued.reduce((a, x) => a + x.net, 0n))}, by ${v.issued.length} certificate${v.issued.length === 1 ? "" : "s"}` : dim("None issued") },
            { label: "Revised contract sum", value: v.revised == null ? dim("Not read") : formatMoney(v.revised) },
            {
              label: "Cumulative approved variations",
              value: (
                <span className="flex flex-col items-start gap-1">
                  <span>{`${formatMoney(v.cumulative)}${pct(v.cumulative, v.base, v.edges) ? `, ${pct(v.cumulative, v.base, v.edges)} of ${v.policy?.variationBase === "REVISED" ? "the revised" : "the original"} sum` : ""}`}</span>
                  {basis && v.policy?.variationBase ? (
                    <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
                      {`A variation's percentage: ${BASIS_WORDS[basis].en.toLowerCase()}, over ${BASE_WORDS[v.policy.variationBase].en.toLowerCase()}`}
                      <ProvenanceBadge value={v.policy.variationProvenance ?? null} />
                    </span>
                  ) : (
                    <span className="text-[12.5px] text-amber-800">{variationFaultText({ code: basis ? "VARIATION_BASE_NOT_SET" : "VARIATION_BASIS_NOT_SET", level: "block" })}</span>
                  )}
                </span>
              ),
            },
            { label: "Commenced pending approval", value: pending.length ? `${pending.length}, an exposure of ${formatMoney(exposure)}` : dim("None") },
          ]}
        />
      </CardBody>
    </Card>
  );
}

function VariationsSection({ l, v, people, today, page, hidden }: { l: LoadedContract; v: VariationView; people: Option[]; today: string | null; page: number; hidden: readonly HiddenAct[] }) {
  // ADR 0031 (run 1a): the acts' own table, so the screen refuses where the act would.
  const statusRefused = actStatusFault("VARIATION", l.contract.status as ContractStatus);
  // Review S1: the table first, as the act asks it (cancelled in its own words); every drawer below is gated by it.
  const shut = statusRefused ? actStatusText(statusRefused) : null;
  const blocker = shut ?? (!today ? "Set the organisation's time zone first." : !EXECUTED_STATUSES.includes(l.contract.status) ? variationFaultText({ code: "NOT_EXECUTED", level: "block" }) : null);
  const all = [...v.all].reverse();
  const pages = Math.max(1, Math.ceil(all.length / VARIATION_PAGE));
  const pg = Math.min(page, pages - 1);
  const shown = all.slice(pg * VARIATION_PAGE, (pg + 1) * VARIATION_PAGE);
  const pending = v.facts.filter(commencedPending);
  const rows: Row[] = shown.map((x) => {
    const f = v.facts.find((y) => y.id === x.id)!;
    const stage = stageOf(f);
    const order = x.orders.find((o) => o.certificate.status === "ISSUED") ?? null;
    const dispute = order ? disputeOf(order) : null;
    const chips = [
      { text: STAGE_WORDS[stage].en, ...(TONE[STAGE_TONE[stage]] ? { tone: TONE[STAGE_TONE[stage]] } : {}) },
      ...(x.exemption ? [{ text: "Exempt", tone: "brand" as const }] : []),
      ...(commencedPending(f) ? [{ text: "Commenced pending approval", tone: "warn" as const }] : []),
      ...(dispute ? [{ text: "Disputed by the contractor", tone: "err" as const }] : []),
    ];
    const approved = approvedValue(f);
    return {
      id: x.id,
      views: [stage === "CLOSED" ? "closed" : stage === "CERTIFIED" ? "certified" : "open", ...(commencedPending(f) ? ["pending"] : [])],
      search: [x.reference ?? "", x.description, STAGE_WORDS[stage].en, x.originatorName].join(" "),
      cells: {
        variation: { kind: "link", text: x.reference ? `Variation ${x.reference}` : "Variation (not yet numbered)", href: `/projects/${l.contract.id}/variations/${x.id}`, sub: x.description },
        stage: { kind: "chips", items: chips },
        estimate: { kind: "text", text: formatMoney(senFromDecimal(x.estimate)) },
        approved: order ? { kind: "stack", title: formatMoney(orderNetOf(order)), sub: "Certified" } : approved > 0n ? { kind: "stack", title: formatMoney(approved), sub: "Approved" } : { kind: "text", text: x.exemption ? "Exempt" : "Not approved", dim: true },
      },
    };
  });
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <PositionCard l={l} v={v} />
      {pending.length > 0 && (
        <Callout tone="warn" title="Commenced pending approval">
          {`${pending.map((f) => { const x = v.all.find((y) => y.id === f.id)!; return `${x.reference ?? "a variation"} (${formatMoney(f.estimate)}, since ${formatDate(day(x.commencedOn))}${today && x.commencedOn ? `, ${daysFrom(storedDay(x.commencedOn), today)} days` : ""})`; }).join("; ")}. Their work is not valued on an interim certificate until approved.`}
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<FileIcon size={17} />}
          title={<Say words={P.variations} />}
          actions={hidden.includes("VARIATION_APPLICATION") ? undefined : <VariationRecordDrawer id={l.contract.id} people={people} origins={VARIATION_ORIGINS.map((o) => ({ value: o, label: ORIGIN_WORDS[o].en }))} exemptions={VARIATION_EXEMPTIONS.map((e) => ({ value: e, label: EXEMPTION_WORDS[e].en }))} blocker={blocker} />}
          divided={false}
        />
        <DataList
          flat
          selectable={false}
          exportName="variations"
          searchPlaceholder="Search by number, description or stage"
          emptyTitle="No variations yet"
          views={[
            { id: "open", label: "Open" },
            { id: "pending", label: "Commenced pending approval" },
            { id: "certified", label: "Certified" },
            { id: "closed", label: "Closed" },
          ]}
          rowAction={{ label: "Open", hrefTemplate: `/projects/${l.contract.id}/variations/{id}` }}
          rowOpens
          stackBelow="xl"
          columns={[
            { key: "variation", label: "Variation", mobile: "primary" },
            { key: "stage", label: "Status", width: "240px", mobile: "meta" },
            { key: "estimate", label: "Estimate", width: "140px", numeric: true, mobile: "meta" },
            { key: "approved", label: "Approved or certified", width: "170px", numeric: true, mobile: "meta" },
          ]}
          rows={rows}
        />
        {pages > 1 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span>{`${pg * VARIATION_PAGE + 1}–${Math.min(all.length, (pg + 1) * VARIATION_PAGE)} of ${all.length} · Search covers this page`}</span>
            <span className="flex gap-2">
              {pg > 0 && <ButtonLink href={`/projects/${l.contract.id}?tab=variations&section=variations&page=${pg - 1}`} size="sm" variant="ghost">Previous</ButtonLink>}
              {pg + 1 < pages && <ButtonLink href={`/projects/${l.contract.id}?tab=variations&section=variations&page=${pg + 1}`} size="sm" variant="ghost">Next</ButtonLink>}
            </span>
          </CardFooter>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

function AdjustmentsSection({ l, v, people, today, hidden }: { l: LoadedContract; v: VariationView; people: Option[]; today: string | null; hidden: readonly HiddenAct[] }) {
  const issuedOrders = v.all.flatMap((x) => x.orders.filter((o) => o.certificate.status === "ISSUED").map((o) => ({ x, o })));
  const adjusted = new Set(ordersAdjusted(v.adjustments));
  const free = issuedOrders.filter(({ o }) => !adjusted.has(o.id));
  const inProg = adjustmentInProgress(v.adjustments);
  // The act's own rule on what does not depend on the drawer's answers: one at a time, the form set.
  const pre = adjustmentFaults({ triggers: ["VARIATION"], lines: [], ordersAdjusted: [], ordersIssued: [], inProgress: inProg ? `The adjustment${inProg.certificate.number ? ` ${inProg.certificate.number}` : ""}` : null, original: v.original ?? 1n, prior: [] }).filter((f) => f.code === "ADJUSTMENT_IN_PROGRESS");
  const statusRefused = actStatusFault("SUM_ADJUSTMENT", l.contract.status as ContractStatus);
  // Review S1: the table first, as the act asks it (cancelled in its own words); every drawer below is gated by it.
  const shut = statusRefused ? actStatusText(statusRefused) : null;
  const blocker = shut ?? (!today ? "Set the organisation's time zone first." : pre.length ? pre.map(variationFaultText).join(" ") : !v.formSet("SUM_ADJUSTMENT") ? variationFaultText(noFormFault("SUM_ADJUSTMENT")) : null);
  const issued = v.issued;
  return (
    <ActGate blocker={shut}>
    <div className="flex flex-col gap-6">
      <PositionCard l={l} v={v} />
      <Card className="overflow-hidden">
        <CardHeader
          icon={<WalletIcon size={17} />}
          title={<Say words={P.adjustmentsOfContractSum} />}
          subtitle="Movement of the contract sum"
          actions={
            hidden.includes("VALUATION") ? undefined : (
            <AdjustmentDrawer
              id={l.contract.id}
              orders={free.map(({ x, o }) => ({ value: o.id, label: `Variation ${x.reference}: ${DIRECTION_WORDS[orderNetOf(o) < 0n ? "OMISSION" : "ADDITION"].en.toLowerCase()} ${formatMoney(orderNetOf(o) < 0n ? -orderNetOf(o) : orderNetOf(o))}` }))}
              triggers={ADJUSTMENT_TRIGGERS.filter((t) => t !== "VARIATION").map((t) => ({ value: t, label: TRIGGER_WORDS[t].en }))}
              directions={ADJUSTMENT_DIRECTIONS.map((d) => ({ value: d, label: DIRECTION_WORDS[d].en }))}
              people={people}
              blocker={blocker}
            />
            )
          }
        />
        {v.adjustments.length === 0 ? (
          <EmptyState size="sm" title={free.length ? `${free.length} issued Variation Order Certificate${free.length === 1 ? " waits" : "s wait"}` : "None raised"} />
        ) : (
          <ul className="divide-y divide-line/70">
            {[...v.adjustments].reverse().map((a) => {
              const status = a.certificate.status as CertificateStatus;
              const net = issued.find((x) => x.id === a.id)?.net ?? null;
              const total = a.lines.reduce((acc, x) => acc + (x.direction === "ADDITION" ? 1n : -1n) * senFromDecimal(x.amount), 0n);
              return (
                <li key={a.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold break-words text-ink">
                      <Link className="hover:underline" href={`/projects/${l.contract.id}/certificates/${a.certificate.id}`}>{a.certificate.number ? `Adjustment ${a.certificate.number}` : "Adjustment of the contract sum (not yet numbered)"}</Link>
                      <Badge tone={TONE[CERT_TONE[status]]} dot>{CERT_WORDS[status].en}</Badge>
                    </span>
                    <span className="block text-[12.5px] break-words text-ink-3">{a.lines.map((x) => `${x.section === "VARIATION" ? "1.1" : "1.2"} ${x.reference}: ${DIRECTION_WORDS[x.direction].en.toLowerCase()} ${formatMoney(senFromDecimal(x.amount))}${x.section === "OTHER" ? ` (${TRIGGER_WORDS[x.trigger].en.toLowerCase()})` : ""}`).join("; ")}</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-ink-2 sm:text-right">{status === "ISSUED" && net == null ? dim("Net not read") : `Net ${formatMoney(net ?? total)}${status === "ISSUED" ? ", issued" : ""}`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
    </ActGate>
  );
}

/// The Overview's variations card: the cumulative, the revised sum and what is pending (null where there is nothing).
export function VariationSummaryCard({ l, v }: { l: LoadedContract; v: VariationView }) {
  if (v.all.length === 0 && v.adjustments.length === 0) return null;
  const pending = v.facts.filter(commencedPending);
  const open = v.facts.filter((f) => !["CLOSED", "CERTIFIED"].includes(stageOf(f))).length;
  return (
    <Card>
      <CardHeader icon={<ScaleIcon size={17} />} title={<Say words={P.variations} />} actions={<ButtonLink href={`/projects/${l.contract.id}?tab=variations&section=variations`} size="sm" variant="secondary">Open variations</ButtonLink>} />
      <CardBody className="flex flex-col gap-4">
        {v.refused && <AdjustmentRefusedCallout l={l} refused={v.refused} />}
        <KeyValues
          columns={2}
          items={[
            { label: "Variations", value: `${v.all.length}, ${open} open` },
            { label: "Cumulative approved", value: formatMoney(v.cumulative) },
            { label: "Revised contract sum", value: v.revised == null ? dim("Not read") : formatMoney(v.revised) },
            { label: "Commenced pending approval", value: pending.length ? `${pending.length}, ${formatMoney(pending.reduce((a, f) => a + f.estimate, 0n))}` : dim("None") },
          ]}
        />
      </CardBody>
    </Card>
  );
}
