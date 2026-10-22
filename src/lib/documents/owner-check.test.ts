import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ATTACHMENT_PURPOSES, OWNER_COLUMN, OWNER_KINDS, PURPOSE_OWNER } from "./types";

/**
 * X-6: every migration that adds an attachment owner rebuilds the owner CHECKs from the
 * full owner list. This compares three things that must say the same: the owner keys on
 * DocumentAttachment in schema.prisma, the latest `DocumentAttachment_one_owner` and
 * `DocumentAttachment_purpose_owner` definitions across the migration folders (in the order
 * they apply), and the lib's OWNER_COLUMN / PURPOSE_OWNER. An owner added in one place only
 * fails here.
 */

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migrationsDir = join(root, "prisma/migrations");
const migrations = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

function modelBody(name: string): string {
  const m = new RegExp(`\\nmodel ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
}

/// The last definition of a constraint, across the migrations in the order they apply.
function latestCheck(name: string): string {
  let found: string | null = null;
  for (const dir of migrations) {
    const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
    const re = new RegExp(`ADD CONSTRAINT "${name}"\\s*CHECK\\s*([\\s\\S]*?);`, "g");
    for (const m of sql.matchAll(re)) found = m[1];
  }
  if (!found) throw new Error(`no CHECK ${name} in the migrations`);
  return found;
}

/**
 * 6.13 Part B Run 0 fix round (consider, stricter): where each mention of `literal` sits in a migration that is not the
 * purpose's own: inside the body of an `ADD CONSTRAINT "DocumentAttachment_purpose_owner" CHECK (…)` rebuild, or not. Returns
 * the offsets of the mentions outside every such body (an empty list: every mention is a rebuild of the owner CHECK).
 */
export function mentionsOutsidePurposeCheck(sql: string, literal: string): number[] {
  const bodies: [number, number][] = [];
  for (const m of sql.matchAll(/ADD CONSTRAINT "DocumentAttachment_purpose_owner"\s*CHECK\s*\(/g)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    let end = sql.length;
    for (let i = open; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    bodies.push([open, end]);
  }
  const out: number[] = [];
  for (let at = sql.indexOf(literal); at >= 0; at = sql.indexOf(literal, at + 1)) if (!bodies.some(([a, b]) => a < at && at < b)) out.push(at);
  return out;
}

describe("attachment owners: schema, CHECK and lib agree (X-6)", () => {
  const body = modelBody("DocumentAttachment");
  // Every nullable key with a relation, other than the version it pins, is an owner.
  const schemaOwners = [...body.matchAll(/^\s*\w+\s+\w+\?\s+@relation\(fields: \[(\w+)\]/gm)].map((m) => m[1]).sort();

  it("the schema's owner keys are the lib's owner columns", () => {
    expect(schemaOwners).toEqual([...Object.values(OWNER_COLUMN)].sort());
    expect(OWNER_KINDS.map((k) => OWNER_COLUMN[k]).sort()).toEqual(schemaOwners);
  });

  it("one_owner counts exactly those keys", () => {
    const def = latestCheck("DocumentAttachment_one_owner");
    const m = /num_nonnulls\(([^)]*)\)\s*=\s*1/.exec(def);
    expect(m, def).not.toBeNull();
    const cols = m![1].split(",").map((c) => c.trim().replace(/"/g, "")).sort();
    expect(cols).toEqual(schemaOwners);
  });

  it("purpose_owner pairs every purpose with its owner's key, as PURPOSE_OWNER does", () => {
    const def = latestCheck("DocumentAttachment_purpose_owner");
    const pairs = new Map<string, string>();
    for (const arm of def.matchAll(/\("purpose"\s*(=|IN)\s*(\([^)]*\)|'[A-Z_]+')\s*AND\s*"(\w+)"\s+IS NOT NULL\)/g)) {
      for (const p of arm[2].matchAll(/'([A-Z_]+)'/g)) pairs.set(p[1], arm[3]);
    }
    expect([...pairs.keys()].sort()).toEqual([...ATTACHMENT_PURPOSES].sort());
    for (const p of ATTACHMENT_PURPOSES) expect(pairs.get(p), p).toBe(OWNER_COLUMN[PURPOSE_OWNER[p]]);
  });

  it("the schema's AttachmentPurpose enum is the lib's list", () => {
    const m = /\nenum AttachmentPurpose \{([\s\S]*?)\n\}/.exec(schema);
    const values = m![1].split("\n").map((l) => l.trim()).filter((l) => /^[A-Z_]+$/.test(l));
    expect(values).toEqual([...ATTACHMENT_PURPOSES]);
  });
});

describe("6.2 Q-3: the bill version is an owner, everywhere at once", () => {
  it("bqVersionId is counted by one_owner and BQ_IMPORT_SOURCE pairs with it", () => {
    const one = latestCheck("DocumentAttachment_one_owner");
    expect(one).toMatch(/"bqVersionId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'BQ_IMPORT_SOURCE'\s*AND\s*"bqVersionId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.bqVersion).toBe("bqVersionId");
    expect(PURPOSE_OWNER.BQ_IMPORT_SOURCE).toBe("bqVersion");
  });
});

describe("6.4: the tender pack part is an owner, everywhere at once (X-6)", () => {
  it("tenderPackPartId is counted by one_owner and TENDER_PART pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"tenderPackPartId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'TENDER_PART'\s*AND\s*"tenderPackPartId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.tenderPackPart).toBe("tenderPackPartId");
    expect(PURPOSE_OWNER.TENDER_PART).toBe("tenderPackPart");
  });

  it("the purpose arrived in its own migration, before the migration that rebuilt the CHECKs with it", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'TENDER_PART'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => /'TENDER_PART' AND "tenderPackPartId"/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    expect(own[0] < used[0]).toBe(true);
    // Its own migration holds the value and nothing else.
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});

describe("6.5: the addendum is an owner, and the window's purposes pair with theirs, everywhere at once (X-6)", () => {
  it("addendumId is counted by one_owner and ADDENDUM_SIGNED pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"addendumId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'ADDENDUM_SIGNED'\s*AND\s*"addendumId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.addendum).toBe("addendumId");
    expect(PURPOSE_OWNER.ADDENDUM_SIGNED).toBe("addendum");
  });

  it("a publication's proof and an attendance sheet are the exercise's", () => {
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/'PUBLICATION_PROOF', 'ATTENDANCE_SHEET', 'PUBLISHED_SCHEDULE'\) AND "exerciseId" IS NOT NULL/);
    // Go-live R4: the published schedule is the exercise's too, in the CHECK and in the lib.
    expect(PURPOSE_OWNER.PUBLISHED_SCHEDULE).toBe("exercise");
    expect(PURPOSE_OWNER.PUBLICATION_PROOF).toBe("exercise");
    expect(PURPOSE_OWNER.ATTENDANCE_SHEET).toBe("exercise");
  });

  it.each(["ADDENDUM_SIGNED", "PUBLICATION_PROOF", "ATTENDANCE_SHEET", "PUBLISHED_SCHEDULE"])("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (value) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${value}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${value}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});

describe("6.6: the bid withdrawal and the validity extension are owners, everywhere at once (X-6)", () => {
  it("bidWithdrawalId and validityExtensionId are counted by one_owner, and their purposes pair with them", () => {
    const one = latestCheck("DocumentAttachment_one_owner");
    expect(one).toMatch(/"bidWithdrawalId"/);
    expect(one).toMatch(/"validityExtensionId"/);
    const purpose = latestCheck("DocumentAttachment_purpose_owner");
    expect(purpose).toMatch(/\("purpose"\s*=\s*'WITHDRAWAL_LETTER'\s*AND\s*"bidWithdrawalId"\s+IS NOT NULL\)/);
    expect(purpose).toMatch(/\("purpose"\s*=\s*'VALIDITY_CONSENT'\s*AND\s*"validityExtensionId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.bidWithdrawal).toBe("bidWithdrawalId");
    expect(OWNER_COLUMN.validityExtension).toBe("validityExtensionId");
    expect(PURPOSE_OWNER.WITHDRAWAL_LETTER).toBe("bidWithdrawal");
    expect(PURPOSE_OWNER.VALIDITY_CONSENT).toBe("validityExtension");
  });

  it.each(["WITHDRAWAL_LETTER", "VALIDITY_CONSENT"])("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (value) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${value}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${value}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });

  it("only a LATE_TENDER matter names an envelope (CHECK)", () => {
    expect(latestCheck("CommitteeDecision_bid_envelope_late")).toMatch(/"bidEnvelopeId" IS NULL OR "matterKind" = 'LATE_TENDER'/);
  });
});

describe("6.7: the opening is an owner, everywhere at once (X-6)", () => {
  it("openingId is counted by one_owner and SIGNED_SCHEDULE pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"openingId"/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose"\s*=\s*'SIGNED_SCHEDULE'\s*AND\s*"openingId"\s+IS NOT NULL\)/);
    expect(OWNER_COLUMN.opening).toBe("openingId");
    expect(PURPOSE_OWNER.SIGNED_SCHEDULE).toBe("opening");
  });

  it("the purpose arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'SIGNED_SCHEDULE'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes("'SIGNED_SCHEDULE'"));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});

describe("6.8: the evaluation, its meetings and its bidders are owners, everywhere at once (X-6)", () => {
  it("their keys are counted by one_owner and each purpose pairs with its owner", () => {
    const one = latestCheck("DocumentAttachment_one_owner");
    for (const k of ["evaluationId", "evaluationMeetingId", "evaluationBidderId"]) expect(one).toMatch(new RegExp(`"${k}"`));
    const po = latestCheck("DocumentAttachment_purpose_owner");
    expect(po).toMatch(/'REPORT_DRAWINGS', 'SIGNED_REPORT', 'SIGNED_PROPOSAL_PAPER'\)\s*AND\s*"evaluationId"\s+IS NOT NULL/);
    expect(po).toMatch(/'MEETING_MINUTES', 'TENDERER_CONFIRMATION'\)\s*AND\s*"evaluationMeetingId"\s+IS NOT NULL/);
    expect(po).toMatch(/'CPR_REPORT', 'COMMUNICATION'\)\s*AND\s*"evaluationBidderId"\s+IS NOT NULL/);
    expect(OWNER_COLUMN.evaluation).toBe("evaluationId");
    expect(OWNER_COLUMN.evaluationMeeting).toBe("evaluationMeetingId");
    expect(OWNER_COLUMN.evaluationBidder).toBe("evaluationBidderId");
  });

  it.each(["CPR_REPORT", "COMMUNICATION", "MEETING_MINUTES", "TENDERER_CONFIRMATION", "REPORT_DRAWINGS", "SIGNED_REPORT", "SIGNED_PROPOSAL_PAPER"])("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (purpose) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${purpose}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${purpose}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });

  it("an EVALUATION_STAGE matter alone names an evaluation bidder", () => {
    expect(latestCheck("CommitteeDecision_evaluation_stage")).toMatch(/"evaluationBidderId" IS NULL OR "matterKind" = 'EVALUATION_STAGE'/);
  });
});

describe("6.15: a supplier's document and application are owners, everywhere at once (X-6)", () => {
  it("their keys are counted by one_owner and each purpose pairs with its owner", () => {
    const one = latestCheck("DocumentAttachment_one_owner");
    for (const k of ["supplierDocumentId", "supplierApplicationId"]) expect(one).toMatch(new RegExp(`"${k}"`));
    const po = latestCheck("DocumentAttachment_purpose_owner");
    expect(po).toMatch(/\("purpose"\s*=\s*'SUPPLIER_DOCUMENT'\s*AND\s*"supplierDocumentId"\s+IS NOT NULL\)/);
    expect(po).toMatch(/'SUPPLIER_DECLARATION', 'SUPPLIER_EPAYMENT_FORM'\)\s*AND\s*"supplierApplicationId"\s+IS NOT NULL/);
    expect(OWNER_COLUMN.supplierDocument).toBe("supplierDocumentId");
    expect(OWNER_COLUMN.supplierApplication).toBe("supplierApplicationId");
  });

  it.each(["SUPPLIER_DOCUMENT", "SUPPLIER_DECLARATION", "SUPPLIER_EPAYMENT_FORM"])("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (purpose) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${purpose}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${purpose}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });

  it("the SUPPLIER matter kind arrived alone, and a SUPPLIER route names exactly one supplier record while any other route names none (a2)", () => {
    const own = migrations.filter((d) => /ALTER TYPE "MatterKind" ADD VALUE 'SUPPLIER';/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    expect(own).toHaveLength(1);
    // ADR 0041 D5: the online application is a SUPPLIER route's subject too, counted with the others (migration 20261117001000).
    expect(latestCheck("ApprovalInstance_supplier_matter")).toBe(`(num_nonnulls("supplierApplicationId", "standingRequestId", "specialPermissionId", "portalApplicationId") = CASE WHEN "matterKind" = 'SUPPLIER' THEN 1 ELSE 0 END)`);
  });
});

describe("6.12: the contract is an owner, everywhere at once (X-6)", () => {
  const PURPOSES = ["COMPANY_RESOLUTION", "LEGAL_SUBMISSION", "LEGAL_COMMENTS", "RECONCILIATION", "SIGNED_CONTRACT", "STAMPING_CERTIFICATE"];
  it("its key is counted by one_owner and each of its six purposes pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"contractId"/);
    const po = latestCheck("DocumentAttachment_purpose_owner");
    expect(po).toMatch(/\('COMPANY_RESOLUTION', 'LEGAL_SUBMISSION', 'LEGAL_COMMENTS', 'RECONCILIATION', 'SIGNED_CONTRACT', 'STAMPING_CERTIFICATE'\)\s*AND\s*"contractId"\s+IS NOT NULL/);
    expect(OWNER_COLUMN.contract).toBe("contractId");
    for (const p of PURPOSES) expect(PURPOSE_OWNER[p as keyof typeof PURPOSE_OWNER]).toBe("contract");
  });

  it.each(PURPOSES)("%s arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", (purpose) => {
    const own = migrations.filter((d) => new RegExp(`ALTER TYPE "AttachmentPurpose" ADD VALUE '${purpose}'`).test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes(`'${purpose}'`));
    expect(own).toHaveLength(1);
    expect(used.length).toBeGreaterThan(0);
    for (const u of used) expect(own[0] < u).toBe(true);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });

  it("a controlled copy has exactly one owner, built by hand (6.14 adds the certificate to the same CHECK)", () => {
    // 6.14 (faithful to the comment above): the certificate joins the contract in the rebuilt CHECK.
    expect(latestCheck("IssuedCopy_one_owner")).toMatch(/num_nonnulls\("contractId", "certificateId"\) = 1/);
  });
});

describe("6.13 Part A acceptance S-2: the S.O.'s Instruction is an owner, everywhere at once (X-6)", () => {
  it("its key is counted by one_owner and its purpose pairs with it", () => {
    // Faithful (6.13 Part B run 0, flagged against accepted Part A): the key is counted, whatever owner columns a later
    // owner's migration appends after it (615-C2's standingEventId is the first).
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"contractId", "variationInstructionId"(, "\w+")*\) = 1/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL\)/);
    // The contract's purposes still pair with the contract.
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\('PIPE_LOG', 'AS_BUILT', 'PROGRAMME', 'DIARY_PHOTO'\)\s*AND\s*"contractId"\s+IS NOT NULL/);
    expect(OWNER_COLUMN.variationInstruction).toBe("variationInstructionId");
    expect(PURPOSE_OWNER.INSTRUCTION_SKETCH).toBe("variationInstruction");
  });

  it("INSTRUCTION_SKETCH arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'INSTRUCTION_SKETCH'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes("'INSTRUCTION_SKETCH'"));
    expect(own).toEqual(["20261003400201_attachment_purpose_instruction_sketch"]);
    // Faithful (6.13 Part B run 0, flagged against accepted Part A): the first use is the S-2 rebuild; any later mention is a
    // later owner's rebuild of the owner CHECKs from the full owner list, never a use of the purpose elsewhere.
    expect(used[0]).toBe("20261003400202_attachment_owner_variation_instruction");
    for (const u of used.slice(1)) expect(readFileSync(join(migrationsDir, u, "migration.sql"), "utf8"), u).toMatch(/ADD CONSTRAINT "DocumentAttachment_purpose_owner"/);
    // Run 0 fix round (consider, stricter): and every one of those later mentions sits inside the rebuilt CHECK's body.
    for (const u of used.slice(1)) expect(mentionsOutsidePurposeCheck(readFileSync(join(migrationsDir, u, "migration.sql"), "utf8"), "'INSTRUCTION_SKETCH'"), u).toEqual([]);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });
});

describe("615-C2: a registration cancelled is an owner, everywhere at once (X-6)", () => {
  it("its key is counted by one_owner and its purpose pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"standingEventId"(, "\w+")*\) = 1/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose" = 'REGISTRATION_CANCELLATION_NOTICE' AND "standingEventId" IS NOT NULL\)/);
    // The owners before it still pair with theirs.
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL\)/);
    expect(OWNER_COLUMN.standingEvent).toBe("standingEventId");
    expect(PURPOSE_OWNER.REGISTRATION_CANCELLATION_NOTICE).toBe("standingEvent");
  });

  it("REGISTRATION_CANCELLATION_NOTICE arrived alone in its own migration, before the migration that rebuilt the CHECKs with it", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'REGISTRATION_CANCELLATION_NOTICE'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes("'REGISTRATION_CANCELLATION_NOTICE'"));
    expect(own).toEqual(["20261003600101_attachment_purpose_registration_cancellation_notice"]);
    expect(used[0]).toBe("20261003600102_registration_cancelled_writer");
    // Any later mention is a rebuild of the owner CHECKs from the full owner list (a later owner's migration).
    for (const u of used.slice(1)) expect(readFileSync(join(migrationsDir, u, "migration.sql"), "utf8"), u).toMatch(/ADD CONSTRAINT "DocumentAttachment_purpose_owner"/);
    for (const u of used.slice(1)) expect(mentionsOutsidePurposeCheck(readFileSync(join(migrationsDir, u, "migration.sql"), "utf8"), "'REGISTRATION_CANCELLATION_NOTICE'"), u).toEqual([]);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
  });

  it("a later mention outside the rebuilt CHECK's body is caught (self-test)", () => {
    const rebuild = `ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_purpose_owner" CHECK (("purpose" = 'INSTRUCTION_SKETCH' AND "variationInstructionId" IS NOT NULL) OR ("purpose" IN ('A', 'B')))`;
    expect(mentionsOutsidePurposeCheck(rebuild, "'INSTRUCTION_SKETCH'")).toEqual([]);
    const elsewhere = `${rebuild}\nUPDATE "DocumentAttachment" SET "purpose" = 'INSTRUCTION_SKETCH' WHERE id = 'x'`;
    expect(mentionsOutsidePurposeCheck(elsewhere, "'INSTRUCTION_SKETCH'")).toEqual([elsewhere.lastIndexOf("'INSTRUCTION_SKETCH'")]);
    expect(mentionsOutsidePurposeCheck(`ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_one_owner" CHECK ('INSTRUCTION_SKETCH' IS NOT NULL)`, "'INSTRUCTION_SKETCH'")).toHaveLength(1);
  });

  it("the writer's CHECKs: a cancellation names its body and reference; withdrawn only a cancellation, with all three and a reason; the pre-check", () => {
    const sql = readFileSync(join(migrationsDir, "20261003600102_registration_cancelled_writer", "migration.sql"), "utf8");
    expect(sql).toMatch(/"StandingEvent_cancellation_source"\s+CHECK \(\("kind" = 'REGISTRATION_CANCELLED'\) = \("cancellingBodyId" IS NOT NULL\)/);
    expect(sql).toMatch(/length\(btrim\("externalReference"\)\) > 0/);
    expect(sql).toMatch(/"StandingEvent_withdrawn"\s+CHECK \(\("withdrawnAt" IS NULL\) = \("withdrawnByPersonId" IS NULL\)/);
    expect(sql).toMatch(/"withdrawnAt" IS NULL OR \("kind" = 'REGISTRATION_CANCELLED' AND length\(btrim\("withdrawnReason"\)\) > 0\)/);
    expect(sql).toMatch(/SELECT CAST\(\(SELECT 'Pre-check failed: [^']*' WHERE EXISTS \(SELECT 1 FROM "StandingEvent" WHERE "kind" = 'REGISTRATION_CANCELLED'\)\) AS INTEGER\);/);
    // The pre-check comes before any change.
    expect(sql.indexOf("SELECT CAST")).toBeLessThan(sql.indexOf("ALTER TABLE"));
    // No semicolon inside a comment (the WASM engine splits on every one).
    for (const line of sql.split("\n").filter((l) => l.trim().startsWith("--"))) expect(line).not.toContain(";");
  });
});

/// The definition of a constraint as it stood after one migration folder, across the folders up to it in the order they apply.
function checkAsOf(name: string, lastFolder: string): string {
  let found: string | null = null;
  for (const dir of migrations.filter((d) => d <= lastFolder)) {
    const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
    for (const m of sql.matchAll(new RegExp(`ADD CONSTRAINT "${name}"\\s*CHECK\\s*([\\s\\S]*?);`, "g"))) found = m[1];
  }
  if (!found) throw new Error(`no CHECK ${name} up to ${lastFolder}`);
  return found;
}
const ownerList = (def: string) => /num_nonnulls\(([^)]*)\)\s*=\s*1/.exec(def)![1].split(",").map((c) => c.trim().replace(/"/g, ""));
const purposeArms = (def: string) => [...def.matchAll(/\("purpose"\s*(?:=|IN)\s*(?:\([^)]*\)|'[A-Z_]+')\s*AND\s*"\w+"\s+IS NOT NULL\)/g)].map((m) => m[0]);

describe("ADR 0042 D1: the Project workspace version is an owner, everywhere at once (X-6)", () => {
  const BEFORE = "20261118000100_portal_application_frozen";
  const OWN = "20261122000000_enum_purpose_project_document_file";
  const REBUILD = "20261122000100_project_workspace";

  it("its key is counted by one_owner and PROJECT_DOCUMENT_FILE pairs with it", () => {
    expect(latestCheck("DocumentAttachment_one_owner")).toMatch(/"projectDocumentVersionId"(, "\w+")*\) = 1/);
    expect(latestCheck("DocumentAttachment_purpose_owner")).toMatch(/\("purpose" = 'PROJECT_DOCUMENT_FILE' AND "projectDocumentVersionId" IS NOT NULL\)/);
    expect(OWNER_COLUMN.projectDocumentVersion).toBe("projectDocumentVersionId");
    expect(PURPOSE_OWNER.PROJECT_DOCUMENT_FILE).toBe("projectDocumentVersion");
  });

  it("every owner before the workspace is still counted, in the same order, with the new one added last and nothing dropped (before and after)", () => {
    const before = ownerList(checkAsOf("DocumentAttachment_one_owner", BEFORE));
    const after = ownerList(checkAsOf("DocumentAttachment_one_owner", REBUILD));
    expect(before).toEqual(["meetingId", "exerciseId", "awardId", "delegationId", "specificationPanelId", "bqVersionId", "tenderPackPartId", "addendumId", "bidWithdrawalId", "validityExtensionId", "openingId", "evaluationId", "evaluationMeetingId", "evaluationBidderId", "supplierDocumentId", "supplierApplicationId", "contractId", "variationInstructionId", "standingEventId", "delayNoticeId", "eotClaimId", "registrationDraftDocumentId", "creditorProfileId", "onlineBidFileId", "portalApplicationDocumentId", "portalApplicationCreditorId"]);
    expect(after).toEqual([...before, "projectDocumentVersionId"]);
  });

  it("every purpose arm before the workspace is still there, word for word, with the one new arm added (before and after)", () => {
    const before = purposeArms(checkAsOf("DocumentAttachment_purpose_owner", BEFORE));
    const after = purposeArms(checkAsOf("DocumentAttachment_purpose_owner", REBUILD));
    expect(before.length).toBeGreaterThan(20);
    expect(after.filter((a) => !before.includes(a))).toEqual([`("purpose" = 'PROJECT_DOCUMENT_FILE' AND "projectDocumentVersionId" IS NOT NULL)`]);
    expect(before.filter((a) => !after.includes(a))).toEqual([]);
  });

  it("PROJECT_DOCUMENT_FILE arrived alone in its own migration, before the migration that rebuilt the CHECKs with it, which names it only inside that CHECK", () => {
    const own = migrations.filter((d) => /ALTER TYPE "AttachmentPurpose" ADD VALUE 'PROJECT_DOCUMENT_FILE'/.test(readFileSync(join(migrationsDir, d, "migration.sql"), "utf8")));
    const used = migrations.filter((d) => d !== own[0] && readFileSync(join(migrationsDir, d, "migration.sql"), "utf8").includes("'PROJECT_DOCUMENT_FILE'"));
    expect(own).toEqual([OWN]);
    expect(used[0]).toBe(REBUILD);
    for (const u of used) expect(mentionsOutsidePurposeCheck(readFileSync(join(migrationsDir, u, "migration.sql"), "utf8"), "'PROJECT_DOCUMENT_FILE'"), u).toEqual([]);
    const sql = readFileSync(join(migrationsDir, own[0], "migration.sql"), "utf8").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
    expect(sql).toHaveLength(1);
    // No semicolon inside a comment (the WASM engine splits on every one).
    for (const f of [OWN, REBUILD]) for (const line of readFileSync(join(migrationsDir, f, "migration.sql"), "utf8").split("\n").filter((l) => l.trim().startsWith("--"))) expect(line, f).not.toContain(";");
  });
});
