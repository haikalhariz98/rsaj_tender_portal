import { describe, expect, it } from "vitest";

import { APPEND_ONLY_TABLES, AWARD_ONLINE_TABLES, FIGURE_READER, grantStatements, HELD_APPLICATION_TABLES, notYetPresent, PROJECT_WRITE_ONCE_TABLES, roleNameFault, RUNTIME_ROLE_WORDS, runtimeRoleVerdict, SEALED_TABLES, WALLED_COLUMNS, WARNING_ONLY_REASONS, warnsOnly, WITHHELD, type RuntimeRoleReason } from "./db-role";

// BlobContent joined the protected tables in the Phase 1d review (stored bytes are never rewritten), and ActAttribution in Phase 2a (ADR 0034 D12),
// so the "every table exists" set has both.
// RegistrationDeclaration joined them in Phase 4b (a supplier's signed declaration is evidence: its trigger is migration 20261013100000).
// PaymentAttempt and PurchaseDownload joined them in wave 3a (SR-10: every try at paying and every download of a released file; migration 20261102100000).
// AddendumAcknowledgement, TenderInspectionEvent and NonAwardNotice joined them in Phase 4d (the supplier's acknowledgement, the inspection log and the notice of non-award: migration 20261016090000).
// Wave 3b (SR-13, build plan step 2, ADR 0036 D12): SealedAccessEvent and PublishedKeyChange joined the append-only tables, and the rest of the sealed tables
// (SEALED_TABLES) lose DELETE and TRUNCATE (migration 20261103110000), so the "every table exists" set has them all.
// N6 (ruling 20ch, threat model F10): CompanyEstimateVersion joins the set, so the column wall is built for it, and `grants` passes its columns and the reader.
const ALL = new Set(["Organisation", "CompanyEstimateVersion", "AuditEntry", "SignInEvent", "SignInEventDetail", "ActAttribution", "DocumentAccessEvent", "SulitAccessEvent", "RegistrationDeclaration", "AddendumAcknowledgement", "TenderInspectionEvent", "NonAwardNotice", "PaymentAttempt", "PurchaseDownload", "BlobContent", "_prisma_migrations", "SealedAccessEvent", "PublishedKeyChange", ...SEALED_TABLES, "PortalApplicationValue", ...HELD_APPLICATION_TABLES, "ProjectDocumentVersion", "ProjectDocumentRequest", "ProjectDocumentDecision", "KickOffAttendance", "SupplyInvoicePayment", ...PROJECT_WRITE_ONCE_TABLES, ...AWARD_ONLINE_TABLES]);
const VERSION_COLUMNS = ["id", "organisationId", "estimateId", "versionNo", "value", "reason", "preparedById", "createdAt"];
const COLUMNS: ReadonlyMap<string, readonly string[]> = new Map([["CompanyEstimateVersion", VERSION_COLUMNS]]);
const grants = (existing: ReadonlySet<string> = ALL, more: { columns?: ReadonlyMap<string, readonly string[]>; figureReaderPresent?: boolean } = {}) =>
  grantStatements({ role: "perolehan_app", owner: "perolehan", schema: "public", database: "perolehan", existing, columns: more.columns ?? COLUMNS, figureReaderPresent: more.figureReaderPresent ?? true });
const T = `"public"."CompanyEstimateVersion"`;
const COLUMN_GRANT = `GRANT SELECT ("createdAt", "estimateId", "id", "organisationId", "preparedById", "reason", "versionNo") ON TABLE ${T} TO "perolehan_app"`;
const EXECUTE = `GRANT EXECUTE ON FUNCTION "public"."read_company_estimate_figure"(text, text, text, text, text, text) TO "perolehan_app"`;

describe("the app role's grants (ADR 0034 D11)", () => {
  it("revokes UPDATE, DELETE and TRUNCATE on every append-only table, including the O-1 side table", () => {
    const s = grants();
    for (const t of APPEND_ONLY_TABLES) expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
    expect(APPEND_ONLY_TABLES).toEqual(expect.arrayContaining(["AuditEntry", "SignInEvent", "SignInEventDetail", "ActAttribution", "SulitAccessEvent", "DocumentAccessEvent", "RegistrationDeclaration", "AddendumAcknowledgement", "TenderInspectionEvent", "NonAwardNotice", "PaymentAttempt", "PurchaseDownload", "SealedAccessEvent", "PublishedKeyChange"]));
  });

  it("revokes DELETE and TRUNCATE on every other sealed-bid table, and leaves UPDATE for the moves their triggers allow (wave 3b step 2)", () => {
    const s = grants();
    expect([...SEALED_TABLES]).toEqual(["BidSealingPolicy", "OfficerExerciseKey", "ExerciseSealingKey", "ExerciseKeyShare", "ShareRelease", "OnlineBidFile", "OnlineBid", "OnlineBidPart", "OfficerDekGrant", "SealedEstimateLodgement"]);
    for (const t of SEALED_TABLES) {
      expect(s).toContain(`REVOKE DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
      expect(s.some((x) => x.startsWith("REVOKE") && x.includes(`"${t}"`) && x.includes("UPDATE"))).toBe(false);
    }
    // No table is on two lists.
    const listed = [...APPEND_ONLY_TABLES, "BlobContent", ...SEALED_TABLES, ...HELD_APPLICATION_TABLES, ...PROJECT_WRITE_ONCE_TABLES, ...AWARD_ONLINE_TABLES];
    expect(listed.filter((t, i) => listed.indexOf(t) !== i)).toEqual([]);
  });

  it("makes a stranger's held codes append-only, and withholds DELETE and TRUNCATE on the held certificates, bank details and spent tokens, leaving UPDATE (security audit L2)", () => {
    const s = grants();
    expect(APPEND_ONLY_TABLES).toContain("PortalApplicationValue");
    expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."PortalApplicationValue" FROM "perolehan_app"`);
    expect([...HELD_APPLICATION_TABLES]).toEqual(["PortalApplicationDocument", "PortalApplicationCreditor", "PortalFormToken"]);
    for (const t of HELD_APPLICATION_TABLES) {
      expect(s).toContain(`REVOKE DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
      expect(s.some((x) => x.startsWith("REVOKE") && x.includes(`"${t}"`) && x.includes("UPDATE"))).toBe(false);
    }
  });

  it("makes the Project workspace's versions, requests and decisions append-only, and withholds DELETE and TRUNCATE on its documents and approvers, leaving UPDATE (ADR 0042 D1)", () => {
    const s = grants();
    for (const t of ["ProjectDocumentVersion", "ProjectDocumentRequest", "ProjectDocumentDecision"]) {
      expect(APPEND_ONLY_TABLES).toContain(t);
      expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
    }
    // Plan step 7 (ADR 0042 D10): the kick-off meeting joins them (changed until held, never removed), and its attendance is append-only.
    expect([...PROJECT_WRITE_ONCE_TABLES]).toEqual(["ProjectDocument", "ProjectDocumentApprover", "KickOffMeeting"]);
    expect(APPEND_ONLY_TABLES).toContain("KickOffAttendance");
    expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."KickOffAttendance" FROM "perolehan_app"`);
    for (const t of PROJECT_WRITE_ONCE_TABLES) {
      expect(s).toContain(`REVOKE DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
      expect(s.some((x) => x.startsWith("REVOKE") && x.includes(`"${t}"`) && x.includes("UPDATE"))).toBe(false);
    }
  });

  it("makes a supply claim's payment append-only, and withholds DELETE and TRUNCATE on the online award return and the award question, leaving UPDATE (ADR 0045)", () => {
    const s = grants();
    expect(APPEND_ONLY_TABLES).toContain("SupplyInvoicePayment");
    expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."SupplyInvoicePayment" FROM "perolehan_app"`);
    expect([...AWARD_ONLINE_TABLES]).toEqual(["AwardOnlineReturn", "AwardQuery"]);
    for (const t of AWARD_ONLINE_TABLES) {
      expect(s).toContain(`REVOKE DELETE, TRUNCATE ON TABLE "public"."${t}" FROM "perolehan_app"`);
      expect(s.some((x) => x.startsWith("REVOKE") && x.includes(`"${t}"`) && x.includes("UPDATE"))).toBe(false);
    }
  });

  it("revokes only after the broad grant, so a re-run never leaves the trail writable", () => {
    const s = grants();
    const broad = s.findIndex((x) => x.startsWith("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"));
    const firstRevoke = s.findIndex((x) => x.startsWith("REVOKE"));
    expect(broad).toBeGreaterThanOrEqual(0);
    expect(firstRevoke).toBeGreaterThan(broad);
    // Changed for ruling 20ch / the N6 scope line: the figure's wall grants the walled table's other columns back by name, and the reader's EXECUTE, after the revokes.
    // Those two are the only GRANTs after the first REVOKE; everything else there is still a REVOKE.
    expect(s.slice(firstRevoke).every((x) => x.startsWith("REVOKE") || x === COLUMN_GRANT || x === EXECUTE)).toBe(true);
    expect(s.slice(firstRevoke).filter((x) => !x.startsWith("REVOKE"))).toEqual([COLUMN_GRANT, EXECUTE]);
  });

  it("never grants TRUNCATE, and takes everything away on Prisma's migrations table", () => {
    const s = grants();
    expect(s.filter((x) => x.startsWith("GRANT")).some((x) => x.includes("TRUNCATE"))).toBe(false);
    expect(s).toContain(`REVOKE ALL ON TABLE "public"."_prisma_migrations" FROM "perolehan_app"`);
  });

  it("takes TEMPORARY on the database from PUBLIC and from the role, last (wave 3b security audit 1)", () => {
    const s = grants();
    expect(s.slice(-2)).toEqual([`REVOKE TEMPORARY ON DATABASE "perolehan" FROM PUBLIC`, `REVOKE TEMPORARY ON DATABASE "perolehan" FROM "perolehan_app"`]);
    // N6: the call names the walled table's columns and the reader too (ruling 20ch); what is asserted is unchanged.
    expect(grantStatements({ role: "perolehan_app", owner: "perolehan", schema: "public", database: 'odd"name', existing: ALL, columns: COLUMNS, figureReaderPresent: true }).at(-1)).toBe(`REVOKE TEMPORARY ON DATABASE "odd""name" FROM "perolehan_app"`);
  });

  it("sets default privileges for tables the owner makes later, named for that owner", () => {
    expect(grants()).toContain(`ALTER DEFAULT PRIVILEGES FOR ROLE "perolehan" IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "perolehan_app"`);
  });

  it("revokes UPDATE and TRUNCATE on stored bytes, and leaves DELETE so an orphan can be cleared", () => {
    const s = grants();
    expect(s).toContain(`REVOKE UPDATE, TRUNCATE ON TABLE "public"."BlobContent" FROM "perolehan_app"`);
    expect(s.some((x) => x.startsWith("REVOKE") && x.includes("BlobContent") && x.includes("DELETE"))).toBe(false);
  });

  it("the runtime check asks about exactly what the script revokes", () => {
    for (const w of WITHHELD) {
      if (w.revoke !== "ALL") expect(w.held).toBe(w.revoke);
    }
    expect(WITHHELD.map((w) => w.table)).toEqual(["_prisma_migrations", ...APPEND_ONLY_TABLES, "BlobContent", ...SEALED_TABLES, ...HELD_APPLICATION_TABLES, ...PROJECT_WRITE_ONCE_TABLES, ...AWARD_ONLINE_TABLES, "CompanyEstimateVersion"]);
  });

  it("skips a listed table that does not exist yet, and reports it", () => {
    // BlobContent is in this set since the Phase 1d review, so the tables still to come are SulitAccessEvent, as before, and (Phase 4b) RegistrationDeclaration.
    const now = new Set(["AuditEntry", "SignInEvent", "SignInEventDetail", "ActAttribution", "DocumentAccessEvent", "BlobContent"]);
    expect(grants(now).some((x) => x.includes("SulitAccessEvent") || x.includes("RegistrationDeclaration") || x.includes("AddendumAcknowledgement") || x.includes("TenderInspectionEvent") || x.includes("NonAwardNotice") || x.includes("PaymentAttempt") || x.includes("PurchaseDownload"))).toBe(false);
    // Wave 3b (step 2): the sealed-bid tables are listed too, so they are reported until they exist.
    expect(notYetPresent(now)).toEqual(["SulitAccessEvent", "RegistrationDeclaration", "AddendumAcknowledgement", "TenderInspectionEvent", "NonAwardNotice", "PaymentAttempt", "PurchaseDownload", "SealedAccessEvent", "PublishedKeyChange", "PortalApplicationValue", "ProjectDocumentVersion", "ProjectDocumentRequest", "ProjectDocumentDecision", "KickOffAttendance", "SupplyInvoicePayment", ...SEALED_TABLES, ...HELD_APPLICATION_TABLES, ...PROJECT_WRITE_ONCE_TABLES, ...AWARD_ONLINE_TABLES]);
    expect(notYetPresent(ALL)).toEqual([]);
  });
});

describe("the company estimate's figure is walled off from the app (ruling 20ch, threat model F10, N6)", () => {
  it("walls exactly the figure", () => {
    expect(WALLED_COLUMNS).toEqual([{ table: "CompanyEstimateVersion", column: "value" }]);
    expect(FIGURE_READER).toEqual({ name: "read_company_estimate_figure", args: "text, text, text, text, text, text" });
  });

  it("revokes the table's SELECT, then the figure's, then grants every other column, after the withheld revokes and before TEMPORARY, then the reader", () => {
    const s = grants();
    const at = (x: string) => s.indexOf(x);
    const lastWithheld = Math.max(...WITHHELD.map((w) => at(`REVOKE ${w.revoke} ON TABLE "public"."${w.table}" FROM "perolehan_app"`)));
    const order = [
      lastWithheld,
      at(`REVOKE SELECT ON TABLE ${T} FROM PUBLIC`),
      at(`REVOKE SELECT ON TABLE ${T} FROM "perolehan_app"`),
      at(`REVOKE SELECT ("value") ON TABLE ${T} FROM PUBLIC`),
      at(`REVOKE SELECT ("value") ON TABLE ${T} FROM "perolehan_app"`),
      at(COLUMN_GRANT),
      at(EXECUTE),
      at(`REVOKE TEMPORARY ON DATABASE "perolehan" FROM PUBLIC`),
      at(`REVOKE TEMPORARY ON DATABASE "perolehan" FROM "perolehan_app"`),
    ];
    expect(lastWithheld).toBeGreaterThan(0);
    expect(order).toEqual(order.map((_, i) => lastWithheld + i));
    expect(order.at(-1)).toBe(s.length - 1);
  });

  it("never grants the figure, even when the columns read include it, and grants each column once, quoted and sorted", () => {
    const s = grants(ALL, { columns: new Map([["CompanyEstimateVersion", ["value", "versionNo", "id", "value", "id"]]]) });
    expect(s.filter((x) => x.startsWith("GRANT SELECT (") && x.includes(T))).toEqual([`GRANT SELECT ("id", "versionNo") ON TABLE ${T} TO "perolehan_app"`]);
    expect(s.filter((x) => x.startsWith("GRANT")).some((x) => x.includes(`"value"`))).toBe(false);
    expect(grants().filter((x) => x.startsWith("GRANT")).some((x) => x.includes(`"value"`))).toBe(false);
  });

  it("takes the figure from PUBLIC as well as the role, before any column is granted back, and bars updating or deleting a version (N6 review)", () => {
    const s = grants(ALL, { columns: new Map([["CompanyEstimateVersion", VERSION_COLUMNS]]) });
    const at = (x: string) => s.indexOf(x);
    expect(at(`REVOKE SELECT ON TABLE ${T} FROM PUBLIC`)).toBeGreaterThan(-1);
    expect(at(`REVOKE SELECT ("value") ON TABLE ${T} FROM PUBLIC`)).toBeGreaterThan(-1);
    expect(at(`REVOKE SELECT ("value") ON TABLE ${T} FROM PUBLIC`)).toBeLessThan(s.findIndex((x) => x.startsWith("GRANT SELECT (") && x.includes(T)));
    expect(s).toContain(`REVOKE UPDATE, DELETE, TRUNCATE ON TABLE ${T} FROM "perolehan_app"`);
  });

  it("grants a column added since, because the list is read from the database at run time", () => {
    const s = grants(ALL, { columns: new Map([["CompanyEstimateVersion", [...VERSION_COLUMNS, "basis"]]]) });
    expect(s).toContain(`GRANT SELECT ("basis", "createdAt", "estimateId", "id", "organisationId", "preparedById", "reason", "versionNo") ON TABLE ${T} TO "perolehan_app"`);
  });

  it("quotes an odd column name", () => {
    expect(grants(ALL, { columns: new Map([["CompanyEstimateVersion", ['we"ird', "value"]]]) })).toContain(`GRANT SELECT ("we""ird") ON TABLE ${T} TO "perolehan_app"`);
  });

  it("grants EXECUTE on the reader only when the function exists", () => {
    expect(grants(ALL, { figureReaderPresent: true }).filter((x) => x.includes("EXECUTE"))).toEqual([EXECUTE]);
    expect(grants(ALL, { figureReaderPresent: false }).some((x) => x.includes("EXECUTE") || x.includes("read_company_estimate_figure"))).toBe(false);
  });

  it("skips a walled table that does not exist yet", () => {
    const without = new Set([...ALL].filter((t) => t !== "CompanyEstimateVersion"));
    expect(grants(without).some((x) => x.includes("CompanyEstimateVersion"))).toBe(false);
  });

  it("a present table whose columns were not read is still revoked, and no empty column GRANT is written", () => {
    for (const columns of [new Map<string, string[]>(), new Map([["CompanyEstimateVersion", ["value"]]])]) {
      const s = grants(ALL, { columns });
      expect(s).toContain(`REVOKE SELECT ON TABLE ${T} FROM "perolehan_app"`);
      expect(s).toContain(`REVOKE SELECT ("value") ON TABLE ${T} FROM "perolehan_app"`);
      expect(s.some((x) => x.startsWith("GRANT SELECT ("))).toBe(false);
      expect(s.some((x) => x.includes("()"))).toBe(false);
    }
  });
});

describe("the role's name", () => {
  it("accepts a plain lower-case name", () => expect(roleNameFault("perolehan_app", "perolehan")).toBeNull());
  it("refuses anything that would need quoting", () => {
    for (const bad of ["", "App", "a-b", 'x"; DROP ROLE perolehan; --', "9app", "a".repeat(64)]) expect(roleNameFault(bad, "perolehan")).toBe("ROLE_NAME_INVALID");
  });
  it("refuses the owner's own login, which the script would otherwise strip of its rights", () => expect(roleNameFault("perolehan", "perolehan")).toBe("ROLE_IS_OWNER"));
});

describe("who the running app is", () => {
  // N6 (ruling 20ch): the facts gain estimateFigureReadable; the safe login cannot read the figure.
  const app = { name: "perolehan_app", isSuperuser: false, ownsSchemaObjects: false, withheldHeld: [] as string[], temporaryHeld: false, estimateFigureReadable: false, figureReaderCallable: true };
  it("the separate role is safe", () => {
    expect(runtimeRoleVerdict(app, true)).toEqual({ safe: true });
    expect(runtimeRoleVerdict(app, false)).toEqual({ safe: true });
  });
  it("a superuser refuses sign-in in production, and only warns in development", () => {
    const su = { ...app, name: "perolehan", isSuperuser: true };
    // `tables` joined the verdict in the Phase 1d review (it names what a TRAIL_WRITABLE login holds); empty here.
    expect(runtimeRoleVerdict(su, true)).toEqual({ safe: false, reason: "SUPERUSER", name: "perolehan", refuseSignIn: true, tables: [] });
    expect(runtimeRoleVerdict(su, false)).toEqual({ safe: false, reason: "SUPERUSER", name: "perolehan", refuseSignIn: false, tables: [] });
  });
  it("an owner that is not a superuser is refused the same way", () => {
    const owner = { ...app, name: "owner", ownsSchemaObjects: true };
    expect(runtimeRoleVerdict(owner, true)).toMatchObject({ safe: false, reason: "OWNER", refuseSignIn: true });
    expect(runtimeRoleVerdict(owner, false)).toMatchObject({ safe: false, reason: "OWNER", refuseSignIn: false });
  });
  it("a separate login that can still change the trail is refused the same way, and named for what it holds", () => {
    const wide = { ...app, withheldHeld: ["DocumentAccessEvent"] };
    expect(runtimeRoleVerdict(wide, true)).toEqual({ safe: false, reason: "TRAIL_WRITABLE", name: "perolehan_app", refuseSignIn: true, tables: ["DocumentAccessEvent"] });
    expect(runtimeRoleVerdict(wide, false)).toMatchObject({ safe: false, reason: "TRAIL_WRITABLE", refuseSignIn: false });
  });
  it("superuser, then owner, then the grants: the strongest reason is the one given", () => {
    expect(runtimeRoleVerdict({ ...app, isSuperuser: true, ownsSchemaObjects: true, withheldHeld: ["AuditEntry"] }, true)).toMatchObject({ reason: "SUPERUSER" });
    expect(runtimeRoleVerdict({ ...app, ownsSchemaObjects: true, withheldHeld: ["AuditEntry"] }, true)).toMatchObject({ reason: "OWNER" });
  });
  it("the owner and superuser sentences on the accounts screen are the ones it showed before the words moved here", () => {
    // The screen renders "It runs as " + words + ".". These are the sentences its JSX rendered before the Phase 1d review.
    expect(`It runs as ${RUNTIME_ROLE_WORDS.OWNER}.`).toBe(
      "It runs as the owner of the tables, not as the app's own database role, so nothing but the trail's triggers stops a change to the audit trail or the sign-in log.",
    );
    expect(`It runs as ${RUNTIME_ROLE_WORDS.SUPERUSER}.`).toBe(
      "It runs as the database superuser, not as the app's own database role, so nothing but the trail's triggers stops a change to the audit trail or the sign-in log.",
    );
  });
  it("a login that can still make temporary tables is a warning, never a refusal, even in production (step 19)", () => {
    const temp = { ...app, temporaryHeld: true };
    expect(runtimeRoleVerdict(temp, true)).toEqual({ safe: false, reason: "TEMPORARY_HELD", name: "perolehan_app", refuseSignIn: false, tables: [] });
    expect(runtimeRoleVerdict(temp, false)).toMatchObject({ safe: false, reason: "TEMPORARY_HELD", refuseSignIn: false });
  });
  it("the warning comes after the superuser, owner and grants reasons", () => {
    expect(runtimeRoleVerdict({ ...app, temporaryHeld: true, isSuperuser: true }, true)).toMatchObject({ reason: "SUPERUSER", refuseSignIn: true });
    expect(runtimeRoleVerdict({ ...app, temporaryHeld: true, ownsSchemaObjects: true }, true)).toMatchObject({ reason: "OWNER", refuseSignIn: true });
    expect(runtimeRoleVerdict({ ...app, temporaryHeld: true, withheldHeld: ["AuditEntry"] }, true)).toMatchObject({ reason: "TRAIL_WRITABLE", refuseSignIn: true });
  });
  it("a login that can still read the estimate's figure is a warning, never a refusal, even in production (N6, J1)", () => {
    const fig = { ...app, estimateFigureReadable: true };
    expect(runtimeRoleVerdict(fig, true)).toEqual({ safe: false, reason: "FIGURE_READABLE", name: "perolehan_app", refuseSignIn: false, tables: [] });
    expect(runtimeRoleVerdict(fig, false)).toEqual({ safe: false, reason: "FIGURE_READABLE", name: "perolehan_app", refuseSignIn: false, tables: [] });
  });
  it("the figure comes after the superuser, owner and grants reasons, and before TEMPORARY (N6)", () => {
    const fig = { ...app, estimateFigureReadable: true };
    expect(runtimeRoleVerdict({ ...fig, isSuperuser: true }, true)).toMatchObject({ reason: "SUPERUSER", refuseSignIn: true });
    expect(runtimeRoleVerdict({ ...fig, ownsSchemaObjects: true }, true)).toMatchObject({ reason: "OWNER", refuseSignIn: true });
    expect(runtimeRoleVerdict({ ...fig, withheldHeld: ["AuditEntry"] }, true)).toMatchObject({ reason: "TRAIL_WRITABLE", refuseSignIn: true });
    expect(runtimeRoleVerdict({ ...fig, temporaryHeld: true }, true)).toMatchObject({ reason: "FIGURE_READABLE", refuseSignIn: false });
  });
  it("a login that cannot call the logged figure reader is a warning in words, last in precedence", () => {
    const nocall = { ...app, figureReaderCallable: false };
    expect(runtimeRoleVerdict(nocall, true)).toEqual({ safe: false, reason: "FIGURE_READER_UNCALLABLE", name: "perolehan_app", refuseSignIn: false, tables: [] });
    expect(runtimeRoleVerdict({ ...nocall, temporaryHeld: true }, true)).toMatchObject({ reason: "TEMPORARY_HELD" });
    expect(RUNTIME_ROLE_WORDS.FIGURE_READER_UNCALLABLE).toMatch(/db:roles/);
  });
  it("the warning-only reasons are exactly those that never refuse sign-in in production", () => {
    const one: Record<RuntimeRoleReason, Partial<typeof app>> = {
      SUPERUSER: { isSuperuser: true },
      OWNER: { ownsSchemaObjects: true },
      TRAIL_WRITABLE: { withheldHeld: ["AuditEntry"] },
      FIGURE_READABLE: { estimateFigureReadable: true },
      TEMPORARY_HELD: { temporaryHeld: true },
      FIGURE_READER_UNCALLABLE: { figureReaderCallable: false },
    };
    const warning: string[] = [];
    for (const [reason, f] of Object.entries(one)) {
      const v = runtimeRoleVerdict({ ...app, ...f }, true);
      expect(v).toMatchObject({ safe: false, reason });
      if (!v.safe && !v.refuseSignIn) warning.push(reason);
    }
    expect([...WARNING_ONLY_REASONS].sort()).toEqual(warning.sort());
    for (const reason of Object.keys(one) as RuntimeRoleReason[]) expect(warnsOnly(reason)).toBe(warning.includes(reason));
  });
  it("the figure's words say the role setup has not run since the wall, and name no code", () => {
    expect(RUNTIME_ROLE_WORDS.FIGURE_READABLE).toMatch(/company estimate's figure/);
    expect(RUNTIME_ROLE_WORDS.FIGURE_READABLE).toMatch(/db:roles/);
  });
  it("its words say the role setup has not run since the hardening, and name no code", () => {
    expect(RUNTIME_ROLE_WORDS.TEMPORARY_HELD).toMatch(/temporary tables/);
    expect(RUNTIME_ROLE_WORDS.TEMPORARY_HELD).toMatch(/db:roles/);
  });
  it("every reason has words for the screen, and none of them is a code", () => {
    for (const words of Object.values(RUNTIME_ROLE_WORDS)) expect(words).not.toMatch(/[A-Z]{2,}_|[a-z]+[A-Z][a-z]+[A-Z]|_prisma/);
  });
});
