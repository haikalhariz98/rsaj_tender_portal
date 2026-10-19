import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ClockIcon, FileIcon, ScaleIcon, ShieldIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { MoreText } from "@/components/ui/more-text";
import { PageHeader } from "@/components/ui/page-header";
import { KeyValues } from "@/components/ui/stat";
import { APPENDIX_CARD, appendixCopy, NOT_SET } from "@/lib/tender-docs/labels";
import { appendixPage } from "@/lib/tender-docs/read";

import { AppendixDrawer, LimitDrawer, RemoveLimitDrawer, RemoveSectionDrawer, SectionDrawer } from "./editors";
import { requireStaff } from "@/app/_auth/actor";
import { exerciseIsHidden } from "@/app/_auth/sulit";

export const dynamic = "force-dynamic";

/// A value, or "Not set" as a badge: never a blank and never a zero.
const val = (v: string): ReactNode => (v === NOT_SET ? <Badge tone="warn">Not set</Badge> : <span className="break-words">{v}</span>);

/**
 * The Appendix to the Conditions of Contract (FR-DOC-004): the contract's particulars, stated
 * once for the tender and frozen with the pack. Each field is entered or reads Not set, and a
 * pack with a field not set cannot be submitted. Nothing here is worked out against the
 * department's estimate or bill (SULIT): a percentage is fixed at award, on the awarded sum.
 */
export default async function AppendixPage(props: PageProps<"/sourcing/[id]/appendix">) {
  const actor = await requireStaff();
  const { id } = await props.params;
  // FR-MTD-007: an exercise restricted to its named people reads as one that does not exist to anyone else, and the attempt is logged.
  if (await exerciseIsHidden(actor, id)) notFound();
  const d = await appendixPage(actor.organisationId, id);
  if (!d) notFound();
  const back = `/sourcing/${id}?tab=documents`;
  const header = (extra?: { badge?: ReactNode; actions?: ReactNode; note?: ReactNode; subtitle?: string }) => (
    <PageHeader
      eyebrow={<Link href={back}>Back to the tender documents</Link>}
      title="Appendix to the Conditions of Contract"
      badge={extra?.badge}
      subtitle={extra?.subtitle}
      meta={[<span key="ref" className="font-mono text-[12.5px]">{d.exercise.reference}</span>, d.exercise.title]}
      actions={extra?.actions}
      actionsNote={extra?.note}
      actionsNoteId="appendix-actions-note"
    />
  );
  if (!d.appendix && !("version" in d)) {
    return (
      <>
        <RecordCrumb label={d.exercise.reference} />
        {header()}
        <Card>
          <EmptyState title="No Appendix to enter" action={<Link href={back} className="text-[13px] font-semibold">Back to the tender documents</Link>}>
            {d.why}
          </EmptyState>
        </Card>
      </>
    );
  }
  const a = d as Extract<typeof d, { version: number }>;
  const allowed = a.edit;
  const rawValues: Record<string, string> = {
    ...a.raw,
    ...Object.fromEntries(a.officers.map((o) => [o.name, o.raw])),
    pcSumWorksApply: a.primeCostSums.raw.apply,
    pcSumWorksText: a.primeCostSums.raw.text,
  };
  const officerLabels = Object.fromEntries(a.officers.map((o) => [o.name, o.label]));
  const drawer = (group: Parameters<typeof AppendixDrawer>[0]["group"], title: string) => <AppendixDrawer exerciseId={id} group={group} allowed={allowed} values={rawValues} offices={a.offices} officerLabels={officerLabels} title={title} />;
  const complete = a.status === "Complete";
  const copy = appendixCopy(a.state, a.version);
  // SR-12: how the answers fit together, said on the card it is about.
  const hint = (card: keyof typeof a.hints) => (a.hints[card] ?? []).map((t) => <Callout key={t} tone="warn">{t}</Callout>);

  return (
    <>
      <RecordCrumb label={a.exercise.reference} />
      {header({
        badge: <Badge tone={complete ? "ok" : "warn"} dot>{a.status}</Badge>,
        subtitle: copy.subtitle,
        actions: <AppendixDrawer exerciseId={id} group="all" allowed={allowed} values={rawValues} offices={a.offices} officerLabels={officerLabels} title="Edit the Appendix" primary />,
        note: allowed.allowed ? undefined : <span><span className="font-semibold text-ink-2">Edit the Appendix:</span> {allowed.reason}</span>,
      })}

      <div className="flex flex-col gap-6">
        {/* SR-12: no "Still to enter" list. Each card shows its fields entered or Not set, and Save names any required field left empty. */}


        <Card id={APPENDIX_CARD.officers} className="scroll-mt-24">
          <CardHeader icon={<FileIcon size={17} />} title="Officers empowered" actions={drawer("officers", "Edit the officers empowered")} />
          <CardBody>
            <KeyValues columns={2} items={a.officers.map((o) => ({ label: o.label, value: val(o.value) }))} />
          </CardBody>
        </Card>

        <Card id={APPENDIX_CARD.variationLimits} className="scroll-mt-24 overflow-hidden">
          <CardHeader icon={<ScaleIcon size={17} />} title="Variation limits" actions={<LimitDrawer exerciseId={id} holders={a.holders} allowed={allowed} />} divided={a.variationLimits.length === 0} />
          {(a.hints[APPENDIX_CARD.variationLimits] ?? []).length > 0 && <div className="flex flex-col gap-2 px-5 pb-3 sm:px-6">{hint(APPENDIX_CARD.variationLimits)}</div>}
          {a.variationLimits.length === 0 ? (
            <EmptyState size="sm" title="No limits entered" />
          ) : (
            <ul className="divide-y divide-line/70">
              {a.variationLimits.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold break-words text-ink">{v.holder}</span>
                    <span className="block text-[13px] text-ink-2">{val(v.limit)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <LimitDrawer exerciseId={id} holders={a.holders} limit={{ id: v.id, holder: v.holder, raw: v.raw }} allowed={allowed} />
                    <RemoveLimitDrawer exerciseId={id} id={v.id} holder={v.holder} allowed={allowed} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id={APPENDIX_CARD.primeCost} className="scroll-mt-24">
          <CardHeader icon={<FileIcon size={17} />} title="Prime cost sum work" actions={drawer("pc", "Edit prime cost sum work")} />
          <CardBody>
            <KeyValues columns={1} items={[{ label: "Prime cost sum work", value: val(a.primeCostSums.value) }]} />
          </CardBody>
        </Card>

        <Card id={APPENDIX_CARD.insurance} className="scroll-mt-24">
          <CardHeader icon={<ShieldIcon size={17} />} title="Insurance" actions={drawer("insurance", "Edit the insurance")} />
          <CardBody className="flex flex-col gap-4">
            <KeyValues
              columns={2}
              items={[
                { label: "Third-party liability, at least", value: val(a.insurance.tplMinimum) },
                { label: "Workmen's compensation, at least", value: val(a.insurance.wcMinimum) },
                { label: "Works insurance uplift", value: val(a.insurance.uplift) },
                { label: "Permitted excess", value: val(a.insurance.excess) },
              ]}
            />
            {hint(APPENDIX_CARD.insurance)}
            <p className="border-t border-line pt-3 text-[12.5px] text-ink-3">{a.insurance.tail}</p>
          </CardBody>
        </Card>

        <Card id={APPENDIX_CARD.lad} className="scroll-mt-24">
          <CardHeader icon={<ClockIcon size={17} />} title="Liquidated damages" actions={drawer("lad", "Edit liquidated damages")} />
          <CardBody className="flex flex-col gap-4">
            <KeyValues columns={2} items={[{ label: "Stated as", value: val(a.lad.kind) }, { label: "Rate", value: val(a.lad.value) }]} />
            {a.lad.helper && <p className="flex items-center gap-1 text-[13px] text-ink-2">{a.lad.helper} <MoreText text="Never worked out against the exercise's value or an estimate." label="About this figure" /></p>}
            {hint(APPENDIX_CARD.lad)}
            {a.lad.suggestion && <p className="text-[12.5px] text-ink-3">{a.lad.suggestion}</p>}
          </CardBody>
        </Card>

        <Card id={APPENDIX_CARD.sectional} className="scroll-mt-24 overflow-hidden">
          <CardHeader icon={<ClockIcon size={17} />} title="Sectional completion" actions={<span className="flex flex-wrap items-center gap-2">{drawer("sectional", "Edit sectional completion")}<SectionDrawer exerciseId={id} allowed={allowed} /></span>} />
          <CardBody>
            <KeyValues columns={1} items={[{ label: "Sectional completion", value: val(a.sectional.value === "Yes" ? "Applies" : a.sectional.value === "No" ? "Does not apply" : a.sectional.value) }]} />
          </CardBody>
          {(a.hints[APPENDIX_CARD.sectional] ?? []).length > 0 && <div className="flex flex-col gap-2 px-5 pb-3 sm:px-6">{hint(APPENDIX_CARD.sectional)}</div>}
          {a.sectional.value === "Yes" && a.sectional.sections.length === 0 && (
            <EmptyState size="sm" title="No sections entered" />
          )}
          {a.sectional.sections.length > 0 && (
            <ul className="divide-y divide-line/70 border-t border-line">
              {a.sectional.sections.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-6">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold break-words text-ink">{s.description}</span>
                    <span className="block text-[13px] text-ink-2">{val(s.lad)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <SectionDrawer exerciseId={id} section={{ id: s.id, description: s.description, raw: s.raw }} allowed={allowed} />
                    <RemoveSectionDrawer exerciseId={id} id={s.id} description={s.description} allowed={allowed} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id={APPENDIX_CARD.dlp} className="scroll-mt-24">
          <CardHeader icon={<ClockIcon size={17} />} title="Defects liability period" actions={a.dlp.hidden ? undefined : drawer("dlp", "Edit the defects liability period")} />
          <CardBody>
            {a.dlp.hidden ? (
              <p className="text-[13px] text-ink-2">{a.dlp.hidden}</p>
            ) : (
              <div className="flex flex-col gap-3">
                <KeyValues columns={1} items={[{ label: "Defects liability period", value: val(a.dlp.value) }]} />
                {a.dlp.typeNotSet && <Callout tone="warn">{a.dlp.typeNotSet}</Callout>}
                {hint(APPENDIX_CARD.dlp)}
              </div>
            )}
          </CardBody>
        </Card>

        <Card id={APPENDIX_CARD.interim} className="scroll-mt-24">
          <CardHeader icon={<ScaleIcon size={17} />} title="Interim certificates" actions={drawer("interim", "Edit the interim certificates")} />
          <CardBody className="flex flex-col gap-4">
            <KeyValues
              columns={2}
              items={[
                {
                  label: "Minimum for the first certificate",
                  value: a.interim.firstRule ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="break-words">{a.interim.firstRule}</span>
                      <span className="text-[12.5px] text-ink-3">Entered as {a.interim.first} for the tender documents.</span>
                    </span>
                  ) : (
                    val(a.interim.first)
                  ),
                },
                { label: "Minimum for later certificates", value: val(a.interim.later) },
                { label: "Days to honour a certificate", value: val(a.interim.honourDays) },
              ]}
            />
            <p className="border-t border-line pt-3 text-[12.5px] text-ink-3">
              {a.interim.suggestion ?? "No policy rule for the first certificate's minimum."}
              <MoreText text="Entered as the tender states it. Worked out at award from the builders' works value, not against the department's bill." label="About this figure" />
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
