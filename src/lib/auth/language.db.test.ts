import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { setStaffLanguage } from "./account-store";
import { authenticateStaff } from "./identity";
import { readStaffSession } from "./session-store";
import type { StaffActor } from "./types";

let organisationId: string;

beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
});
beforeEach(async () => {
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
});

async function signedIn() {
  const who = await makeAccount(organisationId);
  const outcome = await authenticateStaff({ loginName: who.loginName, password: who.password }, facts(), null);
  if (!outcome.ok) throw new Error("sign-in failed");
  const read = await readStaffSession(outcome.token, { sourceAddress: null });
  if (!read.ok) throw new Error("read failed");
  return { who, token: outcome.token, actor: read.actor as StaffActor };
}

const languageRows = (accountId: string) => db.auditEntry.findMany({ where: { entity: "StaffAccount", entityId: accountId, reason: { contains: "language" } } });
const stored = async (accountId: string) => (await db.staffAccount.findUniqueOrThrow({ where: { id: accountId }, select: { uiLanguage: true } })).uiLanguage;

describe("the stored display language", () => {
  it("starts unset, and the actor reads it as unset", async () => {
    const { actor } = await signedIn();
    expect(await stored(actor.accountId)).toBeNull();
    expect(actor.uiLanguage).toBeNull();
  });

  it("a choice writes the column and one audit row, before null and after MS, and the next session reads it", async () => {
    const { actor, token } = await signedIn();
    expect(await setStaffLanguage(actor, "ms")).toEqual({ changed: true });
    expect(await stored(actor.accountId)).toBe("MS");
    const rows = await languageRows(actor.accountId);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("UPDATE");
    expect(rows[0].changes).toEqual([{ field: "uiLanguage", before: null, after: "MS" }]);
    const again = await readStaffSession(token, { sourceAddress: null });
    expect(again.ok && again.actor.uiLanguage).toBe("ms");
  });

  it("choosing the same value again writes nothing", async () => {
    const { actor } = await signedIn();
    await setStaffLanguage(actor, "ms");
    expect(await setStaffLanguage(actor, "ms")).toEqual({ changed: false });
    expect(await languageRows(actor.accountId)).toHaveLength(1);
  });

  it("changing to the other language records MS to EN", async () => {
    const { actor } = await signedIn();
    await setStaffLanguage(actor, "ms");
    await setStaffLanguage(actor, "en");
    const rows = await languageRows(actor.accountId);
    expect(rows.map((r) => r.changes)).toContainEqual([{ field: "uiLanguage", before: "MS", after: "EN" }]);
  });

  it("another account is untouched", async () => {
    const one = await signedIn();
    const two = await signedIn();
    await setStaffLanguage(one.actor, "ms");
    expect(await stored(two.actor.accountId)).toBeNull();
    expect(await languageRows(two.actor.accountId)).toHaveLength(0);
  });
});
