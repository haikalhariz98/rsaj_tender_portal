import { DataList, type Row } from "@/components/data-list";
import { GlobeIcon, PlusIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { EXERCISE_STATUS_LABEL, EXERCISE_STATUS_TONE, REGIME_SHORT } from "@/lib/method/labels";
import { EXERCISES_PAGE, listExercises, loadMethodConfig } from "@/lib/method/repo";
import type { ExerciseStatus, Regime } from "@/lib/method/types";

export const dynamic = "force-dynamic";

const STATUS_ORDER: ExerciseStatus[] = ["DRAFT", "DOCUMENTS_IN_PREPARATION", "CANCELLED"];
const TONE = { brand: "brand", info: "info", neutral: undefined } as const;

/**
 * Sourcing exercises (6.3): classified here in Phase 1 — bands, method, contract type
 * and basis — while the sourcing itself still runs outside the portal (§13.3).
 */
export default async function SourcingPage() {
  const { org, rows, total } = await listExercises();
  const cfg = org ? await loadMethodConfig(org.id) : null;
  const methodName = (c: string) => cfg?.config.methods.find((m) => m.code === c)?.nameEn ?? "A method no longer configured";
  const typeName = (c: string | null) => (c ? (cfg?.config.types.find((t) => t.code === c)?.nameEn ?? "A type no longer configured") : "Not set");

  const awaitingName = rows.filter((r) => r.status !== "CANCELLED" && r.approvalInstances.some((i) => i.status === "PENDING")).length;
  const list: Row[] = rows.map((r) => {
    const status = r.status as ExerciseStatus;
    return {
      id: r.id,
      views: [
        ...(status === "DRAFT" ? ["drafts"] : []),
        ...(status === "DOCUMENTS_IN_PREPARATION" ? ["preparing"] : []),
        ...(r.onBoundary && status !== "CANCELLED" ? ["boundary"] : []),
      ],
      search: [r.title, r.reference, r.requisition.reference, r.requisition.erpRequisitionNo, methodName(r.sourcingMethodCode), EXERCISE_STATUS_LABEL[status]].filter(Boolean).join(" "),
      sortKeys: { value: Number(r.estimatedValue.toString()), title: r.title },
      cells: {
        title: { kind: "link", text: r.title, href: `/sourcing/${r.id}`, sub: `${r.reference} · for ${r.requisition.reference}` },
        method: { kind: "stack", title: methodName(r.sourcingMethodCode), sub: typeName(r.contractTypeCode) },
        value: { kind: "money", value: Number(r.estimatedValue.toString()) },
        status: { kind: "badge", text: EXERCISE_STATUS_LABEL[status], tone: TONE[EXERCISE_STATUS_TONE[status]] },
        checks: {
          kind: "chips",
          items: [
            { text: r.regime ? REGIME_SHORT[r.regime as Regime] : "Regime not determined", tone: "brand" as const },
            ...(r.onBoundary ? [{ text: r.boundaryRuled ? "On the boundary" : "On the boundary · not ruled", tone: "warn" as const }] : []),
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
        subtitle="Exercises opened against approved requisitions: their value bands, method, contract type and basis."
        meta={[
          `${rows.filter((r) => r.status === "DRAFT").length} drafts`,
          `${rows.filter((r) => r.status === "DOCUMENTS_IN_PREPARATION").length} in preparation`,
          `${awaitingName} awaiting name approval`,
          `${rows.filter((r) => r.onBoundary && r.status !== "CANCELLED").length} on the boundary`,
        ]}
        actions={
          org ? (
            <ButtonLink href="/sourcing/new" variant="primary" size="md" icon={<PlusIcon size={16} />}>
              New exercise
            </ButtonLink>
          ) : undefined
        }
      />

      <Callout tone="info" className="mb-6" title="Sourcing runs outside the portal in this phase">
        An exercise is classified here: its three value bands, sourcing method, contract type and basis, and who approves the name and the appointment. Documents, invitation, bids and evaluation are still recorded outside the portal.
      </Callout>

      <Card className="overflow-hidden">
        <CardHeader icon={<GlobeIcon size={17} />} title="All exercises" subtitle="Newest first. Search finds an exercise by its reference or its requisition's." divided={false} />
        <DataList
          flat
          selectable={false}
          exportName="sourcing-exercises"
          searchPlaceholder="Search by title or reference"
          emptyTitle="No sourcing exercises yet"
          emptyBody="Open one from an approved requisition."
          views={[
            { id: "drafts", label: "Drafts" },
            { id: "preparing", label: "In preparation" },
            { id: "boundary", label: "On the boundary" },
          ]}
          filters={[{ key: "status", label: "Status", order: STATUS_ORDER.map((s) => EXERCISE_STATUS_LABEL[s]) }]}
          rowAction={{ label: "Open", hrefTemplate: "/sourcing/{id}" }}
          rowOpens
          columns={[
            { key: "title", label: "Exercise", sortable: true, mobile: "primary" },
            { key: "method", label: "Method and contract type", width: "22%", hideBelow: "xl" },
            { key: "value", label: "Value", width: "130px", numeric: true, sortable: true, mobile: "meta" },
            { key: "status", label: "Status", width: "196px", sortable: true, mobile: "meta" },
            { key: "checks", label: "Band", width: "230px", hideBelow: "md", mobile: "meta" },
          ]}
          rows={list}
        />
        {total > rows.length && <CardFooter className="text-[12.5px] text-ink-3">Showing the latest {EXERCISES_PAGE} of {total}.</CardFooter>}
      </Card>
    </>
  );
}
