import { DataList } from "@/components/data-list";
import { ClipboardIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { dayToDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { latenessWords } from "@/lib/work/labels";
import { PORTAL_ACTION_WORDS, portalGroupWords, portalStatusWords, SEVERITY_WORDS, TYPE_WORDS } from "@/lib/work/labels";
import type { PortalGroupView, PortalItem, PortalRow, PortalWork } from "@/lib/work/portal-read";

import { SENDING_CLOSED } from "./document-words";
import { WorkItemDrawer, type ItemView } from "./work-drawers";
import { workHref } from "./work-form";

/// Said where the contract or the organisation's settings shut the contractor's acts (the standing bar has its own words from the server when an act is tried).
export const WORK_NOT_NOW = "You can't add to this contract right now. Ask the procurement office.";

const dueText = (r: Pick<PortalRow, "dueOn">) => (r.dueOn ? `Due ${formatDate(dayToDate(r.dueOn))}` : null);

function itemView(i: PortalItem): ItemView {
  const r = i.row;
  return {
    ref: r.ref,
    title: r.title,
    typeLabel: TYPE_WORDS[r.type].en,
    status: r.status,
    standing: portalStatusWords(r, i.orgName),
    dueText: dueText(r),
    lateText: latenessWords(r.late),
    description: i.description,
    location: i.location,
    severityLabel: i.severity ? SEVERITY_WORDS[i.severity].en : null,
    happenedText: i.happenedAt ? formatDate(i.happenedAt) : null,
    answer: i.answer,
    mayAnswer: i.mayAnswer,
    action: r.action,
    actionLabel: PORTAL_ACTION_WORDS[r.action].en,
    moves: i.moves,
    files: i.files.map((f) => ({ id: f.attachmentId, filename: f.filename, href: f.href, byYou: f.byYou, onText: formatDate(f.attachedAt) })),
    comments: i.comments.map((c, n) => ({ id: String(n), by: c.by, byYou: c.byYou, body: c.body, atText: formatDate(c.at) })),
  };
}

function Group({ g, contractId, orgName, empty }: { g: PortalGroupView; contractId: string; orgName: string; empty: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<ClipboardIcon size={17} />} title={portalGroupWords(g.group, orgName).en} divided={false} actions={<Badge tone="neutral">{g.total}</Badge>} />
      <DataList
        flat
        selectable={false}
        paging={false}
        toolbar={false}
        emptyTitle={empty}
        stackBelow="xl"
        columns={[
          { key: "ref", label: "Reference", width: "130px", nowrap: true, mobile: "meta" },
          { key: "title", label: "Item", mobile: "primary" },
          { key: "due", label: "Due", width: "170px", nowrap: true, mobile: "meta" },
          { key: "action", label: "Action", width: "170px", mobile: "meta" },
        ]}
        rows={g.rows.map((r) => {
          const late = latenessWords(r.late);
          return {
            id: r.ref,
            search: `${r.ref} ${r.title}`,
            cells: {
              ref: { kind: "text", text: r.ref },
              title: { kind: "stack", title: r.title, sub: portalStatusWords(r, orgName) },
              due: late ? { kind: "chips", items: [{ text: late, tone: "err" as const }] } : r.dueOn ? { kind: "text", text: formatDate(dayToDate(r.dueOn)) } : { kind: "text", text: "No date", dim: true },
              action: { kind: "link", text: PORTAL_ACTION_WORDS[r.action].en, href: workHref(contractId, r.ref), scroll: false },
            },
          };
        })}
      />
      {g.more && <p className="px-5 pb-4 text-[12.5px] text-ink-3 sm:px-6">{`Showing the first ${g.rows.length} of ${g.total}.`}</p>}
    </Card>
  );
}

/**
 * The contractor's Work tab (workspace 3b step 6; WS-13): a list only, in three groups. Waiting for you and With the organisation are always drawn; Closed is a link, drawn only when it
 * holds something. Each row has its reference, title, due day and one button, which opens the item in a drawer. The words are the contractor's: no status name, no code. The page
 * loads this tab's data and nothing of its siblings.
 */
export function WorkPanel({ contractId, work, closed, wanted, item, token }: { contractId: string; work: PortalWork; closed: boolean; wanted: string | null; item: PortalItem | null; token: string | null }) {
  const by = (g: PortalGroupView["group"]) => work.groups.find((x) => x.group === g)!;
  const closedGroup = by("CLOSED");
  return (
    <div className="flex flex-col gap-5">
      {wanted && !item && <Callout tone="warn">That item is not available.</Callout>}
      <Group g={by("WAITING_FOR_YOU")} contractId={contractId} orgName={work.orgName} empty="Nothing waiting for you." />
      <Group g={by("WITH_ORG")} contractId={contractId} orgName={work.orgName} empty={`Nothing with ${work.orgName}.`} />
      {closedGroup.total > 0 &&
        (closed ? (
          <>
            <Group g={closedGroup} contractId={contractId} orgName={work.orgName} empty="Nothing closed." />
            <div>
              <ButtonLink href={workHref(contractId)} size="sm" variant="ghost">Hide closed</ButtonLink>
            </div>
          </>
        ) : (
          <div>
            <ButtonLink href={`${workHref(contractId)}&closed=1`} size="sm" variant="ghost">{`Closed (${closedGroup.total}) ›`}</ButtonLink>
          </div>
        ))}
      {item && <WorkItemDrawer key={item.row.ref} contractId={contractId} token={token} orgName={work.orgName} canAct={item.canAct} cannotWhy={token ? WORK_NOT_NOW : SENDING_CLOSED} item={itemView(item)} />}
    </div>
  );
}
