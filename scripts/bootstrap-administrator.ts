/**
 * Create the first administrator (ADR 0034 D18).
 *
 *   npm run auth:bootstrap                  the first administrator of an organisation
 *   npm run auth:bootstrap -- --additional  a second administrator (maker-checker needs two)
 *   npm run auth:bootstrap -- --recover     a new password for the administrator who is locked out
 *   npm run auth:bootstrap -- --help
 *
 * Run by an operator with access to the server, who already holds the database. It reads everything from the terminal (the password
 * without echo) and ships no default: not a name, not a password, not a setting. The organisation must already exist (npm run setup).
 * Every run is audited as the system, with "bootstrap command" and the flag. The logic is in src/lib/auth/bootstrap.ts, which the tests exercise.
 */
import "dotenv/config";

import readline from "node:readline";

import { bootstrapAdministrator, type BootstrapInput, type BootstrapMode } from "../src/lib/auth/bootstrap";
import { AccountStatus } from "../src/generated/prisma/client";
import { passwordFaults } from "../src/lib/auth/password";
import { rangeFault, SETTING_LABELS, SETTING_RANGES, unsetSettings } from "../src/lib/auth/policy";
import { loadSecurityPolicy } from "../src/lib/auth/policy-store";
import type { SecurityPolicyKey, SecurityPolicyValues } from "../src/lib/auth/types";
import { db } from "../src/lib/db";

const HELP = `
Create the first administrator of an organisation.

  npm run auth:bootstrap                   the first administrator
  npm run auth:bootstrap -- --additional   a further administrator (two are needed so that one can check the other's changes)
  npm run auth:bootstrap -- --recover      a new password for an administrator who is locked out

You are asked for each value. Nothing has a default. An administrator is a person who holds no office, no committee seat and no
delegation, so that administration stays apart from transactions: give the administrator a person of their own.

The settings below are the organisation's own to choose. Where they are not yet set you are asked for them; a setting that is already
set is never changed here.

  What happens at the limit of open sessions
    One of: "end the oldest session to make room" or "refuse the new sign-in". Either is the organisation's choice; this command advises neither.
  Whether a decision taken on paper may be recorded for someone else
    One of: "allowed" or "refused". Either is the organisation's choice; this command advises neither. It may be left unset: while it is
    unset, such a record is refused.

Run it on the server, and nowhere the password could be seen. It writes the audit trail as "bootstrap command", with the flag.
`;

const args = process.argv.slice(2);
const known = new Set(["--additional", "--recover", "--help", "-h"]);
const unknown = args.filter((a) => !known.has(a));
if (unknown.length > 0) {
  console.error(`Unknown option: ${unknown.join(" ")}\n${HELP}`);
  process.exit(2);
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}
if (args.includes("--additional") && args.includes("--recover")) {
  console.error("Use --additional or --recover, not both.");
  process.exit(2);
}
const mode: BootstrapMode = args.includes("--recover") ? "RECOVER" : args.includes("--additional") ? "ADDITIONAL" : "FIRST";

// -- The terminal. A person at a keyboard types the password without echo; a pipe gives lines, and shows nothing anyway.
const tty = Boolean(process.stdin.isTTY);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
let muted = false;
// readline writes what is typed back to the output; while muted it writes nothing.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (text: string) => {
  if (!muted) process.stdout.write(text);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(prompt: string, opts: { secret?: boolean } = {}): Promise<string> {
  process.stdout.write(prompt);
  muted = Boolean(opts.secret) && tty;
  const next = await lines.next();
  if (muted) process.stdout.write("\n");
  muted = false;
  if (next.done) throw new Error("The input ended before every question was answered.");
  return next.value;
}

async function askNumber(key: SecurityPolicyKey, help: string, optional = false): Promise<number | undefined> {
  const range = SETTING_RANGES[key];
  for (;;) {
    const answer = (await ask(`  ${SETTING_LABELS[key].en}${optional ? " (optional, Enter to leave unset)" : ""}\n  ${help}${range ? ` [${range.min} to ${range.max} ${range.unit}]` : ""}: `)).trim();
    if (answer === "" && optional) return undefined;
    const value = Number(answer);
    const fault = answer === "" ? "Enter a number." : rangeFault(key, value);
    if (!fault) return value;
    console.log(`  ${fault}`);
  }
}

async function askChoice<T extends string>(label: string, help: string, options: Record<string, T>, optional = false): Promise<T | undefined> {
  const names = Object.keys(options);
  for (;;) {
    const answer = (await ask(`  ${label}${optional ? " (optional, Enter to leave unset)" : ""}\n  ${help} [${names.join(" / ")}]: `)).trim().toLowerCase();
    if (answer === "" && optional) return undefined;
    if (options[answer]) return options[answer];
    console.log(`  Type one of: ${names.join(", ")}.`);
  }
}

async function main() {
  console.log(`\nBootstrap administrator${mode === "ADDITIONAL" ? " (--additional)" : mode === "RECOVER" ? " (--recover)" : ""}\n`);

  const code = (await ask("Organisation code: ")).trim();
  const organisation = await db.organisation.findUnique({ where: { code }, select: { id: true, name: true } });
  if (!organisation) {
    console.error(`\nThere is no organisation with the code "${code}". Run npm run setup first: the organisation must already exist.`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ${organisation.name}\n`);

  // Said before anything is asked: the same refusal the command makes inside its transaction, so nobody types a password to be told no.
  const administrators = await db.staffAccount.count({ where: { organisationId: organisation.id, isAdministrator: true, status: AccountStatus.ACTIVE } });
  if (mode === "FIRST" && administrators > 0) {
    console.error("An administrator already exists. To add a second one run this command with --additional. If the only administrator is locked out, run it with --recover.");
    process.exitCode = 1;
    return;
  }
  if (mode !== "FIRST" && administrators === 0) {
    console.error(`There is no administrator yet, so ${mode === "ADDITIONAL" ? "--additional" : "--recover"} has nothing to add to or recover. Run the command without a flag.`);
    process.exitCode = 1;
    return;
  }

  // The settings that are not yet set, asked before the password so that the password is held to the length just chosen.
  const existing = await loadSecurityPolicy(db, organisation.id);
  const policy: Partial<SecurityPolicyValues> = {};
  const unset = unsetSettings(existing, "SIGN_IN", "SET_PASSWORD", "ISSUE_CODE");
  if (unset.length > 0) {
    console.log("These settings are not set yet. They are the organisation's own to choose:\n");
    const num = async (key: SecurityPolicyKey, help: string) => {
      if (unset.includes(key)) policy[key] = (await askNumber(key, help)) as never;
    };
    await num("staffIdleMinutes", "How long a session may sit unused before it ends");
    await num("staffAbsoluteMinutes", "The longest a session may last, however busy");
    await num("maxConcurrentSessions", "How many sessions one account may have open at once");
    if (unset.includes("concurrentSessionAction")) {
      policy.concurrentSessionAction = await askChoice<"REVOKE_OLDEST" | "REFUSE_NEW">(
        SETTING_LABELS.concurrentSessionAction.en,
        "When an account is at that limit, either end its oldest session to make room, or refuse the new sign-in",
        { oldest: "REVOKE_OLDEST", refuse: "REFUSE_NEW" },
      );
    }
    await num("maxFailedAttempts", "Wrong passwords in a row before an account is locked");
    await num("lockoutMinutes", "How long a locked account stays locked");
    await num("addressThrottleAttempts", "Failed sign-ins from one address before that address is held back");
    await num("addressThrottleMinutes", "How far back failed sign-ins from one address are counted");
    await num("passwordMinLength", "The shortest password allowed");
    await num("resetCodeValidityMinutes", "How long a one-time code stays valid once issued");
    console.log("");
  }
  const optional: SecurityPolicyKey[] = (["supplierIdleMinutes", "supplierAbsoluteMinutes", "paperSignatureRecording", "signInDetailRetentionDays"] as const).filter(
    (k) => (existing?.[k] ?? null) == null,
  );
  if (optional.length > 0 && mode === "FIRST") {
    console.log("These may be left unset for now (press Enter). While one is unset, what it governs is refused or kept:\n");
    if (optional.includes("paperSignatureRecording")) {
      policy.paperSignatureRecording = await askChoice<"ALLOWED" | "REFUSED">(
        SETTING_LABELS.paperSignatureRecording.en,
        "Whether an approval, signature or unsealing taken on paper may be recorded by someone else on the decider's behalf",
        { allowed: "ALLOWED", refused: "REFUSED" },
        true,
      );
    }
    if (optional.includes("signInDetailRetentionDays")) policy.signInDetailRetentionDays = await askNumber("signInDetailRetentionDays", "Days a sign-in's address and device are kept before they may be purged (unset: they are kept)", true);
    if (optional.includes("supplierIdleMinutes")) policy.supplierIdleMinutes = await askNumber("supplierIdleMinutes", "Supplier portal: idle time before a session ends", true);
    if (optional.includes("supplierAbsoluteMinutes")) policy.supplierAbsoluteMinutes = await askNumber("supplierAbsoluteMinutes", "Supplier portal: the longest a session may last", true);
    console.log("");
  }
  const minLength = existing?.passwordMinLength ?? policy.passwordMinLength ?? 8;

  const input: BootstrapInput = { organisationCode: code, mode, loginName: "", password: "", policy };

  if (mode === "RECOVER") {
    input.loginName = (await ask("Sign-in name of the administrator to recover: ")).trim();
  } else {
    const personChoice = (await ask("Is the administrator a person already on record? (yes / no): ")).trim().toLowerCase();
    if (personChoice.startsWith("y")) {
      const search = (await ask("  Part of their name: ")).trim();
      const found = await db.person.findMany({
        where: { organisationId: organisation.id, isActive: true, staffAccount: { is: null }, name: { contains: search, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: 15,
        select: { id: true, name: true, jobTitle: true },
      });
      if (found.length === 0) {
        console.error("\nNobody active without a sign-in account matches that name.");
        process.exitCode = 1;
        return;
      }
      found.forEach((p, i) => console.log(`    ${i + 1}. ${p.name}${p.jobTitle ? ` (${p.jobTitle})` : ""}`));
      const n = Number((await ask("  Number: ")).trim());
      const chosen = found[n - 1];
      if (!chosen) {
        console.error("\nThat is not one of the numbers shown.");
        process.exitCode = 1;
        return;
      }
      input.person = { existingPersonId: chosen.id };
    } else {
      const name = (await ask("  Full name: ")).trim();
      const jobTitle = (await ask("  Job title (optional): ")).trim();
      const email = (await ask("  Email (optional): ")).trim();
      input.person = { name, jobTitle: jobTitle || null, email: email || null };
    }
    input.loginName = (await ask("Sign-in name (3 to 64 characters: letters, digits and . _ - @): ")).trim();
  }

  // The password is asked twice, without echo, and held to the length the organisation chose.
  for (;;) {
    const first = await ask("Password (not shown): ", { secret: true });
    const faults = passwordFaults(first, { loginName: input.loginName, minLength });
    if (faults.length > 0) {
      console.log(`  ${faults[0].en}`);
      continue;
    }
    const again = await ask("Password again (not shown): ", { secret: true });
    if (first !== again) {
      console.log("  The two passwords are not the same.");
      continue;
    }
    input.password = first;
    break;
  }

  const result = await bootstrapAdministrator(input);
  if (!result.ok) {
    console.error(`\nNothing was changed. ${result.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nDone. ${mode === "RECOVER" ? "The password is changed, the lock is cleared, and every session of that account has ended." : "The administrator can sign in now."}`);
  if (result.policyFilled.length > 0) console.log(`Settings set: ${result.policyFilled.map((k) => SETTING_LABELS[k].en).join("; ")}.`);
  console.log("This was audited as the bootstrap command.");
}

main()
  .catch((error) => {
    // Never print what was typed: an error from here carries a message, not the input.
    console.error(`\nFailed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await db.$disconnect();
  });
