import { db } from "@/lib/db";
import { loadExercise } from "@/lib/method/repo";
import { formatMoney, senFromDecimal, senToDecimalString, type Sen } from "@/lib/money";

import { identityHeld } from "./anonymise";
import { blindReader } from "./blind";
import type { BlindBid, BlindScope } from "./blind-audit";
import { evaluatedPrice, recommendedPriceOf } from "./facts";
import { loadEvaluationContext } from "./repo";
import { isSubmitted } from "./stages";

/**
 * The exercises whose audit rows a person is read blind to (decisions log, 2026-10-09, ruling on 1867(3)): those where they sit on the evaluation team of the version in force and
 * that version froze anonymisation on and has not lifted it. The judgement is the Evaluation tab's own (`identityHeld`, `blindReader`), so the History and the export
 * agree with the tab on who is read blind and until when. `only` narrows it to one exercise, for the History tab.
 */
export async function blindScopesFor(organisationId: string, personId: string | null, only?: string): Promise<BlindScope[]> {
  if (!personId) return [];
  const seats = await db.evaluationTeamMember.findMany({ where: { organisationId, personId, ...(only ? { evaluation: { exerciseId: only } } : {}) }, select: { evaluation: { select: { exerciseId: true } } } });
  const exerciseIds = [...new Set(seats.map((s) => s.evaluation.exerciseId))];
  const scopes: BlindScope[] = [];
  for (const exerciseId of exerciseIds) {
    const x = await loadExercise(organisationId, exerciseId);
    if (!x) continue;
    const c = await loadEvaluationContext({ org: x.org, ex: x.ex });
    const e = c.current;
    const f = c.facts;
    if (!e || !f) continue;
    const held = identityHeld(f.anonymised, f.model.stages.map((s) => ({ kind: s.kind, capitalBase: s.capitalBase, criteria: s.criteria, submitted: isSubmitted(f, s.code) })));
    if (!blindReader(held, e.team.map((t) => t.personId), personId)) continue;
    const opened = await db.openedBid.findMany({ where: { organisationId, exerciseId }, select: { listingNo: true, bidderNameAsRead: true, priceAsRead: true, party: { select: { name: true, registrationNo: true } } } });
    const byNo = new Map<number, { names: Set<string>; figures: Set<string> }>();
    const slot = (no: number) => byNo.get(no) ?? byNo.set(no, { names: new Set(), figures: new Set() }).get(no)!;
    const money = (sen: Sen | null) => {
      if (sen == null) return;
      return [formatMoney(sen), senToDecimalString(sen)];
    };
    for (const b of opened) {
      const s = slot(b.listingNo);
      for (const n of [b.bidderNameAsRead, b.party.name, b.party.registrationNo]) if (n) s.names.add(n);
      for (const m of money(senFromDecimal(b.priceAsRead.toString())) ?? []) s.figures.add(m);
    }
    for (const b of f.bidders) {
      const s = slot(b.listingNo);
      for (const n of [b.bidderName, b.registrationNo]) if (n) s.names.add(n);
      for (const sen of [b.priceAsRead, b.correctedPrice, evaluatedPrice(b), recommendedPriceOf(b)]) for (const m of money(sen) ?? []) s.figures.add(m);
    }
    const bids: BlindBid[] = [...byNo.entries()].sort((a, z) => a[0] - z[0]).map(([listingNo, v]) => ({ listingNo, names: [...v.names], figures: [...v.figures] }));
    scopes.push({ exerciseId, reference: x.ex.reference, bids });
  }
  return scopes;
}
