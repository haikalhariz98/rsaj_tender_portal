import type { Row } from "@/components/data-list";
import { matterCount, MEETING_STATUS_LABEL, MEETING_STATUS_TONE } from "@/lib/committee/labels";
import type { listSittings } from "@/lib/committee/sittings";
import { formatDate } from "@/lib/format";

const TONE = { info: "info", brand: "brand", ok: "ok", neutral: undefined } as const;

/**
 * The sittings list's rows, built once for the page and for the export route (7.6). No column of a sitting is SULIT (a sitting shows committee, reference, date,
 * status, matter count and quorum; never a matter's title or value), so `forExport` changes nothing; it is taken so every list's builder is called alike.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- no SULIT column: the export builds the same rows
export function buildSittingRows(sittings: Awaited<ReturnType<typeof listSittings>>["sittings"], _opts: { forExport: boolean }): Row[] {
  return sittings.map((s) => ({
    id: s.id,
    views: [
      ...(s.status === "SCHEDULED" ? ["upcoming"] : []),
      ...(s.status === "IN_PROGRESS" ? ["awaiting"] : []),
    ],
    search: [s.committeeName, s.reference, MEETING_STATUS_LABEL[s.status]].join(" "),
    sortKeys: { date: s.meetingDate.getTime(), matters: s.matters },
    cells: {
      committee: { kind: "text", text: s.committeeName },
      reference: { kind: "link", text: s.reference, href: `/committees/${s.id}` },
      date: { kind: "text", text: formatDate(s.meetingDate) },
      status: { kind: "badge", text: MEETING_STATUS_LABEL[s.status], tone: TONE[MEETING_STATUS_TONE[s.status]] },
      matters: {
        kind: "text",
        text: matterCount(s.matters, s.pending),
        dim: s.matters === 0,
      },
      quorum:
        s.status === "CANCELLED"
          ? { kind: "text", text: "—", dim: true }
          : s.quorum == null
          ? { kind: "badge", text: "Not set", tone: "warn" }
          : s.status === "SCHEDULED"
            ? { kind: "text", text: `${s.quorum} required`, dim: true }
            : { kind: "badge", text: `${s.present} of ${s.quorum}`, tone: s.quorumState === "MET" ? "ok" : "warn" },
    },
  }));
}
