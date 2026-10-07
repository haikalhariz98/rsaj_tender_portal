/**
 * The words the shared attribution component (`src/components/act-attribution-fields.tsx`) shows beside who is acting (ADR 0034 D12, Phase 2b). Held here
 * and not in the component, as every component hint is (decisions log, D6).
 */

export const ACT_TEXT = {
  backdateAuthoriserHint: "Named by you: the officer who authorised dating it earlier.",
  backdateDescription: "A signed act is dated today by the server. Dating it earlier is recorded as an exception.",
  forOtherHint: "They are not the one signed in, so this is recorded from their paper record: it is not signed.",
  namedDefault: "You, unless you are recording it for another officer from their paper record.",
  paperDescription: "Not signed: it reads as recorded by you on their behalf.",
  paperReferenceAuthorisation: "The reference of the paper it came from. A paper approval, signature or authorisation needs one.",
  paperReferenceNamed: "The reference of the paper it came from.",
  paperReferenceSignature: "The reference of the paper it came from. A paper approval or signature needs one.",
  passwordHint: "Asked each time you sign.",
  reasonNeeded: "Needed where there is no paper reference.",
  recordedFromPaper: "Recorded from a paper record: it is not signed.",
  recordedFromPaperNotByThem: "Recorded from a paper record: it is not signed by them.",
  yourOwn: "Your own act, from your sign-in.",
} as const;
