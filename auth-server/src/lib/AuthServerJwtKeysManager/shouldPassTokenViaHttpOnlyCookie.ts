import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type ApiServerId,
  type AppId,
} from "@schemavaults/app-definitions";

export interface IShouldPassTokenViaHttpOnlyCookieOpts {
  client_app_id: AppId;
  audience_id: ApiServerId;
}

const AUTH_APP_ID: AppId = SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id;

export default function shouldPassTokenViaHttpOnlyCookie({
  client_app_id,
  audience_id,
}: IShouldPassTokenViaHttpOnlyCookieOpts): boolean {
  if (client_app_id === AUTH_APP_ID && audience_id === AUTH_APP_ID) {
    return true;
  }

  return false;
}
