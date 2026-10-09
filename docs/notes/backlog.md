# Backlog: after go-live

Work moved out of the build by the founder, to be picked up after go-live. Each item keeps its
own record in `decisions-log.md`; this page is the single list.

Founder, 2026-10-04 (chat): "let skip part b acceptance and bundle and 6.16 and let speed up 6.13";
"no need multiple review, just review once and fix the must and should have only. let try to close
20 hours max"; "correct we will proceed after go live, put in back log".

## Modules

| Item | Why it is here | Plan / record |
| --- | --- | --- |
| 6.16 Contractor performance | Moved after go-live by the founder. Contracts close without a performance report until it is built, and say so on screen (BD-613-86, OD-B18). | `plans/6.16-contractor-performance.md` |
| 6.17 Reporting | Removed by the founder 2026-10-04 (aac3495). Listed here only so it is not forgotten. | `plans/6.17-reporting.md` (marked out of scope) |
| 6.13 Part B acceptance, bundle and screenshots | Skipped by the founder to speed up 6.13. Part B is reviewed once per run instead. | decisions log, 6.13 Part B entries |

## From the build

| Item | Why it is here | Record |
| --- | --- | --- |
| Part A shared provenances split (`variationProvenance`, `scheduleFormProvenance`, `delegationFormsProvenance`) | Ruled by the product owner (one source per value, set values not copied, an audit entry per reset); moved here from a standalone round. Until then a screen may show one source for two values; `variation-actions.ts:454` shows an unset source as "(assumed)", English only. | Run 1a acceptance, BD-613-127..131 |
| ContractType: one provenance per behaviour column | Held for the founder's review (BD-613-128). | Run 1a acceptance |
| Code-review Considers from each Part B run | One review per run; Considers are not built. Each run's entry lists them with what they block. | each run's decisions-log entry |
| Source-scan tests portable to Windows | About 110 test files build file paths with `path.join`, which gives `\` on Windows, and compare them with lists written with `/`; 37 fail on Windows though green on Linux. Until fixed, the full suite runs in Linux through `scripts/test-linux.ps1`. Fix by normalising every walker's paths to `/` (one shared helper). | decisions log, 2026-10-04 local-machine entries |
| Dead code after removing "Receive from finance system" | Founder, 2026-10-04: the receive flow is not used and was removed (button, page, action, form mode). `src/lib/requisition/intake.ts` and `src/lib/integration/requisition-intake.ts` (and their tests) now have no caller; the `EXTERNAL` origin and its display stay for requisitions already received. Remove the dead modules, or keep them if a customer needs the flow again. | commit for the founder's UI comments 8-11 |
| Part B items not finished within a run's time budget | A run that overruns moves its remaining items here rather than overrunning. | appended below as they happen |
| Propose several cells of the capability grid as one change | Product owner (for the founder), 2026-10-09, ruling on log line 2023(e)(2). Each click on the grid is one proposal for a second person, which is correct and slow. A later round lets a person tick several cells and propose them as one change, decided as one. | decisions log, 2026-10-09 ruling on 2023(e)(2) |
| A reminder period for back-datings nobody confirms | Product owner (for the founder), 2026-10-09, ruling on log line 2027(2). A back-dated signature that is never confirmed stays "not confirmed" and nothing reminds the person named. How long to wait before a reminder is customer policy: a nullable setting, unset until the customer chooses (unset means no reminder, and the screen says so), as ruled for changes waiting at 1682. | decisions log, 2026-10-09 ruling on 2027(2) |

## Part B items moved here when a run overran

(none yet)

- **Splitting check leftovers (founder removed FR-REQ-015, 2026-10-05).** `assessSplitting`, `justifierFaults` and `splitApprovalFault` in `src/lib/requisition/splitting.ts` have no caller (only `splitStateLabel` is used, by History). The RequisitionPolicy columns `splittingWindowDays`, `splittingMatchOn`, `splittingAggregateAcrossYear`, `splitJustifyingRoleCode`, and the demo data that writes them, are unused. Drop them with a migration once past split checks no longer need to be read.

## Go-live conditions (met before the public copy is exposed, not after)

| Item | Why it is here | Record |
| --- | --- | --- |
| Supplier portal: an edge rate limit or challenge, and a retention period for undecided online applications | Product owner (for the founder), 2026-10-06, ruling 3. A CAPTCHA (needs a third-party service), a signed form token (needs a server-secret decision), a per-address limit (only the edge in front of the public copy can say who an address is) and a purge of online applications nobody decided (no scheduler, and the retention period is customer policy, unset) are not built. The public copy is not exposed to the open internet until an edge rate limit or challenge exists and the customer has decided that retention period. | decisions log, 2026-10-06 ruling 3 and the "Not built, on purpose" entry |
| Sealed company estimate: the database wall (threat model finding F10) | Product owner (for the founder), 2026-10-08, ruling on log lines 1754, 1804(1), 1814(2) and 1817(4). A go-live condition, not a blocker for internal acceptance runs (the threat model ranks it Medium). It is a step of its own in Phase 5, done before the first real tender is opened: a REVOKE of the sealed columns' SELECT from the application role, a logged SECURITY DEFINER read with a new access basis, `db:roles` and the runtime-role check changed together, and backups. Section E's line for it in the threat model stays NOT MET until it is built. | decisions log, 2026-10-08 rulings on 1754 and 1814 |
| Malay on screen: one internationalisation layer, selectable per user and switchable mid-task (NFR-LNG-001) | Product owner (for the founder), 2026-10-09, ruling on log lines 1879(A), 1891(8), 1897, 1902(4), 1906, 1909(C) and 1919(C). NFR-LNG-001 is an explicit Must in the specification, and the builders treated Malay on screen as an open choice. It is unmet across the whole product, staff screens included (the words tables carry Malay beside English in places, but no screen is switchable), so it is a programme of its own, not a patch to the Phase 4 screens. A go-live condition: the product may run internally in English, and may not go live until it is met or the founder rules otherwise. | decisions log, 2026-10-09 ruling on Malay on screen |
| A supplier exports its own data (the right of access under the PDPA) | Product owner (for the founder), 2026-10-09, ruling on log line 1875(8). The portal holds a supplier's own words, documents and bank details, and the right of access must be met before real suppliers' data is held. Not built. A go-live condition. It is the supplier's own export, of what it entered and what the office recorded about it, with nothing of another supplier's and nothing SULIT it is not entitled to read. | decisions log, 2026-10-09 ruling on 1875(8) |
| The return correction keeps a contractor signatory's personal data for good (PDPA) | Product owner (for the founder), 2026-10-09, ruling on log line 2030, following 1944. A correction of an accepted award's return stores, in `ConfigurationChange.payload`, the contractor signatory's identity card number, address and names, and a change is never altered or deleted. A go-live condition: before real contractors' personal data is held, either the trigger allows the personal and SULIT field values of the payload (not its operation or field names) to be blanked at the decision, or a PDPA correction or erasure can reach this copy. The PDPA data map, when written, lists `ConfigurationChange.payload`. | decisions log, 2026-10-09 ruling on 2030 |

## Not wanted now

| Item | Why it is here | Record |
| --- | --- | --- |
| An audited "download this view" of a list that carries SULIT columns, for entitled readers | Product owner (for the founder), 2026-10-08, ruling on log line 1755: not wanted now. The files built on the server already cover the entitled exports. Picked up only if a customer asks. | decisions log, 2026-10-08 ruling on 1755 |
