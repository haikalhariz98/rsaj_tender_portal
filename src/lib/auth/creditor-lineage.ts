/**
 * Which application names a creditor profile's readers, for a profile sent after registration (Phase 4c). A profile sent WITH an application is named by that application's
 * registration route (Phase 4b). A version the supplier sent later, to change its bank details, belongs to no application: it takes the application of the nearest earlier version
 * that has one, so the officers the registration route named stay the ones who may read and check the change. Pure; `creditor-access-store.ts` reads the versions.
 */

/// `parentOf` maps a profile to the version it supersedes (null: none); `named` maps a profile to the application it was sent with. Null: no version in the chain was sent with one.
export function lineageApplication(profileId: string, parentOf: ReadonlyMap<string, string | null>, named: ReadonlyMap<string, string>): string | null {
  const seen = new Set<string>();
  for (let at: string | null | undefined = profileId; at && !seen.has(at); at = parentOf.get(at)) {
    const own = named.get(at);
    if (own) return own;
    seen.add(at);
  }
  return null;
}
