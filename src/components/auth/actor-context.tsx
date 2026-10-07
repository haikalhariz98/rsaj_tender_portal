"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Who is signed in, for the forms that say so (Phase 2b): an act's form shows "Decided by: you, <name>" rather than a picker, because the act is
 * the signed-in person's own. Read from the session by the root layout on this request; never from the form, and nothing here is trusted by the
 * server: the act's actor is read again from the session when the form is posted.
 */
const ActorContext = createContext<{ name: string; personId: string } | null>(null);

export function ActorProvider({ name, personId, children }: { name: string | null; personId: string | null; children: ReactNode }) {
  return <ActorContext.Provider value={name && personId ? { name, personId } : null}>{children}</ActorContext.Provider>;
}

export const useActorName = (): string | null => useContext(ActorContext)?.name ?? null;
/// The signed-in person's id, for a form that must know whether the person it names is oneself (a requesting officer, recorded for oneself or for another).
export const useActorPersonId = (): string | null => useContext(ActorContext)?.personId ?? null;
