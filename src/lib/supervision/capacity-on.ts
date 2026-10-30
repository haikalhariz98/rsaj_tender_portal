/**
 * WRS-3: who may act in a capacity on a contract on a day, decided once: the S.O. office's holders and those acting in it, or a representative whose delegation in force covers the
 * act (`capacityFor`). `recordedFor` (`matter/act.ts`) calls `capacityOn`, and every read of "may this person act on the contract's lines" (the Work panel, My work) calls
 * `mayActOnDefectLines`, so the rule has one home. A leaf module: the Work loaders import it without reaching the act frame.
 */

import type { Tx } from "@/lib/audit/record";
import type { LoadedContract } from "@/lib/contract/repo";

import { capacityFor, type ActNeed } from "./authority";
import { delegationFactsOf, loadSupervision, soOfficeOn } from "./load";

export async function capacityOn(l: LoadedContract, tx: Tx, personId: string, need: ActNeed, on: string) {
  const s = await loadSupervision(l.contract.id, tx);
  const so = await soOfficeOn(l, s, on, tx);
  return { s, so, r: capacityFor(personId, need, so?.office ?? null, delegationFactsOf(s), on) };
}

/// May this person act on the contract's defect lines on the day (the defect acts' own need: site observation)?
export async function mayActOnDefectLines(l: LoadedContract, tx: Tx, personId: string, on: string): Promise<boolean> {
  return (await capacityOn(l, tx, personId, { act: "OBSERVATION" }, on)).r.capacity !== null;
}
