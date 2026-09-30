import { CalendarIcon, ChartIcon, ScaleIcon } from "@/components/icons";
import { totalsAcross } from "@/lib/budget/codes";
import { loadBudgetCodes, loadBudgetPeriods, loadFinance } from "@/lib/budget/load";
import { defaultYear } from "@/lib/budget/periods";
import { activeOn } from "@/lib/effective";
import { formatCompactRM } from "@/lib/format";
import { loadOrganisationData } from "@/lib/organisation/load";
import { loadRoster } from "@/lib/people/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { BudgetTabs } from "./panels";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

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
  const on = new Date();
  const [{ tab, year: yearParam }, budget, periods, org, roster, finance] = await Promise.all([
    searchParams,
    loadBudgetCodes(ORGANISATION_CODE),
    loadBudgetPeriods(ORGANISATION_CODE),
    loadOrganisationData(ORGANISATION_CODE),
    loadRoster(ORGANISATION_CODE),
    loadFinance(ORGANISATION_CODE),
  ]);

  const asked = Number(yearParam);
  const shownYear = Number.isInteger(asked) ? asked : defaultYear(periods.periods);

  const totals = totalsAcross(budget.codes, budget.movements, on);
  const year = String(on.getFullYear());

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle="Allocations, commitments and the balance a requirement is checked against."
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
        roles={roster.offices.map((o) => ({ code: o.code, nameEn: o.nameEn }))}
        finance={finance}
        periods={periods.periods}
        rollForwardByYear={periods.rollForwardByYear}
        on={on}
      />
    </>
  );
}
