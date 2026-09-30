import type { FormEvent } from "react";

/**
 * The data of a submitted form, for an `onSubmit` handler.
 *
 * Forms submit through `onSubmit` rather than `action={fn}`: React resets a form
 * driven by an action once it settles — whether or not the save succeeded — so a
 * refused save clears everything the officer typed and leaves the error beside an
 * empty field. The button that submitted is included, as a native submission would.
 */
export function formDataOf(e: FormEvent<HTMLFormElement>): FormData {
  e.preventDefault();
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
  return new FormData(e.currentTarget, submitter);
}
