import type {
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
} from "./api-server-definition";
import type { ApiServerId } from "./api-server-id";
import type { SchemaVaultsAppEnvironment } from "./app-environments";
import { HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS } from "./hardcoded-core-schemavaults-api-server-domains";
import { getHardcodedApiServer } from "./hardcoded-core-schemavaults-api-servers";

export function getHardcodedApiServerDomain(
  api_server_id: ApiServerId,
  environment: SchemaVaultsAppEnvironment,
): SchemaVaultsApiServerDomainRef {
  const hardcodedApi: SchemaVaultsApiServerDefinition =
    getHardcodedApiServer(api_server_id);
  if (!hardcodedApi) {
    throw new Error(
      `Failed to load hardcoded API server with ID '${api_server_id}'`,
    );
  }
  const hardcodedDomain = HARDCODED_CORE_SCHEMAVAULTS_API_SERVER_DOMAINS.find(
    (domain) =>
      domain.api_server_id === api_server_id &&
      domain.environment === environment &&
      domain.hardcoded,
  );
  if (!hardcodedDomain) {
    throw new Error(
      `Failed to find domain for hardcoded API server with ID '${api_server_id}' in environment '${environment}'`,
    );
  }
  return hardcodedDomain;
}

export default getHardcodedApiServerDomain;
