import { exerciseIsHidden } from "@/app/_auth/sulit";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AwardIcon, CheckIcon, ClipboardIcon, ClockIcon, FileIcon, InboxIcon, RouteIcon, ShieldIcon, SlidersIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Tabs } from "@/components/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE, INSTRUMENT_SHORT } from "@/lib/award/labels";
import { loadAward } from "@/lib/award/repo";
import { AWARD_NOTE_ID } from "@/app/awards/editors";
import { requireStaff } from "@/app/_auth/actor";
import { buildAwardView } from "@/app/projects/[id]/award/award-view";
import { money } from "@/app/projects/[id]/award/shared";
import { NonAwardPanel } from "./non-award-panel";

export const dynamic = "force-dynamic";

/**
 * The award's own page (until C9 turns it into a redirect to the case, AC-23). Its content is `buildAwardView`, which the case
 * page's Award stage uses too (C-2): one composition, so the two cannot drift.
 */
export default async function AwardPage(props: PageProps<"/awards/[id]">) {
  const actor = await requireStaff();
  const [{ id }, { tab }] = await Promise.all([props.params, props.searchParams as Promise<{ tab?: string }>]);
  const l = await loadAward(actor.organisationId, id);
  // FR-MTD-007: an award of a restricted exercise reads as gone to anyone not named on the exercise, and the attempt is logged.
  if (!l || (await exerciseIsHidden(actor, l.award.exerciseId))) notFound();
  const { award, ex } = l;
  const view = await buildAwardView({ actor, l });
  const { ev, status, kind } = view;
  // "all": this page has always loaded every tab, and still does.
  const v = await view.finish({ tab: "all", chrome: true });
  const chrome = v.chrome!;

  const tabs = [
    { id: "overview", label: "Overview", icon: <AwardIcon size={15} />, panel: v.panel("overview") },
    { id: "approval", label: "Approval", icon: <RouteIcon size={15} />, panel: v.panel("approval") },
    { id: "instrument", label: "Instrument", icon: <FileIcon size={15} />, count: v.counts.instrument, panel: v.panel("instrument") },
    { id: "distribution", label: "Distribution", icon: <InboxIcon size={15} />, panel: v.panel("distribution") },
    { id: "return", label: "Return", icon: <ClipboardIcon size={15} />, panel: v.panel("return") },
    // Phase 4d (FR-AWD-010, policy D7): the notices to the tenderers whose bid did not win. Read only while this tab is the one open.
    { id: "notices", label: "Notices to tenderers", icon: <InboxIcon size={15} />, lazy: true, panel: tab === "notices" ? <NonAwardPanel actor={actor} award={{ id: award.id, exerciseId: award.exerciseId, status: award.status, awardeePartyId: award.awardeePartyId }} /> : null },
    { id: "conditions", label: "Conditions", icon: <CheckIcon size={15} />, count: v.counts.conditions, panel: v.panel("conditions") },
    { id: "securities", label: "Securities", icon: <ShieldIcon size={15} />, count: v.counts.securities, panel: v.panel("securities") },
    // 6.14 increment 1 (rulings condition): the pre-award routing sheet over the appointment route.
    { id: "routing", label: "Routing sheet", icon: <SlidersIcon size={15} />, lazy: true, panel: tab === "routing" ? v.panel("routing") : null },
    { id: "history", label: "History", icon: <ClockIcon size={15} />, count: v.counts.history ?? undefined, panel: v.panel("history") },
  ];

  return (
    <>
      <RecordCrumb label={award.reference} />
      <PageHeader
        eyebrow={<Link href="/awards">Awards</Link>}
        title={award.awardeeName}
        badge={
          <Badge tone={AWARD_STATUS_TONE[status]} dot>
            {AWARD_STATUS_LABEL[status]}
          </Badge>
        }
        subtitle={ex.title}
        meta={[
          <span key="ref" className="font-mono text-[12.5px]">{award.reference}</span>,
          <span key="for">for <Link href={`/sourcing/${ex.id}?tab=award`}>{ex.reference}</Link></span>,
          <span key="v" className="tabular-nums">{money(award.awardedValue)}</span>,
          INSTRUMENT_SHORT[kind],
          // Who signs: named once it is signed, the office until then; a cancelled award states neither.
          status === "CANCELLED" ? null : award.signatoryName ? `Signed by ${award.signatoryName}, ${award.signatoryRoleLabel ?? "office not recorded"}` : ev.signatory?.ok ? `To be signed by the ${ev.signatory.roleLabel}` : "Signatory not resolved",
          award.contract ? `Contract ${award.contract.number}` : status === "CANCELLED" ? null : "No contract number yet",
        ]}
        actions={chrome.actions}
        actionsNote={chrome.headerNote}
        actionsNoteId={AWARD_NOTE_ID}
      />

      <div className="mb-6 flex flex-col gap-3">{chrome.callouts}</div>

      <Tabs initial={tab} label="Award" tabs={tabs} />
    </>
  );
}
