import { GlobeIcon, InboxIcon } from "@/components/icons";
import { DataList, type Row } from "@/components/data-list";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import type { SupplierActor } from "@/lib/auth/types";
import { db } from "@/lib/db";
import { loadMyExercises, loadMyNotices } from "@/lib/portal/bids/list-store";
import { NOTICE_DELIVERY_STATEMENT, NOTICE_KIND_WORDS, unacknowledged } from "@/lib/portal/bids/notices";
import { NO_PART_YET } from "@/lib/portal/bids/part";
import { OPPORTUNITY_STATE, PORTAL_PATH } from "@/lib/portal/labels";

/**
 * The two tabs of My Bids (Phase 4d): the exercises the signed-in supplier takes part in, and the notices it is shown. Each reads only its own slice, as the session's supplier. Rows are data, so the list sorts and
 * searches them on the client.
 */

export async function ExercisesPanel({ actor }: { actor: SupplierActor }) {
  const rows = await loadMyExercises(db, actor);
  const list: Row[] = rows.map((r) => {
    const state = OPPORTUNITY_STATE[r.state];
    return {
      id: r.id,
      cells: {
        exercise: { kind: "stack", title: r.title, sub: r.reference, monoSub: true },
        state: { kind: "badge", text: state.label.en, tone: state.tone === undefined ? undefined : state.tone },
        closing: { kind: "text", text: r.closing ?? "Not set", dim: r.closing == null },
        part: r.chips.length ? { kind: "chips", items: r.chips.map((c) => ({ text: c.text, tone: c.tone })) } : { kind: "text", text: NO_PART_YET, dim: true },
      },
      sortKeys: { closing: r.closingDay ?? "", exercise: r.title.toLowerCase() },
      search: `${r.title} ${r.reference} ${state.label.en} ${r.chips.map((c) => c.text).join(" ")}`,
      views: [r.state === "OPEN" ? "open" : "past", ...(r.chips.some((c) => c.tone === "warn") ? ["attention"] : [])],
    };
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<GlobeIcon size={17} />} title="Exercises you take part in" subtitle="Those your company has done something on, or that the procurement office has linked it to." divided={false} />
      <DataList
        flat
        selectable={false}
        exportName="my-bids"
        searchPlaceholder="Search by title or reference"
        emptyTitle="You are not taking part in any exercise yet"
        emptyBody="Open an advertised opportunity, sign up for its briefing or ask for its documents, and it appears here."
        views={[
          { id: "open", label: "Open" },
          { id: "attention", label: "Waiting for you", emptyTitle: "Nothing waits for you", emptyBody: "An addendum to acknowledge appears here." },
          { id: "past", label: "Closed or awarded" },
        ]}
        rowAction={{ label: "Open", hrefTemplate: "/supplier/bids/{id}" }}
        rowOpens
        stackBelow="xl"
        columns={[
          { key: "exercise", label: "Exercise", sortable: true, mobile: "primary" },
          { key: "state", label: "State", width: "130px", mobile: "meta" },
          { key: "closing", label: "Closes", width: "190px", sortable: true, nowrap: true, mobile: "meta" },
          { key: "part", label: "Your part", width: "320px", mobile: "meta" },
        ]}
        rows={list}
      />
      {rows.length === 0 && (
        <div className="px-6 pb-6">
          <ButtonLink href={PORTAL_PATH.opportunities} variant="secondary" size="sm" icon={<GlobeIcon size={15} />}>
            See what is open
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}

export async function NoticesPanel({ actor }: { actor: SupplierActor }) {
  const notices = await loadMyNotices(db, actor);
  const toAck = unacknowledged(notices);
  const list: Row[] = notices.map((n) => ({
    id: n.key,
    cells: {
      notice: { kind: "link", text: n.title, href: `/supplier/bids/${n.exerciseId}?tab=${n.kind === "ADDENDUM" ? "addenda" : n.kind === "NON_AWARD" ? "outcome" : "addenda"}`, sub: `${n.exerciseReference} · ${n.exerciseTitle}` },
      kind: { kind: "badge", text: NOTICE_KIND_WORDS[n.kind], tone: n.kind === "EXERCISE_CANCELLED" ? "warn" : n.kind === "NON_AWARD" ? "info" : undefined },
      on: { kind: "text", text: n.on },
      state: n.addendum ? (n.addendum.acknowledgedOn ? { kind: "chip", text: "Acknowledged", tone: "ok" } : { kind: "chip", text: "To acknowledge", tone: "warn" }) : { kind: "text", text: "", dim: true },
    },
    sortKeys: { on: n.on },
    search: `${n.title} ${n.exerciseReference} ${n.exerciseTitle} ${NOTICE_KIND_WORDS[n.kind]} ${n.body}`,
  }));
  return (
    <Card className="overflow-hidden">
      <CardHeader icon={<InboxIcon size={17} />} title="Notices" subtitle={NOTICE_DELIVERY_STATEMENT} divided={false} />
      {toAck > 0 && (
        <div className="px-5 pb-4 sm:px-6">
          <Callout tone="warn" title={toAck === 1 ? "1 addendum waits for you to acknowledge it" : `${toAck} addenda wait for you to acknowledge them`}>
            Open the notice to read it and acknowledge it.
          </Callout>
        </div>
      )}
      <DataList
        flat
        selectable={false}
        exportName="my-notices"
        searchPlaceholder="Search the notices"
        emptyTitle="You have no notices"
        emptyBody="An addendum, a change of the closing, a cancellation or a notice of the outcome appears here when the office issues one to a company that bought the documents."
        columns={[
          { key: "notice", label: "Notice", mobile: "primary" },
          { key: "kind", label: "Kind", width: "190px", mobile: "meta" },
          { key: "on", label: "Date", width: "120px", sortable: true, nowrap: true, mobile: "meta" },
          { key: "state", label: "", width: "150px", mobile: "hide" },
        ]}
        rows={list}
      />
    </Card>
  );
}
