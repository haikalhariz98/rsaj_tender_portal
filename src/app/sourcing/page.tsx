import type { Row } from "@/components/data-list";
import { PlusIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { nameRoutesOf } from "@/lib/method/approval";
import { BOUNDARY_VIEW_ABOUT, boundaryCountNote, boundaryShown } from "@/lib/method/boundary-reading";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_ORDER, EXERCISE_STATUS_TONE, REGIME_SHORT, TERM } from "@/lib/method/labels";
import { EXERCISES_PAGE, listExercises, loadMethodConfig } from "@/lib/method/repo";
import type { ExerciseStatus, Regime } from "@/lib/method/types";
import { isPublished } from "@/lib/window/phase";

import { CLOSING_SOON_DAYS, closesSoon } from "@/lib/window/closing-soon";
import { windowColumns } from "@/lib/window/read";

import { ExerciseList } from "./exercise-list";
import { requireStaff } from "@/app/_auth/actor";
import { hiddenExercises, sulitExerciseValues } from "@/app/_auth/sulit";
import type { Sulit } from "@/lib/auth/sulit-access";

export const dynamic = "force-dynamic";

/// The value column's cell: the figure where the reader may read it, and "SULIT · withheld" with the reason where not.
const valueCell = (v: Sulit<number> | undefined): Row["cells"][string] => (v && v.state === "GRANTED" ? { kind: "money", value: v.value } : { kind: "withheld", words: v?.state === "WITHHELD" ? v.words.en : "This value is not shown." });

const TONE = { brand: "brand", info: "info", ok: "ok", neutral: undefined } as const;

/**
 * Sourcing exercises (6.3): classified here in Phase 1 — bands, method, contract type
 * and basis — while the sourcing itself still runs outside the portal (§13.3).
 */
export default async function SourcingPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireStaff();
  const { view } = await searchParams;
  // FR-MTD-007: a restricted exercise the reader is not named on is not in the list, the counts or the search.
  const { org, rows, total } = await listExercises(actor.organisationId, await hiddenExercises(actor));
  // The department estimate is SULIT: each row's is judged for this reader and the access logged (ADR 0034 D14).
  const values = await sulitExerciseValues(actor, rows.map((r) => ({ id: r.id, reference: r.reference })), "estimatedValue", (id) => Number(rows.find((r) => r.id === id)!.estimatedValue.toString()));
  const cfg = org ? await loadMethodConfig(org.id) : null;
  const methodName = (c: string) => cfg?.config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured";
  const typeName = (c: string | null) => (c ? (cfg?.config.types.find((t) => t.code === c)?.nameEn ?? "A type no longer configured") : "Not set");

  // 6.5: each exercise's closing and phase, derived now from the stored instants (ADR 0014).
  const win = await windowColumns(actor.organisationId, rows.map((r) => r.id));
  const today = org?.today ?? null;
  const awaitingName = rows.filter((r) => r.status !== "CANCELLED" && nameRoutesOf(r.approvalInstances).some((i) => i.status === "PENDING")).length;
  // "On the boundary" states the estimate (ruling of 2026-10-08 on log line 1716), so it is said only for the rows whose estimate this reader may read: the chip, the view, the count.
  const onBoundary = (r: (typeof rows)[number]) => boundaryShown(r.onBoundary, values.get(r.id)?.state === "GRANTED");
  const boundaryRows = rows.filter((r) => onBoundary(r) && r.status !== "CANCELLED").length;
  const boundaryLeftOut = rows.filter((r) => r.onBoundary && r.status !== "CANCELLED" && !onBoundary(r)).length;
  const list: Row[] = rows.map((r) => {
    const status = r.status as ExerciseStatus;
    const nameOpen = status !== "CANCELLED" && nameRoutesOf(r.approvalInstances).some((i) => i.status === "PENDING");
    const nameApproved = status !== "CANCELLED" && nameRoutesOf(r.approvalInstances).some((i) => i.status === "APPROVED");
    const w = win.get(r.id);
    const live = isPublished(status);
    return {
      id: r.id,
      views: [
        ...(live && w?.phaseCode === "OPEN_FOR_PURCHASE" ? ["open"] : []),
        ...(live && w && closesSoon({ today, closingDay: w.closingDay, phase: w.phaseCode }) ? ["soon"] : []),
        ...(status === "DRAFT" ? ["drafts"] : []),
        ...(status === "DOCUMENTS_IN_PREPARATION" ? ["preparing"] : []),
        ...(status === "PENDING_APPROVAL_FOR_TENDERING" ? ["approval"] : []),
        ...(onBoundary(r) && status !== "CANCELLED" ? ["boundary"] : []),
        ...(nameOpen ? ["name"] : []),
      ],
      search: [r.title, r.reference, r.requisition.reference, r.requisition.erpRequisitionNo, methodName(r.sourcingMethodCode), EXERCISE_STATUS_LABEL[status]].filter(Boolean).join(" "),
      // A withheld value has no sort key: the order of the column would give it away.
      sortKeys: { ...(values.get(r.id)?.state === "GRANTED" ? { value: Number(r.estimatedValue.toString()) } : {}), title: r.title },
      cells: {
        title: { kind: "link", text: r.title, href: `/sourcing/${r.id}`, sub: `${r.reference} · ${methodName(r.sourcingMethodCode)}` },
        method: { kind: "stack", title: methodName(r.sourcingMethodCode), sub: typeName(r.contractTypeCode) },
        value: valueCell(values.get(r.id)),
        window: { kind: "stack", title: r.closingAt ? w?.closing ?? "—" : status === "CANCELLED" ? "No closing" : "Not set yet", sub: r.closingAt ? w?.phase : status === "CANCELLED" ? "Cancelled before one was set" : undefined },
        status: { kind: "badge", text: EXERCISE_STATUS_LABEL[status], tone: TONE[EXERCISE_STATUS_TONE[status]] },
        checks: {
          kind: "chips",
          items: [
            { text: r.regime ? REGIME_SHORT[r.regime as Regime] : "Regime not determined", tone: "brand" as const },
            ...(onBoundary(r) ? [{ text: r.boundaryRuled ? "On the boundary" : "On the boundary · not ruled", tone: "warn" as const }] : []),
            ...(nameOpen ? [{ text: `${TERM.nameApproval} in progress`, tone: "brand" as const }] : nameApproved ? [{ text: `${TERM.nameApproval} given`, tone: "ok" as const }] : []),
            ...(r.restricted ? [{ text: "Restricted to its named people", tone: "warn" as const }] : []),
          ],
        },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Sourcing"
        /* Founder, 2026-10-05: what the screen covers sits behind the information button beside the title,
           not as a notice across the top. Brought up to date: bids, opening and evaluation are recorded here now. */
        info={{
          title: "What is recorded here",
          text: "An exercise is classified here: its value bands, sourcing method, contract type and basis, and who approves the name and the appointment. Its tender documents and its window (advertisement or invitation, sale of the documents, briefings and addenda) are prepared and recorded here, and so are the bids received on paper, their opening and their evaluation. Suppliers cannot submit bids online yet: that waits for the supplier portal, which needs sign-in.",
        }}
        subtitle="Exercises opened on approved requisitions: value band, method, contract type and basis."
        meta={[
          // The state's own label, as the dashboard counts it: one name for one state.
          ...(["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "ADVERTISED", "INVITED"] as const).map((s) => `${rows.filter((r) => r.status === s).length} ${EXERCISE_STATUS_LABEL[s].toLowerCase()}`),
          `${awaitingName} awaiting name approval`,
          `${boundaryRows} on the boundary`,
          // Said in words, so that a count of zero is never read as "none are": the rows whose estimate is withheld from this reader are not counted.
          ...(boundaryCountNote(boundaryLeftOut) ? [boundaryCountNote(boundaryLeftOut)!] : []),
        ]}
        actions={
          org ? (
            <ButtonLink href="/sourcing/new" variant="primary" size="md" icon={<PlusIcon size={16} />}>
              {TERM.newExercise}
            </ButtonLink>
          ) : undefined
        }
      />

      <ExerciseList
        flat
        selectable={false}
        exportName="sourcing-exercises"
        searchPlaceholder="Search by title or reference"
        emptyTitle="No sourcing exercises yet"
        emptyBody="Open one from an approved requisition."
        initialView={view}
        views={[
          { id: "drafts", label: EXERCISE_STATUS_LABEL.DRAFT },
          { id: "preparing", label: EXERCISE_STATUS_LABEL.DOCUMENTS_IN_PREPARATION },
          { id: "approval", label: EXERCISE_STATUS_LABEL.PENDING_APPROVAL_FOR_TENDERING },
          { id: "open", label: "Open for purchase" },
          {
            id: "soon",
            label: `Closing within ${CLOSING_SOON_DAYS} days`,
            about: `Published exercises closing today or in the next ${CLOSING_SOON_DAYS - 1} days, in the organisation's time. A closing that has already passed, even earlier today, is not counted.`,
            emptyTitle: `Nothing closes within ${CLOSING_SOON_DAYS} days`,
            emptyBody: "Pick another view, or show all records.",
          },
          { id: "boundary", label: "On the boundary", about: BOUNDARY_VIEW_ABOUT },
          { id: "name", label: `${TERM.nameApproval} in progress` },
        ]}
        filters={[{ key: "status", label: "Status", order: EXERCISE_STATUS_ORDER.map((s) => EXERCISE_STATUS_LABEL[s]) }]}
        rowAction={{ label: "Open", hrefTemplate: "/sourcing/{id}" }}
        rowOpens
        columns={[
          // Founder, 2026-10-05: the exercise's title was squeezed to a sliver by the fixed columns. It keeps
          // at least 260px (the table scrolls in its card rather than squeeze it) and the others are narrower.
          { key: "title", label: "Exercise", minWidth: "260px", sortable: true, mobile: "primary" },
          { key: "method", label: "Method and contract type", width: "18%", hideBelow: "2xl" },
          { key: "value", label: "Value", width: "132px", numeric: true, sortable: true, sulit: true, sulitLabel: "SULIT. Shown to the people named on each exercise and to the roles the organisation has chosen; withheld from everyone else. Not exported.", mobile: "meta" },
          { key: "window", label: "Closing", width: "168px", hideBelow: "lg", mobile: "meta" },
          { key: "status", label: "Status", width: "200px", sortable: true, mobile: "meta" },
          { key: "checks", label: "Band and checks", width: "168px", hideBelow: "2xl", mobile: "meta" },
        ]}
        rows={list}
        footer={total > rows.length ? <CardFooter className="text-[12.5px] text-ink-3">Showing the latest {EXERCISES_PAGE} of {total}.</CardFooter> : undefined}
      />
    </>
  );
}
