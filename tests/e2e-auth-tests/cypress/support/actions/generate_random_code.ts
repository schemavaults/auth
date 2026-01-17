function generate_random_alphanumeric_code_of_given_length(
  length: number,
): string {
  if (typeof length !== "number" || isNaN(length) || length <= 0) {
    throw new Error("Length must be a positive number");
  }

  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export default function generateRandomCode(
  length: number,
): Cypress.Chainable<string> {
  return cy
    .wrap(generate_random_alphanumeric_code_of_given_length(length), {
      log: false,
    })
    .then((code: JQuery<string>): string => {
      if (typeof code === "string") return code;
      else if (Array.isArray(code) && typeof code[0] === "string")
        return code[0];
      else
        throw new Error(
          "Expected 'code' to be a string or an array of strings!",
        );
    });
}
