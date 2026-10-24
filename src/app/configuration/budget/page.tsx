import { redirect } from "next/navigation";

import { ToneNote } from "@/components/ui/feedback";
import { db } from "@/lib/db";
import { unpostedIntakeReason, type UnpostedReason } from "@/lib/requisition/budget";
import { UNPOSTED_TEXT, UNPOSTED_TITLE } from "@/lib/requisition/labels";
import { loadControls } from "@/lib/requisition/repo";
import { CalendarIcon, ChartIcon, ScaleIcon } from "@/components/icons";
import { totalsAcross } from "@/lib/budget/codes";
import { loadBudgetCodes, loadBudgetPeriods, loadFinance } from "@/lib/budget/load";
import { defaultYear } from "@/lib/budget/periods";
import { activeOn } from "@/lib/effective";
import { formatCompactRM } from "@/lib/format";
import { loadOrganisationData } from "@/lib/organisation/load";
import { organisationDay } from "@/lib/dates";
import { mayReadBudget } from "@/lib/insights/query";
import { organisationTimeZone } from "@/lib/org-time";

import { BudgetTabs } from "./panels";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/app/_auth/actor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Budget" };

/**
 * Budget, in the prototype's shape.
 *
 * Every figure in the head is arithmetic over the movement ledger. None of them is
 * stored, and where nothing has been allocated they say so rather than reading zero.
 */
export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; year?: string }>;
}) {
  const actor = await requireStaff();
  // DB-3: one predicate for every Budget surface. A code with one commitment shows that requisition's estimate, and the movements list names it.
  if (!mayReadBudget(actor)) redirect("/configuration/no-access");
  // Balances and the year are as at the organisation's day, not the UTC one (6.10 §9.5
  // follow-up). With no zone set the UTC day is used, and the header says so.
  const zone = await organisationTimeZone(actor.organisationId);
  const orgDay = organisationDay(new Date(), zone);
  const on = orgDay ?? new Date();
  const [{ tab, year: yearParam }, budget, periods, org, finance] = await Promise.all([
    searchParams,
    loadBudgetCodes(actor.organisationCode),
    loadBudgetPeriods(actor.organisationCode),
    loadOrganisationData(actor.organisationCode),
    loadFinance(actor.organisationCode),
  ]);

  // Ruling BD-10: received requisitions with no commitment in the portal ledger, grouped
  // by why — held in the finance system only where that is the source (round 3, h).
  const unpostedRows = await db.requisition.findMany({
    where: { organisation: { code: actor.organisationCode }, origin: "EXTERNAL", commitmentMovementId: null, status: { notIn: ["CANCELLED", "CLOSED"] } },
    select: { reference: true, title: true, fundingRouteCode: true, organisationId: true, budgetCode: { select: { code: true } } },
    orderBy: { reference: "asc" },
  });
  const orgRow = unpostedRows.length ? await db.organisation.findUnique({ where: { code: actor.organisationCode }, select: { id: true } }) : null;
  const [controls, routes] = orgRow
    ? await Promise.all([loadControls(orgRow.id), db.fundingRoute.findMany({ where: { organisationId: orgRow.id }, select: { code: true, approvalCommitsBudget: true } })])
    : [null, []];
  const unposted = new Map<UnpostedReason, typeof unpostedRows>();
  for (const r of unpostedRows) {
    const why = unpostedIntakeReason(controls?.budgetCheckSource ?? null, routes.find((x) => x.code === r.fundingRouteCode)?.approvalCommitsBudget ?? null);
    unposted.set(why, [...(unposted.get(why) ?? []), r]);
  }

  const asked = Number(yearParam);
  const shownYear = Number.isInteger(asked) ? asked : defaultYear(periods.periods);

  const totals = totalsAcross(budget.codes, budget.movements, on);
  const year = `${on.getUTCFullYear()}${orgDay ? "" : " (UTC: time zone not set)"}`;

  return (
    <>
      <PageHeader
        title="Budget"
        info={{ title: "Budget", text: "Allocations, commitments and the balance a requirement is checked against." }}
        meta={[
          <>
            <CalendarIcon size={14} />
            {year}
          </>,
          <>
            <ChartIcon size={14} />
            {budget.codes.length} {budget.codes.length === 1 ? "budget code" : "budget codes"}
          </>,
          <>
            <ScaleIcon size={14} />
            {formatCompactRM(totals.allocated)} allocated
          </>,
          // Nothing allocated is not nought per cent used.
          // One decimal, as the Utilisation tile on Commitment and availability shows it —
          // a rounded figure here and an exact one there read as two different answers.
          totals.utilisation == null ? "No utilisation yet" : `${totals.utilisation.toFixed(1)}% utilised`,
        ]}
      />

      {[...unposted.entries()].map(([why, rows]) => (
        <ToneNote key={why} tone={why === "HELD_IN_FINANCE" || why === "ROUTE_OFF" ? "info" : "warn"} className="mb-6" title={`Received requisitions — ${UNPOSTED_TITLE[why].charAt(0).toLowerCase()}${UNPOSTED_TITLE[why].slice(1)}`}>
          {rows.map((h) => `${h.budgetCode?.code ?? "No budget code"}: ${h.reference} (${h.title})`).join("; ")}. For each: {UNPOSTED_TEXT[why]}
        </ToneNote>
      ))}

      <BudgetTabs
        initial={tab}
        initialYear={shownYear ?? undefined}
        codes={budget.codes}
        movements={budget.movements}
        settings={budget.settings}
        units={activeOn(org.units, on).map((u) => ({ code: u.code, nameEn: u.nameEn }))}
        people={org.people}
        accountCodes={activeOn(org.accountCodes, on).map((a) => ({
          code: a.code,
          nameEn: a.nameEn,
        }))}
        finance={finance}
        periods={periods.periods}
        rollForwardByYear={periods.rollForwardByYear}
        on={on}
      />
    </>
  );
}
