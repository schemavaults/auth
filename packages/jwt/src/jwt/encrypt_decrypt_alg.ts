export const alg = "RSA-OAEP-256" as const satisfies string;
export default alg;
export { alg as encrypt_decrypt_alg };

export const enc = "A256GCM" as const satisfies string;
