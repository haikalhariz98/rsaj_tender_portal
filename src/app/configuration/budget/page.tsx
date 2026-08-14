import { CalendarIcon, ChartIcon, ScaleIcon } from "@/components/icons";
import { totalsAcross } from "@/lib/budget/codes";
import { loadBudgetCodes, loadBudgetPeriods } from "@/lib/budget/load";
import { defaultYear } from "@/lib/budget/periods";
import { activeOn } from "@/lib/effective";
import { formatCompactRM } from "@/lib/format";
import { loadOrganisationData } from "@/lib/organisation/load";
import { loadRoster } from "@/lib/people/load";
import { ORGANISATION_CODE } from "@/lib/org";

import { BudgetTabs } from "./panels";

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
  const [{ tab, year: yearParam }, budget, periods, org, roster] = await Promise.all([
    searchParams,
    loadBudgetCodes(ORGANISATION_CODE),
    loadBudgetPeriods(ORGANISATION_CODE),
    loadOrganisationData(ORGANISATION_CODE),
    loadRoster(ORGANISATION_CODE),
  ]);

  const asked = Number(yearParam);
  const shownYear = Number.isInteger(asked) ? asked : defaultYear(periods.periods);

  const totals = totalsAcross(budget.codes, budget.movements, on);
  const year = String(on.getFullYear());

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1 trunc">Budget</h1>
            </div>
            <p className="pagehead__sub clamp2">
              Allocations, commitments and the balance a requirement is checked against.
            </p>
            <div className="pagehead__meta">
              <span className="row" style={{ gap: 5 }}>
                <CalendarIcon size={13} />
                {year}
              </span>
              <span className="sep">·</span>
              <span className="row" style={{ gap: 5 }}>
                <ChartIcon size={13} />
                {budget.codes.length} {budget.codes.length === 1 ? "Budget code" : "Budget codes"}
              </span>
              <span className="sep">·</span>
              <span className="row" style={{ gap: 5 }}>
                <ScaleIcon size={13} />
                {formatCompactRM(totals.allocated)} Allocated
              </span>
              <span className="sep">·</span>
              <span className="row" style={{ gap: 5 }}>
                <ChartIcon size={13} />
                {/* Nothing allocated is not nought per cent used. */}
                {totals.utilisation == null ? "No" : `${Math.round(totals.utilisation)}%`} Utilisation
              </span>
            </div>
          </div>
        </div>
      </div>

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
        periods={periods.periods}
        rollForwardByYear={periods.rollForwardByYear}
        on={on}
      />
    </>
  );
}
