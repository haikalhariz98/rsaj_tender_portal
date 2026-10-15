import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A content guard for the screens of wave 3b that the prototype does not have (Sourcing Requirements v2, SR-13), so `scripts/compare-screen.mjs` has nothing to diff them against.
 * A restyle must not drop a label that says where a fact comes from, a "not set" state, or the words that a record is attested and not checked. It reads the sources, because no
 * signed-in session can be assumed. `scripts/text-snapshot.mjs` records the rendered text of the same screens against a running server.
 */
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("the Bid sealing screen", () => {
  const page = src("src/app/configuration/bid-sealing/page.tsx");
  it("says an attestation is attested and not checked by the portal, and keeps the not-set state of the switch", () => {
    expect(page.match(/attested, not checked by the portal/g)?.length).toBeGreaterThanOrEqual(2);
    expect(page).toContain("Not set");
    expect(page).toContain("Where this comes from");
    expect(page).toContain("independent review pending");
  });
  it("names the three references the switch needs", () => {
    for (const label of ["The outside cryptography review", "The amendment of the bid procedure", "The organisation's written acceptance of the limits"]) expect(page).toContain(label);
  });
});

describe("the Sealing key card", () => {
  const card = src("src/app/sourcing/[id]/scope/key-section.tsx");
  it("keeps the fingerprint, the published fingerprint and the not-set state of the passphrase minimum", () => {
    for (const text of ["Sealing key", "Fingerprint", "Published with fingerprint", "Shortest passphrase", "Not published yet", "Not made yet", "Every named officer is needed"]) expect(card).toContain(text);
    expect(card).toContain("Not set");
  });
});

describe("the window's take-the-channel control and the per-part online rules", () => {
  it("keeps their labels", () => {
    const win = src("src/app/sourcing/[id]/window/editors.tsx");
    for (const text of ["Take how bids are submitted", "Take the organisation's setting"]) expect(win).toContain(text);
    const docs = src("src/app/configuration/tender-documents/editors.tsx");
    for (const text of ["File types a bidder may upload", "Largest file, in megabytes", "Online rules"]) expect(docs).toContain(text);
  });
});

describe("the Security screen", () => {
  it("keeps the unseal passphrase minimum with its not-set words", () => {
    const page = src("src/app/configuration/security/page.tsx");
    expect(page).toContain("sealingPassphraseMinLength");
    expect(page).toContain("no opening officer can set a share");
  });
});
