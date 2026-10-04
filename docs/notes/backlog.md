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
| Part B items not finished within a run's time budget | A run that overruns moves its remaining items here rather than overrunning. | appended below as they happen |

## Part B items moved here when a run overran

(none yet)
