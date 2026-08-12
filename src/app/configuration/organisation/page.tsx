import { BuildingIcon, GlobeIcon, UsersIcon } from "@/components/icons";
import { activeOn } from "@/lib/effective";
import { loadOrganisationData } from "@/lib/organisation/load";
import { buildStructure } from "@/lib/organisation/structure";
import { ORGANISATION_CODE } from "@/lib/org";

import { OrganisationScreen } from "./panels";

export const dynamic = "force-dynamic";

/**
 * Organisation, in the prototype's shape.
 *
 * Account codes used to have a card here. The sample keeps them on Budget, which is
 * where they belong — a chart of accounts is what a budget check runs against, not
 * part of the org chart.
 */
export default async function OrganisationPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const on = new Date();
  const [{ unit }, data] = await Promise.all([searchParams, loadOrganisationData(ORGANISATION_CODE)]);

  const { roots, detached } = buildStructure(data.units, on);

  const units = activeOn(data.units, on);
  const costCentres = activeOn(data.costCentres, on);
  const sites = activeOn(data.sites, on);
  const companies = units.filter((u) => u.kind === "COMPANY").length;
  const departments = units.filter((u) => u.kind === "DEPARTMENT").length;

  return (
    <>
      <div className="pagehead">
        <div className="pagehead__top">
          <div className="pagehead__titles">
            <div className="pagehead__title">
              <h1 className="h1 trunc">Organisation</h1>
            </div>
            <p className="pagehead__sub clamp2">
              Companies, divisions, departments, sections, cost centres and sites.
            </p>
            <div className="pagehead__meta">
              <span className="row" style={{ gap: 5 }}>
                <BuildingIcon size={13} />
                {companies} · {companies === 1 ? "Company" : "Companies"}
              </span>
              <span className="sep">·</span>
              <span className="row" style={{ gap: 5 }}>
                <UsersIcon size={13} />
                {departments} {departments === 1 ? "department" : "departments"}
              </span>
              <span className="sep">·</span>
              <span className="row" style={{ gap: 5 }}>
                <GlobeIcon size={13} />
                {sites.length} · {sites.length === 1 ? "Site" : "Sites"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <OrganisationScreen
        roots={roots}
        detached={detached}
        units={units}
        costCentres={costCentres}
        sites={sites}
        people={data.people}
        selected={unit ?? null}
        on={on}
      />
    </>
  );
}
