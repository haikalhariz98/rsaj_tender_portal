import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { posixRelative, toPosix } from "@/lib/scan/files";

/**
 * F1, held in the source (ADR 0034 D12, Phase 2b; the threat model's section E, Phase 2): no actor's person is read from a form or a request body except through
 * the one wrapper (`src/app/_auth/act.ts`, `beginAct`), which reads it only as the attested person of an act recorded on someone's behalf.
 *
 * The scan finds every place an action or a route reads a field whose name says it is a person, and holds each to this list. A person read here is never the
 * actor: it is a designation (who is in charge, whom a thing is returned to), a roster or configuration entry (who sits, who holds an office), someone a thing
 * is given to (a delegate, a custodian), or a person whose act is begun with `beginAct` on that field a few lines on (the reader only checks it). A new read of
 * a person from a form fails until it is classified here, with its reason, which is the review.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(toPosix(p));
  }
  return out;
}

const FILES = walk(path.join(ROOT, "src", "app")).map((p) => ({ file: posixRelative(ROOT, p), text: readFileSync(p, "utf8") }));

/// A read of a form field or a body key whose name says it is a person: `data.get("xPersonId")`, `r.text("personId", ...)`, `r.optionalText("headPersonId")`.
const READ = /\.(?:get|getAll|text|optionalText|choice)\(\s*"([A-Za-z]*[Pp]erson(?!al)[A-Za-z]*)"/g;

const DESIGNATION = "A designation, not an act: who is in charge, whom a thing is returned to or prepared by. Who made the designation is in the audit row.";
const CONFIGURATION = "Configuration: who holds an office, a seat or a qualification is policy, changed through the configuration editors and audited with the signed-in actor.";
const RECEIVES = "Someone who receives, not someone who acts: a delegate, a custodian. The act is the grant or the custody, which is the signed-in person's.";
const NAMED = "The person the act is about, named in the form: the act is begun with beginAct on this very field (namesSubject), which reads it as the attested person and asks for the paper.";

const ALLOWED: Readonly<Record<string, string>> = {
  "src/app/sourcing/actions.ts#personInChargeId": DESIGNATION,
  "src/app/sourcing/actions.ts#personId": "A named participant of a restricted exercise: a roster entry, not an act (the participant is not the actor, and who named them is in the audit row).",
  "src/app/sourcing/[id]/scope/actions.ts#preparerPersonId": "The officer a bill of quantities is prepared by: a designation (BqVersion.preparer is NOT_AN_ACT, with its reason).",
  // SR-07 (ruling 11): the opening officers named on an exercise.
  "src/app/sourcing/[id]/scope/prep-actions.ts#personId": "An officer named to open the bids of an exercise, or the one replacing them: a roster entry, not an act (who named them is in the audit row, and the officer signs for themselves at the opening).",
  "src/app/sourcing/[id]/evaluation/actions.ts#personId": "A member appointed to the evaluation team: a roster entry, not an act (the appointment is audited with the signed-in actor).",
  "src/app/requisitions/actions.ts#returnedToPersonId": DESIGNATION,
  "src/app/projects/[id]/variation-actions.ts#originatorPersonId": NAMED,
  "src/app/projects/[id]/variation-actions.ts#reviewedByPersonId": NAMED,
  "src/app/projects/[id]/variation-actions.ts#principalPersonId": NAMED,
  "src/app/projects/[id]/supervision-actions.ts#grantorPersonId": NAMED,
  "src/app/projects/[id]/supervision-actions.ts#delegatePersonId": RECEIVES,
  "src/app/projects/[id]/actions.ts#custodianPersonId": RECEIVES,
  "src/app/projects/[id]/certificates/[certId]/actions.ts#personBlock": "Not a person: whether the block signed is a person's (password) or a named signatory's. A person's block with no act is refused by the writer.",
  "src/app/configuration/users/core.ts#fromPersonId": NAMED,
  "src/app/configuration/users/core.ts#toPersonId": RECEIVES,
  "src/app/configuration/users/core.ts#jobholderPersonId": "The jobholder whose authority is delegated (ruling of 2026-10-08, log line 1773): whom the grant is about, not who grants it. The grant is the signed-in grantor's act (`Delegation.fromPerson`), and Delegation.jobholder is NOT_AN_ACT, with its reason.",
  "src/app/configuration/users/core.ts#personId": CONFIGURATION,
  "src/app/configuration/users/core.ts#superiorPersonId": CONFIGURATION,
  "src/app/configuration/users/editors.tsx#jobholderPersonId": "The drawer reads the jobholder it is about to save, to name the signed recommendation's file after the absent holder. It posts nothing as the actor.",
  "src/app/configuration/users/editors.tsx#fromPersonId": "The drawer reads the grantor it is about to save, to name the signed recommendation's file. It posts nothing as the actor.",
  "src/app/configuration/scope/core.ts#personId": CONFIGURATION,
  "src/app/configuration/organisation/core.ts#ownerPersonId": CONFIGURATION,
  "src/app/configuration/organisation/core.ts#headPersonId": CONFIGURATION,
  "src/app/configuration/committees/core.ts#personId": CONFIGURATION,
  "src/app/configuration/budget/core.ts#holderPersonId": CONFIGURATION,
  "src/app/projects/[id]/document-actions.ts#approverPersonId": "The approver named on a Project workspace document: who is asked to decide, not who acted (ProjectDocumentApprover.person is NOT_AN_ACT, with its reason). The act is the addition, begun with beginAct on the signed-in officer, and the person named is judged for authority today by the store.",
  "src/app/committees/actions.ts#personId": "A member's attendance at a sitting: a roster entry, not an act (MeetingAttendance.person is NOT_AN_ACT, with its reason).",
  "src/app/projects/[id]/kick-off-actions.ts#attendeePersonId": "An attendee of the contract's kick-off meeting, ticked on the organisation's side: who was there, not who acted (KickOffAttendance.person is NOT_AN_ACT, with its reason). The act is recording the meeting held, begun with beginAct on the signed-in officer.",
};

function found(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of FILES) {
    for (const m of f.text.matchAll(READ)) {
      const key = `${f.file}#${m[1]}`;
      out.set(key, [...(out.get(key) ?? []), f.file]);
    }
  }
  return out;
}

describe("no actor's person is read from a form except through beginAct", () => {
  const reads = found();

  it("every read of a person from a form or a body is a designation, configuration, a recipient or a named person, and says which", () => {
    expect([...reads.keys()].filter((k) => !(k in ALLOWED))).toEqual([]);
  });

  it("the list is not stale: every entry is still read", () => {
    expect(Object.keys(ALLOWED).filter((k) => !reads.has(k))).toEqual([]);
    for (const [k, why] of Object.entries(ALLOWED)) expect(why.length, k).toBeGreaterThan(40);
  });

  it("a person named for an act that is begun on that field is read through the wrapper: the fields named NAMED are begun with namesSubject", () => {
    const named = Object.entries(ALLOWED).filter(([, why]) => why === NAMED).map(([k]) => k);
    const unbegun: string[] = [];
    for (const k of named) {
      const [file, field] = k.split("#");
      const text = FILES.find((f) => f.file === file)!.text;
      if (!new RegExp(String.raw`beginAct\([^)]*personField: "${field}"[^)]*namesSubject: true`).test(text)) unbegun.push(k);
    }
    expect(unbegun).toEqual([]);
  });

  it("no route handler reads a person out of the request body or a form except through the wrapper", () => {
    const wrong: string[] = [];
    for (const f of FILES.filter((x) => x.file.startsWith("src/app/api/") && /\broute\.tsx?$/.test(x.file))) {
      // `const { personId, ... } = body`, `body.personId`, `form.get("recordedByPersonId")`: a person read as the actor.
      if (/\{[^}]*\b\w*[Pp]ersonId\b[^}]*\}\s*=\s*\(?\s*(?:body|await request\.json)/.test(f.text)) wrong.push(`${f.file}: destructures a person from the body`);
      if (/\bbody(?:\??)\.\w*[Pp]ersonId\b/.test(f.text)) wrong.push(`${f.file}: reads a person from the body`);
      if (/\.get\(\s*"\w*[Pp]ersonId"\s*\)/.test(f.text)) wrong.push(`${f.file}: reads a person from a form`);
    }
    expect(wrong).toEqual([]);
  });

  it("the only reader of an act's person field, as the actor's, is the wrapper: beginAct reads `personField` and nothing else does", () => {
    const readers = FILES.filter((f) => /readActForm\(/.test(f.text) && f.file !== "src/app/_auth/act.ts").map((f) => f.file);
    expect(readers).toEqual([]);
  });

  it("every decision of an approval step, and every delegation, judges the person recording it as well as the person it is for (a requester does not record the approver's approval; an officer does not record a delegation to themselves)", () => {
    const wrong: string[] = [];
    const all = [...walk(path.join(ROOT, "src", "app")), ...walk(path.join(ROOT, "src", "lib"))]
      .map((p) => ({ file: posixRelative(ROOT, p), text: readFileSync(p, "utf8") }))
      .filter((f) => !/\/page\.tsx$/.test(f.file));
    for (const f of all) {
      for (const m of f.text.matchAll(/\b(?:deciderFaults|faultsIn|delegationFaults)\(/g)) {
        if (/export function $/.test(f.text.slice(Math.max(0, m.index! - 20), m.index!))) continue;
        let depth = 0;
        let i = m.index! + m[0].length - 1;
        const from = i;
        for (; i < f.text.length; i++) {
          if (f.text[i] === "(") depth++;
          else if (f.text[i] === ")" && --depth === 0) break;
        }
        if (!/\brecorderId\b/.test(f.text.slice(from, i + 1))) wrong.push(f.file);
      }
    }
    expect(wrong).toEqual([]);
  });
});
