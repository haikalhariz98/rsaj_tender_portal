"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether the viewer may change settings at all. The Settings layout reads it once and every edit button below reads it here, so a
 * viewer who cannot save is not offered an Edit that leads nowhere (UX review). Outside Settings nothing provides it: true.
 */
const MayDraftContext = createContext(true);

export function MayDraft({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return <MayDraftContext.Provider value={allowed}>{children}</MayDraftContext.Provider>;
}

export const useMayDraft = () => useContext(MayDraftContext);
