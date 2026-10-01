import type { ReactNode } from "react";

import { OwnerDocumentsButton } from "@/components/attachments/owner-documents-button";
import { FileIcon } from "@/components/icons";
import { Badge, Chip } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import type { addendaTab } from "@/lib/window/read";

import { DeliveryList } from "./common";
import { AddendumDeliveryDrawer, AddendumDrawer, IssueAddendumDrawer, VoidAddendumDrawer } from "./editors";
import type { WindowContext } from "./window-section";

type Addenda = NonNullable<Awaited<ReturnType<typeof addendaTab>>>;

export function addendaHeader(d: Addenda, c: WindowContext): { actions: ReactNode; notes: [string, string][] } {
  return {
    actions: <AddendumDrawer exerciseId={c.exerciseId} allowed={d.draft} closingChanges={d.closingChanges} />,
    notes: d.draft.allowed ? [] : [["Draft an addendum", d.draft.reason]],
  };
}

const notifiedTone = (text: string) => {
  const m = /^(\d+) of (\d+)/.exec(text);
  return !m ? "neutral" : m[1] === m[2] ? "ok" : "warn";
};
const tone = (s: string) => (s === "Issued" ? "ok" : s === "Voided" ? "neutral" : "info") as "ok" | "neutral" | "info";

/**
 * The Addenda section (FR-ADV-014): the register of addenda, each numbered as it is issued, with
 * what it changes, its signed copy, and a line per recipient showing how it was delivered. The
 * recipients are the sale register as it stood when it was issued; a later purchaser receives it
 * with the documents. Delivery is recorded by the officer, never sent by the portal.
 */
export function AddendaSection({ d, c }: { d: Addenda; c: WindowContext }) {
  if (d.addenda.length === 0) {
    return (
      <Card>
        <EmptyState size="sm" title="No addendum">
          {d.draft.allowed ? "A change to the documents during the window is made by an addendum. Draft one here: it is numbered when issued and goes to everyone on the sale register." : d.windowClosed ? "None was issued. The window has closed." : d.draft.reason}
        </EmptyState>
      </Card>
    );
  }
  const issued = d.addenda.filter((a) => a.status === "Issued");
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-ink-3">
        {issued.length} issued{d.addenda.length > issued.length ? `, ${d.addenda.length - issued.length} not issued` : ""}. Issued addenda are numbered one after the other, with no gap.
      </p>
      {d.addenda.map((a) => {
        const draft = a.status === "Draft";
        return (
          <Card key={a.id} className="overflow-hidden">
            <CardHeader
              icon={<FileIcon size={17} />}
              title={`${a.number} · ${a.title}`}
              subtitle={a.issuedOn ? `Issued ${a.issuedOn}.` : draft ? "Not issued: it takes its number when it is issued." : (a.voidReason ?? "")}
              actions={
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone(a.status)}>{a.status}</Badge>
                  {a.notified && <Chip tone={notifiedTone(a.notified)}>{a.notified}</Chip>}
                </span>
              }
            />
            <CardBody className="flex flex-col gap-4">
              <KeyValues
                columns={2}
                items={[
                  { label: "What it changes", value: <span className="break-words whitespace-pre-line">{a.whatChanged}</span> },
                  { label: "Signed copy", value: <span className="flex flex-wrap items-center gap-2"><Chip tone={a.signedCopy === "Attached" ? "ok" : draft ? "warn" : "neutral"}>{a.signedCopy}</Chip>{a.attach && <OwnerDocumentsButton owner={{ kind: "addendum", id: a.id }} label={a.title} title="Signed copy" subtitle="The addendum as signed, kept against it. It must be attached before the addendum can be issued." options={{ only: ["ADDENDUM_SIGNED"] }} />}</span> },
                  ...(a.closingChange ? [{ label: "Announces", value: a.closingChange }] : []),
                ]}
              />
              {a.text && (
                <details className="text-[13.5px]">
                  <summary className="cursor-pointer font-semibold text-ink-3">Read the addendum as issued</summary>
                  <p className="mt-3 break-words whitespace-pre-line text-ink-2">{a.text}</p>
                </details>
              )}
              {draft && (
                <div className="flex flex-wrap items-center gap-2">
                  <AddendumDrawer exerciseId={c.exerciseId} allowed={d.draft} closingChanges={d.closingChanges} draft={{ id: a.id, label: a.title, title: a.title, whatChanged: a.whatChanged }} />
                  <VoidAddendumDrawer exerciseId={c.exerciseId} addendumId={a.id} label={a.title} />
                  {a.issue && <IssueAddendumDrawer exerciseId={c.exerciseId} addendumId={a.id} label={a.title} allowed={a.issue} recipients={d.willGoTo === 0 ? "Nobody has bought the documents yet: there are no purchasers to notify" : `${d.willGoTo} ${d.willGoTo === 1 ? "purchaser" : "purchasers"} on the sale register`} />}
                  {a.issue && !a.issue.allowed && <span className="max-w-xl text-[12.5px] text-ink-3">{a.issue.reason}</span>}
                </div>
              )}
            </CardBody>
            {a.status === "Issued" && (
              a.recipients.length === 0 ? (
                <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3 sm:px-6">No purchasers to notify: it goes to anyone who buys the documents from now on, with the documents.</p>
              ) : (
                <DeliveryList
                  items={a.recipients.map((r) => ({
                    id: r.id,
                    who: r.recipient,
                    given: r.given,
                    delivery: r,
                    action: <AddendumDeliveryDrawer exerciseId={c.exerciseId} id={r.id} who={r.recipient} withDocuments={!!r.given} values={r.raw} />,
                  }))}
                />
              )
            )}
          </Card>
        );
      })}
    </div>
  );
}
