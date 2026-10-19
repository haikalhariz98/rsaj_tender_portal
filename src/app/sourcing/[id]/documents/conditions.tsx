import { CheckIcon, GavelIcon, UsersIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Callout, FindingNote } from "@/components/ui/feedback";
import { Disclosure } from "@/components/ui/disclosure";
import { InfoChip } from "@/components/ui/info-chip";
import { MoreText } from "@/components/ui/more-text";
import { startsOpen } from "@/lib/disclosure/open";
import { assuranceCardShown, assuranceLine, CLAUSE_STATUS, clausesSummary, type ClausesLine } from "@/lib/tender-docs/conditions-view";
import { capFirst } from "@/lib/tender-docs/frozen-view";
import type { ConditionsTab, LiveConditions } from "@/lib/tender-docs/read-conditions";

import { ConfirmAssuranceDrawer, OverrideClauseDrawer, RemoveAssuranceDrawer, RemoveOverrideDrawer } from "./conditions-editors";

/**
 * The Tender documents tab's increment-2 cards: assurance and the mandatory clauses, and what the
 * tender's conditions (who may bid, the restriction, the regulator permit) were when frozen. While live,
 * the conditions are answered on the Overview (founder, 2026-10-05). Words only, from
 * `conditionsTab`; every act is the shared drawer, disabled with its reason where refused.
 */

export const NOT_SET = "Not set";
export const Value = ({ v }: { v: string }) => (v === NOT_SET ? <Badge tone="warn">Not set</Badge> : <span className="break-words">{v}</span>);

export function Findings({ items }: { items: { level: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((f, i) => (
        <li key={i}>
          <FindingNote level={f.level}>{f.text}</FindingNote>
        </li>
      ))}
    </ul>
  );
}

export function Row({ title, value, action, children }: { title: string; value?: React.ReactNode; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <span className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
        <span className="min-w-0 text-[13.5px] font-semibold break-words text-ink">{title}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {value}
          {action}
        </span>
      </span>
      {children}
    </li>
  );
}

/**
 * The mandatory clauses as one folded card: "2 clauses carried" beside the title. The list opens by itself only
 * where there is something to act on or to read (a clause missing or not set, or one left out under an endorsement),
 * because the override drawer is the only fix (founder, 2026-10-05; note 0005 R13). Where no clause is configured there
 * is no list: the line says what is missing. `note` is the explanation, behind the information button.
 */
function ClausesCard({ line, note, children }: { line: ClausesLine; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      {!line.empty ? (
        <CardHeader
          collapsible
          id="clauses"
          defaultOpen={startsOpen({ finding: line.tone === "warn", mustKeep: line.expand })}
          icon={<GavelIcon size={17} />}
          title="Mandatory clauses"
          subtitle={note}
          summary={line.text}
        >
          <CardBody className="flex flex-col gap-4">{children}</CardBody>
        </CardHeader>
      ) : (
        <CardHeader id="clauses" icon={<GavelIcon size={17} />} title="Mandatory clauses" subtitle={line.text} divided={false} actions={line.tone === "warn" ? <Badge tone="warn">Needs attention</Badge> : undefined} />
      )}
    </Card>
  );
}

/**
 * Which cards the exercise shows: a draft exercise has no pack yet and shows only the tender's
 * conditions (they are editable from the draft, BD-64-32); a frozen pack shows what it froze.
 */
export function ConditionsCards({ c, packless }: { c: ConditionsTab; packless: boolean }) {
  if (c.mode === "frozen") return <FrozenCards c={c} />;
  if (c.mode === "before") return <BeforeCards c={c} />;
  return <LiveCards c={c} packless={packless} />;
}

type Frozen = Extract<ConditionsTab, { mode: "frozen" }>;
type Before = Extract<ConditionsTab, { mode: "before" }>;

export const Registrations = ({ groups }: { groups: { number: number; heading: string; items: { id?: string; body: string; qualifiers: string | null }[] }[] }) =>
  groups.length === 0 ? (
    <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-2">
      <Badge tone="warn">Not set</Badge> <span className="ml-1">No registration recorded.</span>
    </p>
  ) : (
    <ul className="divide-y divide-line/70 rounded-2xl border border-line">
      {groups.map((g) => (
        <li key={g.number} className="flex flex-col gap-1.5 px-4 py-3">
          <span className="text-[12px] font-semibold text-ink-3">{g.heading}</span>
          <ul className="flex flex-col gap-1.5">
            {g.items.map((r) => (
              <li key={r.id ?? r.body} className="min-w-0 text-[13.5px] break-words text-ink">
                <span className="font-semibold">{capFirst(r.body)}</span>
                {r.qualifiers && <span className="text-ink-2"> · {r.qualifiers}</span>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );

/// A pack with approval or approved: one card of what was frozen, with no control and no live finding (C1). Each part folds to one line (0005 R14).
function FrozenCards({ c }: { c: Frozen }) {
  const f = c.frozen;
  const clauses = clausesSummary({ none: f.clauses.length === 0 ? "No clause was required." : null, statuses: f.clauses.map((x) => x.status), noneTone: "neutral" });
  const left = f.clauses.filter((x) => x.override).length;
  const regs = f.groups.reduce((n, g) => n + g.items.length, 0);
  const showAssurance = assuranceCardShown(f.assurance.policy);
  const assurance = assuranceLine({ required: f.assurance.required, rows: f.assurance.rows.map((r) => ({ confirmed: !!r.by, notNeeded: false })), latestOn: f.assurance.latestOn });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        collapsible
        id="conditions"
        defaultOpen={startsOpen({ mustKeep: clauses.expand, finding: assurance.notSet })}
        icon={<UsersIcon size={17} />}
        title="Tender conditions"
        subtitle={`Judged ${f.judgedOn}.`}
        summary={`Frozen with version ${f.version}`}
      >
        <CardBody className="flex flex-col gap-3">
          <Disclosure boxed id="registrations" title="Registrations bidders must hold" summary={regs === 0 ? <Badge tone="warn">Not set</Badge> : `${regs} required`}>
            <Registrations groups={f.groups.map((g) => ({ ...g, items: g.items }))} />
            {f.notice && <p className="mt-2 text-[12.5px] text-ink-3">{f.notice}.</p>}
          </Disclosure>
          <Disclosure boxed id="restriction" title="Restriction and permit" summary={f.restriction.answer === "Yes" ? "Restricted" : f.restriction.answer === NOT_SET ? "Restriction not set" : "Not restricted"}>
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              <Row title={f.restriction.question} value={<Value v={f.restriction.answer} />}>
                {f.restriction.stampEn != null && (
                  <span className="text-[12.5px] break-words text-ink-3">
                    Stamped on every generated document: {f.restriction.stampEn === NOT_SET ? "English wording not set" : `“${f.restriction.stampEn}”`}
                    {f.restriction.stampMs ? ` · “${f.restriction.stampMs}”` : ""}
                  </span>
                )}
              </Row>
              <Row title="Needs the regulator's permit" value={<Value v={f.permit.answer} />}>
                {f.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {f.permit.type === NOT_SET ? "not chosen" : f.permit.type}</span>}
              </Row>
            </ul>
            {f.tableDocument.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[12px] font-semibold text-ink-3">In the Tender Table Document</p>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-[13.5px] text-ink">
                  {f.tableDocument.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
          </Disclosure>
          {showAssurance && (
            <Disclosure boxed id="assurance" defaultOpen={assurance.open} title="Assurance" summary={assurance.notSet ? <Badge tone="warn">Not set</Badge> : assurance.text}>
              {f.assurance.rows.length === 0 ? (
                <p className="text-[13px] text-ink-2">{f.assurance.required === NOT_SET ? "Policy was not set when frozen." : "No confirmation was needed."}</p>
              ) : (
                <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                  {f.assurance.rows.map((x) => (
                    <Row key={x.label} title={x.label} value={x.by ? <Badge tone="ok" dot>Confirmed</Badge> : <Badge tone="warn">Not confirmed</Badge>}>
                      {x.by && (
                        <span className="text-[12.5px] break-words text-ink-3">
                          {x.by} · {x.on}
                        </span>
                      )}
                    </Row>
                  ))}
                </ul>
              )}
            </Disclosure>
          )}
          <Disclosure boxed id="clauses" defaultOpen={clauses.expand} title="Mandatory clauses" summary={clauses.empty ? clauses.text : `${f.clauses.length - left} in${left > 0 ? `, ${left} left out` : ""}`}>
            <ul className="divide-y divide-line/70 rounded-2xl border border-line">
              {f.clauses.map((x) => (
                <Row key={x.title} title={x.title} value={<Badge tone={x.override ? "neutral" : "ok"}>{x.status}</Badge>}>
                  <span className="text-[12.5px] text-ink-3">{x.version}</span>
                  {x.override && <span className="text-[12.5px] break-words text-ink-3">{x.override}</span>}
                </Row>
              ))}
            </ul>
          </Disclosure>
        </CardBody>
      </CardHeader>
    </Card>
  );
}

/// A pack frozen before the conditions were recorded with it: the callout, and the recorded answers, with no finding.
function BeforeCards({ c }: { c: Before }) {
  return (
    <Card id="conditions" className="scroll-mt-24 overflow-hidden">
      <CardHeader icon={<UsersIcon size={17} />} title="Tender conditions" subtitle={`Version ${c.version} predates them.`} />
      <CardBody className="flex flex-col gap-5">
        <p className="text-[12.5px] text-ink-3">{c.before}</p>
        <div>
          <p className="mb-2 text-[12px] font-semibold text-ink-3">Registrations bidders must hold</p>
          <Registrations groups={c.groups} />
        </div>
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          <Row title={c.restriction.question} value={<Value v={c.restriction.answer} />} />
          <Row title="Needs the regulator's permit" value={<Value v={c.permit.answer} />}>
            {c.permit.type != null && <span className="text-[12.5px] text-ink-3">Permit type: {c.permit.type === NOT_SET ? "not chosen" : c.permit.type}</span>}
          </Row>
        </ul>
      </CardBody>
    </Card>
  );
}

/// The tender's conditions (registrations, restriction, permit) moved to the Overview's Details & compliance
/// card (founder, 2026-10-05): this tab keeps what is judged against the documents themselves.
function LiveCards({ c, packless }: { c: LiveConditions; packless: boolean }) {
  if (packless) return null;
  const assurance = assuranceLine({ required: c.assurance.required, rows: c.assurance.rows.map((r) => ({ confirmed: !!r.confirmation, notNeeded: !!r.notNeeded })), latestOn: c.assurance.latestOn });
  return (
    <>
      {assuranceCardShown(c.assurance.policy) && (
        <Card className="overflow-hidden">
          <CardHeader
            collapsible
            id="assurance"
            defaultOpen={startsOpen({ finding: assurance.notSet || !!c.assurance.policyNotSet, actNow: assurance.open })}
            icon={<CheckIcon size={17} />}
            title="Assurance"
            subtitle={<MoreText label="About assurance" text="Named officers confirm before approval. Later edits do not withdraw it. Remove and confirm again if the documents changed." />}
            summary={assurance.notSet ? <Badge tone="warn">Not set</Badge> : assurance.text}
          >
            <CardBody className="flex flex-col gap-4">
              {c.assurance.policyNotSet && <Callout tone="warn">{c.assurance.policyNotSet}</Callout>}
              <ul className="divide-y divide-line/70 rounded-2xl border border-line">
                {c.assurance.rows.map((r) => (
                  <Row
                    key={r.kind}
                    title={r.label}
                    value={r.confirmation ? <Badge tone="ok" dot>Confirmed</Badge> : r.notNeeded ? <span className="text-ink-3">Not needed</span> : <Badge tone="warn">Not confirmed</Badge>}
                    action={r.confirmation ? <RemoveAssuranceDrawer exerciseId={c.exerciseId} id={r.confirmation.id} label={r.label} allowed={c.assurance.remove} /> : r.notNeeded ? null : <ConfirmAssuranceDrawer exerciseId={c.exerciseId} kind={r.kind} label={r.label} people={c.people} allowed={r.record} today={c.today} />}
                  >
                    {r.confirmation && (
                      <span className="text-[12.5px] break-words text-ink-3">
                        {r.confirmation.by} · {r.confirmation.on}
                        {r.confirmation.note ? ` · “${r.confirmation.note}”` : ""}
                      </span>
                    )}
                    {r.notNeeded && <span className="text-[12.5px] text-ink-3">{r.notNeeded}</span>}
                  </Row>
                ))}
              </ul>
            </CardBody>
          </CardHeader>
        </Card>
      )}

      <ClausesCard
        line={clausesSummary({ none: c.clauses.none, statuses: c.clauses.rows.map((r) => r.status) })}
        note={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <InfoChip tone="warn" detail="Giver's office is not checked.">Not checked</InfoChip>
            <MoreText label="About leaving a clause out" text="Leaving a clause out needs a legal endorsement." />
          </span>
        }
      >
        <ul className="divide-y divide-line/70 rounded-2xl border border-line">
          {c.clauses.rows.map((r) => (
            <Row
              key={r.code}
              title={r.title}
              value={<Badge tone={r.tone}>{r.status}</Badge>}
              action={r.override ? <RemoveOverrideDrawer exerciseId={c.exerciseId} id={r.override.id} title={r.title} allowed={c.clauses.remove} /> : r.record && r.status === CLAUSE_STATUS.missing ? <OverrideClauseDrawer exerciseId={c.exerciseId} clauseCode={r.code} title={r.title} people={c.people} allowed={r.record} /> : null}
            >
              <span className="text-[12.5px] text-ink-3">{r.version}</span>
              {r.override && <span className="text-[12.5px] break-words text-ink-3">Endorsed by {r.override.by}: “{r.override.reason}”</span>}
              {r.findings.map((f) => (
                <span key={f} className="text-[12.5px] break-words text-amber-800">{f}</span>
              ))}
            </Row>
          ))}
        </ul>
      </ClausesCard>
    </>
  );
}
