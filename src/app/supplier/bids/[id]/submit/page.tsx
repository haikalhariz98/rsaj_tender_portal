import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ShieldIcon } from "@/components/icons";
import { RecordCrumb } from "@/components/shell/record-crumb";
import { Badge } from "@/components/ui/badge";
import { Bi } from "@/components/ui/bilingual";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { issueFormToken } from "@/lib/auth/form-secret";
import { loadBidScreen } from "@/lib/bids/online/my-bids-store";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import { SUBMIT_FAULT_WORDS } from "@/lib/bids/online/words";
import { db } from "@/lib/db";
import { DEMONSTRATION_WORDS } from "@/lib/sealing/switch";

import { requireSupplier } from "../../../../_auth/supplier";
import { BidForm } from "./bid-form";

export const metadata: Metadata = { title: SCREEN_WORDS.submitTitle.en };
export const dynamic = "force-dynamic";

/**
 * Where a signed-in supplier submits, replaces or adds to an online sealed bid (SR-13, ADR 0036 D5 to D8). The supplier is the SESSION's; the id in the address is an exercise's, and the page
 * answers "not found" for one the supplier may not see, as the exercise page does. Where bids are handed in on paper it says so and offers nothing. Where a door is closed it says which, in words, and
 * offers nothing. Every sentence is `Words` in both languages (20ab).
 */
export default async function SubmitBidPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireSupplier();
  const { id } = await params;
  const screen = await loadBidScreen(db, actor, id);
  if (!screen) notFound();
  const token = issueFormToken("bids");
  const back = `/supplier/bids/${screen.exercise.id}?tab=bid`;
  const head = (
    <>
      <RecordCrumb label={screen.exercise.reference} />
      <PageHeader
        eyebrow={<Link href={back}><Bi words={SCREEN_WORDS.backToExercise} inline /></Link>}
        title={<Bi words={SCREEN_WORDS.submitTitle} inline />}
        badge={screen.demonstration ? <Badge tone="warn"><Bi words={DEMONSTRATION_WORDS} inline /></Badge> : undefined}
        subtitle={`${screen.exercise.reference} · ${screen.exercise.title}`}
        meta={[actor.supplierName]}
      />
    </>
  );

  if (!screen.online) {
    return (
      <>
        {head}
        <Card>
          <EmptyState title={<Bi words={SCREEN_WORDS.paperOnlyTitle} inline />}>
            <Bi words={SUBMIT_FAULT_WORDS.CHANNEL_NOT_ONLINE} />
          </EmptyState>
        </Card>
      </>
    );
  }
  if (screen.closed.length > 0) {
    return (
      <>
        {head}
        <Callout tone="warn" title={<Bi words={SCREEN_WORDS.closedTitle} />}>
          <ul className="flex flex-col gap-1.5">{screen.closed.map((x) => <li key={x.en}><Bi words={x} /></li>)}</ul>
        </Callout>
      </>
    );
  }

  return (
    <>
      {head}
      <div className="flex flex-col gap-5">
        {!token && (
          <Callout tone="warn" title={<Bi words={SCREEN_WORDS.sendingClosed} />} />
        )}
        {screen.pastClosing && (
          <Callout tone="warn" title={<Bi words={SCREEN_WORDS.pastClosingTitle} />}>
            <Bi words={SCREEN_WORDS.receiptLateNote} />
          </Callout>
        )}
        {screen.discarded.length > 0 && (
          <Callout tone="warn" title={<Bi words={SCREEN_WORDS.discardedTitle} />}>
            <Bi words={SCREEN_WORDS.discardedOne} />
            <ul className="mt-2 flex flex-col gap-2">
              {screen.discarded.map((d) => (
                <li key={d.sealedTo} className="text-[13px]">
                  <div><Bi words={SCREEN_WORDS.discardedSealedTo} inline />: <span className="font-mono break-all">{d.sealedTo}</span></div>
                  {d.now && <div><Bi words={SCREEN_WORDS.discardedNow} inline />: <span className="font-mono break-all">{d.now}</span></div>}
                  <div><Bi words={SCREEN_WORDS.discardedParts} inline />: {d.files}</div>
                </li>
              ))}
            </ul>
          </Callout>
        )}
        <Card className="print:hidden">
          <CardHeader icon={<ShieldIcon size={17} />} title={<Bi words={SCREEN_WORDS.limitsTitle} inline />} divided={false} />
          <CardBody className="text-[13.5px] text-ink-2">
            <Bi words={SCREEN_WORDS.limits} />
          </CardBody>
        </Card>
        <BidForm
          exerciseId={screen.exercise.id}
          token={token}
          reference={screen.exercise.reference}
          title={screen.exercise.title}
          supplierName={actor.supplierName}
          timeZone={screen.exercise.timeZone}
          demonstration={screen.demonstration}
          parts={screen.parts}
          replaceable={screen.replaceable}
          parents={screen.parents}
          bidStands={screen.bidStands}
          alternativesPermitted={screen.alternativesPermitted}
          liveFingerprint={screen.liveFingerprint}
        />
      </div>
    </>
  );
}
