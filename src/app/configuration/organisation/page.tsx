import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { activeOn } from "@/lib/effective";
import { loadOrganisationData } from "@/lib/organisation/load";
import { buildStructure } from "@/lib/organisation/structure";
import { ORGANISATION_CODE } from "@/lib/org";

import { db } from "@/lib/db";

import { formatOrgDay } from "@/lib/format";
import { DETAIL_FIELDS, normaliseDetails } from "@/lib/organisation/details";

import { timeZoneLabel, timeZoneOptions } from "@/lib/time-zone-label";
import { EditTimeZone } from "./editors";
import type { LogoInfo } from "./logo-card";
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

  // The logo's metadata only: its bytes are served from their own address.
  const org = await db.organisation.findUnique({
    where: { code: ORGANISATION_CODE },
    include: { logo: { select: { sha256: true, mediaType: true, sizeBytes: true, width: true, height: true, uploadedAt: true } } },
  });
  const timeZone = org?.timeZone ?? null;
  const details = org ? normaliseDetails({ ...Object.fromEntries(DETAIL_FIELDS.map((f) => [f, org[f]])) }) : null;
  const logo: LogoInfo | null = org?.logo
    ? {
        sha: org.logo.sha256,
        mediaType: org.logo.mediaType,
        sizeKb: Math.ceil(org.logo.sizeBytes / 1024),
        width: org.logo.width,
        height: org.logo.height,
        uploadedOn: formatOrgDay(org.logo.uploadedAt, timeZone),
      }
    : null;
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

      {timeZone ? (
        <Callout tone="info" className="mb-5" title={`Dates are judged in ${timeZoneLabel(timeZone)}`} action={<EditTimeZone timeZone={timeZone} options={timeZoneOptions()} />}>
          Today, for a vote sheet or a tabling, is the day in this zone.
        </Callout>
      ) : (
        <Callout tone="warn" className="mb-5" title="Time zone not set" action={<EditTimeZone timeZone={null} options={timeZoneOptions()} />}>
          &ldquo;Today&rdquo; is not assumed to be UTC. Until the zone the organisation keeps its dates in is set,
          committee sittings cannot start, matters cannot be tabled and votes cannot be recorded.
        </Callout>
      )}

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
        details={details ?? normaliseDetails({})}
        logo={logo}
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
