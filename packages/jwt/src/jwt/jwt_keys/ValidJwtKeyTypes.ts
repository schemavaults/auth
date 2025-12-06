// ValidJwtKeyTypes.ts

export const validJwtKeyTypesList = ['encryption', 'decryption', 'signing', 'verification'] as const satisfies readonly string[];

export type JwtKeyType = typeof validJwtKeyTypesList[number];

export const validJwtKeyTypesSet: Set<JwtKeyType> = new Set(validJwtKeyTypesList);

export function isValidJwtKeyType(value: string): value is JwtKeyType {
  return (validJwtKeyTypesSet satisfies Set<string> as Set<string>).has(value);
}
