import { scopeOperations } from "../scope/operations";
import { evaluationOperations } from "../evaluation/operations";
import { numberingOperations } from "../numbering/operations";

/**
 * Every editor a two-person change can carry (sign-in programme Phase 5). A section is added here in the commit that moves it onto `ConfigurationChange`;
 * `registry-scan.test.ts` holds the rest of Configuration to being named, with a reason, as one that is not.
 */
export const OPERATIONS = {
  ...numberingOperations,
  ...scopeOperations,
  ...evaluationOperations,
} as const;

export type EditKey = keyof typeof OPERATIONS;
