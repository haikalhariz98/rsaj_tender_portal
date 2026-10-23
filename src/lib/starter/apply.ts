/**
 * Loads starter packs into an organisation (ADR 0043 D1): one transaction, under the organisation's lock, the snapshot read and the plan made
 * after the lock, so the writes meet what the plan saw. A dry run (`apply: false`) plans and writes nothing. A plan with any fault writes
 * nothing. Every write is one audit row with a SYSTEM actor ("Starter pack: Generic v1"), saying where the value comes from and its source.
 *
 * The security settings are written here in the open (`securityPolicy.create`/`update`), never through the generic delegate: this file is a
 * named writer of that two-person table (two-person-scan.test.ts), and only while the switch is off or a run creates the row (SP-3, SP-23).
 */

import type { Prisma } from "@/generated/prisma/client";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit, type Tx } from "@/lib/audit/record";
import type { AuditActor } from "@/lib/auth/types";
import type { db as Db } from "@/lib/db";

import { planPacks, type PackWrite, type PlannedPacks } from "./plan";
import { delegateOf, readSnapshot } from "./snapshot";
import type { StarterPack } from "./types";

const WORDS = { STATED: "Stated", ASSUMED: "Assumed" } as const;
/// Columns kept out of the audit row: keys and the list a row is on (codes never reach a screen; the entity label names the list), and the provenance and source, which it records in words.
const UNSHOWN = ["code", "key", "list", "domain", "provenance", "governingSource"];

type Writer = { create(a: unknown): Promise<{ id: string }>; update(a: unknown): Promise<{ id: string }> };

export interface LoadOptions {
  apply: boolean;
  now?: Date;
  /// Whether the database holds the demonstration (`demoIsLoaded` in prisma/demo-sign-in.ts). Absent: it does not, so the development fill refuses.
  demoIsLoaded?: (tx: Tx) => Promise<boolean>;
}
export type LoadResult = PlannedPacks & { applied: boolean };

export async function loadPacks(client: typeof Db, organisationId: string, packs: readonly StarterPack[], opts: LoadOptions): Promise<LoadResult> {
  return client.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${organisationId} FOR UPDATE`;
      const demo = opts.demoIsLoaded ? await opts.demoIsLoaded(tx) : false;
      const plan = planPacks(packs, await readSnapshot(tx, organisationId, packs, { now: opts.now ?? new Date(), demoIsLoaded: demo }));
      if (!opts.apply || plan.faults.length > 0) return { ...plan, applied: false };
      await runWrites(tx, organisationId, plan.writes);
      return { ...plan, applied: plan.writes.length > 0 };
    },
    { timeout: 300_000, maxWait: 10_000 },
  );
}

async function runWrites(tx: Tx, organisationId: string, writes: readonly PackWrite[]) {
  const made = new Map<string, { id: string; label: string }>();
  const refOf = (v: unknown) => (v && typeof v === "object" && "ref" in v ? String((v as { ref: unknown }).ref) : null);
  const resolved = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([c, v]) => [c, refOf(v) ? made.get(refOf(v)!)!.id : v]));
  const shown = (values: Record<string, unknown>, also: readonly string[] = []) =>
    Object.fromEntries(Object.entries(values).filter(([c]) => !UNSHOWN.includes(c) && !also.includes(c)).map(([c, v]) => [c, refOf(v) ? made.get(refOf(v)!)!.label : v]));

  for (const w of writes) {
    const actor: AuditActor = { kind: "SYSTEM", label: w.actor };
    const reason = w.kind === "SWITCH_OFF" ? w.reason : `Filled by a starter pack where nobody had set it. Source: ${w.source}${w.requirement ? ` (${w.requirement})` : ""}.`;
    const origin = { whereItComesFrom: WORDS[w.provenance], governingSource: w.source };
    if (w.kind === "SWITCH_OFF") {
      const row = w.create
        ? await tx.securityPolicy.create({ data: { organisationId, twoPersonChanges: false }, select: { id: true } })
        : await tx.securityPolicy.update({ where: { organisationId }, data: { twoPersonChanges: false }, select: { id: true } });
      await writeAudit(tx, { organisationId, entity: "SecurityPolicy", entityId: row.id, entityLabel: "Security settings", reason, actor }, w.create ? "CREATE" : "UPDATE", diffFields(w.create ? null : { twoPersonChanges: true }, { twoPersonChanges: false }));
      continue;
    }
    const data = resolved(w.values);
    if (w.kind === "GROUP") {
      const row =
        w.model === "SecurityPolicy"
          ? await tx.securityPolicy.update({ where: { organisationId }, data: data as Prisma.SecurityPolicyUncheckedUpdateInput, select: { id: true } }) // the row exists: the switch is off, or this run made it
          : w.model === "Organisation"
            ? await tx.organisation.update({ where: { id: organisationId }, data: data as Prisma.OrganisationUncheckedUpdateInput, select: { id: true } })
            : w.create
              ? await delegateOf<Writer>(tx, w.model).create({ data: { organisationId, ...data }, select: { id: true } })
              : await delegateOf<Writer>(tx, w.model).update({ where: { organisationId }, data, select: { id: true } });
      const hide = [w.provenanceColumn, w.sourceColumn].filter((c): c is string => !!c);
      const after = { ...shown(w.values, hide), ...origin };
      await writeAudit(tx, { organisationId, entity: w.model, entityId: row.id, entityLabel: w.label, reason, actor }, w.create ? "CREATE" : "UPDATE", diffFields(w.before && shown(w.before, hide), after));
      continue;
    }
    const row =
      w.model === "NumberingSeries"
        ? await tx.numberingSeries.create({ data: { organisationId, ...data } as never, select: { id: true } }) // seeds a series into an empty list; the issuer alone advances it
        : await delegateOf<Writer>(tx, w.model).create({ data: { organisationId, ...data }, select: { id: true } });
    made.set(`${w.model}:${w.code}`, { id: row.id, label: w.label });
    await writeAudit(tx, { organisationId, entity: w.model, entityId: row.id, entityLabel: `${w.listLabel} · ${w.label}`, reason, actor }, "CREATE", diffFields(null, { ...shown(w.values), ...origin }));
  }
}
