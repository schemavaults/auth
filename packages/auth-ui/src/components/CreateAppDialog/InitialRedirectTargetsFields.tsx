"use client";

import type { ReactElement } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "@schemavaults/ui";
import {
  MAX_INITIAL_APP_CALLBACK_URLS,
  MAX_INITIAL_APP_DOMAINS,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironments,
  isValidSchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { Plus, ShieldAlert } from "lucide-react";
import { UrlListInput } from "./UrlListInput";
import {
  hasInitialCallbackUrl,
  suggestedDomainsForCallbackUrls,
  type InitialRedirectTargetsErrors,
  type InitialRedirectTargetsValue,
} from "./initial-redirect-targets";

export interface InitialRedirectTargetsFieldsProps {
  value: InitialRedirectTargetsValue;
  onChange: (next: InitialRedirectTargetsValue) => void;
  errors?: InitialRedirectTargetsErrors;
  disabled?: boolean;
}

/**
 * The create app form's optional "Domains and callback URLs" section:
 * the domains and exact callback URLs to register with the new app, in
 * one environment. `POST /api/apps` writes them in the same transaction
 * as the app. While no callback URL is entered, a warning explains why
 * going without one is dangerous.
 */
export function InitialRedirectTargetsFields({
  value,
  onChange,
  errors,
  disabled = false,
}: InitialRedirectTargetsFieldsProps): ReactElement {
  const suggestions: string[] = suggestedDomainsForCallbackUrls(value);
  const nonBlankDomains: string[] = value.domains.filter(
    (d) => d.trim().length > 0,
  );

  function addDomain(origin: string): void {
    onChange({ ...value, domains: [...nonBlankDomains, origin] });
  }

  return (
    <fieldset
      id="create-app-redirect-targets"
      className="flex flex-col gap-4 rounded-md border p-4"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-medium">
        Domains and callback URLs (optional)
      </legend>
      <p className="text-sm text-muted-foreground">
        Where this app runs and the exact URLs it receives sign-in results
        on. You can add more, or other environments, on the app&apos;s page
        later.
      </p>

      <div className="flex flex-col gap-2">
        <Label>Environment</Label>
        <RadioGroup
          value={value.environment}
          onValueChange={(next: string): void => {
            if (isValidSchemaVaultsAppEnvironment(next)) {
              onChange({ ...value, environment: next });
            }
          }}
          disabled={disabled}
          className="flex flex-row flex-wrap gap-4"
        >
          {schemaVaultsAppEnvironments.map(
            (env: SchemaVaultsAppEnvironment): ReactElement => {
              const radio_id = `create-app-redirect-environment-${env}`;
              return (
                <div key={env} className="flex items-center space-x-2">
                  <RadioGroupItem value={env} id={radio_id} />
                  <Label htmlFor={radio_id}>{env}</Label>
                </div>
              );
            },
          )}
        </RadioGroup>
      </div>

      <UrlListInput
        id="create-app-domain"
        label="Domains"
        description="Origins the app is served from (scheme, host and port, no path), allowed for CORS. Native apps may leave this empty."
        placeholder="https://app.example.com"
        values={value.domains}
        errors={errors?.domains}
        onChange={(domains) => onChange({ ...value, domains })}
        addLabel="Add domain"
        max={MAX_INITIAL_APP_DOMAINS}
        disabled={disabled}
      />

      <UrlListInput
        id="create-app-callback-url"
        label="Callback URLs"
        description="The exact URLs (including the path) the auth server may redirect back to with an authorization code. Fragments are not allowed; an http://127.0.0.1 URL matches on any port."
        placeholder="https://app.example.com/auth/callback"
        values={value.callback_urls}
        errors={errors?.callback_urls}
        onChange={(callback_urls) => onChange({ ...value, callback_urls })}
        addLabel="Add callback URL"
        max={MAX_INITIAL_APP_CALLBACK_URLS}
        disabled={disabled}
      />

      {suggestions.length > 0 &&
      nonBlankDomains.length < MAX_INITIAL_APP_DOMAINS ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Also allow the callback URL&apos;s origin:</span>
          {suggestions.map((origin) => (
            <Button
              key={origin}
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => addDomain(origin)}
            >
              <Plus className="h-4 w-4 mr-1" />
              {origin}
            </Button>
          ))}
        </div>
      ) : null}

      {!hasInitialCallbackUrl(value) ? (
        <Alert variant="warning" id="create-app-missing-callback-url-warning">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Not having a callback URL is dangerous</AlertTitle>
          <AlertDescription>
            Without one, this app cannot sign anyone in as a public client
            (no client secret). Once it has a client secret, any path on its
            domains is accepted as a redirect, so a page there that leaks its
            URL (an open redirect, user content, a third-party script reading
            the Referer header) could hand authorization codes to an
            attacker. Register the exact callback URL unless you will add it
            before the app goes live.
          </AlertDescription>
        </Alert>
      ) : null}
    </fieldset>
  );
}

export default InitialRedirectTargetsFields;
