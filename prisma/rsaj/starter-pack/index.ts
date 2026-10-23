/**
 * The RSAJ starter pack (ADR 0043 D1, plan steps 4.4 and 4.6): the values RSAJ's own documents state, each STATED and citing the requirement
 * and the clause it comes from, loaded into an RSAJ organisation only, by an operator (`npm run pack -- rsaj,generic`). The DAL and the two
 * evaluation models load ONLY as drafts, put in force by a named person (ADR 0043 D2, SP-2). Data only: nothing in the product imports it
 * (`rsaj-pack.test.ts` scans for that), and the loader is `src/lib/starter`.
 *
 * Lists are in dependency order: offices and committees before what names them, a method before its proposal items.
 */

import type { StarterPack } from "../../../src/lib/starter/types";

import { APPROVALS } from "./approvals";
import { CONTRACTS } from "./contracts";
import { PURCHASING } from "./purchasing";
import { SUPPLIERS } from "./suppliers";
import { SYSTEM } from "./system";

const PARTS = [APPROVALS, PURCHASING, CONTRACTS, SUPPLIERS, SYSTEM];

export const RSAJ_PACK: StarterPack = {
  name: "rsaj",
  version: 1,
  provenance: "STATED",
  lists: PARTS.flatMap((p) => p.lists),
  groups: PARTS.flatMap((p) => p.groups),
  drafts: { matrices: APPROVALS.drafts.matrices, evaluationModels: PURCHASING.drafts.evaluationModels },
};

export default RSAJ_PACK;
