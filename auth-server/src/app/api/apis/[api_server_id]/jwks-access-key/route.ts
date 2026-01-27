import "server-only";

import GET from './GET_jwks_access_key_metadata';
import POST from './POST_generate_jwks_access_key';
import PUT from "./PUT_regenerate_jwks_access_key";

export { GET, POST, PUT };

export const dynamic = "force-dynamic";
