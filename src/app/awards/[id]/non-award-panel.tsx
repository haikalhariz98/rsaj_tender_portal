import { InboxIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { ProvenanceBadge } from "@/components/ui/provenance";
import type { StaffActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { loadNonAwardPanel } from "@/lib/portal/bids/non-award-store";
import { NOTICE_DELIVERY_STATEMENT } from "@/lib/portal/bids/notices";

import { IssueNoticeDrawer } from "./non-award-drawer";

/**
 * "Notices to tenderers" on an award (FR-AWD-010, policy D7, Phase 4d): the organisation's decision whether unsuccessful tenderers are told the outcome, and each one with its notice. Unset says it is unset and
 * issues nothing; the rules are the action's, which judges them again. The notice is shown in the portal and is not sent.
 */
export async function NonAwardPanel({ actor, award }: { actor: Pick<StaffActor, "organisationId">; award: { id: string; exerciseId: string; status: string; awardeePartyId: string | null } }) {
  const p = await loadNonAwardPanel(db, actor.organisationId, award);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          icon={<InboxIcon size={17} />}
          title="Notices to unsuccessful tenderers"
          subtitle={NOTICE_DELIVERY_STATEMENT}
          actions={p.setting === "ON" ? <Badge tone="ok">Issued on request</Badge> : p.setting === "OFF" ? <Badge>Decided against</Badge> : <Badge tone="warn">Not decided</Badge>}
        />
        <CardBody className="flex flex-col gap-3">
          <p className="text-[14px] text-ink-2">{p.words}</p>
          {p.provenance && p.setting !== "NOT_SET" && <ProvenanceBadge value={p.provenance} />}
          {p.setting === "NOT_SET" && <Callout tone="warn">Whether tenderers are told the outcome is a policy of the organisation (D7). Until it is set under Configuration, Awards, nothing is issued and the portal shows tenderers no notice.</Callout>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Tenderers" subtitle="Those whose bid was opened and did not win." />
        {!p.awardStands ? (
          <CardBody>
            <p className="text-[14px] text-ink-2">The award has not been issued, so nobody is yet an unsuccessful tenderer.</p>
          </CardBody>
        ) : !p.awardeeNamed ? (
          <CardBody>
            <Callout tone="warn">This award does not name which tenderer of the exercise it went to, so the unsuccessful tenderers cannot be told apart. Link the award to its bidder first.</Callout>
          </CardBody>
        ) : p.rows.length === 0 ? (
          <CardBody>
            <p className="text-[14px] text-ink-2">No other tenderer had a bid opened on this exercise.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line/70">
            {p.rows.map((r) => (
              <li key={r.partyId} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="font-semibold break-words text-ink">{r.name}</div>
                  <div className="text-[12.5px] break-words text-ink-3">
                    {r.supplier ? `On the register as ${r.supplier}` : "Not linked to a supplier's register entry: it cannot see a notice in the portal"}
                    {r.notice ? ` · Notice issued ${r.notice.issuedOn} by ${r.notice.issuedBy}${r.notice.reasonText ? `. Reason: ${r.notice.reasonText}` : ""}` : ""}
                  </div>
                </div>
                <div className="shrink-0">
                  {r.notice ? <Badge tone="ok">Notice issued</Badge> : p.setting === "ON" ? <IssueNoticeDrawer id={award.id} partyId={r.partyId} name={r.name} carriesReason={p.carriesReason} linked={r.supplier != null} /> : <Badge>No notice</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
