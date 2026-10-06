import type { ReactNode } from "react";

import { decimalText } from "@/lib/format";
import { BuildingIcon, ClockIcon, FileIcon, ScaleIcon, WalletIcon } from "@/components/icons";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { KIND_WORDS } from "@/lib/certificate/labels";
import { db } from "@/lib/db";
import { CLOCK_WORDS, REMAINDER_WORDS, ROUTE_FIGURE_WORDS } from "@/lib/payment/labels";
import { MINIMUM_MEASURE_WORDS } from "@/lib/payment/minimum";
import { CONTRACT_CLOCKS, PAYMENT_ROUTE_FIGURES, WATERFALL_REMAINDERS, type ContractClock } from "@/lib/payment/types";
import { exerciseOrg } from "@/lib/method/repo";
import { loadPostAwardPolicy } from "@/lib/supervision/load";
import { BASE_WORDS, BASIS_WORDS, SCHEDULE_FORM_WORDS } from "@/lib/variation/labels";
import { SCHEDULE_FORMS, VARIATION_BASES, VARIATION_PCT_BASES } from "@/lib/variation/types";

import { EditClockRule, EditKindSetting, EditPaymentPolicy, EditPostAwardPolicy, EditVariationPolicy } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

/// The certificates the payment and damages chain raises, each on its configured form (the acts' own list).
const PAYMENT_KINDS = ["INTERIM_PAYMENT", "ADVANCE_PAYMENT", "LAD_WARNING", "NON_COMPLETION"] as const;
/// The certificates the variations and the adjustment of the contract sum raise (6.13 Part A step 4).
const VARIATION_KINDS = ["VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] as const;
/// What an unset clock does, in words.
const CLOCK_UNSET: Readonly<Record<ContractClock, string>> = {
  ORAL_CONFIRM: "An instruction first given orally shows no day the contractor's confirmation is due by: the screen says the clock is not set (advisory).",
  ORAL_OBJECTION: "A confirmed oral instruction shows no day an objection is due by: the screen says the clock is not set (advisory).",
  DAYWORK_SUBSTANTIATION: "A daywork record shows no day its substantiation is due by, and lateness is not judged: the screen says the clock is not set.",
  LAD_WARNING_RESPONSE: "A damages warning gives no date for the contractor's reasons: the screen says the clock is not set.",
  CERT_ISSUE: "A valuation shows no date its certificate is due by: the screen says the clock is not set.",
};
const UNIT_WORDS = { DAYS: "calendar days", WEEKS: "weeks", MONTHS: "months" } as const;

export const dynamic = "force-dynamic";

/// A setting's value, or "Not set" and what that stops.
function Setting({ value, unset, provenance }: { value: ReactNode | null; unset: string; provenance?: string | null }) {
  if (value != null && value !== "")
    return (
      <span className="flex flex-col items-start gap-1.5">
        <span>{value}</span>
        <ProvenanceBadge value={provenance ?? null} />
      </span>
    );
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{unset}</span>
    </span>
  );
}

/**
 * Post-award controls (6.13 Part A): when a contract is In Delay, whether its S.O. follows the contract sum across
 * a band (OD-A7), and the forms the delegation letters print on. Everything ships unset; nothing is assumed.
 */
export default async function PostAwardControlsPage() {
  await requireStaff();
  const org = await exerciseOrg();
  if (!org) {
    return (
      <>
        <PageHeader title="Post-award controls" subtitle="How a contract is supervised after it is executed." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const [p, templates, kinds, clocks, sheets, committees] = await Promise.all([
    loadPostAwardPolicy(org.id),
    db.documentTemplate.findMany({ where: { organisationId: org.id }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { id: true, nameEn: true, formCode: true } }),
    db.certificateKindSetting.findMany({ where: { organisationId: org.id }, include: { routingType: { select: { labelEn: true, retiredOn: true } } } }),
    db.contractClockRule.findMany({ where: { organisationId: org.id } }),
    db.routingSheetType.findMany({ where: { organisationId: org.id, subject: "CERTIFICATE", retiredOn: null }, orderBy: [{ sortOrder: "asc" }, { labelEn: "asc" }], select: { id: true, labelEn: true, certificateKind: true } }),
    db.committee.findMany({ where: { organisationId: org.id, retiredOn: null }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true } }),
  ]);
  const committeeName = (id: string | null | undefined) => (id ? (committees.find((x) => x.id === id)?.nameEn ?? "A committee no longer configured") : null);
  const variationValues = {
    variationPctBasis: p?.variationPctBasis ?? null,
    variationBase: p?.variationBase ?? null,
    variationProvenance: p?.variationProvenance ?? null,
    scheduleFormAgreedRate: p?.scheduleFormAgreedRate ?? null,
    scheduleFormNoAgreedRate: p?.scheduleFormNoAgreedRate ?? null,
    scheduleFormProvenance: p?.scheduleFormProvenance ?? null,
    funderConsentCommitteeId: p?.funderConsentCommitteeId ?? null,
    funderConsentProvenance: p?.funderConsentProvenance ?? null,
  };
  const formName = (id: string | null | undefined) => (id ? (templates.find((t) => t.id === id)?.nameEn ?? "A form no longer configured") : null);
  const pct = decimalText(p?.inDelayProgressPct);
  const materials = decimalText(p?.unfixedMaterialsDefaultPct);
  const firstRelease = decimalText(p?.firstReleasePct);
  const kindOf = (k: string) => kinds.find((x) => x.kind === k) ?? null;
  const clockOf = (k: string) => clocks.find((x) => x.clock === k) ?? null;
  const unset =
    [pct, p?.soReResolve ?? null, p?.delegationLetterConventionalId, p?.delegationNoticeConventionalId, p?.delegationLetterDesignBuildId, p?.delegationNoticeDesignBuildId, materials, firstRelease, p?.paymentRouteFigure, p?.waterfallRemainder, p?.preExecutionInterimLimit].filter((x) => x == null).length +
    [p?.variationPctBasis, p?.variationBase, p?.scheduleFormAgreedRate, p?.scheduleFormNoAgreedRate, p?.funderConsentCommitteeId].filter((x) => x == null).length +
    [...PAYMENT_KINDS, ...VARIATION_KINDS].filter((k) => !kindOf(k)?.templateId).length +
    CONTRACT_CLOCKS.filter((k) => !clockOf(k)).length;
  const paymentValues = {
    unfixedMaterialsDefaultPct: materials,
    unfixedMaterialsProvenance: p?.unfixedMaterialsProvenance ?? null,
    firstReleasePct: firstRelease,
    firstReleaseProvenance: p?.firstReleaseProvenance ?? null,
    paymentRouteFigure: p?.paymentRouteFigure ?? null,
    paymentRouteProvenance: p?.paymentRouteProvenance ?? null,
    waterfallRemainder: p?.waterfallRemainder ?? null,
    waterfallProvenance: p?.waterfallProvenance ?? null,
    preExecutionInterimLimit: p?.preExecutionInterimLimit == null ? null : String(p.preExecutionInterimLimit),
    preExecutionProvenance: p?.preExecutionProvenance ?? null,
  };
  const values = {
    inDelayProgressPct: pct,
    inDelayProvenance: p?.inDelayProvenance ?? null,
    soReResolve: p?.soReResolve == null ? null : p.soReResolve ? "yes" : "no",
    soReResolveProvenance: p?.soReResolveProvenance ?? null,
    delegationLetterConventionalId: p?.delegationLetterConventionalId ?? null,
    delegationNoticeConventionalId: p?.delegationNoticeConventionalId ?? null,
    delegationLetterDesignBuildId: p?.delegationLetterDesignBuildId ?? null,
    delegationNoticeDesignBuildId: p?.delegationNoticeDesignBuildId ?? null,
    delegationFormsProvenance: p?.delegationFormsProvenance ?? null,
    notes: p?.notes ?? "",
  };
  const forms = templates.map((t) => ({ value: t.id, label: t.formCode ? `${t.nameEn} (${t.formCode})` : t.nameEn }));
  const formUnset = "A delegation on a contract of this kind is refused, naming this setting.";
  return (
    <>
      <PageHeader
        title="Post-award controls"
        badge={unset > 0 ? <Badge tone="warn" dot>{`${unset} not set`}</Badge> : <Badge tone="ok" dot>All set</Badge>}
        subtitle="Supervision, the delegation letters, interim payments and damages, and variations."
        actions={
          <>
            {p?.id && <HistoryButton entity="PostAwardPolicy" entityId={p.id} label="Post-award controls" />}
            <EditPostAwardPolicy values={values} forms={forms} />
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<BuildingIcon size={17} />} title="Supervising a contract" subtitle="Read on every contract each time it is judged." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "In Delay", value: <Setting value={pct ? `Below ${pct}% of the approved programme's planned progress. Exactly on it is not below it.` : null} provenance={p?.inDelayProvenance} unset="Progress is not judged against the plan: each contract says In Delay is not judged. A lapsed completion date with the work incomplete is In Delay all the same." /> },
                { label: "The S.O. and the contract sum", value: <Setting value={p?.soReResolve == null ? null : p.soReResolve ? "Resolved again when an adjustment moves the sum across a band." : "Stays as resolved when the sum moves."} provenance={p?.soReResolveProvenance} unset="Not decided: each contract and each S.O. signature block warns that the office shown is the one resolved for it." /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Delegation letters" subtitle="The letter of delegation and its notification, by the contract type's kind of letters. Each delegation opens both as certificates on these forms." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Letter, conventional contracts", value: <Setting value={formName(p?.delegationLetterConventionalId)} provenance={p?.delegationFormsProvenance} unset={formUnset} /> },
                { label: "Notification, conventional contracts", value: <Setting value={formName(p?.delegationNoticeConventionalId)} provenance={p?.delegationFormsProvenance} unset={formUnset} /> },
                { label: "Letter, design and build and turnkey", value: <Setting value={formName(p?.delegationLetterDesignBuildId)} provenance={p?.delegationFormsProvenance} unset={formUnset} /> },
                { label: "Notification, design and build and turnkey", value: <Setting value={formName(p?.delegationNoticeDesignBuildId)} provenance={p?.delegationFormsProvenance} unset={formUnset} /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<WalletIcon size={17} />} title="Interim payment" subtitle="Read when a valuation is worked out, sent for approval and issued. A contract's own figure, from its baseline, wins where it has one." actions={<EditPaymentPolicy values={paymentValues} figures={PAYMENT_ROUTE_FIGURES.map((f) => ({ value: f, label: ROUTE_FIGURE_WORDS[f].en }))} remainders={WATERFALL_REMAINDERS.map((f) => ({ value: f, label: REMAINDER_WORDS[f].en }))} />} />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Allowance on unfixed materials", value: <Setting value={materials ? `${materials}% of their value, where the contract states none` : null} provenance={p?.unfixedMaterialsProvenance} unset="A materials line on a contract that states no allowance is refused, naming this setting. It is never taken as nothing." /> },
                { label: "First release of retention", value: <Setting value={firstRelease ? `${firstRelease}% of what is held, at practical completion` : null} provenance={p?.firstReleaseProvenance} unset="The first release of retention is refused, naming this setting." /> },
                { label: "The figure an interim certificate is routed on", value: <Setting value={p?.paymentRouteFigure ? ROUTE_FIGURE_WORDS[p.paymentRouteFigure].en : null} provenance={p?.paymentRouteProvenance} unset="An interim certificate cannot be sent for approval: the refusal names this setting." /> },
                { label: "Where the sen of a pro-rata split go", value: <Setting value={p?.waterfallRemainder ? REMAINDER_WORDS[p.waterfallRemainder].en : null} provenance={p?.waterfallProvenance} unset="A certificate that cannot pay every nominated party and assignee in full, and leaves sen over, is refused." /> },
                { label: "The certificate's minimum", value: <span className="flex flex-col items-start gap-1.5"><span>{`From each contract's baseline: ${MINIMUM_MEASURE_WORDS.first.en}, ${MINIMUM_MEASURE_WORDS.subsequent.en}.`}</span><ProvenanceBadge value="ASSUMED" /><span className="text-[12.5px] text-ink-3">{`The measure is ${MINIMUM_MEASURE_WORDS.assumed.en}.`}</span></span> },
                { label: "Interim certificates before the contract is signed", value: <Setting value={p?.preExecutionInterimLimit == null ? null : p.preExecutionInterimLimit === 0 ? "None" : `Up to ${p.preExecutionInterimLimit}, with the securities, insurances and social security registration in place`} provenance={p?.preExecutionProvenance} unset="None issues before the contract is executed; one raised says so." /> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Payment and damages certificates" subtitle="The form each prints on, and the routing sheet it goes on before it is signed." />
          <CardBody>
            <KeyValues
              columns={2}
              items={PAYMENT_KINDS.map((k) => {
                const x = kindOf(k);
                const sheetsFor = sheets.filter((t) => t.certificateKind == null || t.certificateKind === k).map((t) => ({ value: t.id, label: t.labelEn }));
                const sheet = x?.routingType ? `${x.routingType.labelEn}${x.routingType.retiredOn ? " (retired: choose one in use)" : ""}` : "No routing sheet";
                return {
                  label: (
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span>{KIND_WORDS[k].en}</span>
                      <EditKindSetting kind={k} label={KIND_WORDS[k].en} values={{ templateId: x?.templateId ?? null, routingTypeId: x?.routingTypeId ?? null, provenance: x?.provenance ?? null, notes: x?.notes ?? "" }} forms={forms} sheets={sheetsFor} />
                    </span>
                  ),
                  value: <Setting value={x?.templateId ? `${formName(x.templateId)} · ${sheet}` : null} provenance={x?.provenance} unset="It cannot be raised: the refusal names this setting." />,
                };
              })}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Variations" subtitle="Read when a variation is submitted, sent for approval and instructed. A setting changed later moves nothing already sent: each route keeps the reading it was sent on." actions={<EditVariationPolicy values={variationValues} bases={VARIATION_PCT_BASES.map((b) => ({ value: b, label: BASIS_WORDS[b].en }))} sums={VARIATION_BASES.map((b) => ({ value: b, label: BASE_WORDS[b].en }))} forms={SCHEDULE_FORMS.map((f) => ({ value: f, label: SCHEDULE_FORM_WORDS[f].en }))} committees={committees.map((x) => ({ value: x.id, label: x.nameEn }))} />} />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "A variation's percentage is of", value: <Setting value={p?.variationPctBasis ? BASIS_WORDS[p.variationPctBasis].en : null} provenance={p?.variationProvenance} unset="A variation cannot be submitted or sent for approval: the refusal names this setting. Nothing is assumed." /> },
                { label: "Taken over (and the contract value its band is read at)", value: <Setting value={p?.variationBase ? BASE_WORDS[p.variationBase].en : null} provenance={p?.variationProvenance} unset="A variation cannot be submitted or sent for approval: the refusal names this setting. Nothing is assumed." /> },
                { label: "The schedule form where an agreed rate exists", value: <Setting value={p?.scheduleFormAgreedRate ? SCHEDULE_FORM_WORDS[p.scheduleFormAgreedRate].en : null} provenance={p?.scheduleFormProvenance} unset="The instruction of a variation with an agreed rate is refused, naming this setting." /> },
                { label: "The schedule form where none does", value: <Setting value={p?.scheduleFormNoAgreedRate ? SCHEDULE_FORM_WORDS[p.scheduleFormNoAgreedRate].en : null} provenance={p?.scheduleFormProvenance} unset="The instruction of a variation without an agreed rate is refused, naming this setting." /> },
                { label: "The committee that decides a funder's consent", value: <Setting value={committeeName(p?.funderConsentCommitteeId)} provenance={p?.funderConsentProvenance} unset="A variation affecting a funder's assets cannot be tabled for consent, so it is not instructed." /> },
                { label: "Where a variation the S.O. does not support goes", value: <span className="text-[13px] text-ink-2">As the rejection destinations under Configuration › Approval matrix say for a variation; where none is set, the officer says where (back to its originator, or it ends) when recording the decision.</span> },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Variation and adjustment certificates" subtitle="The form each prints on, and the routing sheet it goes on. The application is opened when its prior approval is approved, on its form where set." />
          <CardBody>
            <KeyValues
              columns={2}
              items={VARIATION_KINDS.map((k) => {
                const x = kindOf(k);
                const sheetsFor = sheets.filter((t) => t.certificateKind == null || t.certificateKind === k).map((t) => ({ value: t.id, label: t.labelEn }));
                const sheet = k !== "SUM_ADJUSTMENT" ? "Approved on the variation's own routes (no routing sheet)" : x?.routingType ? `${x.routingType.labelEn}${x.routingType.retiredOn ? " (retired: choose one in use)" : ""}` : "No routing sheet";
                return {
                  label: (
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span>{KIND_WORDS[k].en}</span>
                      <EditKindSetting kind={k} label={KIND_WORDS[k].en} values={{ templateId: x?.templateId ?? null, routingTypeId: x?.routingTypeId ?? null, provenance: x?.provenance ?? null, notes: x?.notes ?? "" }} forms={forms} sheets={sheetsFor} noSheet={k !== "SUM_ADJUSTMENT"} />
                    </span>
                  ),
                  value: <Setting value={x?.templateId ? `${formName(x.templateId)} · ${sheet}` : null} provenance={x?.provenance} unset="It cannot be raised: the refusal names this setting." />,
                };
              })}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<ClockIcon size={17} />} title="Contract clocks" subtitle="How long each period under the contract runs. A screen with an unset clock says so rather than counting from a guess." />
          <CardBody>
            <KeyValues
              columns={2}
              items={CONTRACT_CLOCKS.map((k) => {
                const x = clockOf(k);
                return {
                  label: (
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span>{CLOCK_WORDS[k].en}</span>
                      <EditClockRule clock={k} label={CLOCK_WORDS[k].en} values={{ length: x ? String(x.length) : null, unit: x?.unit ?? null, provenance: x?.provenance ?? null, notes: x?.notes ?? "" }} />
                    </span>
                  ),
                  value: <Setting value={x ? `${x.length} ${UNIT_WORDS[x.unit]}` : null} provenance={x?.provenance} unset={CLOCK_UNSET[k]} />,
                };
              })}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
