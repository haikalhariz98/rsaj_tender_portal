import { ClipboardIcon } from "@/components/icons";
import { Bi } from "@/components/ui/bilingual";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { issueFormToken } from "@/lib/auth/form-secret";
import type { BidScreen } from "@/lib/bids/online/my-bids-store";
import { SCREEN_WORDS } from "@/lib/bids/online/screen-words";
import { SUBMIT_FAULT_WORDS } from "@/lib/bids/online/words";
import { DEMONSTRATION_WORDS } from "@/lib/sealing/switch";

import { SubmissionsList } from "./submissions-list";

/**
 * The "Your bid" tab of an exercise in My Bids (SR-13, ADR 0036 D5 to D8; build plan step 11), shown only where bids are taken online: the way into the submit page, the supplier's own
 * submissions with their numbers, stamps, statuses, receipts and the opening's words, and Withdraw. Where bids are handed in on paper it says so. The data is `loadBidScreen`'s, read as the
 * session's supplier; nothing here is computed.
 */
export function BidPanel({ screen, supplierName }: { screen: BidScreen; supplierName: string }) {
  if (!screen.online) {
    return (
      <Card>
        <EmptyState title={<Bi words={SCREEN_WORDS.paperOnlyTitle} inline />}>
          <Bi words={SUBMIT_FAULT_WORDS.CHANNEL_NOT_ONLINE} />
        </EmptyState>
      </Card>
    );
  }
  const token = issueFormToken("bids");
  const href = `/supplier/bids/${screen.exercise.id}/submit`;
  return (
    <div className="flex flex-col gap-5">
      {screen.demonstration && (
        <Callout tone="warn" title={<Bi words={DEMONSTRATION_WORDS} />}>
          <Bi words={SCREEN_WORDS.demonstrationNote} />
        </Callout>
      )}
      {screen.closed.length > 0 && (
        <Callout tone="warn" title={<Bi words={SCREEN_WORDS.closedTitle} />}>
          <ul className="flex flex-col gap-1.5">{screen.closed.map((x) => <li key={x.en}><Bi words={x} /></li>)}</ul>
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<ClipboardIcon size={17} />}
          title={<Bi words={SCREEN_WORDS.listTitle} inline />}
          subtitle={<Bi words={SCREEN_WORDS.listSubtitle} inline />}
          divided={false}
          actions={
            screen.closed.length === 0 ? (
              <ButtonLink href={href} variant="primary" size="sm">
                <Bi words={SCREEN_WORDS.openSubmitPage} inline inherit />
              </ButtonLink>
            ) : undefined
          }
        />
        <SubmissionsList
          reference={screen.exercise.reference}
          title={screen.exercise.title}
          supplierName={supplierName}
          demonstration={screen.demonstration}
          alternativesPermitted={screen.alternativesPermitted}
          token={token}
          views={screen.submissions}
        />
      </Card>
    </div>
  );
}
