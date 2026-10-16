import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ADR 0016 (6.6 OD-1, OD-2): the register records envelopes, never offers, and names no bidder
 * before opening. Three scans keep it so:
 * - the register's models carry no price, sum, period, score or content column;
 * - no code but 6.7's `openEnvelope` writes an envelope's party (OD-2; 6.7 C-10 names the one writer);
 * - no code deletes an envelope (FR-BID-003: never deleted, rejected or set aside), and the bids
 *   screens offer no Delete or Reject.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const modelBody = (name: string) => {
  const m = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const sources = [...files(join(root, "src", "app")), ...files(join(root, "src", "lib"))].map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));

describe("the register holds no offer (ADR 0016)", () => {
  it.each(["BidEnvelope", "BidWithdrawal", "BoxEvent", "ValidityExtension"])("%s has no money, price, sum, period, score or content column", (model) => {
    const fields = modelBody(model)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\w+\s+\w/.test(l) && !l.startsWith("//") && !l.startsWith("@@"));
    expect(fields.filter((l) => /\bDecimal\b|BigInt|Bytes/.test(l))).toEqual([]);
    expect(fields.map((l) => l.split(/\s+/)[0]).filter((n) => /price|amount|sum|value|period|score|content|figure|total/i.test(n))).toEqual([]);
  });
});

/// Each `bidEnvelope.<write>(` call with the text of its argument (to the matching parenthesis), and where it is.
function envelopeWrites(text: string): { w: string; at: number }[] {
  const out: { w: string; at: number }[] = [];
  const re = /bidEnvelope\.(create|createMany|update|updateMany|upsert)\(/g;
  for (const m of text.matchAll(re)) {
    let depth = 0;
    let i = m.index! + m[0].length - 1;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    out.push({ w: text.slice(m.index!, i + 1), at: m.index! });
  }
  return out;
}

/// Every named function declared in a file (`function f(`, `async function f(`, and `const f = (…) =>` or
/// `async (…) =>` with a block body), with the span of its body from its opening brace to the
/// matching closing one.
function functionSpans(text: string): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = [];
  const re = /(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  for (const m of text.matchAll(re)) {
    // Past the parameters (to their matching parenthesis), then to the body's opening brace.
    let i = m.index! + m[0].length - 1;
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")" && --depth === 0) break;
    }
    // The body: the first "{" that ends a line (a return-type literal stays on the signature's line), or "=> {".
    const rest = text.slice(i + 1);
    const arrow = /^\s*(?::[^=]*?)?=>\s*\{/.exec(rest);
    const block = /^[^;{]*?\{\s*\n/.exec(rest);
    const open = arrow ? i + 1 + arrow[0].lastIndexOf("{") : block ? i + 1 + block[0].lastIndexOf("{") : -1;
    if (open < 0) continue;
    let d = 0;
    let j = open;
    for (; j < text.length; j++) {
      if (text[j] === "{") d++;
      else if (text[j] === "}" && --d === 0) break;
    }
    out.push({ name: m[1] ?? m[2], from: open, to: j });
  }
  return out;
}

/// The function a write sits in: the innermost declared function whose body encloses it (6.7 review R-7: not the last one declared before it).
const within = (text: string, at: number) =>
  functionSpans(text)
    .filter((f) => f.from < at && at < f.to)
    .sort((a, b) => b.from - a.from)[0]?.name ?? "(module)";

describe("no bidder is named before opening (OD-2)", () => {
  // 6.7 C-10 (ruled, flagged): the scan becomes "only openEnvelope writes an envelope's party" — the
  // one act that names a bidder, at its opening. Every other envelope write still names none.
  // Wave 3b step 13 (ADR 0036 D9: "its party is named at the unseal"; plan 1.5f): the online unseal's `commitUnseal` is the one other act that names a bidder, in the transaction that opens its
  // submission, from the sealed record the officers opened together. Every other envelope write still names none.
  it("only 6.7's openEnvelope and the online unseal's commitUnseal set an envelope's party; no other write in the app or the lib does", () => {
    // Each occurrence is attributed where it is (6.7 review R-7: two identical writes in two functions are two writes).
    const writes = sources.flatMap((s) => envelopeWrites(s.text).map(({ w, at }) => ({ path: s.path, w, fn: within(s.text, at) })));
    expect(writes.length).toBeGreaterThan(0);
    const naming = writes.filter((x) => /\bpartyId\b|\bparty\s*:/.test(x.w));
    expect(naming.map((x) => `${x.path}#${x.fn}`)).toEqual([join("src", "app", "sourcing", "[id]", "opening", "actions.ts") + "#openEnvelope", join("src", "lib", "opening", "unseal-store.ts") + "#commitUnseal"]);
  });
});

describe("the scan attributes a write to the function that encloses it (6.7 review R-7)", () => {
  const sample = [
    "export async function openEnvelope(_prev: FormState, data: FormData): Promise<FormState> {",
    "  const helper = async (tx: Tx) => {",
    "    await tx.bidEnvelope.updateMany({ where: { id }, data: { status: \"OPENED\" } });",
    "  };",
    "  await tx.bidEnvelope.updateMany({ where: { id }, data: { status: \"OPENED\", partyId } });",
    "}",
    "function other() {",
    "  return 1;",
    "}",
    "export async function sneaky(): Promise<void> {",
    "  await tx.bidEnvelope.updateMany({ where: { id }, data: { status: \"OPENED\", partyId } });",
    "}",
  ].join("\n");
  it("each occurrence by its own position: the same write text in two functions is two writes", () => {
    const found = envelopeWrites(sample).map(({ w, at }) => ({ w, fn: within(sample, at) }));
    expect(found.map((x) => x.fn)).toEqual(["helper", "openEnvelope", "sneaky"]);
  });
  it("a write after a function has closed is not that function's", () => {
    expect(within(sample, sample.indexOf("return 1;"))).toBe("other");
    expect(within(sample, sample.lastIndexOf("await tx.bidEnvelope"))).toBe("sneaky");
  });
});

describe("an envelope is never deleted, rejected or set aside (FR-BID-003)", () => {
  it("no code deletes an envelope, a withdrawal, a box event or an extension", () => {
    const hits = sources.filter((s) => /\b(bidEnvelope|bidWithdrawal|boxEvent|validityExtension)\.(delete|deleteMany)\(/.test(s.text)).map((s) => s.path);
    expect(hits).toEqual([]);
  });
  it("the bids screens offer no Delete or Reject", () => {
    const screens = sources.filter((s) => s.path.includes(join("sourcing", "[id]", "bids")) && s.path.endsWith(".tsx"));
    expect(screens.length).toBeGreaterThan(0);
    for (const s of screens) expect(s.text, s.path).not.toMatch(/>\s*(Delete|Reject)[^<]*</);
  });
});

/**
 * SR-13 (ADR 0036 D12, ruling 20; wave 3b step 2): the online sealed-bid tables hold ciphertext and named key material only. The paper scans above are unchanged; these
 * cover the tables ADR 0036 adds for exercises pinned ONLINE.
 * - a Bytes column is either SEALED (ciphertext, or a key sealed to another key) or KEY_MATERIAL (public, or no secret on its own), each named here with its reason;
 * - there is no Decimal: no figure is stored plain;
 * - no column is named like a price, an amount, a period, a filename, a media type, a plain value, a figure or a total;
 * - the plain identity columns are exactly the D9 list (20a: a recorded gap against FR-BID-001's identity clause, so the list cannot grow unnoticed).
 */
const SEALED_BID_TABLES = ["OfficerExerciseKey", "ExerciseSealingKey", "PublishedKeyChange", "ExerciseKeyShare", "ShareRelease", "OnlineBidFile", "OnlineBid", "OnlineBidPart", "OfficerDekGrant", "SealedEstimateLodgement", "SealedAccessEvent"];

const SEALED_COLUMNS: Readonly<Record<string, string>> = {
  "OfficerExerciseKey.wrappedPrivateKey": "the officer's private key under AES-256-GCM, its key derived from the officer's passphrase (and the pepper under LIVE)",
  "ExerciseKeyShare.sealedShare": "one officer's share of the exercise key, HPKE-sealed to that officer's key",
  "ShareRelease.sealedShares": "the shares an officer forwards, HPKE-sealed to the receiving officer's key",
  "OnlineBidFile.sealedDek": "the file's data key, HPKE-sealed to the exercise key",
  "OnlineBidFile.sealedMeta": "the file's name, media type, plain hash and size, under its data key",
  "OnlineBid.sealedManifest": "the submission's manifest, under its data key",
  "OnlineBid.manifestDek": "the manifest's data key, HPKE-sealed to the exercise key",
  "OnlineBid.sealedDeclaration": "the declared price and period, under its data key",
  "OnlineBid.declarationDek": "the declaration's data key, HPKE-sealed to the exercise key",
  "OfficerDekGrant.sealedDek": "a data key re-sealed to one named officer at the unseal",
  "SealedEstimateLodgement.sealedEstimate": "the company estimate's figure, under its data key",
  "SealedEstimateLodgement.estimateDek": "the estimate's data key, HPKE-sealed to the exercise key",
};
const KEY_MATERIAL_COLUMNS: Readonly<Record<string, string>> = {
  "OfficerExerciseKey.publicKey": "a public key: it seals, and opens nothing",
  "ExerciseSealingKey.publicKey": "a public key: it seals, and opens nothing",
  "OfficerExerciseKey.kdfSalt": "the scrypt salt: public by design, useless without the passphrase",
  "OnlineBidFile.bodyIv": "the body's GCM nonce: public by design, useless without the data key",
  "OnlineBidFile.releasedDek": "the data key in plain, written only after the finalise has made the bid's figures public, and shredded once the file is moved (M5)",
};
/// Security audit 9: the columns named like a hash or a digest, each a digest of ciphertext (which says nothing of the plain bid) or of the receipt built from those.
const DIGEST_COLUMNS: Readonly<Record<string, string>> = {
  "OnlineBidFile.cipherSha256": "the SHA-256 of the file's ciphertext, the key of its stored bytes; the plain file's hash is sealed in its metadata",
  "OnlineBid.manifestCipherSha256": "the SHA-256 of the sealed manifest's ciphertext",
  "OnlineBid.declarationCipherSha256": "the SHA-256 of the sealed declaration's ciphertext; the declared price is never hashed in plain",
  "OnlineBid.receiptDigest": "the receipt's digest, over the exercise, sequence, stamp, key fingerprint and the ciphertext digests only (receipt.ts)",
  "SealedEstimateLodgement.cipherSha256": "the SHA-256 of the sealed estimate's ciphertext; the figure is never hashed in plain",
  // Named like a hash only by "share": each is a SEALED column above, ciphertext, no digest at all.
  "ExerciseKeyShare.sealedShare": "not a hash: an officer's share, sealed (listed with the SEALED columns)",
  "ShareRelease.sealedShares": "not a hash: the forwarded shares, sealed (listed with the SEALED columns)",
};
/// ADR 0036 D9 (20a): the plain identity links on the sealed tables. AuditEntry and ActAttribution carry the account too, and are pinned elsewhere.
const IDENTITY_COLUMNS = ["OnlineBid.submittedBySupplierAccountId", "OnlineBid.supplierId", "OnlineBid.withdrawnBySupplierAccountId", "OnlineBidFile.supplierId", "OnlineBidFile.uploadedBySupplierAccountId", "SealedAccessEvent.supplierAccountId"];

/// Each scalar column of a model: its name and its type, relations and block attributes left out.
const columnsOf = (model: string) =>
  modelBody(model)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\w+\s+\w/.test(l) && !l.startsWith("//") && !l.startsWith("@@"))
    .map((l) => {
      const [name, type] = l.split(/\s+/);
      // An `Unsupported("…")` column (the xid8 transaction columns, migration 20261103200000) is a scalar of the database's, never a relation.
      return { name, type: type.replace(/[?[\]]/g, ""), relation: /@relation\(/.test(l) || (/^[A-Z]/.test(type) && !type.startsWith("Unsupported(") && !["String", "Int", "BigInt", "Boolean", "DateTime", "Bytes", "Decimal", "Json", "Float"].includes(type.replace(/[?[\]]/g, ""))) };
    });

describe("the online sealed-bid tables hold ciphertext and named key material only (SR-13, ADR 0036 D12, ruling 20)", () => {
  it("every table the ADR adds is scanned", () => {
    for (const m of SEALED_BID_TABLES) expect(() => modelBody(m), m).not.toThrow();
  });

  it("a Bytes column is exactly a SEALED or a KEY_MATERIAL column, each named with its reason", () => {
    const bytes = SEALED_BID_TABLES.flatMap((m) => columnsOf(m).filter((c) => c.type === "Bytes").map((c) => `${m}.${c.name}`)).sort();
    expect(bytes).toEqual([...Object.keys(SEALED_COLUMNS), ...Object.keys(KEY_MATERIAL_COLUMNS)].sort());
    for (const [k, why] of [...Object.entries(SEALED_COLUMNS), ...Object.entries(KEY_MATERIAL_COLUMNS)]) expect(why.length, k).toBeGreaterThan(20);
  });

  it("no column is a Decimal, a Float or named like a price, an amount, a period, a filename, a media type, a plain value, a figure or a total", () => {
    for (const m of SEALED_BID_TABLES) {
      const cols = columnsOf(m);
      expect(cols.filter((c) => c.type === "Decimal" || c.type === "Float").map((c) => c.name), m).toEqual([]);
      expect(cols.filter((c) => !c.relation).map((c) => c.name).filter((n) => /price|amount|period|filename|name|media|plain|figure|total/i.test(n)), m).toEqual([]);
    }
  });

  // Security audit 9: a hash of a plain value (a file's plain SHA-256, say) would say what a sealed bid holds, and is not Bytes, so the Bytes scan would miss it.
  // Every column named like a hash or a digest is listed here with what it is a hash of, so one cannot be added unseen.
  it("every column named like a hash or a digest is a digest of ciphertext or of the receipt, each named with its reason (audit 9)", () => {
    const named = SEALED_BID_TABLES.flatMap((m) => columnsOf(m).filter((c) => !c.relation && /sha|hash|digest/i.test(c.name)).map((c) => `${m}.${c.name}`)).sort();
    expect(named).toEqual(Object.keys(DIGEST_COLUMNS).sort());
    for (const [k, why] of Object.entries(DIGEST_COLUMNS)) expect(why.length, k).toBeGreaterThan(20);
  });

  it("the plain identity columns are exactly ADR 0036 D9's list (20a)", () => {
    const identity = SEALED_BID_TABLES.flatMap((m) => columnsOf(m).filter((c) => !c.relation && /supplier/i.test(c.name)).map((c) => `${m}.${c.name}`)).sort();
    expect(identity).toEqual([...IDENTITY_COLUMNS].sort());
  });
});

/**
 * Wave 3b step 12 (ruling 20a): which code reads the online tables, and which of it selects the D9 identity columns. The list above pins the columns; this pins the readers. A file that
 * touches the online-bid tables (through the client or in raw SQL) is on one of the two lists below, with its reason, or this fails. Step 13's unseal adds its own file to the first
 * list, and nothing else may. A file on the second list names no identity column at all.
 */
const TOUCHES_ONLINE_TABLES = /\.(?:onlineBid|onlineBidFile|onlineBidPart|sealedAccessEvent)\b|(?:FROM|INTO|UPDATE|JOIN)\s+"(?:OnlineBid|OnlineBidFile|OnlineBidPart|SealedAccessEvent)"/;
const IDENTITY_TOKENS = /supplierId|supplierAccountId|SupplierAccountId|submittedBy\b|withdrawnBy\b|uploadedBy\b/;
const MAY_SELECT_IDENTITY: Readonly<Record<string, string>> = {
  "src/lib/bids/online/submit-store.ts": "step 10: the submit and the withdraw write the supplier and its account on the bid, and read the supplier's own rows",
  "src/lib/bids/online/upload-store.ts": "step 10: the part upload writes the supplier and its account on the file, and reads the supplier's own files",
  "src/lib/bids/online/my-bids-store.ts": "step 11: the supplier's own screens read its own submissions, by the session's supplier and no other",
  "src/lib/opening/unseal-store.ts": "step 13 (plan 1.5e, 1.5f): the last authorisation of the unseal lists each opened bid under its supplier's party on the exercise, and reads no other",
  "src/lib/sealing/online-file-mover.ts": "step 15 (ADR 0036 D10): the mover files a finalised bid file as a document recorded by the supplier account that uploaded it, and reads no other identity",
};
const SELECTS_NO_IDENTITY: Readonly<Record<string, string>> = {
  "src/lib/bids/online/audit-scope-store.ts": "step 12: reads an id and an exercise from the online tables to find which exercise an audit row belongs to",
  "src/lib/sealing/store.ts": "the key ceremony: logs staff acts on the access-event table and reads the keys, never a bid",
  "src/lib/opening/sealed-file-store.ts": "step 14: the officer's download reads a file's ciphertext address and its bid's status by the file's id at an opening, through the grant sealed to the officer's own key, and names no supplier, account or submitter",
  "src/lib/opening/online-finalise-store.ts": "step 15: before the finalise commits, reads each opened bid's sealed declaration and files by the opened offer's envelope, through the grants sealed to the finaliser, and names no supplier, account or submitter",
  "src/app/sourcing/[id]/opening/finalise-transaction.ts": "step 15: the finalising transaction reads the opened bids' file ids by envelope to release each data key, and names no supplier, account or submitter",
  "src/lib/sealing/pepper-store.ts": "step 15 (20y): reads each late online bid's status by its envelope and the roll's sequence, to judge whether the pepper is still needed, and names no supplier, account or submitter",
  "src/lib/documents/hidden.ts": "step 15: finds the exercise a moved bid file hangs on, to judge who may read its document, and names no supplier, account or submitter",
  "src/lib/sealing/unlock-store.ts": "step 13: logs an officer's attempts at their own key on the access-event table, by the staff person, and reads the officer's key, never a bid",
};

describe("only the step 10 stores read the D9 identity columns (20a, step 12)", () => {
  const touching = sources.filter((s) => !s.path.endsWith(".test.ts") && TOUCHES_ONLINE_TABLES.test(s.text)).map((s) => s.path.replace(/\\/g, "/")).sort();

  it("every file that reads the online tables is listed, with its reason", () => {
    expect(touching).toEqual([...Object.keys(MAY_SELECT_IDENTITY), ...Object.keys(SELECTS_NO_IDENTITY)].sort());
    for (const why of [...Object.values(MAY_SELECT_IDENTITY), ...Object.values(SELECTS_NO_IDENTITY)]) expect(why.length).toBeGreaterThan(20);
  });

  it.each(Object.keys(SELECTS_NO_IDENTITY))("%s names no identity column", (path) => {
    const text = sources.find((s) => s.path.replace(/\\/g, "/") === path)!.text;
    expect(text.split("\n").filter((l) => IDENTITY_TOKENS.test(l) && !l.trim().startsWith("*") && !l.trim().startsWith("//"))).toEqual([]);
  });

  it("no screen, route or other store reaches the identity columns through a relation either", () => {
    const viaRelation = sources
      .filter((s) => !s.path.endsWith(".test.ts") && !(s.path.replace(/\\/g, "/") in MAY_SELECT_IDENTITY))
      .filter((s) => /onlineBid\s*:\s*\{[^}]*(?:supplier|submittedBy|withdrawnBy)/s.test(s.text))
      .map((s) => s.path);
    expect(viaRelation).toEqual([]);
  });
});
