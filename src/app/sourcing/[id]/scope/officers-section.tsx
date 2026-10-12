import { requireStaff } from "@/app/_auth/actor";
import { Accordion } from "@/components/accordion";
import { DataList } from "@/components/data-list";
import { UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, EmptyState } from "@/components/ui/feedback";
import { KeyValues } from "@/components/ui/stat";
import { db } from "@/lib/db";
import { namingOthersRefusal } from "@/lib/auth/sulit-store";
import { formatDate } from "@/lib/format";
import { loadExercise } from "@/lib/method/repo";
import { rosterChange, rosterFaults } from "@/lib/opening/roster";
import { loadOpeningRoster } from "@/lib/opening/roster-store";
import { ROSTER_AFTER_CLOSING_NOTE, rosterActs, rosterFindingText } from "@/lib/opening/roster-labels";
import { SETTING_AT } from "@/lib/opening/labels";

import { OfficersList } from "./officers-list";
import { NameOfficerDrawer } from "./prep-editors";

/**
 * Opening officers, the third section of Scope and estimate (Sourcing Requirements v2, SR-07, ruling 11): the officers who will open the bids,
 * named before the documents are submitted. The number is the opening committee's panel size, never a literal here; an unset size says so
 * rather than reading as none. Each holds a seat on the committee the method names. Replacing one is possible until the closing, by a controlled
 * change with its authority and reason; after the closing the card says plainly that the exercise cannot be opened without every named officer and would have
 * to be re-tendered.
 */
export async function OfficersSection({ exerciseId }: { exerciseId: string }) {
  const actor = await requireStaff();
  const l = await loadExercise(actor.organisationId, exerciseId);
  if (!l) return null;
  const { ex, org } = l;
  const roster = await loadOpeningRoster(ex, org);
  const openings = await db.opening.count({ where: { exerciseId: ex.id } });

  if (!ex.openingRosterRequired) {
    return (
      <Card>
        <CardHeader icon={<UsersIcon size={17} />} title="Opening officers" subtitle="Who will open the bids." />
        <CardBody>
          <Callout tone="info" title="Its panel is picked when the opening starts">
            This exercise was made before opening officers were named on the exercise. Its panel is drawn from the opening committee&apos;s seats when the opening starts, as it was when it was made.
          </Callout>
        </CardBody>
      </Card>
    );
  }

  const change = rosterChange({ status: ex.status, closing: ex.closingAt, now: new Date(), openingStarted: openings > 0 });
  const nameRefusal = await namingOthersRefusal(db, actor, ex.id);
  const size = roster.committee?.panelSize ?? null;
  const acts = rosterActs({ change, committeeReady: !!roster.input.committee, size, named: roster.rows.length, candidates: roster.candidates.length, nameRefusal });
  const findings = rosterFaults(roster.input);
  const blocks = findings.filter((f) => f.level === "block" && f.code !== "OFFICERS_SHORT");
  const warns = findings.filter((f) => f.level !== "block");
  const complete = size != null && roster.rows.length === size && blocks.length === 0;
  const needed = size == null ? "The number of opening officers is not set." : `${size === 1 ? "One officer is" : `${size} officers are`} needed.`;
  const options = roster.candidates.map((c) => ({ value: c.personId, label: `${c.name} · ${c.seatLabel}` }));

  return (
    <div className="flex flex-col gap-6">
      {!roster.input.committee && (
        <Callout tone="warn" title={roster.input.committeeCode ? "The opening committee is not configured" : "The method names no opening committee"} action={<ButtonLink href="/configuration/reference-data" size="sm" variant="secondary">Open Reference data</ButtonLink>}>
          Opening officers are drawn from the committee the method names. Until it is set, nobody can be named, and the documents cannot be submitted.
        </Callout>
      )}
      {roster.input.committee && size == null && (
        <Callout tone="warn" title="The number of opening officers is not set" action={<ButtonLink href="/configuration/committees" size="sm" variant="secondary">Open Committees</ButtonLink>}>
          It is the panel size of {roster.input.committee.name}, set under {SETTING_AT.committee}. Until it is set, nobody can be named and the documents cannot be submitted.
        </Callout>
      )}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<UsersIcon size={17} />}
          title="Opening officers"
          subtitle="Who will open the bids. They are named before the documents are submitted."
          actions={
            <span className="flex flex-wrap items-center gap-2">
              {size != null && <Badge tone={complete ? "ok" : "warn"}>{`${roster.rows.length} of ${size} named`}</Badge>}
              <NameOfficerDrawer exerciseId={ex.id} allowed={acts.name} candidates={options} needed={needed} />
            </span>
          }
        />
        <CardBody className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: "Opened by", value: roster.input.committee?.name ?? "No committee" },
              { label: "Number needed", value: size == null ? <Badge tone="warn">Not set</Badge> : String(size) },
              { label: "Independence", value: roster.input.policy.exclusionRule == null ? <Badge tone="warn">Rule not set: officers are not checked</Badge> : roster.input.policy.exclusionRule ? "Each is checked against the committee's independence rule" : "The committee excludes no unit" },
            ]}
          />
          {roster.rows.length === 0 ? (
            <EmptyState size="sm" title="Nobody is named yet">{acts.name.allowed ? "Name the officers who will open the bids. Each must hold a seat on the opening committee." : acts.name.reason}</EmptyState>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              <OfficersList
                exerciseId={ex.id}
                candidates={options}
                names={Object.fromEntries(roster.rows.map((r) => [r.id, r.name]))}
                substitute={acts.substitute}
                remove={acts.remove}
                rows={roster.rows.map((r) => ({
                  id: r.id,
                  search: r.name,
                  cells: {
                    officer: { kind: "text", text: r.name },
                    seat: { kind: "text", text: r.seatLabel, dim: true },
                    named: { kind: "text", text: `${formatDate(r.namedAt)} by ${r.namedBy}`, dim: true },
                  },
                }))}
              />
            </div>
          )}
          {blocks.map((f, i) => (
            <Callout key={i} tone="err">{rosterFindingText(f)}</Callout>
          ))}
          {warns.map((f, i) => (
            <Callout key={i} tone="warn">{rosterFindingText(f)}</Callout>
          ))}
          {!acts.substitute.allowed && change.fault && <Callout tone="info" title="The officers can no longer be changed">{acts.substitute.reason}</Callout>}
          {change.change === "CONTROLLED" && <p className="text-[12.5px] text-ink-3">{ROSTER_AFTER_CLOSING_NOTE}</p>}
          {change.change === "FREE" && <p className="text-[12.5px] text-ink-3">{ROSTER_AFTER_CLOSING_NOTE} Once the documents are submitted an officer is replaced by a controlled change with its authority and reason.</p>}
        </CardBody>
        {roster.ended.length > 0 && (
          <Accordion title="Earlier officers" meta={`${roster.ended.length} on record`}>
            <DataList
              flat
              selectable={false}
              searchable={false}
              toolbar={false}
              exportName="earlier-opening-officers"
              emptyTitle="No earlier officers"
              columns={[
                { key: "officer", label: "Officer", width: "24%", mobile: "primary" },
                { key: "seat", label: "Seat", width: "16%", mobile: "meta" },
                { key: "ended", label: "Taken off", width: "22%", mobile: "meta" },
                { key: "why", label: "Authority and reason", mobile: "meta" },
              ]}
              rows={roster.ended.map((e, i) => ({
                id: String(i),
                search: e.name,
                cells: {
                  officer: { kind: "text", text: e.name },
                  seat: { kind: "text", text: e.seatLabel, dim: true },
                  ended: { kind: "text", text: `${formatDate(e.endedAt)} by ${e.endedBy}` },
                  why: { kind: "text", text: `${e.authority ? `Under ${e.authority}: ` : ""}${e.reason}`, dim: true },
                },
              }))}
            />
          </Accordion>
        )}
      </Card>
    </div>
  );
}
