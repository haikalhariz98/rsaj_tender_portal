import { decimalText } from "@/lib/format";
import { BuildingIcon, ClockIcon, FileIcon, ScaleIcon, WalletIcon } from "@/components/icons";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { RuleInfo } from "@/components/ui/rule-info";
import { MoreText } from "@/components/ui/more-text";
import { Disclosure } from "@/components/ui/disclosure";
import { SettingValue, settingLine } from "@/components/setup/setting-value";
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


import { EditClockRule, EditContractorPortalSigning, EditKindSetting, EditPaymentPolicy, EditPostAwardPolicy, EditTimePolicy, EditVariationPolicy } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

/// The certificates the payment and damages chain raises, each on its configured form (the acts' own list).
const PAYMENT_KINDS = ["INTERIM_PAYMENT", "ADVANCE_PAYMENT", "LAD_WARNING", "NON_COMPLETION"] as const;
/// The certificates the variations and the adjustment of the contract sum raise (6.13 Part A step 4).
const VARIATION_KINDS = ["VARIATION_APPLICATION", "SO_INSTRUCTION", "VARIATION", "SUM_ADJUSTMENT"] as const;
/// Phase 2 close-out stage A: the certificates the extensions raise, approved on their matter's own route.
const TIME_KINDS = ["EOT", "CONTRACT_PERIOD_AGREEMENT"] as const;
/// What an unset clock does, in words.
const CLOCK_UNSET: Readonly<Record<ContractClock, string>> = {
  ORAL_CONFIRM: "An instruction first given orally shows no day the contractor's confirmation is due by: the screen says the clock is not set (advisory).",
  ORAL_OBJECTION: "A confirmed oral instruction shows no day an objection is due by: the screen says the clock is not set (advisory).",
  DAYWORK_SUBSTANTIATION: "A daywork record shows no day its substantiation is due by, and lateness is not judged: the screen says the clock is not set.",
  LAD_WARNING_RESPONSE: "A damages warning gives no date for the contractor's reasons: the screen says the clock is not set.",
  CERT_ISSUE: "A valuation shows no date its certificate is due by: the screen says the clock is not set.",
  DEFECTS_RECTIFICATION: "A Schedule of Defects may give any day to make good by: the longest period is not checked, and the schedule says so.",
};
const UNIT_WORDS = { DAYS: "calendar days", WEEKS: "weeks", MONTHS: "months" } as const;

export const dynamic = "force-dynamic";
export const metadata = { title: "Post-award controls" };

/**
 * Post-award controls (6.13 Part A): when a contract is In Delay, whether its S.O. follows the contract sum across
 * a band (OD-A7), and the forms the delegation letters print on. Everything ships unset; nothing is assumed.
 */
export default async function PostAwardControlsPage() {
  const actor = await requireStaff();
  const org = await exerciseOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        <PageHeader title="Post-award controls" info={{ title: "Post-award controls", text: "How a contract is supervised after it is executed." }} />
        <Card>
          <EmptyState title="No organisation is configured" />
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
    [p?.variationPctBasis, p?.variationBase, p?.scheduleFormAgreedRate, p?.scheduleFormNoAgreedRate, p?.funderConsentCommitteeId, p?.contractorPortalSigning].filter((x) => x == null).length +
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
  const editPolicy = <EditPostAwardPolicy values={values} forms={forms} />;
  const editPayment = <EditPaymentPolicy values={paymentValues} figures={PAYMENT_ROUTE_FIGURES.map((f) => ({ value: f, label: ROUTE_FIGURE_WORDS[f].en }))} remainders={WATERFALL_REMAINDERS.map((f) => ({ value: f, label: REMAINDER_WORDS[f].en }))} />;
  const editVariation = <EditVariationPolicy values={variationValues} bases={VARIATION_PCT_BASES.map((b) => ({ value: b, label: BASIS_WORDS[b].en }))} sums={VARIATION_BASES.map((b) => ({ value: b, label: BASE_WORDS[b].en }))} forms={SCHEDULE_FORMS.map((f) => ({ value: f, label: SCHEDULE_FORM_WORDS[f].en }))} committees={committees.map((x) => ({ value: x.id, label: x.nameEn }))} />;
  /// A value with the one-line reading behind it in a popover; usual practice or an assumption is flagged there (SP-18).
  const read = (value: string | null, rule: string, provenance?: string | null, unset?: string) =>
    value == null ? (
      <SettingValue value={null} unset={unset ?? ""} />
    ) : (
      <span className="inline-flex items-center gap-1">
        {value}
        {(rule || provenance === "OBSERVED" || provenance === "ASSUMED") && <RuleInfo rule={rule} source={provenance} label="How this is read" />}
      </span>
    );
  const certificateLines = (kindsList: readonly (typeof PAYMENT_KINDS)[number][] | readonly (typeof VARIATION_KINDS)[number][] | readonly (typeof TIME_KINDS)[number][]) =>
    kindsList.map((k) => {
      const x = kindOf(k);
      const sheetsFor = sheets.filter((t) => t.certificateKind == null || t.certificateKind === k).map((t) => ({ value: t.id, label: t.labelEn }));
      const matter = k === "EOT" || k === "CONTRACT_PERIOD_AGREEMENT";
      const own = k === "VARIATION_APPLICATION" || k === "SO_INSTRUCTION" || k === "VARIATION" || matter;
      const sheet = matter ? "Approved on its matter's route" : own ? "Approved on the variation's own routes" : x?.routingType ? `${x.routingType.labelEn}${x.routingType.retiredOn ? " (retired: choose one in use)" : ""}` : "No routing sheet";
      return settingLine(KIND_WORDS[k].en, <SettingValue value={x?.templateId ? `${formName(x.templateId)} · ${sheet}` : null} unset="It cannot be raised: the refusal names this setting." />, <EditKindSetting kind={k} label={KIND_WORDS[k].en} values={{ templateId: x?.templateId ?? null, routingTypeId: x?.routingTypeId ?? null, provenance: x?.provenance ?? null, notes: x?.notes ?? "" }} forms={forms} sheets={sheetsFor} noSheet={own} />);
    });

  return (
    <>
      <PageHeader
        title="Post-award controls"
        badge={unset > 0 ? <Badge tone="warn" dot>{`${unset} not set`}</Badge> : <Badge tone="ok" dot>All set</Badge>}
        info={{ title: "Post-award controls", text: "Supervision, the delegation letters, interim payments and damages, and variations." }}
        actions={p?.id && <HistoryButton entity="PostAwardPolicy" entityId={p.id} label="Post-award controls" />}
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<BuildingIcon size={17} />} title="Supervising a contract" />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                settingLine("In Delay", read(pct ? `Below ${pct}% of planned progress` : null, "Below the set share of the approved programme's planned progress. Exactly on it is not below it.", p?.inDelayProvenance, "Progress is not judged against the plan. A lapsed completion date with the work incomplete is In Delay all the same."), editPolicy),
                settingLine("The S.O. and the contract sum", read(p?.soReResolve == null ? null : p.soReResolve ? "Resolved again across a band" : "Stays as resolved", "When an adjustment moves the contract sum across a band, the S.O. is either resolved again at the new sum or kept.", p?.soReResolveProvenance, "Not decided: each contract and S.O. signature block warns that the office shown is the one resolved for it.")),
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<WalletIcon size={17} />} title="Interim payment" />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                settingLine("Allowance on unfixed materials", read(materials ? `${materials}%` : null, "Of their value, where the contract states no allowance of its own.", p?.unfixedMaterialsProvenance, "A materials line on a contract that states no allowance is refused. It is never taken as nothing."), editPayment),
                settingLine("First release of retention", read(firstRelease ? `${firstRelease}%` : null, "The share of what is held, released at practical completion.", p?.firstReleaseProvenance, "The first release of retention is refused, naming this setting.")),
                settingLine("Figure an interim certificate is routed on", read(p?.paymentRouteFigure ? ROUTE_FIGURE_WORDS[p.paymentRouteFigure].en : null, "A contract's own baseline figure wins.", p?.paymentRouteProvenance, "An interim certificate cannot be sent for approval.")),
                settingLine("Odd sen when a payment is shared", read(p?.waterfallRemainder ? REMAINDER_WORDS[p.waterfallRemainder].en : null, "Where the sen left over go when a payment is split between parties.", p?.waterfallProvenance, "A certificate that cannot pay every party in full, and leaves sen over, is refused.")),
                settingLine("The certificate's minimum", <span className="inline-flex items-center gap-1">{"From each contract's baseline"}<RuleInfo rule={`${MINIMUM_MEASURE_WORDS.first.en}, ${MINIMUM_MEASURE_WORDS.subsequent.en}. The measure is ${MINIMUM_MEASURE_WORDS.assumed.en}.`} source="ASSUMED" label="How the minimum is read" /></span>),
                settingLine("Interim certificates before signing", read(p?.preExecutionInterimLimit == null ? null : p.preExecutionInterimLimit === 0 ? "None" : `Up to ${p.preExecutionInterimLimit}`, "Allowed only with the securities, insurances and social security registration in place.", p?.preExecutionProvenance, "None issues before the contract is executed; one raised says so.")),
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<ScaleIcon size={17} />} title="Variations" />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                settingLine("A variation's percentage is of", read(p?.variationPctBasis ? BASIS_WORDS[p.variationPctBasis].en : null, "A change moves nothing already sent.", p?.variationProvenance, "A variation cannot be submitted or sent for approval. Nothing is assumed."), editVariation),
                settingLine("Taken over (and the value its band is read at)", read(p?.variationBase ? BASE_WORDS[p.variationBase].en : null, "Also the contract value the approval band is read at.", p?.variationProvenance, "A variation cannot be submitted or sent for approval. Nothing is assumed.")),
                settingLine("Schedule form where an agreed rate exists", read(p?.scheduleFormAgreedRate ? SCHEDULE_FORM_WORDS[p.scheduleFormAgreedRate].en : null, "The form the instruction of a variation with an agreed rate uses.", p?.scheduleFormProvenance, "The instruction of a variation with an agreed rate is refused.")),
                settingLine("Schedule form where none does", read(p?.scheduleFormNoAgreedRate ? SCHEDULE_FORM_WORDS[p.scheduleFormNoAgreedRate].en : null, "The form the instruction of a variation without an agreed rate uses.", p?.scheduleFormProvenance, "The instruction of a variation without an agreed rate is refused.")),
                settingLine("Committee that decides a funder's consent", read(committeeName(p?.funderConsentCommitteeId), "Decides a variation that affects a funder's assets.", p?.funderConsentProvenance, "A variation affecting a funder's assets cannot be tabled for consent, so it is not instructed.")),
                settingLine("Where a variation the S.O. does not support goes", <span className="inline-flex items-center gap-1">Set on the approval matrix<MoreText text="As the rejection destinations under Settings, Approvals, Approval matrix say for a variation. Where none is set, the officer says where (back to its originator, or it ends) when recording the decision." label="Where it goes" /></span>),
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<ClockIcon size={17} />} title="Time and damages" />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                settingLine("An approved waiver of damages is applied", read(p?.ladWaiverApplication === "NEXT_CERTIFICATE" ? "On the next interim certificate" : p?.ladWaiverApplication === "FINAL_ACCOUNT" ? "In the final account" : null, "Never applied twice.", p?.ladWaiverProvenance, "An approved waiver is not applied. Each one says so."), <EditTimePolicy values={{ ladWaiverApplication: p?.ladWaiverApplication ?? null, ladWaiverProvenance: p?.ladWaiverProvenance ?? null, ladAntiOppressionDays: p?.ladAntiOppressionDays == null ? null : String(p.ladAntiOppressionDays), ladAntiOppressionProvenance: p?.ladAntiOppressionProvenance ?? null, weatherGuidance: p?.weatherGuidance ?? null, weatherGuidanceProvenance: p?.weatherGuidanceProvenance ?? null }} />),
                settingLine("Alert when damages have run longer than", read(p?.ladAntiOppressionDays == null ? null : `${p.ladAntiOppressionDays} days`, "Counted per decision from its first day charged.", p?.ladAntiOppressionProvenance, "No alert is raised.")),
                settingLine("Guidance on a weather claim", read(p?.weatherGuidance ?? null, "Shown to the officer answering a weather claim.", p?.weatherGuidanceProvenance, "None is shown.")),
              ]}
            />
          </CardBody>
        </Card>

        <Disclosure id="advanced" title="Advanced" summary="Delegation letters, certificate forms, portal signing, clocks">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader icon={<FileIcon size={17} />} title="Delegation letters" />
              <CardBody>
                <KeyValues
                  columns={2}
                  items={[
                    settingLine("Letter, conventional contracts", read(formName(p?.delegationLetterConventionalId), "", p?.delegationFormsProvenance, formUnset), editPolicy),
                    settingLine("Notification, conventional contracts", read(formName(p?.delegationNoticeConventionalId), "", p?.delegationFormsProvenance, formUnset)),
                    settingLine("Letter, design and build and turnkey", read(formName(p?.delegationLetterDesignBuildId), "", p?.delegationFormsProvenance, formUnset)),
                    settingLine("Notification, design and build and turnkey", read(formName(p?.delegationNoticeDesignBuildId), "", p?.delegationFormsProvenance, formUnset)),
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<FileIcon size={17} />} title="Payment and damages certificates" />
              <CardBody>
                <KeyValues columns={2} items={certificateLines(PAYMENT_KINDS)} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<FileIcon size={17} />} title="Variation and adjustment certificates" />
              <CardBody>
                <KeyValues columns={2} items={certificateLines(VARIATION_KINDS)} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<FileIcon size={17} />} title="Extension certificates" />
              <CardBody>
                <KeyValues columns={2} items={certificateLines(TIME_KINDS)} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<ClockIcon size={17} />} title="Contractor's portal signature" />
              <CardBody>
                <KeyValues
                  columns={2}
                  items={[
                    settingLine(
                      "A contractor signs and accepts an award from its portal account",
                      read(
                        p?.contractorPortalSigning == null ? null : p.contractorPortalSigning ? "Yes" : "No, on paper only",
                        "Yes: the account of a contact marked as authorised to sign signs its block on a variation or adjustment certificate, its notice that the statutory declaration is lodged, and the return that accepts an award. No: an officer records the paper.",
                        p?.contractorPortalSigningProvenance,
                        "The portal refuses the contractor's block, its notice that the statutory declaration is lodged and its award return; the contractor signs on paper.",
                      ),
                      <EditContractorPortalSigning values={{ contractorPortalSigning: p?.contractorPortalSigning == null ? null : p.contractorPortalSigning ? "yes" : "no", contractorPortalSigningProvenance: p?.contractorPortalSigningProvenance ?? null }} />,
                    ),
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<ClockIcon size={17} />} title="Contract clocks" />
              <CardBody>
                <KeyValues
                  columns={2}
                  items={CONTRACT_CLOCKS.map((k) => {
                    const x = clockOf(k);
                    return settingLine(CLOCK_WORDS[k].en, read(x ? `${x.length} ${UNIT_WORDS[x.unit]}` : null, "", x?.provenance, CLOCK_UNSET[k]), <EditClockRule clock={k} label={CLOCK_WORDS[k].en} values={{ length: x ? String(x.length) : null, unit: x?.unit ?? null, provenance: x?.provenance ?? null, notes: x?.notes ?? "" }} />);
                  })}
                />
              </CardBody>
            </Card>
          </div>
        </Disclosure>
      </div>
    </>
  );
}
