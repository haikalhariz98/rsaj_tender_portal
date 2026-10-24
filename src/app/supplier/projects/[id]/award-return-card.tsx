import { ClipboardIcon, InboxIcon } from "@/components/icons";
import { Blocked } from "@/components/ui/blocked";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { RuleInfo } from "@/components/ui/rule-info";
import { KeyValues } from "@/components/ui/stat";
import { formatDate } from "@/lib/format";
import { expiredLine, NOT_SIGNER_RULE, PAPER_LINE, type AwardCardView } from "@/lib/portal/projects/award-card";

import { AcceptDrawer, AskQuestionDrawer } from "./award-return-drawer";
import { SENDING_CLOSED } from "./document-words";

const day = (d: string | null) => (d ? formatDate(d) : "Not recorded");

/**
 * "Accept the award" on the contractor's project (Wave V, V4): what was issued, the finance number when it is recorded, and where the return stands. One primary action, Accept, drawn only
 * when this account may sign and the organisation can take the return online. Where it cannot, the card says to return the documents on paper and names no setting. The identity card number
 * a lodged page held is not in the view, so it cannot be drawn.
 */
export function AwardReturnCard({ view, token }: { view: AwardCardView; token: string | null }) {
  return (
    <Card>
      <CardHeader
        icon={<ClipboardIcon size={17} />}
        title={view.title}
        divided
        actions={
          view.action === "ACCEPT" && view.form ? (
            token ? <AcceptDrawer contractId={view.contractId} token={token} form={view.form} /> : <Blocked label={view.form.resend ? "Send again" : "Accept"} reason={SENDING_CLOSED} primary />
          ) : view.action === "NOT_SIGNER" ? (
            <RuleInfo rule={NOT_SIGNER_RULE} label="Who can accept" />
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        <KeyValues
          columns={2}
          items={[
            { label: "Document", value: view.instrumentLabel },
            { label: "Issued", value: day(view.issuedOn) },
            ...(view.commitment ? [{ label: "Finance reference", value: view.commitment }] : []),
            ...(view.validUntil ? [{ label: "Valid until", value: formatDate(view.validUntil) }] : []),
          ]}
        />
        {view.state === "WAITING" && <p className="text-[14px] text-ink">Sent {day(view.sentOn)} · Being checked</p>}
        {view.state === "VERIFIED" && <p className="text-[14px] text-ink">Accepted {day(view.acceptedOn)}</p>}
        {view.state === "REFUSED" && (
          <Callout tone="warn" title="Returned">
            {view.refusedReason ?? "The office returned it without a reason."}
          </Callout>
        )}
        {view.action === "PAPER" && <p className="text-[14px] text-ink">{PAPER_LINE}</p>}
        {view.action === "EXPIRED" && view.validUntil && <p className="text-[14px] text-ink">{expiredLine(view.validUntil)}</p>}
      </CardBody>
    </Card>
  );
}

/// The questions the contractor has put to the office about the award, and the answers. Asking is open only while the award is issued; answers are read in any status.
export function AwardQuestionsCard({ view, token }: { view: AwardCardView; token: string | null }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<InboxIcon size={17} />}
        title="Questions"
        divided={view.queries.length > 0}
        actions={view.mayAsk ? token ? <AskQuestionDrawer contractId={view.contractId} token={token} /> : <Blocked label="Ask a question" reason={SENDING_CLOSED} /> : undefined}
      />
      {view.queries.length === 0 ? (
        <EmptyState size="sm" title="No questions yet" />
      ) : (
        <ul className="divide-y divide-line/70">
          {view.queries.map((q) => (
            <li key={q.id} className="flex flex-col gap-1.5 px-5 py-3.5 sm:px-6">
              <span className="text-[12.5px] text-ink-3">Asked {day(q.askedOn)}</span>
              <span className="text-[14px] break-words whitespace-pre-line text-ink">{q.body}</span>
              {q.answer ? (
                <span className="text-[14px] break-words whitespace-pre-line text-ink-2">
                  <span className="font-semibold text-ink">Answer, {day(q.answeredOn)}. </span>
                  {q.answer}
                </span>
              ) : (
                <span className="text-[13px] text-ink-3">Waiting for an answer</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
