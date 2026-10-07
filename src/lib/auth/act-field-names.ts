/**
 * The names an act's own form fields post under (ADR 0034 D12, Phase 2b). They are prefixed by the act's person field, so that a form that records two acts
 * (an opening started by the signed-in officer, with a late estimate overridden for the holder of its office from paper) keeps each act's password, paper
 * reference and reasons apart: `personId:paperReference` is the paper of the act whose person is `personId`.
 */
export interface ActFieldNames {
  onBehalf: string;
  paperReference: string;
  reason: string;
  password: string;
  backdate: string;
  backdateReason: string;
  backdateAuthorisedBy: string;
}

export const actFieldNames = (personField: string): ActFieldNames => ({
  onBehalf: `${personField}:onBehalf`,
  paperReference: `${personField}:paperReference`,
  reason: `${personField}:reason`,
  password: `${personField}:password`,
  backdate: `${personField}:backdate`,
  backdateReason: `${personField}:backdateReason`,
  backdateAuthorisedBy: `${personField}:backdateAuthorisedBy`,
});

/// Every name an act's fields post under, for the form that places them (a refusal on one is shown beside it).
export const actFieldNameList = (personField: string): string[] => Object.values(actFieldNames(personField));

/// Kept for the readers that name them once: the fields of an act whose person field is `personId`.
export const ACT_FIELDS = actFieldNames("personId");
