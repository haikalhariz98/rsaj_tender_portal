import type { Row } from "@/components/data-list";
import { PlusIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { nameRoutesOf } from "@/lib/method/approval";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_ORDER, EXERCISE_STATUS_TONE, REGIME_SHORT, TERM } from "@/lib/method/labels";
import { EXERCISES_PAGE, listExercises, loadMethodConfig } from "@/lib/method/repo";
import type { ExerciseStatus, Regime } from "@/lib/method/types";
import { isPublished } from "@/lib/window/phase";

import { CLOSING_SOON_DAYS, closesSoon } from "@/lib/window/closing-soon";
import { windowColumns } from "@/lib/window/read";

import { ExerciseList } from "./exercise-list";

export const dynamic = "force-dynamic";

const TONE = { brand: "brand", info: "info", ok: "ok", neutral: undefined } as const;

/**
 * Sourcing exercises (6.3): classified here in Phase 1 — bands, method, contract type
 * and basis — while the sourcing itself still runs outside the portal (§13.3).
 */
export default async function SourcingPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const { org, rows, total } = await listExercises();
  const cfg = org ? await loadMethodConfig(org.id) : null;
  const methodName = (c: string) => cfg?.config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured";
  const typeName = (c: string | null) => (c ? (cfg?.config.types.find((t) => t.code === c)?.nameEn ?? "A type no longer configured") : "Not set");

  // 6.5: each exercise's closing and phase, derived now from the stored instants (ADR 0014).
  const win = await windowColumns(rows.map((r) => r.id));
  const today = org?.today ?? null;
  const awaitingName = rows.filter((r) => r.status !== "CANCELLED" && nameRoutesOf(r.approvalInstances).some((i) => i.status === "PENDING")).length;
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
        ...(r.onBoundary && status !== "CANCELLED" ? ["boundary"] : []),
        ...(nameOpen ? ["name"] : []),
      ],
      search: [r.title, r.reference, r.requisition.reference, r.requisition.erpRequisitionNo, methodName(r.sourcingMethodCode), EXERCISE_STATUS_LABEL[status]].filter(Boolean).join(" "),
      sortKeys: { value: Number(r.estimatedValue.toString()), title: r.title },
      cells: {
        title: { kind: "link", text: r.title, href: `/sourcing/${r.id}`, sub: `${r.reference} · ${methodName(r.sourcingMethodCode)}` },
        method: { kind: "stack", title: methodName(r.sourcingMethodCode), sub: typeName(r.contractTypeCode) },
        value: { kind: "money", value: Number(r.estimatedValue.toString()) },
        window: { kind: "stack", title: r.closingAt ? w?.closing ?? "—" : status === "CANCELLED" ? "No closing" : "Not set yet", sub: r.closingAt ? w?.phase : status === "CANCELLED" ? "Cancelled before one was set" : undefined },
        status: { kind: "badge", text: EXERCISE_STATUS_LABEL[status], tone: TONE[EXERCISE_STATUS_TONE[status]] },
        checks: {
          kind: "chips",
          items: [
            { text: r.regime ? REGIME_SHORT[r.regime as Regime] : "Regime not determined", tone: "brand" as const },
            ...(r.onBoundary ? [{ text: r.boundaryRuled ? "On the boundary" : "On the boundary · not ruled", tone: "warn" as const }] : []),
            ...(nameOpen ? [{ text: `${TERM.nameApproval} in progress`, tone: "brand" as const }] : nameApproved ? [{ text: `${TERM.nameApproval} given`, tone: "ok" as const }] : []),
            ...(r.restricted ? [{ text: "Restricted · not enforced until sign-in", tone: "warn" as const }] : []),
          ],
        },
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Sourcing"
        subtitle="Exercises opened on approved requisitions: value band, method, contract type and basis."
        meta={[
          // The state's own label, as the dashboard counts it: one name for one state.
          ...(["DRAFT", "DOCUMENTS_IN_PREPARATION", "PENDING_APPROVAL_FOR_TENDERING", "ADVERTISED", "INVITED"] as const).map((s) => `${rows.filter((r) => r.status === s).length} ${EXERCISE_STATUS_LABEL[s].toLowerCase()}`),
          `${awaitingName} awaiting name approval`,
          `${rows.filter((r) => r.onBoundary && r.status !== "CANCELLED").length} on the boundary`,
        ]}
        actions={
          org ? (
            <ButtonLink href="/sourcing/new" variant="primary" size="md" icon={<PlusIcon size={16} />}>
              {TERM.newExercise}
            </ButtonLink>
          ) : undefined
        }
      />

      <Callout tone="info" className="mb-6" title="Bids and evaluation run outside the portal in this phase">
        An exercise is classified here: its three value bands, sourcing method, contract type and basis, and who approves the name and the appointment. Its tender documents are prepared and approved here, and its window is recorded here: advertisement or invitation, sale of the documents, briefings and addenda. Receiving bids and evaluation are still recorded outside the portal.
      </Callout>

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
          { id: "boundary", label: "On the boundary" },
          { id: "name", label: `${TERM.nameApproval} in progress` },
        ]}
        filters={[{ key: "status", label: "Status", order: EXERCISE_STATUS_ORDER.map((s) => EXERCISE_STATUS_LABEL[s]) }]}
        rowAction={{ label: "Open", hrefTemplate: "/sourcing/{id}" }}
        rowOpens
        columns={[
          { key: "title", label: "Exercise", sortable: true, mobile: "primary" },
          { key: "method", label: "Method and contract type", width: "22%", hideBelow: "2xl" },
          { key: "value", label: "Value", width: "156px", numeric: true, sortable: true, sulit: true, mobile: "meta" },
          { key: "window", label: "Closing", width: "190px", hideBelow: "lg", mobile: "meta" },
          { key: "status", label: "Status", width: "230px", sortable: true, mobile: "meta" },
          { key: "checks", label: "Band and checks", width: "220px", hideBelow: "2xl", mobile: "meta" },
        ]}
        rows={list}
        footer={total > rows.length ? <CardFooter className="text-[12.5px] text-ink-3">Showing the latest {EXERCISES_PAGE} of {total}.</CardFooter> : undefined}
      />
    </>
  );
}
