import type { ReactElement } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsAuth, ApiDocsSecurityScheme } from "@/model/types";
import { describeSecuritySchemeTransport, securitySchemeAnchorId } from "./ApiSecuritySchemesCard";
import { OperationAuthBadges } from "./OperationAuthBadges";

export interface OperationAuthCardProps {
  auth: ApiDocsAuth;
  /** All schemes of the document, to show titles/transport for the accepted ones. */
  schemes: readonly ApiDocsSecurityScheme[];
  /** Link target of the page that lists every scheme (index page), for the anchors. */
  schemesHref?: string;
  className?: string;
}

export function routeGuardLabel(auth: ApiDocsAuth): string {
  if (auth.public) return "Anyone — no credentials required";
  if (auth.routeGuard === "admin") return "Platform administrators only";
  return "Any authenticated user";
}

/** Full "Authentication & permissions" panel for one operation. */
export function OperationAuthCard({ auth, schemes, schemesHref, className }: OperationAuthCardProps): ReactElement {
  const accepted = auth.schemeNames
    .map((name) => schemes.find((scheme) => scheme.name === name) ?? null)
    .filter((scheme): scheme is ApiDocsSecurityScheme => scheme !== null);
  const unknownSchemes = auth.schemeNames.filter((name) => !schemes.some((scheme) => scheme.name === name));

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Authentication &amp; permissions
          <OperationAuthBadges auth={auth} detailed={false} />
        </CardTitle>
        <CardDescription>{routeGuardLabel(auth)}</CardDescription>
      </CardHeader>
      <CardContent>
        <DescriptionList layout="responsive" size="sm" divided>
          <DescriptionItem>
            <DescriptionTerm>Accepted credentials</DescriptionTerm>
            <DescriptionDetails>
              {auth.public ? (
                <span className="text-muted-foreground">None required</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {accepted.map((scheme) => (
                    <li key={scheme.name} className="flex flex-wrap items-center gap-2">
                      {schemesHref ? (
                        <a href={`${schemesHref}#${securitySchemeAnchorId(scheme.name)}`} className="font-medium underline-offset-4 hover:underline">
                          {scheme.title}
                        </a>
                      ) : (
                        <span className="font-medium">{scheme.title}</span>
                      )}
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {describeSecuritySchemeTransport(scheme)}
                      </code>
                    </li>
                  ))}
                  {unknownSchemes.map((name) => (
                    <li key={name}>
                      <Badge variant="outline" className="font-mono font-normal">{name}</Badge>
                    </li>
                  ))}
                  {auth.alternatives.some((alternative) => alternative.length > 1) ? (
                    <li className="text-xs text-muted-foreground">
                      Some alternatives require several credentials together:{" "}
                      {auth.alternatives
                        .filter((alternative) => alternative.length > 1)
                        .map((alternative) => alternative.map((r) => r.schemeName).join(" + "))
                        .join("; ")}
                    </li>
                  ) : null}
                </ul>
              )}
            </DescriptionDetails>
          </DescriptionItem>
          {!auth.public ? (
            <DescriptionItem>
              <DescriptionTerm>Who may call</DescriptionTerm>
              <DescriptionDetails>{routeGuardLabel(auth)}</DescriptionDetails>
            </DescriptionItem>
          ) : null}
          {auth.requiredScopes.length > 0 ? (
            <DescriptionItem>
              <DescriptionTerm>Required scopes</DescriptionTerm>
              <DescriptionDetails>
                <span className="flex flex-wrap gap-1">
                  {auth.requiredScopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="font-mono font-normal">{scope}</Badge>
                  ))}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  The token&apos;s <code className="font-mono">scope</code> claim must include every scope listed; administrators get no bypass.
                </p>
              </DescriptionDetails>
            </DescriptionItem>
          ) : null}
          {auth.organization ? (
            <DescriptionItem>
              <DescriptionTerm>Organization membership</DescriptionTerm>
              <DescriptionDetails>
                Caller must be{" "}
                {auth.organization.roles.length > 0 ? (
                  <>
                    one of{" "}
                    {auth.organization.roles.map((role) => (
                      <Badge key={role} variant="outline" className="mr-1 font-mono font-normal">{role}</Badge>
                    ))}
                  </>
                ) : (
                  "a member"
                )}{" "}
                of the organization identified by the{" "}
                <code className="font-mono">{auth.organization.parameter}</code> parameter.
                {auth.organization.adminBypass ? " Platform administrators bypass this check." : " No administrator bypass."}
              </DescriptionDetails>
            </DescriptionItem>
          ) : null}
          {auth.notes ? (
            <DescriptionItem>
              <DescriptionTerm>Notes</DescriptionTerm>
              <DescriptionDetails>{auth.notes}</DescriptionDetails>
            </DescriptionItem>
          ) : null}
        </DescriptionList>
      </CardContent>
    </Card>
  );
}

export default OperationAuthCard;
