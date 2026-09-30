# reference-data — prototype specification

Extracted from the rendered prototype by the column-mapping workflow.
Customer material: this directory is gitignored and must never be committed.

## extract

```json
{
  "section": "Configuration · Reference data (page title verbatim: \"Configuration · Reference data\"; sub: \"The lists every other screen picks from.\")",
  "tabs": [
    "CIDB grades",
    "MOF codes",
    "Work categories",
    "Units",
    "Currencies",
    "Document categories",
    "Delay reasons",
    "Variation reasons",
    "Contract defaults"
  ],
  "tables": [
    {
      "heading": "CIDB grades  —  card__sub: \"The largest single contract each grade may hold.\"  (tab 1 of 9, the default rendered state)",
      "columns": [
        {
          "header": "Grade",
          "cellContent": "badge — <span class=\"badge badge--brand\"><span class=\"badge__t\">…</span></span>. Verbatim: \"G1\", \"G7\". All 7 rows are G1..G7."
        },
        {
          "header": "Name",
          "cellContent": "plain text, bare text node in the td (no wrapper span). Verbatim: \"Grade G1\", \"Grade G4\"."
        },
        {
          "header": "Contract ceiling",
          "cellContent": "number — th class is \"num is-sortable\", cell is <td class=\"num\"><span class=\"num\">…</span></td>. Verbatim: \"RM 200K\". HETEROGENEOUS: the G7 row swaps the number for a badge — <span class=\"badge badge--info\"><span class=\"badge__t\">No limit</span></span>, verbatim \"No limit\"."
        },
        {
          "header": "Category",
          "cellContent": "plain text in mono/dim styling — <span class=\"mono sm dim\">…</span>. Verbatim: \"CE, B, ME\" — identical on all 7 rows (there is no second distinct value in this column)."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\" title=\"Active\"><span class=\"dot dot--ok\"></span><span class=\"badge__t\">Active</span></span>. Verbatim: \"Active\" on all 7 rows."
        },
        {
          "header": "Actions",
          "cellContent": "th has NO class and its label is visually hidden: <span class=\"sr-only\">Actions</span>. Cell is <div class=\"rowactions\"> holding exactly one <button class=\"iconbtn iconbtn--sm\" aria-label=\"Edit\" title=\"Edit\"> with an inline svg. Identical on all 8 tables."
        }
      ]
    },
    {
      "heading": "MOF field codes  —  card__sub: \"What a supplier is registered to supply.\"  (NOTE: card heading is \"MOF field codes\", the tab label is \"MOF codes\")",
      "columns": [
        {
          "header": "Field code",
          "cellContent": "plain text in mono styling — <span class=\"mono strong\">…</span>. Verbatim: \"010101\", \"221501\"."
        },
        {
          "header": "Description",
          "cellContent": "plain text wrapped in <span class=\"trunc\" title=\"…\"> (title attribute duplicates the text). Verbatim: \"Stationery and office supplies\", \"Engineering consultancy services\"."
        },
        {
          "header": "Head",
          "cellContent": "badge, plain variant — <span class=\"badge\"><span class=\"badge__t\">…</span></span>, no modifier class, no icon. Verbatim: \"01\", \"22\"."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\"><span class=\"dot dot--ok\"></span>…</span>. Verbatim: \"Active\" on all 12 rows."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header (<span class=\"sr-only\">Actions</span>, th has no class); cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\"."
        }
      ]
    },
    {
      "heading": "Work categories  —  card__sub: \"How a requirement is classified when it is raised.\"",
      "columns": [
        {
          "header": "Code",
          "cellContent": "plain text in mono styling — <span class=\"mono strong\">…</span>. Verbatim: \"BLDG\", \"SCADA\"."
        },
        {
          "header": "Name",
          "cellContent": "plain text, bare text node in the td. Verbatim: \"Building and civil works\", \"SCADA, telemetry and instrumentation\"."
        },
        {
          "header": "Category",
          "cellContent": "plain text in mono/dim styling — <span class=\"mono sm dim\">…</span>. Verbatim: \"CE21\", and for rows with no value an em dash \"—\" (still inside the same mono sm dim span, NOT a separate dim/empty treatment). 3 of 12 rows are \"—\"."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\"><span class=\"dot dot--ok\"></span>…</span>. Verbatim: \"Active\" on all 12 rows."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header; cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\"."
        }
      ]
    },
    {
      "heading": "Units of measure  —  card__sub: \"Used in bills of quantities and on every claim.\"  (NOTE: card heading is \"Units of measure\", the tab label is \"Units\")",
      "columns": [
        {
          "header": "Code",
          "cellContent": "chip — but a DIFFERENT chip class from the Status column: <span class=\"cfg-chip\">…</span>, a single span with no inner badge__t and no dot. Verbatim: \"day\", \"m3\"."
        },
        {
          "header": "Name",
          "cellContent": "plain text, bare text node in the td. Verbatim: \"Day\", \"Cubic metre\"."
        },
        {
          "header": "Measures",
          "cellContent": "badge, plain variant — <span class=\"badge\"><span class=\"badge__t\">…</span></span>, no modifier, no icon. Verbatim: \"Time\", \"Lump sum\". Full value set across 14 rows: Time, Count, Mass, Volume, Length, Area, Lump sum."
        },
        {
          "header": "Decimal places",
          "cellContent": "number — th class is \"num is-sortable\", BUT the cell is a bare text node with no <span class=\"num\"> wrapper (unlike Contract ceiling and Rate to MYR). Verbatim: \"0\", \"3\"."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\"><span class=\"dot dot--ok\"></span>…</span>. Verbatim: \"Active\" on all 14 rows."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header; cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\"."
        }
      ]
    },
    {
      "heading": "Currencies  —  card__sub: \"Foreign amounts are converted to ringgit at these rates.\"",
      "columns": [
        {
          "header": "Currencies",
          "cellContent": "VERBATIM HEADER — this column is headed \"Currencies\" (duplicating the card heading), not \"Code\" as on every sibling tab. This is the prototype's own text, not a transcription slip. Cell is plain text in mono styling — <span class=\"mono strong\">…</span>. Verbatim: \"EUR\", \"MYR\"."
        },
        {
          "header": "Name",
          "cellContent": "plain text, bare text node in the td. Verbatim: \"Euro\", \"Malaysian ringgit\"."
        },
        {
          "header": "Symbol",
          "cellContent": "plain text, bare text node in the td (raw glyph, no wrapper, no mono class). Verbatim: \"€\", \"S$\"."
        },
        {
          "header": "Rate to MYR",
          "cellContent": "number — th class is \"num is-sortable\", cell is <span class=\"num\">…</span>. Verbatim: \"4.8,100\" (yes, with a comma — see summary; deterministic prototype formatting, not a capture artifact) and \"0.0,290\". HETEROGENEOUS: the base-currency row (MYR) swaps the number for a badge — <span class=\"badge badge--brand\"><span class=\"badge__t\">Base currency</span></span>, verbatim \"Base currency\"."
        },
        {
          "header": "Status",
          "cellContent": "chip. Active: <span class=\"chip chip--ok\" title=\"Active\"><span class=\"dot dot--ok\"></span><span class=\"badge__t\">Active</span></span> → \"Active\". Inactive (CNY only, and only visible under the \"All records\" saved view): BARE classes — <span class=\"chip\" title=\"Inactive\"><span class=\"dot\"></span><span class=\"badge__t\">Inactive</span></span> → \"Inactive\". This is the only Inactive row anywhere on the screen."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header; cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\"."
        }
      ]
    },
    {
      "heading": "Document categories  —  card__sub: \"How the document library is grouped.\"",
      "columns": [
        {
          "header": "Code",
          "cellContent": "plain text in mono styling — <span class=\"mono\">…</span>. NOTE: plain \"mono\", WITHOUT the \"strong\" modifier used on the other code columns. Verbatim: \"commercial\", \"statutory\"."
        },
        {
          "header": "Name",
          "cellContent": "plain text, bare text node in the td. Verbatim: \"Commercial\", \"Statutory\"."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\"><span class=\"dot dot--ok\"></span>…</span>. Verbatim: \"Active\" on all 8 rows."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header; cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\". This is the narrowest table — only 4 columns."
        }
      ]
    },
    {
      "heading": "Delay reasons  —  card__sub: \"Whether a delay earns time, money, both or neither.\"",
      "columns": [
        {
          "header": "Code",
          "cellContent": "plain text in mono styling — <span class=\"mono strong\">…</span>. Verbatim: \"ACCESS\", \"WEATHER\"."
        },
        {
          "header": "Description",
          "cellContent": "plain text, bare text node in the td. Verbatim: \"Access restricted by the authority\", \"Contractor's own default\" (that apostrophe is ASCII U+0027 — see summary)."
        },
        {
          "header": "Time",
          "cellContent": "badge, two variants. Verbatim: \"Time may be granted\" as <span class=\"badge badge--ok\"> WITH a leading inline <svg> icon; and \"Contractor’s risk\" as <span class=\"badge badge--err\"> with NO icon (apostrophe here is curly U+2019). Every one of the 11 rows carries a badge; there is no empty state in this column."
        },
        {
          "header": "Cost",
          "cellContent": "badge or em dash. Verbatim: \"Cost recoverable\" as <span class=\"badge badge--info\"> WITH a leading inline <svg> icon (3 of 11 rows: POSSESSION, UTILITY, VARIATION); otherwise \"—\" as <span class=\"dim\">—</span> — a plain dim span, NOT a badge."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\"><span class=\"dot dot--ok\"></span>…</span>. Verbatim: \"Active\" on all 11 rows."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header; cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\"."
        }
      ]
    },
    {
      "heading": "Variation reasons  —  card__sub: \"Why the scope of a contract changed.\"",
      "columns": [
        {
          "header": "Code",
          "cellContent": "plain text in mono styling — <span class=\"mono strong\">…</span>. Verbatim: \"BQERROR\", \"SUBST\"."
        },
        {
          "header": "Description",
          "cellContent": "plain text, bare text node in the td. Verbatim: \"Error in the bills of quantities\", \"Material substitution\"."
        },
        {
          "header": "Usual effect",
          "cellContent": "badge, two variants, both present on every row. Verbatim: \"Usually adds value\" as <span class=\"badge badge--warn\"> WITH a leading inline <svg> icon (6 of 10 rows); and \"Usually neutral\" as bare <span class=\"badge\"> with NO modifier and NO icon (4 of 10 rows). No third variant appears — there is no \"usually reduces value\"."
        },
        {
          "header": "Status",
          "cellContent": "chip — <span class=\"chip chip--ok\"><span class=\"dot dot--ok\"></span>…</span>. Verbatim: \"Active\" on all 10 rows."
        },
        {
          "header": "Actions",
          "cellContent": "sr-only header; cell is <div class=\"rowactions\"> with one iconbtn iconbtn--sm, aria-label=\"Edit\"."
        }
      ]
    }
  ],
  "controls": [
    "PAGE HEAD: NO buttons at all. .pagehead__top contains only .pagehead__titles (h1 + .pagehead__sub + .pagehead__meta). Do not add an action button here.",
    "TABBAR: sits in its OWN card, above the content card — div.card > div.card__body.card__body--flush.card__body--tight > div.tabbar.tabbar--flush[role=tablist] > button.tab[role=tab][aria-selected]. 9 buttons; tab 0 (\"CIDB grades\") is aria-selected=true by default.",
    "CARD HEAD BUTTON (8 list tabs): \"New entry\" — <button class=\"btn btn--primary btn--sm\"> with a leading inline svg. Same label on all eight list tabs.",
    "CARD HEAD BUTTON (Contract defaults tab only): \"Restore defaults\" — <button class=\"btn btn--sm\"> with a leading inline svg. NOT btn--primary.",
    "SAVED-VIEWS SELECT (.dl__bar first child): <select class=\"select select--sm\" aria-label=\"Saved views\" style=\"width:auto;min-width:150px;font-weight:600\">. Exactly two options: \"Active\" (value=active, default) and \"All records\" (value=all). This is the only filter dropdown on the screen.",
    "SEARCH: <div class=\"searchinput\" style=\"flex:0 1 260px\"> with a leading svg and <input class=\"input input--sm\" type=\"search\">, placeholder AND aria-label both \"Search this list\".",
    "SPACER: <div class=\"spacer\"></div> between the search input and .dl__tools.",
    "DL TOOLS (.dl__tools, right of the spacer): (1) <div class=\"segmented\" role=\"group\" aria-label=\"Row density\"> with two icon-only buttons.segmented__b, title=\"Comfortable rows\" (aria-pressed=true) and title=\"Compact rows\" (aria-pressed=false); (2) icon-only <button class=\"iconbtn iconbtn--bordered\" aria-label=\"Columns\" title=\"Columns\" aria-expanded=\"false\"> wrapped in a relative-positioned span; (3) icon-only <button class=\"iconbtn iconbtn--bordered\" aria-label=\"Export to CSV\" title=\"Export to CSV\">.",
    "DL FOOT (.dl__foot): <span class=\"num\">Showing 1–7 of 7</span> (en dash U+2013), then a spacer, then a <label class=\"row\"> reading \"Rows\" (<span class=\"xs dim nowrap\">) with a <select class=\"select select--sm\" style=\"width:68px\"> of \"10\" / \"25\" / \"50\", then <nav class=\"pager\" aria-label=\"Pagination\"> with icon-only Previous (disabled), a \"1\" button (aria-current=true), and icon-only Next (disabled).",
    "ROW ACTION: every row of every table ends in <div class=\"rowactions\"> containing exactly one <button class=\"iconbtn iconbtn--sm\" aria-label=\"Edit\" title=\"Edit\">. Rows themselves carry data-clickable=\"true\" tabindex=\"0\".",
    "TABLE STRUCTURE: table.table inside div.tablewrap.dl__scroll, all inside div.dl.card--flat, which sits in div.card__body.card__body--flush. Every th except Actions carries class \"is-sortable\" and contains a <span class=\"th__i\"> sort indicator; numeric th's add \"num\".",
    "CONTRACT DEFAULTS TAB has NO .dl__bar at all — no saved-views select, no search input, no density/columns/CSV tools, no .dl__foot, no pager, no table."
  ],
  "pageHeadMeta": [
    "8 lists",
    "81 entries"
  ],
  "summary": "VERIFICATION: re-rendered with `PROTOTYPE=RSAJ-Tender-Portal.html node scripts/render-prototype.mjs out cmp-reference-data \"Configuration\" \"Reference data\"`. Both clicks reported \"hit\", page title \"Configuration · Reference data\", errors none. Every one of the 9 tabs was then clicked BY INDEX (not by text, which would mis-hit on \"Units\"/\"Currencies\") and asserted against `.cfg-main .tab[aria-selected=\"true\"]` before dumping; all 9 asserted clean. Dumps live at C:\\Users\\MohamadHaikalHarizbi\\projects\\perolehan\\out\\rendered-cmp-reference-data.html and the per-tab extractions at C:\\Users\\MOHAMA~1\\AppData\\Local\\Temp\\claude\\c--Users-MohamadHaikalHarizbi-projects-perolehan\\f67e78cd-3012-4998-83e6-e0a848139a83\\scratchpad\\{reference-data-tabs.json,allrows.txt}. Helper scripts (gitignored) at out\\alltabs.mjs, out\\allrows.mjs, out\\allrecords.mjs.\n\n9 TABS BUT ONLY 8 TABLES. The 9th tab, \"Contract defaults\", has NO table (`.cfg-main table` count is 0) and no DataList chrome. I have deliberately NOT emitted a `tables` entry for it. Its card body is a stack of `div.cfg-set` rows, each `div.cfg-set__l` (with `span.cfg-set__t` label + `span.cfg-set__h` hint) beside `div.cfg-set__c` (the control). Eight settings, verbatim label / hint / control / default: (1) \"Retention rate\" / \"Withheld from each interim certificate.\" / number input min0 max20 step1 in `span.inputwrap.inputwrap--post` with `inputwrap__post` suffix \"%\" / 10. (2) \"Retention cap\" / \"Retention stops accruing once it reaches this share of the contract sum.\" / same, suffix \"%\" / 5. (3) \"Materials on site\" / \"Share of the value of unfixed materials that may be certified.\" / min0 max100, suffix \"%\" / 75. (4) \"Delay damages basis\" / \"Where the daily rate for late completion comes from.\" / `select.select.select--sm` with options \"Rate written into the contract\" (value=contract) and \"Calculated from the contract sum\" (value=formula). (5) \"Daily rate\" / \"Applied to the contract sum when the calculated basis is used.\" / min0 max1 step0.001, wrapper adds `cfg-suf cfg-suf--wide`, suffix \"% a day\" / 0.025. (6) \"Delay damages cap\" / \"Maximum damages as a share of the contract sum.\" / min0 max100, suffix \"%\" / 10. (7) \"Defects liability period\" / \"Default length, from practical completion.\" / min1 max60, wrapper adds `cfg-suf`, suffix \"months\" / 12. (8) \"Defect rectification target\" / \"Days a contractor has to close a recorded defect.\" / min1 max180, `cfg-suf`, suffix \"days\" / 30. Inputs are `input.input.input--num.input--sm[type=number][inputmode=decimal]`.\n\nTHE COUNTS RECONCILE, but only under \"All records\". Per-tab `of N` in the DEFAULT (\"Active\") view: CIDB grades 7, MOF codes 12, Work categories 12, Units 14, Currencies 6, Document categories 8, Delay reasons 11, Variation reasons 10 = 80. Under \"All records\" Currencies becomes 7 (the inactive CNY row appears) and the total is exactly 81 — matching `.pagehead__meta`. So \"8 lists\" counts the eight table tabs (Contract defaults is not a list) and \"81 entries\" is the all-records total, not the default-view total. The default rendered screen shows 7 rows for CIDB grades (\"Showing 1–7 of 7\"); no tab paginates.\n\n\"4.8,100\" IS REAL, NOT A CAPTURE BUG. Do not \"fix\" it when transcribing my report — but do note it is a prototype defect. Seed data has EUR rate 4.81 and JPY rate 0.029; rendered output is \"4.8,100\" and \"0.0,290\". The mechanism is a thousands-grouping regex (`\\B(?=(\\d{3})+(?!\\d))`) applied to the already-decimalised string \"4.8100\"/\"0.0290\", which inserts a comma before the trailing 3-digit run. It is deterministic and locale-independent, so it reproduces identically — but a rebuild should format rates properly rather than copy this.\n\nCURRENCIES COLUMN 0 IS HEADED \"Currencies\", NOT \"Code\". Every sibling tab heads its first column \"Code\" (or \"Field code\"/\"Grade\"). Currencies duplicates the card heading. I quoted it verbatim; it is the prototype's own text, not a slip on my part. Flagging because a rebuilder will otherwise silently \"correct\" it to \"Code\".\n\nICON PRESENCE INSIDE BADGES IS ASYMMETRIC and is real markup: `badge--ok` (\"Time may be granted\"), `badge--info` (\"Cost recoverable\") and `badge--warn` (\"Usually adds value\") each carry a leading inline `<svg>`; `badge--err` (\"Contractor’s risk\") and the bare `badge` variants (\"Usually neutral\", the MOF \"Head\" codes, the Units \"Measures\" kinds) carry NO icon. Do not add an icon to every badge.\n\nAPOSTROPHES ARE MIXED WITHIN THE DELAY REASONS TAB: the Description cell reads \"Contractor's own default\" with ASCII U+0027, while the Time badge reads \"Contractor’s risk\" with curly U+2019. Both quoted exactly as rendered.\n\nSTATUS CHIP HAS TWO CLASS SHAPES: Active is `chip chip--ok` + `dot dot--ok`; Inactive is bare `chip` + bare `dot`. Both carry a `title` attribute matching the label. Only one Inactive row exists on the entire screen (CNY, Currencies tab) and it is hidden in the default \"Active\" view.\n\nTWO DIFFERENT \"CHIP\" IDIOMS COEXIST: the Units Code column uses `span.cfg-chip` (a bare single span), which is structurally unrelated to the `span.chip.chip--ok > span.dot + span.badge__t` used by every Status column. Don't collapse them.\n\nCARD HEADING ≠ TAB LABEL on two tabs: tab \"MOF codes\" → card heading \"MOF field codes\"; tab \"Units\" → card heading \"Units of measure\". The other seven match.\n\nThe prototype is bilingual (en/ms dictionaries keyed `rf.*`); everything above is the `en` rendering.\n\nMINOR, one clause as flagged: raw configuration codes reach the screen throughout (`mono strong` code columns on six of eight tables, plus \"CE, B, ME\" and \"CE21\" in Category columns), which sits against AGENTS.md rule 5 \"codes never reach a screen\". That is a pervasive property of the prototype rather than a finding — noting it only so the rebuild makes a deliberate choice."
}
```

## map

```json
{
  "key": "reference-data",
  "verdict": "NEEDS_NEW_MODEL",
  "columnMapping": "Every column on all 8 tables plus all 8 contract-default settings is NEW. Nothing on this screen is served by an existing model; the schema and the prototype are disjoint here.\n\nTAB 1 — CIDB grades (card heading \"CIDB grades\", sub \"The largest single contract each grade may hold.\"), 7 rows\n- Grade (badge--brand) → NEW ContractorGrade.code (\"G1\"..\"G7\")\n- Name → NEW ContractorGrade.nameEn (nameMs supplies the ms rendering)\n- Contract ceiling (num, \"RM 200K\") → NEW ContractorGrade.ceiling, Decimal(18,2) nullable. The G7 \"No limit\" badge--info is the null case, not a sentinel value.\n- Category (\"CE, B, ME\", mono sm dim) → NEW ContractorGrade.categoryCodes String[], joined \", \"\n- Status → DERIVED from NEW ContractorGrade.retiredOn (null → Active)\n- Actions → row id\n\nTAB 2 — MOF field codes (tab label \"MOF codes\"), 12 rows\n- Field code (\"010101\") → NEW SupplyFieldCode.code\n- Description (trunc + title) → NEW SupplyFieldCode.nameEn / nameMs\n- Head (bare badge, \"01\") → NEW SupplyFieldCode.headCode. STORED, never derived by slicing code.slice(0,2): a registrar's head/subfield split is its own arrangement, and deriving it hard-codes a parsing rule.\n- Status → DERIVED from SupplyFieldCode.retiredOn\n- Actions → row id\n\nTAB 3 — Work categories, 12 rows\n- Code (\"BLDG\", mono strong) → NEW WorkCategory.code\n- Name → NEW WorkCategory.nameEn / nameMs\n- Category (\"CE21\", or \"—\" on 3 of 12) → NEW WorkCategory.registrationCategoryCode String?; null renders the em dash INSIDE the same mono sm dim span\n- Status → DERIVED from WorkCategory.retiredOn\n- Actions → row id\n\nTAB 4 — Units of measure (tab label \"Units\"), 14 rows\n- Code (span.cfg-chip, \"m3\") → NEW UnitOfMeasure.code\n- Name → NEW UnitOfMeasure.nameEn / nameMs\n- Measures (bare badge: Time, Count, Mass, Volume, Length, Area, Lump sum) → NEW UnitOfMeasure.kind, enum UnitKind. The badge renders the LABEL from a map in src/lib; the enum member never reaches the screen.\n- Decimal places (num th, bare text cell) → NEW UnitOfMeasure.decimalPlaces Int\n- Status → DERIVED from UnitOfMeasure.retiredOn\n- Actions → row id\n\nTAB 5 — Currencies, 6 active / 7 all\n- Currencies [sic — the prototype heads column 0 \"Currencies\", not \"Code\"; keep it verbatim] → NEW Currency.code\n- Name → NEW Currency.nameEn / nameMs\n- Symbol (raw glyph) → NEW Currency.symbol\n- Rate to MYR (num) → NEW Currency.rateToBase Decimal(18,6). The MYR row's badge--brand \"Base currency\" is NEW Currency.isBase, not a magic rate of 1.\n- Status → DERIVED from Currency.retiredOn. CNY is the only Inactive row on the screen and the only one that exercises the bare chip/bare dot shape.\n- Actions → row id\n\nTAB 6 — Document categories, 8 rows\n- Code (\"commercial\", plain mono, no strong) → NEW DocumentCategory.code\n- Name → NEW DocumentCategory.nameEn / nameMs\n- Status → DERIVED from DocumentCategory.retiredOn\n- Actions → row id\n\nTAB 7 — Delay reasons, 11 rows\n- Code (\"WEATHER\") → NEW DelayReason.code\n- Description → NEW DelayReason.nameEn / nameMs\n- Time (\"Time may be granted\" badge--ok WITH icon / \"Contractor's risk\" badge--err, no icon) → NEW DelayReason.grantsExtensionOfTime Boolean\n- Cost (\"Cost recoverable\" badge--info WITH icon on POSSESSION/UTILITY/VARIATION, else dim em dash) → NEW DelayReason.costRecoverable Boolean\n- Status → DERIVED from DelayReason.retiredOn\n- Actions → row id\n\nTAB 8 — Variation reasons, 10 rows\n- Code (\"BQERROR\") → NEW VariationReason.code\n- Description → NEW VariationReason.nameEn / nameMs\n- Usual effect (\"Usually adds value\" badge--warn WITH icon on 6 of 10 / \"Usually neutral\" bare badge) → NEW VariationReason.usuallyAddsValue Boolean\n- Status → DERIVED from VariationReason.retiredOn\n- Actions → row id\n\nTAB 9 — Contract defaults (no table, 8 .cfg-set rows)\n- Retention rate % → NEW ContractDefaults.retentionPct\n- Retention cap % → NEW ContractDefaults.retentionCapPct\n- Materials on site % → NEW ContractDefaults.materialsOnSitePct\n- Delay damages basis (select: \"Rate written into the contract\" / \"Calculated from the contract sum\") → NEW ContractDefaults.delayDamagesBasis, enum DelayDamagesBasis\n- Daily rate \"% a day\" → NEW ContractDefaults.delayDamagesDailyPct\n- Delay damages cap % → NEW ContractDefaults.delayDamagesCapPct\n- Defects liability period \"months\" → NEW ContractDefaults.defectsLiabilityMonths\n- Defect rectification target \"days\" → NEW ContractDefaults.defectRectificationDays\n\nPAGEHEAD META — \"8 lists\" is the tab count minus Contract defaults, which is not a list. \"81 entries\" is the ALL-RECORDS total across the 8 lists (the active view totals 80; the difference is the inactive CNY row). Compute it unfiltered or you are off by one against the prototype's own arithmetic. With no data shipped ours reads \"8 lists · 0 entries\", which is correct and should be left to read that way.\n\nNEAR-MISSES CHECKED AND REJECTED\n- Work categories vs ContractType — different granularity. ContractType classifies what is being bought in a way that drives retention and defects liability downstream; the prototype's work categories are 12 utility-specific requirement classes used at the point a requirement is raised. No ContractType list appears anywhere on this screen.\n- Document categories vs DocumentClass — primary evidence, not a guess: the prototype's Configuration > Documents screen renders 19 DOCUMENT TYPES whose Category filter values are exactly design / execution / commercial / quality / tender / registration / statutory / financial, i.e. this list. DocumentCategory is therefore a new, thinner table that DocumentClass should later reference (add DocumentClass.documentCategoryCode when the Documents screen is rebuilt — note it, do not build it here).\n- Currencies vs AuthorityMatrix.currency — that is one String default, not a list, and it carries no symbol, rate or base flag. Once Currency exists, AuthorityMatrix.currency should name a configured base currency rather than defaulting to \"MYR\"; forward note only.\n- Contract defaults vs AuthorityMatrix — cited as PRECEDENT, not as a home. The prototype holds its per-section settings in one generic registry (id/section/group/kind/def/min/max); we already land the approval-matrix members of that registry (quotationFloor, tenderFloor, requisitionBoundary, boundaryInclusive, splittingWindowDays) as typed columns on AuthorityMatrix. The contract group lands the same way, on its own model.\n\nRENDER NOTES (the DataList Cell union cannot express this screen as it stands)\nCell today has stack/text/money/badge/chip/person/link. Missing, and each is real markup rather than styling preference: a status cell (span.chip.chip--ok > span.dot.dot--ok + span.badge__t, with the bare chip/bare dot shape for Inactive and a title attribute either way); badge with an optional leading inline svg and an inner span.badge__t (icons are present on badge--ok / badge--info / badge--warn and ABSENT on badge--err and every bare badge — do not add one everywhere); mono and mono strong text; mono sm dim; trunc with a duplicated title; span.cfg-chip for the Units code, which is structurally unrelated to the status chip and must not be collapsed into it; and a numeric cell that is sometimes span.num (Contract ceiling, Rate to MYR) and sometimes a bare text node (Decimal places). Rates must be formatted properly — the prototype's \"4.8,100\" and \"0.0,290\" are a thousands-separator regex applied to an already-decimalised string, i.e. a defect. Reproduce the layout, not the bug.",
  "schemaChanges": "Nine new models, two new enums, nine new back-relations on Organisation. All nine carry organisationId. All nine carry the house quartet — provenance, governingSource, notes, sortOrder — exactly as FundingRoute, SourcingMethod, ContractType, DocumentClass, Capability, Site, CostCentre, AccountCode and NumberingSeries already do; the table renders none of it, which is a screen decision, not a schema one. The eight lists use retiredOn rather than a new isActive flag: it is the house idiom, it keeps activeOn() in src/lib/reference/vocabulary.ts working unchanged, and a unit or a delay reason withdrawn today must keep rendering on the claim or the EOT that used it. retiredOn == null is the screen's \"Active\".\n\nenum UnitKind {\n  LENGTH\n  AREA\n  VOLUME\n  MASS\n  COUNT\n  TIME\n  LUMP_SUM /// Not a physical dimension. A quantity of one, priced as a whole.\n}\n\nenum DelayDamagesBasis {\n  CONTRACT_RATE /// The daily rate is written into the contract.\n  CALCULATED /// The daily rate is a percentage of the contract sum.\n}\n\n/// A supplier's registration grade with the works registrar, and the largest single\n/// contract it may hold. The ceiling is a threshold, so it is a column: a registrar\n/// revises its schedule by circular, and one customer's registrar is not another's.\nmodel ContractorGrade {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  /// The grade as the registrar publishes it — \"G1\". The designation itself, not an\n  /// internal key: eligibility is written and argued in these terms.\n  code   String\n  nameEn String\n  nameMs String?\n\n  /// The largest single contract the grade may hold. Null means the grade carries no\n  /// ceiling at all — not a ceiling of zero, and never inferred as one.\n  ceiling Decimal? @db.Decimal(18, 2)\n\n  /// Registration categories the grade spans, in the registrar's own codes.\n  categoryCodes String[]\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n\n  /// Withdrawn rather than deleted: a supplier assessed under this grade must keep\n  /// rendering the grade they were assessed under.\n  retiredOn DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// What a supplier is registered to supply, in the procurement registrar's field\n/// codes. Held rather than derived, because the head and the field are the\n/// registrar's own split.\nmodel SupplyFieldCode {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  code   String\n  nameEn String\n  nameMs String?\n\n  /// The heading the field sits under — \"01\". Stored, never sliced off `code`.\n  headCode String\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, headCode])\n}\n\n/// How a requirement is classified when it is raised.\nmodel WorkCategory {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  code   String\n  nameEn String\n  nameMs String?\n\n  /// The registration category a supplier must hold to be invited to this work.\n  /// Null where the work needs no registration at all — the screen shows an em dash,\n  /// which is a recorded \"none required\", not a blank.\n  registrationCategoryCode String?\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// Units used in bills of quantities and on every claim.\nmodel UnitOfMeasure {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  /// The symbol the bill is written in — \"m3\", \"day\". Rendered as itself.\n  code   String\n  nameEn String\n  nameMs String?\n\n  /// What the unit measures. A closed vocabulary because it governs arithmetic —\n  /// quantities in different kinds may never be added — so an enum, not a label.\n  kind UnitKind\n\n  /// How many decimals a quantity in this unit is recorded to. Not money; an Int.\n  decimalPlaces Int @default(2)\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// A currency a foreign amount may be quoted in, and what it converts at.\n///\n/// The rate is a rate, so it is a column and never a literal. `rateAsOf` is recorded\n/// because a conversion made on a stale rate and one made on today's rate are not the\n/// same act, and a screen that cannot say which is which overstates itself.\nmodel Currency {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  code   String\n  nameEn String\n  nameMs String?\n  symbol String @default(\"\")\n\n  /// Units of the base currency one unit of this currency buys. Null where nobody has\n  /// set a rate yet — not a rate of zero, and not convertible until someone does.\n  rateToBase Decimal?  @db.Decimal(18, 6)\n  rateAsOf   DateTime?\n\n  /// The currency every other rate is quoted against. Exactly one per organisation,\n  /// and its own rate is not a rate at all — the screen shows a badge in its place.\n  isBase Boolean @default(false)\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// How the document library is grouped. Thinner than DocumentClass on purpose: this\n/// is the grouping a document type is filed under, and DocumentClass is the type.\nmodel DocumentCategory {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  code   String\n  nameEn String\n  nameMs String?\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// Why a contract ran late, and whether the delay earns time, money, both or neither.\n/// Both consequences are the customer's own reading of its conditions of contract, so\n/// they are columns carrying a provenance, not rules in code.\nmodel DelayReason {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  code   String\n  nameEn String\n  nameMs String?\n\n  /// True where an extension of time may be granted; false where the delay is the\n  /// contractor's own risk. Never defaulted in the form — the choice is the record.\n  grantsExtensionOfTime Boolean\n  /// True where loss and expense may be claimed as well as time.\n  costRecoverable       Boolean\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// Why the scope of a contract changed, and which way the value usually moves.\nmodel VariationReason {\n  id             String       @id @default(cuid())\n  organisationId String\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  code   String\n  nameEn String\n  nameMs String?\n\n  /// The expected direction, not a rule. A variation raised under a reason that\n  /// usually adds value may still reduce it, and the portal must not assume.\n  usuallyAddsValue Boolean\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n  sortOrder       Int        @default(0)\n  retiredOn       DateTime?\n\n  @@unique([organisationId, code])\n  @@index([organisationId, sortOrder])\n}\n\n/// What a new contract starts from, before its own terms are entered.\n///\n/// One row per organisation. Deliberately NOT effective-dated, unlike the authority\n/// matrix: these are values a contract COPIES at the moment it is drawn, so revising\n/// them must never reach back and alter a contract already signed. The contract keeps\n/// its own numbers; this row only says what the next one begins with.\n///\n/// Every field is nullable and NOTHING carries a @default. A retention rate of 10 %\n/// is one customer's policy, and shipping it as a schema default is exactly how a\n/// wrong threshold reaches production. Null means nobody has set it, which is not\n/// zero, and the screen must say so rather than showing a plausible number.\nmodel ContractDefaults {\n  id             String       @id @default(cuid())\n  organisationId String       @unique\n  organisation   Organisation @relation(fields: [organisationId], references: [id], onDelete: Cascade)\n\n  /// Withheld from each interim certificate.\n  retentionPct       Decimal? @db.Decimal(9, 4)\n  /// Retention stops accruing once it reaches this share of the contract sum.\n  retentionCapPct    Decimal? @db.Decimal(9, 4)\n  /// Share of the value of unfixed materials on site that may be certified.\n  materialsOnSitePct Decimal? @db.Decimal(9, 4)\n\n  /// Where the daily rate for late completion comes from.\n  delayDamagesBasis    DelayDamagesBasis?\n  /// Applied to the contract sum where the calculated basis is used. Six decimals\n  /// because the figure is a fraction of a percent per day.\n  delayDamagesDailyPct Decimal?           @db.Decimal(9, 6)\n  /// Maximum damages as a share of the contract sum.\n  delayDamagesCapPct   Decimal?           @db.Decimal(9, 4)\n\n  /// Default length of the defects liability period, from practical completion.\n  defectsLiabilityMonths  Int?\n  /// Days a contractor has to close a recorded defect.\n  defectRectificationDays Int?\n\n  governingSource String     @default(\"\")\n  provenance      Provenance @default(ASSUMED)\n  notes           String     @default(\"\")\n}\n\nON Organisation — nine back-relations, without which Prisma will not compile:\n  contractorGrades   ContractorGrade[]\n  supplyFieldCodes   SupplyFieldCode[]\n  workCategories     WorkCategory[]\n  unitsOfMeasure     UnitOfMeasure[]\n  currencies         Currency[]\n  documentCategories DocumentCategory[]\n  delayReasons       DelayReason[]\n  variationReasons   VariationReason[]\n  contractDefaults   ContractDefaults?\n\nCONSTRAINTS THE SCHEMA CANNOT STATE\n- Exactly one Currency per organisation may have isBase = true, and the base row's rateToBase is meaningless (the screen shows a badge instead of a number). Prisma cannot express a partial unique index, so enforce it in the save action and, if the team wants it in the database too, add a raw partial index in the migration: CREATE UNIQUE INDEX ... ON \"Currency\" (\"organisationId\") WHERE \"isBase\".\n- decimalPlaces is bounded 0..6 and the contract-default percentages 0..20 / 0..100 / 1..60 / 1..180 in the prototype. Treat those as sanity guards in src/lib validation, not as policy — and note that a 20 % retention ceiling is arguably itself policy, so keep the guard generous rather than tight.\n- Naming: ContractorGrade / SupplyFieldCode are registrar-neutral. CidbGrade / MofFieldCode would read more plainly to the team. Either is fine — but whichever is chosen becomes the AuditEntry.entity string and must not drift afterwards.",
  "discards": "Remove from src/app/configuration/reference-data/page.tsx:\n\n1. All three existing tables and their Sections — Funding routes, Sourcing methods, Contract types. None of them appears on the prototype's Reference data screen, and none of the prototype's other nine Configuration sections (organisation, committees, users, budget, approval matrix, numbering, documents, templates, notifications) holds them either. With them go loadReferenceData/activeOn/fundingPosture/isUnbanded on this page, the POSTURE_LABEL and POSTURE_CHIP maps, the Bands component and approachOf.\n2. The three ReadinessStat tiles and the div.grid.g3 wrapping them, plus the ReadinessStat component and the assessReferenceData call that feeds it. The prototype's pagehead__meta carries \"8 lists · 81 entries\" and nothing else.\n3. The unbanded-sourcing-methods callout callout--warn block. The prototype has no callout on this screen.\n4. The \"Incomplete\" badge--warn in the pagehead title. The prototype's pagehead__top holds pagehead__titles only — h1, pagehead__sub, pagehead__meta — and no buttons.\n5. ProvenanceChip and both PROVENANCE_LABEL / PROVENANCE_CHIP maps, and the Source column on all three tables. Provenance stays in the schema and in the edit dialog; it stops being a column.\n6. The local Section component: per-section h2, the badge--outline count and the blurb paragraph. The prototype's structure is one card holding the tabbar, then one card per tab whose card__head carries the heading, the card__sub and the single action button, with the table in card__body--flush.\n7. Two-line cellstack name cells (nameEn over nameMs). The prototype renders one language at a time from the active dictionary; nameMs is data, not a subtitle.\n8. The per-row Retire button next to Edit. The prototype's rowactions holds exactly one iconbtn--sm labelled Edit; active/inactive is set inside the edit dialog.\n\nTitle and sub become verbatim: h1 \"Configuration · Reference data\", pagehead__sub \"The lists every other screen picks from.\"\n\nDo NOT reproduce the prototype's \"4.8,100\" / \"0.0,290\" rate formatting — that is a thousands-separator regex applied to an already-decimalised string, a defect in the prototype. Format rates to their own precision.\n\nOne caveat, and then it is the team's call: FundingRoute, SourcingMethod and ContractType remain load-bearing — src/lib/reference/*, the 44 tests, src/app/configuration/approval-matrix/page.tsx (which resolves a rule's method name through SourcingMethod.authorityMethodKey and offers funding routes to the simulator) and src/app/api/authority/resolve/route.ts all depend on them. Removing these three sections leaves that vocabulary with no editor anywhere in the portal. Keep the models, keep src/lib/reference/*, and keep actions.ts and editors.tsx intact; where their UI goes instead is a product decision this analysis does not make.\n\nOne prototype detail that contradicts the brief's \"PAGE HEAD: NO buttons at all\", flagged rather than built: that was verified in the default CIDB-grades state and is correct there, but the prototype source reads dirty: tab === \"contract\" && settings.dirty, so on the Contract defaults tab the pagehead grows an unsaved-changes bar with a count, Save and Discard. It is a dirty-state affordance on one tab, not a standing button.",
  "crudImpact": "\"The CRUD must be preserved\" applies to the mechanism as much as to the three functions. Both survive.\n\nWHAT STAYS UNCHANGED\nsaveFundingRoute, saveSourcingMethod, saveContractType and their readers in actions.ts, and every editor in editors.tsx, stay byte-for-byte. They simply stop being referenced from this page (see discards). Their FormReader validations — the \"choose at least one value band\" rejection, the procures/route-set-externally contradiction — are business rules and must not be deleted with the markup.\n\nWHAT IS ADDED, ON THE SAME SPINE\nEight new save paths, each built exactly as the existing three are: RecordEditor + FormReader + auditedCreate / auditedUpdate + revalidatePath(PATH). Do not invent a second write idiom.\n\n- One registry, in src/lib/reference/lists.ts (pure, testable), maps tab id → { prisma model delegate name, AuditEntry.entity string, list label, column spec, Field[] }. actions.ts gets one saveReferenceEntry(prev, data) that reads a hidden \"kind\" field, looks the list up in the registry and dispatches. editors.tsx gets AddReferenceEntry({kind}) and EditReferenceEntry({kind, row}) built from the registry's Field[], so add and edit cannot drift — the same reason the existing file gives.\n- Audit: entity is the model name, entityLabel is nameEn. Never the code — AuditEntry.entityLabel is rendered.\n- Code uniqueness: reuse takenCodes(rows, except) unchanged; it already keys off retiredOn == null, which is exactly the semantics the new lists use, so a withdrawn unit's symbol frees up for reuse.\n\nGAPS YOU WILL HIT IN THE SHARED HELPERS — all small, all required\n- FormReader has no decimal reader. money() returns a string and is right for ContractorGrade.ceiling, but Currency.rateToBase is 6 dp and the contract-default percentages are 4–6 dp. Add r.decimal(name, label, { dp, min, max, required }) returning a string for Prisma to widen to Decimal. Never parseFloat.\n- FormReader.int() takes min but no max. Contract defaults needs 0–20, 0–100, 1–60, 1–180, and UnitOfMeasure.decimalPlaces needs 0–6. Add max to int().\n- Field kind \"number\" has min but no max and no step. Add both; the daily-rate control is step 0.001.\n- Field has no suffix affordance. The contract-defaults controls render input.input--num.input--sm inside span.inputwrap.inputwrap--post with an inputwrap__post suffix (\"%\", \"% a day\", \"months\", \"days\"). Either add an optional suffix to the number Field, or — better — build Contract defaults as its own client component, because it is not a RecordEditor screen at all: it is eight .cfg-set rows (cfg-set__l with cfg-set__t label and cfg-set__h hint, beside cfg-set__c) with a dirty/save/discard bar, saving one ContractDefaults row through its own action. It needs no modal, no code field and no uniqueness check.\n- restoreEntry does not exist. actions.ts has the \"retire and restore\" section comment with only retireEntry under it. Reusing retiredOn for the Status column is the right call — it keeps activeOn() and the audit ethos — but without an un-retire path the inactive row the \"All records\" view exposes is one-way, and the prototype's edit dialog plainly flips a record back to active. Add restoreEntry (clears retiredOn, reason required, audited identically) and route the Status control inside the edit dialog to retire/restore rather than writing a boolean. Extend the entity lookup in retireEntry to the eight new models while you are there; the nested ternary is already at its limit, so replace it with the registry lookup.\n- Base currency: the save action enforces \"exactly one base per organisation\" — setting isBase on a row clears it on the others in the same transaction as the write, and a base row's rateToBase is ignored rather than stored as 1. Prisma cannot express this; the action must.\n- Do not seed. saveContractDefaults writes only the fields the officer filled in; an untouched field stays null and the screen shows it as unset. The prototype's \"Restore defaults\" button restores ITS OWN baked-in numbers (10 / 5 / 75 / contract / 0.025 / 10 / 12 / 30), which are one customer's policy. Ours must either revert to the last saved row — i.e. discard unsaved edits — or the button goes. It must never write a shipped constant."
}
```
