import { DataList, type Row } from "@/components/data-list";
import { ChartIcon } from "@/components/icons";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { MoreActions } from "@/components/ui/more-actions";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { eligibleFor } from "@/lib/auth/eligibility-store";
import { loadDraftMakers } from "@/lib/auth/draft-makers";
import { draftIssueFault } from "@/lib/auth/maker-checker";
import { twoPersonOn } from "@/lib/auth/policy-store";
import { db } from "@/lib/db";
import { fixedOf, formatMark } from "@/lib/evaluation/fixed";
import { formatDate, formatOrgDay } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { formIssueFaults } from "@/lib/performance/form";
import { FORM_STATUS_WORDS, performanceFaultText, weightText } from "@/lib/performance/labels";
import { loadForms, snapshotOfForm } from "@/lib/performance/load";
import { storedDay } from "@/lib/dates";
import { requireStaff } from "@/app/_auth/actor";

import { BandDrawer, CriterionDrawer, DiscardFormDrawer, FormDrawer, IssueFormDrawer, RemoveRowDrawer, RetireFormDrawer } from "./editors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance forms" };

const TONE = { DRAFT: "warn", ISSUED: "ok", RETIRED: undefined } as const;
const PROVENANCE_WORDS: Readonly<Record<string, string>> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };

/**
 * Settings › Performance forms (Phase 2 close-out stage D; ADR 0047 D6; ruling 10): the contractor performance form of each contract type, its criteria
 * with their weights, and its grades. Shipped empty. A contract whose type has no issued form cannot start its report, and says so by name.
 */
export default async function PerformanceFormsPage() {
  const actor = await requireStaff();
  const org = await exerciseOrg(actor.organisationId);
  const header = <PageHeader title="Performance forms" />;
  if (!org) {
    return (
      <>
        {header}
        <Card>
          <EmptyState title="No organisation is configured" />
        </Card>
      </>
    );
  }
  const [forms, types] = await Promise.all([loadForms(org.id), db.contractType.findMany({ where: { organisationId: org.id }, orderBy: { nameEn: "asc" }, select: { code: true, nameEn: true } })]);
  const typeName = (code: string) => types.find((t) => t.code === code)?.nameEn ?? "A contract type no longer configured";
  const typeOptions = types.map((t) => ({ value: t.code, label: t.nameEn }));
  const twoPerson = await twoPersonOn(db, org.id);
  const eligible = await eligibleFor(db, { organisationId: org.id, timeZone: actor.organisationTimeZone, now: new Date() }, "configuration.issue");
  const withoutForm = types.filter((t) => !forms.some((f) => f.contractTypeCode === t.code && f.status === "ISSUED"));

  const cards = await Promise.all(
    forms.map(async (f) => {
      const snap = snapshotOfForm(f);
      const draft = f.status === "DRAFT";
      const otherIssued = forms.some((x) => x.id !== f.id && x.contractTypeCode === f.contractTypeCode && x.status === "ISSUED");
      const faults = draft ? formIssueFaults({ name: f.nameEn, scaleMax: f.scaleMax, criteria: snap.criteria, bands: snap.bands, otherIssued }) : [];
      const maker = draft ? draftIssueFault({ makerPersonIds: (await loadDraftMakers(db, "PerformanceForm", f.id)).personIds, issuerPersonId: actor.personId, twoPersonChanges: twoPerson, eligiblePersonIds: eligible }) : null;
      const criteria: Row[] = f.criteria.map((c) => ({ id: c.id, search: c.labelEn, cells: { criterion: { kind: "stack", title: `${c.sortOrder}. ${c.labelEn}`, sub: c.guideEn || undefined }, weight: { kind: "text", text: weightText(c.weight) } } }));
      const grades: Row[] = f.grades.map((b) => ({ id: b.id, search: b.label, cells: { grade: { kind: "text", text: b.label }, from: { kind: "text", text: `${formatMark(fixedOf(b.lowerPct)!, 0)}%` } } }));
      const label = `${f.nameEn}, version ${f.version}`;
      return (
        <Card key={f.id} className="overflow-hidden">
          <CardHeader
            icon={<ChartIcon size={17} />}
            title={label}
            subtitle={<Badge tone={TONE[f.status]} dot>{FORM_STATUS_WORDS[f.status]}</Badge>}
            actions={
              <span className="flex items-center gap-2">
                <HistoryButton entity="PerformanceForm" entityId={f.id} label={label} />
                {draft && <CriterionDrawer formId={f.id} />}
                {draft && <BandDrawer formId={f.id} />}
                {draft && <IssueFormDrawer id={f.id} twoPerson={twoPerson} blocker={maker?.en ?? (faults.length ? faults.map(performanceFaultText).join(" ") : null)} />}
                {(draft || f.status === "ISSUED") && (
                  <MoreActions>
                    {draft && <FormDrawer types={typeOptions} form={{ id: f.id, values: { nameEn: f.nameEn, scaleMax: String(f.scaleMax), provenance: f.provenance, source: f.source } }} />}
                    {draft && f.criteria.length > 0 && <RemoveRowDrawer formId={f.id} kind="criterion" options={f.criteria.map((c) => ({ value: c.id, label: c.labelEn }))} />}
                    {draft && f.grades.length > 0 && <RemoveRowDrawer formId={f.id} kind="grade" options={f.grades.map((b) => ({ value: b.id, label: b.label }))} />}
                    {draft && <DiscardFormDrawer id={f.id} />}
                    {f.status === "ISSUED" && <RetireFormDrawer id={f.id} />}
                  </MoreActions>
                )}
              </span>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <KeyValues
              columns={3}
              items={[
                { label: "Contract type", value: typeName(f.contractTypeCode) },
                { label: "Score range", value: `1 to ${f.scaleMax}` },
                { label: "Source", value: `${PROVENANCE_WORDS[f.provenance] ?? "Not said"}${f.source ? ` · ${f.source}` : ""}` },
                ...(f.issuedAt ? [{ label: "Issued", value: formatOrgDay(f.issuedAt, org.timeZone) }] : []),
                ...(f.retiredOn ? [{ label: "Retired from", value: formatDate(storedDay(f.retiredOn)) }] : []),
              ]}
            />
            {draft && faults.length > 0 && <Callout tone="warn" title="Not ready to issue">{faults.map(performanceFaultText).join(" ")}</Callout>}
          </CardBody>
          <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="criteria" emptyTitle="No criteria" columns={[{ key: "criterion", label: "Criterion", mobile: "primary" }, { key: "weight", label: "Weight", width: "120px", numeric: true, mobile: "meta" }]} rows={criteria} />
          <DataList flat selectable={false} toolbar={false} searchable={false} paging={false} exportName="grades" emptyTitle="No grades" columns={[{ key: "grade", label: "Grade", mobile: "primary" }, { key: "from", label: "From", width: "120px", numeric: true, mobile: "meta" }]} rows={grades} />
        </Card>
      );
    }),
  );

  return (
    <>
      <PageHeader
        title="Performance forms"
        info={{ title: "Performance forms", text: "The contractor performance form of each contract type: what is scored, its weights and its grades. Each type has one issued form, and there is no general form. A report pins the form it was started on." }}
        badge={withoutForm.length > 0 ? <Badge tone="warn" dot>{withoutForm.length === 1 ? "1 type without a form" : `${withoutForm.length} types without a form`}</Badge> : types.length > 0 ? <Badge tone="ok" dot>All set</Badge> : undefined}
        actions={cards.length ? <FormDrawer types={typeOptions} /> : undefined}
      />
      <div className="flex flex-col gap-6">
        {withoutForm.length > 0 && cards.length > 0 && <Callout tone="warn" title="Contract types with no issued form">{withoutForm.map((t) => t.nameEn).join(", ")}. Their contracts cannot start a performance report.</Callout>}
        {cards.length ? cards : (
          <Card>
            <EmptyState title="No performance forms yet" action={<FormDrawer types={typeOptions} />} />
          </Card>
        )}
      </div>
    </>
  );
}
