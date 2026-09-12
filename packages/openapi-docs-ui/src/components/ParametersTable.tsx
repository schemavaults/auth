import type { ReactElement } from "react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@schemavaults/ui";
import type { ApiDocsModel, ApiDocsParameter, ApiDocsParameterLocation } from "@/model/types";
import { schemaTypeLabel } from "@/model/schema-utils";

export interface ParametersTableProps {
  parameters: readonly ApiDocsParameter[];
  schemas: ApiDocsModel["schemas"];
  /** Only render parameters of this location. */
  location?: ApiDocsParameterLocation;
}

export const PARAMETER_LOCATION_LABELS: Readonly<Record<ApiDocsParameterLocation, string>> = {
  path: "Path parameters",
  query: "Query parameters",
  header: "Request headers",
  cookie: "Cookies",
};

export function ParametersTable({ parameters, schemas, location }: ParametersTableProps): ReactElement | null {
  const rows = location ? parameters.filter((parameter) => parameter.in === location) : parameters;
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            {location ? null : <TableHead>In</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((parameter) => {
            const enumValues =
              parameter.schema && Array.isArray(parameter.schema.enum)
                ? (parameter.schema.enum as unknown[])
                : null;
            const description =
              parameter.description ??
              (parameter.schema && typeof parameter.schema.description === "string"
                ? parameter.schema.description
                : undefined);
            return (
              <TableRow key={`${parameter.in}-${parameter.name}`}>
                <TableCell className="align-top font-mono text-xs">
                  {parameter.name}
                  {parameter.required ? (
                    <span className="ml-1 text-destructive" title="required">*</span>
                  ) : null}
                  {parameter.deprecated ? (
                    <Badge variant="destructive" className="ml-2">deprecated</Badge>
                  ) : null}
                </TableCell>
                {location ? null : <TableCell className="align-top text-xs">{parameter.in}</TableCell>}
                <TableCell className="align-top font-mono text-xs text-muted-foreground">
                  {schemaTypeLabel(parameter.schema, schemas)}
                </TableCell>
                <TableCell className="align-top text-xs">
                  {description ? <p>{description}</p> : null}
                  {enumValues && !schemaTypeLabel(parameter.schema, schemas).includes("|") ? (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {enumValues.map((value) => (
                        <Badge key={String(value)} variant="outline" className="font-mono font-normal">
                          {String(value)}
                        </Badge>
                      ))}
                    </p>
                  ) : null}
                  {parameter.example !== undefined ? (
                    <p className="mt-1 font-mono text-muted-foreground">
                      e.g. {JSON.stringify(parameter.example)}
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default ParametersTable;
