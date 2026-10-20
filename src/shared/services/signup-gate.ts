/** While the questionnaire is open, nothing from it is written to the server or to disk. */
let drafting = false;

export function setSignupDrafting(value: boolean) {
  drafting = value;
}

export function signupDrafting() {
  return drafting;
}
