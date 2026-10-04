"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Review S1 (6.13 Part B, Run 1a fix round): a contract panel's section states its act family's refusal once
 * (`actStatusBlocker(family, status)`), and every drawer inside it is blocked in those words, the drawers that compute
 * no blocker of their own included. Null lets each drawer's own rule speak. Read by RecordEditor.
 */
const ActGateContext = createContext<string | null>(null);

export function ActGate({ blocker, children }: { blocker: string | null; children: ReactNode }) {
  return <ActGateContext.Provider value={blocker}>{children}</ActGateContext.Provider>;
}

export const useActGate = () => useContext(ActGateContext);
