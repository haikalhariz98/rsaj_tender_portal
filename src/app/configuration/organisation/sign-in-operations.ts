import { defineOperations } from "../_editors/define";

export const organisationSignInOperations = defineOperations("organisation-sign-in", "Sign-in page", {
  uploadSignInImage: { label: "Replace the sign-in image", load: () => import("./sign-in-core").then((m) => m.uploadSignInImage) },
  removeSignInImage: { label: "Remove the sign-in image", load: () => import("./sign-in-core").then((m) => m.removeSignInImage) },
  uploadDarkLogo: { label: "Replace the logo for the dark side of the sign-in page", load: () => import("./sign-in-core").then((m) => m.uploadDarkLogo) },
  removeDarkLogo: { label: "Remove the logo for the dark side of the sign-in page", load: () => import("./sign-in-core").then((m) => m.removeDarkLogo) },
  saveSignInPage: { label: "Save the sign-in page's words and links", load: () => import("./sign-in-core").then((m) => m.saveSignInPage) },
  savePortalPage: { label: "Save the supplier portal's words and address", load: () => import("./sign-in-core").then((m) => m.savePortalPage) },
});
