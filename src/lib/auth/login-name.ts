/// Letters, digits and . _ - @ only, so that a sign-in name is one word that can be read out and typed. The staff store's and the supplier store's alike.
export const LOGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._@-]{2,63}$/;
