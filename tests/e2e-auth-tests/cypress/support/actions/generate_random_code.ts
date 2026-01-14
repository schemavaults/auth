
export default function generate_random_code(length: number): string {
  if (typeof length !== "number" || isNaN(length) || length <= 0) {
    throw new Error("Length must be a positive number");
  }

  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(
      Math.floor(Math.random() * charactersLength),
    );
  }
  return result;
}