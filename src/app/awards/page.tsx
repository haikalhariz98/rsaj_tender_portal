import { DataList, type Row } from "@/components/data-list";
import { AwardIcon } from "@/components/icons";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { indentExpiryRaised, indentState } from "@/lib/award/indent";
import { AWARD_STATUS_LABEL, AWARD_STATUS_TONE, INSTRUMENT_SHORT } from "@/lib/award/labels";
import { AWARDS_PAGE, listAwards } from "@/lib/award/repo";
import { returnReadsComplete } from "@/lib/award/stage-two";
import { isLive } from "@/lib/documents/evidence";
import type { AwardStatus, InstrumentKind } from "@/lib/award/types";
import { storedDay } from "@/lib/dates";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";

const STATUS_ORDER: AwardStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED", "CANCELLED"];
const TONE = { brand: "brand", info: "info", ok: "ok", warn: "warn", err: "err", neutral: undefined } as const;
const day = (d: Date | null) => (d ? storedDay(d) : null);

/**
 * Awards across exercises (6.11): what waits for approval, for issue, for its return,
 * or for the finance system's commitment number. The prototype has the award only as a
 * tab of its exercise; this is the work list beside it.
 */
export default async function AwardsPage() {
  await requireStaff();
  const { org, rows, total, policy, counts } = await listAwards();
  const today = org?.today ?? null;
  const list: Row[] = rows.map((r) => {
    const status = r.status as AwardStatus;
    const kind = r.instrumentKind as InstrumentKind;
    const issued = status === "ISSUED" || status === "ACCEPTED";
    const ret = r.awardReturn;
    // OD-5: before acceptance counted with its scans; an accepted award is not re-judged.
    const scanned = new Set(r.attachments.filter(isLive).map((a) => a.purpose as string));
    const back = ret ? returnReadsComplete(r.status, kind, { ...ret, signedLetterReceivedOn: day(ret.signedLetterReceivedOn), declarationReceivedOn: day(ret.declarationReceivedOn), authorisationReceivedOn: day(ret.authorisationReceivedOn) }, scanned) : false;
    const indent = kind === "WORK_INDENT" && today ? indentState(day(r.indentReceivedOn), policy?.indentValidityDays ?? null, today) : null;
    const secs = r.contract?.securities ?? [];
    const pols = r.contract?.policies ?? [];
    const unverified = [...secs, ...pols].filter((x) => x.status === "LODGED").length;
    return {
      id: r.id,
      views: [
        ...(status === "DRAFT" ? ["drafts"] : []),
        ...(status === "PENDING_APPROVAL" ? ["pending"] : []),
        ...(status === "APPROVED" ? ["ready"] : []),
        ...(issued ? ["issued"] : []),
        ...(status === "ISSUED" && !back ? ["return"] : []),
        ...(issued && !r.erpCommitmentNo ? ["commitment"] : []),
        ...(indentExpiryRaised(indent, day(r.commencedOn), status) ? ["expired"] : []),
      ],
      search: [r.awardeeName, r.reference, r.exercise.reference, r.exercise.title, r.contract?.number, AWARD_STATUS_LABEL[status]].filter(Boolean).join(" "),
      sortKeys: { value: Number(r.awardedValue.toString()), awardee: r.awardeeName },
      cells: {
        awardee: { kind: "link", text: r.awardeeName, href: `/awards/${r.id}`, sub: r.exercise.title },
        instrument: { kind: "stack", title: r.reference, sub: `${INSTRUMENT_SHORT[kind]} · ${r.contract ? `contract ${r.contract.number}` : "no contract number yet"}` },
        value: { kind: "money", value: Number(r.awardedValue.toString()) },
        status: { kind: "badge", text: AWARD_STATUS_LABEL[status], tone: TONE[AWARD_STATUS_TONE[status]] },
        checks: {
          kind: "chips",
          items: [
            ...(issued ? [{ text: back ? "Returned" : "Awaiting return", tone: back ? ("ok" as const) : ("warn" as const) }] : []),
            ...(issued ? [{ text: unverified ? `${unverified} to verify` : secs.length + pols.length ? "Securities verified" : "No securities lodged", tone: unverified || !(secs.length + pols.length) ? ("warn" as const) : ("ok" as const) }] : []),
            ...(issued && !r.erpCommitmentNo ? [{ text: "No commitment number", tone: "warn" as const }] : []),
            ...(indentExpiryRaised(indent, day(r.commencedOn), status) ? [{ text: "Indent expired", tone: "err" as const }] : []),
            ...(!issued && status !== "CANCELLED" ? [{ text: status === "APPROVED" ? "To issue" : status === "PENDING_APPROVAL" ? "With the approvers" : "Being prepared", tone: "brand" as const }] : []),
          ],
        },
      },
    };
  });
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <>
      <PageHeader
        title="Awards"
        subtitle="Awards from exercises: approval, the instrument issued, what came back, and securities."
        meta={[`${counts.pending} awaiting approval`, `${counts.ready} approved, not issued`, `${counts.awaitingReturn} awaiting return`, plural(counts.expired, "indent expired", "indents expired")]}
      />
      <Callout tone="info" className="mb-6" title="Opened from the exercise">
        An award is opened from its exercise&apos;s Award tab. Issue is available only once the appointment is approved and every committee&apos;s decision is on record.
      </Callout>
      <Card className="overflow-hidden">
        <CardHeader icon={<AwardIcon size={17} />} title="All awards" subtitle="Newest first. Search finds an award by its awardee, its reference, its exercise or its contract number." divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="awards"
          searchPlaceholder="Search by awardee or reference"
          emptyTitle="No awards yet"
          emptyBody="Open one from an exercise in preparation."
          views={[
            { id: "drafts", label: "Drafts" },
            { id: "pending", label: "Awaiting approval" },
            { id: "ready", label: "Ready to issue" },
            { id: "issued", label: "Issued" },
            { id: "return", label: "Awaiting return" },
            { id: "commitment", label: "No commitment number" },
            { id: "expired", label: "Indents expired" },
          ]}
          filters={[{ key: "status", label: "Status", order: STATUS_ORDER.map((s) => AWARD_STATUS_LABEL[s]) }]}
          rowAction={{ label: "Open", hrefTemplate: "/awards/{id}" }}
          rowOpens
          columns={[
            { key: "awardee", label: "Awardee", sortable: true, mobile: "primary" },
            { key: "instrument", label: "Reference", width: "204px", nowrap: true, hideBelow: "xl" },
            { key: "value", label: "Value", width: "128px", numeric: true, sortable: true, mobile: "meta" },
            { key: "status", label: "Status", width: "192px", sortable: true, mobile: "meta" },
            { key: "checks", label: "Status", width: "190px", hideBelow: "md", mobile: "meta" },
          ]}
          rows={list}
        />
        {total > rows.length && <CardFooter className="text-[12.5px] text-ink-3">Showing the latest {AWARDS_PAGE} of {total}.</CardFooter>}
      </Card>
    </>
  );
}
