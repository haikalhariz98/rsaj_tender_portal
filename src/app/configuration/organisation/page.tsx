import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { activeOn } from "@/lib/effective";
import { loadOrganisationData } from "@/lib/organisation/load";
import { buildStructure } from "@/lib/organisation/structure";
import { ORGANISATION_CODE } from "@/lib/org";

import { OrganisationScreen } from "./panels";

export const dynamic = "force-dynamic";

/**
 * Organisation: companies down to sections, and the cost centres and sites hung off
 * them. Account codes are on Budget, where a budget check runs against them.
 */
export default async function OrganisationPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; tab?: string }>;
}) {
  const on = new Date();
  const [{ unit, tab }, data] = await Promise.all([
    searchParams,
    loadOrganisationData(ORGANISATION_CODE),
  ]);

  const { roots, detached, faults } = buildStructure(data.units, on);
  const units = activeOn(data.units, on);

  // Units nobody heads, or headed by somebody who has gone. Counted here so the header
  // can say so before anyone opens the tree.
  const active = new Set(data.people.filter((p) => p.isActive).map((p) => p.id));
  const headless = units.filter((u) => !u.headPersonId || !active.has(u.headPersonId)).length;

  const nameOf = (code: string) => data.units.find((u) => u.code === code)?.nameEn ?? code;

  return (
    <>
      <PageHeader
        title="Organisation"
        subtitle="The structure requisitions are raised from, and approvals are routed through."
        badge={
          headless > 0 ? (
            <Badge tone="warn" dot>
              {headless} {headless === 1 ? "unit has" : "units have"} no head
            </Badge>
          ) : undefined
        }
        meta={[
          `${units.length} ${units.length === 1 ? "unit" : "units"}`,
          `${activeOn(data.costCentres, on).length} cost centres in use`,
          `${activeOn(data.sites, on).length} sites`,
        ]}
      />

      {/* A structure that cannot be drawn as stated is the customer's to fix — it is
          shown, never quietly re-rooted. The loader used to drop these. */}
      {faults.length > 0 && (
        <Callout tone="err" title="Part of the structure cannot be drawn as configured" className="mb-5">
          <ul className="mt-1 list-disc pl-5">
            {faults.map((f, i) => (
              <li key={i}>
                {f.kind === "DETACHED"
                  ? `${nameOf(f.code)} sits under ${nameOf(f.parentCode)}, which is not in force. It is shown as detached.`
                  : `${f.codes.map(nameOf).join(" → ")} sit under each other in a loop. They are left out of the tree until one is moved.`}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <OrganisationScreen
        roots={roots}
        detached={detached}
        units={units}
        costCentres={data.costCentres}
        sites={data.sites}
        people={data.people}
        selected={unit ?? null}
        view={tab ?? null}
        on={on}
      />
    </>
  );
}
