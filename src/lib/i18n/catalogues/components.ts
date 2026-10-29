/**
 * The words the shared components write themselves (NFR-LNG-001, ADR 0040): the list's tools and paging, the tab strip, the drawer's
 * header, the editor's buttons, the history drawer, the selects and file pickers. Words a screen hands in are the screen's own. The Malay is
 * drafted in the N1 slice and not yet reviewed by the customer. Sentences with values use {name} placeholders (`sayWith`).
 */

import { w, type Words } from "@/lib/contract/labels";


export const COMPONENT_WORDS = {
  // Drawers and the editor
  close: w("Close"),
  skipToContent: w("Skip to content"),
  cancel: w("Cancel"),
  save: w("Save"),
  saving: w("Saving…"),
  changeIt: w("Change it"),
  notSet: w("Not set"),
  nothingTyped: w("Nothing typed"),
  // DataList
  searchPlaceholder: w("Search…"),
  searchThisList: w("Search this list"),
  nothingHere: w("Nothing here"),
  nothingMatches: w("Nothing matches"),
  showAllRecords: w("Show all records"),
  view: w("View"),
  allRecords: w("All records"),
  anyOf: w("Any {label}"),
  downloadCsv: w("Download CSV"),
  downloadCsvLeavesOut: w("Download CSV, SULIT left out"),
  downloadCsvTitleLeavesOut: w("Download CSV (SULIT left out)"),
  nSelected: w("{count} selected"),
  clear: w("Clear"),
  selectRow: w("Select {name}"),
  selectAllRows: w("Select all rows"),
  actions: w("Actions"),
  showing: w("Showing {from}-{to} of {total}"),
  rows: w("Rows"),
  rowsPerPage: w("Rows per page"),
  pagination: w("Pagination"),
  previousPage: w("Previous page"),
  nextPage: w("Next page"),
  // Tabs
  sections: w("Sections"),
  theTabs: w("the tabs"),
  sectionsOf: w("{label} sections"),
  scrollBack: w("Scroll {label} back"),
  scrollForward: w("Scroll {label} forward"),
  loading: w("Loading…"),
  // History drawer
  history: w("History"),
  historyOf: w("History of {label}"),
  noChangeRecorded: w("No changes recorded"),
  empty: w("empty"),
  nothingRecorded: w("Nothing recorded"),
  created: w("Created"),
  changed: w("Changed"),
  removed: w("Removed"),
  notAttributed: w("Not attributed — before sign-in"),
  unknown: w("Unknown"),
  // Selects and pickers
  selectEllipsis: w("Select…"),
  noMatches: w("No matches"),
  oneOption: w("1 option"),
  nOptions: w("{count} options"),
  selectAnOption: w("Select an option"),
  select: w("Select"),
  search: w("Search"),
  nothingToChoose: w("Nothing to choose yet"),
  noMatchesFor: w("No matches for “{query}”"),
  searching: w("Searching"),
  listNotLoaded: w("The list could not be loaded"),
  chooseFile: w("Choose file"),
  noFileChosen: w("No file chosen"),
  uploadProgress: w("Upload progress"),
  uploaded: w("Uploaded."),
  showFullDescription: w("More information"),
  moreActions: w("More actions"),
  // Inline acts (the select cell, the board, the composer)
  didNotSave: w("That did not save. Try again."),
  whoCanChange: w("Who can change {label}"),
  moveTo: w("Move to"),
  seeAll: w("See all"),
  olderInList: w("Older: in the list"),
  whyNotMoved: w("Why this cannot move"),
  // The step bar (Stepper): a step's state, said after its name for a screen reader
  stepDone: w("done"),
  stepCurrent: w("waiting now"),
  stepWaiting: w("not reached yet"),
  stepRejected: w("rejected"),
  stepParked: w("parked"),
  // The SULIT marks (SulitLock, SulitTag, SulitWithheld and a SULIT column's header). SULIT itself is the classification mark and stays.
  sulitWithheld: w("Hidden"),
  // A list column in which every row is withheld from the reader collapses into this one note (FR-EVL-014, presentation only).
  valuesHidden: w("Values hidden: SULIT"),
  valuesHiddenWhy: w("Why the values are hidden"),
  sulitValue: w("SULIT. Shown only to the people entitled to it, and every reading is logged."),
  sulitColumn: w(
    "SULIT. Shown to the people entitled to it and withheld from everyone else, and every reading is logged. Not exported.",
  ),
  // Where a configured fact came from (ProvenanceBadge)
  provStated: w("Stated"),
  provObserved: w("Observed"),
  provAssumed: w("Assumed"),
  provNotSet: w("Not set"),
  provStatedHint: w("Written in a governing document"),
  provObservedHint: w("Seen in practice, not written down"),
  provAssumedHint: w("A working default, awaiting sign-off"),
  provNotSetHint: w("Nobody has said where this came from"),
} as const satisfies Record<string, Words>;

