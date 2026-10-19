import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

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
    // 0005, founder 2026-10-19: the callout is a chip; the claim it guards (review pending) is still on the surface.
    expect(page).toContain("Independent review pending");
  });
  it("keeps must-have 5's widened attested words (ruling 20ai)", () => {
    const editors = src("src/app/configuration/bid-sealing/editors.tsx");
    expect(editors).toContain("an edge header and body read timeout, with a maximum body size no larger than the largest part rule");
    expect(editors).toContain("Attested, not checked by the portal");
  });
  it("lists, read only, the exercises that still need the sealing pepper, with its organisation-only and not-held words (20y)", () => {
    expect(page).toContain("Exercises that still need the sealing pepper");
    expect(page).toContain("PEPPER_LIST_WORDS.scope");
    expect(page).toContain("PEPPER_LIST_WORDS.notHeld");
    expect(page).toContain("PEPPER_LIST_WORDS.invalid");
    // A restricted exercise is left out of the list by the reader's visibility, so the sentence that says so is always shown, with no number, and "none" is judged on what the reader can see.
    expect(page).toContain("PEPPER_LIST_WORDS.restricted");
    expect(page).toContain("pepperListState(pepperList.held, pepperRows.length)");
    const words = src("src/lib/sealing/pepper.ts");
    expect(words).toContain("covers this organisation only");
    expect(words).toContain("checks each one's list before the pepper is changed");
    expect(words).toContain("This is not the same as no exercise needing it");
    expect(words).toContain("listed only to them");
    expect(words).toContain("No exercise that you can see still needs");
  });
  it("names the three references the switch needs", () => {
    for (const label of ["The outside cryptography review", "The amendment of the bid procedure", "The organisation's written acceptance of the limits"]) expect(page).toContain(label);
  });
});

describe("the online finalise and the download of a file to check (20at, 20au)", () => {
  it("the download is one shared control that asks both secrets together and keeps neither", () => {
    const c = src("src/components/sealed-file-download.tsx");
    expect(c).toContain('autoComplete="current-password"');
    expect(c).toContain('autoComplete="off"');
    expect(c).toContain("/api/opening/sealed-file");
    expect(c).toContain('setPassword("")');
    expect(c).toContain('setPassphrase("")');
    expect(c).not.toMatch(/localStorage|sessionStorage/);
    const ws = src("src/app/sourcing/[id]/opening/workspace.tsx");
    // SR-14 (wave 3c step 5): the Files to check list became the checklist matrix. The same shared SealedFileDownload is each opening-check cell's download, in matrix.tsx, and the workspace renders the matrix.
    expect(ws).toContain("OpeningMatrix");
    expect(src("src/app/sourcing/[id]/opening/matrix.tsx")).toContain("SealedFileDownload");
    expect(ws).not.toContain("FilesToCheck");
  });
  it("the online finalise's drawers ask the passphrase and name who still has to sign", () => {
    const ed = src("src/app/sourcing/[id]/opening/editors.tsx");
    expect(ed).toContain("OnlineFinaliseDrawer");
    expect(ed).toContain("OnlineSignatureDrawer");
    expect(ed).toContain("Cannot be reset or recovered") // 0005, founder 2026-10-19: now the passphrase field's hint;
    expect(src("src/app/sourcing/[id]/opening/workspace.tsx")).toContain("officers have signed.");
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

/**
 * Wave 3b stage C, step 11 (build plan; ruling 20ap): the supplier's screens for an online bid. No prototype screen exists for them and no signed-in session can be assumed, so the sources are
 * read. Every sentence on them is `Words` in both languages (20ab), the receipt carries the supplier's own number and never the exercise-wide sequence (20an), and the fingerprint history is
 * read in the staff card's order.
 */
describe("the supplier's screens for an online bid", () => {
  const FILES = [
    "src/app/supplier/bids/[id]/submit/page.tsx",
    "src/app/supplier/bids/[id]/submit/bid-form.tsx",
    "src/app/supplier/bids/[id]/bid-panel.tsx",
    "src/app/supplier/bids/[id]/submissions-list.tsx",
    "src/app/supplier/bids/[id]/withdraw-control.tsx",
    "src/app/supplier/bids/[id]/receipt-card.tsx",
    "src/components/ui/print-button.tsx",
    "src/app/supplier/opportunities/[id]/your-key.tsx",
  ];

  it("hold no sentence of their own: JSX text and string attributes are words from SCREEN_WORDS, in both languages", () => {
    for (const f of FILES) {
      const text = src(f);
      // JSX text of two or more words that is not an expression: a sentence typed into a component.
      const typed = [...text.matchAll(/>\s*([A-Z][A-Za-z']+(?:\s+[A-Za-z']+)+[^<>{}]*)\s*</g)].map((m) => m[1]);
      expect(typed, f).toEqual([]);
    }
  });

  it("the submit page keeps the parts, the declared fields, the password, the browser hash, the receipt with Print and the DEMONSTRATION banner", () => {
    const form = src("src/app/supplier/bids/[id]/submit/bid-form.tsx");
    for (const token of ["partsTitle", "SCREEN_WORDS.price", "SCREEN_WORDS.period", "SCREEN_WORDS.password", "sha256HexOf", "contentSha256", "ReceiptCard", "DEMONSTRATION_WORDS", "replaceNote", "alternativesNotConsidered"]) expect(form, token).toContain(token);
    expect(src("src/app/supplier/bids/[id]/receipt-card.tsx")).toContain("PrintButton");
    const page = src("src/app/supplier/bids/[id]/submit/page.tsx");
    for (const token of ["discardedTitle", "limitsTitle", "pastClosingTitle", "paperOnlyTitle"]) expect(page, token).toContain(token);
  });

  it("Your bid keeps the number, the stamp, the status, the digest in full, Withdraw with its tick boxes, and the opening's words", () => {
    const list = src("src/app/supplier/bids/[id]/submissions-list.tsx");
    for (const token of ["colNumber", "colStamp", "colStatus", "colDigest", "receiptDigest", "v.opening", "WithdrawControl", "showReceipt"]) expect(list, token).toContain(token);
    const withdraw = src("src/app/supplier/bids/[id]/withdraw-control.tsx");
    for (const token of ["Checkbox", "alsoWithdraw", "withdrawAlternativesNote", "password"]) expect(withdraw, token).toContain(token);
  });

  it("show the supplier's own number and never the exercise-wide sequence (20an)", () => {
    for (const f of FILES) expect(src(f), f).not.toMatch(/\bsequence\b/i);
  });

  it("the opportunity page lists the key's history beside the fingerprint, and the staff card reads the same rows in the same order", () => {
    expect(src("src/app/supplier/opportunities/[id]/page.tsx")).toContain("YourKey");
    expect(src("src/app/supplier/opportunities/[id]/your-key.tsx")).toContain("loadKeyHistory");
    expect(src("src/app/sourcing/[id]/scope/key-section.tsx")).toContain("KEY_CHANGE_ORDER");
    expect(lex(src("src/lib/sealing/key-history.ts"), { only: "comments" })).not.toMatch(/reason|byPersonId|viaOfficerKeyId/);
  });
});

/**
 * Wave 3b stage C (ruling 20ap, review): the staff screens that carry the online opening. Content only: a restyle must keep the passphrase field and the n-of-n words of the authorise drawer,
 * the check-my-passphrase drawer on the Sealing key card, Received's online counts and order note, and the names-at-finalising words. The officer's download has no screen yet (the route is
 * its only surface), so there is nothing of it to guard here.
 */
describe("the staff screens of the online opening", () => {
  it("the online authorise drawer asks for the passphrase and says every named officer is needed and that a passphrase cannot be recovered", () => {
    const drawer = src("src/app/sourcing/[id]/opening/editors.tsx");
    for (const token of ["AuthoriseOnlineDrawer", "Unseal passphrase", "secret: true", "authoriseOnlineUnseal", "named officers must authorise", "Cannot be reset or recovered", "OpeningAuthorisation.person"]) expect(drawer, token).toContain(token);
  });
  it("the Sealing key card offers the check of one's own passphrase and says nothing is opened by it", () => {
    expect(src("src/app/sourcing/[id]/scope/key-section.tsx")).toContain("CheckUnlockDrawer");
    const editors = src("src/app/sourcing/[id]/scope/key-editors.tsx");
    for (const token of ["Check that I can still unlock my key", "Unseal passphrase", "Nothing is opened and no share is released", "checkUnlock", "OfficerExerciseKey.person"]) expect(editors, token).toContain(token);
  });
  it("Received keeps the online counts and the order note (the words themselves are pinned in received.test.ts, 20ar)", () => {
    const work = src("src/app/sourcing/[id]/bids/workspace.tsx");
    for (const token of ["d.online.count", "d.online.inTime", "d.online.late", "d.online.ordinalNote"]) expect(work, token).toContain(token);
  });
  it("the Opening tab keeps the words that stand for a name between the unseal and finalising (20c)", () => {
    expect(src("src/lib/opening/labels.ts")).toContain("NAMES_AT_FINALISING");
    expect(src("src/lib/opening/read.ts")).toContain("namesHeld");
  });
});
