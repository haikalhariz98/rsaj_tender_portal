import { defineOperations } from "./define";

/**
 * Acts of the record that a second person decides (sign-in programme Phase 5a, ADR 0034 D15): a lowered classification, and the corrections of a contract and of an award.
 * Their editors are the acts themselves, in the modules that hold them, because they are acts of the record and not of Configuration. Each is exported from its own
 * "use server" module like any act. The act itself knows when the machinery runs it (`currentAmbient()`): asked of by a person it proposes the change, and run by the machinery it
 * does the change. Proposed by whoever the act itself lets do it (`propose: "EDITOR"`), decided by a holder of `corrections.decide`, and never by an administrator account
 * (NFR-SEC-004). `record-operations-scan.test.ts` holds each editor to asking who is signed in first, and to deciding between proposing and doing by `currentAmbient()`.
 */
export const documentsRecordsOperations = defineOperations("documents-records", "Documents", {
  reclassifyDocument: {
    kind: "CLASSIFICATION_DOWNGRADE",
    label: "Lower a document's classification",
    propose: "EDITOR",
    decide: "corrections.decide",
    administratorMay: false,
    load: () => import("@/app/documents/actions").then((m) => m.reclassifyDocument),
  },
});

const CORRECTOR = { propose: "EDITOR", decide: "corrections.decide", administratorMay: false } as const;

export const projectsRecordsOperations = defineOperations("projects", "Contracts", {
  correctBaseline: { ...CORRECTOR, kind: "BASELINE_CORRECTION", label: "Correct a contract's baseline", load: () => import("@/app/projects/[id]/actions").then((m) => m.correctBaseline) },
  correctAwardTerm: { ...CORRECTOR, kind: "AWARD_TERM_CORRECTION", label: "Correct a term of an award as recorded", load: () => import("@/app/projects/[id]/actions").then((m) => m.correctAwardTerm) },
  correctContractDate: { ...CORRECTOR, kind: "CONTRACT_DATE_CORRECTION", label: "Correct the Contract Date", load: () => import("@/app/projects/[id]/actions").then((m) => m.correctContractDate) },
});

export const awardsRecordsOperations = defineOperations("awards-records", "Awards", {
  recordReturn: { ...CORRECTOR, kind: "AWARD_RETURN_CORRECTION", label: "Correct an accepted award's return", load: () => import("@/app/awards/actions").then((m) => m.recordReturn) },
});
