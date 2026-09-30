RANHILL SAJ SDN BHD
Jabatan Kontrak & Perolehan
RSAJ Digital Procurement Portal
Requirements Specification
Every requirement in this document is traced to a clause of a Ranhill SAJ Operation Manual, to the Board-approved Discretionary Authority Limits, or to a live controlled form — and any requirement that is not so traced is explicitly marked as an assumption requiring RSAJ sign-off.
Version	1.0
Date	3 August 2026
Status	Draft for validation
Prepared for	Head of Contract & Procurement, Ranhill SAJ Sdn Bhd
Baseline sources: OM/KP/SK/001–014 · OM/KP/002–004 · RSAJ/OM/P/001–010 · RANHILLSAJ-DAL Issue A Rev 00 (11 June 2021) · the Contract & Procurement forms library · Tender Evaluation Report RSAJ/TA/109/2024 · the prototype coverage audit.
Table of contents
TOC \h \o "1-3"
1. Purpose, scope and how to use this document
1.1 Purpose
This document is the requirements specification for the RSAJ Digital Procurement Portal — an end-to-end procurement and contract-administration system for Ranhill SAJ Sdn Bhd, to be delivered on Microsoft Power Apps / Power Pages over Dataverse, with a synchronisation boundary to Dynamics 365 Finance & Operations.
It exists because the clickable prototype that Ranhill SAJ commissioned was built before the governing Operation Manuals had been analysed. An audit of that prototype against the Operation Manuals (OM/KP/SK/001–014, OM/KP/002–004, RSAJ/OM/P/001–010) and the Board-approved Discretionary Authority Limits manual found that the prototype covers the sourcing window competently but has no approval engine, no committee layer and none of the post-award lifecycle. This specification is the document the prototype should have been built from.
Every requirement in Section 6 is traced to a clause of a Ranhill SAJ Operation Manual, to the DAL, or to a live controlled form. Where no such source exists, the requirement is marked [ASSUMPTION] or [NET-NEW] and requires RSAJ sign-off before it is built.
1.2 In scope
The complete pre-award process: requisition intake, funding-route determination, budget check, scope and Bill of Quantities, company estimate, method selection, tender and quotation document assembly, advertisement and invitation, document sale, briefing and site visit, bid receipt, bid opening, evaluation, committee recommendation, DAL approval, and award.
The complete post-award lifecycle: contract formation and execution, delegation of Superintending Officer authority, supervision and site records, advance and interim payment, variation orders, contract price adjustment, extension of time and extension of contract period, non-completion and liquidated damages, termination, nominated sub-contractors and suppliers, completion, partial occupation, defects liability, making good defects, final certificate and contract close.
The configurable DAL-driven approval engine, the committee layer (Tender Board, Quotation Committee, Variation Orders Committee, Tender and Quotation Opening Committees, Technical Committee) and the full evidentiary audit trail.
Generation of the approximately thirty certificates, letters and routing sheets in the Ranhill SAJ Contract & Procurement forms library, to printed-form fidelity, in Malay and English.
The vendor-facing portal: registration, statutory-document lodgement and verification, expiry monitoring, suspension and reinstatement, tender browsing, document purchase, bid submission and award notification.
Contractor performance evaluation across the seven CPD/SA-F01–F07 scoring models, and reporting, dashboards and audit.
Integration with the incumbent ERP for requisition, budget, purchase order and indent data, and the forward path to D365 F&O.
1.3 Out of scope
The general ledger, accounts payable posting, bank payment file generation and treasury functions. The portal certifies amounts; the ERP pays them.
Asset management, works management and maintenance planning outside the procurement and contract-administration lifecycle.
Human-resources, payroll and staff-establishment data beyond the role and approval-authority attributes the approval engine needs.
The procurement processes of PAAB, KKDW and government agencies or developers under funding routes F3, F4 and F5. Under F4 and F5 Ranhill SAJ does not procure at all; the portal records eligibility verification, inspection and asset acceptance only.
Amendment of the Operation Manuals themselves. Where this specification identifies that a manual must change before a requirement can lawfully be built, that is recorded in Section 12 as a decision for RSAJ, not as a system deliverable.
Migration of historical contract records held on Public Server: 27 and the forms file share. A coexistence and migration plan is a separate deliverable; this document states only the repository requirements the portal must satisfy.
1.4 Requirement identifier scheme
Every requirement carries a stable identifier of the form FR-XXX-nnn (functional) or NFR-XXX-nnn (non-functional). The three-letter code identifies the module, and the number is sequential within that module. Identifiers are never reused: if a requirement is withdrawn its identifier is retired.
Code
	Module
	Code
	Module
REQ
	Requisition, funding route and budget check (6.1)
	PAY
	Interim payment, retention and deductions (6.13.2)
EST
	Scope, Bill of Quantities and company estimate (6.2)
	VAR
	Variation orders and the 660–663 chain (6.13.3)
MTD
	Method selection and contract classification (6.3)
	PAD
	Contract price adjustment (6.13.4)
DOC
	Tender and quotation document assembly (6.4)
	EOT
	Extension of time and of contract period (6.13.5)
ADV
	Advertisement, invitation, sale, briefing, addenda (6.5)
	LAD
	Non-completion and liquidated damages (6.13.6)
BID
	Bid submission and receipt (6.6)
	TRM
	Termination (6.13.7)
OPN
	Bid opening (6.7)
	CMP
	Completion, occupation, defects, CMGD (6.13.8)
EVL
	Evaluation (6.8)
	NSC
	Nominated sub-contractors and suppliers (6.13.9)
APR
	The approval engine (6.9)
	FIN
	Final certificate and contract close (6.13.10)
CTE
	Committee management (6.10)
	CRT
	Certificate generation and document tracking (6.14)
AWD
	Award (6.11)
	VND
	Vendor portal (6.15)
CON
	Contract formation and execution (6.12)
	CPR
	Contractor performance evaluation (6.16)
SUP
	Supervision and site records (6.13.1)
	RPT
	Reporting, dashboards and audit (6.17)
Non-functional requirements use the codes AUD (audit and evidentiary integrity), RET (retention), LNG (bilingual output), GEN (document generation fidelity), SIG (electronic signature), SEC (access control and security), PRF (performance), AVL (availability), MOB (mobile), USE (usability and accessibility) and INT (integration quality).
1.5 Priority scheme (MoSCoW)
Priority
	Meaning at Ranhill SAJ
Must
	The portal cannot go live without it. Either the Operation Manual or the DAL makes it mandatory, or its absence would produce an unlawful, unauditable or financially wrong outcome. Every requirement that implements a DAL authority row, a mandatory committee recommendation, a blocking gate or a statutory obligation is a Must.
Should
	Important and expected in the first full release, but the portal can operate for a defined period without it using a documented manual workaround. Typically controls that improve assurance rather than create it.
Could
	Desirable. Delivered if capacity allows, or in a later phase. Typically convenience, analytics depth and self-service breadth.
Won't
	Explicitly excluded from this programme. Recorded so that the exclusion is a decision rather than an oversight, and so it can be revisited.
Priority is a delivery judgement, not a statement of legal force. A requirement can be sourced to a mandatory SOP clause and still be a Should if a compliant manual workaround exists for the first release. Where that is the case the Notes column says so.
Applied to this corpus the distribution is heavily weighted towards Must — 340 of the 381 functional requirements. That is a property of the source material rather than of the scheme: the Discretionary Authority Limits are Board-approved and the Operation Manuals are mandatory procedures, so most requirements implement an obligation rather than an option. The instrument for sequencing delivery is therefore Section 13, the phasing recommendation, and not the priority column.
1.6 Traceability convention
The Source clause column cites the governing instrument in the shortest form that is unambiguous:
Citation form
	Means
SK001 7.3.4(a)
	Operation Manual OM/KP/SK/001 (Preparation of Tender Documents), clause 7.3.4(a). SK002 = Invitation and Receipt; SK003 = Evaluation and Acceptance; SK004 = Contract Documents; SK005 = Supervision; SK006 = EOT; SK007 = Non-completion and LAD; SK008 = Termination; SK009 = Completion and Defects; SK010 = Nominated Sub-Contractors; SK011 = Advance and Interim Payment; SK012 = Variation Orders; SK013 = Contract Price Adjustment; SK014 = Final Certificate.
DAL §3.1.4.4 item 7
	Discretionary Authority Limits manual, RANHILLSAJ-DAL, Issue A Revision 00, 11 June 2021 (Fifth Revision), approved by the Board of Directors. Page references are to that manual.
KP002 5.9.2
	OM/KP/002 Work Contract manual. KP003 = Service Contract; KP004 = Supply Contract.
OM/P/004 8.2
	RSAJ/OM/P Jabatan Projek series, Issue B, 15 July 2025.
CPD/B.INT(T)
	A live controlled form in the Contract & Procurement forms library. Where a requirement derives from the printed form rather than from an SOP clause, the form code is the source.
TA 109
	Tender Evaluation Report RSAJ/TA/109/2024 and its advertisement — observed practice, not policy.
[PRACTICE]
	The requirement reflects observed practice with no SOP or DAL basis. It is real, it is what RSAJ does, and it must be configurable rather than hard-coded until it is ratified.
[NET-NEW]
	No source contemplates this capability at all. It is a deliberate improvement on the paper process — most of the vendor portal falls here. Requires a policy decision, not just a build decision.
[ASSUMPTION]
	Not sourced. Inferred to make the system coherent. Requires RSAJ sign-off before build.
Requirements marked [ASSUMPTION] are not sourced. They are the specifier's inference, made because the system cannot be built without a rule in that place. Each one is listed in Appendix A and in Section 12 with a named owner. Ranhill SAJ must confirm, amend or reject each [ASSUMPTION] in writing before the affected module is built. Building against an unconfirmed assumption is the single most likely cause of rework in this programme.
1.7 How to read Section 6
Section 6 is the core of the document. It is organised by module, and every module opens with a short statement of what the module does, where the current process sits, and what the prototype covers. The requirement tables that follow are landscape and carry six columns:
Req ID — the stable identifier.
Requirement statement — written in testable "The system shall…" form. One obligation per requirement.
Pri. — M (Must), S (Should), C (Could), W (Won't).
Source clause — the traceability citation per 1.6.
Acceptance criteria — the objective test a tester can execute to decide whether the requirement is met. Where a threshold is involved, the criterion names the figure.
Notes — conflicts, decisions, dependencies and prototype coverage.
Every RM figure and percentage in this document is reproduced verbatim from its source. No threshold has been rounded, converted or paraphrased. Where two sources give different figures for the same rule, both figures appear and the conflict is raised as a decision in Section 8 or Section 12 — a source is never silently preferred.
1.8 Document control
Attribute
	Value
Title
	RSAJ Digital Procurement Portal — Requirements Specification
Version
	1.0
Date
	3 August 2026
Status
	Draft for validation
Prepared for
	Ranhill SAJ Sdn Bhd — Jabatan Kontrak & Perolehan
Baseline sources
	OM/KP/SK/001–014 · OM/KP/002–004 · RSAJ/OM/P/001–010 · RANHILLSAJ-DAL Issue A Rev 00 (11.06.2021) · Contract & Procurement forms library (25 workbooks, 3 Word templates) · Tender Evaluation Report RSAJ/TA/109/2024 · LAPORAN PENILAIAN SEBUTHARGA template · prototype coverage audit
Review required from
	Head of Contract & Procurement; Ketua Seksyen Pra Kontrak; Ketua Seksyen Pos Kontrak; Ketua Projek; Director of Finance & Administration (DAL owner); Group Legal Compliance; Internal Audit; Head of Group IT
Next revision trigger
	Written resolution of the blockers listed in Section 12.1, or any revision to SK003, SK006, SK007 or the DAL
2. Executive summary
2.1 What the portal must do
The RSAJ Digital Procurement Portal must run the whole of Ranhill SAJ's procurement from the moment an operating department identifies a need to the moment a contract is closed, the retention money is released and the contractor is scored. Today that process runs on paper, Microsoft Word and Excel templates held on a Windows file share, a physical tender box with a physical key, registered post, a notice board, Zimbra email, and a bespoke Oracle workflow that handles only the requisition and its Discretionary Authority Limits approval chain. Nothing between an approved requisition and a signed appointment letter is in any system at all, and nothing after the appointment letter is in any system at all.
The portal must therefore do four things that no existing system does:
Route every approval by the Discretionary Authority Limits. The DAL is the constitutional instrument of Ranhill SAJ procurement. It defines four requisition bands, seven direct-purchase bands, four open and selective tender bands, fifteen quotation contract-administration rows, seventeen tender contract-administration rows, a two-dimensional variation-order matrix of nine cells, and an authority grammar of A / R / P / JP / JR / MA / MR / MJR in which approval at any level automatically generates the propose-and-recommend chain beneath it. No approval in the portal may be routed by anything else.
Model the committees as first-class entities. The Tender Board Committee, Quotation Committee, Variation Orders Committee and the two Opening Committees are the legal basis for every appointment and every variation at Ranhill SAJ. Their recommendations are in several places mandatory and non-delegable. A system that cannot record a quorate committee decision with individual votes cannot replace the paper.
Run the post-award certificate chain. Roughly sixty per cent of the documented process, and effectively all of the financial risk, sits after award: interim valuation with retention and set-off, variation orders, contract-sum adjustment, extension of time, liquidated damages, termination, defects and final account. This is expressed in approximately thirty printed certificates whose fields, formulas, signature order and distribution lists are already specified to the field level in the forms library.
Give vendors a front door. The Operation Manuals contemplate a counter, a tender box and registered post. They do not imagine a vendor logging in. Vendor self-service is entirely net-new capability and is the clearest value case in the programme — and, precisely because it is unsourced, the part that needs the most explicit policy sign-off.
2.2 The scale of it
Dimension
	Scale
	Consequence for the build
Owning departments
	Two — Contract & Procurement (Jabatan Kontrak & Perolehan), split into a Pre-Contract Section owning SK001–003 and a Post-Contract Section owning SK004–014; and the Project / Implementing Department (Jabatan Projek) owning the OM/P series.
	Two process owners, two document sets, one case record. Ownership transfers at the Letter of Acceptance; the portal must model that as a change of section ownership on the same case, not a new case.
Sourcing methods
	Nine — open tender, selected tender, open quotation, selective quotation, direct appointment (lantikan terus), selective direct appointment, specialist / sole source via the Technical Committee, emergency works, and Schedule of Rates / term contract call-off.
	A sourcingMethod enum drives document composition, invitation channel, committee, approval row and award instrument. The prototype has two values, neither of which is a sourcing method.
Contract types
	Three — Work (OM/KP/002), Service (OM/KP/003), Supply (OM/KP/004) — driving at least twelve downstream behaviours.
	The classification must be captured at requisition and must be immutable thereafter without a controlled change.
Contract taxonomies in the corpus
	Five, mutually incompatible: KP Work/Service/Supply; SK001 contract basis (BQ vs Drawings & Specification); SK003 evaluation type (Traditional vs Design & Build/Turnkey); CPD/DFA/SSP (Works / Maintenance Works / Service / Supply); and the seven-way performance-report split.
	One canonical contract type with an explicit mapping table to each of the other four. Not a choice among them.
Certificates and forms
	Approximately thirty — nine CPD/DFA/* routing sheets, roughly twenty certificates and letters, and seven contractor-performance variants each in Malay and English.
	A document-generation engine with per-form templates, field-level binding, computed fields, ordered signature blocks and per-form distribution lists.
Post-award sub-processes
	Eleven — A contract formation, B supervision, C payment, D variations, E price adjustment, F extension of time, G non-completion and LAD, H termination, I completion and defects, J nominated sub-contractors, K final certificate.
	This is a programme in its own right, not a sprint. It is where all the money is.
DAL rows the engine must hold
	Over sixty distinct authority rows across requisition, appointment, quotation contract administration and tender contract administration.
	Configuration data, versioned and effective-dated — never code.
Value bands
	RM500 · RM5,000 · RM15,000 · RM50,000 · RM100,000 · RM300,000 · RM500,000 · RM1 million · RM3 million · RM5 million, plus percentage bands of 5%, 10%, 15%, 20%, 30%, 50% and 70%.
	Three distinct and unrelated RM50,000 meanings and three distinct band families must be separate fields, not one threshold.
2.3 The five decisions Ranhill SAJ must make before build starts
These five are blockers. Each one determines the shape of a module rather than the value of a field, and none can be resolved by the delivery team. They are expanded, with owners and consequences, in Section 12.1.
#
	Decision
	Why it blocks
	Owner
D1
	The evaluation methodology. SK003 prescribes four qualitative aspects and contains no scoring, no marks, no weighting and no pass mark. Live practice runs a six-stage weighted tender model (technical pass 70%, weight 60 marks; financial pass 60%, weight 40 marks; composite pass 60) and a five-phase quotation model. RSAJ must either locate the weighting in the Terms of Reference, amend SK003 to codify the practice, or confirm that the methodology is per-exercise configurable with no policy default.
	The evaluation module cannot be built against a methodology that exists only in an Excel template and a Word report. Hard-coding the practice would embed an unauthorised rule; building only the SOP would produce an evaluation nobody can use.
	Head of Contract & Procurement with Ketua Seksyen Pra Kontrak and the implementing-department heads
D2
	The DAL-versus-SOP authority conflicts. Three material conflicts are live: termination (SK008 §7.5.1 gives sole authority to the Superintending Officer; DAL p.27 item 13 and p.22 item 8 reserve it to the CEO in both regimes); extension of time with no financial impact (SK006 §7.6.1 makes the VOC the approver; DAL p.26 item 10b makes the SO/PD the approver with the VOC as mandatory recommender); and extension of contract period (SK006 §7.6.2 sets a RM50,000 threshold and leaves RM0.01–RM50,000 undefined; DAL p.26 item 9 sends every term-contract extension to the Tender Board with no band).
	The approval engine cannot hold two authorities for the same event. For contracts between RM300,000 and RM3 million, SK008 would let a Functional Director or Head of Division terminate a contract that the DAL reserves to the CEO.
	Director of Finance & Administration as DAL owner, with the Head of Contract & Procurement; ratified by the Board where the DAL changes
D3
	The > versus ≥ operator at RM300,000, and the boundary value itself. SK001 3.1 and 7.1.1, SK002 3.1 and SK003 3.1 all say melebihi (exceeding). The SK001 flowchart box 2 says NILAI KERJA ≥ RM300,000.00. KP002/003/004 5.1.1 say quotations may be invited only where the work costs less than RM300,000, which puts exactly RM300,000 into tender. OM/P/005 3.1 says RM300,000 is the maximum quotation value, which keeps it in quotation.
	Every routing decision in the system keys off this boundary. A work valued at exactly RM300,000.00 is currently in scope under one reading and out of scope under another, and would go to a different committee, a different approver and a different award instrument depending on which is chosen.
	Head of Contract & Procurement, in writing, as a Quality Instruction
D4
	The performance bond basis, and the retention rule. SK004 §7.3.3(a) says the performance bond is 5% of the total Contract Price. The live award pack for RSAJ/KP/T/02/2026 computes 5% of the one-year value — RM26,937.70 on a RM1,077,508.60 two-year contract, roughly half. SK001 7.3.4(f)(ii) states a CAPEX band at RM1 million whose two sides are substantively identical and therefore inoperative, and states no OPEX rule at all. Separately, the retention percentage and retention cap are defined nowhere — not in SK011, not in SK009, not in the DAL and not on any form; the only retention figures in the corpus are the quotation-route appointment letters' 10% of work executed capped at 5% of the total contract price above RM50,000.
	The securities register, every bond-sufficiency check, every interim certificate and the final account all depend on these numbers. They cannot be defaulted.
	Ketua Seksyen Pos Kontrak with Ketua Seksyen Pra Kontrak and Finance
D5
	The system of record and the ERP sequencing. The live transactional ERP is Oracle-based: the pre-printed label "Oracle Reference :" appears on a currently controlled form (PEN/LRA/06-01, Rev. 01.04.2025) against a PROC number, and the workflow states REQUEST NOTE, REGISTRATION, DAL RECOMMENDER 1/2/3 and DAL APPROVAL are a bespoke Oracle layer. The only D365 artefact in the entire corpus is a Microsoft Contoso usmf demo journal. OM/P/002 §8.3 adds a third claim, that projects are registered in an "Intergrated Financial System (IFS)". RSAJ must state which system holds PROC, IN and PO numbers today, and whether D365 F&O will be live before, during or after the portal.
	The integration architecture, the primary business key and the phasing all change depending on the answer. PROC… must be the portal's primary business key; today it is an Oracle document ID and it appears nowhere in the prototype.
	Head of Group IT with Ketua Projek and the Head of Contract & Procurement
2.4 What good looks like
On the day the portal goes live, an officer raising a RM180,000 works quotation should find that the system has already determined that the exercise is in the quotation regime because the value exceeds RM15,000 and does not exceed RM300,000; that the appointment must be recommended by the Quotation Committee as a mandatory, non-delegable recommendation and approved by the Chief Executive Officer; that the award instrument is an Inden Kerja followed by a Pemberitahuan Perlantikan; that because the value exceeds RM50,000 the appointment letter carries retention at 10% of the value of work executed capped at 5% of the total contract price and a six-month defects liability period; and that none of those decisions was made by the officer.
And on the day a Superintending Officer certifies an interim payment of RM620,000, the system should route it to the Chief Executive Officer because the DAL puts interim payments above RM500,000 there — not to the "S.O." that the routing sheet prints, and not to the Functional Director that the officer would have guessed.
3. Where the existing prototype stands
Ranhill SAJ has already built a clickable React prototype of the portal. It is a substantial and in places genuinely well-informed piece of work, and it should be treated as a foundation rather than as a false start. This section states fairly what it covers, what it covers partially, and what it does not cover, so that Section 6 can be read as a gap-closing plan rather than as criticism.
3.1 What the prototype gets right
These are correct against the Operation Manuals and should be carried forward substantially unchanged:
The RM300,000 tender / quotation boundary, with automatic classification driving the setup wizard's branch. This is the single most important threshold in Ranhill SAJ procurement and the prototype has it right.
The Sebut Harga financial test — minimum capital equal to the company estimate multiplied by 3% where materials come from the Ranhill SAJ store or 5% where the contractor supplies them, compared against the average of three months' bank balances. Correct formula, correct credit-factor semantics, correct pass/fail.
The Sebut Harga commercial test — variance against the estimate and against the lowest price, classified Rendah below −15%, Kompetitif within ±15%, Tinggi above +15%. Correct.
Contractor performance banding — Terbaik 80–100, Baik 60–79, Sederhana 50–59, Tidak Memuaskan 40–49, Gagal 0–39 — correctly wired as a technical criterion.
The Fasa 2 technical criteria in Malay, with the right six items: Pengalaman Kerja, Kerja Semasa, Tenaga Kerja, Loji/Jentera/Peralatan, Pengurusan Tenaga and the Contractor Performance Report percentage.
The Jadual Tawaran modal — correct form code CPD/J.TAWARAN-02, correct header rows including Bil. Tawaran Yang Lewat Diterima, the ANGGARAN SYARIKAT benchmark row, correct Malay narrative and dual signature blocks. This is a faithful reproduction of the real form.
The bid-opening to evaluation gate. Evaluation is genuinely locked until the opening committee finalises, and only passed vendors carry forward. That sequencing is exactly right and is enforced in code rather than merely displayed.
Department-versus-Procurement separation of duties in evaluation, with financial and commercial stages locked until technical is submitted. This mirrors SK003 7.1.1's joint-evaluation model better than anything else in the build.
The RSAJ E-Payment / Creditor's Profile form in vendor registration, reproduced almost verbatim including the GIRO declaration naming RANHILL SAJ SDN BHD, the four numbered undertakings, the bank-statement-with-company-stamp upload and the authorised-signatory block.
The statutory registration schema — SSM, PKK, STB, MOF with searchable field codes, CIDB grade with a genuine 84-entry pengkhususan list, SPAN permit and grade, Suruhanjaya Tenaga class, LJT, BNM broker, SST with rate, LHDN. This is a real, well-researched Malaysian water-utility vendor schema and should be carried straight into Dataverse.
Honesty about verification — the prototype states explicitly that lodged documents are not auto-validated and require manual officer verification in three to four working days. That is correct and should not be quietly changed.
The 2.30 p.m. quotation closing time, validity periods of 90 and 120 days with computed expiry, and the distinction between closing for document purchase and closing for submission.
3.2 What the prototype does that the Operation Manuals do not contemplate
These are improvements on the paper process. They are net-new policy, not implementation detail, and each needs an explicit RSAJ decision — but the instinct behind each is sound and this specification adopts them:
The entire vendor self-service portal. SK001–003 contemplate a counter, a tender box, registered post and one-way website publication. Nothing in them imagines a vendor logging in.
Addendum and corrigendum issuance with automatic notification of document purchasers. No corrigendum, addendum or errata procedure exists anywhere in SK001, SK002 or SK003 — the largest single process gap in the invitation phase. The prototype has designed one.
Vendor document expiry monitoring with reminders at 90, 60, 30 and 7 days, severity bands, auto-suspension on lapse and a renewal re-approval step.
Suspension and reinstatement workflow with per-document verification gating reinstatement.
Online document-fee payment with a reconciled receipt register. SK002 7.5.2 requires only that the issuing officer annotate the document itself; there is no purchaser register at all. A register is strictly better.
Unsuccessful-bidder notification with a score debrief. SK003 7.11 provides for no notification whatsoever. Notifying is almost certainly right; it is a deliberate policy change.
Blind evaluation. The right instinct in the wrong place — it cannot coexist with CPR-based technical scoring, which requires the named contractor. Worth redesigning rather than discarding.
Configurable evaluation parameters saved as templates. Given that SK003 prescribes no scoring at all, per-exercise configurability is exactly right.
3.3 Coverage summary by process area
The audit assessed the prototype against 122 discrete line items drawn from the Operation Manuals, the DAL and the forms library. Full means the prototype implements the requirement correctly at runtime. Partial means it is present but incomplete, unreachable, configured but not executed, or materially wrong in detail. Absent means there is no implementation.
Process area
	Full
	Partial
	Absent
	Total
	Assessment
A. Intake, requisition and funding
	0
	3
	13
	16
	The PR screen exists but is orphaned — defined and exported, never routed. Funding-route determination, the government-funding override, the technical/CAPEX committee gate, BQ authoring, the Specification Setting Panel and the CPD/DFA/PRE T-QUO routing sheet are all absent.
B. Method, classification and value bands
	0
	2
	9
	11
	The RM300,000 boundary is right. The RM15,000 boundary — the actual start of the quotation regime — is absent, so everything below RM300,000 collapses into one bucket. No sourcing-method enum, no contract type, no contract basis.
C. Tender and quotation document preparation
	0
	3
	5
	8
	Three mandatory plus three supporting files against SK001's twelve constituent parts. No BQ-versus-Drawings branch, no template library, no Dokumen Meja Tender, no Bumiputera stamping.
D. Invitation and receipt
	1
	9
	3
	13
	The strongest partial area. Addendum handling is ahead of the SOP. Newspaper and notice board — both mandatory — are absent and Telegram is invented; no date validation of any kind; the quotation document fee is shown as RM30 against an SK002 floor of RM50.
E. Bid opening
	2
	4
	2
	8
	Jadual Tawaran and Grand Summary are well reproduced. The committee is represented rather than modelled: three hard-coded members chaired by HOD Procurement against SK002's two appointed Executive officers, and a single shared password printed on screen in place of a two-person control.
F. Evaluation
	3
	8
	6
	17
	The quotation model is largely correct and correctly implemented. The tender model is configured in a wizard and never executed — the runtime always applies the quotation model, including to a RM4.2 million open tender. The company estimate is a hard-coded literal.
G. Committee layer and DAL approval
	0
	2
	11
	13
	The weakest area. No committee entity, no quorum, no votes, no minutes. No value-band routing; the Settings condition enum offers ≥100K, ≥1M, ≥5M and ≥10M, none of which is a DAL boundary; a "Discretionary Authority Limits" card displays four invented tiers.
H. Award, acceptance and contract execution
	0
	3
	13
	16
	A single unconditional "Issue Letter of Award" button. No Tender Board precondition, no DAL signatory resolution, no five-party distribution, no Integrity Pact Stage Two, no Inden Kerja, no bonds or insurances register, no legal endorsement, no stamping.
I. Post-award lifecycle A–K
	0
	0
	11
	11
	Absent in full. What the prototype does build — purchase orders, three-way matching and an EFT payment batch — models a D365 accounts-payable flow, not Ranhill SAJ's certified interim valuation. All four of those screens are unreachable in any case.
J. Cross-cutting (certificates, numbering, bilingual, records, audit)
	0
	5
	4
	9
	Two of approximately thirty certificates are rendered, both pre-award. Only one document-numbering pattern is correct; PROC…, the primary business key of the whole process, appears nowhere. No document classification model, no i18n layer.
Total
	6
	39
	77
	122
	5% full, 32% partial, 63% absent.
3.4 The four architecture-defining gaps
Four gaps cannot be retrofitted. They determine the shape of the data model and the workflow engine, and they must be designed before anything else is built.
There is no approval engine — there are hard-coded approver lists. One static four-row array in an unreachable requisition screen, one static two-row array in the tender wizard, and a Settings workflow builder whose condition enum matches no DAL boundary. Value-band-driven approval is not implemented at all. Every award in the reachable flow is a single unconditional button. Consequence of shipping as-is: every approval routes to the wrong person at every value, and every award decision is unauditable.
The committee layer does not exist as a modelled concept. The only Tender Board voting interface in the build is dead code that the router never renders. The Quotation Committee — whose mandatory, non-delegable recommendation gates every appointment between RM15,000 and RM300,000, the bulk of transaction volume — appears zero times. The Variation Orders Committee appears zero times. Consequence: the portal cannot produce a compliant award.
The entire post-award lifecycle is missing, and what exists models the wrong process. Eleven sub-processes are absent. Ranhill SAJ does not pay works contractors on a purchase-order/goods-receipt/invoice match; it pays on a certified interim valuation carrying retention, LAD set-off, advance recoupment, employer-paid premiums and wages, and a four-way pro-rata payment waterfall, with its own DAL band on the certificate. Consequence: roughly sixty per cent of the documented process, and all of the financial risk, has no design.
The certificate chain is two of approximately thirty, and both are pre-award. The twenty-eight missing include every instrument that fixes money or time. The forms library already specifies these to field level with signature order and distribution lists; that specification exists and was not used. Consequence: the portal produces no legal document after the Letter of Award, and becomes a second place to enter data.
3.5 Errors of fact in the prototype that must not be carried forward
What the prototype states
	What the source says
	Impact
Letter of Award: "LD Rate 0.1% per day, capped at 10%"
	The only documented LAD formula in the corpus is 0.025% × Original Contract Sum per day (S36 = P30*0.025%, identical on all seven contractor-performance workbooks). No cap is defined anywhere; the only constraint is the qualitative rule that LAD must not accumulate until it becomes an oppression (deraan), SK007 §7.6.2.
	A fourfold overstatement of the daily rate and an invented cap. If this template were issued, Ranhill SAJ would contract on wrong LAD terms.
Quotation document fee shown as RM 30.00 in the review step (and RM 300 default two steps earlier)
	SK002 7.4.2(d): minimum RM250.00 per tender document set and RM50.00 per quotation document.
	Below the SOP floor, and internally inconsistent.
Discretionary Authority Limits presented as Tier A ≤ MYR 100K, Tier B ≤ MYR 5M, Tier C CFO Override, Tier D CEO/Mega
	No such tiering exists. The DAL is organised by role — Head of Department, Head of Division, Functional Director, CEO, Chairman, Board of Directors, Tender Board Committee — against value bands of RM500, RM5,000, RM15,000, RM50,000, RM300,000, RM1M, RM3M and RM5M.
	The officer is shown an authority model that does not exist.
Delegation modelled as self-service downward delegation, with an "auto-route steps above my limit" toggle
	DAL p.42: authority does not pass down automatically on absence — it reverts upward to the delegator, who may re-delegate only on the absent holder's recommendation. Delegation must be in writing, time- or task-specific, to line subordinates only, with no sub-delegation, and granted by the jobholder's superior rather than by the jobholder. MA, MR and MJR items are never delegable.
	The prototype implements the opposite of the rule.
Tender evaluation minimum capital computed as estimate × 3% or 5%
	That is the quotation rule. The tender rule is Minimum Capital Required = 10% of the Tender Amount, scored across five weighted components (paid-up capital 10, nett worth 10, working capital as a percentage of minimum capital 60, gearing 10, current ratio 10).
	Every tender evaluated would use the wrong financial test.
Technical stage announces "Pass mark 70%" while the implemented gate is all-criteria-pass plus CPR ≥ 40
	TA 109 Stage 3: passing 70%, weightage 60 marks.
	The displayed pass mark is decorative.
Quotation reference RSAJ/KP/Q(S)/016/26
	The valid district codes are JB (Johor Bahru), MR (Muar) and IP (Ibu Pejabat). "(S)" is not one of them.
	Invalid reference format.
Bid opening secured by a single shared password hard-coded client-side and printed on screen
	SK002 7.7.2–7.7.3: the tender box is opened by the Tender Opening Committee of two appointed Ranhill SAJ Executive officers who take the key. A one-secret gate cannot enforce a two-person rule.
	The central control of the opening process is not implemented.
SebutHargaMatrix exposes a "Maximum Value Ceiling RM200,000.00"
	The quotation regime ceiling is RM300,000; observed practice disqualifies quotation bids above RM300,000 without evaluation. The RM200,000 parameter is never enforced at runtime in any case.
	Contradicts the regime ceiling.
Branding: letterhead "Digital Procurement Authority", internal emails @procurement.gov.my, footer "Procura"
	Ranhill SAJ Sdn Bhd, company number 199901001818 (476718-H).
	Indicates parts of the build were assembled from a template product rather than designed against RSAJ evidence.
3.6 Eight built screens are unreachable
The following components are defined and exported but never rendered by the router: the requisition list and create form; the purchase-order screen; the three-way matching screen; the payments screen; the vendor-performance screen; the version-one evaluation detail containing the only Tender Board voting interface in the build; and the vendor purchase-order, invoice and payment screens. They will read as delivered scope in a demonstration. Before this prototype is used as a scope baseline, each should be either wired or deleted.
4. Business context and process overview
4.1 The two owning departments
Ranhill SAJ procurement is run by two departments whose boundary is the single most important structural fact in this specification, because it determines which section head owns each step, each document and each change.
Department
	Sections
	Owns
	Governing manuals
Jabatan Kontrak & Perolehan (Contract & Procurement, C&P / K&P)
	Pre-Contract Section (Seksyen Pra Kontrak), headed by the Ketua Seksyen Pra Kontrak
	Tender and Tender Table Document preparation and display; the tender table at the K&P Department; invitation and advertisement; document sale and sale-time eligibility checks; custody of the tender box; Secretariat (Urusetia) of the Tender Board; joint evaluation with the Implementing Department at K&P; the Evaluation Report; issue and distribution of the Letter of Acceptance; disposal of unsuccessful tenderers' documents.
	OM/KP/SK/001, 002, 003
	Post-Contract Section (Seksyen Pos Kontrak), headed by the Ketua Seksyen Pos Kontrak
	Contract number allocation; contract document preparation, arithmetical correction and front-loading check; Group Legal Compliance routing; execution; LHDN stamping; controlled-copy distribution; custody of the performance bond and insurance policies; every post-award certificate; Secretariat for VO and EOT approval.
	OM/KP/SK/004 – OM/KP/SK/014
Jabatan Projek / Jabatan Pelaksana (Project / Implementing Department)
	—
	Technical demand ownership; completeness review; funding-source determination; project registration; site visit and data collection; Bill of Quantities, specification and drawings; project proposal and technical working paper; tender briefing; the ten-item selected-tender proposal; joint evaluation with K&P; the company estimate (anggaran syarikat); day-to-day supervision as the Superintending Officer's Representative; origination of variation and EOT applications; contractor performance evaluation.
	RSAJ/OM/P/001–010
Jabatan Akaun & Kewangan (Accounts & Finance)
	—
	Budget allocation and VOT verification; cost centre and account code; budget balance; effecting payment; confirming payments already made for the final certificate. Mandatory copy recipient of the Letter of Acceptance.
	DAL; OM/P series
The ownership boundary is the Letter of Acceptance. SK003 terminates at it with no onward step; SK004, owned by a different section, simply begins. There is no transmittal, no handover checklist, no file-transfer step and no named trigger event connecting them. The cleanest observable event on which to key the handover is the allocation of the contract number, which SK004 §7.2.1 requires "immediately" once the Letter of Acceptance is issued. Model it as a transfer of section ownership on the same case record, not as a new case.
4.2 Value bands
Three distinct and unrelated band families operate in Ranhill SAJ procurement. They must be three separate fields in the data model. Conflating them is the single most common error in the existing prototype.
4.2.1 Requisition approval bands — DAL §3.1.4.1, p.19
Cost band
	Approves
	Chain beneath
More than RM300K
	CEO
	MR by Functional Director; R by Head of Division; P by Head of Department
More than RM50K and up to RM300K
	Functional Director
	R by Head of Division; P by Head of Department
More than RM500 and up to RM50K
	Head of Division
	R by Head of Department
Up to RM500
	Head of Department
	—
RM500 is confirmed as five hundred ringgit, not RM500,000.
4.2.2 Procurement method bands — DAL §3.1.4.2 to §3.1.4.4
Value
	Regime
	Committee
	Approver of appointment
	Award instrument
Up to RM500
	Direct purchase
	None
	Head of Department
	PO / Indent
More than RM500 and up to RM5K
	Direct purchase
	None
	Head of Division
	PO / Indent
More than RM5K and up to RM15K
	Direct purchase / below quotation regime
	None
	Functional Director
	PO / Indent
More than RM15K and up to RM300K
	Quotation (sebut harga) — DAL §3.1.4.3 governs contract administration
	Quotation Committee — mandatory, non-delegable recommendation
	CEO
	Inden Kerja (IN+YYYY+NNNNN) then Pemberitahuan Perlantikan
More than RM300K
	Tender — DAL §3.1.4.4 governs contract administration
	Tender Board Committee
	Tender Board Committee (open and selective, no ceiling)
	Letter of Acceptance (Surat Setujuterima Tender) then Contract Document
Direct purchase more than RM300K and up to RM3M
	Direct appointment
	TBC approves
	TBC
	per method
Direct purchase more than RM3M and up to RM5M
	Direct appointment
	TBC = mandatory recommendation
	Chairman
	per method
Direct purchase more than RM5M
	Direct appointment
	TBC = mandatory recommendation
	Board of Directors
	per method
No Board or Chairman escalation exists for open or selective tender at any value. The Tender Board Committee is the ceiling however large the tender. Direct purchase, by contrast, escalates to the Chairman above RM3M and to the Board above RM5M. This asymmetry is unusual and Section 12 records it as an item to verify as intentional.
4.2.3 Contractual terms band — RM50,000, quotation route only
The quotation-route appointment-letter templates split at RM50,000. Above it the letter adds retention (Wang Tahanan) of 10% of the value of work executed, capped at 5% of the total contract price, and a six-month Defects Liability Period with a 25% on-cost charge; below it neither applies, and insurance duration differs. This RM50,000 is unrelated to the DAL's RM50,000 requisition boundary and unrelated to the RM50,000 fixed-asset write-off boundary. SK001–003 never mention it. The governing document — Syarat-syarat Sebutharga Untuk Kerja, whose clauses 10 (Retention), 13 (LAD) and 18 (DLP) are cited by number in every appointment letter — is not in the corpus and must be obtained.
4.3 Funding routes
Funding source is the master gate. Under two of the five routes Ranhill SAJ does not procure at all, and under a third an external body decides the procurement route. The prototype has no funding field of any kind.
ID
	Route
	Trigger
	What changes
	Source
F1
	Ranhill SAJ OPEX
	Approved application memo plus a Budget Code (Kod Bajet)
	Default in-house route. Project registered at the approved price; BQ prepared in-house; C&P calls the quotation or tender; RSAJ appoints.
	OM/P/002 8.1–8.12
F2
	Ranhill SAJ CAPEX
	Internal CAPEX allocation
	As F1, plus the CAPEX Committee alongside the Technical Committee. CAPEX exceeding the approved budget requires Board approval with mandatory CEO recommendation; a CAPEX budget transfer between divisions or departments requires the CEO.
	OM/P/004 8.4.2; DAL p.17
F3
	PAAB CAPEX
	Project inside the SPAN-approved Company Business Plan
	Exits the Ranhill SAJ procurement process. A mandatory external gate at the PAAB PEC. PAAB, not RSAJ, decides the route as Minor, Mini or Major Works. The authority instrument is a Project Execution Letter (PEL). The appointment letter may be issued by PAAB. Post-award, PAAB consent is required on variation orders affecting its assets, and PAAB is the paymaster for minor works.
	OM/P/001 8.1–8.5; OM/P/004 8.3; OM/P/010 8.2
F4
	Government — KKDW
	Rural water supply list approved by the Ministry
	Ranhill SAJ does not procure. KKDW appoints both the Consulting Engineer and the Contractor. RSAJ verifies eligibility (SPAN permit, CIDB CE 20), inspects, witnesses tests and accepts the asset.
	OM/P/003 8.1, 8.2, 8.7, 8.8
F5
	Government agency or developer own funding
	Application by letter
	Supervision only. The Planning Department issues an approval letter and approved plan with RSAJ conditions; the Consulting Engineer names its own contractor. No BQ, no tender, no award by RSAJ.
	OM/P/004 8.2, 8.5.1–8.5.15
DAL §1.4: for Government-funded projects, Government guidelines and directives SUPERSEDE the DAL where they differ. The approval engine must therefore accept an external rule set that overrides its own routing, keyed on the funding-source flag. No source in the corpus states which government guidelines apply or how they differ — Section 12 records this as an open question.
4.4 Sourcing methods
Method
	Malay name
	Value band
	Committee and approver
	Basis
Open tender
	Tender Terbuka
	> RM300K
	TBC approves
	SK002 7.4.1; DAL §3.1.4.2 item 2
Selected tender
	Tender Terpilih
	> RM300K
	CEO approves the name (R by FD, JR by Head of Div, MR/P by C&P); TBC approves the appointment
	SK002 7.3; DAL §3.1.4.4 item 4
Open quotation
	Sebutharga Terbuka
	> RM15K–RM300K
	CEO approves, MR by QC
	DAL §3.1.4.2 item 2
Selective quotation
	Sebutharga Terpilih
	> RM15K–RM300K
	FD approves the name (R Head of Div, JR/P Head of Dept by C&P); CEO approves the appointment, MR by QC
	DAL §3.1.4.3 item 4
Direct appointment
	Lantikan Terus
	any
	By value: Head of Dept ≤ RM500; Head of Div > RM500–RM5K; FD > RM5K–RM15K; CEO > RM15K–RM300K (MR by QC); TBC > RM300K–RM3M; Chairman > RM3M–RM5M (TBC = MR); BOD > RM5M (TBC = MR)
	DAL §3.1.4.2 item 1
Selective direct appointment
	Lantikan Terus Terpilih
	any
	As direct appointment
	ERP enum only — no SOP describes it
Specialist / sole source
	—
	repair works
	Technical Committee, not the QC. The specialist is called to site to scope the work itself.
	OM/P/005 8.5
Emergency works
	—
	any
	An inter-departmental coordination meeting fixes the scope and produces the BQ; approval by value under the direct-purchase row
	OM/P/005 8.6; DAL §3.1.4.2 item 1
Schedule of Rates / term contract
	Kontrak Tahunan / S.O.R
	any
	Called off by Indent with no fresh sourcing. Extension of the contract period: TBC in the tender band; FD with MR by QC in the quotation band.
	DAL §3.1.4.2 item 2, §3.1.4.3 item 9, §3.1.4.4 item 9
4.5 Contract types
The Work / Service / Supply classification drives at least twelve downstream behaviours. None of OM/KP/002, /003 or /004 defines its own contract type; the decision rule below is reverse-engineered from the operative clauses that actually differ, and must be signed off by C&P rather than presented as quoted policy.
Attribute
	WORK (KP002)
	SERVICE (KP003)
	SUPPLY (KP004)
Test
	Physical construction or installation measured by quantity, producing an asset that can be practically complete and can develop defects
	Performance of a service over a term; no asset handed over, no goods delivered; completion judged satisfactory at the end of the contract
	Physical goods, materials or stores delivered to Ranhill SAJ, priced per item, with no construction and no ongoing performance obligation
Process end-point (scope 2.1)
	Until issuance of the Statement of Final Account
	Until issuance of the Statement of Final Account
	Until release of the Performance Bond
Pricing basis
	Drawings and specifications, or BQ and specifications, per a standard method of measurement
	Identical text to Work — no service-specific basis stated
	Specifications plus Schedule of Stores/Prices
Contract administrator
	S.O. or Project Director
	S.O. or Project Director
	S.O. only — Project Director never appears in KP004
Start-of-work gate
	Performance bond and insurances mandatory before start
	Performance bond and insurances mandatory before start, plus site meetings if necessary
	No gate stated — supply begins soon after the LoA; the bond/insurance precondition is deleted
Completion instrument
	Certificate of Practical Completion plus handover
	Certificate of Practical Completion at the end of the contract
	Delivery certificate from the S.O.'s Representative for every delivery — no CPC in the narrative
Defects Liability Period
	Yes — 6, 12 or 24 months depending on the estimate and contract type
	No in the narrative; yes in the flowchart — direct conflict
	No in the narrative; yes in the flowchart — direct conflict
Nominated sub-contractors, PC and Provisional Sums
	Yes — nominate early so as not to cause delay
	No
	No
Advance payment
	Yes, with four cumulative preconditions: application, bank guarantee for the amount, duly signed and witnessed LoA returned, performance bond and requisite insurance policies
	Advance if any — no mechanics
	Advance if any — no mechanics
Interim payment
	Monthly; value of work executed plus materials or goods brought to site; two minimum values (first and subsequent) whose figures are not stated
	Monthly; value of work executed only; no minimum values; no certificate named
	No interval stated; claim pack is Local Order plus bills/invoices plus Delivery Order — a three-way match
Claims approval before the Final Account
	Tender Board (KP002 5.12.5)
	Jawatankuasa Tuntutan / Claims Committee (KP003 5.11.5)
	No Final Account clause at all, yet the flowchart terminates at Perakuan Muktamad
Mixed scope
	Not resolved by these manuals. Recommendation: classify by dominant value (more than 50% of estimated value) with a recorded C&P override.
4.6 The end-to-end lifecycle
Sixteen stages, from need to close. The instrument that ends each stage is what the portal must produce.
#
	Stage
	Owner
	Ends with
	Governing source
1
	Need identified; requisition raised and endorsed
	Requesting / Client Department
	Requisition Form (e.g. PEN/LRA/06-01) plus covering memo
	Practice
2
	Requisition registered in the ERP; budget checked; DAL approval chain run
	C&P registration; Finance; DAL approvers
	Expenditure Request Form with PROC<YYYY><NNNNNN> and NM/YYYY/NNNNN, approved
	DAL §3.1.4.1
3
	Funding route determined; project registered; technical or CAPEX committee approval
	Project Department; Technical & CAPEX Committee
	Funding-route decision; committee minutes
	OM/P/004 8.2; OM/P/001 8.3
4
	Site visit; BQ, specification and drawings prepared; Specification Setting Panel; company estimate prepared
	Project Department
	BQ, Penentu Kerja, drawings; CPD/DFA/SSP; anggaran syarikat in two copies, one SULIT
	SK001 7.3.4(g); SK003 7.2.2(b)
5
	Handover to C&P; triage; value gate; method, basis and open-versus-selected decision
	Project Department → C&P; CEO for selected tender
	CPD/DFA/PRE T-QUO endorsed — DATE (1) starts the internal clock
	OM/P/002 8.6; SK001 7.1.1; SK002 7.3
6
	Tender or quotation document assembled; Appendix to the Conditions of Contract completed; Tender Table Document displayed
	C&P Pre-Contract Section
	Tender Document and Dokumen Meja Tender; Approval for Tendering signed by the Head of C&P
	SK001 7.3; DAL §3.1.4.4 item 1
7
	Advertisement or letters of invitation; document sale; briefing and site visit; addenda
	C&P Pre-Contract Section
	Notice published in newspaper, on the K&P notice board and on the RSAJ website; documents sold and annotated; fees banked as hasil
	SK002 7.4, 7.5
8
	Bids received into the tender box by 2.30 p.m.; company estimate lodged
	Tenderers → C&P
	Sealed bids in the peti tender
	SK002 7.7.1
9
	Opening by the Tender or Quotation Opening Committee
	Opening Committee (two appointed Executive officers)
	Jadual Tawaran CPD/J.TAWARAN-02, signed, each bid numbered and initialled, estimate entered, late bids counted
	SK002 7.7.2–7.7.4
10
	Joint evaluation by the Implementing Department with K&P at K&P; clarification and negotiation if needed
	Project Department + C&P
	Evaluation Report (Laporan Penilaian) with negotiation minutes and written confirmations
	SK003 7.1.1, 7.2, 7.4, 7.5
11
	Committee recommendation and DAL approval
	QC → CEO, or Secretariat → Tender Board
	Signed committee decision; CPD/DFA/PRE T-QUO boxes 10–11 completed
	SK003 7.6, 7.7; DAL §3.1.4.2
12
	Award
	C&P Pre-Contract Section
	Letter of Acceptance with Surat Akuan Pembida Berjaya attached, distributed to five recipients — or Inden Kerja plus Pemberitahuan Perlantikan
	SK003 7.9, 7.10; DAL §3.1.4.3 items 14–15
13
	Contract formation
	C&P Post-Contract Section
	Contract number RSAJ/KP/T/<serial>/<year>; legal endorsement; performance bond and insurances lodged; contract signed — the Contract Date is the date the Ranhill SAJ officer signs; stamped at LHDN; controlled copies distributed
	SK004
14
	Supervision and execution
	S.O. and S.O.'s Representative
	Delegation letters A/1 and A/2 or B/1 and B/2; approved work programme; daily dual-signed site diary; Project In Delay flag below 70% of programme
	SK005
15
	Payment, variation, adjustment, time and default — the repeating and exception cycles
	S.O., S.O.'s Rep, C&P, VOC, CEO, TBC
	CPD/B.INT(T) · CPD/VO-660/661/662/663(T) · CPD/APP(T) · CPD/PPJHK(T) · CPD/EOT(T) · CPD/CNC(T) · termination notices and CPD/PMKD(T)
	SK006–SK013
16
	Completion and close
	S.O.; C&P; Accounts & Finance
	CPD/CPO · CPD/CPC(T) · Jadual Kecacatan · CPD/CMGD(T) releasing the bond and retention · statutory declaration · CPD/SFA(T) Perakuan Muktamad · CPD/SA-F0n performance report
	SK009, SK014
5. Roles, personas and permissions
This section defines every internal role, every committee and the single external persona that the portal must model, and states what each may do. It is the input to the Dataverse security model and to the approval engine's role-resolution rule.
A caveat that must be read before the matrix. Section 5.0 (Tanggungjawab) of every one of the fourteen SK Operation Manuals is a single sentence naming no role — and in all eleven post-contract manuals that sentence is wrong, reading "all officers involved in the Preparation of Tender Documents". There is no RACI anywhere in the Ranhill SAJ procurement corpus. Every role attribution below is drawn from the operative clauses of §7, from the flowchart TINDAKAN columns, from the DAL matrices and from the signature blocks printed on the live forms. The flowcharts are demonstrably less complete than the narratives and contradict them in several places. Where a role is inferred it is marked.
5.1 Internal roles
Role
	Malay / printed variants
	Lane
	What the role owns
	How the system resolves it
Requesting Officer
	Pegawai Pemohon
	Requesting / Client Department
	Raises the requisition with justification, cost centre, account code, place of delivery and required date.
	Named user, department attribute.
Section Head (requesting)
	Ketua Seksyen
	Requesting Department
	Endorses the requisition before the Head of Department.
	Named user; org hierarchy.
Head of Department
	Ketua Jabatan
	Requesting / Project / C&P
	DAL: approves requisitions up to RM500 and direct purchases up to RM500; proposes at every higher band. Signs the Invitation to Tender / Invitation to Quote (by C&P). Issues purchase orders and signs indents (by C&P). On the quotation route, signs the Pemberitahuan Perlantikan as Ketua Jabatan.
	Org hierarchy; DAL role mapping.
Head of Division
	Ketua Bahagian (HODiv)
	Any division
	DAL: approves requisitions above RM500 and up to RM50K; direct purchase above RM500 and up to RM5K; open/selective appointment up to RM5K; quotation-regime VO up to 20%; tender-regime VO up to 5% on contracts of RM300K–RM1M; interim payment up to RM100K; CMGD in the quotation regime; deeds of assignment (by Finance). Acts as Superintending Officer / Project Director for contracts above RM300K and up to RM1M, and for the whole quotation regime.
	Org hierarchy plus contract-value band.
Functional Director
	Pengarah Fungsian (FD)
	Directorate
	DAL: approves requisitions above RM50K and up to RM300K; direct purchase above RM5K and up to RM15K; approval of name for direct or selective quotation; quotation-regime VO above 20% and up to 50%; tender-regime VO up to 10% on RM1M–RM3M contracts and above 5% and up to 10% on RM300K–RM1M contracts; extension of contract period in the quotation regime (MR by QC); interim payment above RM100K and up to RM500K; Condition of Quotation and changes to it. Acts as SO/PD for contracts above RM1M and up to RM3M. Mandatory recommender on quotation-regime termination.
	Org hierarchy plus contract-value band.
Chief Executive Officer
	Ketua Pegawai Eksekutif (KPE / CEO)
	Executive
	DAL: approves requisitions above RM300K; appointment above RM15K and up to RM300K (MR by QC); approval of name for direct or selective tender; rental, leasing and hire purchase; advance payment with no value band; termination and arbitration in both regimes; waiver of LAD up to 30% of the LAD amount in the tender regime and at any amount in the quotation regime; interim payment above RM500K; VO at the CEO tier of the two-dimensional matrix; approval to increase a nominated sub-contract sum. Acts as SO/PD for contracts above RM3M. Out-of-court and conciliation settlement with no monetary band at all.
	Single named post.
Chairman
	Pengerusi (CM)
	Board
	DAL: approves direct purchase above RM3M and up to RM5M, with the Tender Board as mandatory recommender. Approves matters where the officer would otherwise approve their own expense.
	Single named post.
Board of Directors
	Lembaga Pengarah (BOD)
	Board
	DAL: approves direct purchase above RM5M (TBC = MR); CAPEX exceeding the approved budget (MR by CEO); additional OPEX budget (MR by CEO); changes to the delegated authority limits themselves.
	Body, not a user.
Superintending Officer / Project Director
	Pegawai Penguasa / Pengarah Projek (P.P.)
	Contract administration
	Every hard approval gate in the post-contract set: CPC, CPO, CMGD, CNC, EOT certificate, VO certificate, APP instruction, PPJHK, SFA and both termination notices. Sole authority to value a variation. Delegates supervision authority to Representatives.
	A role, not a post. Resolved by contract value: CEO above RM3M; FD above RM1M and up to RM3M; Head of Division above RM300K and up to RM1M; Head of Division throughout the quotation regime.
S.O.'s Representative — Principal
	Wakil P.P. Utama
	Project / Implementing Department
	Supervises the works as a whole; approves the work programme; maintains site records; flags Project In Delay; originates VO and EOT applications; prepares interim valuations; carries out contractor performance evaluation.
	Appointed by Letter of Delegation A/1 or B/1; scope recorded on the delegation.
S.O.'s Representative — Specialist
	Wakil P.P. Pakar
	Project Department (E&M, engineering)
	Specialist supervision. Must confirm availability of the allocation (peruntukan) and route variation applications through the Principal Representative. No sub-delegation. May not communicate with the contractor outside delegated scope.
	Appointed by delegation letter with scoped permissions.
S.O.'s Representative — Specialist Quantity Surveyor
	Wakil P.P. Pakar (Juruukur Bahan)
	Project Department
	Measurement and valuation. Signs the interim certificate as Recommending Officer.
	Appointed by delegation letter.
Recommending Officer
	Pegawai Pengesyor; Juruukur Bahan / Pegawai Pengesyor (B.INT); Pegawai Kontrak/Pengesyor (PMKD)
	C&P or Project Department
	Always the first signatory on every certificate, before the S.O. Three printed labels, probably one role played by different functions depending on contract type — confirm before merging.
	Certificate-level assignment.
Head of Pre-Contract Section
	Ketua Seksyen Pra Kontrak
	C&P
	Process owner of SK001, SK002 and SK003. Checks the committee proposal paper.
	Single named post.
Head of Post-Contract Section
	Ketua Seksyen Pos Kontrak
	C&P
	Process owner of SK004–SK014. Verifies every post-award certificate.
	Single named post.
Head of Contract & Procurement
	Ketua Kontrak & Perolehan
	C&P
	Triages the pre-tender pack; signs Approval for Tendering; recommends to the Tender Board and to the VO Committee; decides the number of tenderers shortlisted; joint Stage 5 evaluator with the implementing-department head.
	Single named post.
C&P Executive / Technician / Administrative Assistant
	Eksekutif K&P / Juruteknik K&P / Pembantu Pentadbiran K&P
	C&P
	Document assembly, certificate preparation, checking, stamp duty, distribution, forwarding to Finance.
	Named users.
Head of Accounts & Finance
	Ketua Akaun & Kewangan
	Accounts & Finance
	Budget verification; effecting payment; confirming payments already made for the final certificate. Mandatory copy recipient of the Letter of Acceptance and of every payment-affecting certificate.
	Single named post.
Group Legal Compliance
	—
	Legal
	Mandatory endorsement of the Conditions of Contract, the contractor-signed Letter of Acceptance and the BQ or Schedule of Rates before signing, with a rework loop.
	Group, not a post.
Quality Assurance Department
	Jabatan Jaminan Kualiti
	QA
	Second verification column on the Specification Setting Panel CPD/DFA/SSP.
	Group.
Document Control / Records
	—
	QA / C&P
	Form template register, revision control, retention and disposal.
	Group.
Internal Audit
	—
	Assurance
	Read-only access to every record and every audit trail; no transactional capability.
	Group.
System Administrator
	—
	IT
	Configures the DAL tables, committee registers, form templates, numbering series and integration settings. Must not be able to approve, certify or transact.
	Group.
5.2 Committees
Five committees plus one external body must be modelled as entities with membership, terms, quorum, meetings, agendas, individual votes and minutes. Their composition and quorum are, with two exceptions, not defined anywhere in the corpus — the DAL explicitly does not state composition or quorum for any committee, and SK001–003 name none of them except the Tender Board and the Tender Opening Committee. The portal must therefore supply the configuration surface, and RSAJ must supply the values.
Committee
	Mandate and source
	Composition stated?
	Quorum stated?
	Approves or recommends
	Value band
Tender Opening Committee (Jawatankuasa Pembuka Tender)
	Opens the tender box on the closing day, lists offers in the Jadual Tawaran in opening order, numbers and initials each tender, enters the department estimate, signs. SK002 7.7.2–7.7.4; DAL §3.1.4.4 item 2.
	Yes — exactly two (2) appointed Ranhill SAJ Executive officers. Appointment mechanics are deferred to OM/KP/SP/002, which is not in the corpus. No independence requirement is stated, although in observed practice the two officers came from Accounts & Finance and Group IT, i.e. deliberately from outside C&P.
	No
	Approves the Tender Opening / Schedule of Tender
	> RM300K, no ceiling
Quotation Opening Committee
	Opens quotations and signs the schedule of quotations. DAL §3.1.4.3 item 2 only.
	No — nowhere defined
	No
	Approves the Quotation Opening / Schedule of Quotation
	> RM15K–RM300K
Quotation Committee (QC) (Jawatankuasa Sebutharga)
	Gives a mandatory, non-delegable recommendation (MR) on: direct-purchase appointment above RM15K and up to RM300K; open and selective appointment above RM15K and up to RM300K; and extension of contract period for term contracts in the quotation band. DAL §3.1.4.2 items 1–2, §3.1.4.3 item 9.
	Observed only, from the evaluation template APPROVAL sheet: a Chairman, a Deputy Chairman and two member rows, each with alternates separated by "/" — model as a role with an eligible-member pool, not fixed individuals.
	No
	Recommends (MR). The CEO approves. Each member signs SETUJU or TIDAK SETUJU with a date.
	> RM15K–RM300K
Tender Board Committee (TBC) (Lembaga Tender)
	Established by the Board of Directors "to approve Tenders, Extension of the Contract Period for term contracts, Delay and Extension of Times and Variation of Works" (DAL p.12). Also holds the exclusive power to decide whether a late tender may be opened and evaluated (SK003 7.2.1(a)).
	No — "as set out in the DAL and the TOR"; the TOR is not in the corpus and the DAL does not state composition. Observed: five members chaired by a Director, with the CEO, COO, CFO and Head of Quality Management Division as members.
	Yes — three (3) members (SK003 7.6.2). The only stated quorum in the entire pre-award corpus.
	Approves; mandatory recommender to the Chairman and the Board for large direct purchases
	> RM300K, no ceiling for open and selective tender
Variation Orders Committee (VOC) (Jawatankuasa Perubahan Kerja)
	Mandatory, non-delegable recommendation on every VO row and every Delay-and-EOT row in the tender regime, and on VO above 20% in the quotation regime. DAL §§3.1.4.3, 3.1.4.4.
	Observed: KP002 flowchart 6.3 names a Chairman of COO and CFO with members HDiv P&D, P&M, QM and F&C. The PAAB consent form prints a 9-member committee — Chairman (COO), Deputy Chairman (CFO) and Heads of Production & M&E, Planning & Development, Network & NRW, Customer Management, Finance & Contract, Business Support and Quality Management. Names are hard-coded on the template.
	No
	Recommends (MR), and under SK006 §7.6.1 as amended approves EOT with no financial impact — which conflicts with the DAL. See decision D2.
	Post-award, both regimes
Technical Committee (TC) (Jawatankuasa Teknikal)
	Decides the First Stage (technical) Evaluation for Design & Build and Turnkey tenders — design, materials, structural, mechanical and electrical. SK003 7.3(a). Also approves specialist and sole-source repair methods (OM/P/005 8.5).
	No — composition, quorum, appointment authority, chair, output document and decision rule are all unstated. It does not appear on the SK003 flowchart at all.
	No
	Decides Stage 1 for D&B/Turnkey
	None stated
Technical & CAPEX Committee
	Approves technical working papers and project proposals; sets scope for emergency works. OM/P/001 8.3; OM/P/004 8.4.2.
	No
	No
	Approves — a committee gate that sits outside every DAL matrix
	None stated
Jawatankuasa Tuntutan (Claims Committee)
	Approves contractor loss and expense claims before the Final Account on Service contracts (KP003 5.11.5). On Work contracts the same gate sits with the Tender Board (KP002 5.12.5); KP004 has no clause at all.
	No — the committee appears in no other document in the corpus
	No
	Approves
	Service contracts
PAAB VO Committee (external)
	Consents to variation orders affecting PAAB-funded assets, on form CPD/VO(CONSENT)-PAAB, decided AGREE or DISAGREE.
	Yes — 9 named members printed on the template
	No
	Consents — a precondition, not a Ranhill SAJ approval
	PAAB-funded projects
5.3 The vendor persona
The Operation Manuals do not contemplate vendor self-service at all. Across SK001, SK002 and SK003 the process is paper, a counter, a tender box, a tender-box key, a notice board, registered post, a shredding machine and one-way website publication. The website is a publication channel only — nothing is received through it. No SOP clause authorises electronic submission, electronic opening or electronic signature, and SK002 7.7.1–7.7.4 positively mandate a physical box, a physical key and a physically initialled schedule. Every requirement in module 6.15, and the electronic-submission and electronic-opening requirements in 6.6 and 6.7, are therefore [NET-NEW] and unsourced. They are almost certainly the right thing to build — but they require an amendment to SK002 §7.7 as a programme deliverable, not as an afterthought, and they require a written policy decision from the Head of Contract & Procurement before build.
Persona
	Who they are
	What they need to do
	Source
Vendor — prospective registrant
	A Malaysian company, sole proprietorship or partnership seeking to trade with Ranhill SAJ. Registered with SSM or the Registrar of Businesses, and holding CIDB registration for works or MOF registration with the relevant Kod Bidang for supplies and services.
	Register; lodge the statutory document set; declare Bumiputera status; complete the E-Payment / Creditor's Profile; accept the false-declaration and blacklisting acknowledgement; track application status.
	[NET-NEW]. Eligibility content from SK001 7.3.4(a).
Vendor — registered supplier or contractor
	An approved vendor with a maintained document set and a current CIDB grade, category and specialisation or MOF field code.
	Maintain documents and respond to expiry reminders; browse and filter open exercises; check eligibility; purchase tender documents; register attendance at the briefing and site visit; acknowledge addenda; prepare and submit a sealed bid before 2.30 p.m.; withdraw before the deadline; respond in writing to clarifications; receive the award or non-award outcome.
	[NET-NEW] for every self-service action. The underlying obligations are sourced.
Vendor — appointed contractor
	The successful tenderer or quotation winner, now a party to a contract.
	Return the signed Letter of Acceptance with the Surat Akuan Pembida Berjaya and Surat Pewakilan Kuasa; lodge the performance bond and insurance policies; produce the company resolution before signing; submit the work programme; sign the daily site diary; submit interim claims and materials-on-site lists; sign or dispute variation and adjustment certificates; give written notice of delay causes; respond to the LAD warning within 7 days; object to a nomination within 14 days; submit as-built drawings; rectify defects; submit the statutory declaration; accept the final account with the no-further-claims declaration.
	SK004–SK014 impose all of these on the contractor. None of them is currently a system interaction.
Nominated sub-contractor or nominated supplier
	A party nominated by the S.O. against a Prime Cost Sum, contracted to the main contractor, not to Ranhill SAJ.
	Receive the notification of nomination; return the Letter of Indemnity; furnish a performance bond of 5% of the sub-contract price to the contractor; be paid directly by Ranhill SAJ where the direct-payment mechanism was set up at tender-document stage; object to a set-off within 28 days.
	SK010. [NET-NEW] as a portal persona.
Assignee
	A financier holding a deed of assignment over money due to the contractor.
	Submit a claim or invoice before the agreed valuation date; receive payment in the waterfall ahead of the contractor and behind nominated parties.
	SK011 §7.2.3(l), (o). [NET-NEW] as a portal persona.
5.4 Permissions matrix — role × capability
C = may create or originate. R = may recommend, endorse or support. A = may approve or decide. V = may view. X = may certify, i.e. sign a certificate as the certifying officer. A dash means no capability. Where a capability is conditional on a value band or a contract band, the condition is stated in the Conditions column and is enforced by the approval engine, not by the static role.
Role / body
	Create
	Recommend
	Approve
	View
	Certify
	Conditions and notes
Requesting Officer
	C
	—
	—
	V (own department)
	—
	Requisitions, clarification responses. No approval capability at any value.
Section Head (requesting)
	C
	R
	—
	V (own section)
	—
	Endorses the requisition.
Head of Department
	C
	R
	A
	V (own department)
	—
	Approves requisitions ≤ RM500 and direct purchase ≤ RM500. Signs Invitation to Tender/Quote, purchase orders and indents (by C&P). Proposes at all higher bands.
Head of Division
	C
	R
	A
	V (own division)
	X
	Requisition > RM500–RM50K; direct purchase > RM500–RM5K; open/selective ≤ RM5K; quotation VO ≤ 20%; tender VO ≤ 5% on RM300K–RM1M contracts; interim payment ≤ RM100K; CMGD (quotation); deeds of assignment by Finance. Certifies as SO/PD for contracts > RM300K–RM1M and throughout the quotation regime.
Functional Director
	C
	R (MR where the DAL says so)
	A
	V (directorate)
	X
	Requisition > RM50K–RM300K; direct purchase > RM5K–RM15K; name for direct/selective quotation; quotation VO > 20%–50%; tender VO ≤ 10% (RM1M–RM3M) and > 5%–10% (RM300K–RM1M); term-contract extension in the quotation regime (MR by QC); interim payment > RM100K–RM500K. Certifies as SO/PD for contracts > RM1M–RM3M. Mandatory recommender on quotation-regime termination.
Chief Executive Officer
	C
	R (MR to Chairman/BOD)
	A
	V (all)
	X
	Requisition > RM300K; appointment > RM15K–RM300K after QC recommendation; name for direct/selective tender; advance payment, unlimited; termination in both regimes; LAD waiver ≤ 30% (tender) and any amount (quotation); interim payment > RM500K; the CEO tier of the VO matrix; increase of a nominated sub-contract sum; out-of-court settlement, unlimited. Certifies as SO/PD for contracts > RM3M.
Chairman
	—
	R
	A
	V (all)
	—
	Direct purchase > RM3M–RM5M with TBC as mandatory recommender. Approves matters the CEO or a Board member would otherwise approve for themselves.
Board of Directors
	—
	—
	A
	V (all)
	—
	Direct purchase > RM5M (TBC = MR); CAPEX above approved budget (MR by CEO); additional OPEX budget (MR by CEO); amendment of the DAL itself.
Superintending Officer / Project Director
	C
	R
	A
	V (own contracts)
	X
	Every post-award certificate: APP, VO-663, PPJHK, B.INT, EOT, CNC, CPO, CPC, CMGD, SFA, PMKD and both termination notices. Sole authority to value a variation — those who may instruct a variation may not approve its value. The role resolves by contract value.
S.O.'s Representative — Principal
	C
	R
	— (except the work programme)
	V (own contracts)
	—
	Approves the work programme (SK005 §7.4.2(b)). Prepares valuations and certificates for the S.O. No sub-delegation. May not communicate with the contractor outside delegated scope.
S.O.'s Representative — Specialist / QS
	C
	R
	—
	V (delegated scope)
	—
	Must confirm availability of the allocation and route variation applications through the Principal Representative.
Recommending Officer
	—
	R
	—
	V (own certificates)
	—
	First signatory on every certificate, before the S.O.
Head of Pre-Contract Section
	C
	R
	—
	V (pre-award, all)
	—
	Process owner SK001–003. Checks the committee proposal paper.
Head of Post-Contract Section
	C
	R
	—
	V (post-award, all)
	—
	Process owner SK004–014. Verifies every post-award certificate.
Head of Contract & Procurement
	C
	R
	A (Approval for Tendering)
	V (all procurement)
	—
	Triage of the pre-tender pack; Approval for Tendering; recommendation to the Tender Board and the VO Committee; number shortlisted; joint Stage 5 evaluator.
C&P Executive / Technician / Admin Assistant
	C
	—
	—
	V (assigned cases)
	—
	Document assembly, certificate preparation, checking, distribution. No approval capability of any kind.
Head of Accounts & Finance
	—
	R
	—
	V (financial)
	—
	Budget verification; confirmation of payments already made for the final certificate. Mandatory copy recipient.
Group Legal Compliance
	—
	R (blocking)
	—
	V (contracts)
	—
	Endorsement of the Conditions of Contract, signed LoA and BQ or Schedule of Rates is a mandatory pre-condition to signing, with a rework loop.
Quality Assurance
	—
	R
	—
	V (specifications)
	—
	Second verification column on CPD/DFA/SSP.
Tender Opening Committee
	—
	—
	A (the opening and the schedule)
	V (sealed metadata only until opening)
	—
	Two appointed Executive officers acting together. Two-person control: neither member may unseal alone.
Quotation Opening Committee
	—
	—
	A (the opening and the schedule)
	V (sealed metadata only until opening)
	—
	As above; composition to be configured by RSAJ.
Quotation Committee
	—
	MR — mandatory, non-delegable
	—
	V (quotation exercises)
	—
	Every appointment above RM15K and up to RM300K. Individual SETUJU / TIDAK SETUJU votes with dates.
Tender Board Committee
	—
	R (MR to Chairman and BOD)
	A
	V (tender exercises)
	—
	Quorum three. Also the sole authority on whether a late tender may be opened and evaluated.
Variation Orders Committee
	—
	MR — mandatory, non-delegable
	A (disputed — see decision D2)
	V (variations, EOT)
	—
	Every VO row and every EOT row in the tender regime.
Technical Committee
	—
	R
	A (D&B Stage 1)
	V (technical)
	—
	Decides Stage 1 technical for Design & Build and Turnkey; approves specialist repair methods.
Technical & CAPEX Committee
	—
	R
	A
	V (projects)
	—
	Approves technical working papers and project proposals. Sits outside every DAL matrix.
Internal Audit
	—
	—
	—
	V (everything, including audit trails)
	—
	Read-only by design. Must not be grantable any transactional capability.
System Administrator
	C (configuration only)
	—
	—
	V (configuration and logs)
	—
	Must not be able to approve, recommend, certify or transact. Configuration changes are themselves subject to a maker-checker approval and are audit-logged.
Vendor — registrant
	C (own application)
	—
	—
	V (own record)
	—
	[NET-NEW]
Vendor — registered
	C (own bid)
	—
	—
	V (published exercises, own bids)
	—
	[NET-NEW]. Must never see another vendor's bid, price, score or identity.
Vendor — appointed contractor
	C (claims, notices, programmes, site-diary counter-signature)
	—
	—
	V (own contract)
	— (signs as a party, not as a certifier)
	[NET-NEW] as portal interactions; the obligations themselves are sourced to SK004–SK014.
Nominated sub-contractor / supplier
	C (objection, indemnity return)
	—
	—
	V (own sub-contract lines)
	—
	[NET-NEW]
Assignee
	C (claim or invoice)
	—
	—
	V (own assigned amounts)
	—
	[NET-NEW]
5.5 Standing rules the permissions model must enforce
These come from the DAL's application rules (§1.5, §1.6, p.42) and are not negotiable. They are requirements in their own right — see FR-APR-012 to FR-APR-018.
No one may approve their own expenses or allocations. The CEO escalates to the Chairman; other Board members to the Chairman; a Functional Director to the CEO; a Head of Division to the Functional Director; a Head of Department to the Head of Division.
Conflict of interest requires recusal and escalation one level up.
Where there is no clear approving authority, escalate to the immediate superior of the approving authority.
Delegation must be in writing, time- or task-specific, only to line subordinates, with no sub-delegation, and granted by the jobholder's superior — not by the jobholder.
Items coded MA, MR or MJR are never delegable.
On absence, authority reverts upward to the delegator, who may re-delegate only on the absent holder's recommendation. Authority does not pass down automatically. The Authority Manual prevails over any delegation letter.
Approval always carries the full chain beneath it. Where the approving authority is the CEO, the chain is Head of Department proposes, Head of Division proposes or jointly proposes, Functional Director recommends, CEO approves. Where it is the Functional Director: Head of Department proposes, Head of Division recommends, Functional Director approves. Where it is the Head of Division: Head of Department recommends, Head of Division approves. Where it is the Head of Department: Head of Department approves.
Segregation of duties in contract administration: those empowered to issue an instruction requiring a variation do not have authority to approve the value of that variation. The same principle is applied in this specification to payment values.
6. Functional requirements
This section is the core of the specification. It is organised by module. Each module opens with a statement of what it does, how the process runs today and what the prototype covers, followed by the requirement table. Requirement statements are written in testable "The system shall…" form; acceptance criteria state the objective test.
Priority codes: M Must · S Should · C Could · W Won't. Source citations follow the convention in Section 1.6. Every RM figure and percentage is reproduced verbatim from its source.
6.1 Requisition and intake, funding route determination, budget check
The process starts either with an Expenditure Request Form (RF) received by the Pre-Contract Section, or with a management approval based on the DAL (SK001 7.1.1). In practice the requisition is registered in the incumbent Oracle-based ERP, which mints PROC<YYYY><NNNNNN> and NM/YYYY/NNNNN, runs a budget check against a five-segment cost centre and a seven-digit account code, and drives a bespoke workflow whose states are REQUEST NOTE, REGISTRATION, DAL RECOMMENDER 1, DAL RECOMMENDER 2, DAL RECOMMENDER 3 and DAL APPROVAL. In parallel, a project-works demand may arrive from a client department as a letter with an anggaran harga, and is routed by funding source under the OM/P series.
The prototype has a requisition screen with a simulated budget check and a hard-coded four-step routing array, and it is unreachable — no navigation route renders it. It has no funding-source field of any kind, and PROC appears nowhere in the codebase.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-REQ-001
	The system shall provide a Requisition record capturing, at minimum: requesting department, section, requesting officer, title, justification and need statement, cost centre, account code, place of delivery, date required, estimated value, and one or more line items.
	M
	SK001 6.2, 7.1.1; PEN/LRA/06-01
	A requisition cannot be submitted with any of these fields empty. Cost centre validates against the five-segment pattern (e.g. 1.16.04.06.009); account code validates as seven digits (e.g. 6100599).
	The prototype captures a subset and omits account code and place of delivery. Cost centre must be a lookup, not free text.
FR-REQ-002
	The system shall accept and store the ERP requisition number PROC<YYYY><NNNNNN> and the requisition note number NM/YYYY/NNNNN against every Requisition, and shall use PROC… as the primary business key linking every downstream sourcing event, evaluation, award decision, contract and certificate.
	M
	PRETENDER-artifacts §5.1, §6.1
	Every sourcing exercise, award and contract record resolves to exactly one PROC…. A search on a PROC… value returns the complete case history end to end.
	PROC… is an ERP document identifier and must be consumed, not generated. The counter is global and does not reset at the year boundary (PROC2025150424 → PROC2026154676). NM/YYYY/NNNNN does reset annually.
FR-REQ-003
	The system shall record the endorsement chain requesting officer → section head → Head of Department on every requisition before it is submitted for DAL approval.
	M
	PEN/LRA/06-01; practice
	A requisition cannot enter the DAL routing chain until both endorsements are recorded with named user and timestamp.
	The prototype has no endorsement chain.
FR-REQ-004
	The system shall require a Funding Source to be selected on every requisition from the closed list F1 Ranhill SAJ OPEX, F2 Ranhill SAJ CAPEX, F3 PAAB CAPEX, F4 Government KKDW, F5 Government agency or developer own funding.
	M
	OM/P/004 8.2; MODEL Axis A
	The requisition cannot be submitted without a funding source. The value is immutable after DAL approval except by a controlled change with a recorded reason.
	Absent from the prototype entirely. This is the master gate: four of the five routes change or eliminate Ranhill SAJ's role.
FR-REQ-005
	The system shall route requisitions by funding source: F1 and F2 to the standard in-house sourcing spine; F3 to the PAAB gate requiring a Project Execution Letter before any RSAJ sourcing activity; and F4 and F5 to a supervision-only path with no RSAJ sourcing, evaluation or award.
	M
	OM/P/001 8.1–8.5; OM/P/003 8.1–8.8; OM/P/004 8.2, 8.3, 8.5
	Selecting F4 or F5 disables the tender and quotation modules for that case and enables only eligibility verification, inspection, test witnessing and asset acceptance. Selecting F3 blocks progress until a PEL reference is recorded.
	Under F4 KKDW appoints both the consulting engineer and the contractor. Under F3 PAAB decides the route as Minor, Mini or Major Works per PAAB/SOP/TCD/15, /16, /17 — thresholds not in the corpus.
FR-REQ-006
	The system shall set a Government-Funded flag where the funding source is F3, F4 or F5, and shall allow that flag to override the DAL routing with an alternative, separately configured rule set.
	M
	DAL §1.4
	With the flag set and an override rule set configured, the engine applies the override and records on the approval trail that the DAL was superseded, citing DAL §1.4.
	No source states which government guidelines apply or how they differ — Section 12 open question OQ-06. Build the override mechanism; leave the rule set empty until RSAJ supplies it.
FR-REQ-007
	The system shall perform a budget availability check against the cost centre and account code, returning and storing Actual Budget, Balance as at date, Approved Account and Projected Balance, and shall record the check result and timestamp on the requisition.
	M
	RANHILL SAJ EXPENDITURE REQUEST FORM §2; DAL pp.17, 36
	The stored check shows the four values and the "as at" date. A requisition submitted more than a configurable number of days after its last check is re-checked automatically.
	Sourced from the ERP. The prototype simulates a 1.2-second call with no real values.
FR-REQ-008
	The system shall block submission where the budget check returns insufficient funds, unless an over-budget route is invoked, and shall then route CAPEX exceeding the approved budget to the Board of Directors with a mandatory CEO recommendation, and additional OPEX budget to the Board of Directors with a mandatory CEO recommendation.
	M
	DAL pp.17, 36
	An over-budget CAPEX requisition cannot be approved by anyone below the Board. The approval trail shows CEO as MR and BOD as A.
	A CAPEX budget transfer between divisions or departments is CEO-approved; an OPEX budget transfer is CEO-approved.
FR-REQ-009
	The system shall route every requisition for approval strictly by the DAL requisition bands: more than RM300,000 to the CEO with mandatory recommendation by the Functional Director, recommendation by the Head of Division and proposal by the Head of Department; more than RM50,000 and up to RM300,000 to the Functional Director with recommendation by the Head of Division and proposal by the Head of Department; more than RM500 and up to RM50,000 to the Head of Division with recommendation by the Head of Department; and up to RM500 to the Head of Department.
	M
	DAL §3.1.4.1 p.19
	For an estimated value of RM49,999 the chain is Head of Department (R) → Head of Division (A). For RM300,001 the chain is Head of Department (P) → Head of Division (R) → Functional Director (MR) → CEO (A). No other chain can be produced at those values.
	RM500 is five hundred ringgit, verified at zoom. The prototype hard-codes HOD Procurement → CFO Review → CEO Approval; CFO is not a DAL requisition role at any band.
FR-REQ-010
	The system shall provide a project-works intake path accepting an application letter from a client department with an attached price estimate (anggaran harga), and shall apply a completeness review gate that returns an incomplete pack to the requesting department with recorded comments.
	M
	OM/P/002 8.1, 8.2
	An incomplete application cannot progress; the return is recorded with reason, recipient and date.
	Absent from the prototype: the setup wizard accepts only an approved requisition.
FR-REQ-011
	The system shall register the project in the financial system of record at the approved price and store the returned project master reference on the case.
	S
	OM/P/002 8.3
	The project reference is present on the case before BQ preparation begins.
	OM/P/002 §8.3 names an "Intergrated Financial System (IFS)"; every artefact says Oracle. Unresolved — decision D5. Build as an integration point with a configurable target.
FR-REQ-012
	The system shall route project proposals and technical working papers to the Technical & CAPEX Committee for a decision recorded as one of Perlu, Tidak Perlu or Tidak lulus, and shall loop a Tidak lulus outcome back to proposal preparation.
	M
	OM/P/001 8.3; OM/P/004 8.4.2
	The three outcomes are selectable, the loop-back is enforced, and committee minutes are attached to the decision.
	For F2 CAPEX the CAPEX Committee sits alongside the Technical Committee. This committee gate sits outside every DAL matrix.
FR-REQ-013
	The system shall support an emergency intake path recording the emergency trigger, the inter-departmental coordination meeting that fixes the scope, and the resulting BQ, and shall route the appointment by value under the DAL direct-purchase row.
	M
	OM/P/005 8.6; DAL §3.1.4.2 item 1
	An emergency case carries a coordination-meeting record and a scope document, and its approval routes by value, not by a fixed post-approval rule.
	The prototype's "HOD post-approval within 48h" is invented and has no DAL basis. Emergency is a justification for direct purchase, not a separate authority regime.
FR-REQ-014
	The system shall support a specialist self-scoping path in which the specialist contractor scopes the work on site and the scope is tabled to the Technical Committee rather than to the Quotation Committee.
	S
	OM/P/005 8.5
	A case flagged specialist routes its scope approval to the Technical Committee and records the sole-source justification.
	Applies to proprietary material and repair work, for example FRP tanks offered back to the manufacturer.
FR-REQ-015
	The system shall record an anti-splitting check on every requisition, comparing the requested scope, requesting department and required date against other requisitions raised within a configurable window, and shall require an explicit override justification where a potential split is detected.
	M
	[ASSUMPTION]
	Two requisitions from the same department for related scope within the window raise a flag that must be cleared with a recorded justification before approval.
	No anti-splitting rule exists anywhere in the DAL or any SOP. A procurement portal without a splitting control is an audit finding on day one. Threshold and window must be set by RSAJ — Section 12 blocker B7.
FR-REQ-016
	The system shall not permit a commitment — a purchase order, indent, letter of acceptance or contract — to be issued against a requisition that has not completed its DAL approval chain.
	M
	[ASSUMPTION]
	Attempting to generate an award instrument against an unapproved requisition is refused with a message naming the outstanding approval step.
	No explicit "approval must precede commitment" clause exists in the DAL. SK012 §7.2.2(c) positively permits variation work to commence on S.O. support before formal approval — that exception is handled separately at FR-VAR-014 and does not extend to award.
6.2 Scope, Bill of Quantities and estimate; company estimate confidentiality
The Bill of Quantities is customarily prepared by the Implementing Department (kebiasaannya disediakan oleh Jabatan pelaksana), in Microsoft Excel, on an eleven-field pipework schema, against a rate schedule issued by C&P and maintained by hand. The company estimate (anggaran syarikat) is the single most tightly governed artefact in the pre-award process and is the benchmark against which price reasonableness is judged.
The prototype has no BQ authoring, no provisional-quantity flag and no Specification Setting Panel. The company estimate is a hard-coded literal of 4,200,000 inside the evaluation module.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-EST-001
	The system shall provide Bill of Quantities authoring with line items carrying description, unit, quantity, rate and amount, structured on the pipework schema where applicable: length; excavation underground and under road; pipe diameter, type and count; S-bend works; anchor blocks; road reinstatement to JKR specification; fittings and specials; valve chambers; pressure and leak testing; tapping; and connection to existing.
	S
	OM/P/005 8.4, 8.7
	A BQ can be authored, versioned and exported. Line totals and the BQ total are computed, not keyed.
	Import from Excel must be supported for the transition period — BQs are prepared in MS Excel today.
FR-EST-002
	The system shall require every BQ line whose quantity cannot be determined at preparation to be flagged provisional, and shall carry that flag forward so that provisional quantities are subject to re-measurement after completion.
	M
	OM/P/005 3.4; SK013
	A provisional line is visibly distinguished, is excluded from the firm contract value calculation where the contract so provides, and appears on the re-measurement worklist at completion.
	Re-measurement of provisional quantities above 30% of contract value routes to the Tender Board (DAL §3.1.4.4 item 8a) — the flag is what makes that computable.
FR-EST-003
	The system shall record that the BQ follows the Standard Method of Measurement of Building Works published by the Institution of Surveyors Malaysia, shall require any departure from it to be stated in the BQ, and shall require the preparer to be recorded as a trained and qualified person.
	M
	SK001 7.3.4(g)(iii), (iv), (v)
	A BQ cannot be finalised without a named preparer holding the qualified-preparer attribute, and any departure is captured as text on the BQ header.
	SK001 warns that any ambiguity, contradiction or error in the BQ "will lead to difficult financial problems".
FR-EST-004
	The system shall maintain a versioned rate schedule (Anggaran Kadar Harga Terkini Dan Bahan-Bahan Paip) issued by C&P, and shall allow BQ lines to draw rates from the current version with the version recorded on the line.
	S
	OM/P/005 5.2
	A BQ line sourced from the rate schedule shows the schedule version and effective date. Superseding the schedule does not retrospectively change priced BQs.
	Currently issued and maintained manually.
FR-EST-005
	The system shall provide a Specification Setting Panel record (CPD/DFA/SSP) capturing Type of Contract from the list Works, Maintenance Works, Service, Supply or Please Specify; Status of Project from New Development, Replacement, Continuous, Maintenance or Please Specify; the current and revised specification revision number and date; and a three-column verification by the originating department, the Quality Assurance Department and the Contract & Procurement Department, supporting up to six signatories.
	M
	CPD/DFA/SSP; MODEL §11 item 20
	All three verification columns must be signed before the pack can be handed to C&P. The panel certifies that the estimate for the total contract sum and the completion period is as attached.
	[PRACTICE] — SK001 prescribes no vetting, review, panel or legal-review step of any kind. This form is the nearest thing to a document-assurance control that exists, and it has no SOP basis. Recommend codifying it into SK001.
FR-EST-006
	The system shall hold the company estimate (anggaran syarikat) as a distinct record on the sourcing exercise, separate from the BQ and from any bid, with its own value, preparer, preparation date and classification.
	M
	SK003 7.2.2(b); SK002 7.7.1
	The company estimate exists as a first-class record and can be reported on independently of the BQ.
	In the prototype it is a hard-coded literal in the evaluation component and is never an input.
FR-EST-007
	The system shall enforce that the company estimate is prepared by one officer only, is ready no later than one (1) week before the date set for submission of tenders, and exists in exactly two controlled copies — one lodged before closing and one retained.
	M
	SK003 7.2.2(b)
	A second preparer cannot edit the estimate. The system refuses to open bids where the estimate was created or amended later than one week before the submission date, and records the exception if overridden.
	The one-week rule is the only preparation SLA in the pre-award corpus.
FR-EST-008
	The system shall classify the retained copy of the company estimate as SULIT (Confidential) and restrict visibility to the preparing officer and the responsible office until the bids have been opened.
	M
	SK002 7.7.1; SK003 7.2.1(e)
	No user outside the named custody list can retrieve the estimate value before the opening is finalised. Every access attempt, successful or refused, is logged.
	Four things are expressly SULIT: selected-tender information, the department estimate submitted with the RF, the retained company estimate and all evaluation information.
FR-EST-009
	The system shall prevent any amendment to the company estimate after the closing date and time, and shall record any pre-closing amendment with the previous value, the new value, the user and the reason.
	M
	SK003 7.2.2(b)
	Post-closing edit is refused. Pre-closing edits produce an immutable version history visible to Internal Audit.
	The SOP rule is that the estimate "must not be altered to suit the tendered prices". The version history is what makes that auditable.
FR-EST-010
	The system shall place the company estimate into the sealed bid set at closing so that it is disclosed simultaneously with the bids and is entered into the Jadual Tawaran as a benchmark row.
	M
	SK002 7.7.1, 7.7.4
	On finalising the opening, the estimate appears on the Jadual Tawaran as the ANGGARAN SYARIKAT row alongside the listed offers.
	This is the digital equivalent of placing the estimate in the tender box.
6.3 Method selection, value-band determination and contract-type classification
Three orthogonal axes govern every exercise: funding source, sourcing method and contract type. The value gate determines the regime. The prototype has one threshold at RM300,000, no sourcing-method enum and a contract-type field that no code reads.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-MTD-001
	The system shall hold three distinct and independently configurable value-band families on every case: the Requisition Approval Band, the Procurement Method Band and the Contract Terms Band, and shall not conflate them.
	M
	DAL §3.1.4.1 vs §3.1.4.2–.4; appointment-letter templates
	Setting a value of RM60,000 produces requisition band "> RM50K–RM300K → Functional Director", method band "> RM15K–RM300K → quotation regime" and terms band "> RM50,000 → retention and DLP apply" simultaneously and independently.
	RM50,000 has three unrelated meanings in this corpus: a requisition-approval boundary, a fixed-asset write-off boundary, and a quotation contractual-terms boundary. The prototype has one threshold.
FR-MTD-002
	The system shall determine the procurement method band from the estimated value using the boundaries RM500, RM5,000, RM15,000 and RM300,000, and shall present the resulting regime, committee and approver to the officer before the exercise is created.
	M
	DAL §3.1.4.2 items 1–2; §3.1.4.3 and §3.1.4.4 headings
	At RM14,999 the system states "below the quotation regime — appointment by value, no committee". At RM15,001 it states "quotation regime — Quotation Committee mandatory recommendation, CEO approves". At RM300,001 it states "tender regime — Tender Board approves".
	The RM15,000 boundary is the actual start of the quotation regime and is entirely absent from the prototype, so everything below RM300,000 collapses into one bucket including sub-RM500 items.
FR-MTD-003
	The system shall implement the operator at the RM300,000 boundary as a single configuration value settable to strictly-greater-than or greater-than-or-equal, applied consistently everywhere the boundary is evaluated, and shall record which operator is in force on every case.
	M
	SK001 3.1 and 7.1.1 (melebihi) vs SK001 flowchart box 2 (≥); KP004 5.1.1; OM/P/005 3.1
	Changing the configuration value changes the classification of a case valued at exactly RM300,000.00 and of nothing else. Every case shows the operator that was applied.
	Decision D3 — blocker. Four sources give three answers. Interim position: apply > (the narrative, which appears in three manuals) and log the exception, pending a written ruling.
FR-MTD-004
	The system shall require selection of a Sourcing Method on every exercise from the closed list: open tender; selected tender; open quotation; selective quotation; direct appointment (lantikan terus); selective direct appointment (lantikan terus terpilih); specialist or sole source; emergency works; and Schedule of Rates or term-contract call-off.
	M
	DAL §3.1.4.2; SK002 7.3, 7.4.1; OM/P/005 8.5–8.6
	The exercise cannot be created without a sourcing method. The method drives document composition, invitation channel, committee and DAL row.
	DATA.tenders[].classification in the prototype holds only "Full Tender" or "Doc Session", neither of which is a sourcing method.
FR-MTD-005
	The system shall treat open tender as the default sourcing method above RM300,000 and shall permit selected tender only where a justification of skilled-worker expertise is recorded.
	M
	SK002 7.3.1
	Choosing selected tender requires a justification and opens the ten-item proposal (FR-MTD-006). Open tender requires no justification.
FR-MTD-006
	The system shall capture the ten-item selected-tender proposal: (a) description or title of the work; (b) estimated cost; (c) grades of contractor eligible and the registration field code required; (d) justification for proposing a selected tender; (e) list of contractors proposed; (f) background of those contractors; (g) scope of work; (h) work completion period; (i) budget provision; and (j) the benefit obtained as compared with the open tender method.
	M
	SK002 7.3.2(a)–(j)
	All ten items must be present before the proposal can be submitted to C&P for review, and the proposal cannot be sent to the CEO with any item empty.
	C&P reviews, comments and adjusts before making the application to the CEO.
FR-MTD-007
	The system shall classify all information relating to a selected tender as SULIT and restrict access to the named participants.
	M
	SK002 7.3.4
	Users outside the named list cannot see the exercise, the proposed contractor list or the CEO application. Access attempts are logged.
	The stated reason is collusion risk (pakatan).
FR-MTD-008
	The system shall route approval of the name for a direct or selective tender to the CEO, with recommendation by the Functional Director, joint recommendation by the Head of Division and mandatory recommendation and proposal by Contract & Procurement; and approval of the name for a direct or selective quotation to the Functional Director, with recommendation by the Head of Division and joint recommendation and proposal by the Head of Department through Contract & Procurement.
	M
	DAL §3.1.4.4 item 4; §3.1.4.3 item 4
	A selected tender cannot proceed to invitation until the CEO has approved the name. A selective quotation cannot proceed until the Functional Director has approved the name.
	Two different authorities for the same conceptual act at two different bands. Both are absent from the prototype.
FR-MTD-009
	The system shall support a direct-appointment justification dossier capturing the reason code, supporting evidence (for example an original-equipment-manufacturer sole-distributor letter, a SPAN approval, or a past-performance score) and shall allocate a reference in the series RSAJ/KP/ST/NN/YY.
	S
	DAL §3.1.4.2 item 1; observed RSAJ/KP/ST/27/26
	A direct appointment cannot be approved without a reason code and at least one evidence attachment. The reference is auto-allocated and unique.
	Observed reason codes include Alasan : VENDOR SEDIADA. No SOP describes direct appointment at all — it exists only in the DAL and in practice.
FR-MTD-010
	The system shall support Schedule of Rates and term contracts as a sourcing method in which work is called off by Indent against an existing contract with no fresh sourcing exercise, and shall track cumulative call-off value against the contract.
	S
	DAL §3.1.4.2 item 2; SK012 3.1; observed S.O.R TANGKI, BANGUNAN & LOJI 2026-2027
	A call-off creates an Indent linked to the parent term contract and increments its cumulative value. The parent contract's remaining capacity is visible.
	No series in the corpus documents how term contracts are procured, although SK012 3.1 confirms they exist.
FR-MTD-011
	The system shall require a Contract Type of Work, Service or Supply on every exercise, shall derive a default from the deliverable test and shall permit a Contract & Procurement override with a recorded reason.
	M
	KP002/003/004 5.1.2, 5.5, 5.9, 5.10
	The contract type is set before document assembly and cannot be changed after award without a controlled change. The default is Supply for goods delivered, Work for measured construction and Service for term performance.
	None of the three manuals defines its own contract type. The decision rule is reverse-engineered from the clauses that differ, and must be signed off by C&P rather than presented as policy. For mixed scope, classify by dominant value above 50% with a recorded override.
FR-MTD-012
	The system shall apply the contract type to at least the following downstream behaviours: pricing basis; registration eligibility test; contract administrator (S.O. or S.O.-or-P.D.); start-of-work gate; extension-of-time instrument; completion instrument; existence and length of the Defects Liability Period; Certificate of Making Good Defects; availability of nominated sub-contractors and Prime Cost Sums; interim payment rule; contract-sum adjustment drivers; and the body that approves claims before the final account.
	M
	KP002/003/004 §5
	Changing the contract type on a draft exercise visibly changes each of the twelve behaviours. A Supply contract offers no DLP and no nomination; a Work contract offers both.
	DATA.tenders[].type in the prototype holds free text that no code reads.
FR-MTD-013
	The system shall require a Contract Basis of Bills of Quantities or Drawings and Specification, and shall use it to select both the document composition and the standard contract form.
	M
	SK001 3.1(a),(b), 7.3.1(a),(b)
	Selecting BQ basis produces the 7.3.1(a) composition; selecting Drawings and Specification produces the corrected 7.3.4 composition including the Summary of Tender and the Schedule of Rates.
	A third axis, orthogonal to contract type. See FR-DOC-002.
FR-MTD-014
	The system shall maintain a mapping table between the canonical contract type and each of the four other taxonomies present in the corpus, and shall derive the correct value in each taxonomy rather than asking the user again.
	M
	MODEL §3.2.3
	Setting the canonical type once populates the CPD/DFA/SSP type, the SK001 basis, the SK003 evaluation type and the performance-report category without further input.
	Five incompatible taxonomies exist. The portal needs one canonical type with an explicit mapping, not a choice among them.
6.4 Tender and quotation document preparation and assembly
SK001 7.3.1 gives the authoritative constituent list in printed order, in two variants, with drafting notes for each part at 7.3.4. The reconciled bill of materials has twelve entries. The list as printed contains two defects: the Drawings-and-Specification variant wrongly includes a Bill of Quantities, and the Schedule of Rates appears in neither list despite being mandated three times in 7.3.4. 7.3.4 is the operative text.
The prototype offers three mandatory files and three supporting uploads.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-DOC-001
	The system shall assemble the Tender Document from the twelve reconciled constituent parts in printed order: (1) Letter of Invitation to Tender or Notice of Offer; (2) Form of Tender; (3) Articles of Agreement and Conditions of Contract with the twin Appendices; (4) Letter of Acceptance of Tender bound in as a specimen; (5) Bank Guarantee or Insurance form for the Performance Bond; (6) Specification; (7a) Bills of Quantities or (7b) Summary of Tender plus Schedule of Rates; (8) Tenderer's Registration Background Form; (9) Bidder's Declaration Letter with Letter of Authorisation; (10) Drawings; and (11) Instructions to Tenderers.
	M
	SK001 7.3.1(a),(b); 7.3.4(a)–(k)
	A tender document cannot be issued with a mandatory part missing. The assembled pack prints in the specified order. Part 7 resolves by contract basis.
	Instructions to Tenderers is referenced by 7.3.4(a) but omitted from both composition lists — it is a de facto constituent part and is included here.
FR-DOC-002
	The system shall select the document composition and the standard contract form from the contract basis: Bills of Quantities basis takes composition 7.3.1(a) and form JKR 203A or the Ranhill SAJ Standard Form of Contract to Be Used Bills of Quantities Form Part of The Contract; Drawings and Specification basis takes the 7.3.4-corrected composition and form JKR 203 or the Ranhill SAJ Standard Form of Contract to Be Used Where Drawings And Specification Form Part of The Contract.
	M
	SK001 3.1(a),(b); 7.3.1; SK004 §3.2
	Selecting a basis produces the correct composition and the correct form name without further input.
	SK001 3.1 covers contracts executed before 25 January 2011 and on and after 01 January 2021. Contracts executed between 25.01.2011 and 31.12.2020 are covered by neither. Do not model a date-driven form-selection rule until confirmed — Section 12 OQ-09.
FR-DOC-003
	The system shall maintain a clause and template library distinguishing standard instruments — Articles of Agreement and Conditions of Contract, Form of Tender, Letter of Acceptance, Standard General Specification (Spesifikasi AM Piawai) and Standard Schedule of Rates (Jadual Kadarharga Piawai) — from instruments that must be prepared specifically for each contract: Bills of Quantities, Addenda Specification and Drawings.
	M
	SK001 7.3.4 preamble
	Standard instruments are drawn from the library by version. Bespoke instruments must be authored or uploaded per exercise and cannot be drawn from the library.
	The live library today is the Windows share P:\27.CONTRACT & PROCUREMENT\5.FORMS\.
FR-DOC-004
	The system shall provide a data-entry form for the Appendix to the Conditions of Contract capturing, per contract: the officer empowered to act for Ranhill SAJ on damages for non-completion, delay and extension of time, termination, war or earthquake, and arbitration; the officer or committee empowered for variation works and their approval limits; work covered by Prime Cost Sums in which the contractor may tender; minimum insurance amounts for third-party liability and workmen's compensation, the uplift to the Contract Price for works insurance and the permitted excess; the LAD rate; the parts of the Works subject to sectional completion and their sectional LAD rates; the Defects Liability Period duration; the minimum value of work before the first and subsequent Interim Certificates; and the period for honouring interim certificates.
	M
	SK001 7.3.4(b)
	The Appendix cannot be left incomplete when the document is issued. Every value entered here becomes the contract baseline and is read by the post-award modules.
	No numeric default is given for any of these. They are per-contract entries and they are the source of nine of the twelve values that Section 8 records as undefined in the sources. This form is the single most important data-capture screen in the pre-award module.
FR-DOC-005
	The system shall populate the Notice of Offer or Letter of Invitation with the full eligibility code: lawful registration with SSM, the Registrar of Businesses or an equivalent body; valid CIDB registration with the grade, category and specialisation appropriate to the scope for works, or MOF registration with the relevant Kod Bidang for supplies and services, or a valid SPKK where required; and shall state that the registration must be active and still valid from the tender advertisement date through to the tender closing date.
	M
	SK001 7.3.4(a)
	The notice cannot be published without the eligibility block populated. The validity window is expressed as a date range, not as a point-in-time check.
	This clause was rewritten on 02.01.2026 in direct response to the SPAN audit of October 2025. It is the newest and most externally scrutinised text in the corpus.
FR-DOC-006
	The system shall state in the Instructions to Tenderers that the successful bidder is required to obtain the relevant SPAN Permit Type B, C, D and/or E subject to the type of tender and tender value, in line with Section 50 of the Water Services Industry Act 2006 (Act 655) and the Water Services Industry (Permit) Regulations 2007 and (Amendment) 2021, and shall record the specific IPA permit type required.
	M
	SK001 7.3.4(a)
	The SPAN permit clause appears on every works tender document with the required permit type named.
	SK001 does not give the value bands that map to permit types B, C, D and E — that mapping lives in SPAN's regulations and must be obtained. Note also the unresolved question at Section 12 OQ-04 of whether SPAN is a pre-bid eligibility requirement (KP002 5.2.1, TA 109) or a post-award obligation (SK001).
FR-DOC-007
	The system shall bind the bank guarantee and/or insurance forms for the Performance Bond into both the Tender Document and the Tender Table Document, so that the tenderer sees the guarantee terms that will be approved by Ranhill SAJ in advance.
	M
	SK001 7.3.4(f)(i)
	Both document sets contain the bond form. Removing it blocks issue.
	SK001 7.3.4(f)(ii) states a CAPEX band at RM1 million whose two sides are substantively identical and is therefore inoperative. Do not encode it — decision D4.
FR-DOC-008
	The system shall bind the Bidder's Declaration Letter (Surat Akuan Pembida) into every tender and quotation document as a mandatory document, and shall require the signing representative to attach a Letter of Authorisation (Surat Pewakilan Kuasa).
	M
	SK001 7.3.4(j)(i),(ii),(iii)
	A bid without a signed Bidder's Declaration and Letter of Authorisation fails the mandatory check at opening.
	This is Integrity Pact Stage One, executed when the tenderer submits the document.
FR-DOC-009
	The system shall stamp both the Tender Document and the Tender Table Document clearly and legibly with the words TENDER UNTUK BUMIPUTERA SAHAJA where the tender is restricted to Bumiputera contractors, and shall record the restriction on the exercise so that it is enforced at document sale and at bid submission.
	M
	SK001 7.3.2; SK002 7.5.1(b),(c)
	A Bumiputera-restricted exercise carries the stamp on every generated document and rejects a purchase attempt by a vendor without valid Bumiputera status.
	The prototype captures Bumiputera status on the vendor and never uses it as a tender restriction.
FR-DOC-010
	The system shall produce and publish a Tender Table Document (Dokumen Meja Tender) containing the Conditions of Contract, Form of Tender, Specification, Bills of Quantities and Drawings, and shall make it available for inspection throughout the tender period.
	M
	SK001 7.1.2, 7.3.3
	The Tender Table Document is available from the publication date to the closing date and is withdrawn thereafter. An inspection log records who viewed it.
	The physical requirement is display at the tender table at the K&P Department, Ranhill SAJ. Digital availability supplements rather than replaces it until SK001 is amended.
FR-DOC-011
	The system shall include the Anti-Corruption Clause in Government Procurement in every agreement.
	M
	SK004 §7.3.4
	The clause is present in every generated agreement and cannot be removed without a legal-endorsement override.
	The prototype has only an ISO 37001 declaration checkbox on the vendor bid form.
FR-DOC-012
	The system shall route the completed document set for Approval for Tendering by the Head of Contract & Procurement, recording DATE START and CLOSING DATE, and shall not permit advertisement or invitation before that approval is recorded.
	M
	DAL §3.1.4.4 item 1; CPD/DFA/PRE T-QUO boxes 4–5
	Advertisement is blocked until the Approval for Tendering signature and date are present.
	[PRACTICE] for the form; the DAL row for the authority. SK001 has no approval gate before advertisement. The internal cycle-time target on the form is Document Preparation 1–2 weeks.
FR-DOC-013
	The system shall assemble the nine-part quotation document separately from the tender document: Kenyataan Sebutharga; Corrigendum; Arahan kepada Penender; Syarat-syarat Sebutharga Untuk Kerja; Penentu Kerja; Borang Sebutharga; Bill of Quantities; Latar Belakang Penender; and Lukisan.
	M
	OM/P/005 §3.2
	A quotation exercise produces the nine-part pack, not the tender pack.
	The prototype shares one document step between tender and quotation. Note that Syarat-syarat Sebutharga Untuk Kerja — whose clauses 10, 13 and 18 are cited by number in every appointment letter — is not in the corpus and must be obtained.
FR-DOC-014
	The system shall carry a document-assurance gate requiring the tender document to be confirmed free from ambiguity and contradiction, and requiring cross-discipline coordination of drawings to be confirmed, each by a named officer with a date.
	S
	SK001 7.2.1(c), 7.3.4(k)(iii)
	The document cannot be issued until both confirmations are recorded against a named user.
	SK001 states both requirements and assigns no actor, no sign-off and no checklist. The Legal department is never mentioned in any of the three pre-award manuals. The Specification Setting Panel (FR-EST-005) is the nearest live control.
6.5 Advertisement, invitation, document sale, briefing and addenda
SK002 7.4 to 7.6 governs this phase. It is the most rule-dense part of the pre-award process and the part where the prototype most often approximates rather than implements. There is one very large hole: no corrigendum, addendum or errata procedure exists anywhere in SK001, SK002 or SK003, and there is consequently no documented way to make a clarification binding on all tenderers.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-ADV-001
	For an open tender the system shall require publication through all three mandatory channels — the newspaper (akhbar), the K&P Department notice board (papan kenyataan Jabatan K&P) and the Ranhill SAJ website (laman sesawang Ranhill SAJ) — and shall record the date of each.
	M
	SK002 7.4.1
	An open tender cannot be marked advertised until all three channels carry a recorded publication date. Omitting any one blocks progress.
	All three are mandatory. The prototype offers portal listing, corporate website feed, email blast and Telegram; newspaper and notice board are absent and Telegram is invented. KP 5.2.2 mentions only a newspaper — build to SK002.
FR-ADV-002
	For a selected tender the system shall issue letters of invitation (surat-surat pelawaan) to the approved contractor list only, and shall not publish the exercise on any public channel.
	M
	SK002 7.4.1, 7.3.4
	A selected tender does not appear in the public listing and generates one addressed invitation letter per approved contractor.
FR-ADV-003
	The system shall populate the tender notice with all seven mandatory content items: (a) the grades of contractor invited and the registration field code required, grade determined by the estimated cost of the work and field code by the principal work included; (b) the place where the Tender Table Document may be inspected and the Tender Document purchased; (c) the date and time allowed for inspection and purchase; (d) the Tender Document fee and payment method; (e) the date, time and place of the site visit; (f) the date, time and place of the Tender Briefing session; and (g) the place, date and time set for submission.
	M
	SK002 7.4.2(a)–(g)
	The notice cannot be published with any of (a) to (d) or (g) empty. Items (e) and (f) are optional but, if present, require date, time and place together.
	Items (e) and (f) are qualified jika berkenaan — if applicable.
FR-ADV-004
	The system shall enforce a minimum of two (2) weeks between the tender advertisement date and the closing date, and shall warn where the closing date is close to the expected newspaper publication date.
	M
	SK002 7.4.2(g)
	A closing date fewer than 14 days after the advertisement date is refused with a message citing SK002 7.4.2(g).
	The prototype has no date validation of any kind. The CPD/DFA/PRE T-QUO internal target is 3 weeks; model 2 weeks as the hard floor and 3 weeks as the target.
FR-ADV-005
	The system shall refuse a closing date that falls on a public holiday or a weekend, validating against a maintained Malaysian and Johor public-holiday calendar.
	M
	SK002 7.4.2(g)
	Selecting a Saturday, Sunday or gazetted public holiday as the closing date is refused. The calendar is maintainable without a code change.
FR-ADV-006
	The system shall set the time for receipt of tenders and quotations at 2.30 p.m. by default and shall apply it to tenders as well as quotations.
	M
	SK002 7.4.2(g)
	A new exercise defaults to 14:30 closing regardless of regime. Any deviation requires an override with a recorded reason.
	The prototype applies 2.30 p.m. only to quotations and 5.00 p.m. to tenders. SK002 fixes 14:30 for tenders too.
FR-ADV-007
	The system shall enforce that the last date on which contractors may obtain the Tender Document is set at least two (2) days before the tender closing date.
	M
	SK002 7.4.2(c)
	A purchase-close date fewer than 2 days before the closing date is refused.
	The prototype has the field but does not enforce the constraint.
FR-ADV-008
	The system shall compute and record the document fee from its cost basis — A4, A3, A1 and A0 paper as the document requires, copying, binding including the folding of drawings, and other administrative costs — and shall enforce a minimum of RM250.00 per Tender Document set and RM50.00 per quotation document.
	M
	SK002 7.4.2(d)
	A tender fee below RM250.00 or a quotation fee below RM50.00 is refused. The cost basis is stored and reportable.
	The prototype hard-codes RM 30.00 for quotations in the review summary — below the RM50 floor — and contradicts the RM300 default set two steps earlier. Observed compliant practice for TA 109 is RM350.00 per set.
FR-ADV-009
	The system shall record all document-fee payments as revenue (hasil) and shall reconcile the receipt register to the finance system.
	M
	SK002 7.5.3
	Every sale produces a receipt with a unique number, and the register reconciles to the finance ledger.
	The prototype describes the treatment as "auto-reconciled to D365 F&O AR" rather than as hasil at the payment counter — confirm the accounting treatment with Finance.
FR-ADV-010
	Before issuing or selling a Tender Document the system shall verify that the purchaser's representative holds proof of authority to receive it; that, for a Bumiputera-restricted tender, the original or a certified true copy of the Bumiputera status certificate has been shown; and that the Bumiputera status is still valid, the contractor's registration has not been cancelled and the contractor is not suspended from entering any tender.
	M
	SK002 7.5.1(a),(b),(c)
	A purchase attempt by a suspended vendor, a vendor with cancelled registration, or a vendor without valid Bumiputera status on a restricted tender is refused with the reason recorded.
	SK002 states the checks but not the consequence of failing them — the refusal is [ASSUMPTION]. The prototype has a suspension list that is not wired into the purchase path.
FR-ADV-011
	The system shall annotate every issued Tender Document with the purchaser's name, address, telephone or fax number and the date set for receipt of the tender, and shall record the issuing officer against it.
	M
	SK002 7.5.2
	Each issued copy carries the annotation and is traceable to an issuing officer.
	The SOP prescribes no purchaser register at all — only the annotation. The prototype's receipt register is better than the SOP and should be retained; see FR-ADV-012.
FR-ADV-012
	The system shall maintain a register of document purchasers per exercise, recording vendor, receipt number, amount, payment method and date, and shall use that register as the notification list for addenda and for any change to the exercise.
	S
	[NET-NEW]; prototype documentSales
	The register lists every purchaser and drives addendum notification. Notification success and failure are logged per recipient.
	Improvement on the SOP. Confirm as policy.
FR-ADV-013
	The system shall record the site visit and tender briefing as scheduled events with date, time, venue and an attendance register, and shall allow an exercise to designate attendance as mandatory and to gate the right to purchase the Tender Document on confirmed attendance.
	M
	SK002 7.4.2(e),(f) vs TA 109 advertisement
	Where attendance is designated mandatory, a vendor who is not on the attendance register cannot purchase the document. Where it is optional, purchase is unrestricted. The attendance register is exportable as Lampiran E of the evaluation report.
	Conflict. SK002 makes both events optional, prescribes no attendance register and attaches no consequence to non-attendance. TA 109's advertisement makes both mandatory and gates document purchase on attendance. Practice imposes an eliminatory condition the SOP does not authorise. Build the switch; RSAJ must amend SK002 or keep the condition in each tender's own notice. Section 12 OQ-03.
FR-ADV-014
	The system shall support the issue of a corrigendum or addendum during the invitation window, allocating a sequential reference, recording what changed, attaching the signed document, and notifying every recorded purchaser with delivery confirmation.
	M
	[NET-NEW] — SK002 by exhaustion; OM/P/005 3.2 item 2; TA 109 Table 2 item 8
	An addendum is numbered, dated, attached and notified to 100% of the purchaser register, with per-recipient delivery status. The addendum appears in the bid pack and in the mandatory-document checklist at opening.
	No corrigendum, addendum or errata procedure exists anywhere in SK001, SK002 or SK003, and there is no procedure to extend a closing date after advertisement, cancel an advertised tender, or notify purchasers of a change. This is the single largest process gap in the invitation phase. The prototype has designed one and it should be adopted — as a policy change, with an SOP amendment.
FR-ADV-015
	The system shall support extension of the closing date after advertisement, recording the reason, the approving authority and the notification of every purchaser, and shall re-validate the two-week and two-day rules against the new date.
	M
	[NET-NEW]
	An extension re-runs the date validations and notifies all purchasers. The original and revised dates are both retained.
	No procedure exists. Required for operability; requires a policy decision on who may authorise it.
FR-ADV-016
	The system shall support cancellation of an advertised exercise, recording the reason, the approving authority and the notification of every purchaser, and shall record whether document fees are refunded.
	M
	[NET-NEW]
	A cancelled exercise moves to a terminal Cancelled state, notifies all purchasers and cannot be revived; a replacement exercise is a new case linked to the cancelled one.
	No cancellation, reject-all-tenders or re-advertisement outcome is drawn or narrated anywhere. The only Tender Board "no" outcome in SK003 is a loop. A workflow engine cannot have a state with no exit — Section 12 blocker B4.
FR-ADV-017
	The system shall support an application for special permission to tender by a contractor lacking the required grade or field code, available only where the tender notice provides for it, and shall record the granting authority as Ranhill SAJ officers empowered under the DAL, and/or SPAN, and/or CIDB, together with confirmation that the contractor has confirmed registration in an existing class and a good experience record.
	S
	SK002 7.6.1, 7.6.2
	The application is available only on exercises flagged as permitting it, requires both conditions to be confirmed, and records which of the three authorities granted it.
	The DAL has no line item for special permission to tender, although SK002 delegates to it. No form, no deadline and no application format exist. Section 12 OQ-07.
6.6 Bid submission and receipt
Today a bid is a sealed envelope marked with the tender title, number and closing date, delivered by hand into the peti tender at the K&P Department before 2.30 p.m. The Implementing Department's estimate goes into the same box. No SOP clause authorises electronic submission, so every requirement in this module that replaces the physical box is [NET-NEW] and depends on an amendment to SK002 §7.7.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-BID-001
	The system shall provide an electronic tender box that accepts a vendor's bid as a sealed submission, encrypting the bid content at rest such that no user — including a system administrator — can read any price, document or identity attribute before the opening is authorised by the Opening Committee.
	M
	[NET-NEW] — digital equivalent of SK002 7.7.1
	Before opening, a privileged database query returns ciphertext, not values. Every attempt to access sealed content is logged and alerted. After authorised opening, content is readable to authorised users only.
	Requires an amendment to SK002 §7.7, which mandates a physical box, a physical key and a physically initialled schedule. This is the control that replaces the tender-box key and it must be at least as strong.
FR-BID-002
	The system shall record the exact server-side submission timestamp of every bid to the second, shall determine lateness solely against the exercise closing date and time of 2.30 p.m., and shall not rely on any client-supplied time.
	M
	SK002 7.4.2(g), 7.7.1
	A bid submitted at 14:30:01 on the closing date is recorded as late. Changing the client clock has no effect on the recorded time.
FR-BID-003
	The system shall accept a late bid, mark it Late, segregate it from the evaluated set, count it, and forward it to the Tender Board together with the tender documents, the tender report and the recommendation. The system shall not permit any officer to reject a late tender.
	M
	SK003 7.2.1(a), 7.7.1
	A late bid cannot be deleted, cannot be evaluated and cannot be rejected by any user. It appears in the Tender Board bundle and in the Bil. Tawaran Yang Lewat Diterima count on the Jadual Tawaran. Only a recorded Tender Board decision can admit or exclude it.
	This is the single most consequential correction to the prototype. "Late submissions are automatically rejected by Power Pages" is contrary to SK003: the authority as to whether a late tender may be opened and evaluated lies with the Tender Board alone. Note the live conflict with quotation practice, which rejects late bids at Fasa 1 — Section 12 OQ-02.
FR-BID-004
	The system shall permit a vendor to withdraw a submitted bid before the closing date and time, recording the withdrawal with a timestamp, and shall permit a fresh submission thereafter until closing.
	S
	[NET-NEW]; SK003 7.2.1(b) by implication
	A withdrawn bid is retained in the audit record as withdrawn and is not presented for opening. A resubmission is a new sealed bid with a new timestamp.
	Must be reconciled with SK003 7.2.1(b): a tenderer may not amend or add to its tender after submission. Withdrawal-and-resubmit before closing is consistent with that; amendment in place is not.
FR-BID-005
	The system shall prevent any amendment or addition to a bid after submission, including by the submitting vendor and by any internal user.
	M
	SK003 7.2.1(b)
	No edit path exists on a submitted bid. Any attempt is refused and logged.
FR-BID-006
	The system shall accept alternative bids only where the Tender Document permits them, shall record each alternative as a separate bid for evaluation, and shall not present an unrequested alternative for evaluation.
	M
	SK003 7.2.1(c)
	On an exercise not permitting alternatives, an alternative submission is recorded but marked Not Considered. On one that permits them, each alternative is evaluated as a separate tender.
	Absent from the prototype.
FR-BID-007
	The system shall validate at submission that the mandatory documents for the exercise are present, and shall present the vendor with a completeness checklist, but shall not reject a bid on completeness grounds.
	M
	SK003 7.2.2(a)
	A vendor is warned about missing mandatory documents but may still submit. The completeness result is carried into the evaluation record.
	SK003 7.2.2(a): an incomplete tender is NOT automatically rejected — the deficiency must be reported to the Tender Board, which decides. This contrasts with eligibility failure, which SK001 7.3.4(a) makes an automatic rejection.
FR-BID-008
	The system shall reject a bid outright, without liability to Ranhill SAJ, where the tenderer fails the eligibility conditions, and shall record the specific condition failed.
	M
	SK001 7.3.4(a)
	A vendor whose CIDB or MOF registration is not active and valid across the whole advertisement-to-closing window cannot submit, and the refusal names the failed condition.
	The sanction is quoted: "Any failure to comply with these eligibility conditions will cause the Tenderer's offer to be REJECTED without any liability to Ranhill SAJ."
FR-BID-009
	The system shall record a bid validity period per exercise, shall compute the validity expiry date from the closing date, and shall alert the exercise owner at configurable intervals before expiry.
	M
	SK003 7.8.1; TA 109 (120 days) and quotation practice (90 days)
	The expiry date is computed and displayed. Alerts fire at the configured intervals. The exercise cannot be awarded after expiry without a recorded extension.
	The SOP sets no default, minimum or maximum validity period — the clock is per-tender. Observed practice is 120 days for a tender and 90 days for a quotation.
FR-BID-010
	The system shall support extension of the validity period where extension is unavoidable, requiring and recording the written consent of the recommended tenderer only.
	M
	SK003 7.8.3
	An extension cannot be recorded without an attached consent from the recommended tenderer. Consent from other tenderers is not required and is not requested.
	Absent from the prototype.
FR-BID-011
	The system shall record the number of bids received, and shall permit an exercise to proceed to opening where fewer than a configurable minimum number of bids has been received, flagging the exception for the committee.
	S
	[ASSUMPTION]
	A single-bid exercise proceeds with a visible single-bid flag on the opening record and in the committee bundle.
	No rule exists. SK001–003 set no minimum number of tenders for an opening to proceed or an award to be valid, and no rule for the single-tender case or for an empty box. Section 12 blocker B7.
6.7 Bid opening
SK002 7.7.2 to 7.7.4 is precise about this step and the prototype is materially wrong about it. The committee is exactly two appointed Ranhill SAJ Executive officers; in observed practice they come from outside C&P (Accounts & Finance and Group IT), although the SOP does not require it. The prototype shows three members chaired by the Head of Procurement — inside C&P — and replaces the two-person key control with a single shared password hard-coded client-side and printed on the screen.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-OPN-001
	The system shall model the Tender Opening Committee and the Quotation Opening Committee as configurable committees with named members, appointment records, effective dates and per-exercise assignment.
	M
	SK002 7.7.2; DAL §3.1.4.3 item 2, §3.1.4.4 item 2
	An opening cannot begin until a committee with the configured membership has been assigned to the exercise and its members have recorded attendance.
	The prototype hard-codes a three-person card with all members marked Present. Composition of the Quotation Opening Committee is defined nowhere and must be supplied by RSAJ.
FR-OPN-002
	The system shall default the Tender Opening Committee to exactly two (2) appointed Ranhill SAJ Executive officers, and shall permit that number to be configured only by a controlled change with a recorded authority.
	M
	SK002 7.7.2
	Assigning fewer or more than two members raises a configuration exception requiring an override with recorded authority.
	Appointment mechanics are deferred to OM/KP/SP/002 pages 1–5, which is not in the corpus — Section 12 blocker B5.
FR-OPN-003
	The system shall implement dual control on unsealing: the bid set shall become readable only when both assigned Opening Committee members have independently authenticated and authorised the opening within the same session, and no single credential shall be capable of unsealing.
	M
	[NET-NEW] — digital equivalent of SK002 7.7.3 (two members take the key)
	Unsealing with one member's credential is refused. The audit record shows two distinct authenticated identities, two timestamps and the resulting unseal event.
	Replaces the physical tender-box key. The prototype's single shared password printed on screen cannot enforce a two-person rule.
FR-OPN-004
	The system shall prevent the opening from being performed before the closing date and time.
	M
	SK002 7.7.3
	An unseal attempt before closing is refused, whatever the credentials.
FR-OPN-005
	The system shall generate the Jadual Tawaran listing, in the order in which the bids were opened, each tenderer's name, registration class, status, tender price and work completion period, together with the department estimate as a benchmark row, and shall assign each bid a sequential number in listing order.
	M
	SK002 7.7.4; CPD/J.TAWARAN-02 Rev. 01.07.2024
	The generated schedule reproduces the printed form including Tarikh Mula and Tutup Pelawaan, Bil. Pentender Dipelawa, Bil. Tawaran Yang Lewat Diterima, Bil. Mukasurat and the ANGGARAN SYARIKAT row, and carries five data columns per bid.
	The Jadual Tawaran IS the register of tenders received — there is no separate register. The prototype reproduces the form well but hard-codes the signatories and the late count. KP 5.2.3 lists only three fields; build to SK002's five.
FR-OPN-006
	The system shall capture an electronic initial (tandatangan ringkas) from each Opening Committee member against each individual bid, and a signature from each member on the completed Jadual Tawaran.
	M
	SK002 7.7.4
	The schedule cannot be finalised until every bid carries an initial from every present member and the schedule carries every member's signature.
	Per-bid initialling is absent from the prototype.
FR-OPN-007
	The system shall record the count of late bids received on the Jadual Tawaran, drawn from the actual late-bid records rather than keyed.
	M
	SK002 7.7.4; CPD/J.TAWARAN-02
	The late count on the schedule equals the number of bids marked Late for that exercise. It cannot be edited.
	The prototype hard-codes the late count as a dash.
FR-OPN-008
	The system shall present a mandatory-document verification checklist at opening, configured per exercise, and shall record a tri-state result (present, absent, not applicable) per document per bidder together with a committee decision of Pass or Reject per bidder.
	M
	SK003 7.2.2(a); TA 109 Stage 1; quotation Fasa 1
	The checklist executed at runtime is the checklist configured for that exercise — nine items for the TA 109 tender model, seven for the quotation model — not a fixed three-item list.
	The prototype runs a fixed three-item list at runtime and ignores the checklist configured in the wizard. One of those three, the Grand Summary, is a Ranhill SAJ output rather than a bidder submission — a modelling error.
FR-OPN-009
	The system shall lock the evaluation module until the opening is finalised, and shall carry forward to evaluation only those bids the Opening Committee has passed.
	M
	SK003 7.2.1(a)
	Evaluation screens are inaccessible before finalisation. A bid marked Reject at opening does not appear in the evaluation set.
	The prototype implements this correctly and it should be retained.
FR-OPN-010
	The system shall generate the Grand Summary (CPD/G.SUMMARY-01) after the committee decision, marking each bidder Layak or Tidak Layak and highlighting the lowest (Terendah) qualifying offer.
	S
	CPD/G.SUMMARY-01; practice
	The Grand Summary is generated only after finalisation and reflects the committee's pass and reject decisions.
	The prototype does this well.
FR-OPN-011
	The system shall persist all opening state — attendance, per-bid initials, checklist results, committee decisions, the schedule and the finalisation event — to the server as immutable records.
	M
	ISO 9001 QMS practice; evidentiary integrity
	Clearing browser storage, changing device or changing user has no effect on the recorded opening. The opening record cannot be edited after finalisation.
	The prototype persists the opening decision to browser local storage, so a committee decision survives in one browser and nowhere else.
6.8 Evaluation
SK003 contains no scoring system, no marks, no points, no pass mark, no weighting, no ranking formula and no evaluation matrix of any kind. For a traditional contract the entire methodology is four qualitative aspects (7.2.2 a–d). A two-stage sequence exists only for Design & Build and Turnkey (7.3), and even then it is sequential gating rather than a weighted composite. A corpus-wide search for wajaran, peratus, markah, 60% and 40% returns nothing on evaluation scoring. The 60/40 weighted tender model and the four-phase quotation model are real practice with no SOP basis — they originate in the Terms of Reference, in an individual tender's Instructions to Tenderers, or in the evaluation team's own method. They must therefore be configurable per exercise, never hard-coded, pending decision D1.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-EVL-001
	The system shall support joint evaluation by the Project Implementing Department together with Contract & Procurement, with each participant acting under their own authenticated identity, and shall record which officer scored which criterion.
	M
	SK003 7.1.1
	Two distinct authenticated users, from two departments, contribute to one evaluation record. Every score carries the scoring officer's identity and timestamp.
	The prototype's department-versus-procurement separation is the best governance idea in the build — but it is a self-service toggle inside one session, not two authenticated users. Also note the unresolved contradiction with the SK002 flowchart, which hands custody of the documents to the Implementing Department; build to SK003 7.1.1, under which the documents do not leave K&P.
FR-EVL-002
	The system shall sequence the evaluation so that the Implementing Department completes and submits the technical assessment before the financial and commercial assessments are unlocked for Contract & Procurement.
	S
	Practice
	Financial and commercial stages are inaccessible until technical submission is recorded.
	The prototype implements this correctly.
FR-EVL-003
	The system shall implement the four qualitative aspects of SK003 7.2.2 as first-class assessments on every traditional-contract evaluation: (a) completeness of the tender received; (b) reasonableness of the tender price against the company estimate; (c) reasonableness of the work completion period; and (d) capability of the tenderer, checked as to experience, current work and latest performance.
	M
	SK003 7.2.2(a)–(d)
	All four aspects must be completed and carried into the report. An evaluation cannot be submitted with aspect (c) unassessed.
	Aspect (c), reasonableness of the completion period, is never assessed in the prototype — delivery weeks are captured and displayed but never scored. The SOP clause consists of the heading alone: no criterion, no benchmark, no detail.
FR-EVL-004
	The system shall record, for aspect (b), an explicit comparison between each tender price and the company estimate, and shall support the recommendation only of a tender whose price falls within a reasonable company estimate.
	M
	SK003 7.2.2(b)
	The comparison is computed and displayed in RM and per cent for every bid, and appears in the evaluation report.
	This is the SOP's entire price test. There is no stated preference for the lowest compliant tender, no scoring, no band and no formula. The ±15% band at FR-EVL-011 is practice supplying what the SOP omits.
FR-EVL-005
	The system shall implement the Design & Build and Turnkey route as a two-stage evaluation: a First Stage technical evaluation covering design, materials, structural, mechanical and electrical, decided by the Ranhill SAJ Technical Committee; and a Second Stage contractual and price evaluation.
	M
	SK003 7.3(a),(b)
	Selecting Design & Build or Turnkey routes Stage 1 to the Technical Committee as a decision, not a recommendation, and unlocks Stage 2 only on a Stage 1 pass.
	The Technical Committee's composition, quorum, appointment authority, chair, output document and decision rule are all unstated, and no actor is named for Stage 2. Absent from the prototype entirely. Section 12 blocker B5.
FR-EVL-006
	The system shall provide a configurable evaluation model per exercise, supporting stage or phase definitions, criteria, weights, pass marks and gating rules, stored as reusable templates and versioned.
	M
	Decision D1; SK003 by omission
	An exercise can be configured with the six-stage weighted tender model, the five-phase quotation model, or a bespoke model, without a code change. The model applied is recorded immutably on the exercise at the point of publication and cannot be changed thereafter.
	This is the mitigation for the fact that the methodology in use has no policy basis. Locking the model at publication is what makes the evaluation defensible.
FR-EVL-007
	The system shall execute at runtime the evaluation model that was configured for that exercise, and shall not apply any other model.
	M
	Prototype defect
	A tender configured with the six-stage weighted model is evaluated with that model. A quotation configured with the five-phase model is evaluated with that model.
	The prototype configures a rich six-stage weighted tender model in the wizard and never executes it: the runtime unconditionally applies the quotation pass/fail model, including to a RM4.2 million open tender. This is the most consequential functional defect in the build.
FR-EVL-008
	The system shall support the observed six-stage weighted tender model as a configurable template: Stage 1 mandatory submission checklist (pass/fail); Stage 2 shortlisting by Form of Tender price with the number shortlisted set by the Head of Contract & Procurement; Stage 3 technical evaluation with passing 70%, weightage 60 marks, comprising Past Experience and Performance at 40% (past experience 15, works in progress 5, preliminary works programme 5, project organisation 5, plant 10) and Technical Requirement at 60% (design, calculation, specification and drawing 40, method statement 20); Stage 4 financial evaluation with passing 60%, weightage 40 marks, comprising Paid-up Capital 10, Nett Worth 10, Total Working Capital as a percentage of Minimum Capital Required 60, Gearing Ratio 10 and Current Ratio 10, where Minimum Capital Required = 10% of the Tender Amount; Stage 5 combined score = (Stage 3 × 60%) + (Stage 4 × 40%) with passing 60 and a requirement to pass Stages 3 and 4 individually; and Stage 6 recommendation.
	M
	TA 109 Stages 1–6 — [PRACTICE], no SOP basis
	A tender evaluated under this template reproduces the TA 109 worked outcome exactly: technical 80.35% and financial 92.00% give a composite of (80.35 × 0.6) + (92 × 0.4) = 85.01.
	Every figure here is practice, not policy — decision D1. The prototype describes Stage 4's four components as prose cards and computes none of them; at runtime it applies the quotation rule of estimate × 3% or 5%, which is the wrong formula for a tender.
FR-EVL-009
	The system shall support the observed five-phase quotation model as a configurable template: Fasa 1 mandatory evaluation (documents received before 2.30 p.m., tenderer eligibility, Borang Sebutharga and Surat Akuan Pembida complete, signed and officially stamped) with a shortlist of three (3) or four (4) tenderers; Fasa 2 technical evaluation on work experience, current work, manpower, plant and machinery, Pengurusan Tenaga and the Contractor Performance Report percentage, to a maximum of 90%; Fasa 3 financial evaluation; Fasa 4 commercial evaluation; and Fasa 5 recommendation.
	M
	LAPORAN PENILAIAN SEBUTHARGA template — [PRACTICE]
	A quotation evaluated under this template produces the five phases in order with the shortlist control enforced.
	The prototype implements Fasa 2 to Fasa 4 well but has no shortlist-count control. It announces a technical pass mark of 70% while the gate actually implemented is all-criteria-pass plus CPR ≥ 40.
FR-EVL-010
	The system shall compute the quotation financial test as: minimum capital = company estimate × 3% where materials are supplied from the Ranhill SAJ store, or × 5% where supplied by the contractor; compared against the average of the last three months' bank balances; and shall classify the result Kukuh above 15%, Baik at 10%, Memuaskan below 10% and Gagal below the applicable 3% or 5% floor.
	M
	Quotation evaluation template Fasa 3
	The credit factor is selectable, the minimum capital is computed, the three-month average is computed, and the band label is produced.
	The prototype implements the formula and the credit factor correctly but omits the band labels and credit facilities.
FR-EVL-011
	The system shall compute the commercial evaluation as the variance of each bid against the company estimate and against the lowest bid, in RM and per cent, and shall classify each as Rendah below −15%, Kompetitif within ±15%, and Tinggi above +15%.
	M
	Quotation evaluation template Fasa 4
	Both variances and both classifications are computed and displayed for every bid.
	Correct in the prototype. ±15% is the only operationalisation anywhere of SK003's undefined "reasonable" price test — capture it and get it ratified. Note that in the prototype the commercial classification is displayed but does not gate eligibility.
FR-EVL-012
	The system shall record the Contractor Performance Report percentage as an evaluation input drawn from the contractor performance register rather than keyed, and shall band it Terbaik 80–100, Baik 60–79, Sederhana 50–59, Tidak Memuaskan 40–49 and Gagal 0–39.
	M
	Quotation template Fasa 2; FORMS §12; SK003 7.2.2(d)
	The CPR value on an evaluation resolves to a specific performance report record and cannot be typed over. The band is derived.
	The bands are correct in the prototype but the value is a manual numeric input with no link to the separate performance scorecard, which is itself orphaned.
FR-EVL-013
	The system shall enforce a communication blackout with tenderers during evaluation, permitting clarification or confirmation only in writing through a recorded channel, and shall log every communication with a tenderer during the evaluation window.
	M
	SK003 7.2.1(d)
	Ad-hoc communication is not possible from within the system during evaluation. Every written clarification is logged with sender, recipient, content and timestamp, and is attached to the evaluation record.
	Absent from the prototype, which seeds a clarification-request task with no controls.
FR-EVL-014
	The system shall classify all evaluation and tender-certification information as SULIT and restrict access to the assigned evaluators, the Secretariat and Internal Audit.
	M
	SK003 7.2.1(e)
	A user not on the evaluation team cannot retrieve scores, prices or the report. Access attempts are logged.
	No document classification model exists in the prototype at all.
FR-EVL-015
	The system shall support a Tender Clarification Meeting, recording the minutes and requiring the tenderer's written confirmation of all agreements reached, and shall attach both to the evaluation record.
	M
	SK003 7.4.1–7.4.3
	A clarification meeting cannot be closed without minutes and an attached written confirmation from the tenderer.
	The written confirmation is what reconciles a face-to-face meeting with the 7.2.1(d) blackout. Absent from the prototype.
FR-EVL-016
	The system shall support a Price Negotiation Meeting, recording the minutes and the tenderer's written confirmation, and shall include both, together with the clarification letters, as part of the Evaluation Report.
	M
	SK003 7.5.1–7.5.3; DAL §3.1.4.4 item 3
	The negotiation minutes and confirmation are mandatory attachments to the report where a negotiation occurred. The negotiation is approved by the Head of Department through C&P.
	No guardrails exist: no limit on rounds, no restriction to the lowest tenderer, no prohibition on scope change, no requirement for prior Tender Board authority, and no rule on negotiating with more than one tenderer. This is a probity exposure on a step the SOP expressly permits — Section 12 OQ-08.
FR-EVL-017
	The system shall produce a single Evaluation Report object with the fixed annexes A Jadual Penilaian, B Jadual Perbandingan, C Jadual Tawaran, D Laporan Prestasi Kontraktor, E Senarai Kehadiran Lawatan Tapak and F Lukisan atau Gambar, and shall treat Laporan Penilaian, laporan dan pengesyoran tender and Kertas Kerja as aliases of that one object.
	M
	Quotation template §5–§8; SK003 7.5.3, 7.7.1
	One report object exists per exercise, with all six annexes generated or attached. Exporting the report produces the annexes in order.
	SK003 names the output three different ways and never relates them, and prescribes no template, no sections, no signatories and no addressee list. The prototype renders four standalone printable modals and produces annexes B, D, E and F not at all.
FR-EVL-018
	The system shall compute and display the cost saving of the recommended bid against the company estimate in the recommendation stage.
	S
	TA 109 Stage 6
	The recommendation shows the saving in RM and per cent.
	The prototype produces the lowest-passing logic correctly but not the saving figure.
FR-EVL-019
	The system shall auto-disqualify, without evaluation, a quotation bid whose price exceeds RM300,000.00, recording the reason.
	M
	Observed practice: "tidak dinilai kerana harga tawaran melebihi syarat maksimum sebutharga iaitu RM 300,000.00"
	A quotation bid above RM300,000.00 is excluded from evaluation with the reason recorded and reported.
	SebutHargaMatrix in the prototype exposes a RM200,000.00 ceiling that is never enforced at runtime and that contradicts the RM300,000 regime ceiling.
FR-EVL-020
	Where anonymised evaluation is enabled, the system shall anonymise bidder identity and price during the technical scoring stage only, and shall reveal identity for any criterion that requires the named contractor — including the Contractor Performance Report, work experience and current work.
	S
	[NET-NEW]; conflicts with SK003 7.2.2(d)
	With anonymisation on, technical scoring shows Pembida 1..n. On reaching a criterion requiring the named contractor, identity is revealed and the reveal is logged.
	Blind evaluation as built is self-contradictory: it cannot coexist with CPR-based technical scoring, which requires the named contractor. The instinct is right; the placement is wrong.
6.9 The approval engine
This is the most important module in this document. The Discretionary Authority Limits manual is the constitutional instrument of Ranhill SAJ procurement: Issue A, Revision 00, dated 11 June 2021, the Fifth Revision, prepared by the Director of Finance & Administration, recommended by the CEO and approved by the Board of Directors. It sets maximum limits only, and must be applied together with the Company Policy and Procedures and staff terms and conditions, and exercised in accordance with the Water Service Industry Act 2006. Nothing in the portal may route an approval by any other rule. The prototype has no approval engine at all — it has two hard-coded approver arrays and a Settings workflow builder whose condition enum matches no DAL boundary.
6.9.1 Engine requirements
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-APR-001
	The system shall implement approval routing as a configuration-driven rules engine reading versioned, effective-dated DAL tables, and shall contain no hard-coded approver, threshold or chain in application code.
	M
	DAL, whole document
	Changing a threshold or an approver in the configuration changes routing on the next matter raised, with no deployment. A code search finds no monetary threshold or role name in the routing logic.
	The DAL is Board-approved and will be revised. It is the sixth revision that will break a hard-coded implementation.
FR-APR-002
	The system shall determine, for every approval event, the approval matrix to apply from the combination of matter type, procurement regime, funding source, contract type where relevant, value band and — for variations — the variation percentage band.
	M
	DAL §§3.1.4.1–3.1.4.4
	Given matter type "interim payment", regime "tender" and value RM620,000, the engine selects DAL §3.1.4.4 item 16a and routes to the CEO. Given the same matter at RM80,000 it selects item 16c and routes to the Head of Division, irrespective of who the S.O. is.
	The routing sheet CPD/INT-SFA-INDEN prints only two bands and will misroute this case — build the DAL's three bands.
FR-APR-003
	The system shall implement the full authority grammar as distinct, recordable step types: A approve, R recommend, P propose, JP jointly propose, JR jointly recommend, MA mandatory approval, MR mandatory recommendation and MJR mandatory joint recommendation.
	M
	DAL authority code vocabulary
	Each step in an approval trail displays its code. A step coded MR cannot be satisfied by a step coded R, and vice versa.
	The prototype's Settings workflow builder has steps but no grammar at all.
FR-APR-004
	The system shall automatically generate the full chain beneath every approval according to DAL §2.2.1: where the approving authority is the Head of Department, the chain is Head of Department approves; where it is the Head of Division, Head of Department recommends and Head of Division approves; where it is the Functional Director, Head of Department proposes, Head of Division recommends and Functional Director approves; where it is the CEO, Head of Department proposes, Head of Division proposes or jointly proposes, Functional Director recommends and CEO approves.
	M
	DAL §2.2.1 p.13
	Selecting an approving authority produces the correct chain automatically. The chain cannot be shortened by a user.
	Approval always carries the full chain beneath it. Absent from the prototype.
FR-APR-005
	The system shall treat steps coded MA, MR or MJR as non-delegable, and shall refuse any attempt to delegate, skip, substitute or auto-approve such a step.
	M
	DAL §1.6
	A delegation covering an MR step is refused at creation. An MR step cannot be marked complete by anyone other than the designated body or role.
	The Quotation Committee's recommendation and the VOC's recommendation are both MR. They gate the majority of Ranhill SAJ transaction volume and all variations.
FR-APR-006
	The system shall require a mandatory committee recommendation to be recorded as a quorate committee decision — not as an individual approval — before the approving authority's step becomes available.
	M
	DAL §3.1.4.2 items 1–2; §§3.1.4.3–3.1.4.4
	The CEO cannot approve an appointment between RM15,000 and RM300,000 until a quorate Quotation Committee decision exists. The approval button is unavailable, not merely warned against.
	See module 6.10.
FR-APR-007
	The system shall record, for every approval step, the actor, the role held at the time, the authority code, the decision, the decision date and time, any comment, and the DAL clause and version relied upon.
	M
	DAL; evidentiary integrity
	Every completed step can be reconstructed years later, including the DAL version in force at the time.
	These are legally significant approvals. The DAL clause reference on the trail is what makes an approval auditable after the DAL has been revised.
FR-APR-008
	The system shall prevent any user from approving, at any step, a matter in which they are the requester, the beneficiary, or a party to their own expense or allocation, and shall escalate as follows: the CEO to the Chairman; other Board members to the Chairman; a Functional Director to the CEO; a Head of Division to the Functional Director; a Head of Department to the Head of Division.
	M
	DAL §1.6
	A Head of Division who raised a requisition cannot appear as its approver; the matter routes to the Functional Director and the escalation is recorded with its reason.
	Absent from the prototype.
FR-APR-009
	The system shall support declaration of a conflict of interest at any step, requiring the declaring approver to recuse and escalating the step one level up, with the declaration recorded on the trail.
	M
	DAL §1.5
	Declaring a conflict removes the step from the declarer and creates it for the immediate superior, with the declaration visible on the trail.
FR-APR-010
	Where no clear approving authority can be resolved for a matter, the system shall escalate to the immediate superior of the indicated approving authority and record why.
	M
	DAL §1.5
	A matter with an unresolvable authority is not left unrouted; it appears in the superior's queue with the reason.
FR-APR-011
	The system shall implement delegation such that a delegation is valid only if it is in writing within the system, is time-limited or task-limited, is granted to a direct line subordinate, is granted by the jobholder's superior rather than by the jobholder, and does not permit sub-delegation.
	M
	DAL §1.6
	A user cannot create a delegation of their own authority. A delegation without an end date or task scope is refused. A delegate cannot re-delegate.
	The prototype implements self-service downward delegation with a "delegate my authority" screen — the opposite of the rule.
FR-APR-012
	On the absence of an authority holder, the system shall revert that authority upward to the delegator, and shall permit onward re-delegation only where the absent holder has recorded a recommendation to that effect.
	M
	DAL p.42 specimen letter
	Marking a holder absent moves their pending steps to the delegator, not to a subordinate. A downward re-delegation during absence is refused unless the absent holder's recommendation is attached.
	Authority does not pass down automatically. The Authority Manual prevails over any delegation letter. The prototype's "auto-route steps above my limit to the relevant HOD" toggle implements the inverse rule.
FR-APR-013
	The system shall accept a Government-Funding override rule set which, when the funding source is a government route and the override is configured, supersedes the DAL routing for the affected matter types, recording on the trail that DAL §1.4 was applied.
	M
	DAL §1.4
	With an override rule configured for funding source F4, a matter under F4 routes by the override and the trail cites DAL §1.4.
	No source states which government guidelines apply or how they differ. Build the mechanism; RSAJ supplies the content.
FR-APR-014
	Where a matter requires shareholder approval by law, the system shall downgrade the Board of Directors' step from approve to recommend and place final approval with the shareholders.
	S
	DAL §1.5
	Flagging a matter as requiring shareholder approval changes the BOD step code from A to R and adds a shareholder approval step.
FR-APR-015
	The system shall maintain a complete, immutable and exportable audit trail of every approval event, including submissions, recalls, escalations, delegations, absences, recusals, overrides and rejections, and shall not permit deletion or amendment of any trail entry by any user or role.
	M
	Evidentiary integrity; ISO 9001 QMS practice
	A penetration test confirms no application path can alter a trail entry. Export produces a tamper-evident record suitable for an external auditor.
	The prototype has an audit-log tab that displays nothing persisted.
FR-APR-016
	The system shall provide an explicit rejection outcome at every approval step, requiring a reason, and shall route a rejected matter to a defined destination configured per matter type — return to originator, return to a named earlier step, or terminate the case.
	M
	[ASSUMPTION]
	Every approval step offers Reject with a mandatory reason, and every matter type has a configured rejection destination with no unreachable state.
	Rejection and rework paths are undefined at eight gates across the SOP set, and the only properly drawn rework loop in the whole post-award set is the VOC's. A workflow engine cannot have a state with no exit — Section 12 blocker B4.
FR-APR-017
	The system shall support recall of a matter by the originator before the first approval decision is recorded, and shall record the recall.
	S
	[ASSUMPTION]
	A recalled matter returns to draft with the recall visible on the trail. Recall after a decision is refused.
FR-APR-018
	The system shall apply approval service-level targets per matter type, escalate overdue steps to the approver's superior after a configurable period, and report ageing by step, by approver and by matter type.
	S
	CPD/DFA/* ICC columns; [ASSUMPTION] for escalation
	Targets are configurable per matter type. An overdue step raises a notification and appears on the ageing report.
	SK001–014 contain no SLA, no cycle-time target, no KPI and no escalation rule for any step. The only targets in the corpus are the ICC columns on the routing sheets. The portal will have to introduce SLAs, not inherit them.
FR-APR-019
	The system shall present to every approver, at the point of decision, the DAL clause being applied, the value band, the chain above and below, and the committee recommendation on which the step depends.
	M
	Usability of a legally significant control
	The approval screen names the clause (for example "DAL §3.1.4.4 item 16a — interim payment above RM500,000 → CEO") and shows the full chain.
	The prototype shows an invented four-tier authority card instead.
FR-APR-020
	The system shall version DAL configuration, retain superseded versions indefinitely, apply the version in force at the date the matter was raised, and require a maker-checker approval for any change to DAL configuration.
	M
	DAL Board approval; evidentiary integrity
	A matter raised before a DAL change is routed and reported under the old version. A configuration change cannot be made by one person acting alone.
	The DAL is Board-approved; changing its representation in the portal is a governance act, not an administrative one.
6.9.2 DAL configuration tables the engine must hold
These tables are reproduced verbatim in Appendix B and are loaded as configuration. They are listed here so that the scope of the engine is unambiguous. Every figure is quoted exactly as it appears in the DAL.
Matrix
	DAL reference
	Rows
	Dimensions
Approval of Requisition
	§3.1.4.1, p.19
	4
	Value band
Approval of Appointment — Direct Purchase (proprietary and emergency), for goods and equipment, works and services, consultancy and advisory
	§3.1.4.2 item 1, p.20
	7
	Value band
Approval of Appointment — Open and Selective (with or without Schedule of Rates or Goods)
	§3.1.4.2 item 2, p.21
	4
	Value band
Rental, leasing and hire purchase per approved budget
	§3.1.4.2 item 3
	1
	—
Contract Administration for Quotation (contracts more than RM15K and up to RM300K)
	§3.1.4.3, pp.22–23
	15 items, 17 rows
	Item; VO percentage band
Contract Administration for Tender (contracts more than RM300K)
	§3.1.4.4, pp.24–28
	17 items, 26 rows
	Item; contract value band; VO percentage band; LAD waiver percentage band
CAPEX and OPEX budget authority
	pp.17, 36
	4
	Value band
Core routing rule (chain generation)
	§2.2.1, p.13
	4 × 4
	Approving level × subordinate level
Application rules (self-approval, conflict, delegation, absence, government override)
	§§1.2, 1.4, 1.5, 1.6, p.42
	8 rules
	Cross-cutting
6.9.3 Worked routing examples the engine must reproduce
Scenario
	Chain the engine must produce
Requisition, estimated value RM420,000
	Head of Department P → Head of Division R → Functional Director MR → CEO A. (DAL §3.1.4.1)
Open quotation appointment, RM180,000
	Chain per §2.2.1 → Quotation Committee MR (non-delegable, quorate decision) → CEO A. (DAL §3.1.4.2 item 2)
Open tender appointment, RM8,400,000
	Tender Board Committee A. No Chairman or Board row exists for open or selective tender at any value. (DAL §3.1.4.2 item 2)
Direct purchase, RM4,200,000
	Tender Board Committee MR → Chairman A. (DAL §3.1.4.2 item 1)
Direct purchase, RM6,000,000
	Head of Department P → Head of Division JR/R (by Administration Division) → Tender Board Committee MR → Board of Directors A. (DAL §3.1.4.2 item 1)
Letter of Acceptance signature, contract value RM2,100,000
	Contract & Procurement R → Functional Director A, acting as Superintending Officer / Project Director. (DAL §3.1.4.4 item 5b)
Variation order of 12% on a RM750,000 tender contract
	VOC MR (non-delegable) → CEO A. Band: contract more than RM300K and up to RM1M, VO more than 10% and up to 15%. (DAL §3.1.4.4 item 7c(ii))
Variation order of 12% on a RM2,400,000 tender contract
	VOC MR → Functional Director A? No — band is contract more than RM1M and up to RM3M, VO more than 10% and up to 30% → CEO A. (DAL §3.1.4.4 item 7b(ii)). The same percentage produces a different authority at a different contract value — this is why the matrix must be two-dimensional.
Variation order of 12% on a RM180,000 quotation contract
	VOC MR → Head of Division A? No — quotation band is up to 20% → Head of Division A, and the DAL shows no MR at that band. (DAL §3.1.4.3 item 5c)
Interim payment certificate of RM620,000 on a RM9,000,000 contract
	CEO A (value more than RM500K). Not the S.O., who at that contract value is also the CEO — but at RM80,000 on the same contract the answer is the Head of Division, not the CEO. (DAL §3.1.4.4 item 16)
Extension of time with financial impact not caused by an authority requirement
	VOC MR → Tender Board Committee A. (DAL §3.1.4.4 item 10a(i))
Waiver of 40% of an LAD amount, tender regime
	Tender Board Committee A (more than 30% of the LAD amount). At 25% the answer is CEO A. The threshold is a percentage of the LAD amount, not of the contract sum. (DAL §3.1.4.4 item 12)
Termination, tender regime
	Contract & Procurement JR/P → Head of Division R → CEO A. (DAL §3.1.4.4 item 13) — conflicts with SK008 §7.5.1, which gives sole authority to the S.O. See decision D2.
Advance payment, any value, tender regime
	Contract & Procurement JR/P → Head of Division R → CEO A. No value band exists. The item does not exist at all in the quotation regime. (DAL §3.1.4.4 item 15)
6.10 Committee management
Committee decisions are the legal basis for every appointment and every variation at Ranhill SAJ. The corpus defines the composition of only one committee (the Tender Opening Committee, at two members) and the quorum of only one (the Tender Board, at three members). Everything else must be configured by RSAJ. The prototype has no committee entity of any kind: committees exist as five badge strings and one dead-code voting screen.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-CTE-001
	The system shall maintain a Committee register supporting the Tender Board Committee, Quotation Committee, Variation Orders Committee, Tender Opening Committee, Quotation Opening Committee, Technical Committee, Technical & CAPEX Committee and the Claims Committee, each with a name, aliases, mandate, governing source, value scope and status.
	M
	DAL p.12; SK002 7.7.2; SK003 7.6; SK012; OM/P/001 8.3; KP003 5.11.5
	All eight bodies exist as configurable entities. A committee can be created, amended and retired without a code change.
	The DAL explicitly does not state composition or quorum for any committee. Naming instability must be handled by aliases: the VOC alone appears as Variation Order Committee, Jawatankuasa Perubahan Kerja, Jawatankuasa Arahan Perubahan Kerja, Jawatankuasa Perubahan Kerja / Lanjutan Masa, Jawatankuasa Kelambatan & Lanjutan Masa and VOC.
FR-CTE-002
	The system shall maintain committee membership by position — Chairman, Deputy Chairman, Member and Secretary — with a named holder, an eligible-alternate pool, an appointment record and effective dates.
	M
	Quotation evaluation template APPROVAL sheet; CPD/VO(CONSENT)-PAAB p.2
	A member can be added, replaced by an alternate and retired, with full history. Historic decisions continue to show the membership in force at the time.
	The observed Quotation Committee membership uses "/" lists — these are alternates, and must be modelled as a role with an eligible-member pool, not as fixed individuals. The PAAB VO Committee names are hard-coded onto the template today.
FR-CTE-003
	The system shall enforce a configurable quorum per committee, shall default the Tender Board Committee quorum to three (3) members, and shall refuse to record a decision by an inquorate meeting.
	M
	SK003 7.6.2
	A Tender Board meeting with two members present cannot record a decision; the system states the quorum shortfall. Changing the quorum requires a controlled configuration change.
	Three is the only stated quorum in the entire pre-award corpus. Every other quorum must be supplied by RSAJ — Section 12 blocker B5.
FR-CTE-004
	The system shall model a Meeting as an entity with a date, a reference, an agenda of matters tabled, an attendance register, a quorum determination, per-matter decisions and minutes.
	M
	SK003 7.7.1, 7.7.2; SK012 flowchart
	A meeting can be scheduled, papers tabled, attendance taken, decisions recorded and minutes attached. The meeting date appears on the relevant routing sheet.
	SK003 imposes no minute requirement on the Tender Board, though a decision is obviously recorded. In practice a signed decision sheet is produced.
FR-CTE-005
	The system shall capture each member's individual decision on each matter as SETUJU or TIDAK SETUJU (Agree or Disagree), with a comment and a date, and shall not permit a single aggregate committee decision to be recorded without the individual votes beneath it.
	M
	SK003 practice; quotation Kertas Cadangan; CPD/VO(CONSENT)-PAAB
	A committee decision shows every present member's individual vote. A decision recorded without individual votes is refused.
	In observed practice the Tender Board decision sheet records AGREE or DISAGREE to appoint a named tenderer with a stated Contract Sum and Completion Period.
FR-CTE-006
	The system shall route recommendations to the Tender Board only through the Secretariat, which is the Contract & Procurement Department, and shall not permit a matter to reach the Board by any other path.
	M
	SK003 7.7.2
	A matter tabled without a Secretariat routing step is refused. The Secretariat is a system role, not a free-text field.
	C&P is also the Secretariat (Urusetia) for VO approval (SK012 §7.2.2(d)) and for extension of time and extension of contract period (SK006 §7.5.4).
FR-CTE-007
	The system shall assemble the Tender Board bundle comprising the tender documents, all tenders received late, the tender report and the recommendation, and shall not permit the bundle to be tabled with the late tenders omitted.
	M
	SK003 7.7.1
	Where late bids exist, the bundle contains them and the Board is presented with the admission decision before the award decision.
FR-CTE-008
	The system shall record a Tender Board decision on the admission of each late tender as a discrete decision distinct from the award decision.
	M
	SK003 7.2.1(a)
	A late tender carries its own recorded Board decision to admit or not admit, dated and attributed.
	This power belongs to the Board alone and to no officer.
FR-CTE-009
	The system shall implement the not-approved outcome of a Tender Board decision as one of the three documented options — Pemanggilan semula (recall), Penjelasan (re-clarification) or Perundingan semula (re-negotiation) — looping the case back to the clarification and negotiation step, and shall additionally provide configurable terminal outcomes for cancellation and re-tender.
	M
	SK003 flowchart; KP002/003/004 flowchart 6.1; [ASSUMPTION] for the terminal outcomes
	A not-approved decision requires selection of one of the three loop options or an explicitly configured terminal outcome, and issues a memo to the Implementing Department notifying the decision.
	No cancellation, reject-all-tenders or re-advertisement outcome is drawn or narrated anywhere in SK003. The loop-only design leaves a state with no exit. Section 12 blocker B4.
FR-CTE-010
	The system shall detect and prevent a committee member from voting on a matter in which they have declared a conflict of interest, and shall record the recusal and its effect on quorum.
	M
	DAL §1.5
	A recused member is excluded from the vote and from the quorum count for that matter only.
	No conflict-of-interest or recusal rule exists at committee level in any source — this applies the DAL's individual rule to committees by analogy. [ASSUMPTION]
FR-CTE-011
	The system shall record the appointment of Opening Committee members per exercise, and shall support a configurable rule requiring those members to come from outside the Contract & Procurement Department.
	S
	SK002 7.7.2 (silent); TA 109 practice
	With the rule enabled, assigning a C&P officer to an Opening Committee is refused. With it disabled, no restriction applies.
	The independence rule is practice, not SOP. For TA 109 the two signing officers came from Accounts & Finance and Group Information Technology, i.e. deliberately from outside C&P. Either OM/KP/SP/002 imposes it or it is undocumented good practice worth keeping.
FR-CTE-012
	The system shall not implement any rule permitting the Chairman of the Tender Board to appoint a substitute chair.
	M
	SK003 7.6.3
	No substitution path exists in the Tender Board configuration until RSAJ supplies a corrected clause.
	SK003 7.6.3 as printed reads that the Chairman may appoint the CEO as Chairman during his absence. Since the CEO would normally be the Chairman, and the observed board is chaired by a Director with the CEO as an ordinary member, the sentence is most plausibly inverted. Do not encode any delegation rule from it. Section 12 OQ-01.
FR-CTE-013
	The system shall generate the committee proposal paper (Kertas Cadangan) addressed to the chairman and members, with the checking signature of the Head of Section and the recommending signature of the Head of Contract & Procurement.
	M
	CPD/DFA/PRE T-QUO boxes 8–9; practice
	The paper is generated from the evaluation record with the two signatures captured before tabling.
	Absent from the prototype.
FR-CTE-014
	The system shall record, on the relevant CPD/DFA/* routing sheet, the committee meeting date and the outcome, and shall record the CEO approval block for quotations with date received, approver name and date.
	M
	CPD/DFA/PRE T-QUO boxes 10–11
	The routing sheet fields are populated from the meeting record and cannot be keyed independently.
6.11 Award
The award instrument depends on the band. Above RM300,000 it is the Letter of Acceptance of Tender (Surat Setujuterima Tender), which SK001 7.3.4(e) confirms is a contract document, not merely an award notice. Between RM15,000 and RM300,000 it is an Inden Kerja followed by a Pemberitahuan Perlantikan. The prototype has a single unconditional "Issue Letter of Award" button, no Inden Kerja at all, and a letterhead that is not Ranhill SAJ.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-AWD-001
	The system shall prevent issue of a Letter of Acceptance until a recorded Tender Board approval exists for that exercise.
	M
	SK003 7.1.2, 7.9.1
	The issue action is unavailable — not merely warned against — until the Board decision is recorded. There is no delegated award route below the Tender Board.
	In the prototype the Issue Letter of Award button is enabled unconditionally on every pending row.
FR-AWD-002
	The system shall resolve the signatory of the Letter of Acceptance and of the Contract Document from the contract value: more than RM3 million to the CEO as Superintending Officer or Project Director; more than RM1 million and up to RM3 million to the Functional Director as SO/PD; and more than RM300,000 and up to RM1 million to the Head of Division as SO/PD; with recommendation by Contract & Procurement in all three cases.
	M
	DAL §3.1.4.4 item 5a, 5b, 5c
	A RM2.1 million contract presents the Functional Director as the only valid signatory. Any other signature is refused.
	This same rule resolves the Superintending Officer role for the whole of the post-award lifecycle. See FR-SUP-001.
FR-AWD-003
	The system shall generate the Letter of Acceptance with the Surat Akuan Pembida Berjaya attached, and shall require the successful tenderer to return the signed Letter together with the signed declaration and a Surat Pewakilan Kuasa.
	M
	SK003 7.10.1–7.10.3
	The generated pack contains the declaration. The return is not recorded as complete until all three documents are present.
	This is Integrity Pact Stage Two, executed at the time the successful tenderer returns the Letter of Acceptance. Stage One is present in the prototype; Stage Two is absent.
FR-AWD-004
	The system shall distribute copies of the Letter of Acceptance to the Implementing Department, the Accounts & Finance Department, CIDB (LPIPM) and LHDN, and additionally to SPAN where the contract relates to Water Services works, recording despatch and acknowledgement per recipient.
	M
	SK003 7.9.3(a)–(e)
	Five recipients for a water-services contract, four otherwise. Each despatch is logged with method and date.
	Two external regulators and a tax authority. None of the five is modelled in the prototype. This is an automatable regulatory obligation.
FR-AWD-005
	The system shall support delivery of the Letter of Acceptance by Registered Post (Pos Berdaftar) or by collection at the K&P Department, recording the method, the despatch or collection date and, for registered post, the consignment reference.
	M
	SK003 7.9.3
	Both delivery methods are selectable and recorded. A registered-post despatch cannot be recorded without a consignment reference.
FR-AWD-006
	The system shall generate an Inden Kerja for a quotation-route award, consuming the ERP-generated number in the format IN<YYYY><NNNNN>, and shall enforce an indent validity of fourteen (14) days from receipt, after which the user department must notify Contract & Procurement to cancel the indent.
	M
	DAL §3.1.4.3 items 14–15; IN202600395 covering memo
	An indent is created with the ERP number and a computed 14-day expiry. On expiry an alert is raised to both the user department and C&P.
	The quotation award instrument does not exist in the prototype at all — a search for "Inden" or "Indent" returns nothing. IN… numbers are ERP-generated and must be consumed.
FR-AWD-007
	The system shall generate the appointment notification letter (Pemberitahuan Perlantikan) in the correct template variant for the case — Direct and Selective below RM50,000, One Shot below RM50,000, One Shot above RM50,000, IT & QA below RM50,000, IT & QA above RM50,000, or Schedule of Rates — signed by the Ketua Jabatan, and shall carry the LAD rate, insurances, SPAN permit requirement, PERKESO registration and the Safe Work Method Statement obligations.
	M
	Appointment-letter templates; DAL §3.1.4.3 item 15
	The correct variant is selected automatically from contract type and value band. Above RM50,000 the letter carries the retention and defects-liability clauses; below it, it does not.
	Absent from the prototype. Note that the RM50,000 split in these templates does not align to any DAL procurement band — Section 12 OQ-05.
FR-AWD-008
	The system shall include a contractor acceptance page on the appointment letter capturing the contractor's signature, the witness signature and full name, Atas Sifat, the contractor's stamp (Meteri/Cop Kontraktor), identity card number, occupation and address.
	M
	Appointment-letter templates
	The acceptance page reproduces every field. Acceptance is not recorded as complete until all are captured.
FR-AWD-009
	The system shall enforce a seven (7) day commencement rule on the quotation route, raising a warning where work has not commenced within seven days of the stated start date and supporting cancellation and blacklisting as the documented consequence, except on Schedule of Rates variants where the consequence is a warning letter only.
	M
	Appointment-letter templates
	The clock starts at the stated start date; non-commencement raises the alert and enables the cancellation action with the recorded consequence.
	Absent from the prototype, where blacklisting appears once as a vendor declaration checkbox.
FR-AWD-010
	The system shall notify unsuccessful tenderers of the outcome, with a configurable debrief that may include the tenderer's own composite score and the reason for non-award, and shall record the notification.
	S
	[NET-NEW] — SK003 7.11 provides for none
	A notification is generated per unsuccessful tenderer with the configured content, and despatch is logged.
	There is no notification to unsuccessful tenderers anywhere in the corpus: no regret letter, no reasons, no debrief, no appeal and no standstill period. The only communication is a passive posting of the work commencement date on the website. Notifying is almost certainly right, but it is a deliberate policy change and must be signed off — including whether a debrief creates a challenge exposure.
FR-AWD-011
	The system shall post the work commencement date to the public exercise record, shall track the one (1) month window from that date within which unsuccessful tenderers may reclaim their documents, and shall track disposal of unclaimed documents within thirty (30) days from the site possession date, with company background information destroyed by shredding.
	M
	SK003 7.11.1, 7.11.2
	Both clocks are computed and reported. Documents not reclaimed within the window are flagged for disposal with the disposal method recorded.
	The two clocks are inconsistent: collection runs one month from work commencement, disposal runs 30 days from site possession. These are different events and different periods, and as printed the disposal deadline can fall before the collection right expires. Legal exposure — Section 12 OQ-10. Note also that the trigger for a pre-award obligation is a post-award milestone.
FR-AWD-012
	The system shall maintain a securities register recording the Performance Bond with its instrument type, issuer, value, basis of calculation, effective date and expiry date, and shall verify that the issuer is a Bank Negara Malaysia-approved bank.
	M
	SK004 §7.3.3(a); observed award pack
	A bond cannot be accepted without an issuer drawn from the approved-bank list, an expiry date and a recorded basis. Expiry alerts fire at configurable intervals.
	The basis is a decision — D4. SK004 says 5% of the total Contract Price. The live award pack computes 5% of the one-year value, valid for the Contract Period plus twelve months. The two differ by roughly half on a two-year contract. Configure the basis per contract; do not default it.
FR-AWD-013
	The system shall maintain an insurance register recording the Works Insurance at a sum insured equal to the full Contract Price plus any amount stated in the Appendix; the Public Liability policy at the limit derived from the seven-band contract-price table; the Workmen's Compensation policy; PERKESO registration; and any CAR or EAR policy accepted in substitution.
	M
	SK004 §7.3.3(b)–(e)
	Public Liability limits derive automatically: contract price up to RM25,000 gives RM10,000; RM25,001 to RM50,000 gives RM25,000; RM50,001 to RM150,000 gives RM50,000; RM150,001 to RM250,000 gives RM75,000; RM250,001 to RM500,000 gives RM100,000; RM500,001 to RM1,000,000 gives RM150,000; above RM1,000,000 gives RM200,000. The derived limit can be raised for unusual risk with a recorded justification.
	Period equals the completion period plus the Defects Liability Period plus 3 months 14 days, or 3 months 28 days for Design & Build and Turnkey. Workmen's Compensation applies to employees earning more than RM1,000.00 per month, who are not PERKESO-eligible; the live award pack instead specifies 10% of the contract sum — a conflict to resolve.
FR-AWD-014
	The system shall record the Safe Work Method Statement approved by Ranhill SAJ HSE and the SPAN permit under section 50 of Act 655 as conditions precedent, and shall record that delay in obtaining the Safe Work Method Statement does not give rise to an extension of time.
	S
	Appointment templates; observed award pack LA - T 02 2026
	Both are recorded as conditions precedent with dates. The no-EOT-for-SWMS-delay rule is visible on the contract record and is applied as a default reason exclusion in the EOT module.
	Absent from the prototype.
6.12 Contract formation, execution and the pre/post-award seam
SK003 ends at the Letter of Acceptance with the word TAMAT. SK004, owned by a different section, simply begins. There is no transmittal, no handover checklist, no file-transfer step and no named trigger connecting them. The first post-contract act is the allocation of the contract number, "immediately" once the Letter of Acceptance is issued.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-CON-001
	The system shall transfer ownership of the case from the Pre-Contract Section to the Post-Contract Section on issue of the Letter of Acceptance, on the same case record, recording the transfer as an event with both section heads notified.
	M
	SK003 7.9 (TAMAT); SK004 header, 7.2.1
	The case shows a section-ownership change event. The pre-award record remains attached and readable; no new case is created.
	The connection between SK003 and SK004 is inferential — there is no documented handover step. Keying it on the contract-number allocation is the cleanest observable event.
FR-CON-002
	The system shall allocate a contract number immediately on issue of the Letter of Acceptance, in the series RSAJ/KP/T/<serial>/<year> for a tender contract and RSAJ/KP/P/<serial>/<year> for consultancy, renumbering from 01 in the year the contract starts.
	M
	SK004 §7.2.1
	A contract number is allocated automatically at award and is unique within its series and year. The series is selected from the contract nature.
	This is a different series from the pre-award tender number RSAJ/TA/NNN/YYYY. The prototype uses C-2026-018, which matches neither. The quotation route has no C&P contract number defined at all — Section 12 OQ-11.
FR-CON-003
	The system shall assemble the Contract Document in the prescribed order for the contract basis — Bills of Quantities based, Drawings and Specification based, or Services and Maintenance — and shall merge any accepted alternative proposal into the relevant sections, clearly stating any cancelled part.
	M
	SK004 §7.3.1
	The assembled document follows the correct ordering for its basis. A merged alternative shows the cancelled parts explicitly.
FR-CON-004
	The system shall reconcile the Contract Document against the Tender Document and the Tender Table Document, ensuring identical content, incorporating all tender-stage amendments and verifying that all drawings are identical, and shall require any amendment to recorded information to be signed by both the contractor and the preparing officer.
	M
	SK004 §7.3.2
	A reconciliation record exists before signature. Every amendment carries two signatures.
FR-CON-005
	The system shall correct arithmetical errors in the Bills of Quantities or Tender Summary, test rate reasonableness to avoid front loading (berat hadapan) with particular attention to provisionally measured work, adjust rates for uniformity on BQ contracts, and check the percentage adjustment or amended rates on a Schedule of Rates for Drawings and Specification contracts.
	M
	SK004 §7.3.2(a)–(d)
	Each of the four checks is recorded as complete with the officer and date. Arithmetical correction produces a variance record against the tendered figures.
	The front-loading check is a substantive financial control and is entirely absent from the prototype.
FR-CON-006
	The system shall route the Conditions of Contract, the contractor-signed Letter of Acceptance and the Bills of Quantities or Schedule of Rates to Group Legal Compliance for review and endorsement as a mandatory pre-condition to signing, and shall implement a rework loop returning the document for amendment on legal comments.
	M
	SK004 §7.1.2, §7.4.1, §7.4.2
	Signature is blocked until endorsement is recorded. A rework iteration is versioned and the loop has no iteration limit and no automatic timeout.
	The prototype has a Legal & Compliance role group with a Review Contracts permission and no workflow behind it. No SLA or iteration limit exists in the SOP — the portal must introduce one.
FR-CON-007
	The system shall require, before the contractor's representative may sign, a copy of the company resolution or other proof of signing authority, and shall record the identity-card number and full name of both the signatory and the witness.
	M
	SK004 §7.5.3
	Signature is refused where no resolution is on file. Both identity-card numbers are captured.
	Blocking control. Absent from the prototype.
FR-CON-008
	The system shall implement a pre-signature readiness gate requiring, cumulatively, that the Letter of Acceptance has been returned signed, the Performance Bond has been lodged and verified, and all stipulated insurance policies have been lodged and verified.
	M
	SK004 §7.1.1
	All three conditions must be green before the signature action becomes available. Preparation may continue while the gate is red.
	This is the most important control in SK004 and it has no representation in the prototype.
FR-CON-009
	The system shall record the Contract Date as the date on which the Ranhill SAJ officer signs, and shall derive it rather than accept it as free input.
	M
	SK004 §7.5.1; KP004 5.4.2
	The Contract Date equals the RSAJ signature timestamp date and cannot be keyed.
FR-CON-010
	The system shall record the Integrity Pact Stage Three briefing at signing, in which the action that may be taken on breach of the anti-corruption clause is emphasised to the contractor.
	S
	SK004 §7.5.2
	A briefing record with date and participants exists on every signed contract.
	No form is named for this in the corpus.
FR-CON-011
	The system shall track stamping of the executed contract at the Inland Revenue Board (LHDN), recording the stamping date and reference.
	M
	SK004 §7.6
	A contract cannot be marked fully executed until the stamping reference is recorded.
	LHDN appears in the prototype only as vendor tax clearance.
FR-CON-012
	The system shall distribute controlled copies of the executed contract — one original with drawings plus one PDF to Contract & Procurement, one copy with drawings to the contractor, one PDF to the S.O.'s Representative, and one copy with drawings to the Consulting Engineer where applicable — each stamped "Controlled Copy", and shall maintain a distribution register.
	M
	SK004 §7.7.1
	Every issued copy is numbered, stamped, addressed and logged. Recall and reissue are supported.
	The prototype shows a document list, not a controlled-copy register.
FR-CON-013
	The system shall record the secure custody location of the original Contract Document, the Performance Bond and the insurance policies, and shall support a check-out and check-in log against the physical originals.
	M
	SK004 §7.8
	Each original has a recorded location and custodian, and every movement is logged.
	No retention period is stated anywhere in SK004. See NFR-RET.
FR-CON-014
	The system shall establish the contract baseline on execution, recording at minimum the Contract Sum, Contract Date, Date of Possession of Site, Date for Completion, Defects Liability Period length, LAD rate and unit, retention percentage and cap, Prime Cost Sums, Provisional Sums, Builder's Works Value, sections where sectional completion applies, and the interim-certificate minimum values.
	M
	[ASSUMPTION], required by SK007 §7.1.2, SK009 §7.1.2 and §7.3.1, SK011 §7.2.4(a)
	The baseline is complete before the first interim valuation can be prepared. Every post-award calculation reads from it and none re-keys it.
	The contract-master baseline that every later calculation depends on does not exist in the prototype in any form. Values are sourced from the Appendix to the Conditions of Contract captured at FR-DOC-004.
6.13 Post-award lifecycle
Eleven sub-processes, governed by SK004 to SK014, expressed in approximately twenty-eight certificates. This is where all the financial risk sits and it has no design in the prototype at all. The main spine is: contract formation → delegation → supervision → repeating interim payments → practical completion → defects liability → making good defects → final certificate → close. Variations, price adjustment and nominated sub-contractors run in parallel and repeat. Extension of time, liquidated damages and termination are exception branches, of which only termination is terminal.
6.13.1 Supervision and site records (SK005)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-SUP-001
	The system shall resolve the Superintending Officer / Project Director as a role rather than a post, assigning it by contract value: the CEO for contracts above RM3 million; the Functional Director for contracts above RM1 million and up to RM3 million; the Head of Division for contracts above RM300,000 and up to RM1 million; and the Head of Division throughout the quotation regime.
	M
	DAL §3.1.4.4 item 5; §3.1.4.3 item 6
	The S.O. is populated automatically at contract execution from the contract value and cannot be keyed. Contract RSAJ/KP/T/02/2026 at RM1,077,508.60 resolves to the Functional Director.
	Drawing CEO, Functional Director and Head of Division as three separate roles will produce a model that is wrong for every contract but one band. SK005 never says who appoints the S.O. — [ASSUMPTION] that it is automatic from the DAL band.
FR-SUP-002
	The system shall require the Superintending Officer to record satisfaction that a proposed delegate has the ability and experience needed before delegating.
	M
	SK005 §7.3.2
	A delegation cannot be created without the competency confirmation recorded against the S.O.
	No competency criteria are stated.
FR-SUP-003
	The system shall generate the Letter of Delegation of Authority and the Notification of Delegation of Authority in the correct variant — Appendix A/1 and A/2 for conventional contracts, or B/1 and B/2 for Design & Build and Turnkey — and shall type the delegate as Principal (Wakil P.P. Utama), Specialist (Wakil P.P. Pakar) or Specialist Quantity Surveyor (Wakil P.P. Pakar — Juruukur Bahan).
	M
	SK005 §7.3.1, §7.3.3
	The correct letter pair is generated from the contract type. The delegate type is recorded and drives permission scope.
	The A/2 and B/2 notification is what makes the delegation opposable to the contractor.
FR-SUP-004
	The system shall enforce the delegation constraints: no sub-delegation; no communication with the contractor on matters outside the delegated scope; variation instructions remain subject to prior DAL approval; and a Specialist Representative must confirm availability of the allocation (peruntukan) and route variation applications through the Principal Representative.
	M
	SK005 §7.3.4(a)–(d), §7.2.3
	A delegate cannot re-delegate. Communication and instruction actions outside scope are unavailable. A Specialist Representative's variation application cannot be submitted without a funding confirmation and is routed to the Principal Representative.
	This is a genuine security requirement, not a display rule.
FR-SUP-005
	The system shall record possession of site and the Date of Possession, and shall start the contract clock from it.
	M
	SK010 flowchart; form fields on VO-660, CPO and PMKD
	The Date of Possession is recorded once and drives the completion-date computation.
	[ASSUMPTION] as an explicit step — the SOPs presuppose it without describing it.
FR-SUP-006
	The system shall accept the contractor's work programme, or the Service and Maintenance Implementation Schedule for annual contracts, shall record the S.O. Representative's scrutiny of whether it reflects a reasonable and realistic sequence of contract operations with reasonable commencement and completion dates, and shall record approval by the Principal S.O.'s Representative, after which all parties must comply with it.
	M
	SK005 §7.4.2(a),(b), §7.5.4
	A programme cannot be approved without a recorded scrutiny. The approved programme becomes the baseline for progress measurement.
	The reject path is not stated in the SOP — Section 12 blocker B4.
FR-SUP-007
	The system shall provide a daily site diary requiring an entry every day, dual-signed by the responsible officer and the contractor's agent, who must meet at the end of each day to check and agree accuracy, maintained from the commencement date to the completion date.
	M
	SK005 §7.5.2(b),(c),(d)
	A missing day raises an exception on the contract dashboard. An entry is not complete until both signatures are captured. Entries cannot be back-dated without a recorded exception.
	This is the highest-frequency transaction in the entire process and the strongest case for a mobile form. SK005 gives no dispute path where the two parties disagree — [ASSUMPTION] that a disagreement is recorded on the entry and escalated to the S.O.
FR-SUP-008
	The system shall record inspection and endorsement of the site diary by the superior officer and the Superintending Officer at each site visit.
	S
	SK005 §7.5.2(e)
	Each site visit produces an endorsement against the diary entries for the covered period.
FR-SUP-009
	The system shall maintain the pipe log and as-built drawings as controlled documents throughout the works, updated as soon as practicable after completion, and shall require one set to be handed to the Implementing Department.
	M
	SK005 §7.5.3; SK009 §7.6
	Both document sets exist on the contract, are versioned, and the handover is recorded.
	SLA conflict: OM/P/010 §8.13 requires as-built drawings within 3 months after the CPC; OM/P/007 §8.22 allows 6 months for the three A3 PAAB-format sets; SK009 §7.6 sets no deadline at all. Most plausibly two differently scoped obligations — confirm.
FR-SUP-010
	The system shall compute and flag Project In Delay status where actual physical work progress is less than 70% of the Programme Schedule, or where the Work Completion Date has lapsed with site work incomplete.
	M
	SK005 §7.4.2(d)
	The flag is computed automatically from the approved programme and recorded progress, is visible on the contract and on the portfolio dashboard, and raises an alert.
	The single most automatable rule in SK004 and SK005.
FR-SUP-011
	The system shall support convening a Special Meeting chaired by the Superintending Officer following a Project In Delay classification, with minutes recorded.
	S
	SK005 §7.4.2(e)
	A Project In Delay flag offers the Special Meeting action. The meeting record captures attendance, chair and minutes.
	The SOP does not literally state the causal link; the sequence 7.4.2(d) to (e) implies it — [ASSUMPTION] on the link only.
FR-SUP-012
	The system shall direct the contractor immediately to review the effect on the overall completion date and submit a revised programme on the occurrence of a variation order, a Local Authority delay or any other contractual delay event, and shall record S.O. approval of the revised programme.
	M
	SK005 §7.4.2(c)
	A delay event raises the direction automatically. The revised programme replaces the baseline only on recorded approval.
	"Immediately" is not quantified. The non-approval path is not stated.
FR-SUP-013
	The system shall monitor the validity of all contract insurance policies against the works period, shall alert before lapse, and shall support the Superintending Officer's self-help right to extend the policies and deduct the premiums paid from money due to the contractor.
	M
	SK005 §7.2.4(d); SK006 §7.5.6
	An approaching lapse raises an alert. Exercising the self-help right creates a deduction line on the next interim certificate.
FR-SUP-014
	The system shall record monitoring of material quality and workmanship, local-authority and third-party regulatory compliance, worker welfare, safety, insurance protection, payment of wages due, and compliance with the Occupational Safety and Health Act.
	S
	SK005 §7.2.4(a),(b),(c),(e)
	Compliance observations are recorded against the contract and are reportable.
	Wage-compliance monitoring foreshadows the statutory-declaration gate at final payment.
FR-SUP-015
	The system shall provide the Superintending Officer with an early-action decision recording one or more of: grant an extension of time or extension of contract period; impose liquidated damages; or terminate the contractor's employment — routing to the corresponding sub-process.
	M
	SK005 §7.2.4(f)
	The decision is a three-way branch, not binary, and each branch opens the corresponding module.
	"Early action" carries no numeric trigger.
6.13.2 Advance and interim payment, retention and deductions (SK011)
Ranhill SAJ does not pay works contractors on a purchase-order, goods-receipt and invoice match. It pays on a certified interim valuation, CPD/B.INT(T), carrying retention, LAD set-off, advance recoupment, employer-paid premiums and wages, and a four-way pro-rata payment waterfall — with its own DAL approval band on the certificate itself. The prototype builds a D365 accounts-payable flow instead, and all four of those screens are unreachable. Note also that SK011's advance-payment pages are missing from the corpus: there is no advance-payment eligibility rule, percentage, guarantee clause or recoupment schedule anywhere.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-PAY-001
	The system shall support an advance payment application with a mandatory Advance Payment Guarantee issued by a bank or insurance company, and shall route approval to the CEO with recommendation by the Head of Division and joint recommendation or proposal by Contract & Procurement, with no value band.
	M
	DAL §3.1.4.4 item 15; SK008 §7.7.2(a)
	Advance payment always routes to the CEO whatever the amount. The guarantee is recorded in the securities register before payment.
	Advance payment is effectively undocumented: CEO-approved with no band in the tender regime, absent entirely from the quotation regime, and SK011 — the SOP titled "Advance Payment and Interim Payment" — contains no advance-payment content. Section 12 blocker B2. The eligibility rule, percentage and recoupment schedule must be supplied by RSAJ.
FR-PAY-002
	The system shall recoup advance payment through deduction lines on each interim certificate, separately for the main contractor and for nominated sub-contractors, against a configurable recoupment schedule.
	M
	CPD/B.INT(T) TOLAK item 1; [ASSUMPTION] for the schedule
	Each certificate shows the advance recoupment lines and the running unrecouped balance.
	The recoupment rate is stated nowhere.
FR-PAY-003
	The system shall fix and record a specific day each month as the site valuation date, agreed with the contractor, and shall notify all parties.
	M
	SK011 §7.2.3(a)
	The valuation calendar is set at contract start and drives the valuation cycle.
FR-PAY-004
	The system shall support both entry points into the interim payment cycle — a valuation-driven cycle on the agreed monthly date, and a claim-driven cycle on receipt of a contractor claim — and shall record which applies to each certificate.
	M
	SK011 §7.2.3(a),(b) vs §8.0 flowchart step 1; §7.2.6
	Both paths produce a certificate; the certificate records its trigger and the date from which the issue period runs.
	Not a defect in the sources — two legitimate initiation paths that must both be supported.
FR-PAY-005
	The system shall accept the contractor's materials-on-site list, stating type, quantity and storage location on site, on or before the valuation date, and shall accept specialist sub-contractor and supplier valuations and any assignee claim or invoice by the same cut-off.
	M
	SK011 §7.2.3(f),(i),(l)
	Submissions after the valuation date are held for the next cycle. The cut-off is hard.
FR-PAY-006
	The system shall support a joint site valuation of work executed and unfixed materials and goods delivered, with the valuation method following the contract and recorded as explained to and agreed with the contractor.
	M
	SK011 §7.2.3, §7.2.3(c)
	A valuation record exists with the participants, the method and the contractor's agreement or dissent.
FR-PAY-007
	The system shall value unfixed materials on site only where they are adequately protected, are not delivered too early, and form part of the completed Works, excluding formwork and other temporary works, and shall apply a configurable percentage defaulting to 75%.
	M
	SK011 §7.2.3(g); CPD/B.INT(T) I37
	The three eligibility tests are recorded per material line. The percentage is configurable per contract and defaults to 75%.
	Conflict: SK011 says "a percentage as stated in the contract"; the B.INT form prints 75% as a fixed label. Make it configurable with 75% as the default — hard-coding would silently override a contract that says otherwise.
FR-PAY-008
	The system shall include the value of variation work only where VOC approval has been obtained, and shall check at valuation time whether including the variation would cause the Total Contract Sum to be exceeded, requiring a Variation Order Certificate to be prepared and submitted for approval where it would.
	M
	SK011 §7.2.3(e)
	A variation without VOC approval cannot be valued. The running contract sum is checked at every valuation, not only at variation time.
FR-PAY-009
	The system shall value Preliminaries and General Items, categorised per item as payable in the first payment, progressively by time or progress, or on completion; and where the priced insurance amount exceeds the actual premium paid, shall pay the actual premium in the first valuation and the balance progressively.
	S
	SK011 §7.2.3(d)
	Each preliminaries item carries its payment category. The insurance rule is applied automatically where the priced amount exceeds the actual premium.
FR-PAY-010
	The system shall record nominated sub-contractor, nominated supplier and assignee values separately, as Lampiran A1, A2 and A3 to the certificate.
	M
	SK011 §7.2.3(h),(l); CPD/B.INT(T)
	The three annexes exist as child tables and their totals feed the certificate lines.
	The three annex schedules are not in the supplied file set and are referenced by column number — columns 4, 5, 6, 9 and 10 are cited, so each has at least ten columns. This is a blocking data gap for the payment schema. Section 12 blocker B1.
FR-PAY-011
	The system shall apply the deduction block to every interim certificate: retention split three ways between main contractor, nominated sub-contractors and nominated suppliers; previous interim payments; advance repayment; liquidated damages at the stated rate, unit, from-date and to-date with a rounding adjustment; insurance premiums and PERKESO contributions paid by Ranhill SAJ; workers' wages paid by Ranhill SAJ; costs arising from the contractor's failure to comply with S.O. instructions; and up to three other permitted deductions.
	M
	CPD/B.INT(T) KURANGAN and TOLAK blocks
	All deduction lines are present, computed where a rule exists and keyed where it does not, and the certificate arithmetic balances.
	The retention percentage is not stated in any SOP, in the DAL or on any form — it lives in the Conditions of Contract. It must be a per-contract configuration field. Section 12 blocker B3.
FR-PAY-012
	The system shall compute the certificate arithmetic: net adjustment to the contract sum as the sum of PPJHK additions and omissions; the new contract sum as the original contract sum plus the net adjustment; the gross work value as main-contractor works plus the materials-on-site allowance plus nominated sub-contractors plus nominated suppliers; the carry-forward as gross value less the less-items; and the recommended payment as the carry-forward less total deductions.
	M
	CPD/B.INT(T) I24, L25, L43, L55, L56, L94
	Every total is computed, not keyed. Changing an input recomputes the certificate.
	Two arithmetic gaps in the live workbook must be fixed, not ported: the page-2 carry-forward is a manual re-key rather than a link, and the total of the six deduction items is manually totalled rather than summed.
FR-PAY-013
	The system shall withhold the first interim certificate until the value of work executed and materials delivered reaches the lesser of RM1,000.00 and 10% of the Builder's Works Value, where Builder's Works Value equals the Total Contract Sum less Prime Cost Sums less Provisional Sums.
	M
	SK011 §7.2.4(a)(i)
	Builder's Works Value is computed from the contract baseline. The threshold is the lesser of the two figures and is displayed on the certificate screen.
	The subsequent-certificate minimum is "as stated in the contract" and must be a per-contract configuration field.
FR-PAY-014
	The system shall permit interim certificates numbered 1 to 3 to be issued and paid before the Contract Document is signed, provided the contractor has returned the signed and witnessed Letter of Acceptance, has lodged the Performance Bond and all stipulated insurance policies, and the certificate carries certified true copies of the Letter of Acceptance, the Performance Bond, the insurance policy, the contractor's bank account details and the PERKESO registration number; and shall not accept a cover note as evidence of insurance unless the premium receipt is submitted.
	M
	SK011 §7.2.5(a),(b); observed award pack
	Certificate 4 and above cannot be issued until the formal Contract Agreement is signed. A cover note without a premium receipt is refused.
FR-PAY-015
	The system shall apply the payment waterfall where the recommended payment is insufficient: first nominated sub-contractors and nominated suppliers, apportioned pro rata within that tier; then assignees, per the terms of each deed of assignment; then the contractor.
	M
	SK011 §7.2.3(m),(n),(o)
	An insufficient certificate distributes in the stated order with the pro-rata computation shown.
	The source's pro-rata wording is ambiguous: it gives the ratio as each party's amount due to the "payment recommended as due", which does not sum to one unless the denominator is the total nominated-tier due. The intended arithmetic is almost certainly the total nominated-tier due. Flag for confirmation.
FR-PAY-016
	The system shall route approval of the interim payment certificate strictly by the DAL: value more than RM500,000 to the CEO; more than RM100,000 and up to RM500,000 to the Functional Director; and up to RM100,000 to the Head of Division; and in the quotation regime, interim payment, final payment and release of retention sums to the Head of Division with joint recommendation or recommendation by Contract & Procurement.
	M
	DAL §3.1.4.4 item 16a,b,c; §3.1.4.3 item 12
	A RM620,000 certificate routes to the CEO. A RM80,000 certificate on the same contract routes to the Head of Division.
	Implement the DAL's three bands, not the routing sheet's two. CPD/INT-SFA-INDEN(i) prints only "APPROVED BY CEO ≥ RM500K / APPROVED BY S.O < RM500K", which will misroute a RM80,000 certificate on a contract above RM3 million, and uses ≥ where the DAL uses > — a one-ringgit boundary discrepancy.
FR-PAY-017
	The system shall capture the two signature blocks on the interim certificate in printed order: first the Quantity Surveyor or Recommending Officer, then the Officer Authorised to Certify.
	M
	CPD/B.INT(T) signature blocks
	The certificate cannot be issued out of signature order.
	SK011 §7.2.7 says the P.P. approves; the flowchart says P.P. or Wakil P.P. Treat P.P.-only as the safe rule, consistent with SK012 §7.2.5(b): delegates who may issue instructions have no authority to approve values.
FR-PAY-018
	The system shall issue the certificate within the period stipulated in the contract, counted from the valuation date or the date of receipt of the contractor's claim, and shall track the routing service-level targets printed on CPD/INT-SFA-INDEN.
	S
	SK011 §7.2.6; CPD/INT-SFA-INDEN(i),(ii)
	The clock runs from the recorded trigger date. Variant (i) totals 52 days (checking and verification 21, interim or final 21, Accounts & Finance 10); variant (ii) totals 41 days (21, approval by S.O. 5, 15).
	"Within the period stipulated in the contract" — no number in the SOP. For minor works routed via PAAB the target is 14 days from claim receipt.
FR-PAY-019
	The system shall forward the approved certificate to Accounts & Finance to enable payment, with a copy to the Implementing Department, and shall record the payment batch number and payment date returned by Finance.
	M
	SK011 §7.2.7; CPD/INT-SFA-INDEN
	The certificate carries the batch number and payment date once Finance has paid.
	No distribution list is printed on the B.INT form itself, unlike VO-663 and the CPC and CMGD.
FR-PAY-020
	The system shall support the PAAB minor-works payment variant, in which the contractor claims to PAAB through a letter to Ranhill SAJ with seven mandatory attachments, documents are certified by the District Executive or Contract Inspector, checked by the headquarters Executive or Technician, valued in a tripartite joint valuation with the Project Department, C&P and the contractor, and C&P issues the Interim Payment Certificate to PAAB within 14 days of claim receipt.
	S
	OM/P/006 §8.1–8.6
	A PAAB-funded minor-works contract follows this variant and its 14-day target.
	PAAB, not Ranhill SAJ, is the paymaster for minor works. OM/P/006 §8.6 literally reads "not less than 14 days"; two of three statements in the same document say maximum — treat 14 days as a maximum.
FR-PAY-021
	The system shall maintain a running retention balance per contract, split three ways, and shall support release of 50% of the retention money on submission of as-built drawings and release of the balance after the final defects inspection and issue of the Certificate of Making Good Defects.
	M
	OM/P/007 §8.23–8.26; SK009 §7.7.4; DAL §3.1.4.3 item 12
	The retention balance is visible at all times. A 50% release is blocked until as-built drawings are recorded; the balance is blocked until the CMGD is issued.
	No retention-release row exists in the DAL tender regime at all — only in the quotation regime at Head of Division. Section 12 OQ-12.
6.13.3 Variation orders and the 660 / 661 / 662 / 663 chain (SK012)
The most complex approval rule in the DAL, and the one entirely unrepresented in the prototype. The form chain is CPD/VO-660(T) → CPD/VO-661(T) or CPD/VO-662(T) or CPD/VO-661&662(T) → optionally CPD/VO(CONSENT)-PAAB → CPD/APP(T) → CPD/VO-663(T).
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-VAR-001
	The system shall support origination of a variation need by the Implementing Department, with review by the S.O.'s Representative, and shall also support origination by the S.O.'s Representative directly.
	M
	SK012 §8.0 flowchart step 1 (Pindaan 02) vs §7.2.3(a) narrative; OM/P/010 §8.6
	Both origination paths exist and are distinguishable on the record.
	Originator conflict. The flowchart is one revision newer (02.01.2026 against 08.05.2025) and is corroborated by OM/P/010; support both.
FR-VAR-002
	The system shall require a Specialist S.O.'s Representative to confirm the availability of the allocation (peruntukan) before a variation application is submitted, and shall route the application through the Principal Representative.
	M
	SK005 §7.3.4(d)
	A specialist-originated application cannot be submitted without a budget confirmation, and appears in the Principal Representative's queue.
	This budget-availability check is omitted entirely from SK012 — it exists only in SK005.
FR-VAR-003
	The system shall generate the Application to Implement Variation Order (CPD/VO-660(T)) capturing applicant details; contract details including contract sum, date of possession, original completion date, extension of time granted and current progress percentage with date; and, for the variation itself, the VO number, description, reason for doing it as a variation, estimated amount and percentage of this variation, cumulative approved variation value and percentage to date, the new contract sum including this variation, and whether there is an implication for the original contract period.
	M
	SK012 §7.2.3(a),(b); CPD/VO-660(T)
	The application cannot be submitted with any of the seven variation fields empty. The cumulative and new-sum figures are computed from the contract record.
FR-VAR-004
	The system shall apply the prior-approval exemption test, exempting from prior approval: variations causing a reduction in the Total Contract Sum; adjustment of Prime Cost Sums; adjustment of Provisional Sums; and re-measurement of provisional quantities — and shall route exempt variations straight to instruction without the committee chain.
	M
	SK012 §7.2.1(b)
	An exempt variation bypasses the VOC and the DAL approval tiers and proceeds directly to the S.O.'s Instruction, with the exemption category recorded.
	The flowchart has no fast path for these and routes everything through the VOC. The narrative governs. This is the omission most likely to bite on go-live — routing exempt variations through the committee would gridlock it.
FR-VAR-005
	The system shall record the Superintending Officer's decision on the application as DISOKONG or TIDAK DISOKONG, with a value cap where supported, and shall route a TIDAK DISOKONG outcome to a configured destination.
	M
	SK012 flowchart; CPD/VO-660(T)
	The decision and the value cap are recorded. The not-supported branch has a destination.
	The TIDAK DISOKONG branch has no destination drawn in the flowchart — Section 12 blocker B4.
FR-VAR-006
	The system shall test whether a negotiated agreed rate already exists, and shall produce a Confirmation of Agreed Price where it does, or bypass to the schedule form where it does not.
	M
	SK012 flowchart; §7.2.5(a)(i)(7)
	The agreed-rate branch is recorded on the variation record and determines which schedule form is produced.
FR-VAR-007
	The system shall produce the correct variation schedule form — CPD/VO-661(T), CPD/VO-662(T) or CPD/VO-661&662(T) — from a single Variation Application entity with a form-variant selection, and shall carry the foreign-key reference to the governing CPD/VO-660(T) on each.
	M
	SK012 flowchart step 6; forms 6c–6e
	One entity produces all three variants. Every schedule cites the VO-660 approval reference.
	Which form maps to which branch is not stated anywhere in the source. The probable reading is: agreed rate exists → 661&662; no agreed rate → 662 alone. This is a guess and must be confirmed. VO-661&662 is a pure union of 661 and 662.
FR-VAR-008
	The system shall require three separate DAL approvals where applicable: prior approval to issue the instruction; approval to increase the value of a previously approved variation; and approval to use prices or rates not found in the contract.
	M
	SK012 §7.2.2(b)(i),(ii),(iii)
	Each of the three events raises its own approval, recorded separately.
FR-VAR-009
	The system shall obtain PAAB consent on CPD/VO(CONSENT)-PAAB for variations affecting PAAB-funded assets, capturing the nine-member Variation Order Committee decision as AGREE or DISAGREE with comments per member.
	M
	Form 6g; DAL §1.4
	A PAAB-funded variation cannot proceed to instruction without a recorded consent decision from a quorate committee.
	The nine members are Chairman (Chief Operating Officer), Deputy Chairman (Chief Financial Officer) and the Heads of the Production & M&E, Planning & Development, Network & NRW, Customer Management, Finance & Contract, Business Support and Quality Management Divisions. Member names are hard-coded on the template today and must become maintained data.
FR-VAR-010
	The system shall record a mandatory, non-delegable recommendation by the Variation Orders Committee on every variation row in both regimes, other than those exempted under FR-VAR-004.
	M
	DAL §3.1.4.3 item 5; §3.1.4.4 item 7
	A variation cannot reach its approving authority without a quorate VOC recommendation. The recommendation cannot be delegated or skipped.
	MR by VOC appears on every VO row and every EOT row in the tender regime. The quotation regime shows no MR at or below 20%.
FR-VAR-011
	The system shall route variation approval in the tender regime through the two-dimensional matrix of contract value band by variation percentage band: for contracts above RM3 million, above 30% to the Tender Board and up to 30% to the CEO; for contracts above RM1 million and up to RM3 million, above 30% to the Tender Board, above 10% and up to 30% to the CEO, and up to 10% to the Functional Director; for contracts above RM300,000 and up to RM1 million, above 15% to the Tender Board, above 10% and up to 15% to the CEO, above 5% and up to 10% to the Functional Director, and up to 5% to the Head of Division.
	M
	DAL §3.1.4.4 item 7a, 7b, 7c; CPD/DFA/VO(T)
	All nine cells are reproduced exactly. A 12% variation routes to the CEO on a RM750,000 contract and to the CEO on a RM2.4 million contract, but a 12% variation on a RM750,000 contract and a 4% variation on the same contract route to different authorities.
	The percentage triggers differ per contract band — 30% for the two upper bands but 15%, 10% and 5% for RM300K to RM1M. Both dimensions must be implemented. The printed matrix on CPD/DFA/VO(T) reproduces all nine cells exactly but omits the VOC mandatory recommendation.
FR-VAR-012
	The system shall route variation approval in the quotation regime through the one-dimensional matrix: more than 50% of contract value to the CEO with mandatory recommendation by the VOC; more than 20% and up to 50% to the Functional Director with mandatory recommendation by the VOC; and up to 20% to the Head of Division.
	M
	DAL §3.1.4.3 item 5a, 5b, 5c; CPD/DFA/VO(SH)
	The three bands are reproduced exactly and are distinct from the tender matrix.
	The same DAL row covers VO additions, expansion of the provisional sum and re-measurement in the quotation regime.
FR-VAR-013
	The system shall implement the VOC rework loop: a TIDAK SETUJU decision returns the variation for review and resubmission to the VO Committee.
	M
	SK012 flowchart connector B
	A rejected variation returns to the tabling step with the rejection reason attached.
	This is the only properly drawn rework loop in the entire post-award SOP set.
FR-VAR-014
	The system shall provide a Commenced Pending Approval state in which variation work may proceed once support has been obtained from the Superintending Officer or the S.O.'s Representative, while formal approval is being obtained, and shall report the aggregate financial exposure of all variations in that state.
	M
	SK012 §7.2.2(c)
	A variation can be marked commenced pending approval only with recorded S.O. support. An exposure report lists every such variation with its estimated value and age.
	This explicitly qualifies the mandatory-prior-approval rule and is what actually happens. Suppressing it would drive the practice off-system. The flowchart has no representation of it.
FR-VAR-015
	The system shall generate the Superintending Officer's Instruction (CPD/APP(T)) in writing, signed by the Superintending Officer, with particulars identical to the Contract Document, all fields completed, a clear, concise and accurate description, plans or sketches attached, and site or daywork records instructed where required; and shall set the Instruction date as the date of signature.
	M
	SK012 §7.2.4(a),(b),(d)
	The instruction cannot be issued before approval, cannot be issued unsigned, and its date is derived from the signature.
FR-VAR-016
	The system shall support the oral-instruction confirmation loop: confirmation to the contractor within seven (7) days or as the Conditions of Contract state; verification on receipt of the contractor's written confirmation that the oral instruction was in fact issued and matches intent; and a written objection within seven (7) days of receipt of that confirmation where it does not.
	M
	SK012 §7.2.4(c),(d)(ii)
	Both seven-day clocks run and alert. The form holds two dates: the date the oral instruction was issued and the date of the written instruction.
FR-VAR-017
	The system shall measure and value variations promptly, requiring measurement during execution or detailed records where work will be covered up, requiring every item to be measured under a heading identical to the description in the S.O.'s Instruction, and prohibiting the combining or merging of variation items.
	M
	SK012 §7.2.5(a)(i)(1)–(7)
	A measurement line cannot be created without a matching instruction heading. Merging two variation items is refused.
	Hard rule: one instruction produces discrete, non-merged items.
FR-VAR-018
	The system shall value variations using contract rates from the Bills of Quantities or Schedule of Rates with any percentage adjustment applied, citing the source item; and shall label any rate not derived from the contract as an agreed rate (kadar harga yang dipersetujui) requiring separate DAL approval.
	M
	SK012 §7.2.5(a)(i)(4),(6),(7)
	Each valued line cites its rate source. A non-contract rate cannot be used without a separate recorded approval.
FR-VAR-019
	The system shall require daywork labour and plant time records to be checked and agreed with the contractor or its representative every day, and shall require the contractor to submit vouchers, receipts, wage books and timesheets within seven (7) days of execution.
	M
	SK012 §7.2.5(a)(i)(3),(8)
	A daywork record without a same-day agreement is flagged. Substantiation received after seven days is flagged as late.
FR-VAR-020
	The system shall generate the Certificate of Variation of Works (CPD/VO-663(T)) with the addition or omission direction, the reference and date of the governing S.O.'s Instruction, the original contract sum, the measurement and valuation particulars, and the valuation clause selected from Klausa 25 or Klausa 28; and shall enforce that the description of the additional work on the certificate is identical to the description on the Instruction.
	M
	SK012 §7.2.5(a)(ii); form 6f
	A mismatch between the certificate description and the instruction description blocks issue. The instruction is attached to the certificate.
	A full-text search of the SOP corpus for "663" returns zero hits — the SOP describes this certificate exhaustively without ever naming its code. Resolve by adding the code to the SOP, not by doubting the form.
FR-VAR-021
	The system shall require the Variation Order Certificate to be approved and signed by the Superintending Officer, after the Recommending Officer, and shall not permit an officer empowered to issue instructions to approve the value of the variation.
	M
	SK012 §7.2.5(b)
	The certificate offers no approval action to a user holding only instruction authority. The certificate date is the date of the S.O.'s signature.
	The Pindaan-02 flowchart assigns certificate approval to the C&P Department. The narrative governs, with C&P recast as administrator rather than approver — the form itself has an S.O. signature block and no C&P approval block.
FR-VAR-022
	The system shall capture the contractor's signature and a witness signature on the certificate, and shall issue the certificate and permit payment even where the contractor objects to the valuation and refuses to sign, recording the dispute for resolution by arbitration or other means.
	M
	SK012 §7.2.5(b)
	Contractor refusal is recorded as a dispute flag and does not block issue or payment.
FR-VAR-023
	The system shall distribute the Variation Order Certificate with the original to the contractor and copies to the S.O.'s Representative, the Head of Contract & Procurement, the Head of Accounts & Finance and the bank or insurance company guaranteeing performance of the contract.
	M
	SK012 §7.2.5(c)
	Four copy recipients plus the original, each logged.
	The certificate is the trigger for financial and bond-exposure adjustment, which is why the guarantor is copied.
FR-VAR-024
	The system shall maintain the cumulative approved variation value and percentage against each contract, and shall display it on every variation application and certificate.
	M
	CPD/VO-660(T) §3.5; CPD/VO-661(T) §1.8; CPD/VO-662(T) §1.9
	The cumulative figure is computed from approved variations and cannot be keyed.
	No cumulative variation ceiling exists anywhere in SK012 or the DAL. The percentage bands determine who approves, not whether the variation is permitted.
6.13.4 Contract price adjustment (SK013)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-PAD-001
	The system shall support five adjustment triggers: variation of works; a contractor claim for loss or expense; re-measurement of provisionally measured Bills of Quantities work; adjustment of Prime Cost Sums and Provisional Sums; and material price fluctuation together with extension of the contract period.
	M
	SK013
	Each trigger is selectable and routes to the correct section of the certificate.
FR-PAD-002
	The system shall generate the Certificate of Adjustment of Contract Sum (CPD/PPJHK(T)) with section 1.1 listing variation-driven adjustments by variation number, description, addition and omission; section 1.2 listing other adjustments; section 1.3 summarising both; and a reconciliation of the original contract sum plus prior PPJHK adjustments plus this adjustment to the revised contract sum, stated also in words with an addition or omission direction.
	M
	SK013; form 7
	All four blocks are produced and the arithmetic balances. The basis of calculation is attached.
	The live workbook contains zero formulas — the entire contract-sum adjustment arithmetic is manual. This and the terminated-contract certificate are the two highest-value automation targets in the set.
FR-PAD-003
	The system shall treat the Certificate of Adjustment of Contract Sum as the master record of contract-sum movement, and shall require one to be produced even where a Variation Order Certificate already exists for the same change.
	M
	SK013
	A variation certificate does not satisfy the adjustment requirement. The interim and final certificates read the revised contract sum from the adjustment certificate, not from the variation.
FR-PAD-004
	The system shall route re-measurement of provisional quantities in the tender regime to the Tender Board where it exceeds 30% of contract value, with recommendation by the Head of Division and joint recommendation or proposal by Contract & Procurement, and to the CEO, Functional Director or Head of Division acting as SO/PD where it is 30% or less; and in the quotation regime shall route it through the variation percentage bands.
	M
	DAL §3.1.4.4 item 8a, 8b; §3.1.4.3 item 5
	A re-measurement of 35% on a tender contract routes to the Tender Board.
FR-PAD-005
	The system shall support a price fluctuation adjustment computed by a configurable formula and index, applied only where the contract provides for it.
	S
	SK013; SK011 §7.2.3(k)
	Where no formula is configured, the adjustment can be keyed with supporting calculation attached.
	SK013 states no formula, no index, no thresholds and no service-level agreement. SK011 defers entirely to the contract. Section 12 OQ-13.
FR-PAD-006
	The system shall route approval of the Certificate of Adjustment of Contract Sum to a configurable authority, defaulting to the Superintending Officer as signatory after checking by the C&P Executive and verification by the Head of C&P Section, and shall record that no DAL row exists for price adjustment.
	M
	SK013; DAL critical finding 7
	The certificate is signed by the S.O. and dated by signature. The configuration records that the routing is an assumption pending a DAL amendment.
	SK013 defers thresholds to the DAL, and the DAL has no corresponding line item. A genuine gap the portal must resolve, not inherit. The closest analogues are the variation matrix and the re-measurement row.
FR-PAD-007
	The system shall capture contractor and witness acceptance of the adjustment on the certificate, and shall distribute the original to the contractor with copies to the S.O.'s Representative, the Contract & Procurement Department, the Accounts & Finance Department and the bank or insurer guaranteeing the project.
	M
	SK013
	Four copies plus the original are logged.
	The form's own printed distribution list names only two recipients. The narrative governs — the bank or insurer copy matters because a contract-sum adjustment changes the exposure the bond secures.
6.13.5 Extension of time and extension of contract period (SK006)
These are two different processes with different initiators, different entitlement tests, different instruments and different approval logic. The SK006 flowchart merges them, which is wrong for design purposes. An Extension of Time extends the Completion Date by a unilateral certificate. An Extension of Contract Period extends the term of an annual contract by a bilateral supplementary agreement.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-EOT-001
	The system shall accept the contractor's written notice of the causes of delay, given to the Superintending Officer immediately upon the delay occurring, and shall also permit the Superintending Officer to direct a contractor found behind schedule to give reasons why the work is late.
	M
	SK006 §7.3.1, §7.3.2
	Both entry paths exist. The notice is timestamped and attached to the delay record.
	"Immediately" carries no day count anywhere in SK006.
FR-EOT-002
	The system shall apply the entitlement test, recording whether the cause falls within a contractual delay event and is outside the contractor's control, and shall route a failed test to the non-completion and liquidated damages sub-process.
	M
	SK006 §7.1.2, §7.2.1; SK007 §7.1.1
	A failed entitlement test opens the LAD path and closes the EOT path, with the determination recorded.
FR-EOT-003
	The system shall apply the best-endeavours test, recording whether the contractor constantly used best endeavours to avoid the delay and did whatever was reasonably required by the Superintending Officer, and shall support a partial extension of time where the test is not fully met.
	M
	SK006 §7.2.2, §7.4.2
	A partial extension can be granted with the un-extended period explicitly stated.
	Neither SK006 nor SK007 says what happens to LAD in the residual un-extended window. Logically LAD applies, but no clause says so — this is a real design question, not an extraction gap. Section 12 OQ-14.
FR-EOT-004
	The system shall evaluate only actual delay (kelambatan sebenar), examining the effect on the overall completion period rather than in isolation, assessed against the contractor's approved work programme.
	M
	SK006 §7.4.1
	The evaluation record shows the programme against which the delay was assessed.
FR-EOT-005
	The system shall apply the exceptionally inclement weather test, refusing an extension for weather that is not exceptional, treating monsoon season and heavy rain normal for the area as not exceptional and already allowed for in the tender, requiring proof of exceptionality against meteorological records preferably covering not less than three (3) years, and permitting additional time for drainage or drying out of ponded or waterlogged areas on earthworks.
	M
	SK006 §7.4.3
	A weather claim requires attached meteorological evidence. The three-year guidance is displayed. The earthworks allowance is a separately recorded component.
FR-EOT-006
	The system shall assemble the extension-of-time submission pack containing: how the proposed period was calculated with bar charts or other calculation methods attached; where Ranhill SAJ is responsible for the delay, whether the cause is resolved and if not what steps are being taken; whether the contractor has made or will make a claim for loss or additional expense and the estimate; the progress achieved at the date the certificate is prepared and the balance of work; and whether the contractor can complete by the proposed Extended Completion Date and, if not, the estimated completion date.
	M
	SK006 §7.5.7(a)–(e)
	All five items are captured. The loss-and-expense estimate creates a linked record that feeds the price-adjustment and final-account modules.
FR-EOT-007
	The system shall route extension-of-time approval on the cause of the financial impact, not on value: with financial impact not due to an authority requirement to the Tender Board with mandatory recommendation by the VOC; with financial impact due to an authority requirement to the CEO with mandatory recommendation by the VOC; and with no financial impact to the CEO, Functional Director or Head of Division acting as SO/PD with mandatory recommendation by the VOC.
	M
	DAL §3.1.4.4 item 10a(i), 10a(ii), 10b; quotation regime §3.1.4.3 item 6
	The three branches are selectable and route correctly. In the quotation regime, delay and extension of time, liquidated damages and suspension of works all route to the Head of Division as SO/PD with joint recommendation or recommendation by C&P.
	No monetary threshold exists for extension of time in either source. Conflict: SK006 §7.6.1 as amended on 12.01.2026 makes the VOC itself the approver in the no-financial-impact case, while the DAL makes the SO/PD the approver with the VOC as mandatory recommender. Build the DAL; escalate urgently — decision D2.
FR-EOT-008
	The system shall generate the Certificate of Delay and Extension of Time (CPD/EOT(T)) with all information filled in exactly as it appears in the Contract Document, each ground for extension per the Conditions of Contract, the actual period granted, and a repeating reason table carrying reason, clause, period of delay and extension, and a concurrent-or-consecutive flag.
	M
	SK006 §7.5.2, §7.5.5; form 2
	The certificate reproduces the printed form. The date is the date of signature by the authorised officer.
	Sequencing: the committee approves the application; the certificate is then drafted, reviewed and signed. This gives the two approval layers that §7.7.1 and the flowchart both require.
FR-EOT-009
	The system shall extend lapsed insurance policies on the Superintending Officer's authority where the certificate is about to issue with policies unextended, and shall create a deduction line for the premiums paid on the next interim certificate.
	M
	SK006 §7.5.6
	Exercising the right creates the deduction line automatically.
FR-EOT-010
	The system shall route distribution of the extension-of-time certificate with the original to the contractor and copies to the S.O.'s Representative, the Contract & Procurement Department and the bank or insurance company guaranteeing project performance.
	M
	SK006 §7.7.1, §7.8.1
	One original and three copies are logged.
FR-EOT-011
	The system shall support Extension of Contract Period as a distinct process initiated by the Implementing Department on current needs, requiring four cumulative preconditions: the contractor's prior agreement; retention of the existing terms and conditions; retention of the existing rates (kadarharga sediada); and satisfactory contractor performance — together with compliance with the SPAN Act.
	M
	SK006 §7.2.3, §7.3.3, §7.4.4
	All four preconditions must be confirmed before evaluation. The SPAN Act compliance confirmation is mandatory.
	The SOP is silent on the fallback if any precondition fails.
FR-EOT-012
	The system shall route Extension of Contract Period approval to the Tender Board Committee in the tender regime with joint recommendation or recommendation by Contract & Procurement, and to the Functional Director in the quotation regime with mandatory recommendation by the Quotation Committee, and shall record that no value band exists in the DAL for this item.
	M
	DAL §3.1.4.4 item 9; §3.1.4.3 item 9
	Every term-contract extension in the tender regime routes to the Tender Board regardless of value.
	Triple inconsistency — decision D2. SK006 §7.6.2 sets a RM50,000.00 financial-impact threshold above which the Tender Board approves after a VOC recommendation, gives the no-financial-impact case to the VOC alone, and leaves the band from RM0.01 to RM50,000 with financial impact entirely undefined. The DAL has no threshold at all and its quotation-regime answer appears in neither SK006 branch. Do not default the undefined band.
FR-EOT-013
	The system shall generate a Supplementary Agreement for Extension of Contract Period (Perjanjian Tambahan) as a bilateral instrument signed by both Ranhill SAJ and the appointed contractor, for annual service and maintenance contracts whose extension has been approved.
	M
	SK006 §7.1.2, §7.5.1
	The agreement is generated, reviewed by the S.O.'s Representative, executed by both parties and distributed.
	No template exists in the form inventory — Section 12 blocker B6. Distribution is not separately specified in the SOP either.
6.13.6 Non-completion and liquidated damages (SK007)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-LAD-001
	The system shall establish the liquidated damages trigger only where completion is late and the causes of delay do not entitle the contractor to an extension of time.
	M
	SK007 §7.1.1, §7.2.1
	The LAD path cannot open while an extension-of-time entitlement determination is outstanding or positive.
FR-LAD-002
	The system shall take the liquidated damages rate and unit from the value fixed in the Letter of Acceptance and carried into the contract baseline, and shall not permit it to be keyed at the point of imposition.
	M
	SK007 §7.1.2
	The rate on every LAD calculation resolves to the contract baseline value.
	LAD rate is contract-instance data set at award time, not process data. The only documented formula in the corpus is 0.025% × Original Contract Sum per day, from the contractor-performance workbooks. No cap is defined anywhere. The prototype's 0.1% per day capped at 10% is wrong on both counts.
FR-LAD-003
	The system shall issue a standard warning letter of the intention to impose liquidated damages before liquidated damages are imposed, sent by Registered Post, capturing the extension-of-time clause and extended completion date, the LAD or non-completion clause, the LAD rate per unit, and the contractor's right to submit reasons in writing to the Superintending Officer within seven (7) days of receipt.
	M
	SK007 §7.2.2; form 8a
	The letter is generated with all fields, despatched by registered post with a consignment reference, and starts a seven-day response clock.
	Explicitly not a contractual requirement — internal good practice. No minimum warning period is prescribed in the SOP, but the letter itself hard-codes the seven-day response window. The letter has two competing names; adopt one canonical name and record the other as an alias.
FR-LAD-004
	The system shall generate the Certificate of Non-Completion (CPD/CNC(T)) with all particulars filled in exactly as they appear in the Contract Document, the scope choice of whole works or part, the extension-of-time clause, the date the works ought to have been completed, the liquidated damages clause, the rate per unit, and the expiry date of the relevant insurance policies, and shall require insurance cover to be extended to the expected completion date.
	M
	SK007 §7.3.1, §7.3.2
	The certificate cannot be issued without the insurance expiry stated. The date on the certificate is the date of signature.
FR-LAD-005
	The system shall assemble the non-completion submission pack containing, where required: the S.O. Representative's statement that the case has been studied in depth, the contractor's ability to continue and complete has been evaluated, and whether imposing liquidated damages will ensure completion as soon as possible, with reasons; the progress achieved, the balance of work and a calculation of when the balance can be completed; whether Ranhill SAJ is responsible for any delay, whether a reasonable extension has been granted and whether further employer delay is anticipated; and details of interim payments and the reasons for any late or non-payment.
	M
	SK007 §7.3.3(a)–(d)
	All four items are capturable and are attached to the certificate.
	The SOP caveat "sekiranya perlu" makes these conditionally required — ambiguous. Treat as required with a documented exception.
FR-LAD-006
	The system shall route the Certificate of Non-Completion through the review chain printed on CPD/DFA/CNC-CPC-CMGD — endorsed by the Department Head of Department, checked by the Executive, verified by the Head of Section, recommended by the Head of Contract & Procurement, approved by the Superintending Officer — with attachments comprising the progress report, the warning letter and other supporting documents, against a total processing target of four weeks.
	M
	CPD/DFA/CNC-CPC-CMGD; SK007 §7.4.1
	The four-step chain is enforced and the four-week clock runs from DATE (1) to DATE (2).
	The review step exists only in the flowchart and on the routing sheet; the narrative goes straight from preparation to approval. Build the four-step chain. SK007 §7.4.1 names a single approver — the S.O. — and invokes no DAL clause; the DAL puts the same item at CEO, Functional Director or Head of Division acting as SO/PD.
FR-LAD-007
	The system shall treat issue of the Certificate of Non-Completion as a mandatory precondition to imposing liquidated damages, and shall not permit an LAD deduction line to be created on any certificate before it is issued.
	M
	SK007 §7.1.2
	An LAD deduction is unavailable until the certificate exists.
FR-LAD-008
	The system shall compute liquidated damages as the LAD rate multiplied by the number of chargeable units, applied over an accrual window defined per contract, and shall create the deduction line on the interim certificate with rate, unit, from-date, to-date, amount, any waived amount, the waiver letter reference and a signed rounding adjustment.
	M
	CPD/B.INT(T) I79, I80; contractor-performance workbooks
	The computation is reproducible and the deduction line reproduces the printed block.
	The accrual start and end dates are not stated anywhere. Logically the window runs from the extended Completion Date to actual completion, but no clause says so — do not infer without checking the Conditions of Contract. Section 12 OQ-14.
FR-LAD-009
	The system shall route a waiver of liquidated damages or penalty in the tender regime to the Tender Board where the waiver exceeds 30% of the liquidated damages or penalty amount, and to the CEO where it is 30% or less; and in the quotation regime to the CEO at any amount.
	M
	DAL §3.1.4.4 item 12a, 12b; §3.1.4.3 item 7
	A waiver of 40% of the LAD amount routes to the Tender Board; 25% routes to the CEO.
	The threshold is a percentage of the LAD amount, not of the contract sum. The waiver is captured on only one form in the entire set — the final account.
FR-LAD-010
	The system shall reduce the liquidated damages rate in proportion to the value of any part taken over and occupied, against the Total Contract Price, and shall present the computed rate as advisory for confirmation rather than applying it silently.
	M
	SK009 §7.4.2(c)
	On partial occupation the system proposes a reduced rate computed as the old rate multiplied by one minus the ratio of the occupied part's value to the contract sum, and requires confirmation.
	The Certificate of Partial Occupation does not compute this — it captures the before and after rates as free entry. Hold the computed value as advisory only.
FR-LAD-011
	The system shall support per-section liquidated damages where sectional completion applies, using the separate LAD value stated in the tender document and contract for each section.
	M
	SK009 §7.3.1
	Each section carries its own rate and its own accrual.
FR-LAD-012
	The system shall track cumulative liquidated damages against each contract and alert where the accrual has continued beyond a configurable period, so that it does not become an oppression (deraan).
	S
	SK007 §7.6.1, §7.6.2
	An LAD accrual dashboard shows the cumulative amount and the elapsed period, and raises an alert at the configured threshold.
	No cap or ceiling on LAD accumulation is quantified anywhere; the only constraint in the corpus is this qualitative rule.
FR-LAD-013
	The system shall escalate to termination where, with liquidated damages imposed, the contractor's performance shows that completion is unlikely.
	M
	SK007 §7.6.2
	The escalation action is available from the LAD record and opens the termination sub-process.
	This escalation is completely absent from the SK007 flowchart, which ends at distribution. It is the only link from SK007 to SK008.
6.13.7 Termination of the contractor's employment (SK008)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-TRM-001
	The system shall record the ground for termination as either default in fulfilling obligations or continuous self-disablement from proceeding with and completing the works, and shall record the judgement weighing Ranhill SAJ's interest, administrative difficulty and social implications.
	M
	SK008 §7.1.1, §7.2.1, §7.3.1, §7.3.2, §7.3.3
	Both grounds are selectable and the judgement record is mandatory.
	Self-disablement permits direct termination; default is a discretionary decision interlinked with the LAD decision. No quantified criteria are given.
FR-TRM-002
	The system shall maintain a prior-notice register keyed by contract and default category, and shall permit termination without a further Notice of Intention where the default is a repeat of one for which a Notice of Intention was previously issued.
	M
	SK008 §7.2.2(e)
	A repeat default is detected automatically and offers the direct-termination path.
FR-TRM-003
	The system shall generate the Notice of Intention to Terminate stating the default committed and giving fourteen (14) days to remedy it, capturing contract number, work title, contract price, date of possession of site, date for completion, planned and actual progress percentages, the work stoppage date, days stopped, the site meeting number and date at which the contractor was warned, the extension of time granted and the completion date, with the termination clause selected from Fasal 51 or 53, sent by Registered Post and signed by the Superintending Officer.
	M
	SK008 §7.2.2(b),(c), §7.6.2; form 4b
	The notice is generated with all fields, is despatched by registered post and starts a fourteen-day remedy clock.
FR-TRM-004
	The system shall distribute both termination notices to all parties involved with the contract and specifically to the bank or insurance company that issued the Performance Bond and the Advance Payment Guarantee, the Contract & Procurement Department and the Contractor Service Centre (Pusat Khidmat Kontraktor), recording the guarantee letter number and the contractor's registration class.
	M
	SK008 §7.6.3; form 4b
	Five recipients are logged, including the guarantor and the Contractor Service Centre.
FR-TRM-005
	The system shall route termination approval to the CEO, with recommendation by the Head of Division and joint recommendation or proposal by Contract & Procurement in the tender regime, and additionally a mandatory recommendation by the Functional Director in the quotation regime.
	M
	DAL §3.1.4.4 item 13; §3.1.4.3 item 8
	Termination cannot be effected without a recorded CEO approval.
	Decision D2 — the single most serious authority conflict in the corpus. SK008 §7.5.1 states that the officer authorised to terminate is the Superintending Officer, as sole authority. The two are reconcilable only for contracts above RM3 million, where the S.O. is the CEO. For contracts between RM300,000 and RM3 million, SK008 would permit a Functional Director or Head of Division to terminate unilaterally. Build the DAL and escalate.
FR-TRM-006
	The system shall lodge claims against the bank or insurance company that issued the Performance Bond and the Advance Payment Guarantee not later than two (2) weeks from the date of termination, and shall refer the matter immediately to the Legal Advisor where the guarantor does not honour the claim within two (2) weeks from the date of the claim.
	M
	SK008 §7.7.2(a)
	Both two-week clocks run and alert. The referral action is available on expiry.
FR-TRM-007
	The system shall record the site-securing obligations: direction to the contractor to cease all site operations and leave behind all temporary buildings, plant, tools, equipment, materials and unfixed goods; 24-hour guarding of the site; denial of entry to unauthorised persons; and the rule that nothing may be taken off site without the written approval of the Superintending Officer or the Representative.
	M
	SK008 §7.7.2(b)
	Each obligation is a recorded task with a responsible officer and a completion date.
FR-TRM-008
	The system shall capture an inventory of all temporary buildings, plant, tools, equipment, materials and unfixed goods, together with a record of work completed and a photographic record, and shall record the invitation to the contractor to attend.
	M
	SK008 §7.7.2(c)
	The inventory supports photograph capture from a mobile device on site and records the contractor's invitation and attendance or non-attendance.
	These evidential records are what the terminated-contract final account depends on.
FR-TRM-009
	The system shall support re-tendering of the balance of works, observing that a record of work already completed will be prepared and agreed before any work commences; that the scope, extent and quality of materials and workmanship must not differ from the original with any required change clearly stated; that non-complying completed work and materials are identified and their removal, repair, re-execution or replacement included; and that credit is allowed to Ranhill SAJ for plant, tools and materials left on site — but the quantities must not be stated in the tender document even though the inventory is known.
	M
	SK008 §7.7.2(f)(i)–(iv)
	The re-tender pack enforces all four rules, and the inventory quantities are suppressed from the published document.
	Explicit prohibition on disclosing inventory quantities to tenderers.
FR-TRM-010
	The system shall support re-nomination of nominated sub-contractors and suppliers to the new contractor at the original sub-contract sum or original article value less amounts already paid, and shall require CEO approval to increase a sub-contract sum or supply prices, or alternatively a fresh sub-contract tender.
	M
	SK008 §7.7.2(g)
	The re-nomination value is computed. An increase cannot be recorded without CEO approval.
FR-TRM-011
	The system shall generate the Final Certificate for a Contract whose Contractor's Employment has been Terminated (CPD/PMKD(T)) as soon as a reasonable assessment of the final completion cost can be determined — normally when the contract to complete is awarded to the new contractor, without waiting for the works to be completed.
	M
	SK008 §7.8.1(a)
	The certificate becomes available on award of the new contract, not on completion.
	The only form in the set carrying budget-coding fields — Tahun Perbelanjaan, Kepala and Pecahan Kepala — which are the financial-dimension hook to the ERP. The workbook contains zero formulas.
FR-TRM-012
	The system shall compute the Cost of Completion as the total advance payment paid, plus total interim payments to the original contractor, plus total payments to nominated sub-contractors and suppliers, plus the Total New Contract Price, plus the cost of re-inviting tenders, plus the cost of loss to Ranhill SAJ, plus the on-cost charge; adjusting the New Contract Price first where the scope to be completed differs from the original.
	M
	SK008 §7.8.1(b)(i), §7.8.2(a)–(e)
	All seven components are computed or captured, and the total is derived.
	The cost of re-inviting tenders covers re-preparation of tender documents, consultant fees, re-advertising, site guarding and work-indent costs.
FR-TRM-013
	The system shall compute the cost of loss using the liquidated damages rate in the original contract as Ranhill SAJ's loss rate per day, week or month; counting, where termination occurred after the original or last-approved extended completion date, from the day after the termination date to the new contract's original completion date; and, where termination occurred before that date, from the day after the original or last extended completion date to the new contract's original completion date; and applying a re-tender period capped at 120 days, or the actual period where shorter.
	M
	SK008 §7.8.2(f)(i)–(v)
	Both timing cases produce the correct day counts, and the 120-day cap is applied where the actual re-tender period is longer.
FR-TRM-014
	The system shall apply a configurable on-cost charge as a percentage of the New Contract Price to reimburse Ranhill SAJ's administrative cost of re-inviting tenders.
	M
	SK008 §7.8.2; CPD/PMKD(T) M55
	The percentage is configurable per contract. No default is applied.
	The value is "as agreed and stated in the contract document" — no fixed percentage is given.
FR-TRM-015
	The system shall compute the Adjusted Original Contract Price as the original contract sum plus the net value of adjustment, less liquidated damages imposed, less other permitted deductions, with the net adjustment taking into account all variation orders issued before termination, whether or not executed.
	M
	SK008 §7.8.1(b)(ii), §7.8.2(g)
	Unexecuted approved variations are included in the adjustment.
FR-TRM-016
	The system shall compute the difference between the Cost of Completion and the Adjusted Original Contract Price, deduct forfeiture of the advance payment guarantee and forfeiture of the performance bond, determine the direction of payment, and issue the certificate with a demand letter sent by Registered Post not later than nine (9) months from the date of termination where the balance is owed to Ranhill SAJ.
	M
	SK008 §7.8.3(a),(b), §7.7.2(h)
	The direction of payment is derived from the sign of the balance. The nine-month clock runs from the termination date.
	The SOP is silent on the converse case, where the balance is owed to the contractor. The system must handle it; RSAJ must state the rule — Section 12 OQ-15.
FR-TRM-017
	The system shall record blacklisting of a terminated contractor for five (5) years on a first offence and permanently, until further notice, on a second, and shall reflect the blacklist status on the vendor record so that it blocks registration, document purchase and bid submission.
	M
	SK008 §7.9(a),(b)
	A blacklisted vendor cannot purchase documents or submit a bid. The status has an effective date and an expiry date for a first offence.
	The five-year period was changed from two years by amendment on 01.10.2025; the change was approved by the Tender Board Committee on 20.05.2025, minutes 10/2025.
FR-TRM-018
	The system shall refer unpaid claims to the Legal Advisor for legal action where the contractor fails to pay despite reminders.
	S
	SK008 §7.7.2(h)
	The referral is an action on the claim record with the date and referral reference captured.
6.13.8 Completion, partial occupation, defects and making good defects (SK009)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-CMP-001
	The system shall determine whether the Defects Liability Period applies from the contract type, and shall bypass the whole defects chain for annual and term service contracts.
	M
	SK009 §7.1.3
	An annual service contract proceeds from completion directly to the final certificate with no defects liability period and no Certificate of Making Good Defects.
FR-CMP-002
	The system shall support sectional completion, defined at tender stage with a separate liquidated damages value stated for each section, and shall apply the practical completion, delay and extension of time, liquidated damages and defects liability provisions to each section as if it were a separate and distinct contract — except for Works Insurance, the Performance Bond and the Final Certificate, which remain at contract level.
	M
	SK009 §7.3.1, §7.3.2
	Each section carries its own certificate, its own defects liability period from its own practical completion date and its own LAD rate. The bond, works insurance and final certificate are single and contract-level.
	Model as Contract with zero-to-many Sections.
FR-CMP-003
	The system shall support partial occupation, requiring the contractor's written agreement as a precondition, and shall generate the Certificate of Partial Occupation (CPD/CPO) within seven (7) days of the date of possession and occupation, stating the description of the part occupied, the clause reference, the date of the contractor's written consent, the part completion date, the date taken into possession and occupied, the defects liability period start and end dates for that part, the estimated value of the part and the liquidated damages reduction.
	M
	SK009 §7.4.1, §7.4.2(a)–(d)
	The certificate cannot be issued without the contractor's written consent attached. The seven-day clock runs from occupation and alerts. A separate defects liability clock starts for the occupied part.
	Insurance and performance bond release provisions remain unchanged on partial occupation.
FR-CMP-004
	The system shall determine practical completion on the test of whether the works have reached a stage at which they fulfil their construction function or can be occupied and used, notwithstanding that a small amount of outstanding work and defects remain whose rectification will not affect use.
	M
	SK009 §7.2.1
	The determination is recorded against the test with reasons.
FR-CMP-005
	The system shall require a joint inspection before the Certificate of Practical Completion is issued, and shall implement the failure loop in which unfinished or defective work is listed and handed to the contractor and the process repeats until the practical completion criteria are satisfied.
	M
	SK009 §7.2.2(a),(c)
	A joint inspection record exists with participants. The loop has no iteration limit and each iteration is recorded.
FR-CMP-006
	The system shall generate the Certificate of Practical Completion (CPD/CPC(T)), and the information-technology variant (CPD/CPC(T-IT)) where applicable, recording the clause for issue, the clause for defects liability, the scope choice of whole works or part, the practical completion date, the date taken into possession, and the defects liability period start and end dates.
	M
	SK009 §7.2.2(b); forms 3a, 3b
	The correct variant is selected from contract category. The information-technology variant carries five completion tick-boxes and a four-row Periods of Responsibility table for licence, product warranty, maintenance support service and defects liability.
	In the information-technology variant the defects liability period runs concurrently with the maintenance period by default unless the contract says otherwise.
FR-CMP-007
	The system shall attach a list of outstanding and defective work to the Certificate of Practical Completion and shall record the period set for the contractor to complete or rectify it.
	M
	SK009 §7.2.4
	The snagging list is a child table on the certificate with a period and a responsible party per item.
	"A reasonable time" is unquantified in the source.
FR-CMP-008
	The system shall start the Defects Liability Period clock from the practical completion date stated in the certificate, and shall start a separate five-year Design Guarantee Bond clock from the same date on design-and-build contracts.
	M
	SK009 §7.1.2, §7.2.4, §7.8
	Two independent clocks run. The defects liability end date drives the end-of-period inspection task.
	The defects liability period length is "as stipulated in the Contract Document" and is not quantified anywhere in SK009. KP002 gives 6, 12 or 24 months by estimate and contract type. OM/P/007 §8.25 gives 1 year, 3 months and 14 days from the certificate for pipe-laying projects. Per-contract configuration field.
FR-CMP-009
	The system shall distribute the Certificate of Practical Completion with the original to the contractor and copies to the S.O.'s Representative, the Head of Contract & Procurement, the Head of Accounts & Finance and the bank or insurance company guaranteeing performance of the contract.
	M
	SK009 §7.2.3; form 3a printed s.k:
	Four copies plus the original are logged.
	The SOP narrative lists three; the printed form lists four. Build the form's list.
FR-CMP-010
	The system shall record handover of the works to the Implementing Department by joint inspection after the Certificate of Practical Completion, together with advice on maintenance requirements including mechanical and electrical, and delivery of all documents required for maintenance including as-built drawings and operation manuals.
	M
	SK009 §7.5.1, §7.5.2(a),(b),(c)
	The handover record lists the documents delivered and is signed by the receiving department.
	After the certificate the contractor is no longer responsible for loss or damage other than that caused by defective work or work not complying with the contract.
FR-CMP-011
	The system shall accept defect reports from the Implementing Department during the defects liability period, requiring immediate reporting to the Superintending Officer, and shall support rectification directions at the contractor's own expense with a period set according to the condition and severity of the defect.
	M
	SK009 §7.7.1, §7.7.2(a),(b)
	A defect report can be raised from a mobile device. Each direction carries a rectification period.
FR-CMP-012
	The system shall support an expedited rectification class for any defect that causes the work to be easily damaged, that will worsen if not rectified promptly, or that affects the actual function and use of the works, requiring rectification in the shortest possible time.
	S
	SK009 §7.7.2(b)
	The expedited class is selectable and drives a shorter target and a higher-priority alert.
	The class is defined only qualitatively.
FR-CMP-013
	The system shall schedule a joint inspection on the defects liability period expiry date, shall generate a Schedule of Defects (Jadual Kecacatan) where defects are found, and shall require rectification within a reasonable time but not later than three (3) months from the date of receipt of the Schedule, with a further joint inspection on the expiry of the period given or after the expiry of the three-month period, whichever is earlier.
	M
	SK009 §7.7.2(c)(i),(iii),(iv),(v)
	Both clocks run and the re-inspection is scheduled at the earlier of the two dates.
	No template exists for the Schedule of Defects and must be built. The period for handing it over after expiry is stated only as "dalam tempoh ditetapkan" — the number is not given. Section 12 blocker B6.
FR-CMP-014
	Where the contractor fails to rectify within the time given, the system shall support immediate rectification by other means and shall record recovery of the cost by deduction from the balance of monies due, by deduction from or claim against the Performance Bond and/or the Design Guarantee Bond, or as a specific debt claim.
	M
	SK009 §7.7.2(d)
	The three recovery routes are selectable and each creates the corresponding financial entry.
	This is the only enforcement route in the whole of SK009 and it is omitted from the flowchart.
FR-CMP-015
	The system shall generate the Certificate of Making Good Defects (CPD/CMGD(T)) recording the making-good clause, the scope choice, the date defects were made good, the clause for release of the Performance Bond, the retention money or bank guarantee number and the performance bond value; and where the bond is cash, a banker's draft or a treasury deposit, shall require submission of the Official Receipt by the contractor before refund.
	M
	SK009 §7.7.2(c)(ii),(vi); form 5
	The certificate is generated with all fields. A cash bond refund is blocked until the official receipt is recorded.
FR-CMP-016
	The system shall treat issue of the Certificate of Making Good Defects as the end of the contractor's obligations under the contract, and shall release the liability of the bank or insurance company guaranteeing the Performance Bond, the Performance Guarantee Sum and the Retention Money, notifying the guarantor.
	M
	SK009 §7.7.3, §7.7.4
	Issue of the certificate triggers the release workflow and the guarantor notification, both logged.
	Definitive contract-obligation end event. The flowchart omits the release entirely. Routing: Making Good Defect in the tender regime to the CEO, Functional Director or Head of Division acting as SO/PD with joint recommendation or recommendation by C&P; in the quotation regime the Certificate of Making Good Defects routes to the Head of Division.
FR-CMP-017
	The system shall maintain the Design Guarantee Bond on design-and-build contracts at 5% (or as stated in the contract) of the value of the design work by the contractor, released only five (5) years after the practical completion date, surviving the Certificate of Making Good Defects, and available as a recovery target where the contractor fails to rectify defects.
	M
	SK009 §7.8
	The bond record persists after contract close with an alert five years after the certificate date.
	A long-lived obligation that outlives the contract record and must not be archived away.
FR-CMP-018
	The system shall require a final defects inspection, recorded on the joint inspection application and joint inspection checklist forms, as a precondition to release of the balance of the retention money.
	M
	OM/P/007 §8.26
	The balance release is blocked until the inspection record exists.
6.13.9 Nominated sub-contractors and suppliers (SK010)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-NSC-001
	The system shall record Prime Cost Sums in the main contract Bills of Quantities for work to be executed by a sub-contract, or materials and goods to be supplied, to be nominated by the Superintending Officer.
	M
	SK010 §7.1.1
	Prime Cost Sums are a distinct component of the contract sum and drive the availability of the nomination module.
	Adjustment of Prime Cost Sums is exempt from prior variation approval.
FR-NSC-002
	The system shall record, at tender-document preparation stage, whether the direct-payment mechanism applies, requiring amendments to the Ranhill SAJ Conditions of Contract, the Form of Tender and the Conditions of Tendering and General Information at that time, and shall not permit direct payment to be enabled afterwards.
	M
	SK010 §7.9.3(a)
	The flag is settable only before tender documents are issued and is immutable thereafter.
	A precondition that cannot be retrofitted.
FR-NSC-003
	The system shall assemble the nominated sub-contract tender and table documents in the prescribed order, including the Letter of Nomination, the Letter of Notification of Nomination, the Letter of Indemnity, the Letter of Acceptance and the Official Order to Commence Work, with the supply variant substituting the order to supply and deliver the articles and the schedule of articles ordered.
	M
	SK010 §7.2.2, §7.2.3
	The correct document set is produced for work and for supply packages.
	Standard forms before 25.01.2011 are JKR 203 or 203A for sub-contracts and JKR 203P for nominated suppliers; on and after 01.01.2021 the Ranhill SAJ Standard Form applies. The 25.01.2011 to 31.12.2020 gap is undefined.
FR-NSC-004
	The system shall permit quotations to be invited for a nominated package valued at less than RM300,000.00, but shall require the same documents and the same sub-contract terms as for a tender.
	M
	SK010 §7.3.1, §7.3.2
	A quotation-route nominated package uses the tender document set.
FR-NSC-005
	The system shall record, where the main contractor is permitted to tender for the nominated package, that the contractor is not entitled to profit and attendance charges if its tender is accepted, and shall require that to be taken into account in the evaluation comparison.
	M
	SK010 §7.4.1, §7.4.2
	The comparison shows the adjusted figures.
FR-NSC-006
	The system shall require both Tender Board approval and confirmation of sufficiency of funds before the Letter of Nomination is issued.
	M
	SK010 §7.5.2
	The nomination letter cannot be generated until both conditions are recorded.
FR-NSC-007
	The system shall issue the Letter of Nomination directing the contractor to accept the sub-contractor's or supplier's tender, and shall simultaneously notify the nominated party and issue the Letter of Indemnity for completion and return.
	M
	SK010 §7.5.1, §7.5.2, §7.9.3(b)
	Both letters issue together and the indemnity return is tracked.
	Ranhill SAJ does not accept the nominated sub-contract tender; the contractor is left to accept it — unless the contractor's own tender is accepted, in which case Ranhill SAJ issues the Letter of Acceptance.
FR-NSC-008
	The system shall run a fourteen (14) day objection window from the date the contractor receives the Letter of Nomination, and where the Superintending Officer considers an objection to be made on reasonable grounds shall require one of three responses: nominate an alternative; vary the works including, if necessary, omitting the work or supply from the contract; or arrange for the contractor to execute the work or supply itself.
	M
	SK010 §7.5.3(a),(b)
	The clock runs and alerts. A reasonable objection cannot be closed without one of the three responses being recorded.
	Where the Superintending Officer finds the objection unreasonable the SOP is silent — by implication the nomination stands, but nothing says so. Section 12 OQ-16.
FR-NSC-009
	The system shall record execution of the Sub-Contract Document between the contractor and the nominated party, with stamp duty borne by the nominated party, and shall record that Ranhill SAJ is not a party to it.
	M
	SK010 §7.6.1, §7.6.3
	The sub-contract is a linked record with two signatories, neither being Ranhill SAJ.
FR-NSC-010
	The system shall record the nominated party's Performance Bond at 5% of the sub-contract price, or of the total value of the materials or goods to be supplied, given to the contractor rather than to Ranhill SAJ, together with insurance particulars and the PERKESO code number, inserted against the relevant provisions in the Conditions of Sub-Contract.
	M
	SK010 §7.6.2
	The bond is recorded against the sub-contract with the beneficiary identified as the contractor.
FR-NSC-011
	The system shall record the Official Order to Commence Work for a nominated sub-contract, running the completion period from the date the order is received; and for a nominated supplier shall support many orders per sub-contract, each with its own supply commencement and its own delivery deadline.
	M
	SK010 §7.7.2, §7.7.3
	A nominated supplier sub-contract supports one-to-many orders each with an independent clock.
	The source is internally inconsistent about whether the period runs from order receipt or from commencement; both dates are captured.
FR-NSC-012
	The system shall record that the contractor remains fully responsible for the nominated parties as if they were its own, and that on a nominated party's default it is the contractor's responsibility to have the work executed or the goods supplied by whatever means are necessary, with the contractor entitled to be paid only the same amount as if there had been no default.
	S
	SK010 §7.8.1, §7.8.2
	The rule is displayed on the sub-contract record and the payment computation does not increase on a nominated default.
FR-NSC-013
	The system shall determine the payment route from the direct-payment flag: where direct payment applies, amounts due to nominated parties are included in the interim or final certificate to the contractor but paid directly to them; where it does not, payment flows through the contractor, who pays only after receiving payment from Ranhill SAJ.
	M
	SK010 §7.9.1, §7.9.2, §7.9.3(c)
	The certificate lines and the payment instruction differ correctly between the two routes.
FR-NSC-014
	The system shall support protective direct payment where the contractor has failed to pay a nominated party, deducting from monies due to the contractor and paying the nominated party directly.
	M
	SK010 §7.9.1
	The deduction and the direct payment are linked entries.
FR-NSC-015
	The system shall support the three contractor set-off categories: category one, an amount already deducted by the Superintending Officer from payment to the contractor because of an act or default of the nominated party, and category two, an amount agreed in writing by the nominated party or awarded in arbitration in the contractor's favour — both deducted from the nominated party's payment and paid to the contractor automatically; and category three, the contractor's unliquidated claim for loss, additional expense or nominated-party default, which must not be paid immediately.
	M
	SK010 §7.9.3(d)(i),(ii),(iii)
	Categories one and two process automatically. Category three is held.
FR-NSC-016
	For a category three set-off the system shall run a twenty-eight (28) day objection window from the nominated party's receipt of the contractor's notice of claim, shall permit deduction where no objection is received, and shall require the Superintending Officer to give an interim decision within fourteen (14) days of receipt of an objection, that decision being reviewable in any subsequent interim or final certificate.
	M
	SK010 §7.9.3(d)(iii),(iv)
	Both clocks run and alert. An interim decision can be revised on a later certificate with the revision linked to the original.
FR-NSC-017
	The system shall carry nominated sub-contractor and nominated supplier values through the completion, defects, making good defects and final certificate chain, stating them separately on the final certificate and ranking them first in the payment waterfall.
	M
	SK010 flowchart; SK014
	Nominated values appear as separate lines on every payment certificate and rank first when the payment is insufficient.
	The narrative has no final certificate step for nominated packages; the flowchart adds one. Build the flowchart's.
6.13.10 Final certificate and contract close (SK014)
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-FIN-001
	The system shall verify, before the final certificate can be prepared, that the contractor has discharged all obligations including making good defects, and that loss and expense claims have been valued.
	M
	SK014
	Both preconditions must be green. The certificate action is unavailable otherwise.
	SK014 contains no cross-reference to the Certificate of Making Good Defects, no final-account-agreement step and no numeric time limit.
FR-FIN-002
	The system shall accept the contractor's final claim where the contract stipulates one, and shall track the three-month window after the Certificate of Making Good Defects within which the final payment claim must be submitted on Project Department-run projects.
	S
	SK014; OM/P/010 §8.17; OM/P/007 §8.27–8.28
	The window is computed and alerts.
FR-FIN-003
	The system shall compute the Final Contract Sum (Harga Muktamad Kontrak) as the original contract sum plus the net adjustment from all Certificates of Adjustment of Contract Sum, and shall attach the summary of those certificates.
	M
	SK014; form 9a
	The figure is computed from the adjustment certificates and cannot be keyed. The summary is a mandatory attachment.
FR-FIN-004
	The system shall require the Head of Accounts & Finance to confirm the total of payments already made before the final certificate can be approved.
	M
	SK014
	The confirmation is a distinct recorded step with a named officer.
FR-FIN-005
	The system shall compute the less-block as retention money already released split between main contractor, nominated sub-contractors and nominated suppliers; previous interim payments numbered from one to the last; and advance payment repayment or interim payments on plant and machinery for the main contractor and nominated sub-contractors — with supporting detail attached to each item.
	M
	SK014; form 9a page 1
	Every item is computed from the certificate history, not keyed.
FR-FIN-006
	The system shall compute the deduct-block as liquidated damages net of any waived amount with the waiver letter reference and a rounding adjustment; insurance premiums and PERKESO contributions paid by Ranhill SAJ; workers' wages paid by Ranhill SAJ; the cost to Ranhill SAJ of the contractor's failure to comply with S.O. instructions; the cost of making good defects; diminution in value due to defects; and up to three other permitted deductions.
	M
	SK014; form 9a page 2
	All seven categories are present and total correctly.
	The final account is the only form in the entire set that captures a liquidated damages waiver — the amount waived and the waiver letter reference.
FR-FIN-007
	The system shall block final payment until either a statutory declaration or a certificate signed by the Director-General of Labour has been submitted, confirming that all workers' wages, allowances and salaries have been paid, that all Employees Provident Fund and SOCSO contributions have been paid, and that no amounts are outstanding to workers; recording the declarant's name and identity-card number, the company name and address, the project name and contract number, the governing clause, attestation before a Commissioner for Oaths or the President of the Sessions Court under the Statutory Declarations Act 1960, and confirmation that the declaration was submitted by the contractor and by the nominated sub-contractors.
	M
	SK014; forms 9b, 9a B147
	The final payment action is unavailable until the declaration is attached and its fields are complete.
	A blocking gate that is absent from the SK014 flowchart. It is also listed as a mandatory attachment on the routing sheet.
FR-FIN-008
	The system shall assemble the final account attachment pack comprising the Certificate of Non-Completion, the Certificate of Making Good Defects, the Certificate of Extension of Time, the Certificate of Practical Completion, the Certificate of Adjustment of Contract Sum, the statutory declaration, as-built drawings, the supplier assessment, verification of previous payment, the CIDB levy certificate and the receipt of water charges.
	M
	CPD/INT-SFA-INDEN(i),(ii)
	The pack checklist is enforced before routing.
	The CIDB levy certificate and the water-charge receipt appear only on this routing sheet — they are in no SOP.
FR-FIN-009
	The system shall capture the contractor's acceptance of the final account together with a witness signature, recording the contractor's declaration of no further claims under the contract.
	M
	SK014; form 9a page 2
	The acceptance block is complete before the Superintending Officer signs. The declaration text is reproduced verbatim.
	Legally the point of no return for the contractor.
FR-FIN-010
	The system shall route approval of final payment and release of performance guarantee sums to the CEO, Functional Director or Head of Division, whichever acts as Superintending Officer or Project Director, with joint recommendation or recommendation by Contract & Procurement in the tender regime; and to the Head of Division in the quotation regime, where the same row covers interim payment, final payment and release of retention sums.
	M
	DAL §3.1.4.4 item 17; §3.1.4.3 item 12
	The certificate routes to the resolved SO/PD, not to a fixed post.
	There is no DAL row for the Final Certificate itself; item 17 is the closest. There is no retention-release row in the tender regime at all. One of the two omissions is a drafting oversight.
FR-FIN-011
	The system shall apply the final payment waterfall to the main contractor, sub-contractors, suppliers and assignees, stating each separately, and where the amount is insufficient shall pay nominated sub-contractors and nominated suppliers first, then assignees, then the contractor.
	M
	SK014; form 9a page 3
	The distribution reproduces the printed breakdown and the waterfall order.
FR-FIN-012
	The system shall release the retention money and the performance guarantee sums on final payment, notifying the guarantor, and shall reconcile the release against the release already effected at the Certificate of Making Good Defects.
	M
	SK009 §7.7.4; DAL §3.1.4.4 item 17; §3.1.4.3 item 12; OM/P/007 §8.26
	No amount can be released twice. The reconciliation is visible on the contract.
	SK014 has no retention-release step and no performance-bond-release step; the release event is defined in SK009 at the Certificate of Making Good Defects, and the balance-of-retention release in OM/P/007 after the final defects inspection. Reconcile before build.
FR-FIN-013
	The system shall generate the Final Certificate (CPD/SFA(T)) with the Document Tracking Form, signed in the printed order of Recommending Officer, contractor and witness acceptance, then Superintending Officer, and shall forward it through the C&P chain of Executive, Head of Section and Head of Contract & Procurement to Accounts & Finance.
	M
	SK014; form 9a
	Signature order is enforced and the three-step forwarding chain is recorded.
	The live workbook total-final-payment formula is broken (=M140+#REF!++#REF!+#REF!); rebuild the roll-up rather than porting it. Several carry-forwards are manually keyed and must become computed. No distribution list is printed on the form and SK014 gives none.
FR-FIN-014
	The system shall close the contract record on completion of final payment, release of securities and filing of the contractor performance report, and shall archive the contract document, bond, insurance policies, certificates and site records under the retention policy, while retaining any surviving obligation such as a Design Guarantee Bond as an active record.
	M
	[ASSUMPTION]; SK004 §7.8
	A closed contract is read-only except for surviving obligations. A design-and-build contract with an outstanding Design Guarantee Bond remains alerting after close.
	No SOP in the SK series has a records section or a retention period. The Project Department series states three years; OM/P/001 states "until the contract final account is issued". See NFR-RET.
6.14 Certificate generation and the document tracking form
The forms library specifies approximately thirty instruments to field level, with computed fields, ordered signature blocks and per-form distribution lists. Two of them are rendered in the prototype, both pre-award. Nine of the thirty are CPD/DFA/* routing sheets which are not certificates but approval wrappers, and which should map to one generic routing entity rather than nine tables.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-CRT-001
	The system shall maintain a Form Template register holding, for every instrument, its form code, revision date, page count, language variants, field bindings, computed-field definitions, signature-block order and distribution list.
	M
	FORMS inventory; every form control block
	A new revision of a form can be introduced without a code change and without affecting documents already generated under the previous revision.
	Every form carries a printed control block of No. Borang, Tarikh Pindaan and Muka Surat. These are template metadata, not per-record columns.
FR-CRT-002
	The system shall generate every certificate from live data with no manual re-keying of any value that exists elsewhere in the system.
	M
	FORMS inventory
	No generated certificate contains a field that a user has keyed where the value exists on the contract, the valuation or a prior certificate.
FR-CRT-003
	The system shall compute every calculated field defined in Section 8 and shall not permit a computed field to be overridden without a recorded justification.
	M
	FORMS inventory §1, §7, §9a, §12
	Certificate arithmetic balances in every case. Overrides are exceptions with an audit entry.
	Do not port the two broken formulas or the manual carry-forwards from the live workbooks.
FR-CRT-004
	The system shall enforce the printed signature order on every certificate, and shall not permit a later signature to be applied before an earlier one.
	M
	FORMS Section B1
	The Recommending Officer always signs before the Superintending Officer. Attempting to sign out of order is refused.
FR-CRT-005
	The system shall set the date of a certificate as the date of the authorising signature, derived rather than keyed, on every instrument where the source states that rule.
	M
	SK012 §7.2.4(d), §7.2.5(b); SK013; SK006 §7.5.5; SK007 §7.3.2; SK004 §7.5.1
	The certificate date equals the signature timestamp date in every applicable case.
FR-CRT-006
	The system shall execute the distribution list for every certificate, generating the addressed copies, recording despatch method and date per recipient, and tracking acknowledgement where required.
	M
	SK006 §7.8.1; SK007 §7.5.1; SK009 §7.2.3, §7.7.3; SK012 §7.2.5(c); SK013
	Every distribution is logged per recipient. A missing mandatory recipient blocks the distribution step.
	Distribution lists differ between the SOP narrative and the printed form on at least two instruments; both variants are recorded in Appendix C with the recommended list.
FR-CRT-007
	The system shall implement a single generic Document Approval Routing entity with a routing-type attribute and a child approval-step table, covering all nine CPD/DFA/* routing sheets rather than nine separate structures.
	M
	FORMS §11
	All nine sheets are produced from one entity. Adding a tenth routing type requires configuration only.
	Each sheet has the same skeleton of date received, checked by, verified by, recommended by and approved by, each with name, date and a resubmission column, plus an ICC column holding the service-level target.
FR-CRT-008
	The system shall record on every routing sheet the DATE (1) start and DATE (2) end of the internal cycle-time clock, shall compute elapsed time, and shall compare it to the ICC target printed for that route.
	M
	FORMS §11
	Elapsed days are computed and compared to the target: 4 weeks for non-completion, practical completion and making good defects; 6 weeks for a tender variation; 2 weeks up to 20% and 6 weeks above 20% for a quotation variation; 2 weeks for tender extension-of-time checking and 1 week for quotation; 52 days for interim and final account variant (i) and 41 days for variant (ii).
	These are the only service-level targets in the whole corpus and they are form-level, not SOP-level. Note that on the pre-tender sheet the printed total is smaller than the sum of its parts — Section 12 OQ-17.
FR-CRT-009
	The system shall support the resubmission column on every routing sheet, recording each resubmission as a distinct iteration with its own dates and names.
	M
	FORMS §11
	A resubmitted document shows the original and the resubmission side by side.
FR-CRT-010
	The system shall correct the known typographical errors in the printed forms when generating them, while preserving the form code and revision reference.
	S
	FORMS Section B7 item 8
	Generated forms read CERTIFICATE not CERTICATE, PARTIAL not PARTICAL, ADJUSTMENT not ADJUSMENT, Defect not Detect, BOARD not BORAD, behalf not behlaf, satisfactorily not statisfactorily, kepada not keada, hendaklah not gendaklah, berkenaan not berkenanan, penerimaan not pernerimaan, and penyelarasan not penyelerasan.
	Requires a document-control decision, since it changes controlled forms.
FR-CRT-011
	The system shall normalise the terminology variants recorded in Appendix D and shall present one canonical term per concept while retaining aliases for search.
	S
	FORMS Section B7; MODEL §9 C28
	A search for either variant finds the record. Generated documents use the canonical term.
	Examples: Tempoh Liabiliti Kecacatan and Tempoh Tanggungan Kecacatan; Perakuan Siap Memperbaiki Kecacatan and Perakuan Siap Membaiki Kecacatan; Klausa and Fasal.
FR-CRT-012
	The system shall build the templates that the SOPs mandate but which do not exist in the forms library: the Notice of Termination, the Supplementary Agreement for Extension of Contract Period, the Schedule of Defects, the SK010 nomination letter set and the Document Tracking Form referenced by SK014.
	M
	SK008 §7.2.2(a); SK006 §7.5.1; SK009 §7.7.2(c)(iii); SK010; SK014
	Each missing template is designed, reviewed by the Post-Contract Section and issued with a form code.
	Section 12 blocker B6.
6.15 Vendor portal
Every requirement in this module is [NET-NEW]. Nothing in SK001, SK002 or SK003 imagines a vendor logging in. The underlying obligations — eligibility, document currency, suspension — are sourced; the self-service means of discharging them is not. This module is the clearest value case in the programme and the part that most needs an explicit policy decision.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-VND-001
	The system shall provide vendor self-registration capturing registered name, SSM or Registrar of Businesses number, entity type, country, Bumiputera status, company email, registered address and primary contact.
	M
	[NET-NEW]; eligibility content SK001 7.3.4(a)
	A registration cannot be submitted with any mandatory identity field empty. The SSM number validates against the expected format.
	The prototype's registration flow is well designed and should be carried forward.
FR-VND-002
	The system shall capture the statutory document set with an expiry date per document: SSM certificate; PKK; STB; MOF registration certificate with field codes; CIDB certificate with grade and categories; SPAN permit with type and grade; Suruhanjaya Tenaga class; LJT land surveyor; Bank Negara Malaysia broker; SST registration with rate; LHDN tax clearance; other licences; and a Surat Akuan Tidak Disenaraihitam.
	M
	SK001 7.3.4(a); prototype vendor schema
	Each document row carries a status of valid, not applicable or missing, an authority value and an expiry date.
	This is a well-researched Malaysian water-utility vendor schema and should be carried straight into Dataverse.
FR-VND-003
	The system shall capture CIDB grade, category and specialisation against the published CIDB list, and MOF field codes (kod bidang) against the published MOF list, as searchable reference data.
	M
	SK001 7.3.4(a)
	Both lists are maintainable reference data. A vendor can select multiple categories and specialisations.
	The prototype holds 84 CIDB specialisations across B, CE, ME, M, E and F categories and 26 MOF codes — retain and extend to the full published lists.
FR-VND-004
	The system shall state explicitly to the vendor that lodged documents are not automatically validated and are subject to manual officer verification, and shall record the verification of each document by a named officer.
	M
	[NET-NEW]
	Each document shows verified or unverified with the verifying officer and date.
	The prototype states a three-to-four working day service level; honest and correct.
FR-VND-005
	The system shall capture the E-Payment and Creditor's Profile: beneficiary name, address, identity-card or registration number, contact, telephone, fax, GST or SST number and email; bank name, account number, account type, SWIFT code and bank address; a bank statement upload bearing the company stamp; the GIRO declaration naming Ranhill SAJ Sdn Bhd with its four numbered undertakings; and the authorised signatory, designation, date and consent.
	M
	RSAJ E-Payment form
	The form reproduces the printed original. The bank statement upload is mandatory.
	Reproduced almost verbatim in the prototype — retain.
FR-VND-006
	The system shall require a false-declaration and blacklisting acknowledgement at submission.
	M
	[NET-NEW]
	The acknowledgement is recorded with the submission timestamp.
FR-VND-007
	The system shall route a vendor application to an officer review queue supporting the outcomes Approve, Request Resubmission and Reject, with per-document resubmission requests, verbatim remarks, a resubmission deadline and automatic rejection on lapse.
	M
	[NET-NEW]
	Each outcome is recorded with reasons. A lapsed resubmission deadline auto-rejects with notification.
FR-VND-008
	The system shall monitor document expiry, issuing reminders at 90, 60, 30 and 7 days before expiry, presenting severity bands of Expired, Critical at 30 days or fewer, Warning at 60 days or fewer and Upcoming at 90 days or fewer, and requiring officer re-approval of a renewed document before the new expiry takes effect.
	M
	[NET-NEW]
	Reminders fire on schedule; the severity band is derived; a renewed document does not become effective until re-approved.
	No SOP describes this. It is the right control.
FR-VND-009
	The system shall check licence and registration validity as a continuous window from the tender advertisement date through to the tender closing date, and not as a point-in-time check.
	M
	SK001 7.3.4(a)(i)
	A vendor whose CIDB certificate expires two days before closing fails eligibility for that exercise even though it is valid today.
	The prototype performs point-in-time expiry monitoring only, with no window check against a specific exercise.
FR-VND-010
	The system shall support suspension and reinstatement of a vendor, recording the reason from a maintained list including certificate expiry, poor performance, integrity findings and revocation of a statutory registration; supporting automatic and manual modes; requiring per-document verification before reinstatement; and recording a reinstatement checklist and audit note.
	M
	[NET-NEW]; SK002 7.5.1(c) requires the suspension check
	A suspended vendor cannot purchase documents or submit bids. Reinstatement requires every flagged document to be verified.
	Must also reflect blacklisting arising from termination under FR-TRM-017.
FR-VND-011
	The system shall present each vendor with the exercises for which it is eligible, showing a per-exercise eligibility check against the required grade, category, specialisation, field code, permits and Bumiputera restriction, with the specific failing condition named where the vendor is ineligible.
	S
	[NET-NEW]
	The eligibility panel lists each condition with a pass or fail and the reason.
FR-VND-012
	The system shall allow a vendor to purchase tender documents online, subject to the pre-sale checks at FR-ADV-010, and shall release the document pack only on confirmed payment.
	M
	[NET-NEW]; SK002 7.5
	Documents are locked until payment is confirmed and the pre-sale checks pass. A receipt is issued and recorded in the purchaser register.
FR-VND-013
	The system shall allow a vendor to register attendance at the briefing and site visit, to acknowledge addenda, to prepare and submit a sealed bid, and to view the status of its own bids only.
	M
	[NET-NEW]
	A vendor can never see another vendor's identity, price, score or documents.
FR-VND-014
	The system shall provide a vendor announcements and bulletin facility with pinned items categorised as Important, Policy or Notice.
	C
	[NET-NEW]
	Announcements are publishable by an authorised officer and visible to all registered vendors.
	A good idea in the prototype worth keeping.
6.16 Contractor performance evaluation
Seven category variants, each in Malay and English with a scoring guide, sharing one engine. The output feeds directly back into evaluation Fasa 2 as the Contractor Performance Report percentage, which is why this module cannot be an isolated scorecard.
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-CPR-001
	The system shall implement the seven contractor performance report categories: CPD/SA-F01 Works, F02 Design and Build, F03 Suppliers Assessment and Rating, F04 Maintenance and Service, F05 IT Hardware and Software, F06 Management and Technical Consultancy and F07 Training and Development, each in a Malay (B) and an English (E) variant with its scoring guide SA-G0n.
	M
	FORMS §12, §C1
	The correct form is selected from the contract category. Both language variants generate.
	The subject noun changes per category: Kontraktor for 1, 2 and 4; Pembekal for 3; Vendor for 5; Perunding for 6 and 7.
FR-CPR-002
	The system shall score each criterion on a scale of one to five and shall compute the weighted score as the raw score divided by five, multiplied by the criterion weight; and shall validate that the weights for a category sum to exactly 1.00.
	M
	FORMS §12
	A category whose weights do not sum to 1.00 cannot be activated. The grand total is the sum of the weighted scores, expressed as a percentage.
	Verified exact on all seven category forms.
FR-CPR-003
	The system shall grade the total using half-open intervals: 0 to below 40 is E, 40 to below 50 is D, 50 to below 60 is C, 60 to below 80 is B, and 80 to 100 is A.
	M
	FORMS §12
	A score of exactly 39.995% grades E. A score of exactly 80.00% grades A.
	The live nested formula leaves gaps at 39.99 to 40.00, 49.99 to 50.00, 59.99 to 60.00 and 79.99 to 80.00, so a score of exactly 39.995% is graded A. Do not port the defect.
FR-CPR-004
	The system shall implement the conditional weight split on the IT category, where two criteria share a single weight of 0.15 joined by "DAN / ATAU": where both are scored each takes half, at 0.075; where only one is scored and the other is entered as a dash, that one takes the full 0.15; and a dash contributes numeric zero.
	M
	FORMS §12 AF67, AF70
	All three cases compute correctly and a dash returns numeric zero rather than the string "0.00".
	The live formula returns a string; return numeric zero in the port.
FR-CPR-005
	The system shall support the four assessment stages: ongoing project where the contract period exceeds one year; completed project at practical completion; end of defects liability period; and final account or making good defects.
	M
	FORMS §12; SK005 §7.4.2(f); SK009 §7.5.3, §7.7.5; SK014
	A contract can carry up to four performance reports, one per stage, each dated and attributed.
FR-CPR-006
	The system shall capture two signatories on every report in printed order: the Assessor or Person in Charge under "Dicadangkan oleh", and the Verifier — superior, section head, head of department or Superintending Officer — under "Disahkan oleh", each with a date, and shall submit the verified report to Contract & Procurement.
	M
	FORMS §12 signature blocks
	A report cannot be submitted without both signatures in order.
FR-CPR-007
	The system shall compute the liquidated damages block on the performance report as a daily rate of 0.025% of the Original Contract Sum, and total liquidated damages as the number of LAD days multiplied by that daily rate.
	M
	FORMS §12 S36 = P30*0.025%, R38 = N36*S36
	The computation is reproducible against the printed workbook.
	This is the only LAD formula anywhere in the corpus.
FR-CPR-008
	The system shall maintain a contractor performance register from which the evaluation module draws the Contractor Performance Report percentage as a linked value, and shall retain the full report history per vendor.
	M
	SK003 7.2.2(d); quotation template Fasa 2, Lampiran D
	An evaluation's CPR input resolves to a specific report record. The register is reportable by vendor, by category and by period.
	The prototype has a plausible-looking generic scorecard with no relationship to the seven CPR forms, and it is orphaned and unlinked. Note that the Supplier Assessment Report's own scoring methodology is not in the corpus, only its rating scale.
6.17 Reporting, dashboards and audit
Req ID
	Requirement statement
	Pri.
	Source clause
	Acceptance criteria
	Notes
FR-RPT-001
	The system shall provide a case dashboard per exercise and per contract showing the current stage, the outstanding approval step and its holder, the elapsed time against the applicable ICC target, and the next milestone date.
	M
	CPD/DFA/* ICC columns
	Every open case shows its position and its ageing without a report being run.
FR-RPT-002
	The system shall provide a procurement pipeline view by stage, by value band, by regime, by sourcing method, by funding source, by contract type and by requesting department.
	S
	[ASSUMPTION]
	Each dimension is filterable and the counts reconcile to the underlying records.
FR-RPT-003
	The system shall provide an approvals dashboard showing pending steps by approver, by matter type and by age, with overdue steps highlighted and escalations visible.
	M
	FR-APR-018
	An approver sees their own queue; a Head of Division sees the division's.
FR-RPT-004
	The system shall provide a contract-financials view per contract showing the original contract sum, cumulative approved variations in value and percentage, the revised contract sum, certified to date, retention held, retention released, liquidated damages accrued and waived, advance outstanding, and the forecast final account.
	M
	SK011; SK013; SK014
	Every figure reconciles to the underlying certificates.
FR-RPT-005
	The system shall provide a securities and insurance expiry report covering performance bonds, advance payment guarantees, design guarantee bonds and all insurance policies, with configurable lead times.
	M
	SK004 §7.3.3; SK009 §7.8
	An expiring bond or policy appears on the report and raises an alert before lapse.
FR-RPT-006
	The system shall provide a Project In Delay report listing every contract below 70% of programme or past its completion date, with progress, elapsed delay and the last special meeting.
	M
	SK005 §7.4.2(d)
	The report is computed, not keyed.
FR-RPT-007
	The system shall provide a variation exposure report covering variations in the Commenced Pending Approval state, with estimated value, age and the approval step outstanding.
	M
	SK012 §7.2.2(c)
	The report shows the aggregate uncommitted exposure.
FR-RPT-008
	The system shall provide a vendor report covering registration status, document currency, suspension and blacklist status, performance grades and award history.
	S
	[NET-NEW]
	The report is filterable by grade, category, field code and status.
FR-RPT-009
	The system shall provide a committee report covering meetings held, matters tabled, decisions taken, quorum achieved and individual voting records, for a stated period.
	M
	SK003 7.6; DAL
	The report reproduces individual votes and can be exported for the Board.
FR-RPT-010
	The system shall provide an audit extract producing, for any case, the complete chronological record of every action, approval, document version, communication and system event, in a tamper-evident export format.
	M
	Evidentiary integrity; SPAN audit exposure
	An external auditor can reconstruct a case end to end from the extract alone.
	The October 2025 SPAN audit drove the rewrite of SK001 7.3.4(a) and SK002 7.2.1. Audit exposure is real and current.
FR-RPT-011
	The system shall provide a compliance exception report covering overdue approvals, expired securities, missing statutory documents, exercises advertised with fewer than two weeks' notice, closings falling on a weekend or public holiday, quotation fees below RM50.00, tender fees below RM250.00, and every recorded override of a computed value or a validation rule.
	M
	SK002 7.4.2; FR-CRT-003
	Each exception type is detected automatically and is reportable by period and by department.
FR-RPT-012
	The system shall provide spend and savings analytics covering spend by category, by vendor, by department and by method; cost saving against the company estimate; and cycle time by stage against the ICC targets.
	C
	[ASSUMPTION]
	Figures reconcile to the transactional records.
7. Data model
This section defines the core entities, their key attributes, their relationships and their lifecycle states. It is not a physical schema; it is the conceptual model the physical schema must satisfy. Three structural facts drive it: PROC… is the primary business key of the whole process; the Superintending Officer is a role resolved by contract value rather than a post; and one requisition may give rise to many sourcing exercises, one contract to many variations, certificates and sections.
7.1 Core entities
Entity
	Key attributes
	Relationships
	Master
Requisition
	PROC number (business key), NM number, requesting department, section, officer, title, justification, need statement, cost centre (5-segment), account code (7-digit), place of delivery, date required, estimated value, funding source (F1–F5), government-funded flag, contract type, budget check result (actual, balance as at, approved account, projected balance), status
	1 → n Requisition Line; 1 → n Sourcing Exercise; 1 → 1 Project (optional); 1 → n Approval Instance
	ERP (Oracle today, D365 target). Replicated read-mostly into Dataverse.
Requisition Line
	Line number, description, quantity, unit, estimated unit price, estimated amount, catalogue reference
	n → 1 Requisition
	ERP
Project
	Project reference, name, approved price, funding source, PAAB Project Execution Letter reference, technical committee decision, CAPEX committee decision
	1 → n Requisition; 1 → n Contract
	ERP / project system (unresolved — decision D5)
Sourcing Exercise
	Exercise reference (RSAJ/TA/NNN/YYYY, RSAJ/KP/Q(JB|MR|IP)/NNN/YY, RSAJ/KP/ST/NN/YY), regime (direct / quotation / tender), sourcing method (nine values), contract type, contract basis, evaluation model reference and version, Bumiputera restriction, document fee and fee basis, validity days, publication dates by channel, briefing and site visit details with mandatory flag, closing for purchase, closing datetime (2.30 p.m.), person in charge, status
	n → 1 Requisition; 1 → n Document Sale; 1 → n Addendum; 1 → n Bid; 1 → 1 Company Estimate; 1 → 1 Opening; 1 → 1 Evaluation; 1 → 1 Award
	Dataverse
Company Estimate
	Value, preparer (single officer), preparation date, copy count, classification (SULIT), lodgement timestamp, version history
	1 → 1 Sourcing Exercise
	Dataverse
Vendor
	Vendor code, registered name, SSM number, entity type, country, Bumiputera status and expiry, addresses, contacts, paid-up capital, turnover, bank and E-Payment profile, registration status, suspension status and reason, blacklist status with start and end dates, performance grade
	1 → n Vendor Document; 1 → n Bid; 1 → n Contract; 1 → n Performance Report
	Dataverse master; replicated to ERP as a vendor account.
Vendor Document
	Document type (SSM, PKK, STB, MOF, CIDB, SPAN, ST, LJT, BNM, SST, LHDN, other), reference, issuing authority, values (grade, category, specialisation, field code, class, rate), issue date, expiry date, status, verifying officer, verification date, renewal chain
	n → 1 Vendor
	Dataverse
Bid
	Bid reference, submitted timestamp (server-side), late flag, withdrawal flag, sealed content, bid amount, SST, grand total, completion period, validity days, alternative-bid flag and parent, mandatory-document results, stage and phase scores, disqualification reason
	n → 1 Sourcing Exercise; n → 1 Vendor; 1 → n Evaluation Score
	Dataverse
Opening
	Committee reference, member attendance, dual-control unseal event (two identities, two timestamps), Jadual Tawaran, per-bid sequence number and initials, late count, finalisation event, Grand Summary
	1 → 1 Sourcing Exercise; n → 1 Committee
	Dataverse
Evaluation
	Model reference and version, stage or phase results, per-criterion scores with scoring officer, four qualitative aspects, clarification meetings, negotiation meetings, report with annexes A–F, recommendation, cost saving against estimate
	1 → 1 Sourcing Exercise; 1 → n Evaluation Score; 1 → n Meeting
	Dataverse
Committee
	Name, aliases, mandate, governing source, value scope, quorum, status
	1 → n Committee Member; 1 → n Meeting
	Dataverse
Committee Member
	Position (Chairman, Deputy, Member, Secretary), person, alternate pool, appointment reference, effective from and to
	n → 1 Committee
	Dataverse
Meeting
	Committee, date, reference, agenda, attendance, quorum achieved, minutes
	n → 1 Committee; 1 → n Committee Decision
	Dataverse
Committee Decision
	Matter, outcome, per-member vote (SETUJU / TIDAK SETUJU) with comment and date, recommendation type (R / MR / MJR), decision date
	n → 1 Meeting; 1 → 1 Approval Step
	Dataverse
Approval Instance
	Matter type, matter reference, DAL matrix reference, DAL version, value band, percentage band, funding override applied, status
	1 → n Approval Step; n → 1 (Requisition / Exercise / Contract / Certificate)
	Dataverse
Approval Step
	Sequence, authority code (A / R / P / JP / JR / MA / MR / MJR), required role, resolved actor, delegation reference, decision, reason, timestamp, DAL clause cited
	n → 1 Approval Instance
	Dataverse
Award
	Instrument type (Letter of Acceptance / Inden Kerja), reference, award date, awarded value, completion period, signatory (resolved by DAL band), distribution list with despatch records, Integrity Pact Stage Two documents, returned date
	1 → 1 Sourcing Exercise; 1 → 1 Contract
	Dataverse
Contract
	Contract number (RSAJ/KP/T/NN/YYYY or RSAJ/KP/P/NN/YYYY), contract type, basis, standard form, contract date (= RSAJ signature date), contract sum, date of possession, date for completion, extended completion date, DLP length, LAD rate and unit, retention percentage and cap, Prime Cost Sums, Provisional Sums, Builder's Works Value, first and subsequent interim minimums, interim honouring period, unfixed-materials percentage, on-cost percentage, sections, Superintending Officer (resolved), legal endorsement, stamping reference, controlled-copy register, custody record, status
	n → 1 Award; 1 → n Section; 1 → n Security; 1 → n Insurance; 1 → n Delegation; 1 → n Certificate; 1 → n Variation; 1 → n Sub-Contract; 1 → n Site Diary Entry
	Dataverse master. Financial dimensions and payment execution in the ERP.
Section
	Section reference, description, sectional LAD rate, sectional completion date, sectional DLP
	n → 1 Contract
	Dataverse
Security
	Type (Performance Bond / Advance Payment Guarantee / Design Guarantee Bond / Retention), instrument (bank guarantee, insurance guarantee, cash, banker's draft, treasury deposit), issuer, issuer-approved flag, value, basis, effective and expiry dates, release event, release date
	n → 1 Contract
	Dataverse
Insurance
	Type (Works / Public Liability / Workmen's Compensation / CAR / EAR), insurer, policy number, sum insured, derived limit and override, period start and end, premium, premium receipt, PERKESO registration
	n → 1 Contract
	Dataverse
Delegation (S.O.)
	Delegate, delegate type (Principal / Specialist / Specialist QS), letter variant (A/1, A/2, B/1, B/2), scope, effective dates, sub-delegation prohibited flag
	n → 1 Contract
	Dataverse
Site Diary Entry
	Date, weather, labour, plant, activities, instructions, officer signature, contractor agent signature, dispute flag, endorsements
	n → 1 Contract
	Dataverse
Valuation
	Valuation date, trigger (valuation-driven / claim-driven), work executed, materials on site, nominated values, joint valuation participants, contractor agreement
	n → 1 Contract; 1 → 1 Interim Certificate
	Dataverse
Certificate
	Form code, serial, revision, type (B.INT, EOT, CNC, CPO, CPC, CPC-IT, CMGD, PMKD, SFA, PPJHK, VO-663, APP), header fields, computed fields, signature blocks in order, distribution records, routing sheet reference, status
	n → 1 Contract
	Dataverse
Variation
	VO number, originator, description, reason, exemption category, estimated and certified amounts, percentage of contract, cumulative percentage, contract-period implication, agreed-rate flag, PAAB consent, VOC recommendation, DAL approval, commenced-pending-approval flag, instruction reference, certificate reference
	n → 1 Contract; 1 → n Measurement Line
	Dataverse
Sub-Contract (NSC / NS)
	Nominated party, package type (work / supply), Prime Cost Sum reference, sub-contract sum, nomination letter, objection window and outcome, indemnity, 5% bond to contractor, PERKESO code, direct-payment flag, orders (supply)
	n → 1 Contract
	Dataverse
Assignment
	Assignee, deed reference, assigned amounts, approval (Head of Division by Finance)
	n → 1 Contract
	Dataverse
Performance Report
	Category (F01–F07), stage (1–4), language variant, per-criterion scores and weights, total, grade, LAD block, assessor, verifier
	n → 1 Contract; n → 1 Vendor
	Dataverse
Document Approval Routing
	Routing type (nine CPD/DFA/* variants), attachments checklist, steps (prepared, checked, verified, recommended, approved), DATE (1), DATE (2), ICC target, elapsed, resubmission iterations
	n → 1 (any parent record)
	Dataverse
Form Template
	Form code, revision date, page count, language variants, field bindings, computed-field definitions, signature order, distribution list
	1 → n Certificate
	Dataverse (configuration)
DAL Configuration
	Matrix, item, regime, value band lower and upper, percentage band lower and upper, authority code by role, committee MR reference, version, effective from and to
	—
	Dataverse (configuration, versioned)
7.2 Cardinalities the model must express
One requisition may give rise to many sourcing exercises — a PROC may be split into lots or re-run after a failed exercise.
One contract may have many variations, extensions of time, interim certificates, adjustment certificates, sections, sub-contracts and assignments.
One sourcing exercise has many committee members each casting an individual vote — not one aggregate committee decision.
One nominated supplier sub-contract may have many orders, each with its own delivery clock.
One vendor has many typed documents, each with its own expiry and its own renewal chain.
One contract has at most one Superintending Officer at a time, but the role may change if the contract sum crosses a band through variations — the model must retain the historical holder for every certificate signed.
The existing prototype can express none of these six.
7.3 Lifecycle state machines
7.3.1 Requisition
State
	Entered when
	Exits to
	Notes
Draft
	Created by the requesting officer
	Endorsed; Cancelled
	Fully editable.
Endorsed
	Section head and Head of Department endorsement recorded
	Registered; Returned
	FR-REQ-003.
Returned
	Completeness review fails
	Draft
	OM/P/002 8.2 loop.
Registered
	PROC and NM numbers received from the ERP
	Budget Checked
	Business key assigned.
Budget Checked
	Budget availability recorded
	Pending DAL Approval; Over Budget
	FR-REQ-007.
Over Budget
	Insufficient funds
	Pending DAL Approval (via BOD route); Cancelled
	CAPEX above budget routes to the Board with mandatory CEO recommendation.
Pending DAL Approval
	Approval instance created
	Approved; Rejected; Recalled
	DAL §3.1.4.1 chain.
Rejected
	Any approver rejects
	Draft; Closed
	Destination configured per matter type — FR-APR-016.
Recalled
	Originator recalls before first decision
	Draft
	FR-APR-017.
Approved
	Final DAL approval recorded
	Sourcing In Progress
	Immutable from here except by controlled change.
Sourcing In Progress
	First sourcing exercise created
	Fulfilled; Partially Fulfilled
	One-to-many.
Fulfilled
	All lines awarded or closed
	Closed
Cancelled
	Withdrawn before approval
	— terminal
	Reason mandatory.
Closed
	Archived under the retention policy
	— terminal
7.3.2 Sourcing Exercise (tender or quotation)
State
	Entered when
	Exits to
	Notes
Draft
	Created against an approved requisition
	Documents In Preparation; Cancelled
Documents In Preparation
	Method, basis and contract type set
	Pending Approval for Tendering
	Twelve constituent parts assembled.
Pending Approval for Tendering
	Document set complete
	Approved for Tendering; Returned for Amendment
	Head of C&P — DAL §3.1.4.4 item 1.
Approved for Tendering
	Approval recorded with DATE START and CLOSING DATE
	Advertised; Invited
	Advertisement blocked before this.
Advertised
	All three mandatory channels recorded (open tender)
	Open for Purchase
	Or Invited for a selected tender.
Invited
	Letters of invitation issued (selected tender / selective quotation)
	Open for Purchase
	SULIT throughout.
Open for Purchase
	Publication date reached
	Closed for Purchase
	Pre-sale checks apply. Addenda may issue.
Closed for Purchase
	Purchase cut-off reached (at least two days before closing)
	Open for Submission
Open for Submission
	Concurrent with the above; bids accepted
	Closed
	Sealed. Withdrawal permitted.
Closed
	Closing datetime (2.30 p.m.) reached
	Opening In Progress; Cancelled
	Late bids segregated, counted, never rejected.
Opening In Progress
	Dual-control unseal by the Opening Committee
	Opened
	Two authenticated identities required.
Opened
	Jadual Tawaran finalised and signed
	Under Evaluation
	Only passed bids carry forward.
Under Evaluation
	Joint evaluation begins
	Evaluated; Clarification; Negotiation
	Blackout in force. SULIT.
Clarification / Negotiation
	Meeting convened
	Under Evaluation
	Minutes plus written confirmation required to exit.
Evaluated
	Report complete with annexes A–F
	Pending Committee
Pending Committee
	Tabled through the Secretariat
	Committee Approved; Committee Not Approved
	Quorum enforced.
Committee Not Approved
	TIDAK outcome
	Under Evaluation (recall / re-clarification / re-negotiation); Cancelled
	The SOP provides only the loop; the terminal outcome is an assumption — blocker B4.
Committee Approved
	Quorate approval recorded
	Pending Award Approval
Pending Award Approval
	Approval instance for the appointment
	Awarded
	DAL §3.1.4.2.
Awarded
	Letter of Acceptance or Inden Kerja issued
	Contract Formation
	Ownership transfers to the Post-Contract Section.
Cancelled
	Cancelled at any point before award
	— terminal
	No cancellation path exists in the SOP — assumption.
Validity Expired
	Validity period lapses without award or extension
	Cancelled; Under Evaluation (on extension with the recommended tenderer's consent)
	SK003 7.8.
7.3.3 Contract
State
	Entered when
	Exits to
	Notes
Number Allocated
	Contract number obtained immediately on issue of the Letter of Acceptance
	In Preparation
	SK004 §7.2.1.
In Preparation
	Document assembly begins
	Pending Legal Endorsement
	Arithmetic, front-loading, rate uniformity checks.
Pending Legal Endorsement
	Submitted to Group Legal Compliance
	Legally Endorsed; Returned for Amendment
	Mandatory pre-condition to signing.
Returned for Amendment
	Legal comments received
	Pending Legal Endorsement
	Versioned rework loop, no iteration limit in the SOP.
Legally Endorsed
	Endorsement recorded
	Awaiting Conditions Precedent
Awaiting Conditions Precedent
	Endorsed but bond, insurances or returned LoA outstanding
	Ready to Sign
	All three cumulative — SK004 §7.1.1.
Ready to Sign
	All three conditions met and the company resolution is on file
	Executed
Executed
	Ranhill SAJ officer signs — this date is the Contract Date
	Stamped
	Signatory resolved by DAL band.
Stamped
	LHDN stamping recorded
	Active
	Controlled copies distributed.
Active
	Site possession given; delegation issued; programme approved
	In Delay; Practically Complete; Terminated; Suspended
	Interim payments, variations, adjustments and extensions run here.
In Delay
	Progress below 70% of programme, or completion date lapsed
	Active; Practically Complete; Terminated
	Computed flag, not a manual state. Special meeting convened.
Suspended
	Suspension of works instructed
	Active; Terminated
	DAL row exists for suspension of works.
Notice of Intention Issued
	Default notice served with a 14-day remedy period
	Active (remedied); Terminated
	Repeat default bypasses this state.
Terminated
	Notice of Termination issued
	Terminated Account Settled
	Bond and guarantee claims within two weeks; site secured within 24 hours; blacklisting.
Terminated Account Settled
	Final certificate for the terminated contract issued and demanded
	— terminal (with the Design Guarantee Bond surviving)
	Demand letter within nine months.
Practically Complete
	Certificate of Practical Completion issued
	In Defects Liability
	DLP and Design Guarantee Bond clocks start.
Partially Occupied
	Certificate of Partial Occupation issued within seven days of occupation
	Practically Complete
	Separate DLP for the part; LAD reduced pro rata; bond and insurance unchanged.
In Defects Liability
	DLP running
	Defects Rectification; Making Good Complete
	Bypassed entirely for annual and term service contracts.
Defects Rectification
	Schedule of Defects issued at DLP expiry
	Making Good Complete; Third-Party Rectification
	Maximum three months from receipt.
Third-Party Rectification
	Contractor fails to rectify in time
	Making Good Complete
	Cost recovered from the balance due, the bond or as a specific debt.
Making Good Complete
	Certificate of Making Good Defects issued
	Pending Final Account
	End of the contractor's obligations. Bond, performance guarantee sum and retention released.
Pending Final Account
	All obligations discharged and loss and expense valued
	Final Certificate Issued; Blocked — Statutory Declaration
Blocked — Statutory Declaration
	Final payment requested without the declaration or DG Labour certificate
	Pending Final Account
	Blocking gate.
Final Certificate Issued
	Final certificate signed and accepted with no further claims
	Closed
	Final payment waterfall applied.
Closed
	Payment made, securities released, performance report filed
	— terminal, except surviving obligations
	Design Guarantee Bond survives five years from practical completion.
7.4 Mastership across the D365 / Dataverse boundary
Entity or data
	Master
	Rationale
Requisition, requisition line, budget balance, budget encumbrance
	ERP (Oracle today, D365 F&O target)
	The ERP already owns requisition registration, the budget check and the DAL recommender chain, and mints PROC and NM. Rebuilding this in the portal is the boundary error the prototype makes.
Purchase Order (PO…), Indent (IN…)
	ERP
	ERP-generated. The portal consumes them and must not generate them.
Chart of accounts, cost centres, financial dimensions
	ERP
	Five-segment cost centres and seven-digit natural accounts.
Vendor account for payment purposes
	ERP
	Bank details, payment terms, tax attributes for disbursement.
Payment execution, general ledger posting, accounts payable
	ERP
	Out of scope for the portal.
Vendor registration, statutory documents, verification, suspension, blacklist, performance grade
	Dataverse
	None of this exists in the ERP and none of it is an accounts-payable concept.
Sourcing exercise, documents, advertisement, sale register, addenda
	Dataverse
	Entirely absent from every current system.
Bid, opening, evaluation, committee, approval trail
	Dataverse
	The portal's core territory.
Contract master and baseline
	Dataverse
	The ERP holds no contract baseline. Every post-award calculation reads from here.
Certificates, variations, adjustments, extensions, defects, final account
	Dataverse
	Contract administration, not accounts payable.
Certified payable amount and its financial dimensions
	Dataverse originates; ERP consumes
	The portal certifies; the ERP pays. The certificate is the source document.
Project master
	Unresolved — decision D5
	OM/P/002 §8.3 names IFS; every artefact names Oracle.
The boundary principle. The ERP owns requisition, budget, commitment and disbursement. The portal owns everything between an approved requisition and a closed contract. The prototype draws this boundary backwards at both ends: it rebuilds requisition raising, budget check and DAL routing in-app, and it abandons the portal's actual territory — evaluation reports, committee papers, appointment letters and the whole certificate chain — either to D365 or to nothing.
8. Business rules and calculations
Every rule and formula the system must enforce, with its provenance. Where a source defines no formula, that is stated explicitly rather than filled in. Where two sources conflict, both are shown and the item is marked as a decision.
8.1 Value-band routing
See Section 4.2 and Appendix B for the full matrices. The rules the engine must enforce are:
Requisition band — RM500 / RM50,000 / RM300,000, resolving to Head of Department, Head of Division, Functional Director, CEO. Source: DAL §3.1.4.1.
Method band — RM500 / RM5,000 / RM15,000 / RM300,000. Source: DAL §3.1.4.2–.4. The RM15,000 boundary is DAL-only; no SOP in any series mentions it.
Direct-purchase escalation — RM300,000 / RM3 million / RM5 million to TBC, Chairman and Board. Source: DAL §3.1.4.2 item 1. No equivalent escalation exists for open or selective tender at any value.
Signing band — RM300,000 / RM1 million / RM3 million to Head of Division, Functional Director, CEO, each as Superintending Officer or Project Director. Source: DAL §3.1.4.4 item 5.
Interim payment band — RM100,000 / RM500,000 to Head of Division, Functional Director, CEO. Source: DAL §3.1.4.4 item 16.
Variation bands — two-dimensional in the tender regime (nine cells) and one-dimensional in the quotation regime (three cells). Source: DAL §3.1.4.4 item 7 and §3.1.4.3 item 5.
LAD waiver band — 30% of the LAD amount in the tender regime; flat CEO in the quotation regime. Source: DAL §3.1.4.4 item 12 and §3.1.4.3 item 7.
Re-measurement band — 30% of contract value in the tender regime. Source: DAL §3.1.4.4 item 8.
Contractual terms band — RM50,000 on the quotation route only, switching retention, defects liability and insurance duration. Source: appointment-letter templates.
8.2 Anti-splitting
No anti-splitting rule, no minimum-number-of-quotations table and no explicit approval-before-commitment clause exists anywhere in the DAL or in any SOP. All three are recorded as gaps in the DAL source itself. FR-REQ-015 and FR-REQ-016 propose controls; the parameters — the relatedness test, the time window, and whether an aggregation rule applies across a financial year — must be set by RSAJ. A procurement portal without a splitting control is an audit finding on day one.
8.3 Interim valuation
Rule
	Formula
	Provenance
Net adjustment to contract sum
	NetAdjustment = PPJHK_Additions + PPJHK_Omissions (omissions negative)
	CPD/B.INT(T) I24 = I22+I23
New Contract Sum
	NewContractSum = OriginalContractSum + NetAdjustment
	L25 = L19+L24
Gross work value this valuation
	GrossValue = MainContractorWorks + MaterialsOnSiteAllowance + NominatedSubContractors + NominatedSuppliers
	L43 = I35+I37+I40+I43
Materials-on-site allowance
	MaterialsAllowance = 75% × ValueOfUnfixedMaterialsAndGoods
	The 75% is printed on the form label. SK011 §7.2.3(g) says only "a percentage as stated in the contract". Make it configurable per contract, default 75%.
Total less-items
	LessItems = Retention_Main + Retention_NSC + Retention_NS + PreviousInterimPayments
	L55 = I49+I51+I53+I55
Carried forward
	CarryForward = GrossValue − LessItems
	L56 = L44−L55
Recommended payment
	Recommended = CarryForward − TotalDeductions
	L94 = L68−L93
Total certified
	TotalCertified = MainContractor + NSC + NominatedSuppliers + Assignees
	L111
Builder's Works Value
	BWV = TotalContractSum − PrimeCostSums − ProvisionalSums
	SK011 §7.2.4(a)(i)
First interim certificate minimum
	Threshold = MIN(RM1,000.00, 10% × BuildersWorksValue)
	SK011 §7.2.4(a)(i) — "yang mana lebih kurang", whichever is the lesser
Subsequent certificate minimum
	Not defined — "as stated in the contract"
	SK011 §7.2.4(b)(i)
Insurance preliminaries rule
	If the priced insurance amount exceeds the actual premium paid, pay the actual premium in the first valuation and the balance progressively
	SK011 §7.2.3(d)
Two arithmetic defects in the live workbook must be fixed rather than ported: the page-2 carry-forward is a manual re-key rather than a link to the page-1 total, and the total of the six deduction items is manually totalled rather than summed.
8.4 Payment waterfall
Applied identically to interim and final payment where the recommended amount is insufficient for all parties:
Nominated sub-contractors and nominated suppliers, apportioned pro rata within the tier.
Assignees, per the terms of each deed of assignment.
The contractor, from any remaining balance.
Ambiguity to confirm. SK011 §7.2.3(n) expresses the pro-rata apportionment as the ratio of each party's amount due "to the payment recommended as due". Read literally, that ratio does not sum to one unless the denominator is the total nominated-tier amount due. The intended arithmetic is almost certainly payment = RecommendedPayment × (amountDue ÷ Σ nominated-tier amountDue). The source is ambiguous; obtain a ruling before build.
8.5 Retention
Rule
	Position
	Provenance
Retention percentage
	NOT DEFINED ANYWHERE — not in SK011 (retention is absent from SK011 entirely), not in SK009, not in the DAL, not on any form. It lives in the Conditions of Contract.
	Blocker B3
Retention cap or limit
	NOT DEFINED
	Blocker B3
Quotation-route figures (the only ones in the corpus)
	Above RM50,000: retention of 10% of the value of work executed, capped at 5% of the total contract price. Below RM50,000: no retention.
	Appointment-letter templates
Split
	Deducted three ways on the interim certificate — main contractor, nominated sub-contractors, nominated suppliers — and released three ways on the final certificate.
	CPD/B.INT(T); CPD/SFA(T)
First release
	50% of the retention money, claimed after as-built drawings are submitted; forwarded by the Project Department headquarters to C&P, which forwards to PAAB or Finance.
	OM/P/007 §8.23–8.24
Balance release
	After a final defects inspection and, at DLP expiry, on issue of the Certificate of Making Good Defects.
	OM/P/007 §8.26; SK009 §7.7.4
Full release event
	Issue of the Certificate of Making Good Defects releases the liability of the bank or insurer for the Performance Bond, Performance Guarantee Sum and Retention Money.
	SK009 §7.7.4
DAL authority
	Release of retention sums appears in the quotation regime (Head of Division) and NOT AT ALL in the tender regime. Conversely the tender regime names release of the performance guarantee and omits retention. One of the two is a drafting oversight.
	DAL §3.1.4.3 item 12; §3.1.4.4 item 17
8.6 Liquidated and ascertained damages
Rule
	Position
	Provenance
Standard daily rate
	DailyLADRate = 0.025% × OriginalContractSum, i.e. contract sum × 0.00025
	The only LAD formula anywhere in the corpus — identical on all seven contractor-performance workbooks
Total LAD
	TotalLAD = LADDays × DailyLADRate
	Performance reports R38 = N36*S36
Rate of record
	The LAD value fixed in the Letter of Acceptance, inherited into the contract baseline
	SK007 §7.1.2
Accrual window
	NOT STATED. Logically from the extended Completion Date to actual completion, but no clause says so.
	SK007 silent — decision required
Cap or maximum
	NOT DEFINED. The only constraint is qualitative: LAD must not accumulate over a long period such that it becomes an oppression (deraan).
	SK007 §7.6.2
Precondition
	Issue of the Certificate of Non-Completion is a mandatory precondition to imposing LAD.
	SK007 §7.1.2
Recovery mechanism
	Not stated in SK007. In practice, set-off on the interim certificate deduction line.
	CPD/B.INT(T) I79
Reduction on partial occupation
	NewLADRate = OldLADRate × (1 − ValueOfPartOccupied ÷ ContractSum)
	SK009 §7.4.2(c) — implied. The form does not compute it; hold the computed value as advisory.
Per-section LAD
	A separate LAD value must be stated in the tender document and contract for each section.
	SK009 §7.3.1
Partial-EOT residual
	NOT DEFINED. SK006 §7.4.2 creates partial extensions; neither SOP says LAD applies to the un-extended portion.
	Decision required
Prototype error
	The prototype states 0.1% per day capped at 10% — a fourfold overstatement of the rate and an invented cap.
	Do not carry forward
8.7 Variation percentage against contract sum
Rule
	Formula or position
	Provenance
Routing percentage
	VOPercentage = VOValue ÷ ContractValue, then routed through the two-dimensional tender matrix or the one-dimensional quotation matrix
	DAL §3.1.4.4 item 7; §3.1.4.3 item 5
Cumulative approved variations
	NewContractSum = ContractSum + CumulativeApprovedVO + ThisVO, captured on VO-660 §3.5 and §3.6
	Forms 6b–6g
Cumulative ceiling
	NONE EXISTS. There is no "not exceeding X% of contract sum" rule anywhere in SK012 or the DAL. The percentage bands determine who approves, not whether it is permitted.
	SK012; DAL
Contract-sum breach check
	If including a variation in an interim payment would cause the Total Contract Sum to be exceeded, a Variation Order Certificate must be prepared and submitted for approval. The running sum is checked at payment time, not only at variation time.
	SK011 §7.2.3(e)
Valuation basis
	Contract rates from the BQ or Schedule of Rates with any percentage adjustment applied; otherwise rates labelled kadar harga yang dipersetujui requiring separate DAL approval. Merging of variation items is prohibited.
	SK012 §7.2.5(a)(i)(4),(6),(7)
Prior-approval exemptions
	Reductions in the Total Contract Sum; adjustment of Prime Cost Sums; adjustment of Provisional Sums; re-measurement of provisional quantities.
	SK012 §7.2.1(b)
8.8 Contract sum adjustment and final account
Rule
	Formula
	Provenance
Nett variation adjustment
	Nett_1.1 = Σ Additions(§1.1) − Σ Omissions(§1.1)
	CPD/PPJHK(T)
Nett other adjustment
	Nett_1.2 = Σ Additions(§1.2) − Σ Omissions(§1.2)
	CPD/PPJHK(T)
Total nett adjustment
	Nett_1.3 = Nett_1.1 + Nett_1.2
	CPD/PPJHK(T)
Revised Contract Sum
	Revised = OriginalContractSum + Σ(prior PPJHK adjustments) + ThisAdjustment
	CPD/PPJHK(T)
Final Contract Sum
	HargaMuktamadKontrak = OriginalContractSum + NetPPJHKAdjustment
	CPD/SFA(T) M28 = M22+M27
Less-block
	Less = ReleasedRetention(Main+NSC+NS) + PreviousInterimPayments + AdvanceRepayment(Main+NSC)
	CPD/SFA(T) page 1
Deduct-block
	Deduct = NetLAD ± Rounding + PremiumsAndPERKESOPaidByRSAJ + WagesPaidByRSAJ + CostOfNonCompliance + CostOfMakingGoodDefects + DiminutionInValue + Σ(3 other deductions)
	CPD/SFA(T) page 2
Net LAD after waiver
	NetLAD = (LADRate × LADPeriodUnits) − AmountWaived, with the waiver letter reference recorded
	CPD/SFA(T) I77 — the only place in the entire form set where an LAD waiver is captured
Recommended final payment
	Recommended = HargaMuktamadKontrak − Less − Deduct, including release of retention if any
	CPD/SFA(T) M96
Total final payment
	Total = MainContractor + Subcontractors + Suppliers + Assignees
	The live formula is broken (=M140+#REF!++#REF!+#REF!). Rebuild the roll-up; do not port it.
Price fluctuation
	NO FORMULA, NO INDEX, NO THRESHOLD AND NO DAL ROW EXIST. SK013 defers thresholds to the DAL and the DAL has no corresponding line item.
	SK013; DAL critical finding 7
8.9 Termination cost roll-up
Rule
	Formula
	Provenance
Cost of Completion
	KosPenyiapan = AdvancePaid + InterimPayments + PaymentsToNominated + NewContractPrice(adjusted) + ReTenderingCosts + CostOfLoss ± Rounding + OnCostCharge
	SK008 §7.8.1(b)(i), §7.8.2(a)–(e)
Loss rate
	LossRate = the LAD rate in the original contract, per day, week or month as the contract stipulates
	SK008 §7.8.2(f)(ii)
Cost of loss — termination after the completion date
	LossRate × Days(TerminationDate+1 → NewContract_OriginalCompletionDate)
	SK008 §7.8.2(f)(iii)
Cost of loss — termination before the completion date
	LossRate × Days(OriginalOrLastEOTCompletionDate+1 → NewContract_OriginalCompletionDate)
	SK008 §7.8.2(f)(v)
Re-tender cap
	ReTenderDays = MIN(ActualDays(TerminationDate+1 → SitePossessionUnderNewContract), 120)
	SK008 §7.8.2(f)(iii),(iv)
On-cost charge
	OnCost = OnCostPercentage × NewContractPrice. The percentage is "as agreed and stated in the contract document" — no fixed value given.
	SK008 §7.8.2; CPD/PMKD(T) M55
Adjusted Original Contract Price
	Adjusted = OriginalContractSum + NetAdjustment − LADImposed ± Rounding − OtherDeductions, the adjustment including all variations issued before termination whether or not executed
	SK008 §7.8.1(b)(ii), §7.8.2(g)
Difference and settlement
	Difference = KosPenyiapan − Adjusted; then less forfeiture of the advance payment guarantee and forfeiture of the performance bond; the sign determines the direction of payment.
	CPD/PMKD(T)
Settlement rule
	Where the Cost of Completion exceeds the Adjusted Original Contract Price, issue the certificate with a demand letter by registered post within nine months. The converse case is not addressed by the SOP.
	SK008 §7.8.3(a),(b)
Re-nomination value
	NewSubcontractSum = OriginalSubcontractSum − AmountsAlreadyPaid
	SK008 §7.7.2(g)
8.10 Bonds and insurance
Rule
	Position
	Provenance
Performance bond — the three competing formulas
	Option A: 5% × Total Contract Price (SK004 §7.3.3(a)). Option B: 5% × the ONE (1) YEAR value of the contract sum, valid for the Contract Period plus 12 months — the live award pack computes RM26,937.70 on a RM1,077,508.60 two-year contract, roughly half of Option A. Option C: the SK001 7.3.4(f)(ii) CAPEX band at RM1 million, whose two sides are substantively identical and which is therefore inoperative as printed; no OPEX rule exists at all.
	Decision D4. Do not default. Likely reading: the one-year basis applies to multi-year term contracts and the full-price basis to single-period works contracts — but nothing in the corpus says so.
Nominated party bond
	5% × SubContractPrice, or 5% of the total value of the materials or goods to be supplied — given to the contractor, not to Ranhill SAJ
	SK010 §7.6.2
Design Guarantee Bond
	5% (or as stated in the contract) × ValueOfDesignWork, released only five years after the practical completion date
	SK009 §7.8
Works insurance
	Sum insured equals the full Contract Price plus any amount stated in the Appendix. Period is the whole period to completion.
	SK004 §7.3.3(b)
Public liability — the seven-band table
	Contract price up to RM25,000 → RM10,000; RM25,001–RM50,000 → RM25,000; RM50,001–RM150,000 → RM50,000; RM150,001–RM250,000 → RM75,000; RM250,001–RM500,000 → RM100,000; RM500,001–RM1,000,000 → RM150,000; above RM1,000,000 → RM200,000. Unusual risk raises the limit to "a more reasonable amount" — unquantified.
	SK004 §7.3.3(c)
Insurance period
	Completion period + DLP + 3 months 14 days; for Design & Build and Turnkey, + 3 months 28 days.
	SK004 §7.3.3(c)
Workmen's compensation
	Sum insured equals the total wages of employees not covered by PERKESO — those earning more than RM1,000.00 per month. The live award pack instead specifies 10% of the contract sum — a conflict to resolve.
	SK004 §7.3.3(e); observed award pack
Issuer
	Bank guarantees must be issued by a Bank Negara Malaysia-approved bank.
	Observed award pack
8.11 Evaluation scoring
Rule
	Position
	Provenance
SOP position
	No scoring, no marks, no points, no pass mark, no weighting, no ranking formula and no matrix. Four qualitative aspects for traditional contracts; two sequential stages for Design & Build and Turnkey.
	SK003 7.2.2, 7.3
Tender composite (practice)
	Total = (Technical × 60%) + (Financial × 40%), passing 60, and the tenderer must pass Stages 3 and 4 individually.
	TA 109 Stage 5 — [PRACTICE]
Tender technical (practice)
	Passing 70%, weightage 60 marks. PEP 40% (past experience 15, works in progress 5, preliminary programme 5, project organisation 5, plant 10) plus Technical Requirement 60% (design, calculation, specification and drawing 40, method statement 20).
	TA 109 Stage 3
Tender financial (practice)
	Passing 60%, weightage 40 marks. Paid-up Capital 10, Nett Worth 10, Total Working Capital as a percentage of Minimum Capital Required 60, Gearing Ratio 10, Current Ratio 10, where Minimum Capital Required = 10% of the Tender Amount.
	TA 109 Stage 4
Quotation technical (practice)
	Maximum 90%; six criteria; a fail entitles the tenderer to a clarification session.
	Quotation template Fasa 2 — the entitlement has no SK003 basis and is a fairness exposure
Quotation financial (practice)
	Minimum capital = estimate × 3% (materials from the RSAJ store) or 5% (contractor-supplied), against the three-month average bank balance. Bands: Kukuh above 15%, Baik at 10%, Memuaskan below 10%, Gagal below the floor.
	Quotation template Fasa 3
Quotation commercial (practice)
	Rendah below −15%; Kompetitif within ±15%; Tinggi above +15%, against the estimate and against the lowest.
	Quotation template Fasa 4
Contractor performance bands
	Terbaik 80–100, Baik 60–79, Sederhana 50–59, Tidak Memuaskan 40–49, Gagal 0–39.
	Quotation template; FORMS §12
Performance scoring engine
	WeightedScore = (RawScore ÷ 5) × Weight, weights summing to exactly 1.00; grade bands as half-open intervals [0,40)=E, [40,50)=D, [50,60)=C, [60,80)=B, [80,100]=A.
	FORMS §12 — the live nested formula leaves gaps at the boundaries; fix rather than port
Shortlisting
	Tender: rank by Form of Tender price, the number shortlisted decided by the Head of Contract & Procurement — unbounded discretion. Quotation: shortlist three (3) or four (4).
	TA 109 Stage 2; quotation Fasa 1(d)
Quotation value ceiling
	Bids above RM300,000.00 are not evaluated at all.
	Observed practice
8.12 Decisions arising from silent or self-contradictory sources
Where a source is silent or contradicts itself, the options are set out below and the item is a decision for Ranhill SAJ. The delivery team must not pick one.
#
	Item
	Options
	Recommendation
R1
	Performance bond basis
	A: 5% of the total Contract Price (SK004). B: 5% of the one-year value with validity of the contract period plus 12 months (live practice). C: the SK001 CAPEX band, which is inoperative as printed and has no OPEX counterpart.
	Make the basis a per-contract configuration field with no default. Obtain a written ruling on which basis applies to which contract shape.
R2
	The > versus ≥ operator at RM300,000
	A: > (SK001 narrative, SK002, SK003, OM/P/005). B: ≥ (SK001 flowchart). C: tender at exactly RM300,000 (KP002/003/004).
	Single configuration value. Interim position >, logged as an exception, pending a written Quality Instruction.
R3
	Retention percentage and cap
	A: the quotation-route figures — 10% of work executed capped at 5% of the total contract price above RM50,000. B: whatever the Conditions of Contract state. C: undefined.
	Per-contract configuration field, populated from the Appendix to the Conditions of Contract. Obtain the Conditions of Contract.
R4
	LAD accrual window and cap
	A: extended Completion Date to actual completion, uncapped. B: as the Conditions of Contract state. C: a configured cap as a percentage of the contract sum.
	Per-contract configuration with the anti-oppression alert at FR-LAD-012 as the interim control.
R5
	Termination authority
	A: Superintending Officer (SK008 §7.5.1). B: CEO (DAL §3.1.4.4 item 13, §3.1.4.3 item 8).
	Build the DAL. It is Board-approved and is the more senior instrument. Escalate for a written reconciliation.
R6
	EOT approver where there is no financial impact
	A: the VOC approves (SK006 §7.6.1 as amended 12.01.2026). B: the SO/PD approves with the VOC as mandatory recommender (DAL §3.1.4.4 item 10b).
	Build the DAL, but escalate urgently: SK006 is 4.5 years newer and rewrote precisely this clause. Either the VOC has been informally elevated without a DAL amendment, or SK006 is loosely drafted.
R7
	Extension of contract period threshold
	A: no band — everything to the Tender Board (DAL §3.1.4.4 item 9). B: RM50,000 financial-impact threshold with the band below it undefined (SK006 §7.6.2). C: Functional Director with QC recommendation in the quotation regime (DAL §3.1.4.3 item 9), which appears in neither SK006 branch.
	Do not default the RM0.01–RM50,000 band. Build the DAL and require an explicit business decision on the undefined band.
R8
	Interim payment routing
	A: three DAL bands — RM100,000 and RM500,000. B: the routing sheet's two bands, CEO at or above RM500,000 and S.O. below.
	Build the DAL's three bands. Note the form also uses ≥ where the DAL uses >.
R9
	Unfixed materials percentage
	A: 75% (printed on the form). B: as the contract states (SK011).
	Configurable per contract, default 75%.
R10
	Site visit and briefing mandatory status
	A: optional, no register, no consequence (SK002). B: mandatory, attendance gates document purchase (TA 109 advertisement and quotation practice).
	Build the switch per exercise. RSAJ must either amend SK002 or keep the condition in each tender's own notice.
R11
	Late tender treatment
	A: forwarded to the Tender Board, which alone decides (SK003 7.2.1(a)). B: rejected by the evaluator (quotation Fasa 1 practice).
	Build A for tenders. If practice B has migrated to the tender route, tenders are being rejected by officers with no authority to reject them.
R12
	Completeness failure
	A: reported to the Tender Board, which decides (SK003 7.2.2(a)). B: an eliminatory pass/fail gate (TA 109 Stage 1, quotation Fasa 1).
	Build A as the default with B available as a per-exercise configuration, pending reconciliation.
R13
	Unsuccessful tenderer document clocks
	A: as printed — one month from work commencement to claim, disposal within 30 days of site possession. B: aligned to a single trigger and period.
	A is legally unsafe: as printed, the disposal deadline can fall before the collection right expires. Recommend aligning both to site possession as the earlier and more objectively recorded event.
R14
	Contract standard form for 25.01.2011 to 31.12.2020
	A: JKR 203 / 203A. B: the Ranhill SAJ Standard Form. C: neither — a genuine drafting gap.
	Do not model a date-driven form-selection rule until confirmed. Affects legacy contracts still in defects liability or final account.
9. Integration architecture
9.1 The current-state finding that determines everything else
The live transactional ERP at Ranhill SAJ today is Oracle-based, not Dynamics 365 Finance & Operations. The evidence is direct: the pre-printed field label "Oracle Reference :" appears on a currently controlled form (PEN/LRA/06-01, Rev. 01.04.2025), filled in by hand with a PROC… number — so PROC numbers are Oracle document identifiers. The workflow states REQUEST NOTE, REGISTRATION, DAL RECOMMENDER 1, DAL RECOMMENDER 2, DAL RECOMMENDER 3 and DAL APPROVAL are a bespoke layer named directly after Ranhill SAJ's own DAL manual, not stock step names in any commercial ERP. The five-segment cost centres and seven-digit natural accounts are Oracle E-Business Suite flexfield-shaped. The only D365 artefact in the entire corpus is a Microsoft Contoso usmf demo journal print, produced by SQL Server Reporting Services in the "US Manufacturing Pty Ltd" legal entity in US dollars. It is evidence of the target state, not the current one. Every "Synced to D365 F&O" badge in the prototype is a claim about a system that does not yet hold this data.
Two further current-state facts change integration design:
A third system claim is unresolved. OM/P/002 §8.3 and its flowchart both state that project registration happens in the "Intergrated Financial System (IFS)" — the only named IT system in the entire ten-manual OM/P series. This may be a separate project-accounting application distinct from the finance and procurement ERP, or it may be stale documentation. The portal must take a position; today it has none.
Email is Zimbra (zmail.ranhill.com.my), not Microsoft 365. Every email-mediated step — quotation invitations, addendum notification, vendor activation, resubmission requests, tender blasts — assumes Exchange or Microsoft Graph in the prototype. This must be confirmed before any orchestration mail design is finalised.
9.2 The Power Apps / Dataverse / ERP boundary, module by module
Module
	Portal (Dataverse / Power Apps)
	ERP
	Interface
Requisition and budget
	Displays the requisition, its lines, its budget position and its DAL trail. Does not originate them.
	Owns requisition creation, PROC and NM minting, budget check, encumbrance and the DAL recommender chain.
	Read of requisition header, lines, budget result and approval trail. Write-back of the sourcing outcome.
Sourcing, invitation, sale, opening, evaluation
	Owns everything. No ERP counterpart exists.
	None.
	None required.
Committee and approval
	Owns everything. The ERP's DAL chain covers the requisition only.
	None beyond the requisition.
	None required.
Award
	Owns the Letter of Acceptance, the appointment letter and the award decision. Requests indent or purchase-order creation.
	Mints IN… and PO…, holds the commitment.
	Portal → ERP: award decision, vendor, value, account code, cost centre. ERP → portal: indent or purchase-order number.
Contract master
	Owns the contract, the baseline and every certificate. The ERP has no contract baseline.
	Holds the vendor account and the financial dimensions.
	Portal → ERP: contract header for reference.
Interim and final payment
	Owns the valuation, the certificate, the deductions and the waterfall. Produces a certified payable amount per payee.
	Receives the certified amount, posts the liability, executes payment, returns the batch and payment date.
	Portal → ERP: payment instruction per payee with financial dimensions. ERP → portal: batch number, payment date, payment status.
Vendor
	Owns registration, statutory documents, verification, suspension, blacklist and performance.
	Owns the vendor account for disbursement.
	Portal → ERP: create or update vendor on approval; block on suspension or blacklist.
Securities and insurance
	Owns the register and the expiry alerting.
	None.
	None required.
Document repository
	Owns the generated documents, versions, controlled copies and classification.
	None.
	Coexistence and migration plan required for Public Server: 27 and the forms file share.
9.3 What the Oracle-today finding means for sequencing
Do not build against a D365 contract. Build the ERP-facing interfaces against a stable internal contract — an integration façade — and implement an Oracle adapter behind it now and a D365 adapter later. The façade contract is defined by the payloads in 9.5, not by either system's native schema.
Take PROC… as the primary business key from day one. Whichever ERP is live, that key is the join. It is an Oracle document identifier today; if D365 replaces Oracle, the migration must preserve or map it, because every portal record will hang off it.
Plan an interim integration. The minimum viable interim interface is a scheduled read of approved requisitions with their budget position and DAL trail, plus a write-back of the award outcome sufficient for the ERP to mint an indent or purchase order. Everything else can be manual for the first release. If even that is not achievable against Oracle in the timeframe, the fallback is a controlled file exchange or an operator-mediated key entry with reconciliation reporting — but the PROC key must still be captured, not invented.
Do not implement the accounts-payable three-way match. Ranhill SAJ does not pay works contractors that way. The prototype's purchase-order, goods-receipt and invoice matching screens model a generic accounts-payable flow that is the wrong shape for this business, and they are unreachable in any case.
Confirm the mail platform before designing notification. If Zimbra remains, notification must go over SMTP or a Zimbra interface rather than Microsoft Graph, and the vendor-facing mail templates must be tested against it.
Resolve IFS. If a separate project-accounting system genuinely registers projects at an approved price, it is a fourth integration point and the project master lives there.
9.4 Integration inventory
Ref
	Interface
	Direction
	Trigger
	Payload
	Frequency
	Failure handling
INT-01
	Approved requisition intake
	ERP → Portal
	Requisition reaches DAL Approved
	PROC number, NM number, department, cost centre, account code, lines, estimated value, budget result (actual, balance as at, approved account, projected balance), DAL approval trail with actors and timestamps
	Near real time (event) with a scheduled reconciliation sweep
	Retry with exponential backoff; dead-letter queue; reconciliation report of requisitions approved in the ERP but absent from the portal
INT-02
	Budget re-check
	Portal → ERP → Portal
	Sourcing exercise created; award recommended; requisition older than the configured staleness window
	Cost centre, account code, requested amount
	On demand
	Synchronous with a timeout; on failure the last known position is displayed with its age and the exercise is flagged
INT-03
	Vendor master sync
	Portal → ERP
	Vendor approved, amended, suspended, reinstated or blacklisted
	Vendor code, registered name, SSM number, addresses, bank and E-Payment profile, tax attributes, status
	Event-driven
	Retry; failure alerts the vendor administrator; the vendor cannot be paid until the sync succeeds
INT-04
	Award outcome and commitment request
	Portal → ERP
	Letter of Acceptance or appointment letter issued
	PROC reference, vendor, awarded value, completion period, cost centre, account code, contract type, method
	Event-driven
	Retry; on persistent failure the award remains valid in the portal and the commitment is raised manually with a reconciliation exception
INT-05
	Indent and purchase order number return
	ERP → Portal
	Indent or purchase order created in the ERP
	IN<YYYY><NNNNN> or PO<YYYY><NNNNN>, date, value, PROC reference
	Event-driven
	Reconciliation report of awards without a returned commitment number
INT-06
	Payment instruction
	Portal → ERP
	Interim or final certificate approved
	Certificate reference, contract number, payee (main contractor, nominated sub-contractor, nominated supplier or assignee), certified amount per payee, deductions detail, financial dimensions, due date
	Event-driven
	Retry; a failed instruction leaves the certificate in Approved-Not-Instructed with a daily exception report
INT-07
	Payment confirmation
	ERP → Portal
	Payment executed
	Certificate reference, batch number, payment date, amount paid per payee, payment status
	Event-driven or daily batch
	Reconciliation of certificates approved but unpaid beyond the service-level target
INT-08
	Project master registration
	Portal → project system
	Project approved at a price
	Project name, approved price, funding source, department
	Event-driven
	Target system unresolved — decision D5. Build against the façade.
INT-09
	Notification and correspondence
	Portal → mail platform
	Any notifiable event: addendum, vendor activation, resubmission request, approval reminder, expiry alert, award and non-award notice
	Recipient, template, merge data, attachments
	Event-driven
	Per-recipient delivery status; failed deliveries retried and reported; platform is Zimbra today, not Microsoft 365
INT-10
	Payment gateway (document fees)
	Portal ↔ gateway
	Vendor purchases a tender document
	Amount, exercise reference, vendor, receipt data
	Real time
	Idempotent transaction reference; unreconciled payments held in a suspense report; documents released only on confirmed settlement
INT-11
	Statutory registry validation
	Portal → external
	Vendor registration and periodic revalidation
	Registration number and the check performed against SSM, CIDB, MOF, SPAN, Suruhanjaya Tenaga and LHDN as available
	On registration and on a configurable cycle
	Availability is not assumed. Where a registry is unavailable, the document remains in manual-verification state; the portal must never silently pass an unverified document
INT-12
	Regulator notification of award
	Portal → external
	Letter of Acceptance issued
	Award particulars to CIDB, LHDN and, for water-services contracts, SPAN
	Event-driven
	Where electronic lodgement is unavailable, generate the addressed copy and record manual despatch — the obligation is to distribute, not necessarily to integrate
INT-13
	Document repository
	Portal ↔ repository
	Any document generated or uploaded
	Document, metadata, classification, version, controlled-copy status
	Event-driven
	Coexistence with Public Server: 27 and P:\27.CONTRACT & PROCUREMENT\5.FORMS\ required during transition
INT-14
	Identity
	Portal ↔ directory
	Internal user authentication and role assignment
	Identity, group membership, org position for DAL role resolution
	Real time
	Internal users authenticate against the corporate directory; vendors against a separate external identity store
9.5 Interface design principles
Idempotency. Every inbound and outbound message carries a stable business key (PROC, contract number, certificate reference) and a message identifier. Replaying a message must not create a duplicate.
No silent failure. Every interface has a reconciliation report showing records that should have crossed the boundary and did not. Integration failures surface as business exceptions to named owners, not as log entries.
The portal is never blocked by an ERP outage for work it owns. Evaluation, committee decisions and certificate preparation continue; only budget re-checks, commitment creation and payment instruction are affected, and each degrades to a recorded manual step with an exception.
Financial dimensions travel with money. Every payment instruction carries cost centre, account code and, where the terminated-contract certificate applies, the Tahun Perbelanjaan, Kepala and Pecahan Kepala budget-coding fields — the only such fields printed on any form in the set.
Sequences: generate five, consume four. The portal generates RSAJ/KP/Q(JB|MR|IP)/NNN/YY, RSAJ/KP/ST/NN/YY, RSAJ/TA/NNN/YYYY, RSAJ/KP/T/NN/YYYY and the (N) RSAJ-<DIV>-… correspondence file references. It consumes PROC…, NM/YYYY/NNNNN, IN… and PO… from the ERP. The PO counter behaviour is unresolved and must be confirmed before any generator is built — the observed volume is inconsistent with an annual reset.
10. Non-functional requirements
These requirements apply across every module. They matter more here than in a typical business system because the records the portal produces are the legal basis for appointments, payments and terminations, and because a regulator has already audited the underlying procedures within the last year.
10.1 Audit and evidentiary integrity
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-AUD-001
	The system shall record an immutable audit entry for every create, read of a classified record, update, delete, approval, rejection, delegation, escalation, override, document generation, despatch and configuration change, capturing actor, role held at the time, timestamp to the second, source address, before and after values, and the business context.
	M
	A penetration test confirms no application path can alter or delete an audit entry. Every state change on a case is reconstructable from the trail alone.
NFR-AUD-002
	The system shall retain, against every approval, the DAL version and clause relied upon at the time of the decision, so that an approval can be validated years later against the rules then in force.
	M
	An approval made under DAL revision five continues to display revision five even after revision six is loaded.
NFR-AUD-003
	The system shall produce a tamper-evident export of any case's complete record, suitable for an external auditor or a court, including document versions and cryptographic checksums.
	M
	An exported case can be verified as unaltered against the system record.
NFR-AUD-004
	The system shall log every access and every attempted access to a record classified SULIT, whether successful or refused.
	M
	Access to the company estimate before opening, to selected-tender information and to evaluation data produces a log entry in each case.
NFR-AUD-005
	The system shall apply time from a single authoritative server-side source and shall not accept client-supplied timestamps for any legally significant event.
	M
	Changing a client device clock has no effect on a bid submission time, a signature time or an approval time.
NFR-AUD-006
	The system shall prevent back-dating of any signature, approval or certificate date, and shall record any exception with a reason and an authorising officer.
	M
	A back-dated entry is refused, or recorded as an exception visible on the audit report.
10.2 Records retention
None of the fourteen SK Operation Manuals has a records section or a retention period. All of them run from section 1.0 to section 8.0 and terminate at the flowchart. The only retention statement in the entire pre-award set is SK003 7.11, on unsuccessful tenderers' documents, and its two clocks are mutually inconsistent. SK004 §7.8 requires secure custody of the original contract document, bond and insurance policies "preferably in a secure cabinet" with no duration. The Project Department series states three years, and OM/P/001 states "until the contract final account is issued" — but those govern Project Department records, not Contract & Procurement records. An ISO 9001 procedure set with no records clause is itself an audit exposure. The retention schedule for the portal must be written from scratch.
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-RET-001
	The system shall implement a configurable retention schedule by record class, with a defined retention trigger, retention period, disposal method and disposal authority, and shall not permit disposal of any record with a surviving obligation.
	M
	A design-and-build contract with an outstanding Design Guarantee Bond cannot be disposed of, even where the contract retention period has expired.
NFR-RET-002
	The system shall implement a legal hold that suspends disposal for records subject to audit, dispute, arbitration or litigation.
	M
	A record under hold is excluded from every disposal run and the hold is visible on the record.
NFR-RET-003
	The system shall implement the unsuccessful-tenderer document lifecycle: a claim window of one month from the work commencement date, transfer of ownership to Ranhill SAJ on expiry, and disposal within thirty days of the site possession date with company background information destroyed by shredding.
	M
	Both clocks are computed and reported. The system shall not dispose of a record while the claim right subsists, notwithstanding that the printed clauses permit it.
NFR-RET-004
	The system shall record the physical custody, location and movement of every original paper instrument that continues to exist outside the system.
	M
	Every original bond, insurance policy and executed contract has a recorded location and a movement log.
10.3 Bilingual output
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-LNG-001
	The system shall provide a full internationalisation layer supporting Bahasa Malaysia and English for every user-interface label, message, validation text and notification, selectable per user and switchable without loss of context.
	M
	A user switching language mid-task sees the whole interface in the selected language and loses no entered data.
NFR-LNG-002
	The system shall generate every certificate, letter and routing sheet in the language of its controlled template, and shall support both a Malay and an English variant where the form exists in both.
	M
	The seven contractor performance reports generate in both the (B) and (E) variants. The Malay certificates generate in Malay.
NFR-LNG-003
	The system shall store one label pair per field so that bilingual forms print the Malay line with the English line beneath, as the controlled forms do.
	M
	A generated certificate reproduces the bilingual field labels of the printed form.
NFR-LNG-004
	The system shall correctly handle Malay diacritics, full names, honorifics and organisation names in all input, storage, search, sorting and document generation.
	M
	Names and titles round-trip without corruption through entry, storage, search and print.
The prototype is English-first with Malay used as decoration: printable modals are in Malay, evaluation labels are mixed, the application interface is English-only, and the Settings language dropdown does nothing. Every operative form in the library is Malay.
10.4 Document generation fidelity
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-GEN-001
	The system shall generate every certificate to visual fidelity with its controlled printed form, including the form code, revision date, page numbering in the form "n of m", field order, field labels, bilingual label pairs, tick-box and strike-out conventions, and signature-block layout.
	M
	A generated certificate placed beside the controlled form is recognisably the same document. The Post-Contract Section signs off each template against the printed original.
NFR-GEN-002
	The system shall reproduce the strike-out convention (potong jika tidak berkenaan) as an explicit choice field rather than as printed text requiring manual deletion.
	M
	Selecting Tambahan on a variation certificate suppresses Potongan on the printed output.
NFR-GEN-003
	The system shall produce documents in a fixed-layout format suitable for printing, signing and filing, and shall embed the document reference, version and generation timestamp on every page.
	M
	A printed certificate is unambiguously identifiable and its version traceable.
NFR-GEN-004
	The system shall regenerate a document deterministically: the same record at the same version produces a byte-identical document.
	S
	Two generations of the same version produce identical output.
10.5 Electronic signature
No SOP clause authorises electronic signature. SK002 7.7.1–7.7.4 mandate a physical tender box, a physical key and a physically initialled schedule; every certificate in the forms library carries a wet-signature block; the Letter of Acceptance travels by registered post. An amendment to SK002 §7.7, and a policy decision on electronic signature for certificates, are programme deliverables, not afterthoughts. Until they are in place, the portal must support a hybrid: generate, route and record electronically, and capture the wet signature as a scanned attachment bound to the record.
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-SIG-001
	The system shall bind every signature to an authenticated identity, the exact document version signed, a server-side timestamp and the role under which the signatory acted.
	M
	A signature cannot be transferred to another document version. Altering a signed document invalidates the signature.
NFR-SIG-002
	The system shall support a hybrid signature mode in which a wet-signed original is scanned and bound to the record, with the scan's integrity protected and the binding audited.
	M
	A wet-signed certificate is attached to the record it belongs to and cannot be silently substituted.
NFR-SIG-003
	The system shall enforce the printed signature order on every instrument and shall prevent a signature block from being completed out of order.
	M
	See FR-CRT-004.
NFR-SIG-004
	The system shall support contractor and witness signature capture with the contractor's stamp (Cop Kontraktor), full name, address for the witness, identity-card number where the form requires it, and date.
	M
	The acceptance blocks on the variation certificate, the adjustment certificate and the final account reproduce every field.
10.6 Access control and security
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-SEC-001
	The system shall enforce role-based access control derived from the permissions matrix in Section 5.4, with record-level scoping by department, division and case assignment.
	M
	A user outside the evaluation team cannot retrieve evaluation data for that exercise by any route, including report, export and search.
NFR-SEC-002
	The system shall implement a document classification model with at least the classes Public, Internal and SULIT, and shall apply SULIT automatically to selected-tender information, the department and company estimates, and all evaluation and tender-certification information.
	M
	Classification is applied automatically at creation and cannot be downgraded without an authorised, audited action.
NFR-SEC-003
	The system shall encrypt sealed bid content at rest with keys that no single administrator can use alone to decrypt before the authorised opening.
	M
	A privileged database query against a sealed bid returns ciphertext.
NFR-SEC-004
	The system shall separate the system administration role from every transactional, approval and certification capability, and shall subject configuration changes to maker-checker approval.
	M
	An administrator cannot approve a matter, sign a certificate or alter an audit entry, and cannot make a DAL configuration change acting alone.
NFR-SEC-005
	The system shall authenticate internal users against the corporate directory with multi-factor authentication for any user holding approval or certification capability, and shall authenticate vendors against a separate external identity store.
	M
	An approver cannot authenticate with a single factor. Vendor and internal identity stores are separate.
NFR-SEC-006
	The system shall enforce session timeout, concurrent-session limits and re-authentication before any approval, signature or unseal action.
	M
	Re-authentication is required at each of those three actions.
NFR-SEC-007
	The system shall scan every uploaded file for malware, restrict accepted file types, and enforce a maximum file size, refusing and logging any upload that fails.
	M
	A file with a disallowed type or a detected threat is refused and logged.
NFR-SEC-008
	The system shall hold all data within Malaysia unless Ranhill SAJ authorises otherwise in writing.
	M
	The hosting region is documented and evidenced.
10.7 Performance, availability and capacity
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-PRF-001
	The system shall render any list or record view within 3 seconds and any search within 5 seconds at the 95th percentile under expected concurrent load.
	M
	Measured under a load test at the agreed concurrency.
NFR-PRF-002
	The system shall generate any single certificate within 10 seconds and shall process a bulk generation or distribution run asynchronously with progress feedback.
	M
	Measured; bulk runs do not block the user.
NFR-PRF-003
	The system shall support the bid-submission peak, in which a material proportion of bidders submit in the final hour before 2.30 p.m., without degradation or rejection of a valid submission.
	M
	A load test simulating the closing-hour peak shows no failed submissions and no timestamp drift.
NFR-AVL-001
	The system shall achieve 99.5% availability during business hours, and shall be available without exception during the two hours preceding any published closing time.
	M
	Measured monthly. No planned maintenance may be scheduled in a closing window.
NFR-AVL-002
	The system shall meet a recovery time objective of 4 hours and a recovery point objective of 15 minutes, with the recovery procedure tested at least annually.
	M
	A documented and executed recovery test.
NFR-AVL-003
	The system shall degrade gracefully on an integration outage, allowing all portal-owned work to continue and recording the affected steps as exceptions.
	M
	With the ERP unavailable, evaluation, committee decisions and certificate preparation continue.
10.8 Mobile use for site staff
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-MOB-001
	The system shall provide a mobile experience for the daily site diary, supporting entry, dual signature capture and photographic attachment from a handheld device.
	M
	A site officer and the contractor's agent can complete and sign a diary entry on site in under two minutes.
NFR-MOB-002
	The system shall support offline capture with deferred synchronisation for the site diary, defect reports, joint inspections, materials-on-site lists and site measurement, preserving the true capture time and flagging the synchronisation time separately.
	M
	A record captured with no connectivity synchronises correctly and retains its capture timestamp.
NFR-MOB-003
	The system shall support photographic capture with location and timestamp metadata for defect reports, joint inspections and the termination inventory.
	M
	Photographs are attached to the correct record with metadata intact.
NFR-MOB-004
	The system shall provide mobile approval for approvers, sufficient to review the matter, the DAL clause applied and the supporting documents, and to approve or reject with a reason.
	S
	An approver can discharge a step from a handheld device with the same information available on a desktop.
10.9 Usability, accessibility and configurability
Req ID
	Requirement
	Pri.
	Acceptance criteria
NFR-USE-001
	The system shall present, at every decision point that carries a legal consequence, the rule being applied and its source clause.
	M
	An approver sees the DAL clause; an officer setting a closing date sees the two-week rule when it is breached.
NFR-USE-002
	The system shall express validation failures in terms of the rule breached and the source, not in technical terms.
	M
	A closing date on a Sunday produces "The closing date must not fall on a weekend or a public holiday (SK002 7.4.2(g))".
NFR-USE-003
	The system shall meet WCAG 2.1 level AA for all internal and vendor-facing interfaces.
	S
	An accessibility audit reports no level AA failures.
NFR-USE-004
	The system shall hold every threshold, band, percentage, period, committee, template, numbering series and routing rule as configuration rather than code.
	M
	A named business administrator can change any of them without a deployment, subject to maker-checker approval.
NFR-INT-001
	The system shall expose the integration façade defined in Section 9 as a versioned contract, so that the ERP behind it can change without altering portal logic.
	M
	Switching the ERP adapter from Oracle to D365 requires no change to any portal module.
11. Compliance and controls
11.1 SPAN audit exposure
Ranhill SAJ is a licensed water-services operator regulated by the Suruhanjaya Perkhidmatan Air Negara under the Water Services Industry Act 2006 (Act 655). The regulator audited the company in October 2025, and that audit directly drove the rewrite of SK001 7.3.4(a) and SK002 7.2.1 on 2 January 2026 — the newest and most externally scrutinised text in the entire corpus. SPAN is also a mandatory recipient of the Letter of Acceptance for water-services contracts, an alternative granting authority for special permission to tender, and the issuer of the IPA permits that successful bidders must hold.
The controls the portal must therefore be able to evidence to a regulator are:
That every tenderer's registration was active and valid across the whole window from advertisement date to closing date, not merely on one day.
That the SPAN permit requirement was disclosed pre-bid in the Instructions to Tenderers, with the required permit type named.
That the eligibility conditions were applied and that any failure produced rejection.
That the Letter of Acceptance was distributed to SPAN for every water-services contract.
That the authority exercised at every approval matched the Board-approved DAL in force at the time.
An open question the portal cannot resolve. SK001 7.3.4(a) treats the SPAN permit as a post-award obligation on the successful bidder. KP002 5.2.1 and the TA 109 Stage 1 checklist treat SPAN registration or permit as a pre-bid eligibility requirement. This determines whether a bidder without a permit may bid at all, and it is precisely the area the SPAN audit touched. See Section 12 OQ-04.
11.2 The Integrity Pact
Stage
	Instrument
	When executed
	Source
Stage One (Peringkat Pertama)
	Surat Akuan Pembida — Bidder's Declaration, plus a Surat Pewakilan Kuasa (Letter of Authorisation) from the signing representative. All tenderers submitting a tender document must sign, declaring that they will not offer or give a bribe as an inducement to obtain the contract.
	At the time the tenderer submits the Tender Document
	SK001 7.3.4(j)(i),(ii),(iii)
Stage Two (Peringkat Kedua)
	Surat Akuan Pembida Berjaya — Successful Bidder's Declaration, attached to the signed Letter of Acceptance, plus a Surat Pewakilan Kuasa. A mandatory document to be returned with the Letter of Acceptance.
	At the time the successful tenderer returns the Letter of Acceptance
	SK003 7.10.1–7.10.3
Stage Three (Peringkat Ketiga)
	A briefing at contract signing, emphasising to the contractor the action that may be taken on breach of the anti-corruption clause.
	At contract signing
	SK004 §7.5.2
The Anti-Corruption Clause in Government Procurement must additionally be present in every agreement (SK004 §7.3.4). The prototype implements Stage One and neither Stage Two nor Stage Three, and has the anti-corruption obligation only as a vendor-side ISO 37001 declaration checkbox.
11.3 Bumiputera requirements
Where a tender is open to Bumiputera contractors only, both the Tender Document and the Tender Table Document must be stamped clearly and legibly with the words TENDER UNTUK BUMIPUTERA SAHAJA (SK001 7.3.2).
At document sale the officer on duty must verify the original or a certified true copy of the contractor's Bumiputera status certificate, and must check that the status is still valid (SK002 7.5.1(b),(c)).
Bumiputera status must be an attribute of the vendor with its own expiry date, and must be enforceable as a tender restriction — not merely displayed. The prototype captures the status and never uses it as a restriction.
11.4 CIDB and MOF registration validation
Requirement
	Applies to
	Source
Lawful registration with SSM, the Registrar of Businesses or an equivalent body
	All tenderers
	SK001 7.3.4(a)
Valid CIDB registration with the grade, category and specialisation appropriate to the scope of work, selected per CIDB's own guidance
	Works, construction, infrastructure, mechanical and electrical
	SK001 7.3.4(a)
Valid MOF registration with the relevant Kod Bidang, with company status active and not suspended
	Supply and services
	SK001 7.3.4(a)
A valid Sijil Perolehan Kerja Kerajaan (SPKK) where required
	As applicable
	SK001 7.3.4(a)
Continuous validity from the tender advertisement date through to the tender closing date
	All
	SK001 7.3.4(a)(i) — the SPAN-audit clause
Registration with Suruhanjaya Tenaga and with any authority such as BOMBA for related work, where required
	Works
	SK001 7.3.4(a)
Manufacturer or OEM certificate, certified personnel and special licences (ST, DOSH, MCMC) where necessary
	ICT, facilities management, technical services
	SK001 7.3.4(a)
Surat Akuan Tidak Disenaraihitam — declaration of not being blacklisted
	All
	SK001 7.3.4(a)
Evidence of similar project experience where required; all certificates valid, clear, legible and certified where required
	All
	SK001 7.3.4(a)
Sanction: "Any failure to comply with these eligibility conditions will cause the Tenderer's offer to be REJECTED without any liability to Ranhill SAJ."
	All
	SK001 7.3.4(a)
Note the internal conflict: SK002 7.2.1 reads conjunctively (SSM and CIDB and MOF) while SK001 7.3.4(a)(i) reads disjunctively (SSM and, for works, CIDB, or for supply and services, MOF or SPKK). SK002 7.2.1 expressly defers to SK001, and SK001 is the newer post-audit text, so SK001 governs — but SK002 should be amended to remove the conjunctive reading.
11.5 Statutory declaration and Director-General of Labour gating
Before final payment the contractor — and the nominated sub-contractors — must submit either a statutory declaration or a certificate signed by the Director-General of Labour, confirming that all workers' wages, allowances and salaries have been paid, that all Employees Provident Fund and SOCSO contributions have been paid, and that no amounts are outstanding to workers. The declaration is sworn under the Statutory Declarations Act 1960 before a Commissioner for Oaths or the President of the Sessions Court. This is a blocking gate on final payment and it is absent from the SK014 flowchart. It is also listed as a mandatory attachment on the interim and final account routing sheet.
Two further statutory attachments appear on the routing sheet and in no SOP: the CIDB levy certificate and the receipt of water charges. Both must be captured, and their basis confirmed.
11.6 Segregation of duties
Control
	Rule
	Source
Self-approval
	No one may approve their own expenses or allocations. CEO escalates to the Chairman; other Board members to the Chairman; Functional Director to the CEO; Head of Division to the Functional Director; Head of Department to the Head of Division.
	DAL §1.6
Conflict of interest
	Recuse and escalate one level up.
	DAL §1.5
Instruct versus value
	Those empowered to issue an instruction requiring a variation do not have authority to approve the value of that variation. Applied by extension to payment values.
	SK012 §7.2.5(b)
Two-person opening
	The tender box is opened by two appointed Executive officers acting together; in observed practice they come from outside Contract & Procurement.
	SK002 7.7.2; TA 109 practice
Joint evaluation
	The Implementing Department and Contract & Procurement evaluate jointly, at Contract & Procurement, under separate authenticated identities.
	SK003 7.1.1
Certificate signature order
	The Recommending Officer always signs before the Superintending Officer.
	FORMS Section B1
Legal endorsement
	Group Legal Compliance endorsement of the Conditions of Contract, the signed Letter of Acceptance and the BQ or Schedule of Rates is a mandatory pre-condition to signing.
	SK004 §7.1.2, §7.4
Company estimate custody
	Prepared by one officer only, in exactly two copies, one lodged and one retained SULIT, not alterable to suit tendered prices.
	SK003 7.2.2(b)
Administration versus transaction
	The system administration role must hold no transactional, approval or certification capability, and configuration changes require maker-checker approval.
	NFR-SEC-004
Non-delegability
	MA, MR and MJR authority codes are never delegable.
	DAL §1.6
Absence
	Authority reverts upward to the delegator on absence; it does not pass down.
	DAL p.42
11.7 Controls the corpus does not provide and the portal must supply
Anti-splitting. No rule exists anywhere. FR-REQ-015.
Minimum competition. No minimum number of tenders or quotations exists for an opening to proceed or an award to be valid, and no rule exists for the single-tender case. FR-BID-011.
Approval before commitment. No explicit clause exists, and SK012 §7.2.2(c) positively permits variation work to commence on support before approval. FR-REQ-016 and FR-VAR-014.
Negotiation guardrails. No limit on rounds, no restriction to the lowest tenderer, no prohibition on scope change, no requirement for prior Tender Board authority, no rule on negotiating with more than one tenderer. FR-EVL-016.
Committee conflict of interest. No recusal rule exists at committee level in any source. FR-CTE-010.
Records retention. No retention schedule exists for any Contract & Procurement record. NFR-RET-001.
Service levels and escalation. No SLA, cycle-time target, KPI or escalation rule exists in any SK manual; the only targets are the ICC columns on the routing sheets. FR-APR-018.
12. Assumptions, decisions required and open questions
This section separates what will stop the build from what will slow it. Every item has a named owner and a stated consequence of not deciding. Blockers must be resolved before the affected module is designed; the remainder can be carried as risks with a documented interim position.
12.1 BLOCKERS
Eight items. Each one prevents a module from being designed correctly, and none can be resolved by the delivery team.
#
	Blocker
	Blocks
	Owner
	Consequence of not deciding
B1
	The three payment annexes are missing. Lampiran A1 (Nominated Sub-Contractors), A2 (Nominated Suppliers) and A3 (Approved Assignees) are referenced by column number on both the interim certificate and the final account — columns 4, 5, 6, 9 and 10 are cited, so each schedule has at least ten columns. They are not in the supplied file set.
	Interim payment, final payment, the nominated sub-contractor module, the payment waterfall
	Ketua Seksyen Pos Kontrak
	The nominated-party and assignee payment schema — the most complex part of both certificates — cannot be modelled. Any schema built without them will be wrong and will require data migration to fix.
B2
	SK011 pages 7–10 and flowchart page 12 are missing, so the entire advance payment procedure is undocumented. There is no eligibility rule, no percentage, no guarantee clause and no recoupment schedule anywhere; the DAL compounds this by approving advance payment at CEO level with no value band in the tender regime and omitting it entirely from the quotation regime.
	The advance payment module; probably also the retention mechanism and the payment-period service level
	Ketua Seksyen Pos Kontrak
	Advance payment cannot be built. Since it is CEO-approved and unlimited, an unspecified control is a material financial exposure.
B3
	The retention percentage, retention cap and interim deduction mechanism are defined nowhere — not in SK011, not in SK009, not in the DAL and not on any form. Only the release side is documented. The only figures in the corpus are the quotation-route appointment letters' 10% of work executed capped at 5% of the total contract price above RM50,000.
	Every interim certificate, the final account, the release workflow
	Ketua Seksyen Pra Kontrak with Finance; source is the Conditions of Contract
	Every interim certificate would deduct a guessed amount. This is money withheld from contractors on no documented basis.
B4
	Rejection and rework paths are undefined at eight gates. Legal review; the VOC not-approved and not-recommended outcome; certificate-of-non-completion review failure and approval rejection; work programme and revised programme non-approval; the below-minimum interim value; and the variation not-supported outcome. The only properly drawn rework loop in the entire post-award set is the VOC's.
	Every approval workflow in the system
	Head of Contract & Procurement with the Tender Board Chairman
	A workflow engine cannot have a state with no exit. Every one of these becomes an arbitrary design decision made by a developer, and users will find the dead ends on day one.
B5
	Committee composition and quorum are nowhere defined for the Quotation Committee, the Quotation Opening Committee, the Variation Orders Committee, the Technical Committee or the Technical & CAPEX Committee. The DAL states neither for any committee. Only the Tender Opening Committee's size (two) and the Tender Board's quorum (three) are stated. OM/KP/SP/002, which holds the Opening Committee appointment mechanics, is not in the corpus, and neither is the Terms of Reference that governs Tender Board membership.
	Committee approval workflows, quorum validation, absence and delegation handling
	Head of Contract & Procurement (QC, Quotation Opening); Head of Division Planning & Development or the CEO's office (TC); CFO and COO (VOC); Company Secretary (the Terms of Reference)
	The portal cannot validate a committee decision, cannot detect an inquorate meeting, and cannot route around an absent chair. Committee decisions are the legal basis for every appointment.
B6
	Templates that the SOPs mandate do not exist in the forms library: the Notice of Termination; the Supplementary Agreement for Extension of Contract Period; the Schedule of Defects; the SK010 nomination letter set (Surat Penamaan, Surat Pemberitahuan Penamaan, Surat Jaminan Tanggung Rugi, Perintah Rasmi and the supply order pair); and the Document Tracking Form referenced by SK014.
	Document generation for termination, contract-period extension, defects close-out and nomination
	Ketua Seksyen Pos Kontrak with Document Control
	Those steps cannot produce a legal document, so they will continue to run in Word on a file share and the portal becomes a second place to enter data.
B7
	No anti-splitting rule, no minimum-competition rule and no explicit approval-before-commitment clause exist, in the DAL or in any SOP. All three are flagged as gaps in the DAL itself.
	Procurement controls, audit posture, the requisition module
	Head of Contract & Procurement with Internal Audit and the Director of Finance & Administration as DAL owner
	A procurement portal without a splitting control is an audit finding on day one, and the finding will be against the system as much as against the process.
B8
	The Conditions of Contract are not in the corpus — neither the JKR 203 and 203A forms nor the Ranhill SAJ Standard Forms, nor the Syarat-syarat Sebutharga Untuk Kerja whose clauses 10 (Retention), 13 (LAD) and 18 (DLP) are cited by number in every quotation appointment letter.
	Retention, the interim-certificate period, the subsequent-certificate minimum, the unfixed-materials percentage, the DLP length, the on-cost percentage, the price-fluctuation formula, the LAD unit and every clause lookup
	Ketua Seksyen Pra Kontrak and Ketua Seksyen Pos Kontrak
	This is the single most load-bearing missing document after the payment annexes. Nine of the values Section 8 records as undefined resolve to it. Without it the Appendix to the Conditions of Contract cannot be validated and the post-award calculations rest on guesses.
12.2 Decisions required (not blocking, but shaping)
#
	Decision
	Owner
	Consequence of not deciding
D1
	The evaluation methodology — locate the 60/40 weighting in the Terms of Reference, amend SK003 to codify practice, or confirm that the model is per-exercise configurable with no policy default. (See Section 2.3.)
	Head of Contract & Procurement; Ketua Seksyen Pra Kontrak; implementing-department heads
	Every tender is evaluated by a methodology with no policy basis, and any unsuccessful tenderer who asks where the pass mark comes from cannot be answered.
D2
	The DAL-versus-SOP authority conflicts — termination, extension of time with no financial impact, and extension of contract period. (See Section 8.12 R5, R6, R7.)
	Director of Finance & Administration as DAL owner with the Head of Contract & Procurement
	The engine holds one authority and the SOP says another. Whichever is built, half the organisation will believe the system is wrong.
D3
	The > versus ≥ operator at RM300,000 and the treatment of the boundary value itself. (See Section 8.12 R2.)
	Head of Contract & Procurement, in writing, as a Quality Instruction
	A work valued at exactly RM300,000.00 routes to a different committee, a different approver and a different award instrument depending on which reading is coded.
D4
	The performance bond basis and the workmen's compensation basis. (See Section 8.12 R1 and Section 8.10.)
	Ketua Seksyen Pos Kontrak with Finance
	Bonds are taken at roughly half or roughly double the correct value, and no bond-sufficiency check can be trusted.
D5
	The system of record and the ERP sequencing — Oracle, IFS or D365, and when. (See Section 9.1.)
	Head of Group IT with Ketua Projek and the Head of Contract & Procurement
	The integration architecture, the primary business key and the phasing all change. Building against a D365 contract that does not exist would produce interfaces that must be rewritten.
D6
	Vendor self-service as policy. The whole vendor portal, electronic submission, electronic opening and electronic signature are unsourced and in places contrary to SK002 §7.7, which mandates a physical box and key.
	Head of Contract & Procurement with Group Legal Compliance
	The portal's highest-value capability rests on procedures that do not authorise it. An amendment to SK002 §7.7 must be planned as a programme deliverable.
D7
	Unsuccessful-tenderer notification. SK003 7.11 provides for none. Notifying, and any debrief content, is a deliberate policy change with a possible challenge exposure.
	Head of Contract & Procurement with Group Legal Compliance
	Either the portal keeps a practice the business would want to change, or it changes practice without a decision.
D8
	Mandatory briefing and site visit, and whether attendance may gate document purchase. Practice does both; SK002 authorises neither. (See Section 8.12 R10.)
	Ketua Seksyen Pra Kontrak
	An eliminatory condition is applied that the SOP does not authorise, and a rejected tenderer could challenge it.
D9
	Late-tender treatment on the quotation route, and whether the tender-route rule (Tender Board decides) has been displaced by the quotation practice (evaluator rejects). (See Section 8.12 R11.)
	Head of Contract & Procurement with the Tender Board Chairman
	If practice has migrated, tenders are being rejected by officers with no authority to reject them, and the Board is being denied a decision reserved to it.
D10
	Completeness failure — report or eliminate. (See Section 8.12 R12.)
	Head of Contract & Procurement
	A Board power is exercised by officers.
D11
	The unsuccessful-tenderer document clocks, which as printed permit disposal before the collection right expires. (See Section 8.12 R13.)
	Head of Contract & Procurement with Group Legal Compliance
	Ranhill SAJ could shred a tenderer's documents while the tenderer still has a right to collect them.
D12
	The RM50,000 appointment-letter split. The templates named below and above RM50,000 do not align to any DAL procurement band. Either the letters follow an undocumented practice, or they key off the requisition limit, or the DAL is not being followed.
	Head of Contract & Procurement
	Contractual terms — retention, defects liability, insurance duration — are applied on a boundary nobody can source.
D13
	Whether the Tender Board really is the ceiling for open and selective tender at any value, given that direct purchase escalates to the Chairman above RM3 million and to the Board above RM5 million.
	Director of Finance & Administration; Board
	An RM50 million open tender would be approved two levels lower than an RM6 million direct purchase. If that is not intended, the DAL needs amendment.
D14
	Service levels. The SOPs contain none; the routing sheets carry targets that do not sum. The portal must introduce SLAs and an escalation rule.
	Head of Contract & Procurement
	No authoritative basis for ageing, escalation or performance reporting.
D15
	Correction of printed-form typographical errors when the portal generates controlled forms.
	Document Control with Quality Assurance
	Either the portal perpetuates the errors or it changes controlled documents without authority.
12.3 Open questions
#
	Question
	Owner
	Interim position
OQ-01
	SK003 7.6.3 as printed gives the Chairman of the Tender Board authority to appoint the CEO as Chairman during his absence — logically inverted, since the CEO would normally be the Chairman and the observed board is chaired by a Director. What is the correct rule?
	Ketua Seksyen Pra Kontrak; Company Secretary
	Do not encode any Tender Board chair-substitution rule.
OQ-02
	What actually happens to a late tender on the tender route today?
	Ketua Seksyen Pra Kontrak
	Build the SK003 rule: segregate, count, forward to the Board.
OQ-03
	May the site visit and briefing be made mandatory, and may attendance gate document purchase?
	Ketua Seksyen Pra Kontrak
	Build the switch, default off.
OQ-04
	Is the SPAN permit a pre-bid eligibility requirement or a post-award obligation?
	Ketua Seksyen Pra Kontrak; regulatory affairs
	Capture as an eligibility attribute; make the pre-bid gate configurable, default off.
OQ-05
	What is the basis of the RM50,000 split in the appointment-letter templates?
	Head of Contract & Procurement
	Model as a separate Contract Terms Band.
OQ-06
	Which government guidelines supersede the DAL for government-funded projects, and how do they differ?
	Ketua Projek; Head of Contract & Procurement
	Build the override mechanism; leave the rule set empty.
OQ-07
	Who may grant special permission to tender, given that SK002 delegates to the DAL and the DAL has no such row?
	Ketua Seksyen Pra Kontrak
	Capture all three possible authorities (RSAJ officer, SPAN, CIDB) and record which granted it.
OQ-08
	What guardrails apply to post-tender price negotiation?
	Head of Contract & Procurement; Internal Audit
	Record every round with minutes and written confirmation; no automated limit.
OQ-09
	Which standard contract form applies to contracts executed between 25 January 2011 and 31 December 2020?
	Ketua Seksyen Pra Kontrak; Group Legal Compliance
	Do not model a date-driven form-selection rule. Capture the form as a per-contract selection.
OQ-10
	Should the unsuccessful-tenderer collection and disposal clocks be aligned to one trigger?
	Head of Contract & Procurement; Group Legal
	Never dispose while a collection right subsists.
OQ-11
	What contract number applies on the quotation route? SK004 defines only a tender and a consultancy series.
	Ketua Seksyen Pos Kontrak
	Use the Inden number as the contract key on the quotation route.
OQ-12
	Why does the DAL name retention release only in the quotation regime and the performance guarantee only in the tender regime?
	Director of Finance & Administration
	Treat as a drafting oversight; route both through item 17 in the tender regime.
OQ-13
	What price-fluctuation formula and index apply, and which authority approves an adjustment?
	Ketua Seksyen Pos Kontrak; Finance
	Configurable formula; approval by the S.O. pending a DAL row.
OQ-14
	What are the LAD accrual start and end dates, is there a cap, and does LAD apply to the un-extended portion after a partial extension of time?
	Ketua Seksyen Pos Kontrak
	Per-contract configuration; anti-oppression alert as the interim control.
OQ-15
	What happens on a terminated contract where the balance is owed to the contractor? SK008 covers only the converse.
	Ketua Seksyen Pos Kontrak
	Support both directions; flag the case for manual decision.
OQ-16
	What happens where the Superintending Officer finds a nominated sub-contractor objection unreasonable? SK010 is silent.
	Ketua Seksyen Pos Kontrak
	By implication the nomination stands; record the determination.
OQ-17
	Which figure is the commitment on the pre-tender routing sheet — the individual ICC targets or the printed total, which is smaller than their sum?
	Head of Contract & Procurement
	Report both; treat the individual targets as operational.
OQ-18
	Is the PO number counter annual or fiscal? The observed volume (1,703 by 20 January) is inconsistent with an annual reset.
	Head of Group IT
	Consume, never generate.
OQ-19
	Which of CPD/VO-661&662(T) and CPD/VO-662(T) applies to which branch? Both are reached from the same node.
	Ketua Seksyen Pos Kontrak
	One entity with a form-variant selection; probable reading is agreed-rate-exists to 661&662.
OQ-20
	Are the three Recommending Officer labels — Pegawai Pengesyor, Juruukur Bahan / Pegawai Pengesyor, Pegawai Kontrak/Pengesyor — one role or three?
	Ketua Seksyen Pos Kontrak
	Model as one role with a contract-type-dependent label; confirm before merging.
OQ-21
	Is the "Officer Authorised to Certify" a distinct second signatory (as on the interim certificate) or a qualifier on the S.O. block (as on the extension-of-time, non-completion and final-account certificates)?
	Ketua Seksyen Pos Kontrak
	Model as distinct where the form prints it as a separate block.
OQ-22
	Is the Jawatankuasa Tuntutan (Claims Committee) a real body? It appears in KP003 5.11.5 and in no other document in the corpus.
	Head of Contract & Procurement
	Configure the committee; leave it inactive until confirmed.
12.4 Assumptions register
Every requirement in Section 6 marked [ASSUMPTION] is listed here. None of these is sourced. Each requires written RSAJ confirmation before the affected module is built.
Req ID
	Assumption
	Owner
FR-REQ-015
	An anti-splitting check exists, with a relatedness test and a time window to be set by RSAJ.
	Head of C&P; Internal Audit
FR-REQ-016
	Approval must precede commitment for award instruments (the variation "proceed on support" exception aside).
	Head of C&P
FR-ADV-010
	Failing a pre-sale check refuses the sale. SK002 states the checks but not the consequence.
	Ketua Seksyen Pra Kontrak
FR-BID-011
	An exercise may proceed to opening below a configurable minimum bid count, with the exception flagged.
	Head of C&P
FR-APR-016
	Every approval step offers an explicit rejection with a configured destination.
	Head of C&P
FR-APR-017
	An originator may recall a matter before the first decision.
	Head of C&P
FR-APR-018
	Approval service levels and escalation to the approver's superior exist.
	Head of C&P
FR-CTE-009
	Terminal outcomes of cancellation and re-tender exist alongside the documented recall loop.
	Head of C&P; Tender Board Chairman
FR-CTE-010
	The DAL's individual conflict-of-interest rule applies at committee level.
	Head of C&P
FR-CON-014
	A contract baseline is captured at execution, from the Appendix to the Conditions of Contract.
	Ketua Seksyen Pos Kontrak
FR-SUP-001
	The Superintending Officer is assigned automatically from the DAL band. SK005 never says who appoints the S.O.
	Ketua Seksyen Pos Kontrak
FR-SUP-005
	Site possession is an explicit recorded step.
	Ketua Seksyen Pos Kontrak
FR-SUP-007
	A site-diary disagreement is recorded on the entry and escalated to the S.O. SK005 gives no dispute path.
	Ketua Seksyen Pos Kontrak
FR-SUP-011
	A Project In Delay classification causes the Special Meeting. The SOP implies but does not state the link.
	Ketua Seksyen Pos Kontrak
FR-PAY-002
	An advance recoupment schedule exists and is configurable.
	Ketua Seksyen Pos Kontrak
FR-PAD-006
	Price-adjustment approval defaults to the S.O. pending a DAL row.
	Director of Finance & Administration
FR-FIN-014
	Contract closure and archival follow a retention policy that must be written.
	Document Control
FR-RPT-002, -012
	Pipeline and analytics dimensions are as proposed.
	Head of C&P
NFR-RET-003
	The system will not dispose of a tenderer's documents while the collection right subsists, notwithstanding the printed clauses.
	Group Legal Compliance
12.5 Documents to obtain before build
In priority order:
Lampiran A1, A2 and A3 — the nominated sub-contractor, nominated supplier and assignee payment schedules.
SK011 pages 7–10 and flowchart page 12 — the advance payment procedure.
The Conditions of Contract: JKR 203 and 203A, the two Ranhill SAJ Standard Forms, and Syarat-syarat Sebutharga Untuk Kerja (Lampiran 2).
The Terms of Reference (TOR) cited by SK003 4.2 and 7.6.1 — the likely home of the 60/40 weighting and of Tender Board membership.
OM/KP/SP/001 — the entire sub-RM300,000 quotation procedure, which carries the majority of transaction volume and has no SOP in the corpus.
OM/KP/SP/002 pages 1–5 — Tender Opening Committee appointment mechanics, term and conflict-of-interest rules.
OM/KP/001 — the parent of the KP series, most likely holding the contract-type classification rule and a precedence statement.
Written rulings on the DAL-versus-SOP conflicts: termination, extension of time and extension of contract period.
Committee composition and quorum for the Quotation Committee, the Quotation Opening Committee, the VOC and the Technical Committee.
PAAB/SOP/TCD/15, /16 and /17 — the Minor, Mini and Major Works thresholds for the PAAB funding branch.
The original PDFs of the SK006, SK008 and SK009 flowcharts, to recover the connectors lost in text conversion.
The Supplier Assessment Report scoring methodology, of which only the rating scale is in the corpus.
13. Phasing recommendation
13.1 The principle
The sequence below is driven by one rule: nothing ships until it is safe to use for a real transaction. That means the approval engine and the committee layer land in the first release, because an exercise that reaches an award decision with the wrong approver is worse than no system at all. It also means the vendor portal, which is the most visible capability and the easiest to demonstrate, cannot ship first — a vendor who submits a bid into a system that cannot then award it compliantly has been misled.
A second rule follows from the audit: the prototype's two strongest areas — the sourcing wizard and vendor registration — are worth refactoring rather than rebuilding. They carry real, well-researched Malaysian utility content. The approval engine, the committee layer, the certificate chain and the whole post-award domain must be designed from the Operation Manuals rather than adjusted from what exists.
13.2 Phase 0 — Decide and obtain (before build)
Activity
	Output
	Why it must come first
Resolve blockers B1 to B8
	Written rulings and the missing documents
	Each one determines the shape of a module. B3 and B8 alone determine the arithmetic of every interim certificate.
Decide D1 to D5
	Written decisions with a named owner each
	The evaluation model, the authority conflicts, the RM300,000 operator, the bond basis and the ERP sequencing.
Load and validate the DAL configuration
	Versioned DAL tables, reviewed line by line against the printed manual by the Director of Finance & Administration's office
	Everything routes off this. A transcription error here is a governance failure, not a bug.
Confirm the committee registers
	Membership, alternates, quorum and terms for all eight bodies
	Blocker B5.
Agree the integration façade contract
	Interface specifications for INT-01 to INT-14 against a stable internal contract
	Insulates the build from the Oracle-to-D365 question.
Agree the SOP amendment programme
	A schedule of amendments to SK002 §7.7 (electronic submission and opening), SK001 (the vetting step), SK003 (the evaluation methodology) and the records clause
	Several first-release capabilities are not authorised by the current procedures. This is a parallel workstream, not a system task.
13.3 Phase 1 — The spine: approval engine, committees, requisition and award (must land together)
Rationale. These four cannot be separated. An approval engine with no committees cannot record a compliant appointment; committees with no engine have nothing to gate; and neither is testable without a requisition to route and an award to produce. This is the foundation on which everything else depends, and it is the part the prototype does not have at all.
Scope
	Modules
	Key outputs
The configurable DAL engine with the full authority grammar, automatic chain generation, non-delegability, self-approval and conflict rules, the upward-reverting absence rule, the government-funding override and the immutable audit trail
	6.9 in full; NFR-AUD; NFR-SEC
	Every DAL matrix as versioned configuration; worked routing examples passing as regression tests
Committee management with membership, quorum, meetings, individual votes, minutes and the Secretariat routing
	6.10 in full
	Eight configurable committees; quorum enforcement; per-member SETUJU / TIDAK SETUJU capture
Requisition intake, funding-route determination, budget check and the DAL requisition chain, consuming PROC… from the ERP
	6.1; INT-01, INT-02
	PROC… as the primary business key; five funding routes; the anti-splitting control
Method selection, value-band determination and contract-type classification
	6.3
	Three separate band families; nine sourcing methods; the canonical contract type with its mapping table
Award, including the Letter of Acceptance, the Inden Kerja, the five-party distribution, Integrity Pact Stage Two, and the securities and insurance registers
	6.11; parts of 6.12
	A compliant award instrument for both regimes
Usable at the end of Phase 1: an officer can raise a requisition, get it routed and approved correctly by value, classify the exercise, record a committee decision, and issue a compliant award instrument. Sourcing itself is still done outside the system.
13.4 Phase 2 — The sourcing window (refactor what exists)
Rationale. This is where the prototype is strongest and where the refactoring effort is lowest per unit of value. It also completes the pre-award process end to end, which is the point at which the Pre-Contract Section can stop running a parallel paper process.
Scope
	Modules
	Key outputs
Scope, BQ and the company estimate with its custody and confidentiality discipline
	6.2
	The estimate as a governed record, not a literal
Document assembly to SK001's twelve constituent parts, with the Appendix to the Conditions of Contract
	6.4
	The Appendix screen is the single most important data-capture screen in the pre-award module — it is the source of nine of the values the post-award modules need
Advertisement, invitation, document sale, briefing and addenda, with every date rule enforced
	6.5
	Three mandatory channels; the two-week and two-day rules; 2.30 p.m.; the RM250 and RM50 fee floors; the addendum procedure
Bid submission and receipt, bid opening with dual control and the Jadual Tawaran
	6.6, 6.7
	The electronic tender box; correct late-bid handling; the Jadual Tawaran and Grand Summary
Evaluation with the configurable model, both templates, and the single Evaluation Report with annexes A to F
	6.8
	The configured model is the model executed
Certificate generation for the pre-award instruments and the CPD/DFA/PRE T-QUO routing sheet
	parts of 6.14
	The pre-award paper spine digitised
Usable at the end of Phase 2: the complete pre-award process runs in the system, from requisition to award, with committee decisions and DAL routing. This is the point at which the portal replaces rather than supplements the paper.
13.5 Phase 3 — Vendor portal
Rationale. Vendor self-service must follow the sourcing window, not precede it, because a vendor-facing front door onto a process that cannot yet award compliantly is a liability. It is placed before post-award because it removes the largest volume of manual counter work and because the prototype's registration flow is close to ready.
Registration, statutory document lodgement, verification and approval; CIDB, MOF, SPAN and Suruhanjaya Tenaga reference data; the E-Payment and Creditor's Profile.
Expiry monitoring, suspension, reinstatement and blacklisting, with the continuous-validity window check against each exercise.
Exercise browsing, eligibility pre-check, document purchase, briefing attendance, addendum acknowledgement, bid preparation and submission, and award or non-award notification.
Dependency: decision D6 and the SK002 §7.7 amendment must be in place before electronic submission goes live.
13.6 Phase 4 — Post-award core: contract, supervision and payment
Rationale. This is the largest single block of value and the largest single block of risk. Within it, contract formation and the contract baseline must land first, because every subsequent calculation reads from the baseline. Interim payment must land with retention, LAD set-off and the waterfall together — a payment certificate without its deductions is worse than no certificate.
Sub-phase
	Scope
	Dependency
4a
	Contract formation and execution: assembly, arithmetic and front-loading checks, legal endorsement, the pre-signature readiness gate, signature, stamping, controlled-copy distribution, custody, and the contract baseline
	Phase 1 (award); B8 (Conditions of Contract)
4b
	Supervision and site records: S.O. resolution, delegation letters, work programme, the daily site diary on mobile, the 70% Project In Delay rule, insurance monitoring
	4a
4c
	Interim payment: valuation, materials on site, the deduction block, retention, LAD set-off, advance recoupment, the four-way waterfall, DAL banding, and the routing sheet with its service levels
	4a, 4b; blockers B1, B2, B3
4d
	Variations: the full 660 to 663 chain, the exemption fast path, the two-dimensional matrix, PAAB consent, the Commenced Pending Approval state — and contract price adjustment
	4a, 4c
4e
	Certificate generation engine and the nine routing sheets as one generic entity
	Runs through 4a to 4d
13.7 Phase 5 — Post-award completion: time, default, defects and close
Extension of time and extension of contract period, with the entitlement, best-endeavours and weather tests.
Non-completion and liquidated damages, with the warning letter, the Certificate of Non-Completion as a precondition, the waiver bands and the anti-oppression alert.
Termination, with the notices, the two-week bond claims, site securing, the inventory with photographs, the cost roll-up, the 120-day cap and blacklisting.
Completion, partial occupation, defects liability, the Schedule of Defects, making good defects, and the release of bonds and retention.
Nominated sub-contractors and suppliers, with the objection windows, the set-off categories and direct payment.
Final certificate and close, with the statutory declaration gate, the attachment pack and the final payment waterfall.
These can be sequenced in almost any order within the phase, with one exception: completion and defects must precede the final certificate, because the final certificate's preconditions read from them.
13.8 Phase 6 — Performance, reporting and analytics
Contractor performance evaluation across all seven models, feeding back into evaluation Fasa 2 — this closes the only loop in the whole process that runs from post-award back into pre-award.
Reporting, dashboards, the compliance exception report and the audit extract.
Spend and savings analytics and cycle-time reporting against the ICC targets.
13.9 What must land together, and what must not be split
These must ship together
	Because
The approval engine and the committee layer
	A mandatory committee recommendation is an approval step. Neither is meaningful alone.
Award and the securities register
	The performance bond and insurances are conditions precedent to contract signature. An award with no securities register produces a contract that cannot lawfully be signed.
Interim payment, retention, LAD set-off and the waterfall
	A certificate without its deductions overpays. This is the one place where a partial implementation loses money on every transaction.
Variations and contract price adjustment
	A separate adjustment certificate is required even where a variation certificate exists. Shipping variations alone leaves the contract sum wrong.
Completion, defects and the release of securities
	The Certificate of Making Good Defects is the event that releases the bond and the retention. Shipping completion without release strands the money.
Electronic submission and electronic opening
	A sealed electronic bid with no dual-control opening has no control at all.
Contract formation and the contract baseline
	Every post-award calculation reads from the baseline. Without it, each module re-keys the same values differently.
13.10 What can safely follow
Analytics and spend reporting — valuable, but nothing depends on them.
The vendor announcements board and the eligibility pre-check — convenience.
Bilingual generation of the English (E) variants of the performance reports, where the Malay (B) variant is the operative one.
The PAAB minor-works payment variant, which affects one funding route.
Design & Build and Turnkey evaluation, which is a small proportion of volume — although the Technical Committee must still be configured.
Correction of the printed-form typographical errors, which requires a document-control decision.
13.11 The two things most likely to go wrong
Shipping the vendor portal first because it demonstrates well. It is the most visible capability and the easiest to show a steering committee. It is also the one that creates external obligations the back end cannot yet discharge. Resist it.
Treating the post-award domain as a later increment of the same project. It is roughly sixty per cent of the documented process, it carries all of the financial risk, and it has eleven sub-processes and twenty-eight certificates none of which exists in any system today. Plan it, staff it and govern it as a second programme that shares a data model with the first.
Appendix A — Requirements traceability matrix
Every functional requirement in Section 6, its governing source clause and its coverage in the existing prototype. Coverage is assessed as Full (implemented correctly at runtime), Partial (present but incomplete, unreachable, configured but not executed, or materially wrong in detail) or Absent. Where the prototype implements something contrary to the source, that is noted.
Req ID
	Requirement (abbreviated)
	Pri.
	Source clause
	Prototype coverage
FR-REQ-001
	The system shall provide a Requisition record capturing, at minimum: requesting department, section, requesting officer, title, justification and…
	M
	SK001 6.2, 7.1.1; PEN/LRA/06-01
	Partial
FR-REQ-002
	The system shall accept and store the ERP requisition number PROC<YYYY><NNNNNN> and the requisition note number NM/YYYY/NNNNN against every…
	M
	PRETENDER-artifacts §5.1, §6.1
	Absent
FR-REQ-003
	The system shall record the endorsement chain requesting officer → section head → Head of Department on every requisition before it is submitted for…
	M
	PEN/LRA/06-01; practice
	Absent
FR-REQ-004
	The system shall require a Funding Source to be selected on every requisition from the closed list F1 Ranhill SAJ OPEX, F2 Ranhill SAJ CAPEX, F3 PAAB…
	M
	OM/P/004 8.2; MODEL Axis A
	Absent
FR-REQ-005
	The system shall route requisitions by funding source: F1 and F2 to the standard in-house sourcing spine; F3 to the PAAB gate requiring a Project…
	M
	OM/P/001 8.1–8.5; OM/P/003 8.1–8.8; OM/P/004 8.2, 8.3, 8.5
	Absent
FR-REQ-006
	The system shall set a Government-Funded flag where the funding source is F3, F4 or F5, and shall allow that flag to override the DAL routing with an…
	M
	DAL §1.4
	Absent
FR-REQ-007
	The system shall perform a budget availability check against the cost centre and account code, returning and storing Actual Budget, Balance as at…
	M
	RANHILL SAJ EXPENDITURE REQUEST FORM §2; DAL pp.17, 36
	Partial
FR-REQ-008
	The system shall block submission where the budget check returns insufficient funds, unless an over-budget route is invoked, and shall then route…
	M
	DAL pp.17, 36
	Absent
FR-REQ-009
	The system shall route every requisition for approval strictly by the DAL requisition bands: more than RM300,000 to the CEO with mandatory…
	M
	DAL §3.1.4.1 p.19
	Absent
FR-REQ-010
	The system shall provide a project-works intake path accepting an application letter from a client department with an attached price estimate…
	M
	OM/P/002 8.1, 8.2
	Absent
FR-REQ-011
	The system shall register the project in the financial system of record at the approved price and store the returned project master reference on the…
	S
	OM/P/002 8.3
	Absent
FR-REQ-012
	The system shall route project proposals and technical working papers to the Technical & CAPEX Committee for a decision recorded as one of Perlu,…
	M
	OM/P/001 8.3; OM/P/004 8.4.2
	Absent
FR-REQ-013
	The system shall support an emergency intake path recording the emergency trigger, the inter-departmental coordination meeting that fixes the scope,…
	M
	OM/P/005 8.6; DAL §3.1.4.2 item 1
	Absent
FR-REQ-014
	The system shall support a specialist self-scoping path in which the specialist contractor scopes the work on site and the scope is tabled to the…
	S
	OM/P/005 8.5
	Absent
FR-REQ-015
	The system shall record an anti-splitting check on every requisition, comparing the requested scope, requesting department and required date against…
	M
	[ASSUMPTION]
	Absent
FR-REQ-016
	The system shall not permit a commitment — a purchase order, indent, letter of acceptance or contract — to be issued against a requisition that has…
	M
	[ASSUMPTION]
	Absent
FR-EST-001
	The system shall provide Bill of Quantities authoring with line items carrying description, unit, quantity, rate and amount, structured on the…
	S
	OM/P/005 8.4, 8.7
	Absent
FR-EST-002
	The system shall require every BQ line whose quantity cannot be determined at preparation to be flagged provisional, and shall carry that flag…
	M
	OM/P/005 3.4; SK013
	Absent
FR-EST-003
	The system shall record that the BQ follows the Standard Method of Measurement of Building Works published by the Institution of Surveyors Malaysia,…
	M
	SK001 7.3.4(g)(iii), (iv), (v)
	Absent
FR-EST-004
	The system shall maintain a versioned rate schedule (Anggaran Kadar Harga Terkini Dan Bahan-Bahan Paip) issued by C&P, and shall allow BQ lines to…
	S
	OM/P/005 5.2
	Absent
FR-EST-005
	The system shall provide a Specification Setting Panel record (CPD/DFA/SSP) capturing Type of Contract from the list Works, Maintenance Works,…
	M
	CPD/DFA/SSP; MODEL §11 item 20
	Absent
FR-EST-006
	The system shall hold the company estimate (anggaran syarikat) as a distinct record on the sourcing exercise, separate from the BQ and from any bid,…
	M
	SK003 7.2.2(b); SK002 7.7.1
	Absent
FR-EST-007
	The system shall enforce that the company estimate is prepared by one officer only, is ready no later than one (1) week before the date set for…
	M
	SK003 7.2.2(b)
	Absent
FR-EST-008
	The system shall classify the retained copy of the company estimate as SULIT (Confidential) and restrict visibility to the preparing officer and the…
	M
	SK002 7.7.1; SK003 7.2.1(e)
	Absent
FR-EST-009
	The system shall prevent any amendment to the company estimate after the closing date and time, and shall record any pre-closing amendment with the…
	M
	SK003 7.2.2(b)
	Absent
FR-EST-010
	The system shall place the company estimate into the sealed bid set at closing so that it is disclosed simultaneously with the bids and is entered…
	M
	SK002 7.7.1, 7.7.4
	Absent
FR-MTD-001
	The system shall hold three distinct and independently configurable value-band families on every case: the Requisition Approval Band, the Procurement…
	M
	DAL §3.1.4.1 vs §3.1.4.2–.4; appointment-letter templates
	Absent
FR-MTD-002
	The system shall determine the procurement method band from the estimated value using the boundaries RM500, RM5,000, RM15,000 and RM300,000, and…
	M
	DAL §3.1.4.2 items 1–2; §3.1.4.3 and §3.1.4.4 headings
	Partial
FR-MTD-003
	The system shall implement the operator at the RM300,000 boundary as a single configuration value settable to strictly-greater-than or…
	M
	SK001 3.1 and 7.1.1 (melebihi) vs SK001 flowchart box 2 (≥); KP004 5.1.1; OM/P/005 3.1
	Partial
FR-MTD-004
	The system shall require selection of a Sourcing Method on every exercise from the closed list: open tender; selected tender; open quotation;…
	M
	DAL §3.1.4.2; SK002 7.3, 7.4.1; OM/P/005 8.5–8.6
	Absent
FR-MTD-005
	The system shall treat open tender as the default sourcing method above RM300,000 and shall permit selected tender only where a justification of…
	M
	SK002 7.3.1
	Absent
FR-MTD-006
	The system shall capture the ten-item selected-tender proposal: (a) description or title of the work; (b) estimated cost; (c) grades of contractor…
	M
	SK002 7.3.2(a)–(j)
	Absent
FR-MTD-007
	The system shall classify all information relating to a selected tender as SULIT and restrict access to the named participants.
	M
	SK002 7.3.4
	Absent
FR-MTD-008
	The system shall route approval of the name for a direct or selective tender to the CEO, with recommendation by the Functional Director, joint…
	M
	DAL §3.1.4.4 item 4; §3.1.4.3 item 4
	Absent
FR-MTD-009
	The system shall support a direct-appointment justification dossier capturing the reason code, supporting evidence (for example an…
	S
	DAL §3.1.4.2 item 1; observed RSAJ/KP/ST/27/26
	Absent
FR-MTD-010
	The system shall support Schedule of Rates and term contracts as a sourcing method in which work is called off by Indent against an existing contract…
	S
	DAL §3.1.4.2 item 2; SK012 3.1; observed S.O.R TANGKI, BANGUNAN & LOJI 2026-2027
	Absent
FR-MTD-011
	The system shall require a Contract Type of Work, Service or Supply on every exercise, shall derive a default from the deliverable test and shall…
	M
	KP002/003/004 5.1.2, 5.5, 5.9, 5.10
	Absent
FR-MTD-012
	The system shall apply the contract type to at least the following downstream behaviours: pricing basis; registration eligibility test; contract…
	M
	KP002/003/004 §5
	Absent
FR-MTD-013
	The system shall require a Contract Basis of Bills of Quantities or Drawings and Specification, and shall use it to select both the document…
	M
	SK001 3.1(a),(b), 7.3.1(a),(b)
	Absent
FR-MTD-014
	The system shall maintain a mapping table between the canonical contract type and each of the four other taxonomies present in the corpus, and shall…
	M
	MODEL §3.2.3
	Absent
FR-DOC-001
	The system shall assemble the Tender Document from the twelve reconciled constituent parts in printed order: (1) Letter of Invitation to Tender or…
	M
	SK001 7.3.1(a),(b); 7.3.4(a)–(k)
	Partial
FR-DOC-002
	The system shall select the document composition and the standard contract form from the contract basis: Bills of Quantities basis takes composition…
	M
	SK001 3.1(a),(b); 7.3.1; SK004 §3.2
	Absent
FR-DOC-003
	The system shall maintain a clause and template library distinguishing standard instruments — Articles of Agreement and Conditions of Contract, Form…
	M
	SK001 7.3.4 preamble
	Absent
FR-DOC-004
	The system shall provide a data-entry form for the Appendix to the Conditions of Contract capturing, per contract: the officer empowered to act for…
	M
	SK001 7.3.4(b)
	Absent
FR-DOC-005
	The system shall populate the Notice of Offer or Letter of Invitation with the full eligibility code: lawful registration with SSM, the Registrar of…
	M
	SK001 7.3.4(a)
	Absent
FR-DOC-006
	The system shall state in the Instructions to Tenderers that the successful bidder is required to obtain the relevant SPAN Permit Type B, C, D and/or…
	M
	SK001 7.3.4(a)
	Absent
FR-DOC-007
	The system shall bind the bank guarantee and/or insurance forms for the Performance Bond into both the Tender Document and the Tender Table Document,…
	M
	SK001 7.3.4(f)(i)
	Absent
FR-DOC-008
	The system shall bind the Bidder's Declaration Letter (Surat Akuan Pembida) into every tender and quotation document as a mandatory document, and…
	M
	SK001 7.3.4(j)(i),(ii),(iii)
	Absent
FR-DOC-009
	The system shall stamp both the Tender Document and the Tender Table Document clearly and legibly with the words TENDER UNTUK BUMIPUTERA SAHAJA where…
	M
	SK001 7.3.2; SK002 7.5.1(b),(c)
	Absent
FR-DOC-010
	The system shall produce and publish a Tender Table Document (Dokumen Meja Tender) containing the Conditions of Contract, Form of Tender,…
	M
	SK001 7.1.2, 7.3.3
	Absent
FR-DOC-011
	The system shall include the Anti-Corruption Clause in Government Procurement in every agreement.
	M
	SK004 §7.3.4
	Absent
FR-DOC-012
	The system shall route the completed document set for Approval for Tendering by the Head of Contract & Procurement, recording DATE START and CLOSING…
	M
	DAL §3.1.4.4 item 1; CPD/DFA/PRE T-QUO boxes 4–5
	Partial
FR-DOC-013
	The system shall assemble the nine-part quotation document separately from the tender document: Kenyataan Sebutharga; Corrigendum; Arahan kepada…
	M
	OM/P/005 §3.2
	Absent
FR-DOC-014
	The system shall carry a document-assurance gate requiring the tender document to be confirmed free from ambiguity and contradiction, and requiring…
	S
	SK001 7.2.1(c), 7.3.4(k)(iii)
	Absent
FR-ADV-001
	For an open tender the system shall require publication through all three mandatory channels — the newspaper (akhbar), the K&P Department notice…
	M
	SK002 7.4.1
	Partial
FR-ADV-002
	For a selected tender the system shall issue letters of invitation (surat-surat pelawaan) to the approved contractor list only, and shall not publish…
	M
	SK002 7.4.1, 7.3.4
	Partial
FR-ADV-003
	The system shall populate the tender notice with all seven mandatory content items: (a) the grades of contractor invited and the registration field…
	M
	SK002 7.4.2(a)–(g)
	Partial
FR-ADV-004
	The system shall enforce a minimum of two (2) weeks between the tender advertisement date and the closing date, and shall warn where the closing date…
	M
	SK002 7.4.2(g)
	Absent
FR-ADV-005
	The system shall refuse a closing date that falls on a public holiday or a weekend, validating against a maintained Malaysian and Johor…
	M
	SK002 7.4.2(g)
	Absent
FR-ADV-006
	The system shall set the time for receipt of tenders and quotations at 2.30 p.m. by default and shall apply it to tenders as well as quotations.
	M
	SK002 7.4.2(g)
	Partial
FR-ADV-007
	The system shall enforce that the last date on which contractors may obtain the Tender Document is set at least two (2) days before the tender…
	M
	SK002 7.4.2(c)
	Partial
FR-ADV-008
	The system shall compute and record the document fee from its cost basis — A4, A3, A1 and A0 paper as the document requires, copying, binding…
	M
	SK002 7.4.2(d)
	Partial
FR-ADV-009
	The system shall record all document-fee payments as revenue (hasil) and shall reconcile the receipt register to the finance system.
	M
	SK002 7.5.3
	Partial
FR-ADV-010
	Before issuing or selling a Tender Document the system shall verify that the purchaser's representative holds proof of authority to receive it; that,…
	M
	SK002 7.5.1(a),(b),(c)
	Partial
FR-ADV-011
	The system shall annotate every issued Tender Document with the purchaser's name, address, telephone or fax number and the date set for receipt of…
	M
	SK002 7.5.2
	Partial
FR-ADV-012
	The system shall maintain a register of document purchasers per exercise, recording vendor, receipt number, amount, payment method and date, and…
	S
	[NET-NEW]; prototype documentSales
	Full
FR-ADV-013
	The system shall record the site visit and tender briefing as scheduled events with date, time, venue and an attendance register, and shall allow an…
	M
	SK002 7.4.2(e),(f) vs TA 109 advertisement
	Partial
FR-ADV-014
	The system shall support the issue of a corrigendum or addendum during the invitation window, allocating a sequential reference, recording what…
	M
	[NET-NEW] — SK002 by exhaustion; OM/P/005 3.2 item 2; TA 109 Table 2 item 8
	Full
FR-ADV-015
	The system shall support extension of the closing date after advertisement, recording the reason, the approving authority and the notification of…
	M
	[NET-NEW]
	Absent
FR-ADV-016
	The system shall support cancellation of an advertised exercise, recording the reason, the approving authority and the notification of every…
	M
	[NET-NEW]
	Absent
FR-ADV-017
	The system shall support an application for special permission to tender by a contractor lacking the required grade or field code, available only…
	S
	SK002 7.6.1, 7.6.2
	Absent
FR-BID-001
	The system shall provide an electronic tender box that accepts a vendor's bid as a sealed submission, encrypting the bid content at rest such that no…
	M
	[NET-NEW] — digital equivalent of SK002 7.7.1
	Partial
FR-BID-002
	The system shall record the exact server-side submission timestamp of every bid to the second, shall determine lateness solely against the exercise…
	M
	SK002 7.4.2(g), 7.7.1
	Partial
FR-BID-003
	The system shall accept a late bid, mark it Late, segregate it from the evaluated set, count it, and forward it to the Tender Board together with the…
	M
	SK003 7.2.1(a), 7.7.1
	Absent (and contrary)
FR-BID-004
	The system shall permit a vendor to withdraw a submitted bid before the closing date and time, recording the withdrawal with a timestamp, and shall…
	S
	[NET-NEW]; SK003 7.2.1(b) by implication
	Partial
FR-BID-005
	The system shall prevent any amendment or addition to a bid after submission, including by the submitting vendor and by any internal user.
	M
	SK003 7.2.1(b)
	Partial
FR-BID-006
	The system shall accept alternative bids only where the Tender Document permits them, shall record each alternative as a separate bid for evaluation,…
	M
	SK003 7.2.1(c)
	Absent
FR-BID-007
	The system shall validate at submission that the mandatory documents for the exercise are present, and shall present the vendor with a completeness…
	M
	SK003 7.2.2(a)
	Partial
FR-BID-008
	The system shall reject a bid outright, without liability to Ranhill SAJ, where the tenderer fails the eligibility conditions, and shall record the…
	M
	SK001 7.3.4(a)
	Partial
FR-BID-009
	The system shall record a bid validity period per exercise, shall compute the validity expiry date from the closing date, and shall alert the…
	M
	SK003 7.8.1; TA 109 (120 days) and quotation practice (90 days)
	Full
FR-BID-010
	The system shall support extension of the validity period where extension is unavoidable, requiring and recording the written consent of the…
	M
	SK003 7.8.3
	Absent
FR-BID-011
	The system shall record the number of bids received, and shall permit an exercise to proceed to opening where fewer than a configurable minimum…
	S
	[ASSUMPTION]
	Absent
FR-OPN-001
	The system shall model the Tender Opening Committee and the Quotation Opening Committee as configurable committees with named members, appointment…
	M
	SK002 7.7.2; DAL §3.1.4.3 item 2, §3.1.4.4 item 2
	Partial
FR-OPN-002
	The system shall default the Tender Opening Committee to exactly two (2) appointed Ranhill SAJ Executive officers, and shall permit that number to be…
	M
	SK002 7.7.2
	Absent (and wrong)
FR-OPN-003
	The system shall implement dual control on unsealing: the bid set shall become readable only when both assigned Opening Committee members have…
	M
	[NET-NEW] — digital equivalent of SK002 7.7.3 (two members take the key)
	Absent (and wrong)
FR-OPN-004
	The system shall prevent the opening from being performed before the closing date and time.
	M
	SK002 7.7.3
	Partial
FR-OPN-005
	The system shall generate the Jadual Tawaran listing, in the order in which the bids were opened, each tenderer's name, registration class, status,…
	M
	SK002 7.7.4; CPD/J.TAWARAN-02 Rev. 01.07.2024
	Full
FR-OPN-006
	The system shall capture an electronic initial (tandatangan ringkas) from each Opening Committee member against each individual bid, and a signature…
	M
	SK002 7.7.4
	Partial
FR-OPN-007
	The system shall record the count of late bids received on the Jadual Tawaran, drawn from the actual late-bid records rather than keyed.
	M
	SK002 7.7.4; CPD/J.TAWARAN-02
	Partial
FR-OPN-008
	The system shall present a mandatory-document verification checklist at opening, configured per exercise, and shall record a tri-state result…
	M
	SK003 7.2.2(a); TA 109 Stage 1; quotation Fasa 1
	Partial
FR-OPN-009
	The system shall lock the evaluation module until the opening is finalised, and shall carry forward to evaluation only those bids the Opening…
	M
	SK003 7.2.1(a)
	Full
FR-OPN-010
	The system shall generate the Grand Summary (CPD/G.SUMMARY-01) after the committee decision, marking each bidder Layak or Tidak Layak and…
	S
	CPD/G.SUMMARY-01; practice
	Full
FR-OPN-011
	The system shall persist all opening state — attendance, per-bid initials, checklist results, committee decisions, the schedule and the finalisation…
	M
	ISO 9001 QMS practice; evidentiary integrity
	Absent
FR-EVL-001
	The system shall support joint evaluation by the Project Implementing Department together with Contract & Procurement, with each participant acting…
	M
	SK003 7.1.1
	Partial
FR-EVL-002
	The system shall sequence the evaluation so that the Implementing Department completes and submits the technical assessment before the financial and…
	S
	Practice
	Full
FR-EVL-003
	The system shall implement the four qualitative aspects of SK003 7.2.2 as first-class assessments on every traditional-contract evaluation: (a)…
	M
	SK003 7.2.2(a)–(d)
	Partial
FR-EVL-004
	The system shall record, for aspect (b), an explicit comparison between each tender price and the company estimate, and shall support the…
	M
	SK003 7.2.2(b)
	Partial
FR-EVL-005
	The system shall implement the Design & Build and Turnkey route as a two-stage evaluation: a First Stage technical evaluation covering design,…
	M
	SK003 7.3(a),(b)
	Absent
FR-EVL-006
	The system shall provide a configurable evaluation model per exercise, supporting stage or phase definitions, criteria, weights, pass marks and…
	M
	Decision D1; SK003 by omission
	Partial
FR-EVL-007
	The system shall execute at runtime the evaluation model that was configured for that exercise, and shall not apply any other model.
	M
	Prototype defect
	Absent (and wrong)
FR-EVL-008
	The system shall support the observed six-stage weighted tender model as a configurable template: Stage 1 mandatory submission checklist (pass/fail);…
	M
	TA 109 Stages 1–6 — [PRACTICE], no SOP basis
	Partial (config only)
FR-EVL-009
	The system shall support the observed five-phase quotation model as a configurable template: Fasa 1 mandatory evaluation (documents received before…
	M
	LAPORAN PENILAIAN SEBUTHARGA template — [PRACTICE]
	Partial
FR-EVL-010
	The system shall compute the quotation financial test as: minimum capital = company estimate × 3% where materials are supplied from the Ranhill SAJ…
	M
	Quotation evaluation template Fasa 3
	Full
FR-EVL-011
	The system shall compute the commercial evaluation as the variance of each bid against the company estimate and against the lowest bid, in RM and per…
	M
	Quotation evaluation template Fasa 4
	Full
FR-EVL-012
	The system shall record the Contractor Performance Report percentage as an evaluation input drawn from the contractor performance register rather…
	M
	Quotation template Fasa 2; FORMS §12; SK003 7.2.2(d)
	Partial
FR-EVL-013
	The system shall enforce a communication blackout with tenderers during evaluation, permitting clarification or confirmation only in writing through…
	M
	SK003 7.2.1(d)
	Absent
FR-EVL-014
	The system shall classify all evaluation and tender-certification information as SULIT and restrict access to the assigned evaluators, the…
	M
	SK003 7.2.1(e)
	Absent
FR-EVL-015
	The system shall support a Tender Clarification Meeting, recording the minutes and requiring the tenderer's written confirmation of all agreements…
	M
	SK003 7.4.1–7.4.3
	Absent
FR-EVL-016
	The system shall support a Price Negotiation Meeting, recording the minutes and the tenderer's written confirmation, and shall include both, together…
	M
	SK003 7.5.1–7.5.3; DAL §3.1.4.4 item 3
	Absent
FR-EVL-017
	The system shall produce a single Evaluation Report object with the fixed annexes A Jadual Penilaian, B Jadual Perbandingan, C Jadual Tawaran, D…
	M
	Quotation template §5–§8; SK003 7.5.3, 7.7.1
	Partial
FR-EVL-018
	The system shall compute and display the cost saving of the recommended bid against the company estimate in the recommendation stage.
	S
	TA 109 Stage 6
	Partial
FR-EVL-019
	The system shall auto-disqualify, without evaluation, a quotation bid whose price exceeds RM300,000.00, recording the reason.
	M
	Observed practice: "tidak dinilai kerana harga tawaran melebihi syarat maksimum sebutharga iaitu RM 300,000.00"
	Absent (and wrong)
FR-EVL-020
	Where anonymised evaluation is enabled, the system shall anonymise bidder identity and price during the technical scoring stage only, and shall…
	S
	[NET-NEW]; conflicts with SK003 7.2.2(d)
	Partial (conflicted)
FR-APR-001
	The system shall implement approval routing as a configuration-driven rules engine reading versioned, effective-dated DAL tables, and shall contain…
	M
	DAL, whole document
	Absent
FR-APR-002
	The system shall determine, for every approval event, the approval matrix to apply from the combination of matter type, procurement regime, funding…
	M
	DAL §§3.1.4.1–3.1.4.4
	Absent
FR-APR-003
	The system shall implement the full authority grammar as distinct, recordable step types: A approve, R recommend, P propose, JP jointly propose, JR…
	M
	DAL authority code vocabulary
	Absent
FR-APR-004
	The system shall automatically generate the full chain beneath every approval according to DAL §2.2.1: where the approving authority is the Head of…
	M
	DAL §2.2.1 p.13
	Absent
FR-APR-005
	The system shall treat steps coded MA, MR or MJR as non-delegable, and shall refuse any attempt to delegate, skip, substitute or auto-approve such a…
	M
	DAL §1.6
	Absent
FR-APR-006
	The system shall require a mandatory committee recommendation to be recorded as a quorate committee decision — not as an individual approval — before…
	M
	DAL §3.1.4.2 items 1–2; §§3.1.4.3–3.1.4.4
	Absent
FR-APR-007
	The system shall record, for every approval step, the actor, the role held at the time, the authority code, the decision, the decision date and time,…
	M
	DAL; evidentiary integrity
	Absent
FR-APR-008
	The system shall prevent any user from approving, at any step, a matter in which they are the requester, the beneficiary, or a party to their own…
	M
	DAL §1.6
	Absent
FR-APR-009
	The system shall support declaration of a conflict of interest at any step, requiring the declaring approver to recuse and escalating the step one…
	M
	DAL §1.5
	Absent
FR-APR-010
	Where no clear approving authority can be resolved for a matter, the system shall escalate to the immediate superior of the indicated approving…
	M
	DAL §1.5
	Absent
FR-APR-011
	The system shall implement delegation such that a delegation is valid only if it is in writing within the system, is time-limited or task-limited, is…
	M
	DAL §1.6
	Absent
FR-APR-012
	On the absence of an authority holder, the system shall revert that authority upward to the delegator, and shall permit onward re-delegation only…
	M
	DAL p.42 specimen letter
	Absent
FR-APR-013
	The system shall accept a Government-Funding override rule set which, when the funding source is a government route and the override is configured,…
	M
	DAL §1.4
	Absent
FR-APR-014
	Where a matter requires shareholder approval by law, the system shall downgrade the Board of Directors' step from approve to recommend and place…
	S
	DAL §1.5
	Absent
FR-APR-015
	The system shall maintain a complete, immutable and exportable audit trail of every approval event, including submissions, recalls, escalations,…
	M
	Evidentiary integrity; ISO 9001 QMS practice
	Absent
FR-APR-016
	The system shall provide an explicit rejection outcome at every approval step, requiring a reason, and shall route a rejected matter to a defined…
	M
	[ASSUMPTION]
	Absent
FR-APR-017
	The system shall support recall of a matter by the originator before the first approval decision is recorded, and shall record the recall.
	S
	[ASSUMPTION]
	Absent
FR-APR-018
	The system shall apply approval service-level targets per matter type, escalate overdue steps to the approver's superior after a configurable period,…
	S
	CPD/DFA/* ICC columns; [ASSUMPTION] for escalation
	Absent
FR-APR-019
	The system shall present to every approver, at the point of decision, the DAL clause being applied, the value band, the chain above and below, and…
	M
	Usability of a legally significant control
	Absent
FR-APR-020
	The system shall version DAL configuration, retain superseded versions indefinitely, apply the version in force at the date the matter was raised,…
	M
	DAL Board approval; evidentiary integrity
	Absent
FR-CTE-001
	The system shall maintain a Committee register supporting the Tender Board Committee, Quotation Committee, Variation Orders Committee, Tender Opening…
	M
	DAL p.12; SK002 7.7.2; SK003 7.6; SK012; OM/P/001 8.3; KP003 5.11.5
	Absent
FR-CTE-002
	The system shall maintain committee membership by position — Chairman, Deputy Chairman, Member and Secretary — with a named holder, an…
	M
	Quotation evaluation template APPROVAL sheet; CPD/VO(CONSENT)-PAAB p.2
	Absent
FR-CTE-003
	The system shall enforce a configurable quorum per committee, shall default the Tender Board Committee quorum to three (3) members, and shall refuse…
	M
	SK003 7.6.2
	Absent
FR-CTE-004
	The system shall model a Meeting as an entity with a date, a reference, an agenda of matters tabled, an attendance register, a quorum determination,…
	M
	SK003 7.7.1, 7.7.2; SK012 flowchart
	Absent
FR-CTE-005
	The system shall capture each member's individual decision on each matter as SETUJU or TIDAK SETUJU (Agree or Disagree), with a comment and a date,…
	M
	SK003 practice; quotation Kertas Cadangan; CPD/VO(CONSENT)-PAAB
	Absent
FR-CTE-006
	The system shall route recommendations to the Tender Board only through the Secretariat, which is the Contract & Procurement Department, and shall…
	M
	SK003 7.7.2
	Absent
FR-CTE-007
	The system shall assemble the Tender Board bundle comprising the tender documents, all tenders received late, the tender report and the…
	M
	SK003 7.7.1
	Absent
FR-CTE-008
	The system shall record a Tender Board decision on the admission of each late tender as a discrete decision distinct from the award decision.
	M
	SK003 7.2.1(a)
	Absent
FR-CTE-009
	The system shall implement the not-approved outcome of a Tender Board decision as one of the three documented options — Pemanggilan semula (recall),…
	M
	SK003 flowchart; KP002/003/004 flowchart 6.1; [ASSUMPTION] for the terminal outcomes
	Absent
FR-CTE-010
	The system shall detect and prevent a committee member from voting on a matter in which they have declared a conflict of interest, and shall record…
	M
	DAL §1.5
	Absent
FR-CTE-011
	The system shall record the appointment of Opening Committee members per exercise, and shall support a configurable rule requiring those members to…
	S
	SK002 7.7.2 (silent); TA 109 practice
	Absent
FR-CTE-012
	The system shall not implement any rule permitting the Chairman of the Tender Board to appoint a substitute chair.
	M
	SK003 7.6.3
	Absent
FR-CTE-013
	The system shall generate the committee proposal paper (Kertas Cadangan) addressed to the chairman and members, with the checking signature of the…
	M
	CPD/DFA/PRE T-QUO boxes 8–9; practice
	Absent
FR-CTE-014
	The system shall record, on the relevant CPD/DFA/ routing sheet, the committee meeting date and the outcome, and shall record the CEO approval block…
	M
	CPD/DFA/PRE T-QUO boxes 10–11
	Absent
FR-AWD-001
	The system shall prevent issue of a Letter of Acceptance until a recorded Tender Board approval exists for that exercise.
	M
	SK003 7.1.2, 7.9.1
	Absent
FR-AWD-002
	The system shall resolve the signatory of the Letter of Acceptance and of the Contract Document from the contract value: more than RM3 million to the…
	M
	DAL §3.1.4.4 item 5a, 5b, 5c
	Absent
FR-AWD-003
	The system shall generate the Letter of Acceptance with the Surat Akuan Pembida Berjaya attached, and shall require the successful tenderer to return…
	M
	SK003 7.10.1–7.10.3
	Absent
FR-AWD-004
	The system shall distribute copies of the Letter of Acceptance to the Implementing Department, the Accounts & Finance Department, CIDB (LPIPM) and…
	M
	SK003 7.9.3(a)–(e)
	Absent
FR-AWD-005
	The system shall support delivery of the Letter of Acceptance by Registered Post (Pos Berdaftar) or by collection at the K&P Department, recording…
	M
	SK003 7.9.3
	Absent
FR-AWD-006
	The system shall generate an Inden Kerja for a quotation-route award, consuming the ERP-generated number in the format IN<YYYY><NNNNN>, and shall…
	M
	DAL §3.1.4.3 items 14–15; IN202600395 covering memo
	Absent
FR-AWD-007
	The system shall generate the appointment notification letter (Pemberitahuan Perlantikan) in the correct template variant for the case — Direct and…
	M
	Appointment-letter templates; DAL §3.1.4.3 item 15
	Absent
FR-AWD-008
	The system shall include a contractor acceptance page on the appointment letter capturing the contractor's signature, the witness signature and full…
	M
	Appointment-letter templates
	Absent
FR-AWD-009
	The system shall enforce a seven (7) day commencement rule on the quotation route, raising a warning where work has not commenced within seven days…
	M
	Appointment-letter templates
	Absent
FR-AWD-010
	The system shall notify unsuccessful tenderers of the outcome, with a configurable debrief that may include the tenderer's own composite score and…
	S
	[NET-NEW] — SK003 7.11 provides for none
	Full (net-new)
FR-AWD-011
	The system shall post the work commencement date to the public exercise record, shall track the one (1) month window from that date within which…
	M
	SK003 7.11.1, 7.11.2
	Absent
FR-AWD-012
	The system shall maintain a securities register recording the Performance Bond with its instrument type, issuer, value, basis of calculation,…
	M
	SK004 §7.3.3(a); observed award pack
	Absent
FR-AWD-013
	The system shall maintain an insurance register recording the Works Insurance at a sum insured equal to the full Contract Price plus any amount…
	M
	SK004 §7.3.3(b)–(e)
	Absent
FR-AWD-014
	The system shall record the Safe Work Method Statement approved by Ranhill SAJ HSE and the SPAN permit under section 50 of Act 655 as conditions…
	S
	Appointment templates; observed award pack LA - T 02 2026
	Absent
FR-CON-001
	The system shall transfer ownership of the case from the Pre-Contract Section to the Post-Contract Section on issue of the Letter of Acceptance, on…
	M
	SK003 7.9 (TAMAT); SK004 header, 7.2.1
	Absent
FR-CON-002
	The system shall allocate a contract number immediately on issue of the Letter of Acceptance, in the series RSAJ/KP/T/<serial>/<year> for a tender…
	M
	SK004 §7.2.1
	Absent
FR-CON-003
	The system shall assemble the Contract Document in the prescribed order for the contract basis — Bills of Quantities based, Drawings and…
	M
	SK004 §7.3.1
	Absent
FR-CON-004
	The system shall reconcile the Contract Document against the Tender Document and the Tender Table Document, ensuring identical content, incorporating…
	M
	SK004 §7.3.2
	Absent
FR-CON-005
	The system shall correct arithmetical errors in the Bills of Quantities or Tender Summary, test rate reasonableness to avoid front loading (berat…
	M
	SK004 §7.3.2(a)–(d)
	Absent
FR-CON-006
	The system shall route the Conditions of Contract, the contractor-signed Letter of Acceptance and the Bills of Quantities or Schedule of Rates to…
	M
	SK004 §7.1.2, §7.4.1, §7.4.2
	Absent
FR-CON-007
	The system shall require, before the contractor's representative may sign, a copy of the company resolution or other proof of signing authority, and…
	M
	SK004 §7.5.3
	Absent
FR-CON-008
	The system shall implement a pre-signature readiness gate requiring, cumulatively, that the Letter of Acceptance has been returned signed, the…
	M
	SK004 §7.1.1
	Absent
FR-CON-009
	The system shall record the Contract Date as the date on which the Ranhill SAJ officer signs, and shall derive it rather than accept it as free input.
	M
	SK004 §7.5.1; KP004 5.4.2
	Absent
FR-CON-010
	The system shall record the Integrity Pact Stage Three briefing at signing, in which the action that may be taken on breach of the anti-corruption…
	S
	SK004 §7.5.2
	Absent
FR-CON-011
	The system shall track stamping of the executed contract at the Inland Revenue Board (LHDN), recording the stamping date and reference.
	M
	SK004 §7.6
	Absent
FR-CON-012
	The system shall distribute controlled copies of the executed contract — one original with drawings plus one PDF to Contract & Procurement, one copy…
	M
	SK004 §7.7.1
	Absent
FR-CON-013
	The system shall record the secure custody location of the original Contract Document, the Performance Bond and the insurance policies, and shall…
	M
	SK004 §7.8
	Absent
FR-CON-014
	The system shall establish the contract baseline on execution, recording at minimum the Contract Sum, Contract Date, Date of Possession of Site, Date…
	M
	[ASSUMPTION], required by SK007 §7.1.2, SK009 §7.1.2 and §7.3.1, SK011 §7.2.4(a)
	Absent
FR-SUP-001
	The system shall resolve the Superintending Officer / Project Director as a role rather than a post, assigning it by contract value: the CEO for…
	M
	DAL §3.1.4.4 item 5; §3.1.4.3 item 6
	Absent
FR-SUP-002
	The system shall require the Superintending Officer to record satisfaction that a proposed delegate has the ability and experience needed before…
	M
	SK005 §7.3.2
	Absent
FR-SUP-003
	The system shall generate the Letter of Delegation of Authority and the Notification of Delegation of Authority in the correct variant — Appendix A/1…
	M
	SK005 §7.3.1, §7.3.3
	Absent
FR-SUP-004
	The system shall enforce the delegation constraints: no sub-delegation; no communication with the contractor on matters outside the delegated scope;…
	M
	SK005 §7.3.4(a)–(d), §7.2.3
	Absent
FR-SUP-005
	The system shall record possession of site and the Date of Possession, and shall start the contract clock from it.
	M
	SK010 flowchart; form fields on VO-660, CPO and PMKD
	Absent
FR-SUP-006
	The system shall accept the contractor's work programme, or the Service and Maintenance Implementation Schedule for annual contracts, shall record…
	M
	SK005 §7.4.2(a),(b), §7.5.4
	Absent
FR-SUP-007
	The system shall provide a daily site diary requiring an entry every day, dual-signed by the responsible officer and the contractor's agent, who must…
	M
	SK005 §7.5.2(b),(c),(d)
	Absent
FR-SUP-008
	The system shall record inspection and endorsement of the site diary by the superior officer and the Superintending Officer at each site visit.
	S
	SK005 §7.5.2(e)
	Absent
FR-SUP-009
	The system shall maintain the pipe log and as-built drawings as controlled documents throughout the works, updated as soon as practicable after…
	M
	SK005 §7.5.3; SK009 §7.6
	Absent
FR-SUP-010
	The system shall compute and flag Project In Delay status where actual physical work progress is less than 70% of the Programme Schedule, or where…
	M
	SK005 §7.4.2(d)
	Absent
FR-SUP-011
	The system shall support convening a Special Meeting chaired by the Superintending Officer following a Project In Delay classification, with minutes…
	S
	SK005 §7.4.2(e)
	Absent
FR-SUP-012
	The system shall direct the contractor immediately to review the effect on the overall completion date and submit a revised programme on the…
	M
	SK005 §7.4.2(c)
	Absent
FR-SUP-013
	The system shall monitor the validity of all contract insurance policies against the works period, shall alert before lapse, and shall support the…
	M
	SK005 §7.2.4(d); SK006 §7.5.6
	Absent
FR-SUP-014
	The system shall record monitoring of material quality and workmanship, local-authority and third-party regulatory compliance, worker welfare,…
	S
	SK005 §7.2.4(a),(b),(c),(e)
	Absent
FR-SUP-015
	The system shall provide the Superintending Officer with an early-action decision recording one or more of: grant an extension of time or extension…
	M
	SK005 §7.2.4(f)
	Absent
FR-PAY-001
	The system shall support an advance payment application with a mandatory Advance Payment Guarantee issued by a bank or insurance company, and shall…
	M
	DAL §3.1.4.4 item 15; SK008 §7.7.2(a)
	Absent
FR-PAY-002
	The system shall recoup advance payment through deduction lines on each interim certificate, separately for the main contractor and for nominated…
	M
	CPD/B.INT(T) TOLAK item 1; [ASSUMPTION] for the schedule
	Absent
FR-PAY-003
	The system shall fix and record a specific day each month as the site valuation date, agreed with the contractor, and shall notify all parties.
	M
	SK011 §7.2.3(a)
	Absent
FR-PAY-004
	The system shall support both entry points into the interim payment cycle — a valuation-driven cycle on the agreed monthly date, and a claim-driven…
	M
	SK011 §7.2.3(a),(b) vs §8.0 flowchart step 1; §7.2.6
	Absent
FR-PAY-005
	The system shall accept the contractor's materials-on-site list, stating type, quantity and storage location on site, on or before the valuation…
	M
	SK011 §7.2.3(f),(i),(l)
	Absent
FR-PAY-006
	The system shall support a joint site valuation of work executed and unfixed materials and goods delivered, with the valuation method following the…
	M
	SK011 §7.2.3, §7.2.3(c)
	Absent
FR-PAY-007
	The system shall value unfixed materials on site only where they are adequately protected, are not delivered too early, and form part of the…
	M
	SK011 §7.2.3(g); CPD/B.INT(T) I37
	Absent
FR-PAY-008
	The system shall include the value of variation work only where VOC approval has been obtained, and shall check at valuation time whether including…
	M
	SK011 §7.2.3(e)
	Absent
FR-PAY-009
	The system shall value Preliminaries and General Items, categorised per item as payable in the first payment, progressively by time or progress, or…
	S
	SK011 §7.2.3(d)
	Absent
FR-PAY-010
	The system shall record nominated sub-contractor, nominated supplier and assignee values separately, as Lampiran A1, A2 and A3 to the certificate.
	M
	SK011 §7.2.3(h),(l); CPD/B.INT(T)
	Absent
FR-PAY-011
	The system shall apply the deduction block to every interim certificate: retention split three ways between main contractor, nominated…
	M
	CPD/B.INT(T) KURANGAN and TOLAK blocks
	Absent
FR-PAY-012
	The system shall compute the certificate arithmetic: net adjustment to the contract sum as the sum of PPJHK additions and omissions; the new contract…
	M
	CPD/B.INT(T) I24, L25, L43, L55, L56, L94
	Absent
FR-PAY-013
	The system shall withhold the first interim certificate until the value of work executed and materials delivered reaches the lesser of RM1,000.00 and…
	M
	SK011 §7.2.4(a)(i)
	Absent
FR-PAY-014
	The system shall permit interim certificates numbered 1 to 3 to be issued and paid before the Contract Document is signed, provided the contractor…
	M
	SK011 §7.2.5(a),(b); observed award pack
	Absent
FR-PAY-015
	The system shall apply the payment waterfall where the recommended payment is insufficient: first nominated sub-contractors and nominated suppliers,…
	M
	SK011 §7.2.3(m),(n),(o)
	Absent
FR-PAY-016
	The system shall route approval of the interim payment certificate strictly by the DAL: value more than RM500,000 to the CEO; more than RM100,000 and…
	M
	DAL §3.1.4.4 item 16a,b,c; §3.1.4.3 item 12
	Absent
FR-PAY-017
	The system shall capture the two signature blocks on the interim certificate in printed order: first the Quantity Surveyor or Recommending Officer,…
	M
	CPD/B.INT(T) signature blocks
	Absent
FR-PAY-018
	The system shall issue the certificate within the period stipulated in the contract, counted from the valuation date or the date of receipt of the…
	S
	SK011 §7.2.6; CPD/INT-SFA-INDEN(i),(ii)
	Absent
FR-PAY-019
	The system shall forward the approved certificate to Accounts & Finance to enable payment, with a copy to the Implementing Department, and shall…
	M
	SK011 §7.2.7; CPD/INT-SFA-INDEN
	Absent
FR-PAY-020
	The system shall support the PAAB minor-works payment variant, in which the contractor claims to PAAB through a letter to Ranhill SAJ with seven…
	S
	OM/P/006 §8.1–8.6
	Absent
FR-PAY-021
	The system shall maintain a running retention balance per contract, split three ways, and shall support release of 50% of the retention money on…
	M
	OM/P/007 §8.23–8.26; SK009 §7.7.4; DAL §3.1.4.3 item 12
	Absent
FR-VAR-001
	The system shall support origination of a variation need by the Implementing Department, with review by the S.O.'s Representative, and shall also…
	M
	SK012 §8.0 flowchart step 1 (Pindaan 02) vs §7.2.3(a) narrative; OM/P/010 §8.6
	Absent
FR-VAR-002
	The system shall require a Specialist S.O.'s Representative to confirm the availability of the allocation (peruntukan) before a variation application…
	M
	SK005 §7.3.4(d)
	Absent
FR-VAR-003
	The system shall generate the Application to Implement Variation Order (CPD/VO-660(T)) capturing applicant details; contract details including…
	M
	SK012 §7.2.3(a),(b); CPD/VO-660(T)
	Absent
FR-VAR-004
	The system shall apply the prior-approval exemption test, exempting from prior approval: variations causing a reduction in the Total Contract Sum;…
	M
	SK012 §7.2.1(b)
	Absent
FR-VAR-005
	The system shall record the Superintending Officer's decision on the application as DISOKONG or TIDAK DISOKONG, with a value cap where supported, and…
	M
	SK012 flowchart; CPD/VO-660(T)
	Absent
FR-VAR-006
	The system shall test whether a negotiated agreed rate already exists, and shall produce a Confirmation of Agreed Price where it does, or bypass to…
	M
	SK012 flowchart; §7.2.5(a)(i)(7)
	Absent
FR-VAR-007
	The system shall produce the correct variation schedule form — CPD/VO-661(T), CPD/VO-662(T) or CPD/VO-661&662(T) — from a single Variation…
	M
	SK012 flowchart step 6; forms 6c–6e
	Absent
FR-VAR-008
	The system shall require three separate DAL approvals where applicable: prior approval to issue the instruction; approval to increase the value of a…
	M
	SK012 §7.2.2(b)(i),(ii),(iii)
	Absent
FR-VAR-009
	The system shall obtain PAAB consent on CPD/VO(CONSENT)-PAAB for variations affecting PAAB-funded assets, capturing the nine-member Variation Order…
	M
	Form 6g; DAL §1.4
	Absent
FR-VAR-010
	The system shall record a mandatory, non-delegable recommendation by the Variation Orders Committee on every variation row in both regimes, other…
	M
	DAL §3.1.4.3 item 5; §3.1.4.4 item 7
	Absent
FR-VAR-011
	The system shall route variation approval in the tender regime through the two-dimensional matrix of contract value band by variation percentage…
	M
	DAL §3.1.4.4 item 7a, 7b, 7c; CPD/DFA/VO(T)
	Absent
FR-VAR-012
	The system shall route variation approval in the quotation regime through the one-dimensional matrix: more than 50% of contract value to the CEO with…
	M
	DAL §3.1.4.3 item 5a, 5b, 5c; CPD/DFA/VO(SH)
	Absent
FR-VAR-013
	The system shall implement the VOC rework loop: a TIDAK SETUJU decision returns the variation for review and resubmission to the VO Committee.
	M
	SK012 flowchart connector B
	Absent
FR-VAR-014
	The system shall provide a Commenced Pending Approval state in which variation work may proceed once support has been obtained from the…
	M
	SK012 §7.2.2(c)
	Absent
FR-VAR-015
	The system shall generate the Superintending Officer's Instruction (CPD/APP(T)) in writing, signed by the Superintending Officer, with particulars…
	M
	SK012 §7.2.4(a),(b),(d)
	Absent
FR-VAR-016
	The system shall support the oral-instruction confirmation loop: confirmation to the contractor within seven (7) days or as the Conditions of…
	M
	SK012 §7.2.4(c),(d)(ii)
	Absent
FR-VAR-017
	The system shall measure and value variations promptly, requiring measurement during execution or detailed records where work will be covered up,…
	M
	SK012 §7.2.5(a)(i)(1)–(7)
	Absent
FR-VAR-018
	The system shall value variations using contract rates from the Bills of Quantities or Schedule of Rates with any percentage adjustment applied,…
	M
	SK012 §7.2.5(a)(i)(4),(6),(7)
	Absent
FR-VAR-019
	The system shall require daywork labour and plant time records to be checked and agreed with the contractor or its representative every day, and…
	M
	SK012 §7.2.5(a)(i)(3),(8)
	Absent
FR-VAR-020
	The system shall generate the Certificate of Variation of Works (CPD/VO-663(T)) with the addition or omission direction, the reference and date of…
	M
	SK012 §7.2.5(a)(ii); form 6f
	Absent
FR-VAR-021
	The system shall require the Variation Order Certificate to be approved and signed by the Superintending Officer, after the Recommending Officer, and…
	M
	SK012 §7.2.5(b)
	Absent
FR-VAR-022
	The system shall capture the contractor's signature and a witness signature on the certificate, and shall issue the certificate and permit payment…
	M
	SK012 §7.2.5(b)
	Absent
FR-VAR-023
	The system shall distribute the Variation Order Certificate with the original to the contractor and copies to the S.O.'s Representative, the Head of…
	M
	SK012 §7.2.5(c)
	Absent
FR-VAR-024
	The system shall maintain the cumulative approved variation value and percentage against each contract, and shall display it on every variation…
	M
	CPD/VO-660(T) §3.5; CPD/VO-661(T) §1.8; CPD/VO-662(T) §1.9
	Absent
FR-PAD-001
	The system shall support five adjustment triggers: variation of works; a contractor claim for loss or expense; re-measurement of provisionally…
	M
	SK013
	Absent
FR-PAD-002
	The system shall generate the Certificate of Adjustment of Contract Sum (CPD/PPJHK(T)) with section 1.1 listing variation-driven adjustments by…
	M
	SK013; form 7
	Absent
FR-PAD-003
	The system shall treat the Certificate of Adjustment of Contract Sum as the master record of contract-sum movement, and shall require one to be…
	M
	SK013
	Absent
FR-PAD-004
	The system shall route re-measurement of provisional quantities in the tender regime to the Tender Board where it exceeds 30% of contract value, with…
	M
	DAL §3.1.4.4 item 8a, 8b; §3.1.4.3 item 5
	Absent
FR-PAD-005
	The system shall support a price fluctuation adjustment computed by a configurable formula and index, applied only where the contract provides for it.
	S
	SK013; SK011 §7.2.3(k)
	Absent
FR-PAD-006
	The system shall route approval of the Certificate of Adjustment of Contract Sum to a configurable authority, defaulting to the Superintending…
	M
	SK013; DAL critical finding 7
	Absent
FR-PAD-007
	The system shall capture contractor and witness acceptance of the adjustment on the certificate, and shall distribute the original to the contractor…
	M
	SK013
	Absent
FR-EOT-001
	The system shall accept the contractor's written notice of the causes of delay, given to the Superintending Officer immediately upon the delay…
	M
	SK006 §7.3.1, §7.3.2
	Absent
FR-EOT-002
	The system shall apply the entitlement test, recording whether the cause falls within a contractual delay event and is outside the contractor's…
	M
	SK006 §7.1.2, §7.2.1; SK007 §7.1.1
	Absent
FR-EOT-003
	The system shall apply the best-endeavours test, recording whether the contractor constantly used best endeavours to avoid the delay and did whatever…
	M
	SK006 §7.2.2, §7.4.2
	Absent
FR-EOT-004
	The system shall evaluate only actual delay (kelambatan sebenar), examining the effect on the overall completion period rather than in isolation,…
	M
	SK006 §7.4.1
	Absent
FR-EOT-005
	The system shall apply the exceptionally inclement weather test, refusing an extension for weather that is not exceptional, treating monsoon season…
	M
	SK006 §7.4.3
	Absent
FR-EOT-006
	The system shall assemble the extension-of-time submission pack containing: how the proposed period was calculated with bar charts or other…
	M
	SK006 §7.5.7(a)–(e)
	Absent
FR-EOT-007
	The system shall route extension-of-time approval on the cause of the financial impact, not on value: with financial impact not due to an authority…
	M
	DAL §3.1.4.4 item 10a(i), 10a(ii), 10b; quotation regime §3.1.4.3 item 6
	Absent
FR-EOT-008
	The system shall generate the Certificate of Delay and Extension of Time (CPD/EOT(T)) with all information filled in exactly as it appears in the…
	M
	SK006 §7.5.2, §7.5.5; form 2
	Absent
FR-EOT-009
	The system shall extend lapsed insurance policies on the Superintending Officer's authority where the certificate is about to issue with policies…
	M
	SK006 §7.5.6
	Absent
FR-EOT-010
	The system shall route distribution of the extension-of-time certificate with the original to the contractor and copies to the S.O.'s Representative,…
	M
	SK006 §7.7.1, §7.8.1
	Absent
FR-EOT-011
	The system shall support Extension of Contract Period as a distinct process initiated by the Implementing Department on current needs, requiring four…
	M
	SK006 §7.2.3, §7.3.3, §7.4.4
	Absent
FR-EOT-012
	The system shall route Extension of Contract Period approval to the Tender Board Committee in the tender regime with joint recommendation or…
	M
	DAL §3.1.4.4 item 9; §3.1.4.3 item 9
	Absent
FR-EOT-013
	The system shall generate a Supplementary Agreement for Extension of Contract Period (Perjanjian Tambahan) as a bilateral instrument signed by both…
	M
	SK006 §7.1.2, §7.5.1
	Absent
FR-LAD-001
	The system shall establish the liquidated damages trigger only where completion is late and the causes of delay do not entitle the contractor to an…
	M
	SK007 §7.1.1, §7.2.1
	Absent
FR-LAD-002
	The system shall take the liquidated damages rate and unit from the value fixed in the Letter of Acceptance and carried into the contract baseline,…
	M
	SK007 §7.1.2
	Absent
FR-LAD-003
	The system shall issue a standard warning letter of the intention to impose liquidated damages before liquidated damages are imposed, sent by…
	M
	SK007 §7.2.2; form 8a
	Absent
FR-LAD-004
	The system shall generate the Certificate of Non-Completion (CPD/CNC(T)) with all particulars filled in exactly as they appear in the Contract…
	M
	SK007 §7.3.1, §7.3.2
	Absent
FR-LAD-005
	The system shall assemble the non-completion submission pack containing, where required: the S.O. Representative's statement that the case has been…
	M
	SK007 §7.3.3(a)–(d)
	Absent
FR-LAD-006
	The system shall route the Certificate of Non-Completion through the review chain printed on CPD/DFA/CNC-CPC-CMGD — endorsed by the Department Head…
	M
	CPD/DFA/CNC-CPC-CMGD; SK007 §7.4.1
	Absent
FR-LAD-007
	The system shall treat issue of the Certificate of Non-Completion as a mandatory precondition to imposing liquidated damages, and shall not permit an…
	M
	SK007 §7.1.2
	Absent
FR-LAD-008
	The system shall compute liquidated damages as the LAD rate multiplied by the number of chargeable units, applied over an accrual window defined per…
	M
	CPD/B.INT(T) I79, I80; contractor-performance workbooks
	Absent
FR-LAD-009
	The system shall route a waiver of liquidated damages or penalty in the tender regime to the Tender Board where the waiver exceeds 30% of the…
	M
	DAL §3.1.4.4 item 12a, 12b; §3.1.4.3 item 7
	Absent
FR-LAD-010
	The system shall reduce the liquidated damages rate in proportion to the value of any part taken over and occupied, against the Total Contract Price,…
	M
	SK009 §7.4.2(c)
	Absent
FR-LAD-011
	The system shall support per-section liquidated damages where sectional completion applies, using the separate LAD value stated in the tender…
	M
	SK009 §7.3.1
	Absent
FR-LAD-012
	The system shall track cumulative liquidated damages against each contract and alert where the accrual has continued beyond a configurable period, so…
	S
	SK007 §7.6.1, §7.6.2
	Absent
FR-LAD-013
	The system shall escalate to termination where, with liquidated damages imposed, the contractor's performance shows that completion is unlikely.
	M
	SK007 §7.6.2
	Absent
FR-TRM-001
	The system shall record the ground for termination as either default in fulfilling obligations or continuous self-disablement from proceeding with…
	M
	SK008 §7.1.1, §7.2.1, §7.3.1, §7.3.2, §7.3.3
	Absent
FR-TRM-002
	The system shall maintain a prior-notice register keyed by contract and default category, and shall permit termination without a further Notice of…
	M
	SK008 §7.2.2(e)
	Absent
FR-TRM-003
	The system shall generate the Notice of Intention to Terminate stating the default committed and giving fourteen (14) days to remedy it, capturing…
	M
	SK008 §7.2.2(b),(c), §7.6.2; form 4b
	Absent
FR-TRM-004
	The system shall distribute both termination notices to all parties involved with the contract and specifically to the bank or insurance company that…
	M
	SK008 §7.6.3; form 4b
	Absent
FR-TRM-005
	The system shall route termination approval to the CEO, with recommendation by the Head of Division and joint recommendation or proposal by Contract…
	M
	DAL §3.1.4.4 item 13; §3.1.4.3 item 8
	Absent
FR-TRM-006
	The system shall lodge claims against the bank or insurance company that issued the Performance Bond and the Advance Payment Guarantee not later than…
	M
	SK008 §7.7.2(a)
	Absent
FR-TRM-007
	The system shall record the site-securing obligations: direction to the contractor to cease all site operations and leave behind all temporary…
	M
	SK008 §7.7.2(b)
	Absent
FR-TRM-008
	The system shall capture an inventory of all temporary buildings, plant, tools, equipment, materials and unfixed goods, together with a record of…
	M
	SK008 §7.7.2(c)
	Absent
FR-TRM-009
	The system shall support re-tendering of the balance of works, observing that a record of work already completed will be prepared and agreed before…
	M
	SK008 §7.7.2(f)(i)–(iv)
	Absent
FR-TRM-010
	The system shall support re-nomination of nominated sub-contractors and suppliers to the new contractor at the original sub-contract sum or original…
	M
	SK008 §7.7.2(g)
	Absent
FR-TRM-011
	The system shall generate the Final Certificate for a Contract whose Contractor's Employment has been Terminated (CPD/PMKD(T)) as soon as a…
	M
	SK008 §7.8.1(a)
	Absent
FR-TRM-012
	The system shall compute the Cost of Completion as the total advance payment paid, plus total interim payments to the original contractor, plus total…
	M
	SK008 §7.8.1(b)(i), §7.8.2(a)–(e)
	Absent
FR-TRM-013
	The system shall compute the cost of loss using the liquidated damages rate in the original contract as Ranhill SAJ's loss rate per day, week or…
	M
	SK008 §7.8.2(f)(i)–(v)
	Absent
FR-TRM-014
	The system shall apply a configurable on-cost charge as a percentage of the New Contract Price to reimburse Ranhill SAJ's administrative cost of…
	M
	SK008 §7.8.2; CPD/PMKD(T) M55
	Absent
FR-TRM-015
	The system shall compute the Adjusted Original Contract Price as the original contract sum plus the net value of adjustment, less liquidated damages…
	M
	SK008 §7.8.1(b)(ii), §7.8.2(g)
	Absent
FR-TRM-016
	The system shall compute the difference between the Cost of Completion and the Adjusted Original Contract Price, deduct forfeiture of the advance…
	M
	SK008 §7.8.3(a),(b), §7.7.2(h)
	Absent
FR-TRM-017
	The system shall record blacklisting of a terminated contractor for five (5) years on a first offence and permanently, until further notice, on a…
	M
	SK008 §7.9(a),(b)
	Absent
FR-TRM-018
	The system shall refer unpaid claims to the Legal Advisor for legal action where the contractor fails to pay despite reminders.
	S
	SK008 §7.7.2(h)
	Absent
FR-CMP-001
	The system shall determine whether the Defects Liability Period applies from the contract type, and shall bypass the whole defects chain for annual…
	M
	SK009 §7.1.3
	Absent
FR-CMP-002
	The system shall support sectional completion, defined at tender stage with a separate liquidated damages value stated for each section, and shall…
	M
	SK009 §7.3.1, §7.3.2
	Absent
FR-CMP-003
	The system shall support partial occupation, requiring the contractor's written agreement as a precondition, and shall generate the Certificate of…
	M
	SK009 §7.4.1, §7.4.2(a)–(d)
	Absent
FR-CMP-004
	The system shall determine practical completion on the test of whether the works have reached a stage at which they fulfil their construction…
	M
	SK009 §7.2.1
	Absent
FR-CMP-005
	The system shall require a joint inspection before the Certificate of Practical Completion is issued, and shall implement the failure loop in which…
	M
	SK009 §7.2.2(a),(c)
	Absent
FR-CMP-006
	The system shall generate the Certificate of Practical Completion (CPD/CPC(T)), and the information-technology variant (CPD/CPC(T-IT)) where…
	M
	SK009 §7.2.2(b); forms 3a, 3b
	Absent
FR-CMP-007
	The system shall attach a list of outstanding and defective work to the Certificate of Practical Completion and shall record the period set for the…
	M
	SK009 §7.2.4
	Absent
FR-CMP-008
	The system shall start the Defects Liability Period clock from the practical completion date stated in the certificate, and shall start a separate…
	M
	SK009 §7.1.2, §7.2.4, §7.8
	Absent
FR-CMP-009
	The system shall distribute the Certificate of Practical Completion with the original to the contractor and copies to the S.O.'s Representative, the…
	M
	SK009 §7.2.3; form 3a printed s.k:
	Absent
FR-CMP-010
	The system shall record handover of the works to the Implementing Department by joint inspection after the Certificate of Practical Completion,…
	M
	SK009 §7.5.1, §7.5.2(a),(b),(c)
	Absent
FR-CMP-011
	The system shall accept defect reports from the Implementing Department during the defects liability period, requiring immediate reporting to the…
	M
	SK009 §7.7.1, §7.7.2(a),(b)
	Absent
FR-CMP-012
	The system shall support an expedited rectification class for any defect that causes the work to be easily damaged, that will worsen if not rectified…
	S
	SK009 §7.7.2(b)
	Absent
FR-CMP-013
	The system shall schedule a joint inspection on the defects liability period expiry date, shall generate a Schedule of Defects (Jadual Kecacatan)…
	M
	SK009 §7.7.2(c)(i),(iii),(iv),(v)
	Absent
FR-CMP-014
	Where the contractor fails to rectify within the time given, the system shall support immediate rectification by other means and shall record…
	M
	SK009 §7.7.2(d)
	Absent
FR-CMP-015
	The system shall generate the Certificate of Making Good Defects (CPD/CMGD(T)) recording the making-good clause, the scope choice, the date defects…
	M
	SK009 §7.7.2(c)(ii),(vi); form 5
	Absent
FR-CMP-016
	The system shall treat issue of the Certificate of Making Good Defects as the end of the contractor's obligations under the contract, and shall…
	M
	SK009 §7.7.3, §7.7.4
	Absent
FR-CMP-017
	The system shall maintain the Design Guarantee Bond on design-and-build contracts at 5% (or as stated in the contract) of the value of the design…
	M
	SK009 §7.8
	Absent
FR-CMP-018
	The system shall require a final defects inspection, recorded on the joint inspection application and joint inspection checklist forms, as a…
	M
	OM/P/007 §8.26
	Absent
FR-NSC-001
	The system shall record Prime Cost Sums in the main contract Bills of Quantities for work to be executed by a sub-contract, or materials and goods to…
	M
	SK010 §7.1.1
	Absent
FR-NSC-002
	The system shall record, at tender-document preparation stage, whether the direct-payment mechanism applies, requiring amendments to the Ranhill SAJ…
	M
	SK010 §7.9.3(a)
	Absent
FR-NSC-003
	The system shall assemble the nominated sub-contract tender and table documents in the prescribed order, including the Letter of Nomination, the…
	M
	SK010 §7.2.2, §7.2.3
	Absent
FR-NSC-004
	The system shall permit quotations to be invited for a nominated package valued at less than RM300,000.00, but shall require the same documents and…
	M
	SK010 §7.3.1, §7.3.2
	Absent
FR-NSC-005
	The system shall record, where the main contractor is permitted to tender for the nominated package, that the contractor is not entitled to profit…
	M
	SK010 §7.4.1, §7.4.2
	Absent
FR-NSC-006
	The system shall require both Tender Board approval and confirmation of sufficiency of funds before the Letter of Nomination is issued.
	M
	SK010 §7.5.2
	Absent
FR-NSC-007
	The system shall issue the Letter of Nomination directing the contractor to accept the sub-contractor's or supplier's tender, and shall…
	M
	SK010 §7.5.1, §7.5.2, §7.9.3(b)
	Absent
FR-NSC-008
	The system shall run a fourteen (14) day objection window from the date the contractor receives the Letter of Nomination, and where the…
	M
	SK010 §7.5.3(a),(b)
	Absent
FR-NSC-009
	The system shall record execution of the Sub-Contract Document between the contractor and the nominated party, with stamp duty borne by the nominated…
	M
	SK010 §7.6.1, §7.6.3
	Absent
FR-NSC-010
	The system shall record the nominated party's Performance Bond at 5% of the sub-contract price, or of the total value of the materials or goods to be…
	M
	SK010 §7.6.2
	Absent
FR-NSC-011
	The system shall record the Official Order to Commence Work for a nominated sub-contract, running the completion period from the date the order is…
	M
	SK010 §7.7.2, §7.7.3
	Absent
FR-NSC-012
	The system shall record that the contractor remains fully responsible for the nominated parties as if they were its own, and that on a nominated…
	S
	SK010 §7.8.1, §7.8.2
	Absent
FR-NSC-013
	The system shall determine the payment route from the direct-payment flag: where direct payment applies, amounts due to nominated parties are…
	M
	SK010 §7.9.1, §7.9.2, §7.9.3(c)
	Absent
FR-NSC-014
	The system shall support protective direct payment where the contractor has failed to pay a nominated party, deducting from monies due to the…
	M
	SK010 §7.9.1
	Absent
FR-NSC-015
	The system shall support the three contractor set-off categories: category one, an amount already deducted by the Superintending Officer from payment…
	M
	SK010 §7.9.3(d)(i),(ii),(iii)
	Absent
FR-NSC-016
	For a category three set-off the system shall run a twenty-eight (28) day objection window from the nominated party's receipt of the contractor's…
	M
	SK010 §7.9.3(d)(iii),(iv)
	Absent
FR-NSC-017
	The system shall carry nominated sub-contractor and nominated supplier values through the completion, defects, making good defects and final…
	M
	SK010 flowchart; SK014
	Absent
FR-FIN-001
	The system shall verify, before the final certificate can be prepared, that the contractor has discharged all obligations including making good…
	M
	SK014
	Absent
FR-FIN-002
	The system shall accept the contractor's final claim where the contract stipulates one, and shall track the three-month window after the Certificate…
	S
	SK014; OM/P/010 §8.17; OM/P/007 §8.27–8.28
	Absent
FR-FIN-003
	The system shall compute the Final Contract Sum (Harga Muktamad Kontrak) as the original contract sum plus the net adjustment from all Certificates…
	M
	SK014; form 9a
	Absent
FR-FIN-004
	The system shall require the Head of Accounts & Finance to confirm the total of payments already made before the final certificate can be approved.
	M
	SK014
	Absent
FR-FIN-005
	The system shall compute the less-block as retention money already released split between main contractor, nominated sub-contractors and nominated…
	M
	SK014; form 9a page 1
	Absent
FR-FIN-006
	The system shall compute the deduct-block as liquidated damages net of any waived amount with the waiver letter reference and a rounding adjustment;…
	M
	SK014; form 9a page 2
	Absent
FR-FIN-007
	The system shall block final payment until either a statutory declaration or a certificate signed by the Director-General of Labour has been…
	M
	SK014; forms 9b, 9a B147
	Absent
FR-FIN-008
	The system shall assemble the final account attachment pack comprising the Certificate of Non-Completion, the Certificate of Making Good Defects, the…
	M
	CPD/INT-SFA-INDEN(i),(ii)
	Absent
FR-FIN-009
	The system shall capture the contractor's acceptance of the final account together with a witness signature, recording the contractor's declaration…
	M
	SK014; form 9a page 2
	Absent
FR-FIN-010
	The system shall route approval of final payment and release of performance guarantee sums to the CEO, Functional Director or Head of Division,…
	M
	DAL §3.1.4.4 item 17; §3.1.4.3 item 12
	Absent
FR-FIN-011
	The system shall apply the final payment waterfall to the main contractor, sub-contractors, suppliers and assignees, stating each separately, and…
	M
	SK014; form 9a page 3
	Absent
FR-FIN-012
	The system shall release the retention money and the performance guarantee sums on final payment, notifying the guarantor, and shall reconcile the…
	M
	SK009 §7.7.4; DAL §3.1.4.4 item 17; §3.1.4.3 item 12; OM/P/007 §8.26
	Absent
FR-FIN-013
	The system shall generate the Final Certificate (CPD/SFA(T)) with the Document Tracking Form, signed in the printed order of Recommending Officer,…
	M
	SK014; form 9a
	Absent
FR-FIN-014
	The system shall close the contract record on completion of final payment, release of securities and filing of the contractor performance report, and…
	M
	[ASSUMPTION]; SK004 §7.8
	Absent
FR-CRT-001
	The system shall maintain a Form Template register holding, for every instrument, its form code, revision date, page count, language variants, field…
	M
	FORMS inventory; every form control block
	Absent
FR-CRT-002
	The system shall generate every certificate from live data with no manual re-keying of any value that exists elsewhere in the system.
	M
	FORMS inventory
	Partial (2 of ~30)
FR-CRT-003
	The system shall compute every calculated field defined in Section 8 and shall not permit a computed field to be overridden without a recorded…
	M
	FORMS inventory §1, §7, §9a, §12
	Absent
FR-CRT-004
	The system shall enforce the printed signature order on every certificate, and shall not permit a later signature to be applied before an earlier one.
	M
	FORMS Section B1
	Absent
FR-CRT-005
	The system shall set the date of a certificate as the date of the authorising signature, derived rather than keyed, on every instrument where the…
	M
	SK012 §7.2.4(d), §7.2.5(b); SK013; SK006 §7.5.5; SK007 §7.3.2; SK004 §7.5.1
	Absent
FR-CRT-006
	The system shall execute the distribution list for every certificate, generating the addressed copies, recording despatch method and date per…
	M
	SK006 §7.8.1; SK007 §7.5.1; SK009 §7.2.3, §7.7.3; SK012 §7.2.5(c); SK013
	Absent
FR-CRT-007
	The system shall implement a single generic Document Approval Routing entity with a routing-type attribute and a child approval-step table, covering…
	M
	FORMS §11
	Absent
FR-CRT-008
	The system shall record on every routing sheet the DATE (1) start and DATE (2) end of the internal cycle-time clock, shall compute elapsed time, and…
	M
	FORMS §11
	Absent
FR-CRT-009
	The system shall support the resubmission column on every routing sheet, recording each resubmission as a distinct iteration with its own dates and…
	M
	FORMS §11
	Absent
FR-CRT-010
	The system shall correct the known typographical errors in the printed forms when generating them, while preserving the form code and revision…
	S
	FORMS Section B7 item 8
	Absent
FR-CRT-011
	The system shall normalise the terminology variants recorded in Appendix D and shall present one canonical term per concept while retaining aliases…
	S
	FORMS Section B7; MODEL §9 C28
	Absent
FR-CRT-012
	The system shall build the templates that the SOPs mandate but which do not exist in the forms library: the Notice of Termination, the Supplementary…
	M
	SK008 §7.2.2(a); SK006 §7.5.1; SK009 §7.7.2(c)(iii); SK010; SK014
	Absent
FR-VND-001
	The system shall provide vendor self-registration capturing registered name, SSM or Registrar of Businesses number, entity type, country, Bumiputera…
	M
	[NET-NEW]; eligibility content SK001 7.3.4(a)
	Full
FR-VND-002
	The system shall capture the statutory document set with an expiry date per document: SSM certificate; PKK; STB; MOF registration certificate with…
	M
	SK001 7.3.4(a); prototype vendor schema
	Full
FR-VND-003
	The system shall capture CIDB grade, category and specialisation against the published CIDB list, and MOF field codes (kod bidang) against the…
	M
	SK001 7.3.4(a)
	Full
FR-VND-004
	The system shall state explicitly to the vendor that lodged documents are not automatically validated and are subject to manual officer verification,…
	M
	[NET-NEW]
	Full
FR-VND-005
	The system shall capture the E-Payment and Creditor's Profile: beneficiary name, address, identity-card or registration number, contact, telephone,…
	M
	RSAJ E-Payment form
	Full
FR-VND-006
	The system shall require a false-declaration and blacklisting acknowledgement at submission.
	M
	[NET-NEW]
	Full
FR-VND-007
	The system shall route a vendor application to an officer review queue supporting the outcomes Approve, Request Resubmission and Reject, with…
	M
	[NET-NEW]
	Full
FR-VND-008
	The system shall monitor document expiry, issuing reminders at 90, 60, 30 and 7 days before expiry, presenting severity bands of Expired, Critical at…
	M
	[NET-NEW]
	Full
FR-VND-009
	The system shall check licence and registration validity as a continuous window from the tender advertisement date through to the tender closing…
	M
	SK001 7.3.4(a)(i)
	Partial
FR-VND-010
	The system shall support suspension and reinstatement of a vendor, recording the reason from a maintained list including certificate expiry, poor…
	M
	[NET-NEW]; SK002 7.5.1(c) requires the suspension check
	Full
FR-VND-011
	The system shall present each vendor with the exercises for which it is eligible, showing a per-exercise eligibility check against the required…
	S
	[NET-NEW]
	Full
FR-VND-012
	The system shall allow a vendor to purchase tender documents online, subject to the pre-sale checks at FR-ADV-010, and shall release the document…
	M
	[NET-NEW]; SK002 7.5
	Partial
FR-VND-013
	The system shall allow a vendor to register attendance at the briefing and site visit, to acknowledge addenda, to prepare and submit a sealed bid,…
	M
	[NET-NEW]
	Partial
FR-VND-014
	The system shall provide a vendor announcements and bulletin facility with pinned items categorised as Important, Policy or Notice.
	C
	[NET-NEW]
	Full
FR-CPR-001
	The system shall implement the seven contractor performance report categories: CPD/SA-F01 Works, F02 Design and Build, F03 Suppliers Assessment and…
	M
	FORMS §12, §C1
	Absent
FR-CPR-002
	The system shall score each criterion on a scale of one to five and shall compute the weighted score as the raw score divided by five, multiplied by…
	M
	FORMS §12
	Absent
FR-CPR-003
	The system shall grade the total using half-open intervals: 0 to below 40 is E, 40 to below 50 is D, 50 to below 60 is C, 60 to below 80 is B, and 80…
	M
	FORMS §12
	Absent
FR-CPR-004
	The system shall implement the conditional weight split on the IT category, where two criteria share a single weight of 0.15 joined by "DAN / ATAU":…
	M
	FORMS §12 AF67, AF70
	Absent
FR-CPR-005
	The system shall support the four assessment stages: ongoing project where the contract period exceeds one year; completed project at practical…
	M
	FORMS §12; SK005 §7.4.2(f); SK009 §7.5.3, §7.7.5; SK014
	Absent
FR-CPR-006
	The system shall capture two signatories on every report in printed order: the Assessor or Person in Charge under "Dicadangkan oleh", and the…
	M
	FORMS §12 signature blocks
	Absent
FR-CPR-007
	The system shall compute the liquidated damages block on the performance report as a daily rate of 0.025% of the Original Contract Sum, and total…
	M
	FORMS §12 S36 = P30*0.025%, R38 = N36*S36
	Absent
FR-CPR-008
	The system shall maintain a contractor performance register from which the evaluation module draws the Contractor Performance Report percentage as a…
	M
	SK003 7.2.2(d); quotation template Fasa 2, Lampiran D
	Absent
FR-RPT-001
	The system shall provide a case dashboard per exercise and per contract showing the current stage, the outstanding approval step and its holder, the…
	M
	CPD/DFA/* ICC columns
	Partial
FR-RPT-002
	The system shall provide a procurement pipeline view by stage, by value band, by regime, by sourcing method, by funding source, by contract type and…
	S
	[ASSUMPTION]
	Partial
FR-RPT-003
	The system shall provide an approvals dashboard showing pending steps by approver, by matter type and by age, with overdue steps highlighted and…
	M
	FR-APR-018
	Partial
FR-RPT-004
	The system shall provide a contract-financials view per contract showing the original contract sum, cumulative approved variations in value and…
	M
	SK011; SK013; SK014
	Absent
FR-RPT-005
	The system shall provide a securities and insurance expiry report covering performance bonds, advance payment guarantees, design guarantee bonds and…
	M
	SK004 §7.3.3; SK009 §7.8
	Absent
FR-RPT-006
	The system shall provide a Project In Delay report listing every contract below 70% of programme or past its completion date, with progress, elapsed…
	M
	SK005 §7.4.2(d)
	Absent
FR-RPT-007
	The system shall provide a variation exposure report covering variations in the Commenced Pending Approval state, with estimated value, age and the…
	M
	SK012 §7.2.2(c)
	Absent
FR-RPT-008
	The system shall provide a vendor report covering registration status, document currency, suspension and blacklist status, performance grades and…
	S
	[NET-NEW]
	Partial
FR-RPT-009
	The system shall provide a committee report covering meetings held, matters tabled, decisions taken, quorum achieved and individual voting records,…
	M
	SK003 7.6; DAL
	Absent
FR-RPT-010
	The system shall provide an audit extract producing, for any case, the complete chronological record of every action, approval, document version,…
	M
	Evidentiary integrity; SPAN audit exposure
	Partial (display only)
FR-RPT-011
	The system shall provide a compliance exception report covering overdue approvals, expired securities, missing statutory documents, exercises…
	M
	SK002 7.4.2; FR-CRT-003
	Absent
FR-RPT-012
	The system shall provide spend and savings analytics covering spend by category, by vendor, by department and by method; cost saving against the…
	C
	[ASSUMPTION]
	Partial
A.1 Totals
Measure
	Count
Total functional requirements
	381
Priority Must (M)
	340
Priority Should (S)
	39
Priority Could (C)
	2
Priority Won't (W)
	0
Prototype coverage — Full
	21
Prototype coverage — Partial
	47
Prototype coverage — Absent
	313
The heavy weighting towards Must reflects the source material: the DAL is Board-approved and the Operation Manuals are mandatory procedures, so most requirements implement an obligation rather than an option. Delivery is sequenced by Section 13, not by the priority column.
Non-functional requirements (Section 10) are additional to these totals and are not assessed against the prototype, which has no persistence, no audit trail, no classification model and no internationalisation layer.
Appendix B — DAL configuration tables (reproduced verbatim)
Reproduced from RANHILLSAJ-DAL, Issue A, Revision 00, Issue Date 11 June 2021, the Fifth Revision, superseding the Fourth Revision of 1 January 2011. Prepared by the Director of Finance & Administration on 23 May 2021, recommended by the CEO on 23 May 2021, approved by the Board of Directors on 11 June 2021. Forty-three pages, entirely in English. Every figure below is quoted exactly as printed; none has been rounded, converted or paraphrased.
B.1 Authority code vocabulary
Code
	Meaning
A
	Authority to APPROVE
R
	Authority to RECOMMEND
P
	Authority to PROPOSE
JP
	Authority to JOINTLY PROPOSE
JR
	Authority to JOINTLY RECOMMEND
MA
	Mandatory APPROVAL — cannot be delegated
MR
	Mandatory RECOMMENDATION — cannot be delegated
MJR
	Mandatory JOINT RECOMMENDATION — cannot be delegated
K / M
	Thousands / Millions
Authority groups, in matrix column order: SH (Shareholders) · BOD (Board of Directors) · CM (Chairman) · TBC (Tender Board Committee) · CEO · FD (Functional Director) · Head of Division · Head of Department. Other bodies referenced in remarks: QC (Quotation Committee), VOC (Variation Orders Committee), Quotation Opening Committee, Tender Opening Committee, CP (Contract & Procurement), AD (Administration Division), DoFA (Director of Finance & Administration), DoN (Director of Network), FIN, F&A, HR, QA, FM, CMD, CS, N&NRW.
B.2 Core routing rule — §2.2.1, p.13
Approval always carries the full chain beneath it. Which level holds the "A" determines how many upstream steps exist.
Where the approving authority sits
	Head of Dept
	Head of Div
	Functional Director
	CEO
Head of Department
	Approve
Head of Division
	Recommend
	Approve
Functional Director
	Propose
	Recommend
	Approve
Chief Executive Officer
	Propose
	Propose / Jointly Propose
	Recommend
	Approve
B.3 §3.1.4.1 Requisition — Approval of Requisition (p.19)
Cost band
	Approves
	Chain below
More than RM300K
	CEO
	MR by FD, R by Head of Div, P by Head of Dept
More than RM50K and up to RM300K
	FD
	R Head of Div, P Head of Dept
More than RM500 and up to RM50K
	Head of Division
	R Head of Dept
Up to RM500
	Head of Department
	—
RM500 confirmed at zoom as five hundred ringgit, not RM500K.
B.4 §3.1.4.2 item 1 — Approval of Appointment: DIRECT PURCHASE (Proprietary and Emergency), for supply of goods and equipment, works and services, consultancy and advisory (p.20)
Cost band
	Approves
	Notes
More than RM5M
	BOD
	TBC = MR; JR/R Head of Div (*by AD), P Head of Dept
More than RM3M and up to RM5M
	Chairman
	TBC = MR
More than RM300K and up to RM3M
	TBC
More than RM15K and up to RM300K
	CEO
	MR by QC (Quotation Committee)
More than RM5K and up to RM15K
	FD
More than RM500 and up to RM5K
	Head of Division
Up to RM500
	Head of Department
B.5 §3.1.4.2 item 2 — OPEN AND SELECTIVE (with or without Schedule of Rates or Goods), goods and equipment, works and services, consultancy and advisory (p.21)
Cost band
	Approves
	Notes
More than RM300K
	TBC
	No BOD or CM row exists for open tender at any value.
More than RM15K and up to RM300K
	CEO
	MR by QC
More than RM5K and up to RM15K
	FD
Up to RM5K
	Head of Division
Item 3 — Rental, Leasing and Hire Purchase (per approved budget): CEO approves, R by DoFA.
B.6 §3.1.4.3 CONTRACT ADMINISTRATION FOR QUOTATION — contracts more than RM15K and up to RM300K (pp.22–23)
#
	Item
	Approves
	Notes
1
	Invitation to Quote
	Head of Dept (*by CP)
2
	Quotation Opening / Schedule of Quotation
	Quotation Opening Committee
3
	Quotation Negotiation
	Head of Dept (*by CP)
4
	Approval of Name for Direct / Selective Quotation
	FD
	R Head of Div, JR/P Head of Dept (by CP)
5a
	VO (additions), expansion of provisional sum, re-measurement — more than 50% of contract value
	CEO
	MR by VOC
5b
	— more than 20% and up to 50%
	FD
	MR by VOC
5c
	— up to 20%
	Head of Division
6
	Delay and EOT, LAD / Penalty, Suspension of Works
	Head of Division as Superintending Officer / Project Director
	JR/R by CP
7
	Waiver on LAD / Penalty
	CEO
	Flat — no percentage split at this band
8
	Termination and Arbitration / Litigation
	CEO
	MR FD, R Head of Div, JR/P by CP
9
	Extension of Contract Period for Term Contracts
	FD
	MR by QC
10
	Certificate of Making Good Defects
	Head of Division
	JR/R by CP
11
	Deed of Assignment and Factoring
	Head of Division (*by FIN)
	R by CP
12
	Approval of Interim Payment, Final Payment and Release of Retention Sums
	Head of Division
	JR/R by CP
13
	Condition of Quotation and changes thereto
	FD
14
	Issue of Purchase Orders (term contracts, goods, others)
	Head of Dept (*by CP)
15
	Issue / Signing of Indent for Works or Services
	Head of Dept (*by CP)
B.7 §3.1.4.4 CONTRACT ADMINISTRATION FOR TENDER — contracts more than RM300K (pp.24–28)
#
	Item
	Band
	Approves
	Notes
1
	Invitation to Tender
	—
	Head of Dept (*by CP)
2
	Tender Opening / Schedule of Tender
	—
	Tender Opening Committee
3
	Tender Negotiation
	—
	Head of Dept (*by CP)
4
	Approval of Name for Direct / Selective Tender
	—
	CEO
	R FD, JR Head of Div, MR/P by CP
5a
	Signing of Letter of Acceptance / Contract Document
	Contract value > RM3M
	CEO as SO / Project Director
	R by CP
5b
	"
	> RM1M and ≤ RM3M
	FD as SO/PD
	R by CP
5c
	"
	> RM300K and ≤ RM1M
	Head of Division as SO/PD
	R by CP
6
	Condition of Contract / change in terms
	—
	CEO or FD or Head of Div, whichever acts as SO/PD
	JR/R by CP
7a(i)
	VO (additions) + expansion of provisional sum — contract > RM3M
	VO > 30% of contract value
	TBC
	MR by VOC
7a(ii)
	"
	VO ≤ 30%
	CEO
	MR by VOC
7b(i)
	contract > RM1M–RM3M
	VO > 30%
	TBC
	MR by VOC
7b(ii)
	"
	VO > 10% and ≤ 30%
	CEO
	MR by VOC
7b(iii)
	"
	VO ≤ 10%
	FD
	MR by VOC
7c(i)
	contract > RM300K–RM1M
	VO > 15%
	TBC
	MR by VOC
7c(ii)
	"
	VO > 10% and ≤ 15%
	CEO
	MR by VOC
7c(iii)
	"
	VO > 5% and ≤ 10%
	FD
	MR by VOC
7c(iv)
	"
	VO ≤ 5%
	Head of Division
	MR by VOC
8a
	Re-measurement of Provisional Quantities
	> 30% of contract value
	TBC
	R Head of Div, JR/P by CP
8b
	"
	≤ 30%
	CEO or FD or Head of Div as SO/PD
	JR/R by CP
9
	Extension of Contract Period for Term Contract
	—
	TBC
	JR/R by CP
10a(i)
	Delay and Extension of Time — with financial impact, NOT due to authority requirement
	—
	TBC
	MR by VOC
10a(ii)
	with financial impact, due to authority requirement
	—
	CEO
	MR by VOC
10b
	no financial impact
	—
	CEO or FD or Head of Div as SO/PD
	MR by VOC
11
	LAD / Penalty, Practical Completion, Non-Completion, Making Good Defect, Suspension of Works
	—
	CEO or FD or Head of Div as SO/PD
	JR/R by CP
12a
	Waiver on LAD / Penalty
	> 30% of the LAD / penalty amount
	TBC
12b
	"
	≤ 30% of the LAD / penalty amount
	CEO
13
	Termination and Arbitration / Litigation
	—
	CEO
	R Head of Div, JR/P by CP
14
	Deeds of Assignment and Factoring
	—
	Head of Division (*by FIN)
	R by CP
15
	Advance Payment
	—
	CEO
	R Head of Div, JR/P by CP — no value band
16a
	Approval of Interim Payment
	value > RM500K
	CEO
16b
	"
	> RM100K and ≤ RM500K
	FD
16c
	"
	≤ RM100K
	Head of Division
17
	Approval of Final Payment and Release of Performance Guarantee Sums
	—
	CEO or FD or Head of Div as SO/PD
	JR/R by CP
B.8 Other bands that touch procurement
Item
	Bands
	Page
CAPEX cost exceeding approved budget / additional budget
	BOD approves, MR by CEO
	p.17
Budget transfer for CAPEX between Division or Department
	CEO
	p.17
OPEX additional budget
	BOD, MR by CEO
	p.36
OPEX budget transfer
	CEO
	p.36
Write-off or disposal of fixed assets by Net Book Value
	> RM2M → BOD; > RM300K–RM2M → Chairman; > RM50K–RM300K → CEO; ≤ RM50K → FD
	p.18
Revaluation of fixed assets
	> RM3M → BOD; > RM1M–RM3M → CEO; ≤ RM1M → FD
	p.17
Ex-gratia
	> RM2M → BOD; > RM10K–RM2M → Chairman; ≤ RM10K → CEO
	p.31
Out of Court / Conciliation Settlement
	CEO — no monetary band at all (unlimited)
	p.41
Panel workshop vehicle repair and maintenance
	> RM5K → CEO; > RM3K–RM5K → FD; > RM1.5K–RM3K → Head of Div; ≤ RM1.5K → Head of Dept
	p.40
B.9 Application rules (§§1.2, 1.4, 1.5, 1.6 and the specimen letter at p.42)
The DAL sets maximum limits only, and must be applied together with the Company Policy and Procedures and staff terms and conditions.
Authority must be exercised in accordance with the Water Service Industry Act 2006. For Government-funded projects, Government guidelines and directives SUPERSEDE the DAL where they differ.
The DAL applies at Company level only; cross-reference the Ranhill Utilities Berhad Authority Manual for policy and strategic matters.
If a matter requires shareholder approval by law, the Board's "approve" downgrades to "recommend" and final approval sits with the shareholders.
No one may approve their own expenses or allocations. CEO to Chairman; other Board members to Chairman; FD to CEO; Head of Division to FD; Head of Department to Head of Division.
Absence of a clear approving authority — escalate to the immediate superior of the approving authority.
Conflict of interest — recuse and escalate one level up.
Delegation must be in writing, time- or task-specific, only to line subordinates, with no sub-delegation, and granted by the jobholder's superior rather than by the jobholder. MA, MR and MJR items are never delegable.
Absence rule: authority does not pass down automatically — it reverts upward to the delegator, who may re-delegate only on the absent holder's recommendation. Authority Manual Section 3 prevails over any delegation letter.
No anti-splitting rule exists anywhere in the DAL. No minimum-number-of-quotations table exists. No explicit "approval must precede commitment" clause exists. All three are gaps in the source.
Composition and quorum of the TBC, QC, VOC, Tender Opening Committee and Quotation Opening Committee are not stated anywhere in the DAL.
B.10 Committee mandate as stated in the DAL
Tender Board Committee (p.12) — established by the Board of Directors "to approve Tenders, Extension of the Contract Period for term contracts, Delay and Extension of Times and Variation of Works."
Board of Directors reserves: strategic and corporate plans; annual budgets including major capital commitments; material acquisitions and disposals; and changes to the management and control structure including the delegated authority limits themselves.
Appendix C — Certificate and form inventory with generation requirements
Ordered by position in the process. "Gen." states the generation requirement: G the system generates the document from live data; G+C the system generates it and computes fields within it; R the system records the instrument, which is produced externally; B the template must be built because it does not exist in the forms library.
C.1 Pre-award instruments
Form code
	Name (English / Malay)
	Trigger
	Signatures in printed order
	Distribution
	Gen.
PEN/LRA/06-01 (example)
	Requisition Form / Borang Permohonan
	Operational need identified
	Requesting officer → Section Head → Ketua Jabatan
	C&P by memo
	R (ERP)
(no code)
	Expenditure Request Form (the RF of SK001 6.2)
	Requisition registered in the ERP
	DAL Recommender 1, 2, 3 → DAL Approval
	Internal
	R (ERP)
CPD/DFA/SSP
	Specification Setting Panel
	Draft specification ready
	Three verification columns — originating department, Quality Assurance, Contract & Procurement — up to six signatories
	Attached to the pre-tender pack
	G
CPD/DFA/PRE T-QUO
	Document for Approval — Pre Tender / Quotation
	Project-to-C&P handover
	Specification Setting Panel → Department HOD (DATE 1) → Head of C&P (checked) → Head of C&P (approval for tendering) → Head of Section → Head of C&P (for committee) → CEO for quotation → C&P (DATE 2)
	User department record
	G
(no code)
	Notice of Offer / Kenyataan Tawaran, or Letter of Invitation to Tender / Surat Pelawaan Menender
	Approval for Tendering
	Head of C&P
	Newspaper, K&P notice board, RSAJ website — or addressed letters for a selected tender
	G
(no code)
	Tender Document (12 constituent parts) and Tender Table Document / Dokumen Meja Tender
	Document preparation complete
	n/a
	Sold to purchasers; one copy displayed at the tender table throughout the tender period
	G
(no code)
	Corrigendum / Addendum
	Change during the invitation window
	Signed by the authorised officer
	Every recorded purchaser
	G — net-new, no SOP procedure exists
CPD/J.TAWARAN-02 Rev. 01.07.2024
	Schedule of Offers / Jadual Tawaran
	Tender box opened on the closing day
	Both Opening Committee members sign; each bid numbered and initialled
	Evaluation pack; Lampiran C of the evaluation report
	G+C
CPD/G.SUMMARY-01
	Grand Summary
	Opening committee decision recorded
	Opening Committee
	Evaluation pack
	G+C
(no code)
	Evaluation Report / Laporan Penilaian — also called laporan dan pengesyoran tender and Kertas Kerja
	Evaluation complete
	Not stated in the SOP
	Tender Board through the Secretariat
	G — one object with annexes A–F; the SOP prescribes no format
(no code)
	Committee proposal paper / Kertas Cadangan
	Report complete
	Checked by Head of Section; recommended by Head of C&P
	Committee chairman and members
	G
(no code)
	Letter of Acceptance of Tender / Surat Setujuterima Tender
	Tender Board approval obtained
	Signatory resolved by DAL band: CEO above RM3M, FD above RM1M–RM3M, Head of Division above RM300K–RM1M
	Implementing Department, Accounts & Finance, CIDB, LHDN, and SPAN for water-services contracts; by registered post or counter collection
	G
(no code)
	Bidder's Declaration / Surat Akuan Pembida + Surat Pewakilan Kuasa
	Bid submission (Integrity Pact Stage One)
	Tenderer's authorised representative
	Bound into the tender document
	G
(no code)
	Successful Bidder's Declaration / Surat Akuan Pembida Berjaya + Surat Pewakilan Kuasa
	Return of the Letter of Acceptance (Integrity Pact Stage Two)
	Successful tenderer's authorised representative
	Attached to and returned with the LoA
	G
IN<YYYY><NNNNN>
	Work Indent / Inden Kerja
	Quotation-route award
	Head of Dept (by C&P)
	Contractor; user department
	R (ERP) + G for the covering memo
(6 variants)
	Appointment Notification / Pemberitahuan Perlantikan
	Indent issued
	Ketua Jabatan; contractor acceptance page with witness, Atas Sifat, Cop Kontraktor, IC number, occupation, address
	Contractor; C&P; user department
	G
C.2 Post-award certificates
Form code
	Name (English / Malay)
	Trigger
	Signatures in printed order
	Distribution
	Gen.
(Appendix A/1, B/1)
	Letter of Delegation of Authority / Surat Perwakilan Kuasa
	S.O. delegates supervision
	Superintending Officer
	S.O.'s Representative
	G
(Appendix A/2, B/2)
	Notification of Delegation of Authority / Pemberitahuan Perwakilan Kuasa
	Simultaneous with the above
	Superintending Officer
	Contractor
	G
CPD/VO-660(T)
	Application to Implement Variation Order / Permohonan Untuk Melaksanakan Perubahan Kerja
	Variation need identified
	1 Applicant · 2 Disokong Oleh · 3 Pegawai Penguasa (DISOKONG / TIDAK DISOKONG with value cap)
	None printed
	G+C
CPD/VO-661(T)
	Variation schedule — per-variation detail
	Per-variation detail required
	Applicant in the header; no approver block on the form
	None printed
	G+C
CPD/VO-662(T)
	Application to Approve Agreed Rates / Increase VO Value
	Agreed rates needed, or the approved cap exceeded
	Applicant; no approver block
	None printed
	G+C
CPD/VO-661&662(T)
	Combined application — a pure union of the two above
	Both needed
	Applicant; no approver block
	None printed
	G+C
CPD/VO(CONSENT)-PAAB
	Consent on Application for Variation Order — PAAB (the only fully English post-award certificate)
	PAAB-funded asset
	1 Applicant · 2 Head of Department · 3 the 9-member VO Committee, AGREE / DISAGREE with comments
	None printed
	G+C
CPD/APP(T)
	S.O.'s / Project Director's Instruction / Arahan Pegawai Penguasa
	Variation approval obtained, or exemption
	Pegawai Penguasa. Date = date of signature.
	Contractor returns all signed copies except one
	G
CPD/VO-663(T)
	Certificate of Variation of Works / Perakuan Perubahan Kerja (TAMBAHAN / POTONGAN)
	Variation measured and valued
	1 Pegawai Pengesyor · 2 Pegawai Penguasa · 3 Contractor + Witness
	Original to contractor; copies to Wakil P.P., Head of C&P, Head of Accounts & Finance, and the bank or insurer guaranteeing the contract
	G+C
CPD/PPJHK(T)
	Certificate of Adjustment of Contract Sum / Perakuan Pelarasan Jumlah Harga Kontrak (4 pages)
	Any of the five adjustment triggers
	1 Pegawai Pengesyor · 2 S.O. · 3 Contractor + Witness
	SOP: contractor, Wakil P.P., C&P, Accounts & Finance and the guarantor. The form prints only two recipients — build the SOP list.
	G+C — the live workbook has zero formulas
CPD/B.INT(T)
	Certificate of Interim Payment / Perakuan Bayaran Interim (2 pages) + Borang Pengesanan
	Monthly valuation date, or contractor claim
	1 Juruukur Bahan / Pegawai Pengesyor · 2 Pegawai yang Diberikuasa untuk Memperakukan
	None printed. SK011 §7.2.7: to Accounts & Finance, copy to the Implementing Department
	G+C — references Lampiran A1, A2, A3, which are missing
(no code)
	Advance Payment Guarantee / Gerenti Wang Pendahuluan
	Advance payment approved
	Bank or insurance company
	Securities register
	R
CPD/EOT(T)
	Certificate of Delay and Extension of Time / Perakuan Kelambatan dan Lanjutan Masa
	Contractor's written notice of delay
	1 Pegawai Pengesyor · 2 Pegawai Penguasa (signing officer determined by the DAL)
	Original to contractor; copies to Wakil P.P., C&P and the guarantor
	G+C
(no template)
	Supplementary Agreement for Extension of Contract Period / Perjanjian Tambahan
	Term-contract extension approved
	Bilateral — Ranhill SAJ and the contractor
	Not separately specified
	B — must be built
(LAMPIRAN A)
	Warning of Intention to Impose LAD / Surat Amaran Gantirugi
	Completion late with no EOT entitlement
	Pegawai Penguasa
	Contractor, by registered post
	G — starts a 7-day response clock
CPD/CNC(T)
	Certificate of Non-Completion / Perakuan Kerja Tidak Siap
	Warning issued and response considered
	1 Pegawai Pengesyor · 2 Pegawai Penguasa (sole approver, no committee)
	Original to contractor; copies to Wakil P.P. and C&P. No guarantor copy, unlike every other certificate — a process weakness.
	G+C
(Word)
	Notice of Intention to Terminate / Notis Untuk Tujuan Penamatan
	Contractor default, first occurrence
	Pegawai Penguasa. Termination clause Fasal 51 or 53.
	Wakil P.P., Head of C&P, Head of Accounts & Finance, the bank or insurer, and Pusat Khidmat Kontraktor; by registered post
	G — starts the 14-day remedy clock
(no template)
	Notice of Termination / Notis Penamatan Pengambilan Kerja Kontraktor
	Default unremedied, or repeat default
	Pegawai Penguasa must sign; the DAL reserves approval to the CEO
	As above
	B — must be built
CPD/PMKD(T)
	Final Certificate for a Terminated Contract / Perakuan Muktamad Kontrak Yang Ditamatkan
	Award of the new contract, not completion of the works
	1 Pegawai Kontrak / Pengesyor · 2 Pegawai Penguasa
	None printed; demand letter by registered post within 9 months
	G+C — the only form with budget-coding fields; zero formulas in the workbook
CPD/CPO
	Certificate of Partial Occupation / Perakuan Pendudukan Separa (the only certificate with no (T) suffix)
	Occupation of a completed part with the contractor's written agreement
	1 Pegawai Pengesyor · 2 Pegawai Penguasa
	None printed
	G+C — must issue within 7 days
CPD/CPC(T)
	Certificate of Practical Completion / Perakuan Siap Kerja
	Joint inspection confirms practical completion
	1 Pegawai Pengesyor · 2 Pegawai Penguasa
	Wakil P.P., Head of C&P, Head of Accounts & Finance, the guarantor
	G — starts the DLP and the 5-year Design Guarantee Bond clock
CPD/CPC(T-IT) Rev. 01.07.2025
	Certificate of Practical Completion — Software, Hardware and Licence
	IT contract practical completion
	As above
	Identical four-line list
	G — DLP runs concurrently with the maintenance period by default
(no code, no template)
	Schedule of Defects / Jadual Kecacatan
	Defects found at the end-of-DLP joint inspection
	Pegawai Penguasa
	Contractor
	B — must be built. Starts the 3-month rectification clock
CPD/CMGD(T)
	Certificate of Making Good Defects / Perakuan Siap Memperbaiki Kecacatan
	Joint inspection confirms all defects rectified
	1 Pegawai Pengesyor · 2 Pegawai Penguasa
	Identical four-line list
	G — ends the contractor's obligations; releases bond, guarantee sum and retention
(no code)
	Design Guarantee Bond / Bon Jaminan Rekabentuk
	Design-and-build contract
	Bank or insurer
	Securities register
	R — released only 5 years after practical completion
(Word)
	Statutory Declaration — Closing of Contract Account / Surat Akuan Sumpah, or a Director-General of Labour certificate
	Before final payment
	Declarant, attested by a Commissioner for Oaths or the President of the Sessions Court under the Statutory Declarations Act 1960
	Attached to the final account
	G — blocking gate on final payment
CPD/SFA(T)
	Final Certificate / Statement of Final Account / Perakuan Muktamad (3 pages) + Borang Pengesanan Dokumen
	All obligations discharged and loss and expense valued
	1 Pegawai Pengesyor · 2 Contractor + Witness with the no-further-claims declaration · 3 Pegawai Penguasa
	None printed and none in the SOP — a gap
	G+C — the live total formula is broken; rebuild it
CPD/SA-F01 to F07, each (B) and (E), with guides SA-G01–G07
	Contractor Performance Report / Laporan Prestasi Kontraktor
	Four stages: ongoing project, practical completion, end of DLP, and final account or making good defects
	1 Penilai / Person in Charge (Dicadangkan oleh) · 2 Penyelia / Ketua Seksyen / Ketua Jabatan / S.O. (Disahkan oleh)
	Contract & Procurement
	G+C — feeds evaluation Fasa 2
CPD/DFA/* (9 sheets)
	Document Tracking / Document for Approval forms
	Each certificate submission
	Prepared by → Checked by → Verified by → Recommended by → Approved by
	Per sheet
	G — one generic entity, not nine
(missing)
	Lampiran A1 Nominated Sub-Contractors · A2 Nominated Suppliers · A3 Approved Assignees
	Every certificate with nominated parties
	—
	—
	Blocking data gap — referenced by column number, at least 10 columns each
(no codes)
	SK010 letter set: Surat Penamaan, Surat Pemberitahuan Penamaan, Surat Jaminan Tanggung Rugi, Perintah Rasmi, and the supply order and schedule pair
	Nomination and commencement
	P.P. for the nomination letters; contractor for the orders
	All other parties involved in the contract
	B — must be built
C.3 Cross-cutting generation requirements
Every form carries a printed control block of No. Borang (form code), Tarikh Pindaan (revision date — 08.05.2025 for all except the IT practical completion variant at 01.07.2025) and Muka Surat (page n of m). These are template metadata and belong on a Form Template reference table, not as per-record columns.
All forms are bilingual, with a Malay line and an English line beneath. Store one label pair per field.
No form in the library has any data-validation dropdown. Every pick-list is printed text with a strike-out instruction, typically "potong jika tidak berkenaan". These must become choice fields whose unselected options are suppressed on the printed output.
Recurring financial sub-patterns to build as reusable complex types: the LAD block (rate, unit, from, to, days, amount, waived amount, waiver letter reference); the rounding adjustment (Pelarasan Pengenapan, signed); the addition-or-omission pair with its direction choice; the three-way retention split; the advance-payment recovery pair; the nominated-party trio; the signature block (role, signature, full name, designation, date, and chop for contractor blocks only); and the approval routing step.
Two live workbook defects must not be ported: the broken total-final-payment formula, and the contractor-performance grade bands that leave gaps at the boundaries so that a score of exactly 39.995% grades A.
Appendix D — Glossary
Malay terms are given with their English equivalent. Where the corpus uses more than one term for one concept, the variants are listed and the canonical form is marked.
Term
	Meaning
Anggaran Syarikat
	Company estimate. Prepared by one officer only, ready at least one week before the submission date, in exactly two copies — one lodged before closing and one retained SULIT — and never altered to suit tendered prices.
Arahan Pegawai Penguasa (APP)
	Superintending Officer's Instruction. Form CPD/APP(T). Instructs a variation; its date is the date of signature.
Bon Pelaksanaan / Bon Perlaksanaan
	Performance Bond. Two spellings appear in the corpus.
Bon Jaminan Rekabentuk (DGB)
	Design Guarantee Bond. 5% of the design work value, released five years after practical completion.
Borang Pengesanan (Dokumen)
	Document Tracking Form. The routing wrapper accompanying a certificate.
Borang Sebutharga
	Quotation Form. The quotation-route equivalent of the Form of Tender.
Borang Tender
	Form of Tender. The only valid instrument by which a tenderer may make an offer (SK001 7.3.4(c)).
Bumiputera
	Malaysian indigenous status. Where a tender is restricted, both document sets are stamped TENDER UNTUK BUMIPUTERA SAHAJA and the certificate is verified at sale.
CIDB / LPIPM
	Construction Industry Development Board Malaysia / Lembaga Pembangunan Industri Pembinaan Malaysia. Registers contractors by grade, category and specialisation. A mandatory recipient of the Letter of Acceptance.
CMGD
	Certificate of Making Good Defects. Form CPD/CMGD(T). Marks the end of the contractor's obligations and releases the bond, guarantee sum and retention.
CNC
	Certificate of Non-Completion. Form CPD/CNC(T). A mandatory precondition to imposing liquidated damages.
CPC
	Certificate of Practical Completion / Perakuan Siap Kerja. Starts the Defects Liability Period.
CPO
	Certificate of Partial Occupation / Perakuan Pendudukan Separa. Must issue within seven days of occupation.
CPR
	Contractor Performance Report / Laporan Prestasi Kontraktor. Seven category variants CPD/SA-F01 to F07.
DAL
	Discretionary Authority Limits. RANHILLSAJ-DAL, Issue A Revision 00, 11 June 2021, the Fifth Revision, approved by the Board of Directors. The authoritative source of every monetary approval threshold.
Deraan
	Oppression. The qualitative limit on LAD accumulation — LAD must not be allowed to accumulate over so long a period that it becomes an oppression.
DLP
	Defects Liability Period. Tempoh Liabiliti Kecacatan (SK009, canonical) or Tempoh Tanggungan Kecacatan (SK010 and the CPC form).
Dokumen Meja Tender
	Tender Table Document. One complete copy displayed at the tender table at the K&P Department throughout the tender period.
Fasal / Klausa
	Clause. Fasal is used in Word letters and on the final account; Klausa on the Excel certificates. One concept, two terms.
Ganti Rugi Tertentu dan Ditetapkan (GRTD)
	Liquidated and Ascertained Damages (LAD). The only documented rate in the corpus is 0.025% of the original contract sum per day.
Hasil
	Revenue. Document-sale fees received at the payment counter must be kept as hasil.
IFS
	"Intergrated Financial System" (sic), named in OM/P/002 §8.3 as the system in which projects are registered. Unresolved against the Oracle evidence.
Inden Kerja
	Work Indent, IN<YYYY><NNNNN>. The quotation-route award instrument, valid 14 days from receipt.
Integrity Pact
	A three-stage anti-corruption undertaking: the Bidder's Declaration at submission, the Successful Bidder's Declaration on return of the Letter of Acceptance, and a briefing at signing.
Jabatan Kontrak & Perolehan (K&P / C&P / CPD)
	The Contract & Procurement Department, split into a Pre-Contract Section and a Post-Contract Section.
Jadual Kadar Harga
	Schedule of Rates. Required for valuing variation works on Drawings-and-Specification contracts.
Jadual Kecacatan
	Schedule of Defects. Issued at the end-of-DLP inspection; starts a maximum three-month rectification clock. No template exists.
Jadual Tawaran
	Schedule of Offers. Form CPD/J.TAWARAN-02. It is the register of tenders received — there is no separate register.
Jawatankuasa Pembuka Tender
	Tender Opening Committee. Two appointed Ranhill SAJ Executive officers. Also printed as Jawatankuasa Pembukaan Tender.
Jawatankuasa Sebutharga (QC)
	Quotation Committee. Gives a mandatory, non-delegable recommendation on appointments above RM15,000 and up to RM300,000.
Jawatankuasa Perubahan Kerja (VOC)
	Variation Orders Committee. Also appears as Jawatankuasa Arahan Perubahan Kerja, Jawatankuasa Perubahan Kerja / Lanjutan Masa and Jawatankuasa Kelambatan & Lanjutan Masa. One body, five names.
Jawatankuasa Teknikal (TC)
	Technical Committee. Decides Stage 1 technical evaluation for Design & Build and Turnkey tenders.
Jawatankuasa Tuntutan
	Claims Committee. Approves loss and expense claims on Service contracts. Appears in KP003 5.11.5 and nowhere else in the corpus.
Kadar harga yang dipersetujui
	Agreed rate. A rate not found in the contract, requiring separate DAL approval.
Kertas Cadangan
	Committee proposal paper.
Kertas Kerja
	Working paper. One of three names SK003 gives the evaluation output.
KKDW
	The federal ministry funding rural water supply. Under this route KKDW appoints both the consulting engineer and the contractor; Ranhill SAJ does not procure.
Kod Bidang
	MOF field code. Determines what a supplier or service provider may be invited to bid for.
KPE
	Ketua Pegawai Eksekutif — Chief Executive Officer.
Lantikan Terus
	Direct appointment. Reference series RSAJ/KP/ST/NN/YY. No SOP describes it; it exists only in the DAL and in practice.
LHDN
	Lembaga Hasil Dalam Negeri — the Inland Revenue Board. Stamps contracts and is a mandatory recipient of the Letter of Acceptance.
MOF / KKM
	Kementerian Kewangan Malaysia — the Ministry of Finance. Registers suppliers and service providers by field code.
NM number
	Nota Minta — the secondary requisition reference NM/YYYY/NNNNN, which resets annually.
PAAB
	Pengurusan Aset Air Berhad. The national water asset company. Under the PAAB CAPEX route PAAB decides the procurement route, issues the Project Execution Letter, may issue the appointment letter, consents to variations affecting its assets, and is the paymaster for minor works.
Peguam / Penasihat Undang-undang
	Legal Advisor. Referred to on bond dishonour and unpaid claims.
Pegawai Penguasa (P.P.)
	Superintending Officer, also Project Director. A role, not a post — resolved by contract value.
Pegawai Pengesyor
	Recommending Officer. Always the first signatory on a certificate. Also printed as Juruukur Bahan / Pegawai Pengesyor and Pegawai Kontrak/Pengesyor.
Pemberitahuan Perlantikan
	Appointment notification letter, issued on the quotation route after the Indent.
Penentu Kerja
	Work specification.
Perakuan Bayaran Interim
	Certificate of Interim Payment. Form CPD/B.INT(T).
Perakuan Muktamad
	Final Certificate / Statement of Final Account. Form CPD/SFA(T).
Perakuan Pelarasan Jumlah Harga Kontrak (PPJHK)
	Certificate of Adjustment of Contract Sum. The master record of contract-sum movement.
Perakuan Perubahan Kerja
	Certificate of Variation of Works. Form CPD/VO-663(T). The code appears nowhere in the SOP corpus.
PERKESO / SOCSO
	The Social Security Organisation. Employees earning more than RM1,000.00 per month are not PERKESO-eligible and must be covered by Workmen's Compensation insurance.
Perjanjian Tambahan
	Supplementary Agreement, used to extend the term of an annual contract. A bilateral instrument. No template exists.
Peti Tender
	Tender box. Opened on the closing day by the Opening Committee, who take the key.
PROC number
	The ERP requisition number PROC<YYYY><NNNNNN>, an Oracle document identifier. The primary business key of the whole process. The counter is global and does not reset annually.
Pusat Khidmat Kontraktor
	Contractor Service Centre. Custodian of the contractor registry and the blacklist; a mandatory recipient of termination notices.
Ringkasan Tender
	Summary of Tender. Used with a Schedule of Rates on Drawings-and-Specification contracts in place of a Bill of Quantities.
RF
	Expenditure Request Form. The trigger for the Pre-Contract Section's process; in practice the ERP-registered PROC requisition.
Sebut Harga / Sebutharga
	Quotation. The regime above RM15,000 and up to RM300,000.
Senarai Kuantiti
	Bill of Quantities.
SPAN
	Suruhanjaya Perkhidmatan Air Negara — the National Water Services Commission. Issues IPA permits under section 50 of the Water Services Industry Act 2006, audited Ranhill SAJ in October 2025, and is a mandatory recipient of the Letter of Acceptance for water-services contracts.
SPKK
	Sijil Perolehan Kerja Kerajaan — Government Works Procurement Certificate.
SSM
	Suruhanjaya Syarikat Malaysia — the Companies Commission of Malaysia.
SULIT
	Confidential. Applied by the corpus to selected-tender information, the department estimate submitted with the RF, the retained company estimate, and all evaluation and tender-certification information.
Surat Akuan Pembida
	Bidder's Declaration — Integrity Pact Stage One.
Surat Akuan Pembida Berjaya
	Successful Bidder's Declaration — Integrity Pact Stage Two.
Surat Akuan Tidak Disenaraihitam
	Declaration of not being blacklisted.
Surat Pewakilan Kuasa
	Letter of Authorisation, attached by the representative signing a declaration.
Surat Setujuterima Tender
	Letter of Acceptance of Tender. A contract document, not merely an award notice (SK001 7.3.4(e)).
Suruhanjaya Tenaga (ST)
	The Energy Commission. Registers electrical contractors by class.
Tempoh Siap Kerja
	Work completion period.
Tender Terbuka / Tender Terpilih
	Open tender / Selected tender. Open is the default; selected requires a ten-item proposal and CEO approval.
TOR
	Terms of Reference. Cited by SK003 as the governing instrument, with the DAL, for Tender Board membership and for the officers empowered to sign the Letter of Acceptance. Not in the corpus.
Wakil P.P.
	S.O.'s Representative. Three types: Utama (Principal), Pakar (Specialist) and Pakar — Juruukur Bahan (Specialist Quantity Surveyor). No sub-delegation is permitted.
Wang Kos Prima
	Prime Cost Sum. The funding mechanism for nominated sub-contractors and suppliers.
Wang Peruntukan Sementara
	Provisional Sum.
Wang Tahanan
	Retention money. The percentage and cap are defined nowhere in the corpus.
Wang Jaminan Pelaksanaan (WJP)
	Performance Guarantee Sum — the cash alternative to a bank guarantee. Also printed Wang Jaminan Perlaksana.
