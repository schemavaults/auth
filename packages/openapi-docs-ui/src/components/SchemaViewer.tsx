import type { ReactElement, ReactNode } from "react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@schemavaults/ui";
import type { ApiDocsJsonSchema, ApiDocsModel } from "@/model/types";
import {
  isNullableSchema,
  resolveSchema,
  schemaProperties,
  schemaRefName,
  schemaTypeLabel,
} from "@/model/schema-utils";

export interface SchemaViewerProps {
  schema: ApiDocsJsonSchema | null | undefined;
  /** `components.schemas` used to resolve `$ref`s. */
  schemas: ApiDocsModel["schemas"];
  /** Nesting levels to expand inline (default 3). */
  maxDepth?: number;
  className?: string;
}

function constraints(schema: ApiDocsJsonSchema): string[] {
  const out: string[] = [];
  const keys = [
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "pattern",
    "multipleOf",
  ] as const;
  for (const key of keys) {
    const value = schema[key];
    if (value !== undefined) out.push(`${key}: ${String(value)}`);
  }
  if (schema.default !== undefined) out.push(`default: ${JSON.stringify(schema.default)}`);
  return out;
}

function SchemaRows({
  schema,
  schemas,
  depth,
  maxDepth,
  visited,
}: {
  schema: ApiDocsJsonSchema | null;
  schemas: ApiDocsModel["schemas"];
  depth: number;
  maxDepth: number;
  visited: ReadonlySet<string>;
}): ReactElement | null {
  const properties = schemaProperties(schema, schemas);
  if (properties.length === 0) return null;
  return (
    <>
      {properties.map((property) => {
        const resolved = resolveSchema(property.schema, schemas);
        const refName = schemaRefName(property.schema);
        const itemsRef =
          resolved && typeof resolved.items === "object" && resolved.items !== null
            ? schemaRefName(resolved.items as ApiDocsJsonSchema)
            : null;
        const cycle =
          (refName !== null && visited.has(refName)) || (itemsRef !== null && visited.has(itemsRef));
        const nextVisited = new Set(visited);
        if (refName) nextVisited.add(refName);
        if (itemsRef) nextVisited.add(itemsRef);
        const childSchema: ApiDocsJsonSchema | null =
          resolved && (resolved.type === "array" || resolved.items)
            ? ((resolved.items as ApiDocsJsonSchema | undefined) ?? null)
            : (property.schema ?? null);
        const hasChildren =
          !cycle && depth < maxDepth && schemaProperties(childSchema, schemas).length > 0;
        const description =
          resolved && typeof resolved.description === "string" ? resolved.description : null;
        const extra = resolved ? constraints(resolved) : [];
        return (
          <FragmentRow key={property.name}>
            <TableRow>
              <TableCell className="align-top font-mono text-xs" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
                {property.name}
                {property.required ? <span className="ml-1 text-destructive" title="required">*</span> : null}
              </TableCell>
              <TableCell className="align-top font-mono text-xs text-muted-foreground">
                {schemaTypeLabel(property.schema, schemas)}
                {isNullableSchema(resolved) ? " | null" : ""}
              </TableCell>
              <TableCell className="align-top text-xs">
                {description ? <p>{description}</p> : null}
                {extra.length > 0 ? (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {extra.map((item) => (
                      <Badge key={item} variant="outline" className="font-mono font-normal">
                        {item}
                      </Badge>
                    ))}
                  </p>
                ) : null}
                {cycle ? <p className="italic text-muted-foreground">recursive reference</p> : null}
              </TableCell>
            </TableRow>
            {hasChildren ? (
              <SchemaRows
                schema={childSchema}
                schemas={schemas}
                depth={depth + 1}
                maxDepth={maxDepth}
                visited={nextVisited}
              />
            ) : null}
          </FragmentRow>
        );
      })}
    </>
  );
}

function FragmentRow({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>;
}

/**
 * Renders a JSON schema as a nested property table (name / type /
 * description). Non-object schemas render as a single type line.
 */
export function SchemaViewer({ schema, schemas, maxDepth = 3, className }: SchemaViewerProps): ReactElement {
  const resolved = resolveSchema(schema, schemas);
  const properties = schemaProperties(resolved, schemas);
  const label = schemaTypeLabel(schema, schemas);
  const refName = schemaRefName(schema);
  const description =
    resolved && typeof resolved.description === "string" ? resolved.description : null;

  if (properties.length === 0) {
    return (
      <div className={cn("text-sm", className)}>
        <span className="font-mono text-xs">{label}</span>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-md border", className)}>
      {refName || description ? (
        <div className="border-b bg-muted/40 px-3 py-2 text-xs">
          {refName ? <span className="font-mono font-medium">{refName}</span> : null}
          {description ? <span className="ml-2 text-muted-foreground">{description}</span> : null}
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%]">Property</TableHead>
            <TableHead className="w-[25%]">Type</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SchemaRows
            schema={resolved}
            schemas={schemas}
            depth={0}
            maxDepth={maxDepth}
            visited={new Set(refName ? [refName] : [])}
          />
        </TableBody>
      </Table>
    </div>
  );
}

export default SchemaViewer;
