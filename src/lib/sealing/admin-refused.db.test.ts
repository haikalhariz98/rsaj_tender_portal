import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Wave 3b step 19 (S19, NFR-SEC-004; build plan step 19): an administrator account is refused at every sealed entry point, in one table. Each door is called as a real administrator
 * (a session read back from the database) and must refuse in words and write no key, share, grant, release, lodgement or authorisation. The table is held to the code: every exported
 * action in the sealed action modules is a row, so a door added later and left out fails here. The refusal is judged before anything about the exercise is looked up, so the doors are
 * called with an exercise that does not exist; what each door logs for an administrator on a real exercise is covered by its own database test, named beside the row. The officer's
 * sealed-file download is a route that looks the opening up before it judges the actor, and has its own test in `src/app/api/opening/sealed-file/route.db.test.ts`.
 */

const who = vi.hoisted(() => ({ actor: null as unknown }));
vi.mock("@/app/_auth/actor", async () => {
  const { actorModule } = await import("@/lib/test-support/staff");
  const { administrationConflict } = await import("@/lib/auth/administration-conflict");
  return {
    ...actorModule(),
    requireStaff: async () => who.actor,
    toAuditActor: (await import("@/lib/auth/audit-actor")).auditActorOfStaff,
    staffForAct: async (act: import("@/lib/auth/administration-conflict").AdministratorAct) => {
      const actor = who.actor as import("@/lib/auth/types").StaffActor;
      const fault = administrationConflict({ kind: "ACT", act, actorIsAdministrator: actor.isAdministrator });
      return fault ? { ok: false as const, state: { ok: false as const, message: fault.en } } : { ok: true as const, actor };
    },
    stepUp: async () => ({ ok: false as const, message: "That password is not right." }),
  };
});
vi.mock("@/app/_auth/cookies", () => ({ refuseForeignPost: async () => null, currentRequestFacts: async () => ({ sourceAddress: null, userAgent: "vitest" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));

import type { StaffActor } from "@/lib/auth/types";
import { createStaffSession, readStaffSession } from "@/lib/auth/session-store";
import { hashToken } from "@/lib/auth/token";
import { db } from "@/lib/db";
import { ensureAdministrator, facts, makeAccount, setPolicy, SETTINGS, testOrganisation } from "@/lib/test-db/auth-fixtures";

import { lodgeEstimate } from "../../app/sourcing/[id]/scope/actions";
import { checkUnlock, rekeyExercise, setOfficerShare } from "../../app/sourcing/[id]/scope/key-actions";
import { releaseShareForSubstitution } from "../../app/sourcing/[id]/scope/substitution-actions";
import { authoriseOnlineUnseal } from "../../app/sourcing/[id]/opening/unseal-actions";
import { finaliseOnline, signOnlineFinalise } from "../../app/sourcing/[id]/opening/online-finalise-actions";

type Door = (prev: { ok: boolean }, data: FormData) => Promise<{ ok: boolean; message?: string; errors?: Record<string, string> }>;

/// Every sealed entry point, with the file it lives in and the database test that covers what it logs on a real exercise.
const DOORS: { name: string; file: string; door: Door; loggedBy: string }[] = [
  { name: "setOfficerShare", file: "src/app/sourcing/[id]/scope/key-actions.ts", door: setOfficerShare as Door, loggedBy: "src/app/sourcing/[id]/scope/key.db.test.ts" },
  { name: "rekeyExercise", file: "src/app/sourcing/[id]/scope/key-actions.ts", door: rekeyExercise as Door, loggedBy: "src/app/sourcing/[id]/scope/key.db.test.ts" },
  { name: "checkUnlock", file: "src/app/sourcing/[id]/scope/key-actions.ts", door: checkUnlock as Door, loggedBy: "src/app/sourcing/[id]/scope/key.db.test.ts" },
  { name: "releaseShareForSubstitution", file: "src/app/sourcing/[id]/scope/substitution-actions.ts", door: releaseShareForSubstitution as Door, loggedBy: "src/app/sourcing/[id]/scope/substitution.db.test.ts" },
  { name: "authoriseOnlineUnseal", file: "src/app/sourcing/[id]/opening/unseal-actions.ts", door: authoriseOnlineUnseal as Door, loggedBy: "src/app/sourcing/[id]/opening/unseal.db.test.ts" },
  { name: "signOnlineFinalise", file: "src/app/sourcing/[id]/opening/online-finalise-actions.ts", door: signOnlineFinalise as Door, loggedBy: "src/app/sourcing/[id]/opening/online-finalise.db.test.ts" },
  { name: "finaliseOnline", file: "src/app/sourcing/[id]/opening/online-finalise-actions.ts", door: finaliseOnline as Door, loggedBy: "src/app/sourcing/[id]/opening/online-finalise.db.test.ts" },
  { name: "lodgeEstimate", file: "src/app/sourcing/[id]/scope/actions.ts", door: lodgeEstimate as Door, loggedBy: "src/lib/sealing/estimate-lodgement.db.test.ts" },
];

/// The modules that hold nothing but sealed doors: every exported function in them is one. (`scope/actions.ts` holds many other acts, and only `lodgeEstimate` is sealed.)
const SEALED_ACTION_MODULES = ["src/app/sourcing/[id]/scope/key-actions.ts", "src/app/sourcing/[id]/scope/substitution-actions.ts", "src/app/sourcing/[id]/opening/unseal-actions.ts", "src/app/sourcing/[id]/opening/online-finalise-actions.ts"];

const form = () => {
  const f = new FormData();
  f.set("exerciseId", `absent_${randomBytes(6).toString("hex")}`);
  f.set("openingId", `absent_${randomBytes(6).toString("hex")}`);
  f.set("passphrase", "a passphrase that is long enough");
  f.set("repeat", "a passphrase that is long enough");
  f.set("password", "not the password");
  f.set("reason", "a reason");
  return f;
};

let organisationId = "";
beforeAll(async () => {
  organisationId = (await testOrganisation()).id;
  await setPolicy(organisationId, SETTINGS);
  await ensureAdministrator(organisationId);
});
afterAll(async () => {
  await db.$disconnect();
});

async function signedIn(admin: boolean): Promise<StaffActor> {
  const made = await makeAccount(organisationId, { admin });
  const token = randomBytes(32).toString("base64url");
  await createStaffSession(db, { organisationId, accountId: made.account.id, tokenHash: hashToken(token), absoluteMinutes: 60, request: facts(), now: new Date() });
  const read = await readStaffSession(token, { sourceAddress: null });
  if (!read.ok) throw new Error(`read failed: ${read.reason}`);
  expect(read.actor.isAdministrator).toBe(admin);
  return read.actor as StaffActor;
}

const sealedRows = async () => ({
  keys: await db.officerExerciseKey.count({ where: { organisationId } }),
  exerciseKeys: await db.exerciseSealingKey.count({ where: { organisationId } }),
  shares: await db.exerciseKeyShare.count({ where: { organisationId } }),
  releases: await db.shareRelease.count({ where: { organisationId } }),
  grants: await db.officerDekGrant.count({ where: { organisationId } }),
  lodgements: await db.sealedEstimateLodgement.count({ where: { organisationId } }),
  authorisations: await db.openingAuthorisation.count({ where: { organisationId } }),
  signatures: await db.openingSignature.count({ where: { organisationId } }),
});

const WORDS = /signed in as an administrator, and administration is kept apart from transactions/;

describe("an administrator account is refused at every sealed entry point (S19, NFR-SEC-004)", () => {
  it("the table names every exported action of the sealed action modules, and each row's covering test exists", () => {
    const root = process.cwd();
    for (const file of SEALED_ACTION_MODULES) {
      const exported = [...readFileSync(join(root, file), "utf8").matchAll(/^export\s+async\s+function\s+(\w+)/gm)].map((m) => m[1]).sort();
      expect(exported.length, file).toBeGreaterThan(0);
      expect(DOORS.filter((d) => d.file === file).map((d) => d.name).sort(), file).toEqual(exported);
    }
    for (const d of DOORS) expect(() => readFileSync(join(root, d.loggedBy), "utf8"), d.name).not.toThrow();
  });

  it.each(DOORS.map((d) => [d.name, d] as const))("%s refuses an administrator in words and writes nothing sealed", async (_name, d) => {
    who.actor = await signedIn(true);
    const before = await sealedRows();
    const result = await d.door({ ok: false }, form());
    expect(result.ok).toBe(false);
    expect(result.message ?? JSON.stringify(result.errors), d.name).toMatch(WORDS);
    expect(await sealedRows(), d.name).toEqual(before);
  });

  it("a person who is not an administrator is not refused for being one: the same door reaches its own checks", async () => {
    who.actor = await signedIn(false);
    const result = await checkUnlock({ ok: false }, form());
    expect(result.ok).toBe(false);
    expect(result.message ?? JSON.stringify(result.errors)).not.toMatch(WORDS);
  });
});
