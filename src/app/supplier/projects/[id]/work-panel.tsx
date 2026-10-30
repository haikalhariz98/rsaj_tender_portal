import { DataList } from "@/components/data-list";
import { ClipboardIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { dayToDate } from "@/lib/dates";
import { SCAN_LABEL } from "@/lib/documents/labels";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import { NOT_SCANNED_LABEL } from "@/lib/ui/upload-logic";
import { latenessWords } from "@/lib/work/labels";
import { PORTAL_ACTION_WORDS, portalGroupWords, portalStatusWords, SEVERITY_WORDS, TYPE_WORDS } from "@/lib/work/labels";
import type { PortalGroupView, PortalItem, PortalRow, PortalWork } from "@/lib/work/portal-read";

import { SENDING_CLOSED } from "./document-words";
import { WorkItemDrawer, type ItemView } from "./work-drawers";
import { workHref } from "./work-form";

/// Said where the contract or the organisation's settings shut the contractor's acts (the standing bar has its own words from the server when an act is tried).
export const WORK_NOT_NOW = "You can't add to this contract right now. Ask the procurement office.";

const dueText = (r: Pick<PortalRow, "dueOn">) => (r.dueOn ? `Due ${formatDate(dayToDate(r.dueOn))}` : null);

/// `timeZone` is the organisation's (`PortalWork.timeZone`): a reply near midnight reads on the organisation's day, not the server's.
function itemView(i: PortalItem, timeZone: string | null): ItemView {
  const r = i.row;
  return {
    ref: r.ref,
    label: r.label,
    title: r.title,
    typeLabel: TYPE_WORDS[r.type].en,
    status: r.status,
    standing: portalStatusWords(r, i.orgName),
    dueText: dueText(r),
    lateText: latenessWords(r.late),
    description: i.description,
    returnNote: i.returnNote,
    location: i.location,
    severityLabel: i.severity ? SEVERITY_WORDS[i.severity].en : null,
    happenedText: i.happenedAt ? formatOrgDateTime(i.happenedAt, timeZone) : null,
    answer: i.answer,
    mayAnswer: i.mayAnswer,
    mayPost: i.mayPost,
    action: r.action,
    actionLabel: PORTAL_ACTION_WORDS[r.action].en,
    moves: i.moves,
    files: i.files.map((f) => ({ id: f.attachmentId, filename: f.filename, href: f.href, byYou: f.byYou, onText: formatOrgDateTime(f.attachedAt, timeZone), scanLabel: f.scanLabel, scanText: f.scanLabel === SCAN_LABEL.NOT_SCANNED ? NOT_SCANNED_LABEL : f.scanLabel, scanBad: f.scanLabel === SCAN_LABEL.THREAT })),
    comments: i.comments.map((c, n) => ({ id: String(n), by: c.by, byYou: c.byYou, body: c.body, atText: formatOrgDateTime(c.at, timeZone) })),
  };
}

/// The address of one page of the Work tab (the closed list kept when it is open).
const pageHref = (contractId: string, closed: boolean, page: number) => `${workHref(contractId)}${closed ? "&closed=1" : ""}${page > 0 ? `&workPage=${page}` : ""}`;

function Group({ g, contractId, orgName, empty, closed, page }: { g: PortalGroupView; contractId: string; orgName: string; empty: string; closed: boolean; page: number }) {
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
            search: `${r.label} ${r.title}`,
            cells: {
              ref: { kind: "text", text: r.label },
              title: { kind: "stack", title: r.title, sub: portalStatusWords(r, orgName) },
              due: r.dueOn && late ? { kind: "chips", items: [{ text: `${formatDate(dayToDate(r.dueOn))} · ${late}`, tone: "err" as const }] } : r.dueOn ? { kind: "text", text: formatDate(dayToDate(r.dueOn)) } : { kind: "text", text: "No date", dim: true },
              action: { kind: "link", text: PORTAL_ACTION_WORDS[r.action].en, href: workHref(contractId, r.ref), label: `${PORTAL_ACTION_WORDS[r.action].en}: ${r.label}, ${r.title}`, scroll: false },
            },
          };
        })}
      />
      {(g.more || g.from > 0) && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4 sm:px-6">
          <p className="mr-auto text-[12.5px] text-ink-3">{g.from === 0 ? `Showing the first ${g.rows.length} of ${g.total}.` : `Showing ${g.from + 1} to ${g.from + g.rows.length} of ${g.total}.`}</p>
          {g.from > 0 && <ButtonLink href={pageHref(contractId, closed, page - 1)} size="sm" variant="ghost">Previous</ButtonLink>}
          {g.more && <ButtonLink href={pageHref(contractId, closed, page + 1)} size="sm" variant="ghost">Next</ButtonLink>}
        </div>
      )}
    </Card>
  );
}

/**
 * The contractor's Work tab (workspace 3b step 6; WS-13): a list only, in three groups. Waiting for you and With the organisation are always drawn; Closed is a link, drawn only when it
 * holds something. Each row has its reference, title, due day and one button, which opens the item in a drawer. The words are the contractor's: no status name, no code. The page
 * loads this tab's data and nothing of its siblings.
 */
export function WorkPanel({ contractId, work, closed, workPage = 0, wanted, item, token }: { contractId: string; work: PortalWork; closed: boolean; /** The page of every group that is long (0 is the first). */ workPage?: number; wanted: string | null; item: PortalItem | null; token: string | null }) {
  const by = (g: PortalGroupView["group"]) => work.groups.find((x) => x.group === g)!;
  const closedGroup = by("CLOSED");
  return (
    <div className="flex flex-col gap-5">
      {wanted && !item && <Callout tone="warn">That item is not available.</Callout>}
      <Group g={by("WAITING_FOR_YOU")} contractId={contractId} orgName={work.orgName} empty="Nothing waiting for you." closed={closed} page={workPage} />
      <Group g={by("WITH_ORG")} contractId={contractId} orgName={work.orgName} empty={`Nothing with ${work.orgName}.`} closed={closed} page={workPage} />
      {closedGroup.total > 0 &&
        (closed ? (
          <>
            <Group g={closedGroup} contractId={contractId} orgName={work.orgName} empty="Nothing closed." closed={closed} page={workPage} />
            <div>
              <ButtonLink href={workHref(contractId)} size="sm" variant="ghost">Hide closed</ButtonLink>
            </div>
          </>
        ) : (
          <div>
            <ButtonLink href={`${workHref(contractId)}&closed=1`} size="sm" variant="ghost">{`Closed (${closedGroup.total})`}</ButtonLink>
          </div>
        ))}
      {item && <WorkItemDrawer key={item.row.ref} contractId={contractId} token={token} orgName={work.orgName} canAct={item.canAct} cannotWhy={token ? WORK_NOT_NOW : SENDING_CLOSED} item={itemView(item, work.timeZone)} />}
    </div>
  );
}
