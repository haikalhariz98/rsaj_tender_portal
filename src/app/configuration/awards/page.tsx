import Link from "next/link";

import { decimalText } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import type { ReactNode } from "react";

import { AwardIcon, FileIcon, InboxIcon, ShieldIcon } from "@/components/icons";
import { HistoryButton } from "@/components/history-drawer";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { ProvenanceBadge } from "@/components/ui/provenance";
import { KeyValues } from "@/components/ui/stat";
import { ActionsCol, CellStack, RowActions, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { INSTRUMENT_LABEL, INSURANCE_KIND_LABEL, ISSUER_KIND_LABEL, NON_COMMENCEMENT_LABEL, QUOTATION_KEY_LABEL } from "@/lib/award/labels";
import { loadAwardConfig } from "@/lib/award/repo";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { exerciseOrg } from "@/lib/method/repo";
import { formatMoney, parseSen } from "@/lib/money";
import { bandSetFaults } from "@/lib/securities/liability";

import { EditErpFormat } from "../requisitions/editors";
import { AddBand, AddConditionKind, AddIssuer, AddRecipient, AddRequirement, AddVariant, EditAwardPolicy, EditBand, EditConditionKind, EditIssuer, EditRecipient, EditRequirement, EditVariant, RetireRow } from "./editors";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

/// A setting's value, or "Not set" and what that stops.
function Setting({ value, unset }: { value: ReactNode | null; unset: string }) {
  if (value != null) return <>{value}</>;
  return (
    <span className="flex flex-col items-start gap-1.5">
      <Badge tone="warn">Not set</Badge>
      <span className="text-[12.5px] text-ink-3">{unset}</span>
    </span>
  );
}

const money = (v: { toString(): string } | null) => (v == null ? null : formatMoney(parseSen(v.toString())));
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
const live = (r: { retiredOn?: Date | null }) => r.retiredOn == null;

function Section({ title, subtitle, icon, count, action, empty, children }: { title: string; subtitle: string; icon: ReactNode; count: number; action: ReactNode; empty: string; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={icon} title={<span className="inline-flex items-center gap-2">{title}{count > 0 && <Badge outline>{count}</Badge>}</span>} subtitle={subtitle} actions={action} divided={count === 0} />
      {count === 0 ? <EmptyState size="sm" title="Not set">{empty}</EmptyState> : children}
    </Card>
  );
}

/**
 * Award controls (6.11): how this organisation awards, and the lists an award reads —
 * who receives copies, the appointment-letter variants, conditions precedent,
 * insurance requirements, liability bands and approved issuers. Everything ships unset.
 */
export default async function AwardControlsPage() {
  const actor = await requireStaff();
  const org = await exerciseOrg(actor.organisationId);
  if (!org) {
    return (
      <>
        <PageHeader title="Award controls" subtitle="How awards are made and what they read." />
        <Card>
          <EmptyState title="No organisation is configured">Run the setup first.</EmptyState>
        </Card>
      </>
    );
  }
  const [c, units, types, terms] = await Promise.all([
    loadAwardConfig(org.id),
    db.orgUnit.findMany({ where: { organisationId: org.id, effectiveTo: null }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true } }),
    db.contractType.findMany({ where: { organisationId: org.id, retiredOn: null }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }], select: { code: true, nameEn: true } }),
    db.termsBand.findMany({ where: { authorityMatrix: { organisationId: org.id, issuedAt: { not: null } } }, select: { bandKey: true, labelEn: true }, distinct: ["bandKey"] }),
  ]);
  const p = c.policy;
  const templates = c.templateRows.map((t) => ({ value: t.id, label: t.nameEn }));
  const templateName = (id: string | null) => (id ? (c.templateRows.find((t) => t.id === id)?.nameEn ?? "A template no longer on file") : null);
  const unitName = (code: string | null) => (code ? (units.find((u) => u.code === code)?.nameEn ?? "A unit no longer in the structure") : null);
  const typeOptions = types.map((t) => ({ value: t.code, label: t.nameEn }));
  const typeName = (code: string) => types.find((t) => t.code === code)?.nameEn ?? "A type no longer configured";
  const bandOptions = terms.map((t) => ({ value: t.bandKey, label: t.labelEn }));
  const policyValues = {
    tenderInstrument: p.tenderInstrument,
    quotationInstrument: p.quotationInstrument,
    indentValidityDays: p.indentValidityDays == null ? null : String(p.indentValidityDays),
    commencementGraceDays: p.commencementGraceDays == null ? null : String(p.commencementGraceDays),
    acceptanceReturnDays: p.acceptanceReturnDays == null ? null : String(p.acceptanceReturnDays),
    quotationContractKey: p.quotationContractKey,
    preContractUnitCode: p.preContractUnitCode,
    postContractUnitCode: p.postContractUnitCode,
    regulatedActivityLabel: p.regulatedActivityLabel,
    publishAwardedValue: p.publishAwardedValue == null ? null : p.publishAwardedValue ? "YES" : "NO",
    publishAwardedValueProvenance: p.publishAwardedValueProvenance,
    loaTemplateId: p.loaTemplateId,
    declarationTemplateId: p.declarationTemplateId,
    coveringMemoTemplateId: p.coveringMemoTemplateId,
    provenance: p.provenance,
    notes: p.notes,
  };
  const unitOptions = units.map((u) => ({ value: u.code, label: u.nameEn }));
  const unset = [p.tenderInstrument, p.quotationInstrument, p.indentValidityDays, p.commencementGraceDays, p.quotationContractKey, p.loaTemplateId, p.declarationTemplateId, p.coveringMemoTemplateId].filter((x) => x == null).length;
  const gaps = bandSetFaults(c.bands.filter(live));
  const edit = <EditAwardPolicy values={policyValues} templates={templates} units={unitOptions} />;

  return (
    <>
      <PageHeader
        title="Award controls"
        badge={unset > 0 ? <Badge tone="warn" dot>{`${unset} not set`}</Badge> : <Badge tone="ok" dot>All set</Badge>}
        subtitle="Instruments by band, their templates, who receives copies, and the letter variants."
        meta={[
          <span key="p" className="inline-flex items-center gap-1.5">
            Where these controls come from <ProvenanceBadge value={p.provenance} />
          </span>,
        ]}
        actions={
          <>
            {p.id && <HistoryButton entity="AwardPolicy" entityId={p.id} label="Award controls" />}
            {edit}
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader icon={<AwardIcon size={17} />} title="Instruments and clocks" subtitle="Unset refuses what depends on it; nothing is assumed." />
          <CardBody>
            <KeyValues
              columns={2}
              items={[
                { label: "Tender band", value: <Setting value={p.tenderInstrument ? INSTRUMENT_LABEL[p.tenderInstrument] : null} unset="No award can be opened in the tender band." /> },
                { label: "Quotation band", value: <Setting value={p.quotationInstrument ? INSTRUMENT_LABEL[p.quotationInstrument] : null} unset="No award can be opened in the quotation band." /> },
                { label: "Indent validity", value: <Setting value={p.indentValidityDays != null ? `${p.indentValidityDays} days from receipt, valid through the last day (an assumed reading)` : null} unset="An indent's validity reads as not set, never valid." /> },
                { label: "Commencement grace", value: <Setting value={p.commencementGraceDays != null ? `${p.commencementGraceDays} days after the stated start date` : null} unset="Non-commencement cannot be raised." /> },
                { label: "Time to return the instrument", value: <Setting value={p.acceptanceReturnDays != null ? `${p.acceptanceReturnDays} days` : null} unset="No return deadline is shown." /> },
                { label: "A quotation award's contract number", value: <Setting value={p.quotationContractKey ? QUOTATION_KEY_LABEL[p.quotationContractKey] : null} unset="A quotation award cannot be issued." /> },
                { label: "Case owned before award", value: <Setting value={unitName(p.preContractUnitCode)} unset="The handover at issue is recorded without its sections." /> },
                { label: "Case owned after award", value: <Setting value={unitName(p.postContractUnitCode)} unset="The handover at issue is recorded without its sections." /> },
                { label: "The regulated activity", value: <Setting value={p.regulatedActivityLabel} unset="The question is asked as “the regulated activity”." /> },
                {
                  label: "Awarded value on the public Results page",
                  value: (
                    <span className="flex flex-col items-start gap-1.5">
                      <Setting value={p.publishAwardedValue == null ? null : p.publishAwardedValue ? "Shown beside the winner" : "Not shown: the public sees the winner only"} unset="Not set, so the public Results page shows the winner but not the value." />
                      {p.publishAwardedValue != null && <ProvenanceBadge value={p.publishAwardedValueProvenance} />}
                    </span>
                  ),
                },
                {
                  label: "The indent number's format",
                  value: (
                    <span className="flex flex-col items-start gap-1.5">
                      {c.indentFormat ? <span>{(c.indentFormat.description || "Checked against a set shape").replace(/[.\s]+$/, "")}{c.indentFormat.example ? `, for example ${c.indentFormat.example}.` : "."}</span> : <><Badge tone="warn">Not set</Badge><span className="text-[12.5px] text-ink-3">An indent number is recorded as typed, not checked.</span></>}
                      <EditErpFormat formatKey="erp_indent_no" label="Indent number" current={c.indentFormat ? { pattern: c.indentFormat.pattern, example: c.indentFormat.example, description: c.indentFormat.description, provenance: c.indentFormat.provenance } : null} />
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<FileIcon size={17} />} title="Templates" subtitle="The documents are generated from these templates' text, set under Templates, and frozen when issued. The appointment letter's template comes from its variant." actions={<ButtonLink href="/configuration/templates" size="sm" variant="secondary">Open Templates</ButtonLink>} />
          <CardBody>
            <KeyValues
              columns={3}
              items={[
                { label: "For the Letter of Acceptance", value: <Setting value={templateName(p.loaTemplateId)} unset="A Letter of Acceptance cannot be issued." /> },
                { label: "For the successful bidder's declaration", value: <Setting value={templateName(p.declarationTemplateId)} unset="A Letter of Acceptance cannot be issued without it." /> },
                { label: "For the indent covering memo", value: <Setting value={templateName(p.coveringMemoTemplateId)} unset="An indent award cannot be issued." /> },
              ]}
            />
          </CardBody>
        </Card>

        <Section title="Who receives copies" subtitle="Drawn onto each award when its instrument is issued, with the awardee's own copy. One that applies only to the regulated activity is on the list where the award says the works are that activity." icon={<InboxIcon size={17} />} count={c.recipientRows.length} action={<AddRecipient />} empty="Nobody is set to receive copies, so no instrument can be issued.">
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "26%" }} />
              <col style={{ width: "18%" }} />
              <ActionsCol icons={2} labelled={1} />
            </colgroup>
            <THead>
              <Th>Recipient</Th>
              <Th>Of</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.recipientRows.map((r) => (
                <Tr key={r.id}>
                  <Td label="Recipient"><CellStack title={r.nameEn} sub={[r.mandatory ? "Mandatory" : "Optional", r.onlyWhenRegulated ? "only for the regulated activity" : null, r.retiredOn ? `retired ${formatDate(r.retiredOn)}` : null].filter(Boolean).join(" · ")} /></Td>
                  <Td label="Of" className="text-ink-2">{INSTRUMENT_LABEL[r.instrumentKind]}</Td>
                  <Td label="Source"><ProvenanceBadge value={r.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="DistributionRecipient" entityId={r.id} label={r.nameEn} />
                      <EditRecipient id={r.id} name={r.nameEn} values={{ instrumentKind: r.instrumentKind, nameEn: r.nameEn, nameMs: r.nameMs, mandatory: r.mandatory, onlyWhenRegulated: r.onlyWhenRegulated, provenance: r.provenance, sortOrder: String(r.sortOrder), notes: r.notes }} />
                      {live(r) && <RetireRow entity="DistributionRecipient" id={r.id} label={r.nameEn} today={org.today} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Appointment-letter variants" subtitle="Chosen by the exercise's contract type and its contract terms band, never guessed. The terms band says whether retention and defects liability are asked." icon={<FileIcon size={17} />} count={c.variantRows.length} action={<AddVariant templates={templates} types={typeOptions} bands={bandOptions} />} empty="No variants are set, so no indent award can be issued.">
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "30%" }} />
              <col style={{ width: "16%" }} />
              <ActionsCol icons={2} labelled={1} />
            </colgroup>
            <THead>
              <Th>Variant</Th>
              <Th>For</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.variantRows.map((v) => (
                <Tr key={v.id}>
                  <Td label="Variant"><CellStack title={v.nameEn} sub={`${templateName(v.templateId) ?? ""} · if work does not commence: ${v.nonCommencement ? NON_COMMENCEMENT_LABEL[v.nonCommencement].toLowerCase() : "not set"}${v.retiredOn ? ` · retired ${formatDate(v.retiredOn)}` : ""}`} /></Td>
                  <Td label="For" className="text-ink-2">
                    <CellStack title={v.contractTypeCodes.length ? v.contractTypeCodes.map(typeName).join(", ") : "Any contract type"} sub={v.termsBandKey ? (terms.find((t) => t.bandKey === v.termsBandKey)?.labelEn ?? "A terms band no longer on the matrix") : "Any terms band"} />
                  </Td>
                  <Td label="Source"><ProvenanceBadge value={v.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="AppointmentLetterVariant" entityId={v.id} label={v.nameEn} />
                      <EditVariant id={v.id} name={v.nameEn} templates={templates} types={typeOptions} bands={bandOptions} values={{ nameEn: v.nameEn, templateId: v.templateId, contractTypeCodes: v.contractTypeCodes.join("\n"), termsBandKey: v.termsBandKey, nonCommencement: v.nonCommencement, provenance: v.provenance, sortOrder: String(v.sortOrder), notes: v.notes }} />
                      {live(v) && <RetireRow entity="AppointmentLetterVariant" id={v.id} label={v.nameEn} today={org.today} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Conditions precedent" subtitle="What must be in place before work may start. A delay in one marked so does not earn the contractor more time." icon={<AwardIcon size={17} />} count={c.conditionKinds.length} action={<AddConditionKind />} empty="No conditions are set.">
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "18%" }} />
              <ActionsCol icons={2} labelled={1} />
            </colgroup>
            <THead>
              <Th>Condition</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.conditionKinds.map((k) => (
                <Tr key={k.id}>
                  <Td label="Condition"><CellStack title={k.nameEn} sub={[k.excludesEotReason ? "A delay gives no extension of time" : "A delay may give an extension of time", k.retiredOn ? `retired ${formatDate(k.retiredOn)}` : null].filter(Boolean).join(" · ")} /></Td>
                  <Td label="Source"><ProvenanceBadge value={k.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="ConditionPrecedentKind" entityId={k.id} label={k.nameEn} />
                      <EditConditionKind id={k.id} name={k.nameEn} values={{ nameEn: k.nameEn, excludesEotReason: k.excludesEotReason, provenance: k.provenance, sortOrder: String(k.sortOrder), notes: k.notes }} />
                      {live(k) && <RetireRow entity="ConditionPrecedentKind" id={k.id} label={k.nameEn} today={org.today} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Insurance requirements" subtitle="Which policies a contract must carry, and how long past completion and defects liability each must run. A contract type's own row takes the place of the general one." icon={<ShieldIcon size={17} />} count={c.requirementRows.length} action={<AddRequirement types={typeOptions} />} empty="No requirements are set, so the readiness gate's insurance item reads as not set.">
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "30%" }} />
              <col style={{ width: "16%" }} />
              <ActionsCol icons={2} labelled={1} />
            </colgroup>
            <THead>
              <Th>Requirement</Th>
              <Th>Runs past completion</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.requirementRows.map((q) => (
                <Tr key={q.id}>
                  <Td label="Requirement"><CellStack title={q.nameEn} sub={`${INSURANCE_KIND_LABEL[q.kind]} · ${q.contractTypeCode ? typeName(q.contractTypeCode) : "every type"}${q.required ? "" : " · not required"}${q.percent ? ` · ${decimalText(q.percent)}% of the sum` : ""}`} /></Td>
                  <Td label="Runs past completion" className="text-ink-2">{q.tailMonths == null && q.tailDays == null ? "Not set" : `Defects liability, then ${q.tailMonths ?? 0} months ${q.tailDays ?? 0} days`}</Td>
                  <Td label="Source"><ProvenanceBadge value={q.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="InsuranceRequirement" entityId={q.id} label={q.nameEn} />
                      <EditRequirement id={q.id} name={q.nameEn} types={typeOptions} values={{ nameEn: q.nameEn, kind: q.kind, contractTypeCode: q.contractTypeCode, required: q.required, percent: q.percent?.toString() ?? null, tailMonths: q.tailMonths == null ? null : String(q.tailMonths), tailDays: q.tailDays == null ? null : String(q.tailDays), provenance: q.provenance, sortOrder: String(q.sortOrder), notes: q.notes }} />
                      {live(q) && <RetireRow entity="InsuranceRequirement" id={q.id} label={q.nameEn} today={org.today} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Public liability bands" subtitle="By contract price, above the lower figure and up to and including the upper. A price that falls between bands is refused, never placed in one." icon={<ShieldIcon size={17} />} count={c.bandRows.length} action={<AddBand />} empty="No bands are set, so no public liability limit can be derived.">
          {gaps.length > 0 && (
            <div className="border-b border-line px-5 py-3 sm:px-6">
              <Callout tone="warn" title="The bands leave prices uncovered">
                {gaps.map((g, i) => (
                  <span key={i} className="block">
                    {g.kind === "GAP" ? `Above ${g.after == null ? "nothing" : formatMoney(g.after)} and up to ${formatMoney(g.before)}: no band.` : g.kind === "OPEN_TOP" ? `Above ${formatMoney(g.above)}: no band.` : "Two bands overlap."}
                  </span>
                ))}
              </Callout>
            </div>
          )}
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "22%" }} />
              <col style={{ width: "16%" }} />
              <ActionsCol icons={2} labelled={1} />
            </colgroup>
            <THead>
              <Th>Contract price</Th>
              <Th className="text-right">Limit</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.bandRows.map((b) => (
                <Tr key={b.id}>
                  <Td label="Contract price"><CellStack title={b.minValue == null ? `Up to ${money(b.maxValue)}` : b.maxValue == null ? `Above ${money(b.minValue)}` : `Above ${money(b.minValue)}, up to ${money(b.maxValue)}`} sub={b.retiredOn ? `Retired ${formatDate(b.retiredOn)}` : undefined} /></Td>
                  <Td label="Limit" className="text-right tabular-nums">{money(b.limitAmount)}</Td>
                  <Td label="Source"><ProvenanceBadge value={b.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="LiabilityBand" entityId={b.id} label="Liability band" />
                      <EditBand id={b.id} name="the band" values={{ minValue: b.minValue?.toString() ?? null, maxValue: b.maxValue?.toString() ?? null, limitAmount: b.limitAmount.toString(), provenance: b.provenance, sortOrder: String(b.sortOrder), notes: b.notes }} />
                      {live(b) && <RetireRow entity="LiabilityBand" id={b.id} label="the band" today={org.today} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Approved issuers" subtitle="Banks and insurers on the regulator's list. A bond or policy from anyone else is not verified." icon={<ShieldIcon size={17} />} count={c.issuers.length} action={<AddIssuer />} empty="No issuers are listed, so no bond or policy can be verified.">
          <Table>
            <colgroup>
              <col />
              <col style={{ width: "28%" }} />
              <col style={{ width: "16%" }} />
              <ActionsCol icons={2} labelled={1} />
            </colgroup>
            <THead>
              <Th>Issuer</Th>
              <Th>List</Th>
              <Th>Source</Th>
              <Th className="text-right">Actions</Th>
            </THead>
            <tbody>
              {c.issuers.map((i) => (
                <Tr key={i.id}>
                  <Td label="Issuer"><CellStack title={i.name} sub={`${ISSUER_KIND_LABEL[i.kind]}${i.retiredOn ? ` · retired ${formatDate(i.retiredOn)}` : ""}`} /></Td>
                  <Td label="List" className="text-ink-2"><CellStack title={i.listSource || "Not recorded"} sub={i.listAsAt ? `As at ${formatDate(i.listAsAt)}` : undefined} /></Td>
                  <Td label="Source"><ProvenanceBadge value={i.provenance} /></Td>
                  <Td>
                    <RowActions>
                      <HistoryButton iconOnly entity="ApprovedIssuer" entityId={i.id} label={i.name} />
                      <EditIssuer id={i.id} name={i.name} values={{ name: i.name, kind: i.kind, listSource: i.listSource, listAsAt: d(i.listAsAt), provenance: i.provenance, sortOrder: String(i.sortOrder), notes: i.notes }} />
                      {live(i) && <RetireRow entity="ApprovedIssuer" id={i.id} label={i.name} today={org.today} />}
                    </RowActions>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Callout tone="info" title="Also read by awards">
          Who signs each instrument is a set of rules on the <Link href="/configuration/approval-matrix">approval matrix</Link>. A contract type&apos;s contract numbering series is set under <Link href="/configuration/reference-data">Reference data</Link>, the indent number&apos;s format under Requisition controls&apos; formats, and the expiry reminders under <Link href="/configuration/notifications">Notifications</Link>.
        </Callout>
      </div>
    </>
  );
}
