import { type ApiServerId, HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS } from "@schemavaults/app-definitions";

type HardcodedApiServerId = (typeof HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS)[number]['api_server_id'];

const HARDCODED_API_SERVER_IDS: Set<HardcodedApiServerId> = new Set(HARDCODED_CORE_SCHEMAVAULTS_API_SERVERS.map(s => s.api_server_id))

export default function isHardcodedApiServerId(api_server_id: ApiServerId): boolean {
  return (HARDCODED_API_SERVER_IDS satisfies Set<string> as Set<string>).has(api_server_id);
}
